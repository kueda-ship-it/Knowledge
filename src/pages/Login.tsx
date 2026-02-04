import React, { useState } from 'react';
import { apiClient } from '../api/client';
import { User } from '../types';
import { Box } from 'lucide-react';

interface LoginProps {
    onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [id, setId] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await apiClient.login(id);
            if (res.status === 'success' && res.user) {
                onLogin(res.user);
            } else {
                alert("ログイン失敗: " + res.message);
            }
        } catch (error) {
            alert("通信エラーしました");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="view active center-screen">
            <div className="login-box" style={{
                background: 'white',
                padding: '40px',
                borderRadius: '12px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                width: '100%',
                maxWidth: '400px',
                textAlign: 'center'
            }}>
                <h1 style={{ color: '#3b82f6', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                    <Box /> Knowledge DB
                </h1>
                <p style={{ color: '#64748b', marginBottom: '30px' }}>IDを入力してログインしてください</p>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <input
                        type="text"
                        placeholder="ユーザーID"
                        value={id}
                        onChange={(e) => setId(e.target.value)}
                        required
                        style={{
                            padding: '12px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            outline: 'none'
                        }}
                    />
                    <button
                        type="submit"
                        className="primary-btn full-width"
                        disabled={loading}
                    >
                        {loading ? 'Processing...' : 'ログイン'}
                    </button>
                </form>
            </div>
        </div>
    );
};
