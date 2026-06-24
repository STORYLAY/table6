
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  delay?: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const Tooltip: React.FC<TooltipProps> = ({ children, content, delay = 300, className = "w-full block", onClick }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    timeoutRef.current = setTimeout(() => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setCoords({
          x: rect.left + rect.width / 2,
          y: rect.top - 8
        });
        setIsVisible(true);
      }
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  // Add auto-positioning logic to avoid clipping
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: 9999,
    left: 0,
    top: 0
  });

  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const tooltipWidth = 120; // Rough estimate for initial positioning
        const padding = 10;
        
        let left = rect.left + rect.width / 2;
        let xTransform = '-50%';
        
        // Horizontal constraint check
        const halfWidth = 100; // max-w-[200px] / 2
        if (left < halfWidth + padding) { // Too close to left
            left = rect.left;
            xTransform = '0%';
        } else if (left > window.innerWidth - (halfWidth + padding)) { // Too close to right
            left = rect.right;
            xTransform = '-100%';
        }
        
        setTooltipStyle({
            position: 'fixed',
            left: left,
            top: rect.top - 8,
            transform: `translateX(${xTransform}) translateY(-100%)`,
            pointerEvents: 'none',
            zIndex: 9999
        });
    }
  }, [isVisible, coords]);

  return (
    <>
      <div 
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
        className={className}
      >
        {children}
      </div>
      {isVisible && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={tooltipStyle}
            className="px-3 py-1.5 bg-black text-white text-[13px] rounded-md shadow-xl break-words max-w-[200px] text-center"
          >
            {content}
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
