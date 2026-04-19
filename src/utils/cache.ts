// localStorage ベースのシンプルな TTL 付きキャッシュ。
// 新形式は { ts: number, data: T }。旧形式 (data 直格納) は後方互換で読める。

export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function loadCache<T>(key: string, fallback: T, ttlMs: number = DEFAULT_TTL_MS): T {
    try {
        const s = localStorage.getItem(key);
        if (!s) return fallback;
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'ts' in parsed && 'data' in parsed) {
            const age = Date.now() - Number(parsed.ts);
            if (!Number.isFinite(age) || age < 0 || age > ttlMs) return fallback;
            return parsed.data as T;
        }
        // 旧形式: 配列やプレーンオブジェクトが直で入っているケース
        return parsed as T;
    } catch {
        return fallback;
    }
}

export function saveCache<T>(key: string, data: T): void {
    try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch {
        /* quota 超過等は握りつぶす */
    }
}
