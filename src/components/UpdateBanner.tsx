import React from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';

// 新バージョン検知時に画面下部に出す更新バナー。
// 「更新」を押すと最新版を取得するためにフルリロードする。
// 編集中データを失わないよう、自動リロードはせずユーザー操作に委ねる。
export const UpdateBanner: React.FC<{ onReload: () => void }> = ({ onReload }) => {
    return (
        <div
            role="status"
            style={{
                position: 'fixed',
                left: '50%',
                bottom: '24px',
                transform: 'translateX(-50%)',
                zIndex: 100000,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '14px',
                height: '48px',
                padding: '0 10px 0 18px',
                boxSizing: 'border-box',
                borderRadius: '24px',
                background: 'rgba(24, 28, 40, 0.92)',
                backdropFilter: 'blur(28px) saturate(180%)',
                WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                border: '1px solid rgba(99,102,241,0.5)',
                boxShadow: '0 2px 0 0 rgba(255,255,255,0.08) inset, 0 12px 36px rgba(0,0,0,0.45), 0 0 24px rgba(99,102,241,0.25)',
                color: 'rgba(255,255,255,0.95)',
                fontSize: '0.88rem',
            }}
        >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', lineHeight: 1 }}>
                <Sparkles size={16} style={{ color: '#c7d2fe', flexShrink: 0 }} />
                新しいバージョンがあります
            </span>
            <button
                onClick={onReload}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: '34px',
                    padding: '0 16px',
                    boxSizing: 'border-box',
                    borderRadius: '18px',
                    border: '1px solid rgba(99,102,241,0.6)',
                    background: 'rgba(99,102,241,0.85)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    lineHeight: 1,
                    cursor: 'pointer',
                }}
            >
                <RotateCcw size={14} />
                更新
            </button>
        </div>
    );
};
