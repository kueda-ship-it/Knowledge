import { useEffect, useRef } from 'react';
import { KnowledgeItem, Attachment } from '../types';
import { getToken } from '../lib/microsoftGraph';
import { makeThumbnail } from '../utils/imageThumbnail';
import { uploadKnowledgeThumb, patchKnowledgeAttachments } from '../api/client';

// SNS フィード化以前の投稿の画像サムネを遅延バックフィルする。
// storageThumbUrl の無い画像添付を、OneDrive サインイン済みユーザーの閲覧時に
// Graph からサムネ取得 → Storage 保存 → attachments を PATCH (fire-and-forget)。
// 添付は投稿者本人の OneDrive にあるため /me/drive で取れるのは本人だけ。
// 失敗しても表示は従来どおり (壊れた画像は onError で非表示)。
export function useThumbBackfill(
    items: KnowledgeItem[],
    onPatched: (id: string, attachments: Attachment[]) => void
) {
    const attempted = useRef<Set<string>>(new Set());

    useEffect(() => {
        const targets = items.filter(it =>
            !attempted.current.has(it.id) &&
            (it.attachments ?? []).some(a => a.type?.startsWith('image/') && !a.storageThumbUrl)
        ).slice(0, 5); // 1 回の表示につき最大 5 件
        if (targets.length === 0) return;

        let cancelled = false;
        (async () => {
            const token = await getToken();
            if (!token) return;
            for (const it of targets) {
                if (cancelled) return;
                // attempted は「実際に処理を始めた」時点で記録する。
                // effect 登録時に先回りで記録すると StrictMode の 二重実行
                // (実行→即クリーンアップ→再実行) で 2 回目が全件スキップされ、一度も走らない。
                if (attempted.current.has(it.id)) continue;
                attempted.current.add(it.id);
                console.info('[thumbBackfill] start', it.id);
                try {
                    const nextAtts: Attachment[] = [];
                    let changed = false;
                    for (const a of it.attachments ?? []) {
                        if (!a.type?.startsWith('image/') || a.storageThumbUrl) { nextAtts.push(a); continue; }
                        const controller = new AbortController();
                        const timer = setTimeout(() => controller.abort(), 15000);
                        const res = await fetch(
                            `https://graph.microsoft.com/v1.0/me/drive/items/${a.id}/thumbnails/0/large/content`,
                            { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
                        ).finally(() => clearTimeout(timer));
                        if (!res.ok) { console.info('[thumbBackfill] graph', a.id, res.status); nextAtts.push(a); continue; }
                        const thumb = await makeThumbnail(await res.blob());
                        if (!thumb) { console.info('[thumbBackfill] makeThumbnail null', a.id); nextAtts.push(a); continue; }
                        const url = await uploadKnowledgeThumb(thumb, `${a.id}.webp`);
                        if (!url) { console.info('[thumbBackfill] upload failed', a.id); nextAtts.push(a); continue; }
                        nextAtts.push({ ...a, storageThumbUrl: url });
                        changed = true;
                    }
                    // cancelled (データ再取得等で effect が再実行) でも、処理を始めた投稿は最後まで書き込む。
                    // 中断すると attempted 済みのまま未完了になり、二度と再試行されない
                    if (changed && await patchKnowledgeAttachments(it.id, nextAtts)) {
                        console.info('[thumbBackfill] patched', it.id);
                        onPatched(it.id, nextAtts);
                    } else if (changed) {
                        console.info('[thumbBackfill] patch failed', it.id);
                    }
                } catch (e) { console.info('[thumbBackfill] error', it.id, e); /* 本人以外の添付等は諦める */ }
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);
}
