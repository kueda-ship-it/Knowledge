import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages, pagedPath, PAGE_ROWS } from './fetchAllPages';

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('fetchAllPages', () => {
    it('1 ページに収まるときは 1 回だけ読む', async () => {
        const fetchPage = vi.fn(async () => rows(57));
        const all = await fetchAllPages(fetchPage);
        expect(all).toHaveLength(57);
        expect(fetchPage).toHaveBeenCalledTimes(1);
        expect(fetchPage).toHaveBeenCalledWith(0, PAGE_ROWS);
    });

    it('1000 行を超えるときは短いページが来るまで続けて読む', async () => {
        const total = 2345;
        const fetchPage = vi.fn(async (offset: number, limit: number) =>
            rows(total).slice(offset, offset + limit));
        const all = await fetchAllPages(fetchPage);
        expect(all).toHaveLength(total);
        expect(all[1000]).toBe(1000);
        expect(fetchPage.mock.calls.map(c => c[0])).toEqual([0, 1000, 2000]);
    });

    it('ちょうど 1000 行のときは空ページを読んで終わる', async () => {
        const fetchPage = vi.fn(async (offset: number) => (offset === 0 ? rows(1000) : []));
        const all = await fetchAllPages(fetchPage);
        expect(all).toHaveLength(1000);
        expect(fetchPage).toHaveBeenCalledTimes(2);
    });

    it('途中のページで失敗したらそのままエラーにする（一部だけ返さない）', async () => {
        const fetchPage = vi.fn(async (offset: number) => {
            if (offset > 0) throw new Error('HTTP 500');
            return rows(1000);
        });
        await expect(fetchAllPages(fetchPage)).rejects.toThrow('HTTP 500');
    });
});

describe('pagedPath', () => {
    it('order= のある path に limit / offset を足す', () => {
        expect(pagedPath('/rest/v1/knowledge?select=id&order=created_at.desc,id.desc', 1000, 1000))
            .toBe('/rest/v1/knowledge?select=id&order=created_at.desc,id.desc&limit=1000&offset=1000');
    });

    it('order= が無ければエラーにする', () => {
        expect(() => pagedPath('/rest/v1/knowledge?select=id', 0, 1000)).toThrow(/order=/);
    });
});
