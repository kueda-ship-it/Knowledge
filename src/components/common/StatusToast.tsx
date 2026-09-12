import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

// 保存結果など、操作の結果を1件だけ出すトースト。通知用の ToastStack（右下）や AI チャット（左下）と重ならないよう下中央に出す。
// 失敗は読み切れるよう長めに残し、閉じるボタンでも消せる。

export interface StatusToastState {
    id: number;
    kind: 'success' | 'error';
    text: string;
}

const DURATION_MS: Record<StatusToastState['kind'], number> = {
    success: 4000,
    error: 12000,
};

interface Props {
    toast: StatusToastState | null;
    onDismiss: () => void;
}

export const StatusToast: React.FC<Props> = ({ toast, onDismiss }) => {
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(onDismiss, DURATION_MS[toast.kind]);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toast?.id]);

    if (!toast) return null;
    const isError = toast.kind === 'error';
    const Icon = isError ? AlertCircle : CheckCircle2;

    return createPortal(
        <div
            key={toast.id}
            role={isError ? 'alert' : 'status'}
            className="status-toast glass-elevated"
            data-kind={toast.kind}
        >
            <span className="status-toast-icon"><Icon size={16} /></span>
            <span className="status-toast-text">{toast.text}</span>
            <button type="button" className="status-toast-close" onClick={onDismiss} title="閉じる" aria-label="閉じる">
                <X size={16} />
            </button>
            <style>{`
                .status-toast {
                    position: fixed;
                    left: 50%;
                    bottom: 24px;
                    transform: translateX(-50%);
                    z-index: 9500;
                    display: grid;
                    grid-template-columns: 16px minmax(0, 1fr) 24px;
                    align-items: start;
                    gap: 10px;
                    width: min(460px, calc(100vw - 32px));
                    box-sizing: border-box;
                    padding: 12px 14px;
                    border-radius: 14px;
                    border: 1px solid var(--glass-border);
                    box-shadow: var(--card-shadow-lg);
                    color: var(--text);
                    font-size: 0.88rem;
                    line-height: 1.5;
                    animation: chatPop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .status-toast[data-kind="error"] { border-color: color-mix(in oklab, var(--danger) 45%, transparent); }
                .status-toast[data-kind="success"] { border-color: color-mix(in oklab, var(--primary) 45%, transparent); }
                .status-toast-icon { display: inline-flex; margin-top: 3px; }
                .status-toast[data-kind="error"] .status-toast-icon { color: var(--danger); }
                .status-toast[data-kind="success"] .status-toast-icon { color: var(--primary); }
                .status-toast-text { min-width: 0; overflow-wrap: anywhere; }
                .status-toast-close {
                    display: inline-flex; align-items: center; justify-content: center;
                    width: 24px; height: 24px; padding: 0; box-sizing: border-box;
                    border: none; border-radius: 6px; background: transparent;
                    color: var(--muted); cursor: pointer; font-family: inherit;
                }
                .status-toast-close:hover { background: var(--btn-icon-hover-bg); color: var(--text); }
            `}</style>
        </div>,
        document.body,
    );
};
