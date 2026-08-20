import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THREAD_CALC_INPUT,
  computeThreads,
  formatMs,
  parseThreadCalc,
  serializeThreadCalc,
} from '../../src/utils/threadCalc';

describe('computeThreads', () => {
  it('computes threads from RPS, response time, and think time', () => {
    // 100 RPS * (500ms + 2000ms)/1000 = 250 raw threads, +20% headroom = 300
    const result = computeThreads({
      targetRps: 100,
      responseTimeMs: 500,
      thinkTimeMs: 2000,
      headroomPct: 20,
    });
    expect(result).not.toBeNull();
    expect(result!.rawThreads).toBe(250);
    expect(result!.threads).toBe(300);
    expect(result!.cycleTimeMs).toBe(2500);
    expect(result!.rpsPerThread).toBeCloseTo(0.4);
    expect(result!.inFlight).toBeCloseTo(50);
  });

  it('handles zero think time', () => {
    // 10 RPS * 100ms = 1 thread, no headroom
    const result = computeThreads({
      targetRps: 10,
      responseTimeMs: 100,
      thinkTimeMs: 0,
      headroomPct: 0,
    });
    expect(result!.threads).toBe(1);
  });

  it('returns null for invalid input', () => {
    expect(
      computeThreads({ targetRps: 0, responseTimeMs: 100, thinkTimeMs: 0, headroomPct: 0 }),
    ).toBeNull();
    expect(
      computeThreads({ targetRps: 10, responseTimeMs: 0, thinkTimeMs: 0, headroomPct: 0 }),
    ).toBeNull();
    expect(
      computeThreads({ targetRps: 10, responseTimeMs: -5, thinkTimeMs: 0, headroomPct: 0 }),
    ).toBeNull();
    expect(
      computeThreads({ targetRps: NaN, responseTimeMs: 100, thinkTimeMs: 0, headroomPct: 0 }),
    ).toBeNull();
  });

  it('rounds up fractional thread counts', () => {
    const result = computeThreads({
      targetRps: 5,
      responseTimeMs: 300,
      thinkTimeMs: 100,
      headroomPct: 0,
    });
    expect(result!.rawThreads).toBe(2);
  });

  it('rejects out-of-range headroom', () => {
    expect(
      computeThreads({ targetRps: 10, responseTimeMs: 100, thinkTimeMs: 0, headroomPct: 101 }),
    ).toBeNull();
    expect(
      computeThreads({ targetRps: 10, responseTimeMs: 100, thinkTimeMs: 0, headroomPct: -1 }),
    ).toBeNull();
  });
});

describe('serialize/parse round-trip', () => {
  it('serializes only non-default values', () => {
    expect(serializeThreadCalc(DEFAULT_THREAD_CALC_INPUT).toString()).toBe('');
  });

  it('round-trips customized input', () => {
    const input = { targetRps: 2500, responseTimeMs: 120, thinkTimeMs: 750, headroomPct: 50 };
    expect(parseThreadCalc(serializeThreadCalc(input))).toEqual(input);
  });

  it('falls back to defaults on garbage input', () => {
    expect(parseThreadCalc(new URLSearchParams('rps=abc&rt='))).toEqual(DEFAULT_THREAD_CALC_INPUT);
  });

  it('clamps headroom to the 0–100 slider range', () => {
    expect(parseThreadCalc(new URLSearchParams('headroom=500')).headroomPct).toBe(100);
    expect(parseThreadCalc(new URLSearchParams('headroom=-40')).headroomPct).toBe(0);
  });
});

describe('formatMs', () => {
  it('formats sub-second, second, and minute durations', () => {
    expect(formatMs(250)).toBe('250ms');
    expect(formatMs(2000)).toBe('2s');
    expect(formatMs(2500)).toBe('2.5s');
    expect(formatMs(60000)).toBe('1m');
    expect(formatMs(90000)).toBe('1m 30s');
    expect(formatMs(119500)).toBe('2m');
  });
});
