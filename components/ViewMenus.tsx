import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Column, FilterCondition, SortCondition, GroupCondition, ColorRule, RowHeight, FieldType, ApiOption } from '../types';
import { ICONS, FIELD_TYPE_ICONS, getTagColor } from '../constants';
import { api } from '../services/api';
import ConfirmDialog from './ConfirmDialog';
import { Select, SelectOption } from './Select';
import { UserSelector } from './UserSelector';

// 优化后的调色板
const COLORS = [
  { bg: 'bg-red-100', ring: 'ring-red-400', label: 'Rose' },
  { bg: 'bg-orange-100', ring: 'ring-orange-400', label: 'Orange' },
  { bg: 'bg-amber-100', ring: 'ring-amber-400', label: 'Amber' },
  { bg: 'bg-green-100', ring: 'ring-green-400', label: 'Green' },
  { bg: 'bg-teal-100', ring: 'ring-teal-400', label: 'Teal' },
  { bg: 'bg-primary-100', ring: 'ring-primary-400', label: 'Blue' },
  { bg: 'bg-indigo-100', ring: 'ring-indigo-400', label: 'Indigo' },
  { bg: 'bg-purple-100', ring: 'ring-purple-400', label: 'Purple' },
  { bg: 'bg-pink-100', ring: 'ring-pink-400', label: 'Pink' },
  { bg: 'bg-slate-100', ring: 'ring-slate-400', label: 'Gray' },
];

const COLOR_GRID = [
  ['bg-red-50', 'bg-orange-50', 'bg-amber-50', 'bg-lime-50', 'bg-green-50', 'bg-emerald-50', 'bg-cyan-50', 'bg-primary-50', 'bg-indigo-50', 'bg-purple-50', 'bg-slate-50'],
  ['bg-red-100', 'bg-orange-100', 'bg-amber-100', 'bg-lime-100', 'bg-green-100', 'bg-emerald-100', 'bg-cyan-100', 'bg-primary-100', 'bg-indigo-100', 'bg-purple-100', 'bg-slate-100'],
  ['bg-red-200', 'bg-orange-200', 'bg-amber-200', 'bg-lime-200', 'bg-green-200', 'bg-emerald-200', 'bg-cyan-200', 'bg-primary-200', 'bg-indigo-200', 'bg-purple-200', 'bg-slate-200'],
  ['bg-red-300', 'bg-orange-300', 'bg-amber-300', 'bg-lime-300', 'bg-green-300', 'bg-emerald-300', 'bg-cyan-300', 'bg-primary-300', 'bg-indigo-300', 'bg-purple-300', 'bg-slate-300'],
];

const ColorPickerPopover: React.FC<{
    rule: ColorRule;
    onChange: (key: keyof ColorRule, val: any) => void;
}> = ({ rule, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            // Calculate position: align right side of popover with right side of trigger (approx)
            // or align arrow to trigger.
            // Popover width = 340px.
            // Arrow is at right-3 (12px from right). Center of arrow ~20px from right.
            // Trigger center is rect.left + rect.width/2.
            // We want (popoverLeft + 340 - 20) = (rect.left + rect.width/2).
            // popoverLeft = rect.left + rect.width/2 - 320.
            
            // Let's try to align it so the arrow points to the trigger.
            // Trigger width is 24px (w-6). Center is 12px.
            // Arrow center is ~20px from right edge of popover.
            
            const popoverWidth = 340;
            const arrowCenterFromRight = 20;
            const triggerCenter = rect.left + rect.width / 2;
            
            let left = triggerCenter + arrowCenterFromRight - popoverWidth;
            
            // Ensure it doesn't go off screen
            if (left < 10) {
                left = 10;
            } else if (left + popoverWidth > window.innerWidth - 10) {
                left = window.innerWidth - popoverWidth - 10;
            }
            
            const popoverHeight = 250; // estimated height
            let top = rect.bottom + 8;
            if (top + popoverHeight > window.innerHeight - 10) {
                top = rect.top - popoverHeight - 8;
                if (top < 10) top = 10;
            }
            
            setPosition({
                top: top,
                left: left
            });
        }
        setIsOpen(!isOpen);
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            // Check if click is inside trigger or popover
            if (
                triggerRef.current && 
                triggerRef.current.contains(e.target as Node)
            ) {
                return;
            }
            if (
                popoverRef.current && 
                popoverRef.current.contains(e.target as Node)
            ) {
                return;
            }
            setIsOpen(false);
        };

        const handleScroll = () => {
             if (isOpen) setIsOpen(false);
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('scroll', handleScroll, true); // Capture scroll events from any container
            window.addEventListener('resize', handleScroll);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleScroll);
        };
    }, [isOpen]);

    return (
        <>
            <div 
                ref={triggerRef}
                className={`w-6 h-6 rounded border cursor-pointer ${rule.color}`}
                onClick={handleToggle}
            ></div>
            {isOpen && createPortal(
                <div 
                    ref={popoverRef}
                    data-modal-portal="true"
                    className="fixed bg-white shadow-xl border border-gray-100 rounded-xl p-4 z-[9999] w-[340px]"
                    style={{ top: position.top, left: position.left }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="absolute -top-2 right-3 w-4 h-4 bg-white border-t border-l border-gray-100 transform rotate-45"></div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-sm font-medium text-gray-800">颜色</span>
                        </div>
                        <div className="flex flex-col gap-2 mb-5">
                            {COLOR_GRID.map((row, rIdx) => (
                                <div key={rIdx} className="flex gap-2 justify-between">
                                    {row.map(c => (
                                        <div 
                                            key={c}
                                            className={`w-5 h-5 rounded cursor-pointer ${c} ${rule.color === c ? 'ring-2 ring-primary-500 ring-offset-1' : (rIdx === 0 ? 'border border-black/5' : '')} hover:scale-110 transition-transform`}
                                            onClick={() => onChange('color', c)}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={rule.isBold || false}
                                onChange={(e) => onChange('isBold', e.target.checked)}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4"
                            />
                            文字加粗
                        </label>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

const MenuContainer: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; width?: string }> = ({ title, onClose, children, width = 'w-80' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const overflowRight = rect.right - window.innerWidth;
        const overflowLeft = 0 - rect.left;
        
        if (overflowRight > 0) {
            containerRef.current.style.transform = `translateX(-${overflowRight + 16}px)`;
        } else if (overflowLeft > 0) {
            containerRef.current.style.transform = `translateX(${overflowLeft + 16}px)`;
        }
    }
  }, []);

  return (
  <div 
    ref={containerRef}
    onClick={(e) => e.stopPropagation()}
    className={`absolute top-full left-0 mt-2 ${width} bg-white rounded-2xl shadow-2xl border border-gray-100 z-[100] animate-in fade-in zoom-in-95 duration-100 p-5`}
  >
    <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-50">
      <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
        <ICONS.Close className="w-4 h-4" />
      </button>
    </div>
    <div className="space-y-4">
      {children}
    </div>
  </div>
  );
};

// --- 字段配置菜单 ---
export const FieldMenu: React.FC<{
    columns: Column[];
    visibleColumnIds?: string[];
    onClose: () => void;
    onEditColumn: (col: Column, pos?: { top: number, left: number }) => void;
    onAddColumn: (pos?: { top: number, left: number }) => void;
    onToggleVisibility: (colId: string) => void;
    onShowAll: () => void;
    onHideAll: () => void;
    onDeleteColumn: (colId: string) => void;
    onDeleteColumns?: (colIds: string[]) => void;
    onSort?: (sortedColumns: Column[]) => void;
}> = ({ 
  columns, 
  visibleColumnIds,
  onClose, 
  onEditColumn, 
  onAddColumn,
  onToggleVisibility,
  onShowAll,
  onHideAll,
  onDeleteColumn,
  onDeleteColumns,
  onSort
}) => {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isBatchDeleteMode, setIsBatchDeleteMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<string[]>([]);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const isVisible = (id: string) => !visibleColumnIds || visibleColumnIds.includes(id);

  const handleConfirmDelete = () => {
    if (deleteId) {
      onDeleteColumn(deleteId);
      setDeleteId(null);
    }
  };

  const handleConfirmBatchDelete = () => {
    if (selectedForDelete.length > 0 && onDeleteColumns) {
      onDeleteColumns(selectedForDelete);
      setSelectedForDelete([]);
      setIsBatchDeleteMode(false);
      setShowBatchDeleteConfirm(false);
    }
  };

  const toggleSelectForDelete = (id: string) => {
    setSelectedForDelete(prev => 
      prev.includes(id) ? prev.filter(colId => colId !== id) : [...prev, id]
    );
  };

  const selectAllForDelete = () => {
    // Cannot delete the first locked column
    const deletableIds = columns.slice(1).map(c => c.id);
    if (selectedForDelete.length === deletableIds.length) {
      setSelectedForDelete([]);
    } else {
      setSelectedForDelete(deletableIds);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (index === 0) return; // Cannot drag over locked column
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index || index === 0 || draggedIndex === 0) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newColumns = [...columns];
    const [draggedCol] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(index, 0, draggedCol);

    if (onSort) {
      onSort(newColumns);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <MenuContainer title={isBatchDeleteMode ? "批量删除字段" : "字段配置"} onClose={onClose} width="w-72">
        <div className="flex justify-between items-center mb-2 px-1">
             {isBatchDeleteMode ? (
               <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                 <input 
                   type="checkbox" 
                   checked={selectedForDelete.length > 0 && selectedForDelete.length === columns.length - 1}
                   onChange={selectAllForDelete}
                   className="rounded border-gray-300 text-red-500 focus:ring-red-500"
                 />
                 全选
               </label>
             ) : (
               <button onClick={() => setIsBatchDeleteMode(true)} className="text-xs text-red-500 hover:text-red-700">批量删除</button>
             )}
             
             <div className="flex gap-2">
               {isBatchDeleteMode ? (
                 <button onClick={() => { setIsBatchDeleteMode(false); setSelectedForDelete([]); }} className="text-xs text-gray-500 hover:text-gray-700">取消</button>
               ) : (
                 <>
                   <button onClick={onShowAll} className="text-xs text-primary-600 hover:text-primary-800">显示全部</button>
                   <button onClick={onHideAll} className="text-xs text-gray-500 hover:text-gray-700">隐藏全部</button>
                 </>
               )}
             </div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-1 custom-scrollbar max-h-[300px]">
           {columns.map((col, index) => {
             const visible = isVisible(col.id);
             const isLocked = index === 0;

             return (
               <div 
                 key={col.id} 
                 draggable={!isLocked && !isBatchDeleteMode}
                 onDragStart={(e) => handleDragStart(e, index)}
                 onDragOver={(e) => handleDragOver(e, index)}
                 onDrop={(e) => handleDrop(e, index)}
                 onDragEnd={handleDragEnd}
                 className={`flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 transition-all group relative rounded ${!visible && !isBatchDeleteMode ? 'opacity-50' : ''} ${dragOverIndex === index ? 'border-t-2 border-primary-500' : ''}`}
                 onClick={() => {
                   if (isBatchDeleteMode && !isLocked) {
                     toggleSelectForDelete(col.id);
                   }
                 }}
               >
                  {isBatchDeleteMode ? (
                    <div className="w-4 flex items-center justify-center shrink-0">
                      {!isLocked && (
                        <input 
                          type="checkbox" 
                          checked={selectedForDelete.includes(col.id)}
                          onChange={() => toggleSelectForDelete(col.id)}
                          className="rounded border-gray-300 text-red-500 focus:ring-red-500 pointer-events-none"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="w-4 flex items-center justify-center text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab shrink-0">
                      <ICONS.Height className="w-3 h-3 rotate-90" />
                    </div>
                  )}

                  <div className="w-5 h-5 flex items-center justify-center text-gray-500 shrink-0">
                     {FIELD_TYPE_ICONS[col.type] || <ICONS.Text className="w-4 h-4" />}
                  </div>
                  
                  <span className="flex-1 text-sm text-gray-700 truncate">{col.name}</span>

                  {isLocked && <ICONS.Lock className="w-3 h-3 text-gray-400 mr-1" />}

                  {!isBatchDeleteMode && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button 
                        onClick={(e) => { e.stopPropagation(); !isLocked && onToggleVisibility(col.id); }}
                        disabled={isLocked}
                        className={`p-1 rounded transition-colors ${isLocked ? 'invisible' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}
                      >
                        {visible ? <ICONS.Eye className="w-3.5 h-3.5" /> : <ICONS.EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          const target = e.currentTarget.parentElement || e.currentTarget;
                          const rect = target.getBoundingClientRect();
                          onEditColumn(col, { top: rect.bottom + 4, left: rect.left });
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
                      >
                        <ICONS.MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
               </div>
             )
           })}
        </div>

        <div className="pt-2 border-t border-gray-100 mt-2">
           {isBatchDeleteMode ? (
             <button 
               onClick={() => {
                 if (selectedForDelete.length > 0) {
                   setShowBatchDeleteConfirm(true);
                 }
               }}
               disabled={selectedForDelete.length === 0}
               className={`w-full py-2 rounded text-sm transition-colors flex items-center gap-2 px-2 justify-center ${selectedForDelete.length > 0 ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' : 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed'}`}
             >
               <ICONS.Trash className="w-4 h-4" /> 删除选中字段 ({selectedForDelete.length})
             </button>
           ) : (
             <button 
               onClick={(e) => {
                 const rect = e.currentTarget.getBoundingClientRect();
                 onAddColumn({ top: rect.bottom + 4, left: rect.left });
               }}
               className="w-full py-2 hover:bg-gray-50 text-gray-600 rounded text-sm transition-colors flex items-center gap-2 px-2 justify-center border border-dashed border-gray-300"
             >
               <ICONS.Plus className="w-4 h-4" /> 新增字段
             </button>
           )}
        </div>

      <ConfirmDialog 
        isOpen={!!deleteId}
        title="删除字段"
        message="确定要删除此字段吗？与该字段相关的所有数据将永久丢失，此操作无法撤销。"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteId(null)}
      />
      
      <ConfirmDialog 
        isOpen={showBatchDeleteConfirm}
        title="批量删除字段"
        message={`确定要删除选中的 ${selectedForDelete.length} 个字段吗？与这些字段相关的所有数据将永久丢失，此操作无法撤销。`}
        onConfirm={handleConfirmBatchDelete}
        onCancel={() => setShowBatchDeleteConfirm(false)}
      />
    </MenuContainer>
  );
};
const useFilterOperatorsMap = (columns: Column[], conditions: any[], columnIdKey: string) => {
    const [operatorsMap, setOperatorsMap] = useState<Record<string, ApiOption[]>>({});
    
    useEffect(() => {
        const requiredTypes = Array.from(new Set(conditions.map(c => {
            const columnId = c[columnIdKey] || c.fieldId;
            const col = columns.find(col => col.id === columnId);
            return col?.type;
        }).filter(Boolean))) as string[];
        
        requiredTypes.forEach(type => {
            if (!operatorsMap[type]) {
                // Set to an empty array temporarily to avoid multiple fetches
                setOperatorsMap(prev => ({ ...prev, [type]: [] })); 
                api.getFilterOperators(type).then(res => {
                    if (res.data && Array.isArray(res.data)) {
                        setOperatorsMap(prev => ({ ...prev, [type]: res.data }));
                    }
                }).catch(err => console.error(`Failed to load operators for ${type}`, err));
            }
        });
    }, [conditions, columns, operatorsMap]);

    return operatorsMap;
};

// 1. 调用接口 15 获取字段列表 (passed as prop 'columns' from App)
// 2. 调用接口 34 getFilterOperators 获取筛选条件选项
// 3. 输入值后 (onBlur/Enter) 且三项都填了，才调用接口 7 (via onChange prop -> App fetchRows)
export const FilterMenu: React.FC<{
    columns: Column[];
    filters: FilterCondition[];
    onChange: (filters: FilterCondition[]) => void;
    onClose: () => void;
    onSaveAsView?: () => void;
}> = ({ columns, filters, onChange, onClose, onSaveAsView }) => {
    const [defaultOperators, setDefaultOperators] = useState<ApiOption[]>([
        { label: '等于', value: 'eq' },
        { label: '不等于', value: 'neq' },
        { label: '包含', value: 'contains' },
        { label: '不包含', value: 'not_contains' },
        { label: '为空', value: 'is_empty' },
        { label: '不为空', value: 'is_not_empty' },
    ]);
    const [localFilters, setLocalFilters] = useState<FilterCondition[]>(filters);
    
    const lastFiltersRef = useRef(filters);
    const operatorsMap = useFilterOperatorsMap(columns, localFilters, 'column_id');
    
    // Sync props to local state when props change (e.g. view switch)
    useEffect(() => {
        if (JSON.stringify(filters) !== JSON.stringify(lastFiltersRef.current)) {
            setLocalFilters(filters);
            lastFiltersRef.current = filters;
        }
    }, [filters]);

    // Fetch operators from API is removed because we only want param specific results
    
    // Check if a filter is "complete" enough to trigger a fetch
    const isFilterComplete = (filter: FilterCondition) => {
        if (!filter.column_id) return false;
        if (!filter.operator) return false;
        
        // Unary operators don't need a value
        const unaryOperators = ['is_empty', 'is_not_empty', 'is_checked', 'is_not_checked'];
        if (unaryOperators.includes(filter.operator)) return true;

        // Binary operators need a value
        if (Array.isArray(filter.value)) return filter.value.length > 0;
        return filter.value !== undefined && filter.value !== '' && filter.value !== null;
    };

    const handleAdd = () => {
        if (columns.length === 0) return;
        const defaultOp = defaultOperators.length > 0 ? defaultOperators[0].value : 'eq';
        // Add locally and trigger onChange to persist draft
        const newFilter = { column_id: columns[0].id, operator: defaultOp, value: '', id: `f${Date.now()}` };
        const newFilters = [...localFilters, newFilter];
        setLocalFilters(newFilters);
        onChange(newFilters);
    };

    const handleRemove = (index: number) => {
        const newFilters = [...localFilters];
        newFilters.splice(index, 1);
        setLocalFilters(newFilters);
        // Trigger update immediately on remove
        onChange(newFilters);
    };

    const handleFilterChange = (index: number, key: keyof FilterCondition, val: any) => {
        const newFilters = [...localFilters];
        let updatedFilter = { ...newFilters[index], [key]: val };
        
        if (key === 'column_id') {
            const column = columns.find(c => c.id === val);
            if (column) {
                if ([FieldType.USER, FieldType.DEPARTMENT, FieldType.SELECT, FieldType.MULTI_SELECT].includes(column.type)) {
                    updatedFilter.value = [];
                } else {
                    updatedFilter.value = '';
                }
                
                let rowOps = operatorsMap[column.type] && operatorsMap[column.type].length > 0 ? operatorsMap[column.type] : defaultOperators;
                if (column.type === FieldType.ATTACHMENT) {
                    rowOps = rowOps.filter(o => ['is_empty', 'is_not_empty'].includes(o.value));
                }
                if (rowOps.length > 0) {
                    updatedFilter.operator = rowOps[0].value;
                }
            }
        }

        if (key === 'operator') {
            const column = columns.find(c => c.id === updatedFilter.column_id);
            if (column && (column.type === FieldType.USER || column.type === FieldType.DEPARTMENT)) {
                if (newFilters[index].operator === 'contains' && val !== 'contains') {
                    updatedFilter.value = [];
                }
            }
        }
        
        newFilters[index] = updatedFilter;
        
        setLocalFilters(newFilters);
        // Persist all changes immediately to avoid losing state on re-renders
        onChange(newFilters);
    };

    const getOperatorsForRow = (filterOrRule: any, columnIdKey: string = 'column_id') => {
        const colType = columns.find(c => c.id === filterOrRule[columnIdKey])?.type;
        let rowOps = colType && operatorsMap[colType] && operatorsMap[colType].length > 0 ? operatorsMap[colType] : defaultOperators;
        if (colType === FieldType.ATTACHMENT) {
            rowOps = rowOps.filter(o => ['is_empty', 'is_not_empty'].includes(o.value));
        }
        return rowOps;
    };

    return (
        <MenuContainer title="筛选" onClose={onClose} width="w-[480px]">
            {localFilters.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">暂无筛选条件</div>
            ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {localFilters.map((filter, idx) => (
                        <div key={filter.id || idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="text-xs text-gray-400 w-8 text-center shrink-0">
                                {idx === 0 ? '当' : '且'}
                            </div>
                            
                            {/* Column Select */}
                            <div className="w-32 shrink-0">
                                <Select
                                    portal={true}
                                    options={columns.map(c => ({ label: c.name, value: c.id }))}
                                    value={filter.column_id}
                                    onChange={(val) => handleFilterChange(idx, 'column_id', val)}
                                    triggerClassName="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none bg-white transition-all"
                                />
                            </div>

                            {/* Operator Select (from API) */}
                            <div className="w-24 shrink-0">
                                <Select
                                    portal={true}
                                    options={getOperatorsForRow(filter)}
                                    value={filter.operator}
                                    onChange={(val) => handleFilterChange(idx, 'operator', val)}
                                    triggerClassName="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none bg-white transition-all"
                                />
                            </div>

                            {/* Value Input (Buffered) */}
                            {/* Calls onChange only on Blur/Enter to trigger API Interface 7 */}
                            <FilterValueInput 
                                value={filter.value} 
                                onChange={(val) => handleFilterChange(idx, 'value', val)}
                                disabled={['is_empty', 'is_not_empty'].includes(filter.operator)}
                                column={columns.find(c => c.id === filter.column_id)}
                                columnType={columns.find(c => c.id === filter.column_id)?.type}
                                multi={getOperatorsForRow(filter).find(op => op.value === filter.operator)?.multi}
                            />

                            <button onClick={() => handleRemove(idx)} className="text-gray-400 hover:text-red-500 p-1">
                                <ICONS.Trash className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            
            <div className="flex justify-between items-center pt-2">
                <div className="flex gap-4">
                    <button onClick={handleAdd} className="text-xs flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium">
                        <ICONS.Plus className="w-3.5 h-3.5" /> 添加筛选条件
                    </button>
                    {localFilters.length > 0 && (
                        <button 
                            onClick={() => { setLocalFilters([]); onChange([]); }} 
                            className="text-xs text-gray-500 hover:text-red-600"
                        >
                            清空筛选
                        </button>
                    )}
                </div>
                {onSaveAsView && localFilters.length > 0 && (
                     <button onClick={onSaveAsView} className="text-xs text-gray-500 hover:text-primary-600 underline decoration-gray-300">
                        另存为新视图
                     </button>
                )}
            </div>
        </MenuContainer>
    );
};

const DepartmentSelector = ({
    value,
    onChange,
    onClose,
    multi = true,
    className = "absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 shadow-xl rounded-lg z-[100] flex flex-col overflow-hidden"
}: {
    value: any,
    onChange: (val: any) => void,
    onClose: () => void,
    multi?: boolean,
    className?: string
}) => {
    const [depts, setDepts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Normalize value to array
    const selectedDepts = useMemo(() => {
        let arr = Array.isArray(value) ? value : (value ? [value] : []);
        if (typeof value === 'string' && value.startsWith('[')) {
            try { arr = JSON.parse(value); } catch(e) {}
        }
        return arr.map(d => {
            if (typeof d === 'object' && d !== null) return d;
            return { id: d, name: 'Dept ' + d };
        });
    }, [value]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await api.getDepts();
                setDepts(res.data || []);
            } catch(e) { console.error(e); }
            setLoading(false);
        };
        load();
    }, []);

    const toggleDept = (dept: any) => {
        const exists = selectedDepts.find((d: any) => d.id === dept.dept_id);
        let newValue;
        if (multi) {
            if (exists) {
                newValue = selectedDepts.filter((d: any) => d.id !== dept.dept_id);
            } else {
                newValue = [...selectedDepts, { id: dept.dept_id, name: dept.dept_name }];
            }
        } else {
            if (exists) {
                newValue = [];
            } else {
                newValue = [{ id: dept.dept_id, name: dept.dept_name }];
            }
        }
        onChange(newValue);
    };

    return (
        <div 
            className={className}
            onClick={(e) => e.stopPropagation()}
            data-modal-portal="true"
        >
            <div className="max-h-60 overflow-y-auto py-1">
                {loading ? <div className="p-2 text-center text-gray-400 text-xs">加载中...</div> : (
                    depts.length > 0 ? depts.map(d => {
                        const isSel = selectedDepts.some((sel: any) => sel.id === d.dept_id);
                        return (
                            <div 
                                key={d.dept_id} 
                                className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm ${isSel ? 'bg-primary-50' : ''}`}
                                onClick={() => toggleDept(d)}
                            >
                                <ICONS.Building className={`w-4 h-4 ${isSel ? 'text-primary-600' : 'text-gray-400'}`} />
                                <span className="truncate flex-1 text-gray-700">{d.dept_name}</span>
                                {isSel && (
                                    <svg className="w-3 h-3 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                        );
                    }) : <div className="p-2 text-center text-gray-400 text-xs">无结果</div>
                )}
            </div>
        </div>
    );
};

const SelectSelector = ({
    value,
    options,
    onChange,
    multi = true,
    className = "w-full bg-white border border-gray-200 shadow-xl rounded-lg flex flex-col overflow-hidden"
}: {
    value: any,
    options: any[],
    onChange: (val: any) => void,
    multi?: boolean,
    className?: string
}) => {
    // Normalize value to array
    const selectedIds = useMemo(() => {
        let arr = Array.isArray(value) ? value : (value ? [value] : []);
        if (typeof value === 'string' && value.startsWith('[')) {
            try { arr = JSON.parse(value); } catch(e) {}
        }
        return arr.map(v => (typeof v === 'object' && v !== null) ? String(v.id || '') : String(v));
    }, [value]);

    const toggleOption = (optId: string) => {
        let newValue;
        if (multi) {
            if (selectedIds.includes(optId)) {
                newValue = selectedIds.filter(id => id !== optId);
            } else {
                newValue = [...selectedIds, optId];
            }
        } else {
            newValue = selectedIds.includes(optId) ? '' : optId;
        }
        onChange(newValue);
    };

    return (
        <div className={className} onClick={(e) => e.stopPropagation()} data-modal-portal="true">
            <div className="max-h-60 overflow-y-auto py-1">
                {options.length > 0 ? options.map((opt, idx) => {
                    const optId = String(typeof opt === 'object' ? (opt.id || '') : opt);
                    const optName = typeof opt === 'object' ? opt.name : opt;
                    const isSel = selectedIds.includes(optId);
                    return (
                        <div 
                            key={optId || idx} 
                            className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm ${isSel ? 'bg-primary-50' : ''}`}
                            onClick={() => toggleOption(optId)}
                        >
                            <div className={`w-2.5 h-2.5 rounded-full ${getTagColor(String(optName), undefined).bg} shrink-0`} />
                            <span className="truncate flex-1 text-gray-700">{String(optName)}</span>
                            {isSel && (
                                <svg className="w-3 h-3 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </div>
                    );
                }) : <div className="p-2 text-center text-gray-400 text-xs">无选项</div>}
            </div>
        </div>
    );
};

// Internal component to handle input buffering
const FilterValueInput: React.FC<{ 
    value: any, 
    onChange: (val: any) => void, 
    disabled?: boolean, 
    column?: Column,
    columnType?: FieldType,
    multi?: boolean
}> = ({ value, onChange, disabled, column, columnType, multi = true }) => {
    const [localValue, setLocalValue] = useState(value || '');
    const [isUserSelectorOpen, setIsUserSelectorOpen] = useState(false);
    const [isDeptSelectorOpen, setIsDeptSelectorOpen] = useState(false);
    const [isSelectSelectorOpen, setIsSelectSelectorOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState<{ top?: number, bottom?: number, left: number, width: number }>({ top: 0, left: 0, width: 0 });
    const [allMembers, setAllMembers] = useState<any[]>([]);
    const [allDepts, setAllDepts] = useState<any[]>([]);

    useEffect(() => {
        if (columnType === FieldType.USER) {
            api.getMembers().then(res => setAllMembers(res.accounts || [])).catch(console.error);
        } else if (columnType === FieldType.DEPARTMENT) {
            api.getDepts().then(res => setAllDepts(res.data || [])).catch(console.error);
        }
    }, [columnType]);

    // Sync local state if prop changes externally (e.g. filter reset)
    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    useEffect(() => {
        if ((isUserSelectorOpen || isDeptSelectorOpen || isSelectSelectorOpen) && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            
            // Calculate space below and above
            const spaceBelow = viewportHeight - rect.bottom;
            const spaceAbove = rect.top;
            
            // Decide whether to show above or below (assuming max-height ~300px for selector)
            const shouldShowAbove = spaceBelow < 300 && spaceAbove > spaceBelow;
            
            if (shouldShowAbove) {
                setDropdownPosition({
                    bottom: viewportHeight - rect.top + 4,
                    left: rect.left,
                    width: rect.width
                });
            } else {
                setDropdownPosition({
                    top: rect.bottom + 4,
                    left: rect.left,
                    width: rect.width
                });
            }
        }
    }, [isUserSelectorOpen, isDeptSelectorOpen, isSelectSelectorOpen]);

    const handleBlur = () => {
        // For arrays, we compare stringified versions to detect changes
        const isArray = Array.isArray(value) || Array.isArray(localValue);
        const hasChanged = isArray 
            ? JSON.stringify(localValue) !== JSON.stringify(value)
            : localValue !== value;

        if (hasChanged) {
            onChange(localValue);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur(); // Trigger blur to save
        }
    };

    if (disabled) {
        return <div className="flex-1 min-w-0 bg-gray-50 border border-gray-100 rounded px-2 py-1.5 h-[30px]" />;
    }

    if (columnType === FieldType.DEPARTMENT) {
        return (
            <div className="flex-1 min-w-0 relative" ref={triggerRef}>
                <div 
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 cursor-pointer bg-white hover:bg-gray-50 flex items-center min-h-[34px]"
                    onClick={() => setIsDeptSelectorOpen(true)}
                >
                    {(() => {
                        let arr = Array.isArray(value) ? value : (value ? [value] : []);
                        if (typeof value === 'string' && value.startsWith('[')) {
                            try { arr = JSON.parse(value); } catch(e) {}
                        }
                        const validArr = arr.filter(d => d !== null && d !== undefined && d !== '' && d !== '[]');
                        if (validArr.length > 0) {
                            return (
                                <div className="flex flex-wrap gap-1">
                                    {validArr.map((d: any, i: number) => {
                                        let display = d;
                                        if (typeof d === 'object') {
                                            display = d.name || d.id;
                                        } else {
                                            const dept = allDepts.find(x => x.dept_id === d);
                                            if (dept) {
                                                display = dept.dept_name;
                                            }
                                        }
                                        return (
                                            <span key={i} className="bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                                                {display}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newValue = validArr.filter((_, idx) => idx !== i);
                                                        onChange(newValue);
                                                    }}
                                                    className="hover:text-primary-900"
                                                >
                                                    <ICONS.Close className="w-2.5 h-2.5" />
                                                </button>
                                            </span>
                                        );
                                    })}
                                </div>
                            );
                        }
                        return <span className="text-gray-400">选择部门...</span>;
                    })()}
                </div>
                {isDeptSelectorOpen && createPortal(
                    <>
                        <div data-select-dropdown="true" className="fixed inset-0 z-[100000]" onClick={() => setIsDeptSelectorOpen(false)} />
                        <div 
                            data-select-dropdown="true"
                            style={{ 
                                position: 'fixed', 
                                ...(dropdownPosition.top !== undefined ? { top: dropdownPosition.top } : {}),
                                ...(dropdownPosition.bottom !== undefined ? { bottom: dropdownPosition.bottom } : {}),
                                left: dropdownPosition.left, 
                                width: 256, 
                                zIndex: 100001 
                            }}
                        >
                            <DepartmentSelector
                                value={value}
                                onChange={(val) => {
                                    onChange(val);
                                    if (!multi) setIsDeptSelectorOpen(false);
                                }}
                                onClose={() => setIsDeptSelectorOpen(false)}
                                multi={multi}
                                className="w-full bg-white border border-gray-200 shadow-xl rounded-lg flex flex-col overflow-hidden"
                            />
                        </div>
                    </>,
                    document.body
                )}
            </div>
        );
    }

    if (columnType === FieldType.USER) {
        return (
            <div className="flex-1 min-w-0 relative" ref={triggerRef}>
                <div 
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 cursor-pointer bg-white hover:bg-gray-50 flex items-center min-h-[34px]"
                    onClick={() => setIsUserSelectorOpen(true)}
                >
                    {(() => {
                        let arr = Array.isArray(value) ? value : (value ? [value] : []);
                        if (typeof value === 'string' && value.startsWith('[')) {
                            try { arr = JSON.parse(value); } catch(e) {}
                        }
                        const validArr = arr.filter(u => u !== null && u !== undefined && u !== '' && u !== '[]');
                        if (validArr.length > 0) {
                            return (
                                <div className="flex flex-wrap gap-1">
                                    {validArr.map((u: any, i: number) => {
                                        let display = u;
                                        if (typeof u === 'object') {
                                            display = u.real_name || u.name || u.id;
                                        } else {
                                            const member = allMembers.find(m => m.id === u);
                                            if (member) {
                                                display = member.real_name || member.name;
                                            }
                                        }
                                        return (
                                            <span key={i} className="bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                                                {display}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newValue = validArr.filter((_, idx) => idx !== i);
                                                        onChange(newValue);
                                                    }}
                                                    className="hover:text-primary-900"
                                                >
                                                    <ICONS.Close className="w-2.5 h-2.5" />
                                                </button>
                                            </span>
                                        );
                                    })}
                                </div>
                            );
                        }
                        return <span className="text-gray-400">选择用户...</span>;
                    })()}
                </div>
                {isUserSelectorOpen && createPortal(
                    <>
                        <div data-select-dropdown="true" className="fixed inset-0 z-[100000]" onClick={() => setIsUserSelectorOpen(false)} />
                        <div 
                            data-select-dropdown="true"
                            style={{ 
                                position: 'fixed', 
                                ...(dropdownPosition.top !== undefined ? { top: dropdownPosition.top } : {}),
                                ...(dropdownPosition.bottom !== undefined ? { bottom: dropdownPosition.bottom } : {}),
                                left: dropdownPosition.left, 
                                width: 256, 
                                zIndex: 100001 
                            }}
                        >
                            <UserSelector
                                value={value}
                                onChange={(val) => {
                                    onChange(val);
                                    if (!multi) setIsUserSelectorOpen(false);
                                }}
                                onClose={() => setIsUserSelectorOpen(false)}
                                multi={multi}
                                className="w-full bg-white border border-gray-200 shadow-xl rounded-lg flex flex-col overflow-hidden"
                            />
                        </div>
                    </>,
                    document.body
                )}
            </div>
        );
    }

    if (columnType === FieldType.SELECT || columnType === FieldType.MULTI_SELECT) {
        const options = column?.config?.options || [];
        return (
            <div className="flex-1 min-w-0 relative" ref={triggerRef}>
                <div 
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 cursor-pointer bg-white hover:bg-gray-50 flex items-center min-h-[34px]"
                    onClick={() => setIsSelectSelectorOpen(true)}
                >
                    {(() => {
                        let arr = Array.isArray(value) ? value : (value ? [value] : []);
                        if (typeof value === 'string' && value.startsWith('[')) {
                            try { arr = JSON.parse(value); } catch(e) {}
                        }
                        const validArr = arr.filter(v => v !== null && v !== undefined && v !== '' && v !== '[]');
                        if (validArr.length > 0) {
                            return (
                                <div className="flex flex-wrap gap-1">
                                    {validArr.map((v: any, i: number) => {
                                        const optId = String((typeof v === 'object' && v !== null) ? (v.id || '') : v);
                                        const opt = options.find((o: any) => String(typeof o === 'object' ? (o.id || '') : o) === optId);
                                        const optName = opt ? (typeof opt === 'object' ? opt.name : opt) : optId;
                                        return (
                                            <span key={i} className="bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                                                {String(optName)}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newValue = validArr.filter((_, idx) => idx !== i);
                                                        onChange(newValue);
                                                    }}
                                                    className="hover:text-primary-900"
                                                >
                                                    <ICONS.Close className="w-2.5 h-2.5" />
                                                </button>
                                            </span>
                                        );
                                    })}
                                </div>
                            );
                        }
                        return <span className="text-gray-400">选择选项...</span>;
                    })()}
                </div>
                {isSelectSelectorOpen && createPortal(
                    <>
                        <div data-select-dropdown="true" className="fixed inset-0 z-[100000]" onClick={() => setIsSelectSelectorOpen(false)} />
                        <div 
                            data-select-dropdown="true"
                            style={{ 
                                position: 'fixed', 
                                ...(dropdownPosition.top !== undefined ? { top: dropdownPosition.top } : {}),
                                ...(dropdownPosition.bottom !== undefined ? { bottom: dropdownPosition.bottom } : {}),
                                left: dropdownPosition.left, 
                                width: dropdownPosition.width || 200, 
                                zIndex: 100001 
                            }}
                        >
                            <SelectSelector
                                value={value}
                                options={options}
                                onChange={(val) => {
                                    onChange(val);
                                    if (!multi) setIsSelectSelectorOpen(false);
                                }}
                                multi={multi}
                            />
                        </div>
                    </>,
                    document.body
                )}
            </div>
        );
    }

    if (columnType === FieldType.DATE) {
        return (
            <input
                type="date"
                className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all h-[34px]"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
            />
        );
    }

    if (columnType === FieldType.CHECKBOX) {
        return (
            <div className="flex-1 min-w-0 flex items-center px-3 h-[34px] border border-gray-200 rounded-lg bg-white">
                <input
                    type="checkbox"
                    className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer"
                    checked={localValue === true || localValue === 'true'}
                    onChange={(e) => {
                        const val = e.target.checked;
                        setLocalValue(val);
                        onChange(val);
                    }}
                />
            </div>
        );
    }

    return (
        <input
            type="text"
            className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all h-[34px]"
            placeholder="输入值..."
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
        />
    );
};


// --- 排序菜单 (Updated) ---
// 1. 调用接口 35 getSortOrders 获取排序选项
export const SortMenu: React.FC<{
    columns: Column[];
    sorts: SortCondition[];
    onChange: (sorts: SortCondition[]) => void;
    onClose: () => void;
    onSaveAsView?: () => void;
}> = ({ columns, sorts, onChange, onClose, onSaveAsView }) => {
    const [localSorts, setLocalSorts] = useState<SortCondition[]>(sorts);
    const lastSortsRef = useRef(sorts);
    const [sortOrders, setSortOrders] = useState<ApiOption[]>([]);

    // Fetch sort orders from API
    useEffect(() => {
        api.getSortOrders().then(res => {
            if (res.data) setSortOrders(res.data);
        }).catch(err => {
            console.error("Failed to load sort orders", err);
            // Fallback defaults
            setSortOrders([
                { label: '升序', value: 'asc' },
                { label: '降序', value: 'desc' }
            ]);
        });
    }, []);
    
    useEffect(() => {
        if (JSON.stringify(sorts) !== JSON.stringify(lastSortsRef.current)) {
            setLocalSorts(sorts);
            lastSortsRef.current = sorts;
        }
    }, [sorts]);

    const handleAdd = () => {
        if (columns.length === 0) return;
        const defaultOrder = sortOrders.length > 0 ? (sortOrders[0].value as 'asc' | 'desc') : 'asc';
        const newSorts = [...localSorts, { column_id: columns[0].id, order: defaultOrder, id: `s${Date.now()}` }];
        setLocalSorts(newSorts);
        onChange(newSorts);
    };

    const handleRemove = (index: number) => {
        const newSorts = [...localSorts];
        newSorts.splice(index, 1);
        setLocalSorts(newSorts);
        onChange(newSorts);
    };

    const handleSortChange = (index: number, key: keyof SortCondition, val: any) => {
        const newSorts = [...localSorts];
        newSorts[index] = { ...newSorts[index], [key]: val };
        setLocalSorts(newSorts);
        onChange(newSorts);
    };

    return (
        <MenuContainer title="排序" onClose={onClose} width="w-[420px]">
            {localSorts.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">暂无排序规则</div>
            ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {localSorts.map((sort, idx) => (
                        <div key={sort.id || idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="text-xs text-gray-400 w-12 text-center shrink-0">
                                {idx === 0 ? '主要' : '次要'}
                            </div>
                            <div className="flex-1">
                                <Select
                                    portal={true}
                                    options={columns.map(c => ({ label: c.name, value: c.id }))}
                                    value={sort.column_id}
                                    onChange={(val) => handleSortChange(idx, 'column_id', val)}
                                    triggerClassName="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none bg-white transition-all"
                                />
                            </div>
                            <div className="w-24 shrink-0">
                                <Select
                                    portal={true}
                                    options={sortOrders}
                                    value={sort.order}
                                    onChange={(val) => handleSortChange(idx, 'order', val)}
                                    triggerClassName="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none bg-white transition-all"
                                />
                            </div>
                            <button onClick={() => handleRemove(idx)} className="text-gray-400 hover:text-red-500 p-1">
                                <ICONS.Trash className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex justify-between items-center pt-2">
                <div className="flex gap-4">
                    <button onClick={handleAdd} className="text-xs flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium">
                        <ICONS.Plus className="w-3.5 h-3.5" /> 添加排序
                    </button>
                    {localSorts.length > 0 && (
                        <button 
                            onClick={() => onChange([])} 
                            className="text-xs text-gray-500 hover:text-red-600"
                        >
                            清空排序
                        </button>
                    )}
                </div>
                {onSaveAsView && sorts.length > 0 && (
                     <button onClick={onSaveAsView} className="text-xs text-gray-500 hover:text-primary-600 underline decoration-gray-300">
                        另存为新视图
                     </button>
                )}
            </div>
        </MenuContainer>
    );
};


// --- 分组菜单 (简单版 - 用于看板) ---
export const SimpleGroupMenu: React.FC<{
    columns: Column[];
    groups?: GroupCondition[];
    onChange: (groups: GroupCondition[]) => void;
    onClose: () => void;
    onSaveAsView?: () => void;
}> = ({ columns, groups = [], onChange, onClose, onSaveAsView }) => {
    const currentGroupId = groups[0]?.column_id;

    const handleSelect = (colId: string) => {
        if (currentGroupId === colId) {
            // Toggle off if already selected? Or just keep it? Usually single select allows switching.
            // If clicking same, maybe clear? Let's assume switching.
            // If user wants to clear, maybe add a clear option or clicking selected clears it.
            onChange([]);
        } else {
            onChange([{ column_id: colId, order: 'asc' }]);
        }
    };

    return (
        <MenuContainer title="选择分组依据" onClose={onClose} width="w-[240px]">
            <div className="py-1">
                {columns.map(c => (
                    <button
                        key={c.id}
                        onClick={() => handleSelect(c.id)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 rounded-md ${currentGroupId === c.id ? 'text-primary-600 bg-primary-50' : 'text-gray-700'}`}
                    >
                        {/* Icon placeholder based on type */}
                        <span className="text-gray-400">
                            {c.type === FieldType.SELECT && <ICONS.List className="w-4 h-4" />}
                            {c.type === FieldType.TEXT && <ICONS.Text className="w-4 h-4" />}
                        </span>
                        <span className="flex-1 truncate">{c.name}</span>
                        {currentGroupId === c.id && <ICONS.Check className="w-4 h-4" />}
                    </button>
                ))}
            </div>
            {onSaveAsView && groups.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex justify-end">
                    <button onClick={onSaveAsView} className="text-xs text-gray-500 hover:text-primary-600 underline decoration-gray-300">
                        另存为新视图
                    </button>
                </div>
            )}
        </MenuContainer>
    );
};

// --- 分组菜单 ---
export const GroupMenu: React.FC<{
    columns: Column[];
    groups?: GroupCondition[];
    onChange: (groups: GroupCondition[]) => void;
    onClose: () => void;
    onSaveAsView?: () => void;
}> = ({ columns, groups = [], onChange, onClose, onSaveAsView }) => {
    const [localGroups, setLocalGroups] = useState<GroupCondition[]>(groups);
    const lastGroupsRef = useRef(groups);
    
    useEffect(() => {
        if (JSON.stringify(groups) !== JSON.stringify(lastGroupsRef.current)) {
            setLocalGroups(groups);
            lastGroupsRef.current = groups;
        }
    }, [groups]);

    const handleRemoveGroup = (index: number) => {
        const newGroups = [...localGroups];
        newGroups.splice(index, 1);
        setLocalGroups(newGroups);
        onChange(newGroups);
    };

    const handleGroupChange = (index: number, key: keyof GroupCondition, val: any) => {
        const newGroups = [...localGroups];
        newGroups[index] = { ...newGroups[index], [key]: val };
        setLocalGroups(newGroups);
        onChange(newGroups);
    };

    const handleAddGroup = () => {
        if (columns.length === 0) return;
        const newGroups = [...localGroups, { column_id: columns[0].id, order: 'asc' }];
        setLocalGroups(newGroups);
        onChange(newGroups);
    };

    return (
        <MenuContainer title="设置分组条件" onClose={onClose} width="w-[420px]">
            {localGroups.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">暂无分组条件</div>
            ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {localGroups.map((group, idx) => {
                        const col = columns.find(c => c.id === group.column_id);
                        const isText = col?.type === FieldType.TEXT;
                        
                        return (
                            <div key={idx} className="flex items-center gap-3">
                                <div className="text-gray-400 cursor-grab hover:text-gray-600 shrink-0">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                                </div>
                                
                                {/* Column Select */}
                                <div className="w-36 shrink-0">
                                    <Select
                                        portal={true}
                                        options={columns.map(c => ({ label: c.name, value: c.id }))}
                                        value={group.column_id}
                                        onChange={(val) => handleGroupChange(idx, 'column_id', val)}
                                        triggerClassName="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-primary-500 outline-none bg-white"
                                    />
                                </div>

                                {/* Order Select */}
                                <div className="flex flex-1 bg-gray-100 rounded-md p-0.5 shrink-0 border border-gray-200">
                                    <button
                                        onClick={() => handleGroupChange(idx, 'order', 'asc')}
                                        className={`flex-1 text-center py-1 text-xs rounded-sm transition-colors ${group.order === 'asc' ? 'bg-white shadow-sm text-primary-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        {isText ? 'A → Z' : '选项顺序'}
                                    </button>
                                    <button
                                        onClick={() => handleGroupChange(idx, 'order', 'desc')}
                                        className={`flex-1 text-center py-1 text-xs rounded-sm transition-colors ${group.order === 'desc' ? 'bg-white shadow-sm text-primary-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        {isText ? 'Z → A' : '选项倒序'}
                                    </button>
                                </div>

                                {/* Remove Button */}
                                <button 
                                    onClick={() => handleRemoveGroup(idx)}
                                    className="p-1 text-gray-400 hover:text-gray-600 rounded shrink-0"
                                >
                                    <ICONS.Close className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
            <div className="flex justify-between items-center pt-2">
                <div className="flex gap-4">
                    <button onClick={handleAddGroup} className="text-xs flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium">
                        <ICONS.Plus className="w-3.5 h-3.5" /> 添加分组
                    </button>
                    {localGroups.length > 0 && (
                        <button 
                            onClick={() => onChange([])} 
                            className="text-xs text-gray-500 hover:text-red-600"
                        >
                            清空分组
                        </button>
                    )}
                </div>
                
                {onSaveAsView && localGroups.length > 0 && (
                     <button onClick={onSaveAsView} className="text-xs text-gray-500 hover:text-primary-600 underline decoration-gray-300">
                        另存为新视图
                     </button>
                )}
            </div>
        </MenuContainer>
    );
};

// --- 颜色菜单 ---
export const ColorMenu: React.FC<{
    columns: Column[];
    rules: ColorRule[];
    onChange: (rules: ColorRule[]) => void;
    onClose: () => void;
    onSaveAsView?: () => void;
}> = ({ columns, rules, onChange, onClose, onSaveAsView }) => {
    const [defaultOperators, setDefaultOperators] = useState<ApiOption[]>([
        { label: '等于', value: 'eq' },
        { label: '不等于', value: 'neq' },
        { label: '包含', value: 'contains' },
        { label: '不包含', value: 'not_contains' },
        { label: '为空', value: 'is_empty' },
        { label: '不为空', value: 'is_not_empty' },
    ]);
    const [localRules, setLocalRules] = useState<ColorRule[]>(rules);
    const lastRulesRef = useRef(rules);
    const operatorsMap = useFilterOperatorsMap(columns, localRules, 'fieldId');
    
    useEffect(() => {
        if (JSON.stringify(rules) !== JSON.stringify(lastRulesRef.current)) {
            setLocalRules(rules);
            lastRulesRef.current = rules;
        }
    }, [rules]);

    // Fetch operators from API is removed because we only want param specific results

    const handleAdd = () => {
        if (columns.length === 0) return;
        const defaultOp = defaultOperators.length > 0 ? defaultOperators[0].value : 'eq';
        const newRules = [...localRules, { id: `cr${Date.now()}`, fieldId: columns[0].id, operator: defaultOp, value: '', color: 'bg-red-100' }];
        setLocalRules(newRules);
        onChange(newRules);
    };

    const handleRemove = (index: number) => {
        const newRules = [...localRules];
        newRules.splice(index, 1);
        setLocalRules(newRules);
        onChange(newRules);
    };

    const handleChange = (index: number, key: keyof ColorRule, val: any) => {
        const newRules = [...localRules];
        let updatedRule = { ...newRules[index], [key]: val };
        
        if (key === 'fieldId') {
            const column = columns.find(c => c.id === val);
            if (column && [FieldType.USER, FieldType.DEPARTMENT, FieldType.SELECT, FieldType.MULTI_SELECT].includes(column.type)) {
                updatedRule.value = [];
            } else {
                updatedRule.value = '';
            }
        }

        if (key === 'operator') {
            const column = columns.find(c => c.id === updatedRule.fieldId);
            if (column && (column.type === FieldType.USER || column.type === FieldType.DEPARTMENT)) {
                if (newRules[index].operator === 'contains' && val !== 'contains') {
                    updatedRule.value = [];
                }
            }
        }
        
        newRules[index] = updatedRule;
        setLocalRules(newRules);
        onChange(newRules);
    };

    const getOperatorsForRow = (rule: ColorRule) => {
        const colType = columns.find(c => c.id === rule.fieldId)?.type;
        let rowOps = colType && operatorsMap[colType] && operatorsMap[colType].length > 0 ? operatorsMap[colType] : defaultOperators;
        
        // Ensure we always have some options if defaults aren't loaded yet
        if (rowOps.length === 0) {
            rowOps = [
                { label: '等于', value: 'eq' },
                { label: '不等于', value: 'neq' },
                { label: '包含', value: 'contains' },
                { label: '为空', value: 'is_empty' },
                { label: '不为空', value: 'is_not_empty' }
            ];
        }
        
        if (colType === FieldType.ATTACHMENT) {
            rowOps = rowOps.filter(o => ['is_empty', 'is_not_empty'].includes(o.value));
        }
        return rowOps;
    };

    return (
        <MenuContainer title="颜色规则" onClose={onClose} width="w-[500px]">
            {localRules.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">暂无颜色规则</div>
            ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {localRules.map((rule, idx) => (
                        <div key={rule.id} className="flex items-center gap-2 bg-gray-50 p-2 rounded border border-gray-100">
                            <div className="w-28 shrink-0">
                                <Select
                                    portal={true}
                                    options={columns.map(c => ({ label: c.name, value: c.id }))}
                                    value={rule.fieldId}
                                    onChange={(val) => handleChange(idx, 'fieldId', val)}
                                    triggerClassName="w-full text-xs border border-gray-200 rounded px-2 py-1 outline-none bg-white"
                                />
                            </div>
                            <div className="w-24 shrink-0">
                                <Select
                                    portal={true}
                                    options={getOperatorsForRow(rule)}
                                    value={rule.operator}
                                    onChange={(val) => handleChange(idx, 'operator', val)}
                                    triggerClassName="w-full text-xs border border-gray-200 rounded px-2 py-1 outline-none bg-white"
                                />
                            </div>
                            
                            <FilterValueInput 
                                value={rule.value} 
                                onChange={(val) => handleChange(idx, 'value', val)}
                                disabled={['is_empty', 'is_not_empty', 'isEmpty', 'isNotEmpty'].includes(rule.operator)}
                                column={columns.find(c => c.id === rule.fieldId)}
                                columnType={columns.find(c => c.id === rule.fieldId)?.type}
                                multi={getOperatorsForRow(rule).find(op => op.value === rule.operator)?.multi}
                            />
                            
                            {/* Color Picker Popover */}
                            <ColorPickerPopover 
                                rule={rule} 
                                onChange={(key, val) => handleChange(idx, key, val)} 
                            />

                            <button onClick={() => handleRemove(idx)} className="text-gray-400 hover:text-red-500">
                                <ICONS.Trash className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex justify-between items-center pt-2">
                <div className="flex gap-4">
                    <button onClick={handleAdd} className="text-xs flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium">
                        <ICONS.Plus className="w-3.5 h-3.5" /> 添加规则
                    </button>
                    {localRules.length > 0 && (
                        <button 
                            onClick={() => onChange([])} 
                            className="text-xs text-gray-500 hover:text-red-600"
                        >
                            清空规则
                        </button>
                    )}
                </div>
                {onSaveAsView && localRules.length > 0 && (
                     <button onClick={onSaveAsView} className="text-xs text-gray-500 hover:text-primary-600 underline decoration-gray-300">
                        另存为新视图
                     </button>
                )}
            </div>
        </MenuContainer>
    );
};

// --- 行高菜单 ---
export const RowHeightMenu: React.FC<{
    current: RowHeight;
    onChange: (h: RowHeight) => void;
    onClose: () => void;
}> = ({ current, onChange, onClose }) => {
    const heights: { label: string, val: RowHeight }[] = [
        { label: '紧凑', val: 'SHORT' },
        { label: '标准', val: 'MEDIUM' },
        { label: '宽松', val: 'TALL' },
        { label: '超高', val: 'EXTRA' },
    ];

    return (
        <MenuContainer title="行高设置" onClose={onClose} width="w-48">
            <div className="space-y-1">
                {heights.map(h => (
                    <button
                        key={h.label}
                        onClick={() => onChange(h.val)}
                        className={`w-full text-left px-3 py-2 text-sm rounded flex justify-between items-center ${current === h.val ? 'bg-primary-50 text-primary-600' : 'hover:bg-gray-50 text-gray-700'}`}
                    >
                        <span>{h.label}</span>
                        {current === h.val && <ICONS.Check className="w-3 h-3" />}
                    </button>
                ))}
            </div>
        </MenuContainer>
    );
};

// --- 日历：外观菜单 ---
export const CalendarAppearanceMenu: React.FC<{
    columns: Column[];
    visibleColumns?: string[];
    titleField?: string;
    colorFieldId?: string;
    customColor?: string;
    onToggleVisibility: (colId: string) => void;
    onChangeTitleField: (id: string) => void;
    onChangeColorConfig: (fieldId?: string | null, customColor?: string) => void;
    onClose: () => void;
}> = ({ columns, visibleColumns, titleField, colorFieldId, customColor, onToggleVisibility, onChangeTitleField, onChangeColorConfig, onClose }) => {
    
    // Default title is first column
    const currentTitle = titleField || columns[0]?.id;

    return (
        <MenuContainer title="日历外观配置" onClose={onClose} width="w-72">
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">标题字段</label>
                    <Select 
                        portal={true}
                        options={columns.map(c => ({ label: c.name, value: c.id }))}
                        value={currentTitle} 
                        onChange={(val) => onChangeTitleField(val)}
                        triggerClassName="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">卡片颜色</label>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <input 
                                type="radio" 
                                name="colorType" 
                                className="shrink-0"
                                checked={!!colorFieldId} 
                                onChange={() => onChangeColorConfig(columns[0]?.id || null)}
                            />
                            <span className="text-sm text-gray-700 cursor-pointer flex items-center gap-1" onClick={() => onChangeColorConfig(columns[0]?.id || null)}>基于单选字段</span>
                            {!!colorFieldId && (
                                <div className="ml-auto w-28">
                                    <Select 
                                        portal={true}
                                        options={columns.map(c => ({ label: c.name, value: c.id }))}
                                        value={colorFieldId} 
                                        onChange={(val) => onChangeColorConfig(val, undefined)}
                                        triggerClassName="w-full text-xs border border-gray-200 rounded px-1 py-1 outline-none"
                                    />
                                </div>
                            )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <input 
                                type="radio" 
                                name="colorType" 
                                className="shrink-0"
                                checked={!colorFieldId} 
                                onChange={() => onChangeColorConfig(null, 'bg-primary-500')}
                            />
                            <span className="text-sm text-gray-700 cursor-pointer flex items-center gap-1" onClick={() => onChangeColorConfig(null, 'bg-primary-500')}>统一颜色</span>
                            {!colorFieldId && (
                                 <div className="ml-auto flex gap-1">
                                     {COLORS.slice(0, 5).map(c => (
                                         <div 
                                            key={c.bg} 
                                            className={`w-4 h-4 rounded cursor-pointer ${c.bg.replace('100', '500')} ${customColor === c.bg.replace('100', '500') ? 'ring-1 ring-gray-400' : ''}`}
                                            onClick={() => onChangeColorConfig(null, c.bg.replace('100', '500'))}
                                         />
                                     ))}
                                 </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </MenuContainer>
    );
};

// --- 日历：设置菜单 ---
export const CalendarSettingMenu: React.FC<{
    columns: Column[];
    config: { dateField?: string; endDateField?: string; defaultDuration?: number };
    onChange: (key: string, val: any) => void;
    onClose: () => void;
}> = ({ columns, config, onChange, onClose }) => {
    const dateCols = columns.filter(c => c.type === FieldType.DATE);

    return (
        <MenuContainer title="日历设置" onClose={onClose} width="w-72">
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">开始日期字段 (必选)</label>
                    <Select 
                        portal={true}
                        options={[
                            { label: '请选择...', value: '' },
                            ...dateCols.map(c => ({ label: c.name, value: c.id }))
                        ]}
                        value={config.dateField || ''} 
                        onChange={(val) => onChange('dateField', val)}
                        triggerClassName="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">结束日期字段 (可选)</label>
                    <Select 
                        portal={true}
                        options={[
                            { label: '无 (仅使用开始日期)', value: '' },
                            ...dateCols.filter(c => c.id !== config.dateField).map(c => ({ label: c.name, value: c.id }))
                        ]}
                        value={config.endDateField || ''} 
                        onChange={(val) => onChange('endDateField', val)}
                        triggerClassName="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none"
                    />
                </div>
            </div>
        </MenuContainer>
    );
};

// --- 甘特图：设置菜单 ---
export const GanttSettingMenu: React.FC<{
    columns: Column[];
    config: { 
        dateField?: string; 
        endDateField?: string; 
        titleField?: string;
        colorFieldId?: string; 
        customColor?: string;
        isWorkdayOnly?: boolean;
    };
    onChange: (updates: Record<string, any>) => void;
    onClose: () => void;
}> = ({ columns, config, onChange, onClose }) => {
    const dateCols = columns.filter(c => c.type === FieldType.DATE);

    return (
        <MenuContainer title="甘特图配置" onClose={onClose} width="w-80">
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
                <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">任务名称字段</label>
                    <Select 
                        portal={true}
                        options={columns.map(c => ({ label: c.name, value: c.id }))}
                        value={config.titleField || columns[0]?.id} 
                        onChange={(val) => onChange({ titleField: val })}
                        triggerClassName="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">开始时间</label>
                        <Select 
                            portal={true}
                            options={[
                                { label: '请选择...', value: '' },
                                ...dateCols.map(c => ({ label: c.name, value: c.id }))
                            ]}
                            value={config.dateField || ''} 
                            onChange={(val) => onChange({ dateField: val })}
                            triggerClassName="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">结束时间</label>
                        <Select 
                            portal={true}
                            options={[
                                { label: '无', value: '' },
                                ...dateCols.filter(c => c.id !== config.dateField).map(c => ({ label: c.name, value: c.id }))
                            ]}
                            value={config.endDateField || ''} 
                            onChange={(val) => onChange({ endDateField: val })}
                            triggerClassName="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">颜色配置</label>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <input 
                                type="radio" 
                                name="ganttColor" 
                                checked={!!config.colorFieldId}
                                onChange={() => onChange({ colorFieldId: columns[0]?.id || null, customColor: '' })}
                            />
                            <span className="text-sm cursor-pointer" onClick={() => onChange({ colorFieldId: columns[0]?.id || null, customColor: '' })}>按单选字段着色</span>
                            {!!config.colorFieldId && (
                                <div className="ml-auto w-28">
                                    <Select 
                                        portal={true}
                                        options={columns.map(c => ({ label: c.name, value: c.id }))}
                                        value={config.colorFieldId} 
                                        onChange={(val) => onChange({ colorFieldId: val, customColor: '' })}
                                        triggerClassName="w-full text-xs border border-gray-200 rounded px-1 py-1 outline-none"
                                    />
                                </div>
                            )}
                         </div>
                         <div className="flex items-center gap-2">
                            <input 
                                type="radio" 
                                name="ganttColor" 
                                checked={!config.colorFieldId}
                                onChange={() => onChange({ colorFieldId: '', customColor: 'bg-primary-500' })}
                            />
                            <span className="text-sm cursor-pointer" onClick={() => onChange({ colorFieldId: '', customColor: 'bg-primary-500' })}>统一颜色</span>
                            {!config.colorFieldId && (
                                <div className="ml-auto flex gap-1">
                                    {COLORS.slice(0, 5).map(c => (
                                        <div 
                                            key={c.bg} 
                                            className={`w-4 h-4 rounded cursor-pointer ${c.bg.replace('100', '500')} ${config.customColor === c.bg.replace('100', '500') ? 'ring-1 ring-gray-400' : ''}`}
                                            onClick={() => onChange({ customColor: c.bg.replace('100', '500') })}
                                        />
                                    ))}
                                </div>
                            )}
                         </div>
                    </div>
                </div>
            </div>
        </MenuContainer>
    );
};

// --- 画册：设置菜单 ---
export const GallerySettingMenu: React.FC<{
    allColumns: Column[];
    visibleColumns?: string[];
    config: { coverFieldId?: string; galleryStyle?: 'standard' | 'compact'; showFieldNames?: boolean };
    onChange: (key: string, val: any) => void;
    onToggleVisibility: (colId: string) => void;
    onAddColumn: () => void;
    onClose: () => void;
}> = ({ allColumns, visibleColumns, config, onChange, onToggleVisibility, onAddColumn, onClose }) => {

    return (
        <MenuContainer title="画册配置" onClose={onClose} width="w-80">
            <div className="space-y-5">
                <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">封面图片</label>
                    <Select 
                        portal={true}
                        options={[
                            { label: '无封面', value: '' },
                            ...allColumns.map(c => ({ label: c.name, value: c.id })),
                        ]}
                        value={config.coverFieldId || ''} 
                        onChange={(val) => onChange('coverFieldId', val)}
                        triggerClassName="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none"
                    />
                </div>

                <div>
                     <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">显示风格</label>
                     <div className="flex bg-gray-100 p-1 rounded-lg">
                         <button 
                            onClick={() => onChange('galleryStyle', 'standard')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${config.galleryStyle !== 'compact' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                         >
                            标准 (大图)
                         </button>
                         <button 
                            onClick={() => onChange('galleryStyle', 'compact')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${config.galleryStyle === 'compact' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                         >
                            紧凑 (小图)
                         </button>
                     </div>
                </div>

                <div>
                     <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase">显示的字段</label>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer text-gray-500 hover:text-gray-700">
                            <input 
                                type="checkbox" 
                                checked={config.showFieldNames !== false}
                                onChange={(e) => onChange('showFieldNames', e.target.checked)}
                            />
                            显示字段名
                        </label>
                     </div>
                     <div className="border border-gray-200 rounded-lg max-h-[150px] overflow-y-auto p-1 bg-gray-50">
                         {allColumns.slice(1).map(col => { // Skip primary column usually
                             const isVisible = !visibleColumns || visibleColumns.includes(col.id);
                             return (
                                 <div key={col.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white rounded cursor-pointer" onClick={() => onToggleVisibility(col.id)}>
                                     <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${isVisible ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300'}`}>
                                         {isVisible && <ICONS.Check className="w-2.5 h-2.5 text-white" />}
                                     </div>
                                     <span className="text-xs text-gray-700 truncate">{col.name}</span>
                                 </div>
                             )
                         })}
                     </div>
                </div>
            </div>
        </MenuContainer>
    );
};
