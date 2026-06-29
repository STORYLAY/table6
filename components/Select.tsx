import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ICONS } from '../constants';

export interface SelectOption {
  label: string;
  value: string;
  group?: string;
  icon?: string;
  mode?: string;
  isVision?: boolean;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  portal?: boolean;
  showSearch?: boolean;
  isModelSelector?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '请选择...',
  disabled = false,
  className = '',
  triggerClassName = 'w-full min-h-[36px] px-3 py-2 bg-white border rounded-xl flex items-center justify-between transition-all duration-200 text-sm shadow-sm',
  portal = true,
  showSearch = false,
  isModelSelector = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const selectRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number, bottom?: number, left: number, width: number, maxHeight?: number }>({ top: 0, left: 0, width: 0 });

  const showFilter = isModelSelector || showSearch;
  
  const filteredOptions = options.filter(option => {
    if (!showFilter || !searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (option.label || '').toLowerCase().includes(query) ||
      (option.value || '').toLowerCase().includes(query) ||
      (option.group || '').toLowerCase().includes(query)
    );
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setHighlightedIndex(prev => Math.min(prev + 1, filteredOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        onChange(filteredOptions[highlightedIndex].value);
        setIsOpen(false);
      } else if (e.key === 'Enter' || e.key === ' ') {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const idx = filteredOptions.findIndex(opt => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, filteredOptions, value]);

  useEffect(() => {
    if (isOpen && showFilter) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen, showFilter]);

  useEffect(() => {
    if (highlightedIndex !== -1 && dropdownRef.current) {
      const optionsElements = dropdownRef.current.querySelectorAll('.option-item-target');
      const targetElement = optionsElements[highlightedIndex] as HTMLElement;
      if (targetElement) {
        targetElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex]);

  const updateDropdownPosition = () => {
    if (!portal || !selectRef.current) return;
    const rect = selectRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldShowAbove = spaceBelow < 250 && spaceAbove > spaceBelow;

    if (shouldShowAbove) {
      setDropdownPosition({
        top: undefined,
        bottom: viewportHeight - rect.top + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: spaceAbove - 10,
      });
    } else {
      setDropdownPosition({
        top: rect.bottom + 4,
        bottom: undefined,
        left: rect.left,
        width: rect.width,
        maxHeight: spaceBelow - 10,
      });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const isClickInsideSelect = selectRef.current?.contains(event.target as Node);
      const isClickInsideDropdown = dropdownRef.current?.contains(event.target as Node);
      
      if (!isClickInsideSelect && !isClickInsideDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();

    const handleScrollOrResize = () => {
      updateDropdownPosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, portal]);

  const selectedOption = options.find(opt => opt.value === value);

  // Group options
  const groupedOptions = filteredOptions.reduce((acc, option) => {
    const group = option.group || '';
    if (!acc[group]) acc[group] = [];
    acc[group].push(option);
    return acc;
  }, {} as Record<string, SelectOption[]>);

  const dropdownContent = (
    <div 
      ref={dropdownRef} 
      data-select-dropdown="true"
      className={`z-[20000] bg-white border border-gray-200 rounded-xl shadow-xl shadow-black/[0.04] flex flex-col transform origin-top animate-in fade-in slide-in-from-top-2 duration-200 ${portal ? '' : 'absolute left-0 mt-2 min-w-full w-max max-w-[320px] max-h-[300px]'}`}
      style={portal ? { position: 'fixed', top: dropdownPosition.top, bottom: dropdownPosition.bottom, left: dropdownPosition.left, minWidth: dropdownPosition.width, width: 'max-content', maxWidth: 'min(400px, 90vw)', maxHeight: dropdownPosition.maxHeight ? Math.min(300, dropdownPosition.maxHeight) : 300 } : {}}
    >
      {showFilter && (
        <div className="p-2 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100/60 rounded-lg text-gray-400">
            <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder={isModelSelector ? "Search model" : "搜索..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-gray-700 placeholder-gray-400 outline-none border-0 p-0 focus:ring-0 focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="overflow-y-auto flex-1 py-1">
        {filteredOptions.length > 0 ? (
          Object.entries(groupedOptions).map(([group, opts]: [string, SelectOption[]]) => (
            <div key={group || 'ungrouped'}>
              {group && (
                <div className={isModelSelector ? "px-3 py-1.5 text-xs font-bold text-gray-400 tracking-wide first:pt-1" : "px-3 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/50 flex items-center gap-2"}>
                  {!isModelSelector && opts[0].icon && <img src={opts[0].icon} alt="" className="w-3 h-3 object-contain" />}
                  {group}
                </div>
              )}
              {opts.map(option => {
                const isSelected = option.value === value;
                const optIndex = filteredOptions.findIndex(o => o.value === option.value);
                const isHighlighted = highlightedIndex !== -1 && highlightedIndex === optIndex;
                
                if (isModelSelector) {
                  return (
                    <div
                      key={option.value}
                      className={`option-item-target px-3 py-1.5 mx-1 cursor-pointer text-xs flex items-center gap-2 rounded-lg transition-all duration-150 ${isSelected ? 'bg-indigo-50/20 text-slate-800' : isHighlighted ? 'bg-gray-100/60 text-slate-900' : 'text-gray-700 hover:bg-gray-50/80'}`}
                      onClick={() => {
                        onChange(option.value);
                        setIsOpen(false);
                      }}
                    >
                      {option.icon && (
                        <img src={option.icon} alt="" className="w-4 h-4 object-contain shrink-0" referrerPolicy="no-referrer" />
                      )}
                      <span className="truncate text-gray-700 font-medium flex-1">
                        {option.label}
                      </span>
                      {option.mode && (
                        <span className="inline-flex items-center text-[9px] bg-indigo-50 text-indigo-500 border border-indigo-100 px-1.5 py-0.5 rounded-full uppercase font-semibold shrink-0 ml-1">
                          {option.mode}
                        </span>
                      )}
                      {option.isVision && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-600 shrink-0 select-none ml-0.5 shadow-sm">
                          <svg className="w-2.5 h-2.5 text-white fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 11.5c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                          </svg>
                        </span>
                      )}
                      {isSelected && (
                        <span className="ml-auto shrink-0 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={option.value}
                    className={`option-item-target px-3 py-2 mx-1 cursor-pointer text-sm flex items-center justify-between rounded-lg transition-all duration-150 ${isSelected ? 'bg-primary-50/50 text-primary-700 font-medium' : isHighlighted ? 'bg-gray-50 text-primary-600' : 'text-gray-700 hover:bg-gray-50'}`}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                  >
                    <span className={`whitespace-nowrap ${option.value === '' ? 'text-gray-400' : ''}`}>{option.label}</span>
                    {isSelected && <ICONS.Check className="w-4 h-4 text-primary-600 shrink-0 ml-2" />}
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          <div className="px-3 py-2 text-sm text-gray-400 text-center">
            无选项
          </div>
        )}
      </div>


    </div>
  );

  return (
    <div className={`relative ${className}`} ref={selectRef}>
      <div
        className={`flex items-center justify-between ${triggerClassName} ${disabled ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' : isOpen ? 'border-primary-500 ring-2 ring-primary-50 cursor-pointer' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 cursor-pointer'}`}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (disabled) return;
          if (!isOpen) updateDropdownPosition();
          setIsOpen(!isOpen);
        }}
      >
        <span className={`truncate min-w-0 flex items-center gap-2 ${(!selectedOption || selectedOption.value === '') ? 'text-gray-400' : 'text-gray-700'}`}>
          {selectedOption ? (
            <>
              {isModelSelector && selectedOption.icon && (
                <img src={selectedOption.icon} className="w-3.5 h-3.5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
              )}
              <span className="truncate text-xs">{selectedOption.label}</span>
              {isModelSelector && selectedOption.mode && (
                <span className="inline-flex items-center text-[8px] bg-slate-50 text-indigo-500 border border-slate-100 px-1 py-0.2 rounded-full uppercase scale-90 origin-left shrink-0 font-medium ml-1">
                  {selectedOption.mode}
                </span>
              )}
              {isModelSelector && selectedOption.isVision && (
                <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-slate-600 shrink-0 select-none scale-90 ml-0.5 shadow-sm">
                  <svg className="w-2 h-2 text-white fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 11.5c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  </svg>
                </span>
              )}
            </>
          ) : (
            placeholder
          )}
        </span>
        <ICONS.ChevronDown className={`w-4 h-4 shrink-0 shrink-0 ml-2 transition-transform duration-200 ${disabled ? 'text-gray-300' : 'text-gray-400'} ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && !disabled && (
        portal ? createPortal(dropdownContent, document.body) : dropdownContent
      )}
    </div>
  );
};
