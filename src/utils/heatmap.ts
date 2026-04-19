/**
 * Build a GitHub-style yearly heatmap grid from a plugin's weekly
 * download history.
 *
 * Input shape: `{ "2016-04-25": 81, "2016-05-02": 496, ... }` — arbitrary
 * week-of-year cadence (usually Mondays). Keys that fail to parse as
 * `YYYY-MM-DD` are ignored rather than throwing so pathological data cannot
 * break the build or the UI.
 *
 * Output: a rectangular grid indexed by `[yearIndex][weekIndex]` where each
 * populated cell carries its raw downloads plus a quantile-based `level`
 * (1..4) used to drive the tile colour. Missing weeks are `null`.
 */

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapCell {
  date: string;
  year: number;
  weekIndex: number;
  downloads: number;
  level: HeatmapLevel;
}

export interface HeatmapGrid {
  years: number[];
  weeks: number;
  grid: Array<Array<HeatmapCell | null>>;
  thresholds: [number, number, number, number];
  maxDownloads: number;
  totalDownloads: number;
  populatedWeeks: number;
}

export const HEATMAP_WEEKS = 53;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseWeekKey(key: string): { year: number; weekIndex: number } | null {
  const match = DATE_RE.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  // Use UTC to avoid timezone-induced drift between dev machines.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  const startOfYear = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86_400_000);
  const weekIndex = Math.max(0, Math.min(HEATMAP_WEEKS - 1, Math.floor(dayOfYear / 7)));
  return { year, weekIndex };
}

/**
 * Pick a quantile value from a pre-sorted (asc) non-zero array.
 * Returns the closest-rank value so thresholds are always present in the data.
 */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function levelFor(
  value: number,
  thresholds: [number, number, number, number]
): HeatmapLevel {
  if (value <= 0) return 0;
  if (value <= thresholds[0]) return 1;
  if (value <= thresholds[1]) return 2;
  if (value <= thresholds[2]) return 3;
  return 4;
}

export function buildWeeklyHeatmap(
  history: Record<string, number> | null | undefined
): HeatmapGrid {
  const empty: HeatmapGrid = {
    years: [],
    weeks: HEATMAP_WEEKS,
    grid: [],
    thresholds: [0, 0, 0, 0],
    maxDownloads: 0,
    totalDownloads: 0,
    populatedWeeks: 0,
  };

  if (!history || typeof history !== 'object') return empty;

  // First pass: parse + collect downloads for quantile calc.
  const parsed: Array<{
    date: string;
    year: number;
    weekIndex: number;
    downloads: number;
  }> = [];
  let totalDownloads = 0;
  let maxDownloads = 0;
  const yearsSet = new Set<number>();

  for (const [key, rawValue] of Object.entries(history)) {
    const parsedKey = parseWeekKey(key);
    if (!parsedKey) continue;
    // Only accept finite, non-negative numbers. NaN / strings / negatives
    // represent bad data rather than "a reported 0" so we drop them entirely.
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue < 0) continue;
    const downloads = rawValue;
    parsed.push({ date: key, year: parsedKey.year, weekIndex: parsedKey.weekIndex, downloads });
    totalDownloads += downloads;
    if (downloads > maxDownloads) maxDownloads = downloads;
    yearsSet.add(parsedKey.year);
  }

  if (parsed.length === 0) return empty;

  const years = Array.from(yearsSet).sort((a, b) => a - b);

  // Quantile thresholds from non-zero values. When every week has the same
  // non-zero value the thresholds collapse to that value and everything lands
  // in level 4 — which is the correct visual (all full intensity).
  const nonZero = parsed
    .map((p) => p.downloads)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);

  const thresholds: [number, number, number, number] = nonZero.length === 0
    ? [0, 0, 0, 0]
    : [
        quantile(nonZero, 0.25),
        quantile(nonZero, 0.5),
        quantile(nonZero, 0.75),
        quantile(nonZero, 1),
      ];

  // Allocate grid.
  const grid: Array<Array<HeatmapCell | null>> = years.map(() =>
    new Array<HeatmapCell | null>(HEATMAP_WEEKS).fill(null)
  );
  const yearToIndex = new Map<number, number>();
  years.forEach((y, i) => yearToIndex.set(y, i));

  let populatedWeeks = 0;
  for (const p of parsed) {
    const yIdx = yearToIndex.get(p.year);
    if (yIdx === undefined) continue;
    const existing = grid[yIdx][p.weekIndex];
    // When two source keys fall in the same week bucket (rare but possible on
    // year boundaries), keep the higher value — this matches an intuitive
    // "peak activity" reading and avoids losing spikes.
    const downloads = existing ? Math.max(existing.downloads, p.downloads) : p.downloads;
    const date = existing && existing.downloads > p.downloads ? existing.date : p.date;
    if (!existing) populatedWeeks++;
    grid[yIdx][p.weekIndex] = {
      date,
      year: p.year,
      weekIndex: p.weekIndex,
      downloads,
      level: levelFor(downloads, thresholds),
    };
  }

  return {
    years,
    weeks: HEATMAP_WEEKS,
    grid,
    thresholds,
    maxDownloads,
    totalDownloads,
    populatedWeeks,
  };
}
