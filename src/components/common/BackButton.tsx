import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
    onClick: () => void;
    label?: string;
    style?: React.CSSProperties;
    className?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({
    onClick,
    style,
    className
}) => {
    return (
        <button
            title="戻る"
            onClick={onClick}
            className={`back-btn-circle${className ? ` ${className}` : ''}`}
            style={{ ...style }}
        >
            <ArrowLeft size={18} />
        </button>
    );
};
