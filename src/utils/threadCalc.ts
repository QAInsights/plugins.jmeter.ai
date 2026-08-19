/**
 * Pure utility helpers for the JMeter Thread Calculator tool.
 * All functions are side-effect free and safe to call during SSR. DOM and
 * query-string I/O lives in src/pages/tools/thread-calculator.astro.
 */

export interface ThreadCalcInput {
  /** Target throughput in requests per second. */
  targetRps: number;
  /** Average response time per request, in milliseconds. */
  responseTimeMs: number;
  /** Think time between requests per thread, in milliseconds. */
  thinkTimeMs: number;
  /** Safety headroom as a percentage (e.g. 20 = 20%). */
  headroomPct: number;
}

export interface ThreadCalcResult {
  /** Recommended thread count, rounded up and including headroom. */
  threads: number;
  /** Raw thread count before headroom, rounded up. */
  rawThreads: number;
  /** One full request cycle per thread: response time + think time (ms). */
  cycleTimeMs: number;
  /** Requests per second a single thread can sustain. */
  rpsPerThread: number;
  /** Average in-flight (concurrently executing) requests. */
  inFlight: number;
}

export const DEFAULT_THREAD_CALC_INPUT: ThreadCalcInput = {
  targetRps: 100,
  responseTimeMs: 500,
  thinkTimeMs: 2000,
  headroomPct: 20,
};

/**
 * Compute the thread count needed to sustain a target throughput.
 *
 * Little's-law based model: one thread completes one request per
 * (response time + think time) cycle, so
 *   threads = targetRps * (responseTime + thinkTime) / 1000
 *
 * Returns null when the inputs cannot produce a meaningful answer.
 */
export function computeThreads(input: ThreadCalcInput): ThreadCalcResult | null {
  const { targetRps, responseTimeMs, thinkTimeMs, headroomPct } = input;
  if (
    !Number.isFinite(targetRps) ||
    !Number.isFinite(responseTimeMs) ||
    !Number.isFinite(thinkTimeMs) ||
    !Number.isFinite(headroomPct)
  ) {
    return null;
  }
  if (targetRps <= 0 || responseTimeMs < 0 || thinkTimeMs < 0) return null;
  if (headroomPct < 0 || headroomPct > 100) return null;

  const cycleTimeMs = responseTimeMs + thinkTimeMs;
  if (cycleTimeMs <= 0) return null;

  const rpsPerThread = 1000 / cycleTimeMs;
  const rawThreads = Math.ceil(targetRps / rpsPerThread);
  const threads = Math.ceil(rawThreads * (1 + headroomPct / 100));
  const inFlight = targetRps * (responseTimeMs / 1000);

  return { threads, rawThreads, cycleTimeMs, rpsPerThread, inFlight };
}

/** Serialize calculator input to URL query params (only non-default values). */
export function serializeThreadCalc(input: ThreadCalcInput): URLSearchParams {
  const params = new URLSearchParams();
  if (input.targetRps !== DEFAULT_THREAD_CALC_INPUT.targetRps)
    params.set('rps', String(input.targetRps));
  if (input.responseTimeMs !== DEFAULT_THREAD_CALC_INPUT.responseTimeMs)
    params.set('rt', String(input.responseTimeMs));
  if (input.thinkTimeMs !== DEFAULT_THREAD_CALC_INPUT.thinkTimeMs)
    params.set('tt', String(input.thinkTimeMs));
  if (input.headroomPct !== DEFAULT_THREAD_CALC_INPUT.headroomPct)
    params.set('headroom', String(input.headroomPct));
  return params;
}

function parseNum(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Parse query params back into calculator input, falling back to defaults. */
export function parseThreadCalc(params: URLSearchParams): ThreadCalcInput {
  return {
    targetRps: parseNum(params.get('rps'), DEFAULT_THREAD_CALC_INPUT.targetRps),
    responseTimeMs: parseNum(params.get('rt'), DEFAULT_THREAD_CALC_INPUT.responseTimeMs),
    thinkTimeMs: parseNum(params.get('tt'), DEFAULT_THREAD_CALC_INPUT.thinkTimeMs),
    headroomPct: clamp(
      parseNum(params.get('headroom'), DEFAULT_THREAD_CALC_INPUT.headroomPct),
      0,
      100,
    ),
  };
}

/** Format a duration in milliseconds as a compact human string. */
export function formatMs(ms: number): string {
  if (ms >= 60_000) {
    // Round total seconds first so a value like 119500ms becomes 2m, not 1m 60s.
    const totalSec = Math.round(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  }
  if (ms >= 1000) {
    const s = ms / 1000;
    return `${Number.isInteger(s) ? s : s.toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}
