import { useEffect, useRef, useState } from 'react';

// 起動時に埋め込まれた版数。define 未注入の dev フォールバックも考慮。
const CURRENT_BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 分

// 最新 version.json を取得して起動時の版数と照合し、
// 新バージョンがあれば updateAvailable=true を返す。
// チェックタイミング: マウント時 / タブ復帰 (visibilitychange) / 5 分毎。
export function useVersionCheck(): { updateAvailable: boolean } {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const stopRef = useRef(false);

    useEffect(() => {
        stopRef.current = false;

        const check = async () => {
            if (stopRef.current || updateAvailable) return;
            try {
                // タイムアウト付き + キャッシュ無効化で必ず最新を取る
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 8000);
                const res = await fetch(`/version.json?t=${Date.now()}`, {
                    cache: 'no-store',
                    signal: ctrl.signal,
                });
                clearTimeout(t);
                if (!res.ok) return;
                const data = (await res.json()) as { buildId?: string };
                const latest = data?.buildId;
                if (latest && CURRENT_BUILD_ID !== 'dev' && latest !== CURRENT_BUILD_ID) {
                    setUpdateAvailable(true);
                }
            } catch {
                // ネットワーク不調時は黙ってスキップ (次回チェックで再判定)
            }
        };

        check();

        const onVisible = () => {
            if (document.visibilityState === 'visible') check();
        };
        document.addEventListener('visibilitychange', onVisible);

        const id = window.setInterval(check, POLL_INTERVAL_MS);

        return () => {
            stopRef.current = true;
            document.removeEventListener('visibilitychange', onVisible);
            window.clearInterval(id);
        };
        // updateAvailable を deps に入れると検知後に再購読されるが、
        // check 内で early-return するので副作用は無い。意図的に user 非依存。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { updateAvailable };
}
