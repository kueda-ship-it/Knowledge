import React from 'react';
import { Spinner } from '../shared/Spinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    icon?: React.ReactNode;
    loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    variant = 'secondary',
    icon,
    loading,
    children,
    className = '',
    style,
    ...props
}) => {
    const variantClass = `${variant}-btn`;
    
    return (
        <button
            className={`${variantClass} ${className}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: loading ? 0.7 : 1,
                pointerEvents: loading ? 'none' : 'auto',
                ...style
            }}
            {...props}
        >
            {icon && <span style={{ display: 'flex' }}>{icon}</span>}
            {children}
            {loading && <Spinner size={16} />}
        </button>
    );
};
