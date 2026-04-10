import { useState, useCallback, useEffect } from 'react';
import { msalInstance, getGraphClient, initializeMsal, signIn, ssoLogin } from '../lib/microsoftGraph';
import { EventType } from "@azure/msal-browser";

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
        const init = async () => {
            await initializeMsal();
            // Try SSO with user's email if available
            if (userEmail) await ssoLogin(userEmail);
            setIsAuthenticated(!!msalInstance.getActiveAccount());
        };
        init();

        const id = msalInstance.addEventCallback((event: any) => {
            if ([EventType.LOGIN_SUCCESS, EventType.ACQUIRE_TOKEN_SUCCESS, EventType.ACTIVE_ACCOUNT_CHANGED].includes(event.eventType)) {
                setIsAuthenticated(!!msalInstance.getActiveAccount());
            }
        });
        return () => { if (id) msalInstance.removeEventCallback(id); };
    }, [userEmail]);

    const ensureClient = useCallback(async () => {
        try {
            return await getGraphClient();
        } catch {
            const account = await signIn();
            if (!account) throw new Error("LoginRequired");
            return await getGraphClient();
        }
    }, []);

    const withRetry = async <T>(client: any, op: () => Promise<T>): Promise<T> => {
        try {
            return await op();
        } catch (e: any) {
            const s = JSON.stringify(e);
            if (s.includes("AADSTS65001") || s.includes("invalid_grant") || e.code === "InvalidAuthenticationToken") {
                await signIn("consent");
                return await op();
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
            if (e.message !== "LoginRequired") alert(`アップロード失敗: ${e.message}`);
            return null;
        } finally {
            setUploading(false);
            setStatusMessage('');
        }
    };

    return { uploadFile, uploading, statusMessage, isAuthenticated };
}
