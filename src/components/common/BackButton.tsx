import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from './Button';

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
        <Button
            variant="secondary"
            title="戻る"
            icon={<ArrowLeft size={18} />}
            onClick={onClick}
            className={`back-btn-circle ${className}`}
            style={{ 
                ...style 
            }}
        />
    );
};
