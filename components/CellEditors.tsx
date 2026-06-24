
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ICONS, TAG_COLORS, TagColorKey, getTagColor } from '../constants';
import { Column, Row } from '../types';

export const AutoResizeTextarea = ({ value, onChange, placeholder, className, autoFocus, onFocus, onBlur, onKeyDown }: any) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustHeight = () => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = '1px';
            textarea.style.height = `${Math.max(textarea.scrollHeight, 36)}px`;
        }
    };

    useEffect(() => {
        adjustHeight();
        const timeoutId = setTimeout(adjustHeight, 300); // For initial render animation completion
        return () => clearTimeout(timeoutId);
    }, [value]);

    useEffect(() => {
        adjustHeight();
        window.addEventListener('resize', adjustHeight);
        return () => window.removeEventListener('resize', adjustHeight);
    }, []);

    return (
        <textarea
            ref={textareaRef}
            className={`${className} break-all whitespace-pre-wrap`}
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
                onChange(e);
                adjustHeight();
            }}
            autoFocus={autoFocus}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            rows={1}
            style={{ minHeight: '32px' }}
        />
    );
};

export const OptionColorPicker = ({ color, onChange, trigger }: { color: string, onChange: (color: string) => void, trigger?: React.ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, arrowLeft: '50%', isTop: false });

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (triggerRef.current?.contains(e.target as Node)) return;
            if (popoverRef.current?.contains(e.target as Node)) return;
            setIsOpen(false);
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                const popoverWidth = 256; // w-64 is 256px
                const popoverHeight = 160; // Approximate height
                
                let left = rect.left + rect.width / 2;
                let arrowLeft = '50%';
                
                if (left - popoverWidth / 2 < 8) {
                    const diff = (popoverWidth / 2) - left + 8;
                    left += diff;
                    arrowLeft = `calc(50% - ${diff}px)`;
                } else if (left + popoverWidth / 2 > window.innerWidth - 8) {
                    const diff = left + popoverWidth / 2 - (window.innerWidth - 8);
                    left -= diff;
                    arrowLeft = `calc(50% + ${diff}px)`;
                }
                
                let top = rect.bottom + 8;
                let isTop = false;
                if (top + popoverHeight > window.innerHeight - 8) {
                    top = rect.top - popoverHeight - 8;
                    isTop = true;
                }
                
                setCoords({ top, left, arrowLeft, isTop });
            }
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const colors = Object.keys(TAG_COLORS);

    return (
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
            <div 
                ref={triggerRef}
                className={trigger ? "cursor-pointer" : "w-4 h-4 rounded-full cursor-pointer hover:bg-black/5 flex items-center justify-center transition-colors"}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
            >
                {trigger || <ICONS.ChevronDown className="w-3 h-3 text-gray-500" />}
            </div>
            {isOpen && createPortal(
                <div 
                    ref={popoverRef}
                    style={{ top: coords.top, left: coords.left }}
                    className="fixed -translate-x-1/2 bg-white border border-gray-200 shadow-xl rounded-xl p-3 z-[10001] grid grid-cols-8 gap-2 w-64"
                >
                    <div 
                        className={`absolute -translate-x-1/2 w-3 h-3 bg-white border-gray-200 rotate-45 ${coords.isTop ? '-bottom-1.5 border-b border-r' : '-top-1.5 border-t border-l'}`}
                        style={{ left: coords.arrowLeft }}
                    ></div>
                    {colors.map(c => (
                        <div
                            key={c}
                            className={`w-5 h-5 rounded cursor-pointer border border-transparent hover:scale-110 transition-transform ${TAG_COLORS[c as TagColorKey].bg} ${color === c ? 'ring-2 ring-offset-1 ring-primary-500 border-primary-500' : ''}`}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onChange(c);
                                setIsOpen(false);
                            }}
                        />
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

export const SelectCellEditor = ({ 
    val, 
    col, 
    row, 
    onCellChange, 
    onColumnUpdate, 
    setActiveEditingCell,
    rect
}: { 
    val: any, 
    col: any, 
    row: any, 
    onCellChange: (rowId: string, colId: string, val: any) => void, 
    onColumnUpdate: (col: any) => void, 
    setActiveEditingCell: (cell: any) => void,
    rect?: DOMRect
}) => {
    const [search, setSearch] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const options = col.config?.options || [];
    const filteredOptions = options.filter((opt: string) => opt.toLowerCase().includes(search.toLowerCase()));

    useEffect(() => {
        if (listRef.current && highlightedIndex >= 0) {
            const element = listRef.current.children[highlightedIndex] as HTMLElement;
            if (element) {
                element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [highlightedIndex]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            setHighlightedIndex(prev => Math.min(prev + 1, filteredOptions.length));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            setHighlightedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            if (highlightedIndex === 0) {
                onCellChange(row.id, col.id, '');
                setActiveEditingCell(null);
            } else if (filteredOptions[highlightedIndex - 1]) {
                onCellChange(row.id, col.id, filteredOptions[highlightedIndex - 1]);
                setActiveEditingCell(null);
            }
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            setActiveEditingCell(null);
        }
    };

    useEffect(() => {
        setHighlightedIndex(0);
    }, [search]);

    const ESTIMATED_HEIGHT = 300;
    const shouldShowAbove = rect && (rect.bottom + ESTIMATED_HEIGHT > window.innerHeight);
    const top = rect ? (shouldShowAbove ? Math.max(8, rect.top - ESTIMATED_HEIGHT - 4) : Math.min(window.innerHeight - ESTIMATED_HEIGHT - 8, rect.bottom + 4)) : 0;
    const width = rect ? Math.max(rect.width, 240) : 240;
    const left = rect ? Math.min(rect.left, window.innerWidth - width - 8) : 0;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('.cell-editor-dropdown')) {
                setActiveEditingCell(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setActiveEditingCell]);

    const dropdown = (
        <div 
            className="fixed bg-white border border-gray-100 rounded-xl shadow-2xl z-[10000] p-2 min-w-[240px] ring-1 ring-black/5 cell-editor-dropdown"
            style={{ 
                top: top, 
                left: left,
                width: width
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="mb-2 px-1">
                <input 
                    type="text" 
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                    placeholder="查找或创建选项"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                />
            </div>
            <div 
                ref={listRef}
                className="space-y-0.5 max-h-60 overflow-y-auto custom-scrollbar border-t border-gray-100 pt-2"
            >
                <div 
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${highlightedIndex === 0 ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                    onClick={() => {
                        onCellChange(row.id, col.id, '');
                        setActiveEditingCell(null);
                    }}
                >
                    <span className="text-sm text-gray-500 italic">请选择...</span>
                </div>
                {filteredOptions.map((opt: string, idx: number) => {
                    const colorStyle = getTagColor(opt, col.config?.option_colors);
                    const isSelected = val === opt;
                    const isHighlighted = highlightedIndex === idx + 1;
                    return (
                        <div 
                            key={opt} 
                            className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-primary-50/50' : isHighlighted ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                            onClick={() => {
                                onCellChange(row.id, col.id, opt);
                                setActiveEditingCell(null);
                            }}
                        >
                            <div className={`flex items-center justify-between px-2 py-1 rounded-full text-xs ${colorStyle.bg} ${colorStyle.text} border ${isSelected ? 'border-primary-500' : 'border-transparent'} hover:border-primary-300 w-full`}>
                                <span className="truncate max-w-[150px]">{opt}</span>
                                <OptionColorPicker 
                                    color={col.config?.option_colors?.[opt] || 'gray'} 
                                    onChange={(color) => {
                                        onColumnUpdate({
                                            ...col,
                                            config: {
                                                ...col.config,
                                                option_colors: {
                                                    ...(col.config?.option_colors || {}),
                                                    [opt]: color
                                                }
                                            }
                                        });
                                    }} 
                                />
                            </div>
                        </div>
                    );
                })}
                {search && !options.includes(search) && (
                    <div 
                        className="flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-all hover:bg-gray-50"
                        onClick={() => {
                            onColumnUpdate({
                                ...col,
                                config: {
                                    ...col.config,
                                    options: [...options, '']
                                }
                            });
                            onCellChange(row.id, col.id, '');
                            setActiveEditingCell(null);
                        }}
                    >
                        <div className="flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800 border border-transparent hover:border-gray-300 w-full">
                            <span className="truncate max-w-[150px]">创建空选项</span>
                        </div>
                    </div>
                )}
                {filteredOptions.length === 0 && !search && (
                    <div className="text-xs text-gray-400 p-2 text-center">暂无选项</div>
                )}
            </div>
        </div>
    );

    return createPortal(
        dropdown,
        document.body
    );
};

export const MultiSelectCellEditor = ({ 
    val, 
    col, 
    row, 
    onCellChange, 
    onColumnUpdate, 
    setActiveEditingCell,
    rect
}: { 
    val: any, 
    col: any, 
    row: any, 
    onCellChange: (rowId: string, colId: string, val: any) => void, 
    onColumnUpdate: (col: any) => void, 
    setActiveEditingCell: (cell: any) => void,
    rect?: DOMRect
}) => {
    const [search, setSearch] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const options = col.config?.options || [];
    const filteredOptions = options.filter((opt: string) => opt.toLowerCase().includes(search.toLowerCase()));
    const selectedValues = Array.isArray(val) ? val : (val ? String(val).split(',') : []);

    useEffect(() => {
        if (listRef.current && highlightedIndex >= 0) {
            const element = listRef.current.children[highlightedIndex] as HTMLElement;
            if (element) {
                element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [highlightedIndex]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
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
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            const opt = filteredOptions[highlightedIndex];
            if (opt) {
                const newValues = selectedValues.includes(opt)
                    ? selectedValues.filter((v: string) => v !== opt)
                    : [...selectedValues, opt];
                onCellChange(row.id, col.id, newValues);
            }
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            setActiveEditingCell(null);
        }
    };

    useEffect(() => {
        setHighlightedIndex(0);
    }, [search]);

    const ESTIMATED_HEIGHT = 350;
    const shouldShowAbove = rect && (rect.bottom + ESTIMATED_HEIGHT > window.innerHeight);
    const top = rect ? (shouldShowAbove ? Math.max(8, rect.top - ESTIMATED_HEIGHT - 4) : Math.min(window.innerHeight - ESTIMATED_HEIGHT - 8, rect.bottom + 4)) : 0;
    const width = rect ? Math.max(rect.width, 240) : 240;
    const left = rect ? Math.min(rect.left, window.innerWidth - width - 8) : 0;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('.cell-editor-dropdown-multi')) {
                setActiveEditingCell(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setActiveEditingCell]);

    const dropdown = (
        <div 
            className="fixed bg-white border border-gray-100 rounded-xl shadow-2xl z-[10000] p-2 min-w-[240px] ring-1 ring-black/5 cell-editor-dropdown-multi"
            style={{ 
                top: top, 
                left: left,
                width: width
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="mb-2 px-1">
                <input 
                    type="text" 
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                    placeholder="查找或创建选项"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                />
            </div>
            <div 
                ref={listRef}
                className="space-y-0.5 max-h-60 overflow-y-auto custom-scrollbar border-t border-gray-100 pt-2"
            >
                {filteredOptions.map((opt: string, idx: number) => {
                    const colorStyle = getTagColor(opt, col.config?.option_colors);
                    const isSelected = selectedValues.includes(opt);
                    const isHighlighted = highlightedIndex === idx;
                    return (
                        <div key={opt} className={`flex items-center justify-between px-2 py-1.5 rounded-lg transition-all ${isSelected ? 'bg-primary-50/50' : isHighlighted ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                            <div className="flex items-center gap-2 cursor-pointer flex-1" onClick={() => {
                                const newValues = selectedValues.includes(opt)
                                    ? selectedValues.filter((v: string) => v !== opt)
                                    : [...selectedValues, opt];
                                onCellChange(row.id, col.id, newValues);
                            }}>
                                <input 
                                    type="checkbox"
                                    checked={isSelected}
                                    readOnly
                                    className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 pointer-events-none"
                                />
                                <div className={`flex items-center justify-between px-2 py-1 rounded-full text-xs ${colorStyle.bg} ${colorStyle.text} border ${isSelected ? 'border-primary-500' : 'border-transparent'} hover:border-primary-300 flex-1`}>
                                    <span className="truncate max-w-[150px]">{opt}</span>
                                </div>
                            </div>
                            <OptionColorPicker 
                                color={col.config?.option_colors?.[opt] || 'gray'} 
                                onChange={(color) => {
                                    onColumnUpdate({
                                        ...col,
                                        config: {
                                            ...col.config,
                                            option_colors: {
                                                ...(col.config?.option_colors || {}),
                                                [opt]: color
                                            }
                                        }
                                    });
                                }} 
                            />
                        </div>
                    );
                })}
                {search && !options.includes(search) && (
                    <div 
                        className="flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-all hover:bg-gray-50"
                        onClick={() => {
                            onColumnUpdate({
                                ...col,
                                config: {
                                    ...col.config,
                                    options: [...options, '']
                                }
                            });
                            onCellChange(row.id, col.id, [...selectedValues, '']);
                            setSearch('');
                        }}
                    >
                        <div className="flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800 border border-transparent hover:border-gray-300 w-full ml-6">
                            <span className="truncate max-w-[150px]">创建空选项</span>
                        </div>
                    </div>
                )}
                {filteredOptions.length === 0 && !search && (
                    <div className="text-xs text-gray-400 p-2 text-center">暂无选项</div>
                )}
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100 text-right">
                <button 
                    className="px-3 py-1 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 transition-colors"
                    onClick={() => setActiveEditingCell(null)}
                >
                    完成
                </button>
            </div>
        </div>
    );

    return createPortal(
        dropdown,
        document.body
    );
};
