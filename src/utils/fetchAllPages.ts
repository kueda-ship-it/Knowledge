// 1000 行を超えうる読み取りを、最後まで読む共通処理（設計基準 M38 / 2026-10-19）。
// 原本: app-template src/lib/rawRest.ts の fetchAllPages。
// Supabase（PostgREST）は 1 回に最大 1000 行しか返さず、超えた分はエラーにならず黙って切れる。

/** Supabase（PostgREST）が 1 回に返す行数の上限（既定の max-rows） */
export const PAGE_ROWS = 1000;

/** 1 ページずつ読む関数を受け取り、短いページが来るまで最後まで読む */
export async function fetchAllPages<T>(
    fetchPage: (offset: number, limit: number) => Promise<T[]>,
    limit = PAGE_ROWS,
): Promise<T[]> {
    const all: T[] = [];
    for (let offset = 0; ; offset += limit) {
        const page = await fetchPage(offset, limit);
        all.push(...page);
        if (page.length < limit) return all;
    }
}

/** PostgREST の path に limit / offset を足す。区切りの間で行がずれないよう order= を必須にする */
export function pagedPath(path: string, offset: number, limit: number): string {
    if (!/[?&]order=/.test(path)) {
        throw new Error('pagedPath: path に order= を付けてください（区切りの間で行がずれるため）');
    }
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}limit=${limit}&offset=${offset}`;
}
