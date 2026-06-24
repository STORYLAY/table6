import React, { useRef, useEffect } from 'react';

export const ClickOutsideWrapper = ({ children, onClickOutside, className }: { children: React.ReactNode, onClickOutside: () => void, className?: string }) => {
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            // Ignore clicks on select dropdowns (which might be portaled)
            if (target.closest('[data-select-dropdown="true"]') || target.closest('[data-modal-portal="true"]')) {
                return;
            }
            
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                onClickOutside();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClickOutside]);

    return (
        <div ref={wrapperRef} className={className}>
            {children}
        </div>
    );
};
