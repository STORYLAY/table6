
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Column, Row, FieldType } from '../types';
import { evaluateFormula } from '../formulaUtils';
import { ICONS, FIELD_TYPE_ICONS, formatFieldValue, getTagColor, formatDateForInput, parseJsonArray, parseLinkValues } from '../constants';
import { api } from '../services/api';

import { Tooltip } from './Tooltip';
import LinkRecordDialog from './LinkRecordDialog';
import { AutoResizeTextarea } from './CellEditors';

interface CalendarViewProps {
  tableId: string;
  columns: Column[]; // 可见列
  allColumns: Column[]; // 所有列
  rows: Row[];
  dateFieldId?: string;
  endDateFieldId?: string;
  titleFieldId?: string;
  colorFieldId?: string;
  customColor?: string;
  onAddRow: (initialData: Record<string, any>, specificId?: string) => void;
  onDirectAddRow?: (data: Record<string, any>) => Promise<any>;
  onCellChange: (rowId: string, colId: string, value: any) => void;
  onDeleteRows: (rowIds: string[]) => void;
  onOpenComment: (rowId: string, colId: string) => void;
  onOpenDetail: (row: Row) => void;
  commentCounts?: Record<string, number>;
  searchKeyword?: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

// --- 组件：日期选择器弹窗 ---
const DatePickerPopup: React.FC<{
    currentDate: Date;
    onSelect: (date: Date) => void;
    onClose: () => void;
    position: { x: number, y: number } | null;
}> = ({ currentDate, onSelect, onClose, position }) => {
    const [viewYear, setViewYear] = useState(currentDate.getFullYear());
    
    // 渲染月份网格
    const months = Array.from({ length: 12 }, (_, i) => i);
    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

    useEffect(() => setPortalRoot(document.body), []);

    if (!position || !portalRoot) return null;

    const style: React.CSSProperties = {
        top: position.y + 5,
        left: position.x,
        position: 'fixed',
        zIndex: 99999
    };

    const content = (
        <div 
            className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72 animate-in fade-in zoom-in-95 duration-100"
            style={style}
            onClick={e => e.stopPropagation()}
        >
            <div className="flex justify-between items-center mb-4 px-1">
                <div className="text-sm font-medium text-gray-800 flex items-center gap-1 cursor-pointer hover:bg-gray-50 rounded px-1">
                    {viewYear}年 {currentDate.getMonth() + 1}月 <ICONS.ChevronDown />
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setViewYear(y => y - 1)} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={() => setViewYear(y => y + 1)} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-3 gap-y-4 gap-x-2">
                {months.map(m => {
                    const isSelected = m === currentDate.getMonth() && viewYear === currentDate.getFullYear();
                    return (
                        <button
                            key={m}
                            onClick={() => {
                                const newDate = new Date(currentDate);
                                newDate.setFullYear(viewYear);
                                newDate.setMonth(m);
                                onSelect(newDate);
                            }}
                            className={`
                                py-2 rounded-full text-sm font-medium transition-colors
                                ${isSelected ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}
                            `}
                        >
                            {m + 1}月
                        </button>
                    )
                })}
            </div>

            <div className="border-t border-gray-100 mt-4 pt-3 text-center">
                <button 
                    onClick={() => onSelect(new Date())}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                    今天
                </button>
            </div>
        </div>
    );
    return createPortal(content, portalRoot);
};

// --- 组件：编辑卡片弹窗内的文本输入 ---
const LocalTextInput: React.FC<{
    initialValue: string;
    onSave: (val: string) => void;
    className?: string;
    type?: 'text' | 'number' | 'url';
    isTextarea?: boolean;
}> = ({ initialValue, onSave, className, type = 'text', isTextarea = false }) => {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const handleBlur = () => {
        if (value !== initialValue) {
            onSave(value);
        }
    };

    if (isTextarea) {
        return (
            <AutoResizeTextarea 
                value={value} 
                onChange={(e: any) => setValue(e.target.value)} 
                onBlur={handleBlur}
                className={className}
            />
        );
    }

    return (
        <input 
            type={type} 
            value={value} 
            onChange={e => setValue(e.target.value)} 
            onBlur={handleBlur}
            className={className} 
        />
    );
};

// --- 组件：编辑卡片弹窗 ---
const CalendarCardPopup: React.FC<{
    row: Row;
    columns: Column[];
    dateFieldId: string;
    titleFieldId: string;
    onClose: () => void;
    onSave: (fieldId: string, val: any) => void;
    onEditLink: (row: Row, col: Column) => void;
    onOpenDetail: (row: Row) => void;
    position: { x: number, y: number } | null;
}> = ({ row, columns, dateFieldId, titleFieldId, onClose, onSave, onEditLink, onOpenDetail, position }) => {
    const titleCol = columns.find(c => c.id === titleFieldId) || columns[0];
    const [title, setTitle] = useState(formatFieldValue(row.data[titleCol.id], titleCol.type));

    if (!position) return null;

    const style: React.CSSProperties = {
        top: Math.min(position.y + 10, window.innerHeight - 400),
        left: Math.min(position.x, window.innerWidth - 300),
        position: 'fixed',
        zIndex: 100
    };

    const renderInput = (col: Column) => {
        const val = row.data[col.id];
        switch (col.type) {
            case FieldType.USER:
            case FieldType.DEPARTMENT:
                const items = Array.isArray(val) ? val : (val ? [val] : []);
                return (
                    <div className="flex flex-wrap gap-1">
                        {items.map((u: any, i: number) => (
                            <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-600 border border-purple-100 truncate max-w-[100px]">
                                {u.real_name || u.name || u.email || '未知项'}
                            </span>
                        ))}
                    </div>
                );
            case FieldType.SELECT:
                return (
                    <div className="flex flex-wrap gap-2 items-center">
                        {col.config?.options?.map(opt => {
                            const colorStyle = getTagColor(opt, col.config?.option_colors);
                            return (
                                <button
                                    key={opt}
                                    onClick={() => onSave(col.id, opt)}
                                    className={`text-xs px-2 py-1 rounded-full border transition-all ${val === opt ? `${colorStyle.bg} ${colorStyle.text} ${colorStyle.border} ring-1 ring-offset-1 ring-gray-300` : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    {opt}
                                </button>
                            );
                        })}
                    </div>
                );
            case FieldType.DATE:
                const includeTime = col.config?.format?.includes('HH') || col.format?.includes('HH');
                return <input type={includeTime ? "datetime-local" : "date"} value={formatDateForInput(val, includeTime)} onChange={e => onSave(col.id, e.target.value)} className="w-full text-sm bg-gray-50 border border-gray-200 rounded px-2 py-1.5 focus:bg-white focus:ring-1 focus:ring-primary-500 outline-none text-gray-700" />;
            case FieldType.NUMBER:
                return <LocalTextInput type="number" initialValue={val || ''} onSave={v => onSave(col.id, v)} className="w-full text-sm bg-gray-50 border border-gray-200 rounded px-2 py-1.5 focus:bg-white focus:ring-1 focus:ring-primary-500 outline-none text-gray-700" />;
            case FieldType.ATTACHMENT:
                const files = parseJsonArray(val);
                return (
                    <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                            {files.map((f: any, i: number) => (
                                <div key={i} className="relative w-16 h-16 rounded border border-gray-200 group bg-gray-50 flex items-center justify-center overflow-hidden">
                                    {f.url || f.path ? (
                                        (f.extension && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(f.extension.toLowerCase())) ? (
                                            <>
                                                <img src={f.url || api.getFileUrl(f.path)} className="w-full h-full object-cover" alt={f.filename || f.name} onError={(e) => { e.currentTarget.style.display='none'; if(e.currentTarget.nextElementSibling) { e.currentTarget.nextElementSibling.classList.remove('hidden'); e.currentTarget.nextElementSibling.classList.add('flex'); } }} />
                                                <div className="hidden flex-col items-center justify-center text-gray-400 w-full h-full p-1">
                                                    <ICONS.File className="w-6 h-6 mb-0.5 text-primary-500" />
                                                    <span className="text-[8px] font-medium uppercase truncate w-full text-center">{f.extension || f.name?.split('.').pop() || 'FILE'}</span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center text-gray-400">
                                                <ICONS.File className="w-6 h-6 mb-0.5 text-primary-500" />
                                                <span className="text-[8px] font-medium uppercase">{f.extension || f.name?.split('.').pop() || 'FILE'}</span>
                                            </div>
                                        )
                                    ) : (
                                        <div className="flex flex-col items-center justify-center text-gray-400">
                                            <ICONS.File className="w-6 h-6 mb-0.5 text-primary-500" />
                                            <span className="text-[8px] font-medium uppercase">{f.extension || f.name?.split('.').pop() || 'FILE'}</span>
                                        </div>
                                    )}
                                    
                                    {/* Delete Button */}
                                    <button 
                                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-white/80 hover:bg-white rounded-full flex items-center justify-center z-20 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newFiles = [...files];
                                            newFiles.splice(i, 1);
                                            onSave(col.id, newFiles);
                                        }}
                                        title="删除"
                                    >
                                        <ICONS.Close className="w-2.5 h-2.5 text-gray-600" />
                                    </button>
                                </div>
                            ))}
                            
                            {/* Upload Button */}
                            <div className="relative w-16 h-16 rounded border border-dashed border-gray-300 hover:border-primary-400 hover:bg-primary-50 transition-colors flex flex-col items-center justify-center text-gray-400 hover:text-primary-500 cursor-pointer">
                                <ICONS.Plus className="w-5 h-5" />
                                <span className="text-[10px] mt-1">上传</span>
                                <input 
                                    type="file"
                                    multiple
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    onChange={async (e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                            try {
                                                const newFiles = [];
                                                // Assuming api is available in scope or imported. 
                                                // Since CalendarCardPopup is defined in the same file as CalendarView which imports api, we need to make sure api is accessible.
                                                // It is imported at the top of CalendarView.tsx.
                                                for (const file of Array.from(e.target.files) as File[]) {
                                                    const res = await api.uploadFile(file);
                                                    if (res.data) {
                                                        newFiles.push(res.data);
                                                    }
                                                }
                                                onSave(col.id, [...files, ...newFiles]);
                                            } catch (err) {
                                                console.error('Upload failed', err);
                                            }
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                );
            case FieldType.FORMULA:
            case FieldType.LOOKUP:
            case FieldType.SEARCH_REFERENCE:
                let displayVal = val;
                
                if (col.type === FieldType.FORMULA) {
                    const formula = col.config?.formula || col.formula;
                    displayVal = evaluateFormula(formula || '', columns, row);
                } else {
                    displayVal = Array.isArray(val) ? val.map(v => typeof v === 'object' ? (v.name || v.id) : String(v)).join(', ') : String(val || '');
                }

                if (typeof displayVal === 'boolean') {
                    displayVal = displayVal ? 'TRUE' : 'FALSE';
                }
                return (
                    <div className="w-full text-sm bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-500 cursor-not-allowed font-mono min-h-[32px] flex items-center">
                        {String(displayVal !== undefined && displayVal !== null ? displayVal : '')}
                    </div>
                );
            case FieldType.LINK:
                const links = parseLinkValues(val);
                return (
                    <div 
                        className="flex flex-wrap gap-1 min-h-[30px] items-center cursor-pointer border border-gray-200 rounded px-2 py-1 bg-gray-50 hover:bg-white"
                        onClick={() => onEditLink(row, col)}
                    >
                        {links.length > 0 ? links.map((link: any, i: number) => (
                            <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-primary-50 text-primary-600 border border-primary-100 truncate max-w-[100px] flex items-center gap-1">
                                {link.name || link.id}
                                <span 
                                    className="hover:text-red-500 cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newValues = links.filter((_, idx) => idx !== i);
                                        onSave(col.id, newValues);
                                    }}
                                >×</span>
                            </span>
                        )) : <span className="text-gray-400 text-xs">点击关联记录</span>}
                    </div>
                );
            case FieldType.CHECKBOX:
                return (
                    <div className="flex items-center h-[34px]">
                        <input 
                            type="checkbox" 
                            checked={!!val} 
                            onChange={e => onSave(col.id, e.target.checked)} 
                            className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer"
                        />
                    </div>
                );
            case FieldType.HYPERLINK:
                return (
                    <div className="flex items-center gap-2">
                        <LocalTextInput type="url" initialValue={val || ''} onSave={v => onSave(col.id, v)} className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded px-2 py-1.5 focus:bg-white focus:ring-1 focus:ring-primary-500 outline-none text-gray-700" />
                        {val && (
                            <button 
                                onClick={() => window.open(String(val).startsWith('http') ? String(val) : `https://${val}`, '_blank')}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-200 transition-colors"
                                title="打开链接"
                            >
                                <ICONS.Link className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                );
            default:
                return <LocalTextInput isTextarea initialValue={val || ''} onSave={v => onSave(col.id, v)} className="w-full text-sm bg-gray-50 border border-gray-200 rounded px-2 py-1.5 focus:bg-white focus:ring-1 focus:ring-primary-500 outline-none text-gray-700 min-h-[32px]" />;
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-gray-100 w-[300px] flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden" style={style} onClick={e => e.stopPropagation()}>
             <div className="p-4 border-b border-gray-100 flex justify-between items-start bg-white sticky top-0 z-10">
                 <div className="flex-1 min-w-0 mr-2">
                     <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">{FIELD_TYPE_ICONS[titleCol.type]}<span>{titleCol.name}</span></div>
                     <Tooltip content={title || "未命名记录"}>
                      <div 
                          className="w-full text-base font-bold bg-transparent border-none p-0 outline-none text-gray-800 placeholder-gray-300 cursor-default text-left !pl-0 truncate"
                      >
                          {title || "未命名记录"}
                      </div>
                  </Tooltip>
                 </div>
                 <button onClick={() => { onClose(); onOpenDetail(row); }} className="text-xs text-gray-400 border border-gray-200 px-2 py-1 rounded-md hover:bg-gray-50 hover:text-gray-600 transition-colors flex items-center gap-1 shrink-0"><ICONS.Eye /> 查看</button>
             </div>
             <div className="p-4 space-y-4 max-h-[300px] overflow-y-auto">
                 <div className="group">
                     <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5 group-hover:text-primary-600 transition-colors">
                         <span className="opacity-70">{FIELD_TYPE_ICONS[titleCol.type]}</span>
                         <span>{titleCol.name}</span>
                     </div>{renderInput(titleCol)}
                 </div>
                 {columns.map(col => {
                     if (col.id === titleCol.id) return null;
                     return <div key={col.id} className="group"><div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5 group-hover:text-primary-600 transition-colors"><span className="opacity-70">{FIELD_TYPE_ICONS[col.type]}</span><span>{col.name}</span></div>{renderInput(col)}</div>
                 })}
             </div>
             <div className="bg-gray-50 p-2 text-center text-[10px] text-gray-400 border-t border-gray-100">点击外部区域关闭</div>
        </div>
    )
}

const CalendarView: React.FC<CalendarViewProps> = ({ 
    tableId, columns, allColumns, rows, dateFieldId, endDateFieldId, titleFieldId, colorFieldId, customColor, 
    onAddRow, onDirectAddRow, onCellChange, onDeleteRows, onOpenComment, onOpenDetail, commentCounts = {},
    searchKeyword, hasMore, isLoadingMore, onLoadMore
}) => {
  const targetDateCol = dateFieldId 
    ? allColumns.find(c => c.id === dateFieldId) 
    : allColumns.find(c => c.type === FieldType.DATE);

  const targetEndDateCol = endDateFieldId
    ? allColumns.find(c => c.id === endDateFieldId)
    : undefined;

  const targetTitleCol = titleFieldId
    ? allColumns.find(c => c.id === titleFieldId)
    : allColumns[0];

  // Highlight text helper
  const highlightText = (text: any) => {
      if (text === null || text === undefined || text === '') return null;
      const str = String(text);
      if (!searchKeyword || !str.toLowerCase().includes(searchKeyword.toLowerCase())) {
          return str;
      }
      
      const parts = str.split(new RegExp(`(${searchKeyword})`, 'gi'));
      return (
          <>
              {parts.map((part, i) => 
                  part.toLowerCase() === searchKeyword.toLowerCase() ? (
                      <span key={i} className="bg-[#ffec3d] text-black rounded-[2px] box-decoration-clone">{part}</span>
                  ) : part
              )}
          </>
      );
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'MONTH' | 'WEEK' | 'DAY'>('MONTH'); // 视图模式
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  
  const [datePickerPopupPos, setDatePickerPopupPos] = useState<{ x: number, y: number } | null>(null);
  
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number, y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, rowId: string } | null>(null);
  const [linkDialogState, setLinkDialogState] = useState<{
      isOpen: boolean;
      rowId: string;
      colId: string;
      targetTableId: string;
      initialValues: { id: string, name: string }[];
      title: string;
  } | null>(null);

  const handleLinkConfirm = (selectedRows: Row[], targetColumns: Column[]) => {
      if (!linkDialogState) return;
      const { rowId, colId } = linkDialogState;
      
      // Construct the value to save.
      // We store { id, name } where name is the primary column value.
      const primaryColId = targetColumns[0]?.id;
      
      const newValue = selectedRows.map(r => {
          // If it's a full row with data
          if ('data' in r && r.data && primaryColId) {
              return {
                  id: r.id,
                  name: r.data[primaryColId]
              };
          }
          // If it's a partial object (e.g. from initialValues)
          if ('name' in r) {
              return {
                  id: r.id,
                  name: (r as any).name
              };
          }
          // Fallback
          return {
              id: r.id,
              name: r.id
          };
      });
      
      onCellChange(rowId, colId, newValue);
      setLinkDialogState(null);
  };

  // 红线位置 (基于当前时间)
  const [timeIndicatorTop, setTimeIndicatorTop] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      const updateTime = () => {
          const now = new Date();
          const minutes = now.getHours() * 60 + now.getMinutes();
          const totalMinutes = 24 * 60;
          setTimeIndicatorTop((minutes / totalMinutes) * 100);
      };
      updateTime();
      const interval = setInterval(updateTime, 60000); // Update every minute
      return () => clearInterval(interval);
  }, []);

  // 滚动到当前时间
  useEffect(() => {
      if ((viewMode === 'WEEK' || viewMode === 'DAY') && scrollRef.current) {
          // 稍微往上滚一点，让红线在视野中间
          const containerHeight = scrollRef.current.scrollHeight;
          const scrollTo = (timeIndicatorTop / 100) * containerHeight - 300;
          scrollRef.current.scrollTop = scrollTo;
      }
  }, [viewMode, timeIndicatorTop]); // Run when switching views

  useEffect(() => {
      const handleClickOutside = () => {
          setEditingRowId(null);
          setIsDatePickerOpen(false);
          setContextMenu(null);
      };
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, rowId: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      const menuWidth = 160;
      const menuHeight = 150;
      const offsetBuffer = 20; // Add a small buffer to ensure it doesn't clip
      
      let x = e.clientX;
      let y = e.clientY;
      
      if (window.innerWidth - x < menuWidth + offsetBuffer) {
          x = window.innerWidth - menuWidth - offsetBuffer;
      }
      
      if (window.innerHeight - y < menuHeight + offsetBuffer) {
          y = window.innerHeight - menuHeight - offsetBuffer;
      }
      
      setContextMenu({ x: Math.max(0, x), y: Math.max(0, y), rowId });
      setEditingRowId(null); // Close edit popup if open
  };

  if (!targetDateCol) return <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50"><ICONS.Calendar /><p>当前表格没有日期字段。</p></div>;

  // --- 日期计算逻辑 ---
  const getDays = () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      
      if (viewMode === 'MONTH') {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0(Sun)
          const days = [];
          
          for (let i = 0; i < firstDayOfMonth; i++) {
              const d = new Date(year, month, -firstDayOfMonth + i + 1);
              const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              days.push({ day: null, dateObj: d, dateStr: localDateStr, isToday: false, isCurrentMonth: false });
          }
          
          for (let i = 1; i <= daysInMonth; i++) {
              const d = new Date(year, month, i);
              const localDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
              days.push({ day: i, dateObj: d, dateStr: localDateStr, isToday: isSameDate(d, new Date()), isCurrentMonth: true });
          }
          
          const trailingDays = (7 - (days.length % 7)) % 7;
          for (let i = 0; i < trailingDays; i++) {
              const d = new Date(year, month + 1, i + 1);
              const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              days.push({ day: null, dateObj: d, dateStr: localDateStr, isToday: false, isCurrentMonth: false });
          }
          
          return days;
      } else if (viewMode === 'WEEK') {
          const curr = new Date(currentDate);
          const first = curr.getDate() - curr.getDay(); // First day is the day of the month - the day of the week
          const days = [];
          for (let i = 0; i < 7; i++) {
              const next = new Date(curr.setDate(first + i));
              const localDateStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
              days.push({ day: next.getDate(), dateObj: new Date(next), dateStr: localDateStr, isToday: isSameDate(next, new Date()), isCurrentMonth: true });
              // Reset curr because setDate mutates
              curr.setTime(currentDate.getTime());
          }
          return days;
      } else {
          // DAY
          const localDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
          return [{ day: currentDate.getDate(), dateObj: currentDate, dateStr: localDateStr, isToday: isSameDate(currentDate, new Date()), isCurrentMonth: true }];
      }
  };

  function isSameDate(d1: Date, d2: Date) {
      return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  }

  const daysData = getDays();
  
  // 标题文本
  const getHeaderTitle = () => {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth() + 1;
      const d = currentDate.getDate();
      if (viewMode === 'DAY') return `${y}年${String(m).padStart(2, '0')}月${String(d).padStart(2, '0')}日 (周${['日','一','二','三','四','五','六'][currentDate.getDay()]})`;
      if (viewMode === 'WEEK') {
          const firstDay = daysData[0].dateObj!;
          const lastDay = daysData[6].dateObj!;
          return `${firstDay.getFullYear()}年${firstDay.getMonth()+1}月${firstDay.getDate()}日 - ${lastDay.getMonth()+1 === firstDay.getMonth()+1 ? '' : (lastDay.getFullYear() === firstDay.getFullYear() ? (lastDay.getMonth()+1)+'月' : lastDay.getFullYear()+'年'+(lastDay.getMonth()+1)+'月')}${lastDay.getDate()}日`;
      }
      return `${y}年${m}月`;
  }

  const getRowsForDate = (dateStr: string | null) => {
    if (!dateStr) return [];
    return rows.filter(row => {
        const val = row.data[targetDateCol.id];
        if (!val) return false;
        const formattedDate = formatDateForInput(val, false);
        
        if (targetEndDateCol) {
            const endVal = row.data[targetEndDateCol.id];
            if (endVal) {
                const formattedEndDate = formatDateForInput(endVal, false);
                let start = formattedDate;
                let end = formattedEndDate;
                if (start > end) {
                    start = formattedEndDate;
                    end = formattedDate;
                }
                return dateStr >= start && dateStr <= end;
            }
        }
        
        return formattedDate === dateStr;
    });
  };

  const handlePrev = () => {
      const d = new Date(currentDate);
      if (viewMode === 'MONTH') d.setMonth(d.getMonth() - 1);
      if (viewMode === 'WEEK') d.setDate(d.getDate() - 7);
      if (viewMode === 'DAY') d.setDate(d.getDate() - 1);
      setCurrentDate(d);
  };
  const handleNext = () => {
      const d = new Date(currentDate);
      if (viewMode === 'MONTH') d.setMonth(d.getMonth() + 1);
      if (viewMode === 'WEEK') d.setDate(d.getDate() + 7);
      if (viewMode === 'DAY') d.setDate(d.getDate() + 1);
      setCurrentDate(d);
  };
  const handleToday = () => setCurrentDate(new Date());

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 100;
      if (bottom && hasMore && !isLoadingMore && onLoadMore) {
          onLoadMore();
      }
  };

  const handleDayClick = async (e: React.MouseEvent, dateStr: string | null) => {
      if (!dateStr) return;
      e.stopPropagation();
      const initialData = { [targetDateCol.id]: dateStr };
      if (onDirectAddRow) {
          const newRow = await onDirectAddRow(initialData);
          if (newRow) {
              setEditingRowId(newRow.id);
              setPopupPos({ x: e.clientX, y: e.clientY });
          }
      } else {
          const newId = `r${Date.now()}`;
          onAddRow(initialData, newId);
          setEditingRowId(newId);
          setPopupPos({ x: e.clientX, y: e.clientY });
      }
  };

  const handleEventClick = (e: React.MouseEvent, rowId: string) => {
      e.stopPropagation();
      setEditingRowId(rowId);
      setPopupPos({ x: e.clientX, y: e.clientY });
  };

  const getEventStyle = (row: Row) => {
      if (colorFieldId) {
          const val = row.data[colorFieldId];
          const colorField = columns.find(c => c.id === colorFieldId);
          const colorStyle = getTagColor(val, colorField?.config?.option_colors);
          return { className: `bg-white border-l-4 ${colorStyle.border.replace('border-', 'border-l-')}`, isCustom: false };
      } else {
          const customBg = customColor || 'bg-primary-500';
          const borderColor = customBg.replace('bg-', 'border-');
          return { className: `bg-white border-l-4 ${borderColor.replace('500', '400')}`, isCustom: true, customColorClass: customBg };
      }
  };

  const editingRow = rows.find(r => r.id === editingRowId);
  const hours = Array.from({length: 24}, (_, i) => i);

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
      {/* Header */}
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0 z-10">
         <div className="flex items-center gap-4">
            <button onClick={handleToday} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-gray-700">今天</button>
            <div className="flex items-center gap-1">
                <button onClick={handlePrev} className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button onClick={handleNext} className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>
            
            <div className="relative">
                <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        if (!isDatePickerOpen) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setDatePickerPopupPos({ x: rect.left, y: rect.bottom });
                        }
                        setIsDatePickerOpen(!isDatePickerOpen); 
                    }}
                    className="flex items-center gap-1 text-base font-bold text-gray-800 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
                >
                    {getHeaderTitle()}
                    <ICONS.ChevronDown />
                </button>
                {isDatePickerOpen && (
                    <DatePickerPopup 
                        currentDate={currentDate} 
                        onSelect={(d) => { setCurrentDate(d); setIsDatePickerOpen(false); }}
                        onClose={() => setIsDatePickerOpen(false)}
                        position={datePickerPopupPos}
                    />
                )}
            </div>
         </div>
         
         <div className="flex items-center gap-3">
            {hasMore && (
                <button 
                    onClick={() => onLoadMore && onLoadMore()} 
                    disabled={isLoadingMore}
                    className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-primary-50 transition-colors"
                >
                    {isLoadingMore ? <span className="animate-pulse">加载中...</span> : '加载更多数据'}
                </button>
            )}
            <div className="flex items-center bg-gray-100 p-0.5 rounded-lg text-xs font-medium text-gray-500">
                {['DAY', 'WEEK', 'MONTH'].map(mode => (
                    <button 
                        key={mode}
                        onClick={() => setViewMode(mode as any)}
                        className={`px-3 py-1 rounded-md transition-all ${viewMode === mode ? 'bg-white shadow-sm text-gray-900' : 'hover:text-gray-900 hover:bg-gray-200/50'}`}
                    >
                        {mode === 'DAY' ? '日' : mode === 'WEEK' ? '周' : '月'}
                    </button>
                ))}
            </div>
         </div>
      </div>

      {/* View Content */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
          {viewMode === 'MONTH' ? (
              <>
                {/* Month Grid Header */}
                <div className="grid grid-cols-7 border-b border-gray-200 bg-white shrink-0">
                    {['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map(d => (
                    <div key={d} className="py-2 pl-2 text-left text-xs font-medium text-gray-400">{d}</div>
                    ))}
                </div>
                {/* Month Grid Body */}
                <div className="flex-1 flex flex-col overflow-y-auto scrollbar-hide bg-white" onScroll={handleScroll}>
                    {(() => {
                        const weeks = [];
                        for (let i = 0; i < daysData.length; i += 7) {
                            weeks.push(daysData.slice(i, i + 7));
                        }
                        
                        return weeks.map((week, wIdx) => {
                            if (!week || week.length === 0) return null;
                            const weekStartRaw = week[0].dateStr;
                            const weekEndRaw = week[6].dateStr;
                            if (!weekStartRaw || !weekEndRaw) return null;
                            const weekStart = weekStartRaw;
                            const weekEnd = weekEndRaw;
                            
                            const weekEvents = rows.filter(row => {
                                const val = row.data[targetDateCol.id];
                                if (!val) return false;
                                const formattedDate = formatDateForInput(val, false);
                                let start = formattedDate;
                                let end = formattedDate;

                                if (targetEndDateCol) {
                                    const endVal = row.data[targetEndDateCol.id];
                                    if (endVal) {
                                        const formattedEndDate = formatDateForInput(endVal, false);
                                        if (start > formattedEndDate) {
                                            start = formattedEndDate;
                                            end = formattedDate;
                                        } else {
                                            end = formattedEndDate;
                                        }
                                    }
                                }
                                return start <= weekEnd && end >= weekStart;
                            });

                            weekEvents.sort((a, b) => {
                                const getRange = (row: any) => {
                                    const val = row.data[targetDateCol.id];
                                    let start = formatDateForInput(val, false);
                                    let end = start;
                                    if (targetEndDateCol) {
                                        const endVal = row.data[targetEndDateCol.id];
                                        if (endVal) end = formatDateForInput(endVal, false);
                                    }
                                    return [start, end].sort();
                                };
                                const [aStart, aEnd] = getRange(a);
                                const [bStart, bEnd] = getRange(b);
                                
                                const aLen = new Date(aEnd).getTime() - new Date(aStart).getTime();
                                const bLen = new Date(bEnd).getTime() - new Date(bStart).getTime();
                                
                                if (bLen !== aLen) return bLen - aLen;
                                return aStart.localeCompare(bStart);
                            });

                            const levels: { [key: string]: any }[] = [];
                            const eventLayouts = weekEvents.map(row => {
                                const val = row.data[targetDateCol.id];
                                let start = formatDateForInput(val, false);
                                let end = start;
                                if (targetEndDateCol) {
                                    const endVal = row.data[targetEndDateCol.id];
                                    if (endVal) {
                                        let endD = formatDateForInput(endVal, false);
                                        if (start > endD) {
                                            start = endD;
                                            end = formatDateForInput(val, false);
                                        } else {
                                            end = endD;
                                        }
                                    }
                                }

                                let viewStart = start < weekStart ? weekStart : start;
                                let viewEnd = end > weekEnd ? weekEnd : end;
                                
                                const startCol = week.findIndex(d => d.dateStr === viewStart);
                                const endCol = week.findIndex(d => d.dateStr === viewEnd);
                                
                                let level = 0;
                                while (true) {
                                    let isFree = true;
                                    if (!levels[level]) levels[level] = [];
                                    const sC = Math.max(0, startCol);
                                    const eC = endCol === -1 ? 6 : endCol;
                                    for (let i = sC; i <= eC; i++) {
                                        if (levels[level][i]) {
                                            isFree = false;
                                            break;
                                        }
                                    }
                                    if (isFree) {
                                        for (let i = sC; i <= eC; i++) {
                                            levels[level][i] = true;
                                        }
                                        break;
                                    }
                                    level++;
                                }

                                return {
                                    row,
                                    startCol: Math.max(0, startCol),
                                    endCol: endCol === -1 ? 6 : endCol,
                                    level,
                                    isStart: start >= weekStart,
                                    isEnd: end <= weekEnd,
                                };
                            });

                            return (
                                <div key={wIdx} className="relative flex-1 min-h-[120px] flex flex-col border-b border-gray-100 group/week">
                                    {/* Grid background */}
                                    <div className="absolute inset-0 grid grid-cols-7 pointer-events-none z-0">
                                        {week.map((d, dIdx) => (
                                            <div key={dIdx} className={`border-r border-gray-100 ${!d.isCurrentMonth ? 'bg-gray-50/30' : 'bg-white'}`} />
                                        ))}
                                    </div>
                                    
                                    {/* Dates headers */}
                                    <div className="grid grid-cols-7 z-10 relative">
                                        {week.map((d, dIdx) => (
                                            <div 
                                                key={dIdx} 
                                                className="p-1.5 h-8 cursor-pointer flex justify-between items-start group/day"
                                                onClick={(e) => handleDayClick(e, d.dateStr)}
                                            >
                                                {d.day && (
                                                    <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full transition-colors ${d.isToday ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                                                        {d.day}
                                                    </span>
                                                )}
                                                {d.day && (
                                                    <button className="opacity-0 group-hover/day:opacity-100 text-gray-400 hover:text-primary-600 p-0.5"><ICONS.Plus className="w-3.5 h-3.5" /></button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Events relative positioning */}
                                    <div className="relative flex-1 z-10 mt-1 mb-2 min-h-[30px]" style={{ minHeight: `${levels.length * 28 + 10}px` }}>
                                        {eventLayouts.map((layout, i) => {
                                            const { row, startCol, endCol, level, isStart, isEnd } = layout;
                                            const title = targetTitleCol ? formatFieldValue(row.data[targetTitleCol.id], targetTitleCol.type) : '无标题';
                                            
                                            // Base colors
                                            let bgClass = "bg-primary-50 text-gray-700";
                                            let borderClass = "border-primary-500";
                                            
                                            if (colorFieldId) {
                                                const val = row.data[colorFieldId];
                                                const colorField = columns.find(c => c.id === colorFieldId);
                                                const colorStyle = getTagColor(val, colorField?.config?.option_colors);
                                                if (colorStyle.bg && colorStyle.bg !== "bg-gray-100") {
                                                    // Convert heavy tag colors to lighter ones for multi-day events
                                                    bgClass = colorStyle.bg.replace('100', '50').replace('500', '100');
                                                    borderClass = colorStyle.border || colorStyle.bg.replace('bg-', 'border-');
                                                }
                                            } else if (customColor) {
                                                bgClass = `${customColor.replace('500', '50')} text-${customColor.replace('500', '700')}`;
                                                borderClass = `border-${customColor.replace('500', '500')}`;
                                            }

                                            return (
                                                <div 
                                                    key={row.id}
                                                    onClick={(e) => handleEventClick(e, row.id)}
                                                    onContextMenu={(e) => handleContextMenu(e, row.id)}
                                                    // Set border explicitly so borderClass matching "border-XXX-500" gives color to the l-2 border
                                                    className={`absolute h-6 flex items-center px-2 cursor-pointer text-xs transition-colors hover:bg-opacity-80 ${bgClass} ${isStart ? 'rounded ml-1 border-l-2' : 'border-l-0 ml-0'} ${isEnd ? 'rounded mr-1' : 'rounded-none'} ${borderClass} font-medium`}

                                                    style={{
                                                        top: `${level * 28}px`,
                                                        left: `${(startCol / 7) * 100}%`,
                                                        width: `calc(${((endCol - startCol + 1) / 7) * 100}% - ${isStart ? 4 : 0}px - ${isEnd ? 4 : 0}px)`
                                                    }}
                                                >
                                                    <span className="truncate w-full">{highlightText(title) || <span className="italic opacity-50">无标题</span>}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        });
                    })()}
                </div>
              </>
          ) : (
              // Week / Day View
              <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex border-b border-gray-200 shrink-0">
                      <div className="w-14 shrink-0 border-r border-gray-100 bg-white"></div> {/* Time axis header */}
                      <div className={`flex-1 grid ${viewMode === 'WEEK' ? 'grid-cols-7' : 'grid-cols-1'}`}>
                          {daysData.map((d, i) => (
                              <div key={i} className={`py-3 text-center border-r border-gray-100 ${d.isToday ? 'bg-primary-50/30' : ''}`}>
                                  <div className={`text-xs font-bold ${d.isToday ? 'text-primary-600' : 'text-gray-700'}`}>
                                      {viewMode === 'WEEK' ? ['周日','周一','周二','周三','周四','周五','周六'][d.dateObj!.getDay()] : '今天'}
                                  </div>
                                  <div className={`text-xl mt-1 ${d.isToday ? 'text-primary-600' : 'text-gray-400'}`}>{d.day}</div>
                              </div>
                          ))}
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto relative bg-white" ref={scrollRef} onScroll={handleScroll}>
                      {/* Time Indicator Line */}
                      {(viewMode === 'WEEK' || viewMode === 'DAY') && (
                          <div 
                            className="absolute left-0 right-0 border-t-2 border-red-400 z-20 pointer-events-none flex items-center"
                            style={{ top: `${timeIndicatorTop}%` }}
                          >
                              <div className="w-14 text-[10px] text-red-500 font-bold bg-white pr-2 text-right -mt-2">
                                  {new Date().getHours()}:{String(new Date().getMinutes()).padStart(2, '0')}
                              </div>
                              <div className="w-2 h-2 bg-red-500 rounded-full -ml-1"></div>
                          </div>
                      )}

                      <div className="flex min-h-[1440px]"> {/* 24h * 60px/h */}
                          {/* Time Axis */}
                          <div className="w-14 shrink-0 border-r border-gray-100 bg-gray-50/30 text-xs text-gray-400 text-right pr-2 pt-2">
                              {hours.map(h => (
                                  <div key={h} className="h-[60px] -mt-2.5">
                                      {h}:00
                                  </div>
                              ))}
                          </div>
                          
                          {/* Columns */}
                          <div className={`flex-1 grid ${viewMode === 'WEEK' ? 'grid-cols-7' : 'grid-cols-1'} relative`}>
                              {/* Horizontal Lines */}
                              {hours.map(h => (
                                  <div key={h} className="absolute left-0 right-0 border-b border-gray-50 h-[60px]" style={{ top: h * 60 }}></div>
                              ))}

                              {daysData.map((d, colIdx) => {
                                  const dayRows = getRowsForDate(d.dateStr);
                                  return (
                                      <div key={colIdx} className="border-r border-gray-100 relative h-full group" onClick={(e) => handleDayClick(e, d.dateStr)}>
                                          {/* Render Events */}
                                          {dayRows.map(row => {
                                              const title = targetTitleCol ? formatFieldValue(row.data[targetTitleCol.id], targetTitleCol.type) : '无标题';
                                              const style = getEventStyle(row);
                                              
                                              let commentCount = 0;
                                              for (const key in commentCounts) {
                                                  if (key.startsWith(`${row.id}_`)) {
                                                      commentCount += commentCounts[key];
                                                  }
                                              }

                                              // Simple stacking: just list them at top for now or use created time? 
                                              // For real calendar, would parse time. Here assuming all day or sticking to top.
                                              return (
                                                  <div 
                                                      key={row.id}
                                                      onClick={(e) => handleEventClick(e, row.id)}
                                                      onContextMenu={(e) => handleContextMenu(e, row.id)}
                                                      className={`m-1 p-2 rounded shadow-sm cursor-pointer border text-xs bg-white hover:shadow-md transition-all relative ${style.className}`}
                                                  >
                                                      {commentCount > 0 && (
                                                          <div 
                                                              className="absolute top-0 right-0 w-0 h-0 border-t-[14px] border-t-yellow-400 border-l-[14px] border-l-transparent rounded-tr z-10" 
                                                              onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  onOpenComment(row.id, columns[0]?.id || allColumns[0].id);
                                                              }}
                                                          />
                                                      )}
                                                      <span className="font-bold">{highlightText(title)}</span>
                                                  </div>
                                              )
                                          })}
                                          {/* Hover Add Button */}
                                          <div className="absolute inset-0 bg-primary-50/0 group-hover:bg-primary-50/10 transition-colors pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-100">
                                              <div className="bg-primary-600 text-white rounded-full p-2 shadow-lg scale-90 group-hover:scale-100 transition-transform cursor-pointer pointer-events-auto" onClick={(e) => handleDayClick(e, d.dateStr)}>
                                                  <ICONS.Plus className="w-5 h-5"/>
                                              </div>
                                          </div>
                                      </div>
                                  )
                              })}
                          </div>
                      </div>
                  </div>
              </div>
          )}
      </div>

      {editingRowId && editingRow && (
          <CalendarCardPopup 
              row={editingRow}
              columns={columns}
              dateFieldId={targetDateCol.id}
              titleFieldId={targetTitleCol.id}
              onClose={() => setEditingRowId(null)}
              onSave={(fid, val) => onCellChange(editingRow.id, fid, val)}
              onOpenDetail={onOpenDetail}
              onEditLink={(row, col) => {
                  const targetTableId = col.config?.linked_table_id;
                  if (targetTableId) {
                      const val = row.data[col.id];
                      const values = Array.isArray(val) ? val : (val ? [val] : []);
                      const primaryColId = allColumns[0]?.id;
                      const rowTitle = primaryColId ? String(row.data[primaryColId] || row.id) : row.id;

                      setLinkDialogState({
                          isOpen: true,
                          rowId: row.id,
                          colId: col.id,
                          targetTableId,
                          initialValues: values,
                          title: rowTitle
                      });
                  } else {
                      alert('请先配置关联表');
                  }
              }}
              position={popupPos}
          />
      )}

      {linkDialogState && (
          <LinkRecordDialog
              isOpen={linkDialogState.isOpen}
              onClose={() => setLinkDialogState(null)}
              onConfirm={handleLinkConfirm}
              targetTableId={linkDialogState.targetTableId}
              sourceTableId={tableId}
              sourceRowId={linkDialogState.rowId}
              sourceColId={linkDialogState.colId}
              initialSelectedValues={linkDialogState.initialValues}
              title={`关联记录 - ${linkDialogState.title}`}
          />
      )}

      {contextMenu && (
        <div 
            className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-[100] w-40 text-sm"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
        >
            <div 
                className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700"
                onClick={() => {
                    const row = rows.find(r => r.id === contextMenu.rowId);
                    if (row && onOpenDetail) {
                        onOpenDetail(row);
                    }
                    setContextMenu(null);
                }}
            >
                <ICONS.Eye className="w-3.5 h-3.5" />
                查看详情
            </div>
            
            <div className="border-t border-gray-100 my-1"></div>

            <div 
                className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700"
                onClick={() => {
                    if (columns.length > 0) {
                        onOpenComment(contextMenu.rowId, columns[0].id);
                    }
                    setContextMenu(null);
                }}
            >
                <ICONS.Message className="w-3.5 h-3.5" />
                添加评论
            </div>

            <div className="border-t border-gray-100 my-1"></div>

            <div 
                className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700"
                onClick={() => {
                    if (targetDateCol) {
                        onCellChange(contextMenu.rowId, targetDateCol.id, null);
                    }
                    setContextMenu(null);
                }}
            >
                <ICONS.Calendar className="w-3.5 h-3.5" />
                清空日期
            </div>

            <div className="border-t border-gray-100 my-1"></div>

            <div 
                className="px-4 py-2 hover:bg-red-50 cursor-pointer flex items-center gap-2 text-red-600"
                onClick={() => {
                    onDeleteRows([contextMenu.rowId]);
                    setContextMenu(null);
                }}
            >
                <ICONS.Trash className="w-3.5 h-3.5" />
                删除记录
            </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
