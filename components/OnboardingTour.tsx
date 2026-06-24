
import React, { useState, useEffect } from 'react';
import { ICONS } from '../constants';

export interface TourStep {
  target: string; // CSS Selector or ID
  title: string;
  content: string;
}

interface OnboardingTourProps {
  steps: TourStep[];
  isOpen: boolean;
  onClose: () => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ steps, isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Find target element
      const step = steps[currentStep];
      const element = document.querySelector(step.target);
      if (element) {
        setTargetRect(element.getBoundingClientRect());
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      } else {
        // Skip if element not found (or close if critical)
        console.warn(`Tour element not found: ${step.target}`);
        setTargetRect(null);
      }
    } else {
      setCurrentStep(0); // Reset on close
    }
  }, [currentStep, isOpen, steps]);

  // Handle window resize to update highlighting
  useEffect(() => {
    const handleResize = () => {
      const step = steps[currentStep];
      const element = document.querySelector(step.target);
      if (element) {
        setTargetRect(element.getBoundingClientRect());
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentStep, steps]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const stepData = steps[currentStep];

  // Calculate popover position
  let popoverStyle: React.CSSProperties = { zIndex: 210 };
  
  if (targetRect) {
    const popoverWidth = 320;
    const popoverHeight = 200; // Estimated height
    const margin = 24; // 增加边距，防止遮挡

    // Try to place to the right of the target
    let top = targetRect.top;
    let left = targetRect.right + margin;

    // If it doesn't fit on the right, try below
    if (left + popoverWidth > window.innerWidth) {
        left = targetRect.left;
        top = targetRect.bottom + margin;
    }

    // Clamp to viewport
    if (top < margin) top = margin;
    if (top + popoverHeight > window.innerHeight - margin) top = window.innerHeight - popoverHeight - margin;
    
    if (left < margin) left = margin;
    if (left + popoverWidth > window.innerWidth - margin) left = window.innerWidth - popoverWidth - margin;

    popoverStyle = {
        ...popoverStyle,
        top: top,
        left: left,
    };
  } else {
      // Fallback center
      popoverStyle = {
          ...popoverStyle,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
      }
  }

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden">
      {/* Background Mask using SVG for cleaner cutout effect */}
      {targetRect && (
          <div className="absolute inset-0">
             <div 
                className="absolute inset-0 bg-black/60 transition-all duration-300 ease-in-out"
                style={{
                    clipPath: `polygon(
                        0% 0%, 
                        0% 100%, 
                        ${targetRect.left}px 100%, 
                        ${targetRect.left}px ${targetRect.top}px, 
                        ${targetRect.right}px ${targetRect.top}px, 
                        ${targetRect.right}px ${targetRect.bottom}px, 
                        ${targetRect.left}px ${targetRect.bottom}px, 
                        ${targetRect.left}px 100%, 
                        100% 100%, 
                        100% 0%
                    )`
                }}
             />
             {/* Highlight Border */}
             <div 
                className="absolute border-2 border-white rounded shadow-[0_0_0_4px_rgba(255,255,255,0.3)] pointer-events-none transition-all duration-300 ease-in-out"
                style={{
                    top: targetRect.top - 4,
                    left: targetRect.left - 4,
                    width: targetRect.width + 8,
                    height: targetRect.height + 8,
                }}
             />
          </div>
      )}
      {!targetRect && <div className="absolute inset-0 bg-black/60" />}

      {/* Popover Card */}
      <div 
        className="absolute w-80 max-w-[90vw] max-h-[80vh] overflow-y-auto bg-white rounded-xl shadow-2xl p-6 transition-all duration-300 ease-in-out flex flex-col animate-in fade-in zoom-in-95 z-[210]"
        style={popoverStyle}
      >
         <div className="flex justify-between items-start mb-4">
             <h3 className="font-bold text-lg text-gray-800">{stepData.title}</h3>
             <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><ICONS.Close className="w-5 h-5"/></button>
         </div>
         
         <div className="text-sm text-gray-600 leading-relaxed mb-6">
             {stepData.content}
         </div>

         <div className="flex items-center justify-between mt-auto">
             <div className="flex gap-1">
                 {steps.map((_, i) => (
                     <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === currentStep ? 'w-6 bg-primary-600' : 'w-1.5 bg-gray-200'}`} />
                 ))}
             </div>
             
             <div className="flex gap-2">
                 {currentStep > 0 && (
                     <button 
                        onClick={handlePrev}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                     >
                        上一步
                     </button>
                 )}
                 <button 
                    onClick={handleNext}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm transition-colors"
                 >
                    {currentStep === steps.length - 1 ? '完成' : '下一步'}
                 </button>
             </div>
         </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
