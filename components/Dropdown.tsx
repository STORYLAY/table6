import React, { useState, useRef, useEffect } from 'react';
import { ICONS, TAG_COLORS, TagColorKey, getTagColor } from '../constants';
import { Tooltip } from './Tooltip';

interface DropdownProps {
  options: string[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  multiple?: boolean;
  colorMap?: Record<string, string>;
  onColorChange?: (option: string, color: string) => void;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  multiple = false,
  colorMap = {},
  onColorChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      if (currentValues.includes(option)) {
        onChange(currentValues.filter(v => v !== option));
      } else {
        onChange([...currentValues, option]);
      }
    } else {
      onChange(option);
      setIsOpen(false);
    }
  };

  const removeOption = (e: React.MouseEvent, option: string) => {
    e.stopPropagation();
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      onChange(currentValues.filter(v => v !== option));
    } else {
      onChange('');
    }
  };

  const selectedValues = Array.isArray(value) ? value : (value ? [value] : []);
  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));

  const renderTag = (val: string, isRemovable: boolean = false) => {
    const style = getTagColor(val, colorMap);
    
    return (
      <span key={val} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] border ${style.bg} ${style.text} ${style.border}`}>
        {val}
        {isRemovable && (
          <button 
            onClick={(e) => removeOption(e, val)}
            className={`hover:bg-black/10 rounded-full p-0.5 transition-colors`}
          >
            <ICONS.Close className="w-3 h-3" />
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className={`w-full min-h-[36px] px-3 py-2 bg-white border rounded-xl flex items-center justify-between transition-all duration-200 text-sm shadow-sm ${isOpen ? 'border-primary-500 ring-2 ring-primary-50 cursor-pointer' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 cursor-pointer'}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex flex-wrap gap-1.5 flex-1 overflow-hidden">
          {selectedValues.length > 0 ? (
            selectedValues.map(val => renderTag(val, true))
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>
        <ICONS.ChevronDown className={`w-4 h-4 shrink-0 ml-2 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary-500' : 'text-gray-400'}`} />
      </div>

      {isOpen && (
        <div className="absolute z-[100] w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-xl shadow-black/[0.04] overflow-hidden transform origin-top animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 border-b border-gray-50 bg-gray-50/50">
            <div className="relative flex items-center">
              <ICONS.Search className="absolute left-2.5 w-4 h-4 text-gray-400" />
              <input 
                type="text"
                className="w-full text-sm pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all placeholder-gray-400 shadow-sm"
                placeholder="查找或创建选项..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => {
                const isSelected = selectedValues.includes(option);
                const style = getTagColor(option, colorMap);
                const colorKey = colorMap[option] as TagColorKey;
                
                return (
                  <div
                    key={option}
                    className={`group relative px-2 py-1.5 cursor-pointer text-sm flex items-center justify-between rounded-lg transition-all duration-150 ${isSelected ? 'bg-primary-50/50' : 'hover:bg-gray-50'}`}
                    onClick={() => toggleOption(option)}
                  >
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] border ${style.bg} ${style.text} ${style.border}`}>
                      {option}
                    </span>
                    
                    <div className="flex items-center gap-2">
                      {isSelected && <ICONS.Check className="w-4 h-4 text-primary-600" />}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-3 text-sm text-gray-400 text-center">
                {searchTerm ? `按回车创建 "${searchTerm}"` : '无选项'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
