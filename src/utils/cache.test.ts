import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TTL_MS, loadCache, saveCache } from './cache';

beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
});

describe('cache helpers', () => {
    const KEY = 'test-key';
    const FALLBACK = { a: 0 };

    it('missing key returns fallback', () => {
        expect(loadCache(KEY, FALLBACK)).toBe(FALLBACK);
    });

    it('saveCache + loadCache roundtrip with new format', () => {
        saveCache(KEY, { a: 42 });
        expect(loadCache(KEY, FALLBACK)).toEqual({ a: 42 });
    });

    it('loadCache returns fallback for expired entry', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        saveCache(KEY, { a: 1 });
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + DEFAULT_TTL_MS + 1);
        expect(loadCache(KEY, FALLBACK)).toBe(FALLBACK);
    });

    it('loadCache returns data just under TTL', () => {
        vi.useFakeTimers();
        const t0 = new Date('2026-01-01T00:00:00Z').getTime();
        vi.setSystemTime(t0);
        saveCache(KEY, { a: 1 });
        vi.setSystemTime(t0 + DEFAULT_TTL_MS - 1);
        expect(loadCache(KEY, FALLBACK)).toEqual({ a: 1 });
    });

    it('legacy format (data stored directly as object) is still readable', () => {
        localStorage.setItem(KEY, JSON.stringify({ a: 7 }));
        expect(loadCache(KEY, FALLBACK)).toEqual({ a: 7 });
    });

    it('legacy format (array) is still readable', () => {
        localStorage.setItem(KEY, JSON.stringify([1, 2, 3]));
        expect(loadCache<number[]>(KEY, [])).toEqual([1, 2, 3]);
    });

    it('corrupted JSON returns fallback', () => {
        localStorage.setItem(KEY, '{not-json');
        expect(loadCache(KEY, FALLBACK)).toBe(FALLBACK);
    });

    it('custom ttl is respected', () => {
        vi.useFakeTimers();
        const t0 = new Date('2026-01-01T00:00:00Z').getTime();
        vi.setSystemTime(t0);
        saveCache(KEY, { a: 1 });
        vi.setSystemTime(t0 + 100);
        expect(loadCache(KEY, FALLBACK, 50)).toBe(FALLBACK);
        expect(loadCache(KEY, FALLBACK, 500)).toEqual({ a: 1 });
    });

    it('system time going backwards treats entry as stale', () => {
        vi.useFakeTimers();
        const t0 = new Date('2026-01-02T00:00:00Z').getTime();
        vi.setSystemTime(t0);
        saveCache(KEY, { a: 1 });
        vi.setSystemTime(t0 - 1000 * 60 * 60); // 1h 戻る
        expect(loadCache(KEY, FALLBACK)).toBe(FALLBACK);
    });
});
