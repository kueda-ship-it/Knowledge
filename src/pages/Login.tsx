import { Box } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const Login: React.FC = () => {
    const { signInWithMicrosoft } = useAuth();

    return (
        <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            minHeight: '100vh'
        }}>
            <div className="glass-refract-wrap glass-elevated" style={{
                padding: '40px', borderRadius: '20px',
                width: '100%', maxWidth: '400px', textAlign: 'center',
                position: 'relative', overflow: 'hidden'
            }}>
                {/* 屈折レイヤー (Liquid Glass テーマのみ有効) */}
                <div className="glass-refraction" />
                <div className="glass-specular" />
                
                <div style={{ position: 'relative', zIndex: 2 }}>
                    <h1 style={{
                        color: '#60a5fa', marginBottom: '10px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                        fontSize: '1.5rem', textShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}>
                        <Box size={28} /> Knowledge DB
                    </h1>
                    <p style={{ color: 'var(--muted)', marginBottom: '32px', fontSize: '0.9rem' }}>
                        社内アカウントでサインインしてください
                    </p>

                    <button
                        onClick={signInWithMicrosoft}
                        className="microsoft-login-btn"
                    >
                        <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                            <rect x="0"  y="0"  width="10" height="10" fill="#F25022"/>
                            <rect x="11" y="0"  width="10" height="10" fill="#7FBA00"/>
                            <rect x="0"  y="11" width="10" height="10" fill="#00A4EF"/>
                            <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
                        </svg>
                        Microsoft アカウントでサインイン
                    </button>

                    <p style={{ marginTop: '20px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        社内ネットワークのアカウントを使用してください
                    </p>
                </div>
            </div>

            <style>{`
                .microsoft-login-btn {
                    width: 100%;
                    padding: 14px 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    border: 1px solid var(--input-border);
                    border-radius: 12px;
                    background: var(--input-bg);
                    cursor: pointer;
                    font-size: 1rem;
                    font-weight: 600;
                    color: var(--text);
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }

                .microsoft-login-btn:hover {
                    border-color: rgba(147,197,253,0.5);
                    transform: translateY(-2px);
                    box-shadow: 0 0 20px rgba(99,130,246,0.2), 0 8px 20px -6px rgba(59, 130, 246, 0.3);
                }

                body[data-theme="light"] .microsoft-login-btn:hover {
                    border-color: #3b82f6;
                    background: rgba(59,130,246,0.04);
                }

                body[data-theme="dark"] .microsoft-login-btn:hover {
                    border-color: #3b82f6;
                    background: rgba(59,130,246,0.08);
                }

                .microsoft-login-btn:active {
                    transform: translateY(0) scale(0.97);
                    box-shadow: 0 2px 6px -2px rgba(59, 130, 246, 0.2);
                    transition: all 0.1s;
                }

                .microsoft-login-btn svg {
                    transition: transform 0.3s ease;
                }

                .microsoft-login-btn:hover svg {
                    transform: rotate(-3deg) scale(1.1);
                }
            `}</style>
        </div>
    );
};
