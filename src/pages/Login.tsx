import React, { useState } from 'react';
import { Box, Mail, Lock, ArrowRight, Loader } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'select' | 'login' | 'signup';

export const Login: React.FC = () => {
    const { signInWithMicrosoft, signInWithEmail, signUpWithEmail } = useAuth();
    const [mode, setMode] = useState<Mode>('select');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setLoading(true);

        if (password.length < 8) {
            setError('パスワードは8文字以上で入力してください。');
            setLoading(false);
            return;
        }

        if (mode === 'login') {
            const { error } = await signInWithEmail(email, password);
            if (error) setError(error);
        } else {
            const { error } = await signUpWithEmail(email, password);
            if (error) {
                setError(error);
            } else {
                setSuccess('確認メールを送信しました。メール内のリンクをクリックしてアカウントを有効化してください。');
                setEmail('');
                setPassword('');
            }
        }
        setLoading(false);
    };

    const goBack = () => {
        setMode('select');
        setError(null);
        setSuccess(null);
        setEmail('');
        setPassword('');
    };

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
                <div className="glass-refraction" />
                <div className="glass-specular" />

                <div style={{ position: 'relative', zIndex: 2 }}>
                    <h1 style={{
                        color: '#60a5fa', marginBottom: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                        fontSize: '1.5rem', textShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}>
                        <Box size={28} /> Knowledge DB
                    </h1>

                    {mode === 'select' && (
                        <>
                            <p style={{ color: 'var(--muted)', marginBottom: '32px', fontSize: '0.9rem' }}>
                                アカウントでサインインしてください
                            </p>

                            {/* Microsoft SSO */}
                            <button onClick={signInWithMicrosoft} className="microsoft-login-btn">
                                <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="0"  y="0"  width="10" height="10" fill="#F25022"/>
                                    <rect x="11" y="0"  width="10" height="10" fill="#7FBA00"/>
                                    <rect x="0"  y="11" width="10" height="10" fill="#00A4EF"/>
                                    <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
                                </svg>
                                Microsoft アカウントでサインイン
                            </button>

                            {/* 区切り */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
                                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                                <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>または</span>
                                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                            </div>

                            {/* メールログイン */}
                            <button onClick={() => setMode('login')} className="email-login-btn">
                                <Mail size={18} />
                                メールアドレスでログイン
                            </button>

                            <button onClick={() => setMode('signup')} className="email-signup-btn">
                                新規アカウント登録
                                <ArrowRight size={16} />
                            </button>
                        </>
                    )}

                    {(mode === 'login' || mode === 'signup') && (
                        <>
                            <p style={{ color: 'var(--muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
                                {mode === 'login' ? 'メールアドレスでログイン' : '新規アカウント登録'}
                            </p>

                            <form onSubmit={handleEmailAuth} style={{ textAlign: 'left' }}>
                                <div className="input-group">
                                    <Mail size={16} className="input-icon" />
                                    <input
                                        type="email"
                                        placeholder="メールアドレス"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        required
                                        className="auth-input"
                                    />
                                </div>

                                <div className="input-group" style={{ marginTop: '12px' }}>
                                    <Lock size={16} className="input-icon" />
                                    <input
                                        type="password"
                                        placeholder="パスワード（8文字以上）"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                        minLength={8}
                                        className="auth-input"
                                    />
                                </div>

                                {error && (
                                    <div className="auth-error">
                                        {error}
                                    </div>
                                )}

                                {success && (
                                    <div className="auth-success">
                                        {success}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="auth-submit-btn"
                                    style={{ marginTop: '20px' }}
                                >
                                    {loading
                                        ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                        : mode === 'login' ? 'ログイン' : 'アカウント登録'
                                    }
                                </button>
                            </form>

                            <button onClick={goBack} className="auth-back-link">
                                ← ログイン方法の選択に戻る
                            </button>
                        </>
                    )}
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
                .microsoft-login-btn:active {
                    transform: translateY(0) scale(0.97);
                }
                .email-login-btn {
                    width: 100%;
                    padding: 13px 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    border: 1px solid var(--input-border);
                    border-radius: 12px;
                    background: transparent;
                    cursor: pointer;
                    font-size: 0.95rem;
                    font-weight: 500;
                    color: var(--text);
                    transition: all 0.2s ease;
                }
                .email-login-btn:hover {
                    border-color: #60a5fa;
                    background: rgba(96,165,250,0.08);
                    transform: translateY(-1px);
                }
                .email-signup-btn {
                    width: 100%;
                    padding: 10px 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    margin-top: 10px;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    font-size: 0.85rem;
                    color: var(--muted);
                    transition: color 0.2s;
                }
                .email-signup-btn:hover {
                    color: #60a5fa;
                }
                .input-group {
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                .input-icon {
                    position: absolute;
                    left: 14px;
                    color: var(--muted);
                    pointer-events: none;
                    z-index: 1;
                }
                .auth-input {
                    width: 100%;
                    padding: 12px 14px 12px 42px;
                    border: 1px solid var(--input-border);
                    border-radius: 10px;
                    background: var(--input-bg);
                    color: var(--text);
                    font-size: 0.95rem;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    box-sizing: border-box;
                }
                .auth-input:focus {
                    border-color: #60a5fa;
                    box-shadow: 0 0 0 3px rgba(96,165,250,0.15);
                }
                .auth-error {
                    margin-top: 12px;
                    padding: 10px 14px;
                    border-radius: 8px;
                    background: rgba(239,68,68,0.1);
                    border: 1px solid rgba(239,68,68,0.3);
                    color: #ef4444;
                    font-size: 0.85rem;
                    text-align: left;
                    line-height: 1.5;
                }
                .auth-success {
                    margin-top: 12px;
                    padding: 10px 14px;
                    border-radius: 8px;
                    background: rgba(16,185,129,0.1);
                    border: 1px solid rgba(16,185,129,0.3);
                    color: #10b981;
                    font-size: 0.85rem;
                    text-align: left;
                    line-height: 1.5;
                }
                .auth-submit-btn {
                    width: 100%;
                    padding: 13px;
                    border: none;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #3b82f6, #6366f1);
                    color: white;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 12px rgba(99,102,241,0.3);
                }
                .auth-submit-btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 18px rgba(99,102,241,0.4);
                }
                .auth-submit-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .auth-back-link {
                    margin-top: 20px;
                    display: block;
                    background: none;
                    border: none;
                    color: var(--muted);
                    font-size: 0.85rem;
                    cursor: pointer;
                    transition: color 0.2s;
                }
                .auth-back-link:hover {
                    color: #60a5fa;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};
