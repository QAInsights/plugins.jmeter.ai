import { describe, it, expect } from 'vitest';
import {
  buildWeeklyHeatmap,
  HEATMAP_WEEKS,
  type HeatmapCell,
} from '../../src/utils/heatmap';

describe('buildWeeklyHeatmap', () => {
  it('returns an empty grid when history is missing, null, or not an object', () => {
    const a = buildWeeklyHeatmap(undefined);
    const b = buildWeeklyHeatmap(null);
    // @ts-expect-error intentional bad input
    const c = buildWeeklyHeatmap('not-an-object');
    for (const result of [a, b, c]) {
      expect(result.years).toEqual([]);
      expect(result.grid).toEqual([]);
      expect(result.maxDownloads).toBe(0);
      expect(result.totalDownloads).toBe(0);
      expect(result.populatedWeeks).toBe(0);
    }
  });

  it('returns an empty grid when every key is unparseable', () => {
    const result = buildWeeklyHeatmap({
      'not-a-date': 100,
      '2026/04/01': 5,
      '': 9,
    });
    expect(result.years).toEqual([]);
    expect(result.grid).toEqual([]);
  });

  it('parses valid YYYY-MM-DD keys, sorts years ascending, and allocates a full 53-week row per year', () => {
    const result = buildWeeklyHeatmap({
      '2017-01-02': 10,
      '2016-04-25': 20,
      '2018-06-04': 30,
    });
    expect(result.years).toEqual([2016, 2017, 2018]);
    expect(result.weeks).toBe(HEATMAP_WEEKS);
    expect(result.grid).toHaveLength(3);
    expect(result.grid[0]).toHaveLength(HEATMAP_WEEKS);
  });

  it('places each cell at the expected week index computed from day-of-year', () => {
    // 2016-01-01 → day 0 → week 0, 2016-01-08 → day 7 → week 1.
    const result = buildWeeklyHeatmap({
      '2016-01-01': 5,
      '2016-01-08': 7,
    });
    const [yearRow] = result.grid;
    expect(yearRow[0]?.downloads).toBe(5);
    expect(yearRow[1]?.downloads).toBe(7);
  });

  it('clamps weekIndex to the last bucket for end-of-year dates', () => {
    const result = buildWeeklyHeatmap({
      '2016-12-31': 42,
    });
    const [yearRow] = result.grid;
    const lastCell = yearRow[HEATMAP_WEEKS - 1];
    expect(lastCell).not.toBeNull();
    expect(lastCell?.downloads).toBe(42);
  });

  it('ignores negative values, NaN, and non-numeric download counts', () => {
    const result = buildWeeklyHeatmap({
      '2020-01-06': -5,
      '2020-01-13': Number.NaN,
      // @ts-expect-error intentional bad input
      '2020-01-20': 'oops',
      '2020-01-27': 10,
    });
    expect(result.totalDownloads).toBe(10);
    expect(result.populatedWeeks).toBe(1);
  });

  it('computes quantile thresholds from non-zero downloads', () => {
    // Values: 100, 200, 300, 400. Quartile cutoffs by closest-rank: 100, 200, 300, 400.
    const result = buildWeeklyHeatmap({
      '2020-01-06': 100,
      '2020-01-13': 200,
      '2020-01-20': 300,
      '2020-01-27': 400,
    });
    expect(result.thresholds).toEqual([100, 200, 300, 400]);
    expect(result.maxDownloads).toBe(400);
  });

  it('assigns levels based on quantile thresholds', () => {
    const result = buildWeeklyHeatmap({
      '2020-01-06': 100,
      '2020-01-13': 200,
      '2020-01-20': 300,
      '2020-01-27': 400,
    });
    const [row] = result.grid;
    const cells = row.filter((c): c is HeatmapCell => c !== null);
    // Ascending by week, so 100→level 1, 200→2, 300→3, 400→4.
    expect(cells.map((c) => c.level)).toEqual([1, 2, 3, 4]);
  });

  it('assigns level 0 for zero-valued cells and leaves them out of populated counts', () => {
    const result = buildWeeklyHeatmap({
      '2020-01-06': 0,
      '2020-01-13': 50,
    });
    const [row] = result.grid;
    // Zero entries are still placed in the grid (they are real weeks with reported 0 downloads),
    // but they participate as level 0.
    const zeroCell = row.find((c) => c && c.downloads === 0);
    expect(zeroCell?.level).toBe(0);
  });

  it('merges collisions in the same week bucket by keeping the peak value', () => {
    // Both 2020-01-05 (day-of-year 4) and 2020-01-06 (day 5) land in week 0.
    // We want the higher value retained so spikes are not hidden.
    const result = buildWeeklyHeatmap({
      '2020-01-05': 10,
      '2020-01-06': 999,
    });
    const [row] = result.grid;
    const populated = row.filter((c) => c !== null);
    expect(populated).toHaveLength(1);
    expect(populated[0]?.downloads).toBe(999);
  });

  it('reports totalDownloads, maxDownloads, and populatedWeeks across years', () => {
    const result = buildWeeklyHeatmap({
      '2016-04-25': 20,
      '2017-01-02': 10,
      '2018-06-04': 100,
    });
    expect(result.totalDownloads).toBe(130);
    expect(result.maxDownloads).toBe(100);
    expect(result.populatedWeeks).toBe(3);
  });

  it('collapses thresholds to a single value when every non-zero week has the same count', () => {
    const result = buildWeeklyHeatmap({
      '2020-01-06': 50,
      '2020-01-13': 50,
      '2020-01-20': 50,
    });
    expect(result.thresholds).toEqual([50, 50, 50, 50]);
    // All non-zero cells should land at level 1 (<= Q1) — the intent of the
    // fall-through is "everything equal" rather than "everything maxed".
    const [row] = result.grid;
    const cells = row.filter((c): c is HeatmapCell => c !== null);
    expect(cells.every((c) => c.level === 1)).toBe(true);
  });
});
