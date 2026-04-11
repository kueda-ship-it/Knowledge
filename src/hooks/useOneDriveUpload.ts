import { useState, useCallback, useEffect } from 'react';
import { getGraphClient, getToken } from '../lib/microsoftGraph';

export interface Attachment {
    id: string;
    url: string;
    name: string;
    type: string;
    size: number;
    thumbnailUrl?: string;
}

const FOLDER_NAME = "KnowledgeDB_Attachments";

export function useOneDriveUpload(userEmail?: string) {
    const [uploading, setUploading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            const token = await getToken();
            setIsAuthenticated(!!token);
        };
        checkAuth();
        
        // localStorageの変更を監視（別タブやAuthContextでのトークン更新検知）
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'microsoft_graph_token') {
                setIsAuthenticated(!!e.newValue);
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const authenticate = useCallback(async (): Promise<boolean> => {
        const token = await getToken();
        setIsAuthenticated(!!token);
        return !!token;
    }, []);

    const ensureClient = useCallback(async () => {
        try {
            return await getGraphClient();
        } catch {
            throw new Error("LoginRequired");
        }
    }, []);

    const withRetry = async <T>(client: any, op: () => Promise<T>): Promise<T> => {
        try {
            return await op();
        } catch (e: any) {
            const s = JSON.stringify(e);
            if (s.includes("AADSTS65001") || s.includes("invalid_grant") || e.code === "InvalidAuthenticationToken" || e.message === "LoginRequired") {
                // トークンが無効または期限切れの場合、localStorageから削除して未認証状態にする
                localStorage.removeItem('microsoft_graph_token');
                setIsAuthenticated(false);
                throw new Error("LoginRequired");
            }
            throw e;
        }
    };

    const uploadFile = async (file: File): Promise<Attachment | null> => {
        setUploading(true);
        setStatusMessage('準備中...');
        try {
            const client = await ensureClient();

            setStatusMessage('フォルダ確認中...');
            const folderId = await withRetry(client, async () => {
                try {
                    const res = await client.api(`/me/drive/root:/${FOLDER_NAME}`).get();
                    return res.id;
                } catch (e: any) {
                    if (e.statusCode === 404) {
                        const folder = await client.api('/me/drive/root/children').post({
                            name: FOLDER_NAME,
                            folder: {},
                            "@microsoft.graph.conflictBehavior": "rename",
                        });
                        return folder.id;
                    }
                    throw e;
                }
            });

            setStatusMessage('アップロード中...');
            const cleanName = file.name.replace(/[:\\/*?"<>|]/g, '_');
            const fileName = `${Date.now()}_${cleanName}`;

            const driveItem = await withRetry(client, async () => {
                const session = await client.api(`/me/drive/items/${folderId}:/${fileName}:/createUploadSession`).post({
                    item: { "@microsoft.graph.conflictBehavior": "rename", name: fileName },
                });
                const res = await fetch(session.uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: { 'Content-Range': `bytes 0-${file.size - 1}/${file.size}` },
                });
                if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
                return res.json();
            });

            setStatusMessage('リンク取得中...');
            let webUrl = driveItem.webUrl;
            try {
                const link = await client.api(`/me/drive/items/${driveItem.id}/createLink`).post({
                    type: "view", scope: "organization",
                });
                webUrl = link.link.webUrl;
            } catch { /* use webUrl fallback */ }

            let thumbnailUrl = '';
            if (file.type.startsWith('image/')) {
                try {
                    const thumb = await client.api(`/me/drive/items/${driveItem.id}/thumbnails`).select('large').get();
                    thumbnailUrl = thumb.value?.[0]?.large?.url || '';
                } catch { /* no thumbnail */ }
            }

            return { id: driveItem.id, url: webUrl, name: file.name, type: file.type, size: file.size, thumbnailUrl };
        } catch (e: any) {
            if (e.message === "LoginRequired") {
                alert("Microsoft認証の期限が切れました。一度ログアウトし、再度ログインしてください。");
            } else {
                alert(`アップロード失敗: ${e.message}`);
            }
            return null;
        } finally {
            setUploading(false);
            setStatusMessage('');
        }
    };

    return { uploadFile, uploading, statusMessage, isAuthenticated, authenticate };
}
