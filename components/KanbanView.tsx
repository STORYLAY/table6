
import React, { useState, useMemo, useEffect } from 'react';
import { Column, Row, FieldType } from '../types';
import { evaluateFormula } from '../formulaUtils';
import { ICONS, FIELD_TYPE_ICONS, formatFieldValue, getTagColor, formatDateForDisplay, parseLinkValues, parseJsonArray } from '../constants';
import { api } from '../services/api';
import { FilePreviewModal } from './FilePreviewModal';
import { UserCellDisplay } from './UserCellDisplay';
import { toast } from 'sonner';

interface KanbanViewProps {
  tableId: string;
  columns: Column[];
  allColumns: Column[];
  rows: Row[];
  groupByFieldId: string;
  onAddRow: (initialData?: Record<string, any>) => void;
  onDirectAddRow?: (data: Record<string, any>) => void;
  onAddGroup: (colId: string, opt: string) => void;
  onOptionChange: (colId: string, oldOpt: string, newOpt: string | null) => void;
  onCellChange: (rowId: string, colId: string, value: any) => void;
  onInsertRow: (targetRowId: string, position: 'before' | 'after', initialData?: Record<string, any>, count?: number) => void;
  onDuplicateRow: (targetRowId: string) => void;
  onDeleteRows: (rowIds: string[]) => void;
  onOpenComment: (rowId: string, colId: string) => void;
  onOpenDetail?: (row: Row) => void;
  commentCounts?: Record<string, number>;
  searchKeyword?: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

const KanbanView: React.FC<KanbanViewProps> = ({
  tableId,
  columns,
  allColumns,
  rows,
  groupByFieldId,
  onAddRow,
  onDirectAddRow,
  onAddGroup,
  onOptionChange,
  onCellChange,
  onInsertRow,
  onDuplicateRow,
  onDeleteRows,
  onOpenComment,
  onOpenDetail,
  commentCounts = {},
  searchKeyword,
  hasMore,
  isLoadingMore,
  onLoadMore
}) => {
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, rowId: string, colId?: string } | null>(null);
  const [insertAboveCount, setInsertAboveCount] = useState(1);
  const [insertBelowCount, setInsertBelowCount] = useState(1);
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ x: number, y: number, groupId: string } | null>(null);
  const [previewFile, setPreviewFile] = useState<{ blob: Blob, filename: string } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const addGroupInputRef = React.useRef<HTMLInputElement>(null);
  const editGroupInputRef = React.useRef<HTMLInputElement>(null);

  const groupCol = allColumns.find(c => c.id === groupByFieldId);

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

  const handlePreview = async (f: any) => {
      try {
          setIsPreviewLoading(true);
          const fileId = typeof f === 'object' ? f.id : f;
          const filename = typeof f === 'object' ? (f.filename || f.name) : f;
          const blob = await api.getFileBlob(fileId);
          setPreviewFile({ blob, filename: filename || '文件' });
      } catch (e: any) {
          console.error('Preview failed:', e);
          toast.error(e.message || '获取文件内容失败');
      } finally {
          setIsPreviewLoading(false);
      }
  };

  useEffect(() => {
    if (isAddingGroup && addGroupInputRef.current) {
        addGroupInputRef.current.focus();
    }
    if (editingGroupId && editGroupInputRef.current) {
        editGroupInputRef.current.focus();
        editGroupInputRef.current.select();
    }
  }, [isAddingGroup, editingGroupId]);

  const handleAddGroupSubmit = () => {
    if (newGroupName.trim() && groupCol) {
        onAddGroup(groupCol.id, newGroupName.trim());
        setNewGroupName('');
        setIsAddingGroup(false);
    }
  };

  const handleEditGroupSubmit = (oldName: string) => {
    if (newGroupName.trim() && groupCol && newGroupName.trim() !== oldName) {
        onOptionChange(groupCol.id, oldName, newGroupName.trim());
    }
    setEditingGroupId(null);
    setNewGroupName('');
  };

  const handleAddGroupKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAddGroupSubmit();
    if (e.key === 'Escape') {
        setIsAddingGroup(false);
        setNewGroupName('');
    }
  };

  const handleEditGroupKeyDown = (e: React.KeyboardEvent, oldName: string) => {
    if (e.key === 'Enter') handleEditGroupSubmit(oldName);
    if (e.key === 'Escape') {
        setEditingGroupId(null);
        setNewGroupName('');
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 100;
      if (bottom && hasMore && !isLoadingMore && onLoadMore) {
          onLoadMore();
      }
  };

  // Group rows
  const groups = useMemo(() => {
    if (!groupCol) return [{ id: 'all', name: '全部', rows }];
    
    let groupKeys: string[] = [];
    if (groupCol.type === FieldType.SELECT && groupCol.config?.options) {
        groupKeys = [...groupCol.config.options];
    } else {
        // Collect distinct values
        const distinct = new Set<string>();
        rows.forEach(r => {
            const val = r.data[groupByFieldId];
            const formattedVal = formatFieldValue(val, groupCol?.type);
            if (formattedVal) distinct.add(formattedVal);
        });
        groupKeys = Array.from(distinct).sort();
    }
    // Add "Uncategorized" if needed
    groupKeys.push('未分组');

    return groupKeys.map(key => {
        const isUncategorized = key === '未分组';
        return {
            id: key,
            name: key,
            rows: rows.filter(r => {
                const val = r.data[groupByFieldId];
                const formattedVal = formatFieldValue(val, groupCol?.type);
                if (isUncategorized) return !formattedVal;
                return formattedVal === key;
            })
        };
    });
  }, [rows, groupCol, groupByFieldId]);

  const handleContextMenu = (e: React.MouseEvent, row: Row) => {
      e.preventDefault();
      e.stopPropagation();
      
      const menuWidth = 256; // w-64 is 256px
      const menuHeight = 300; // Increased to accommodate all items and separators
      const offsetBuffer = 20; // Add a small buffer to ensure it doesn't clip
      
      let x = e.clientX;
      let y = e.clientY;
      
      if (window.innerWidth - x < menuWidth + offsetBuffer) {
          x = window.innerWidth - menuWidth - offsetBuffer;
      }
      
      if (window.innerHeight - y < menuHeight + offsetBuffer) {
          y = window.innerHeight - menuHeight - offsetBuffer;
      }
      
      setContextMenu({ x: Math.max(0, x), y: Math.max(0, y), rowId: row.id });
  };

  useEffect(() => {
      const handleClick = () => {
          setContextMenu(null);
          setGroupMenu(null);
      };
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
  }, []);

  const findRowInTree = (rows: Row[], id: string): Row | undefined => {
      for (const row of rows) {
          if (row.id === id) return row;
          if (row.children) {
              const found = findRowInTree(row.children, id);
              if (found) return found;
          }
      }
      return undefined;
  };

  if (!groupCol) return <div className="p-10 text-center text-gray-500">请选择分组字段</div>;

  return (
    <div className="flex-1 overflow-x-auto overflow-y-auto p-4 bg-gray-100 flex gap-4 h-full" onScroll={handleScroll}>
        {groups.map(group => {
            const groupRows = group.rows;
            return (
                <div key={group.id} className="w-72 shrink-0 flex flex-col max-h-full">
                    <div className="mb-3 flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                             {editingGroupId === group.id ? (
                                 <input 
                                    ref={editGroupInputRef}
                                    type="text"
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    onBlur={() => handleEditGroupSubmit(group.name)}
                                    onKeyDown={(e) => handleEditGroupKeyDown(e, group.name)}
                                    className="w-full text-sm font-bold text-gray-700 bg-white border border-primary-400 rounded px-1 outline-none"
                                 />
                             ) : (
                                 <>
                                     <span className="font-bold text-gray-700 text-sm truncate" title={group.name}>{group.name}</span>
                                     <span className="bg-gray-200 text-gray-600 text-[10px] px-1.5 rounded-full shrink-0">{groupRows.length}</span>
                                 </>
                             )}
                        </div>
                        <div className="flex gap-1 shrink-0 ml-2">
                             <button 
                                onClick={() => {
                                    const initialData = { [groupByFieldId]: group.name === '未分组' ? '' : group.name };
                                    onDirectAddRow ? onDirectAddRow(initialData) : onAddRow(initialData);
                                }}
                                className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                             >
                                 <ICONS.Plus className="w-4 h-4" />
                             </button>
                             {group.name !== '未分组' && (
                                 <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setGroupMenu({ x: rect.left, y: rect.bottom + 5, groupId: group.id });
                                    }}
                                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                 >
                                     <ICONS.MoreHorizontal className="w-4 h-4" />
                                 </button>
                             )}
                        </div>
                    </div>
                    
                    {/* Cards Container */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-300" onScroll={handleScroll}>
                        {groupRows.map(row => {
                            let commentCount = 0;
                            for (const key in commentCounts) {
                                if (key.startsWith(`${row.id}_`)) {
                                    commentCount += commentCounts[key];
                                }
                            }

                            return (
                                <div 
                                    key={row.id} 
                                    onClick={() => {
                                        if (editingCardId !== row.id) setEditingCardId(row.id);
                                    }}
                                    onContextMenu={(e) => handleContextMenu(e, row)}
                                    className={`bg-white p-3 rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.08)] border transition-all group min-h-[40px] relative ${editingCardId === row.id ? 'ring-2 ring-primary-500/20 border-primary-400' : 'border-transparent hover:border-primary-300 hover:shadow-md cursor-pointer'}`}
                                >
                                    {/* Comment Count Indicator */}
                                    {commentCount > 0 && (
                                        <div className="group-hover:hidden absolute top-2 right-2 text-gray-400 text-[10px] font-bold px-1.5 py-0.5 rounded-md z-10 pointer-events-none flex items-center gap-1 bg-yellow-50/50">
                                             <ICONS.Message className="w-3 h-3 text-yellow-500" />
                                             <span className="text-yellow-600">{commentCount}</span>
                                        </div>
                                    )}
                                    
                                    {/* Primary Field */}
                                    <div className="font-medium text-sm text-gray-800 mb-2 pr-8 line-clamp-2 break-all">
                                        {columns[0]?.type === FieldType.HYPERLINK && row.data[columns[0]?.id] ? (
                                            <span 
                                                className="text-blue-600 underline cursor-pointer hover:text-blue-800"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const val = String(row.data[columns[0]?.id]);
                                                    window.open(val.startsWith('http') ? val : `https://${val}`, '_blank');
                                                }}
                                            >
                                                {highlightText(formatFieldValue(row.data[columns[0]?.id], columns[0]?.type) || '无标题')}
                                            </span>
                                        ) : (
                                            highlightText(formatFieldValue(row.data[columns[0]?.id], columns[0]?.type) || '无标题')
                                        )}
                                    </div>

                                    {/* Other Fields */}
                                    <div className="space-y-1.5">
                                        {columns.slice(1).map(col => { // Show all fields
                                            if (col.id === groupByFieldId) return null; // Skip grouping field
                                            const val = row.data[col.id];
                                            
                                            let displayVal = formatFieldValue(val, col.type);
                                            
                                            // Handle Attachment
                                            if (col.type === FieldType.ATTACHMENT) {
                                                const files = parseJsonArray(val);
                                                if (files.length === 0) return null;
                                                return (
                                                    <div key={col.id} className="flex flex-wrap gap-1 mt-1.5">
                                                        {files.map((f: any, i: number) => {
                                                            const filename = typeof f === 'object' ? (f.filename || f.name) : String(f);
                                                            const extension = String(f.extension || filename?.split('.').pop() || 'FILE').toLowerCase();
                                                            const isImage = (f.type?.startsWith('image') || ['jpg','jpeg','png','gif','webp'].includes(extension));
                                                            
                                                            return (
                                                                <div 
                                                                    key={i} 
                                                                    className="w-8 h-8 rounded border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-primary-400 transition-colors" 
                                                                    title={filename}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handlePreview(f);
                                                                    }}
                                                                >
                                                                    {isImage ? (
                                                                        <>
                                                                            <img src={f.url || api.getFileUrl(f.path)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display='none'; if(e.currentTarget.nextElementSibling) e.currentTarget.nextElementSibling.classList.remove('hidden'); }} />
                                                                            <span className="hidden text-[8px] font-bold text-gray-500 uppercase">{extension.substring(0, 3)}</span>
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-[8px] font-bold text-gray-500 uppercase">{extension.substring(0, 3)}</span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            }

                                            // Handle Multi-select
                                            if (col.type === FieldType.MULTI_SELECT) {
                                                const values = Array.isArray(val) ? val : (typeof val === 'string' && val ? val.split(',') : []);
                                                if (values.length === 0) return null;
                                                return (
                                                    <div key={col.id} className="flex flex-wrap gap-1 mt-1">
                                                        {values.map((v: string, i: number) => {
                                                            const colorStyle = getTagColor(v, col.config?.option_colors);
                                                            return (
                                                                <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${colorStyle.bg} ${colorStyle.text} border border-black/5`}>
                                                                    {highlightText(v)}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            }

                                            // Handle Select
                                            if (col.type === FieldType.SELECT) {
                                                if (!val) return null;
                                                const colorStyle = getTagColor(String(val), col.config?.option_colors);
                                                return (
                                                    <div key={col.id} className="mt-1 flex">
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${colorStyle.bg} ${colorStyle.text} border border-black/5`}>
                                                            {highlightText(String(val))}
                                                        </span>
                                                    </div>
                                                );
                                            }

                                            // Handle Link
                                            if (col.type === FieldType.LINK) {
                                                const links = parseLinkValues(val);
                                                if (links.length === 0) return null;
                                                return (
                                                    <div key={col.id} className="mt-1">
                                                        <span className="text-xs text-gray-600 truncate block w-full">
                                                            {highlightText(links.map((link: any) => link.name || (typeof link === 'object' ? link.id : String(link))).join(', '))}
                                                        </span>
                                                    </div>
                                                );
                                            }

                                            // Handle Hyperlink
                                            if (col.type === FieldType.HYPERLINK) {
                                                if (!val) return null;
                                                return (
                                                    <div key={col.id} className="text-xs flex items-start gap-2 text-gray-600 mt-0.5">
                                                        <span className="text-gray-400 scale-75 origin-left w-3.5 flex justify-center mt-0.5 shrink-0">
                                                            <ICONS.Link className="w-3 h-3" />
                                                        </span>
                                                        <div 
                                                            className="break-all line-clamp-2 text-blue-600 underline cursor-pointer hover:text-blue-800"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const strVal = String(val);
                                                                window.open(strVal.startsWith('http') ? strVal : `https://${strVal}`, '_blank');
                                                            }}
                                                        >
                                                            {highlightText(String(val))}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            // Handle Checkbox
                                            if (col.type === FieldType.CHECKBOX) {
                                                return (
                                                    <div key={col.id} className="flex items-center gap-2 mt-1">
                                                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${val ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300'}`}>
                                                            {val && <ICONS.Check className="w-2.5 h-2.5 text-white" />}
                                                        </div>
                                                        <span className="text-xs text-gray-500">{col.name}</span>
                                                    </div>
                                                );
                                            }

                                            // Handle Formula, Lookup, Search Reference
                                            if (col.type === FieldType.FORMULA || col.type === FieldType.LOOKUP || col.type === FieldType.SEARCH_REFERENCE) {
                                                let displayVal = val;
                                                
                                                if (col.type === FieldType.FORMULA) {
                                                    const formula = col.config?.formula;
                                                    displayVal = evaluateFormula(formula || '', columns, row);
                                                } else {
                                                    displayVal = Array.isArray(val) ? val.map(v => typeof v === 'object' ? (v.name || v.id) : String(v)).join(', ') : String(val || '');
                                                }
                                                
                                                // Only hide if result is empty string or null/undefined, but show 0
                                                if (displayVal === null || displayVal === undefined || displayVal === '') return null;

                                                return (
                                                    <div key={col.id} className="flex items-center gap-2 mt-1 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 w-fit">
                                                        <span className="font-mono font-bold text-[10px] text-gray-400">{col.type === FieldType.FORMULA ? 'ƒx' : '🔍'}</span>
                                                        <span className="text-xs font-mono text-gray-700">{highlightText(String(displayVal))}</span>
                                                    </div>
                                                );
                                            }

                                            // Handle Date
                                            if (col.type === FieldType.DATE) {
                                                if (!val) return null;
                                                const format = col.config?.format || col.format || 'YYYY-MM-DD';
                                                const formattedDate = formatDateForDisplay(val, format);
                                                
                                                return (
                                                    <div key={col.id} className="text-xs flex items-start gap-2 text-gray-600 mt-0.5">
                                                        <span className="text-gray-400 scale-75 origin-left w-3.5 flex justify-center mt-0.5 shrink-0">
                                                            <ICONS.Calendar className="w-3 h-3" />
                                                        </span>
                                                        <span className="break-words whitespace-pre-wrap">{highlightText(formattedDate)}</span>
                                                    </div>
                                                );
                                            }
                                            
                                            // Handle User
                                            if (col.type === FieldType.USER) {
                                                if (!val || (Array.isArray(val) && val.length === 0)) return null;
                                                return (
                                                    <div key={col.id} className="mt-1">
                                                        <UserCellDisplay 
                                                            tableId={tableId}
                                                            rowId={row.id}
                                                            colId={col.id}
                                                            value={val}
                                                            searchKeyword={searchKeyword}
                                                        />
                                                    </div>
                                                );
                                            }

                                            // Default Text/Number
                                            if (val === null || val === undefined || val === '') return null;

                                            return (
                                                <div key={col.id} className="text-xs flex items-start gap-2 text-gray-600 mt-0.5">
                                                    <span className="text-gray-400 scale-75 origin-left w-3.5 flex justify-center mt-0.5 shrink-0">
                                                        {FIELD_TYPE_ICONS[col.type] || <ICONS.Edit className="w-3 h-3" />}
                                                    </span>
                                                    <span className="break-words whitespace-pre-wrap">{highlightText(displayVal)}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    
                                    {/* Action overlay on hover */}
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 bg-white/90 rounded shadow-sm border border-gray-100 px-1">
                                         <button onClick={(e) => { e.stopPropagation(); onOpenComment(row.id, columns[0].id); }} className="p-1 hover:text-primary-600 flex items-center gap-1">
                                             <ICONS.Message className="w-3 h-3"/>
                                             {commentCount > 0 && <span className="text-[10px] font-medium">{commentCount}</span>}
                                         </button>
                                    </div>
                                </div>
                            );
                        })}
                        
                        <button 
                            onClick={() => {
                                const initialData = { [groupByFieldId]: group.name === '未分组' ? '' : group.name };
                                onDirectAddRow ? onDirectAddRow(initialData) : onAddRow(initialData);
                            }}
                            className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-gray-400 text-xs hover:border-primary-400 hover:text-primary-500 hover:bg-white transition-colors"
                        >
                            + 添加
                        </button>
                    </div>
                </div>
            );
        })}
        
        <div className="w-72 shrink-0 flex flex-col pt-10">
             {isAddingGroup ? (
                 <div className="bg-white p-3 rounded-lg border border-primary-400 shadow-sm animate-in fade-in zoom-in-95 duration-150">
                     <input 
                        ref={addGroupInputRef}
                        type="text"
                        placeholder="输入分组名称..."
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onBlur={() => {
                            if (!newGroupName.trim()) setIsAddingGroup(false);
                        }}
                        onKeyDown={handleAddGroupKeyDown}
                        className="w-full text-sm outline-none mb-2 px-1"
                     />
                     <div className="flex justify-end gap-2">
                         <button 
                            onClick={() => { setIsAddingGroup(false); setNewGroupName(''); }}
                            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded"
                         >
                             取消
                         </button>
                         <button 
                            onClick={handleAddGroupSubmit}
                            disabled={!newGroupName.trim()}
                            className="text-xs bg-primary-600 text-white px-3 py-1 rounded hover:bg-primary-700 disabled:opacity-50 transition-colors"
                         >
                             添加
                         </button>
                     </div>
                 </div>
             ) : (
                 <button 
                    onClick={() => setIsAddingGroup(true)}
                    className="flex items-center justify-center gap-2 text-gray-500 hover:text-primary-600 bg-gray-200/50 hover:bg-white px-4 py-3 rounded-lg border border-dashed border-gray-300 hover:border-primary-400 transition-all group"
                 >
                     <ICONS.Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                     <span className="text-sm font-medium">添加新分组</span>
                 </button>
             )}
        </div>

        {hasMore && (
            <div className="w-72 shrink-0 flex flex-col pt-10 items-center">
                <button
                    onClick={() => onLoadMore && onLoadMore()}
                    disabled={isLoadingMore}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-primary-600 transition-colors shadow-sm flex items-center gap-2 h-12"
                >
                    {isLoadingMore ? (
                        <><span className="w-4 h-4 rounded-full border-2 border-primary-500 border-t-transparent animate-spin"></span>加载中...</>
                    ) : '加载更多数据'}
                </button>
            </div>
        )}

        {groupMenu && (
            <div 
                className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-[100] w-32 text-sm animate-in fade-in zoom-in-95 duration-100"
                style={{ top: groupMenu.y, left: groupMenu.x }}
                onClick={(e) => e.stopPropagation()}
            >
                <div 
                    className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700"
                    onClick={() => {
                        setEditingGroupId(groupMenu.groupId);
                        setNewGroupName(groupMenu.groupId); // groupId is the name here
                        setGroupMenu(null);
                    }}
                >
                    <ICONS.Edit className="w-3.5 h-3.5" />
                    重命名
                </div>
                <div 
                    className="px-4 py-2 hover:bg-red-50 cursor-pointer flex items-center gap-2 text-red-600"
                    onClick={() => {
                        if (groupCol) onOptionChange(groupCol.id, groupMenu.groupId, null);
                        setGroupMenu(null);
                    }}
                >
                    <ICONS.Trash className="w-3.5 h-3.5" />
                    删除分组
                </div>
            </div>
        )}

        {contextMenu && (
            <div 
                className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-[100] w-64 text-sm"
                style={{ top: contextMenu.y, left: contextMenu.x }}
                onClick={(e) => e.stopPropagation()}
            >
                <div 
                    className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700"
                    onClick={() => {
                        const row = findRowInTree(rows, contextMenu.rowId);
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
                    className="px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                >
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => {
                        const row = findRowInTree(rows, contextMenu.rowId);
                        const initialData = row ? { [groupByFieldId]: row.data[groupByFieldId] } : {};
                        onInsertRow(contextMenu.rowId, 'before', initialData, insertAboveCount);
                        setContextMenu(null);
                    }}>
                        <ICONS.ArrowUp className="w-3.5 h-3.5" />
                        <span>向上插入</span>
                    </div>
                    <input 
                        type="number" 
                        min="1" 
                        max="100"
                        className="w-12 border border-gray-200 rounded px-1 text-center text-xs h-6 outline-none focus:border-primary-500"
                        value={insertAboveCount}
                        onChange={(e) => setInsertAboveCount(Math.max(1, parseInt(e.target.value) || 1))}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <span>行</span>
                </div>
                <div 
                    className="px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                >
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => {
                        const row = findRowInTree(rows, contextMenu.rowId);
                        const initialData = row ? { [groupByFieldId]: row.data[groupByFieldId] } : {};
                        onInsertRow(contextMenu.rowId, 'after', initialData, insertBelowCount);
                        setContextMenu(null);
                    }}>
                        <ICONS.ArrowDown className="w-3.5 h-3.5" />
                        <span>向下插入</span>
                    </div>
                    <input 
                        type="number" 
                        min="1" 
                        max="100"
                        className="w-12 border border-gray-200 rounded px-1 text-center text-xs h-6 outline-none focus:border-primary-500"
                        value={insertBelowCount}
                        onChange={(e) => setInsertBelowCount(Math.max(1, parseInt(e.target.value) || 1))}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <span>行</span>
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

       {/* File Preview Modal */}
       <FilePreviewModal 
           isOpen={!!previewFile}
           onClose={() => setPreviewFile(null)}
           fileBlob={previewFile?.blob || null}
           filename={previewFile?.filename || ''}
       />

       {/* Loading Overlay for Preview */}
       {isPreviewLoading && (
           <div className="fixed inset-0 z-[300] flex items-center justify-center bg-white/50">
               <div className="flex flex-col items-center gap-3 bg-white p-6 rounded-xl shadow-xl">
                   <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                   <span className="text-sm font-medium text-gray-700">正在获取文件内容...</span>
               </div>
           </div>
       )}
    </div>
  );
};

export default KanbanView;
