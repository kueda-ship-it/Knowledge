// タイムライン表示用のサムネイル生成。
// OneDrive の Graph サムネ URL は短時間で失効するため、
// 永続表示用に幅 800px / WebP q0.75 へ縮小した画像を Supabase Storage に置く。
const MAX_WIDTH = 800;
const QUALITY = 0.75;

export async function makeThumbnail(source: Blob): Promise<Blob | null> {
    try {
        const bitmap = await createImageBitmap(source);
        const scale = Math.min(1, MAX_WIDTH / bitmap.width);
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();

        return await new Promise<Blob | null>(resolve =>
            canvas.toBlob(b => resolve(b), 'image/webp', QUALITY)
        );
    } catch {
        return null;
    }
}
