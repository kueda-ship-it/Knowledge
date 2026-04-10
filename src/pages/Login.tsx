import { Box } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const Login: React.FC = () => {
    const { signInWithMicrosoft } = useAuth();

    return (
        <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            minHeight: '100vh', backgroundColor: 'var(--bg)'
        }}>
            <div style={{
                background: 'var(--card-bg)', padding: '40px', borderRadius: '12px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.07)', width: '100%',
                maxWidth: '400px', textAlign: 'center',
                border: '1px solid var(--border)'
            }}>
                <h1 style={{
                    color: '#3b82f6', marginBottom: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                    fontSize: '1.5rem'
                }}>
                    <Box size={28} /> Knowledge DB
                </h1>
                <p style={{ color: 'var(--muted)', marginBottom: '32px', fontSize: '0.9rem' }}>
                    社内アカウントでサインインしてください
                </p>

                <button
                    onClick={signInWithMicrosoft}
                    style={{
                        width: '100%', padding: '12px 20px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                        border: '1px solid var(--input-border)', borderRadius: '8px',
                        background: 'var(--input-bg)', cursor: 'pointer', fontSize: '0.95rem',
                        fontWeight: '500', color: 'var(--text)',
                        transition: 'background 0.2s'
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--border)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'var(--input-bg)')}
                >
                    {/* Microsoft ロゴ */}
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
    );
};
