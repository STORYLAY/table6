import React, { useState } from 'react';
import { Column, Row, FieldType } from '../types';
import { evaluateFormula } from '../formulaUtils';
import { ICONS, FIELD_TYPE_ICONS, formatFieldValue, getTagColor, formatDateForDisplay, parseLinkValues, parseJsonArray } from '../constants';
import { api } from '../services/api';
import { FilePreviewModal } from './FilePreviewModal';
import { toast } from 'sonner';
import { UserCellDisplay } from './UserCellDisplay';
import RowDetailPanel from './RowDetailPanel';
import ConfirmDialog from './ConfirmDialog';

const CheckboxUnchecked = () => (
  <div className="w-3.5 h-3.5 border border-gray-300 rounded bg-white hover:border-primary-400 transition-colors" />
);

const CheckboxChecked = () => (
  <div className="w-3.5 h-3.5 border border-primary-600 bg-primary-600 rounded flex items-center justify-center transition-colors">
    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  </div>
);

interface GalleryViewProps {
  tableId: string;
  columns: Column[];
  allColumns: Column[];
  rows: Row[];
  coverFieldId?: string;
  displayMode?: 'standard' | 'compact';
  showFieldNames?: boolean;
  onAddRow: (initialData?: Record<string, any>) => void;
  onDirectAddRow?: (data: Record<string, any>) => void;
  onCellChange: (rowId: string, colId: string, value: any) => void;
  onInsertRow: (targetRowId: string, position: 'before' | 'after', initialData?: Record<string, any>, count?: number) => void;
  onDuplicateRow: (targetRowId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onOpenComment: (rowId: string, colId: string) => void;
  commentCounts?: Record<string, number>;
  searchKeyword?: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

const GalleryView: React.FC<GalleryViewProps> = ({
  tableId,
  columns,
  allColumns,
  rows,
  coverFieldId,
  displayMode = 'standard',
  showFieldNames = false,
  onAddRow,
  onDirectAddRow,
  onCellChange,
  onInsertRow,
  onDuplicateRow,
  onDeleteRow,
  onOpenComment,
  commentCounts = {},
  searchKeyword,
  hasMore,
  isLoadingMore,
  onLoadMore
}) => {
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ blob: Blob, filename: string } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<string | null>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 100;
      if (bottom && hasMore && !isLoadingMore && onLoadMore) {
          onLoadMore();
      }
  };

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

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, rowId: string } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, rowId: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      const menuWidth = 192; // w-48 is 192px
      const menuHeight = 220; // Estimated height for 5 items
      const offsetBuffer = 20;
      
      let x = e.clientX;
      let y = e.clientY;
      
      if (window.innerWidth - x < menuWidth + offsetBuffer) {
          x = window.innerWidth - menuWidth - offsetBuffer;
      }
      
      if (window.innerHeight - y < menuHeight + offsetBuffer) {
          y = window.innerHeight - menuHeight - offsetBuffer;
      }
      
      setContextMenu({ x: Math.max(0, x), y: Math.max(0, y), rowId });
  };

  // Close context menu on click outside
  React.useEffect(() => {
      const handleClick = () => setContextMenu(null);
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
  }, []);

  return (
    <div className="flex-1 h-full overflow-auto p-6 bg-gray-50" onClick={() => setContextMenu(null)} onScroll={handleScroll}>
        <ConfirmDialog 
            isOpen={!!rowToDelete}
            title="确认删除"
            message="确定要删除这条记录吗？此操作不可撤销。"
            onConfirm={() => {
                if (rowToDelete) {
                    onDeleteRow(rowToDelete);
                    setRowToDelete(null);
                }
            }}
            onCancel={() => setRowToDelete(null)}
        />
       <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {rows.map(row => {
              const coverImage = coverFieldId ? row.data[coverFieldId] : null;
              const bgImage = coverImage || null;
              
              let totalCommentCount = 0;
              for (const key in commentCounts) {
                  if (key.startsWith(`${row.id}_`)) {
                      totalCommentCount += commentCounts[key];
                  }
              }

              return (
                <div 
                    key={row.id} 
                    onClick={() => setEditingRowId(row.id)}
                    onContextMenu={(e) => handleContextMenu(e, row.id)}
                    className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all cursor-pointer flex flex-col hover:border-primary-300 relative h-auto"
                >
                  {/* Comment Count Badge */}
                  {totalCommentCount > 0 && (
                      <div 
                          className="absolute top-0 right-0 bg-yellow-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-bl-md z-20 cursor-pointer hover:bg-yellow-500 transition-colors"
                          onClick={(e) => {
                              e.stopPropagation();
                              onOpenComment(row.id, columns[0]?.id || allColumns[0].id);
                          }}
                      >
                          {totalCommentCount}
                      </div>
                  )}

                  {/* Cover */}
                  {bgImage && (
                      <div className={`w-full bg-gray-100 relative overflow-hidden shrink-0 ${displayMode === 'compact' ? 'h-24' : 'h-40'}`}>
                          <img src={bgImage} alt="cover" className="w-full h-full object-cover transition-transform group-hover:scale-105" referrerPolicy="no-referrer" />
                      </div>
                  )}

                  {/* Content */}
                  <div className={`p-4 flex-1 flex flex-col relative ${displayMode === 'compact' ? 'gap-2' : 'gap-3'}`}>
                      <div 
                          className={`font-bold text-gray-800 pr-6 break-all ${displayMode === 'compact' ? 'text-sm line-clamp-1' : 'text-base line-clamp-2'}`}
                          title={formatFieldValue(row.data[columns[0]?.id], columns[0]?.type) || '无标题'}
                      >
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
                      
                      <div className={displayMode === 'compact' ? 'flex flex-wrap items-center gap-2' : 'space-y-2'}>
                          {columns.slice(1).map(col => {
                              const val = row.data[col.id];
                              // Skip empty values, but handle 0 and false correctly
                              if ((val === undefined || val === null || val === '') && col.type !== FieldType.CHECKBOX && col.type !== FieldType.FORMULA) {
                                  return null;
                              }
                              
                              let displayContent: React.ReactNode = formatFieldValue(val, col.type);

                              if (col.type === FieldType.ATTACHMENT) {
                                  const files = parseJsonArray(val);
                                  if (files.length === 0) return null;
                                  displayContent = (
                                      <div className="flex gap-1 overflow-hidden mt-1">
                                          {files.slice(0, 4).map((f: any, i: number) => (
                                              <div 
                                                  key={i} 
                                                  className="w-8 h-8 rounded border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-primary-400 transition-colors" 
                                                  title={f.filename || f.name}
                                                  onClick={(e) => { e.stopPropagation(); handlePreview(f); }}
                                              >
                                                  {f.type?.startsWith('image') || ['jpg','jpeg','png','gif','webp'].includes((f.extension || '').toLowerCase()) ? (
                                                      <>
                                                          <img src={f.url || api.getFileUrl(f.path)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display='none'; if(e.currentTarget.nextElementSibling) e.currentTarget.nextElementSibling.classList.remove('hidden'); }} />
                                                          <span className="hidden text-[8px] font-bold text-gray-500 uppercase">{(f.extension || 'FILE').substring(0, 3)}</span>
                                                      </>
                                                  ) : (
                                                      <span className="text-[8px] font-bold text-gray-500 uppercase">{(f.extension || 'FILE').substring(0, 3)}</span>
                                                  )}
                                              </div>
                                          ))}
                                          {files.length > 4 && <span className="text-xs text-gray-400 self-center">+{files.length - 4}</span>}
                                      </div>
                                  );
                              } else if (col.type === FieldType.CHECKBOX) {
                                  displayContent = (
                                      <div className="flex items-center mt-0.5">
                                          {val ? <CheckboxChecked /> : <CheckboxUnchecked />}
                                      </div>
                                  );
                              } else if (col.type === FieldType.SELECT) {
                                  const colorStyle = getTagColor(String(val), col.config?.option_colors);
                                  displayContent = (
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colorStyle.bg} ${colorStyle.text}`}>
                                          {highlightText(String(val))}
                                      </span>
                                  );
                              } else if (col.type === FieldType.LINK) {
                                  const links = parseLinkValues(val);
                                  if (links.length === 0) return null;
                                  displayContent = (
                                      <span className="text-sm text-gray-700 truncate block w-full">
                                          {highlightText(links.map((link: any) => link.name || (typeof link === 'object' ? link.id : String(link))).join(', '))}
                                      </span>
                                  );
                              } else if (col.type === FieldType.HYPERLINK) {
                                  if (!val) return null;
                                  displayContent = (
                                      <div 
                                          className="text-blue-600 underline cursor-pointer hover:text-blue-800 break-all line-clamp-2"
                                          onClick={(e) => {
                                              e.stopPropagation();
                                              const strVal = String(val);
                                              window.open(strVal.startsWith('http') ? strVal : `https://${strVal}`, '_blank');
                                          }}
                                      >
                                          {highlightText(String(val))}
                                      </div>
                                  );
                              } else if (col.type === FieldType.MULTI_SELECT) {
                                  const values = Array.isArray(val) ? val : (val ? String(val).split(',') : []);
                                  if (values.length === 0) return null;
                                  displayContent = (
                                      <div className="flex flex-wrap gap-1 mt-0.5">
                                          {values.map((v: string, i: number) => {
                                              const colorStyle = getTagColor(v, col.config?.option_colors);
                                              return (
                                                  <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${colorStyle.bg} ${colorStyle.text}`}>
                                                      {highlightText(v)}
                                                  </span>
                                              );
                                          })}
                                      </div>
                                  );
                              } else if (col.type === FieldType.FORMULA || col.type === FieldType.LOOKUP || col.type === FieldType.SEARCH_REFERENCE) {
                                  let formulaVal = val;
                                  if (col.type === FieldType.FORMULA) {
                                      const formula = col.config?.formula;
                                      formulaVal = evaluateFormula(formula || '', allColumns || columns, row);
                                  } else {
                                      formulaVal = Array.isArray(val) ? val.map(v => typeof v === 'object' ? (v.name || v.id) : String(v)).join(', ') : String(val || '');
                                  }
                                  displayContent = (
                                      <div className="flex items-center gap-1 text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 w-fit">
                                          <span className="font-mono font-bold text-[10px] text-gray-400 shrink-0">{col.type === FieldType.FORMULA ? 'ƒx' : '🔍'}</span>
                                          <span className="truncate font-mono text-gray-700 text-xs">{highlightText(String(formulaVal !== undefined && formulaVal !== null ? formulaVal : ''))}</span>
                                      </div>
                                  );
                              } else if (col.type === FieldType.DATE) {
                                  const format = col.config?.format || col.format || 'YYYY-MM-DD';
                                  const formattedDate = formatDateForDisplay(val, format);
                                  displayContent = <span className="text-gray-600 text-xs">{highlightText(formattedDate)}</span>;
                              } else if (col.type === FieldType.USER) {
                                  if (!val || (Array.isArray(val) && val.length === 0)) return null;
                                  displayContent = (
                                      <div className="mt-0.5">
                                          <UserCellDisplay 
                                              tableId={tableId}
                                              rowId={row.id}
                                              colId={col.id}
                                              value={val}
                                              searchKeyword={searchKeyword}
                                          />
                                      </div>
                                  );
                              } else {
                                  const formatted = formatFieldValue(val, col.type);
                                  displayContent = <span className={`text-gray-600 ${displayMode === 'compact' ? 'truncate max-w-[150px]' : 'break-words whitespace-pre-wrap'}`} title={formatted}>{highlightText(formatted)}</span>;
                              }

                              return (
                                  <div key={col.id} className={`text-xs flex ${displayMode === 'compact' ? 'flex-row items-center gap-2' : 'flex-col gap-1'}`}>
                                      {showFieldNames && (
                                          <div className="flex items-center gap-1 min-w-[60px] shrink-0">
                                              {FIELD_TYPE_ICONS[col.type] && <span className="text-gray-400 scale-75">{FIELD_TYPE_ICONS[col.type]}</span>}
                                              <span className="text-gray-400 font-medium truncate" title={col.name}>{col.name}</span>
                                              {displayMode === 'compact' && <span className="text-gray-300">:</span>}
                                          </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                          {displayContent}
                                      </div>
                                  </div>
                              );
                          })}
                      </div>

                      {/* Hover Actions */}
                      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={(e) => { e.stopPropagation(); setRowToDelete(row.id); }} className="p-1.5 bg-white border border-gray-200 text-gray-500 rounded hover:bg-red-50 hover:text-red-500 hover:border-red-200 shadow-sm"><ICONS.Trash className="w-3.5 h-3.5"/></button>
                      </div>
                  </div>
                </div>
              );
          })}

          <div 
             onClick={() => onDirectAddRow ? onDirectAddRow({}) : onAddRow()}
             className="min-h-[200px] border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-primary-400 hover:text-primary-500 hover:bg-primary-50/30 transition-all group"
          >
              <div className="p-3 bg-gray-100 rounded-full group-hover:bg-primary-100 transition-colors mb-2">
                  <ICONS.Plus className="w-6 h-6" />
              </div>
              <span className="font-medium">新建记录</span>
          </div>
       </div>

       {hasMore && (
           <div className="mt-8 flex justify-center pb-8">
               <button 
                   onClick={() => onLoadMore && onLoadMore()} 
                   disabled={isLoadingMore}
                   className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-primary-600 transition-colors shadow-sm flex items-center gap-2"
               >
                   {isLoadingMore ? (
                       <><span className="w-4 h-4 rounded-full border-2 border-primary-500 border-t-transparent animate-spin"></span>加载中...</>
                   ) : '加载更多数据'}
               </button>
           </div>
       )}

       {contextMenu && (
           <div 
               className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-[100] w-48 text-sm"
               style={{ top: contextMenu.y, left: contextMenu.x }}
               onClick={(e) => e.stopPropagation()}
           >
               <div className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700" onClick={() => { onInsertRow(contextMenu.rowId, 'before'); setContextMenu(null); }}>
                   <ICONS.ArrowLeft className="w-3.5 h-3.5" /> 向左插入记录
               </div>
               <div className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700" onClick={() => { onInsertRow(contextMenu.rowId, 'after'); setContextMenu(null); }}>
                   <ICONS.ArrowRight className="w-3.5 h-3.5" /> 向右插入记录
               </div>
               <div className="border-t border-gray-100 my-1"></div>
               <div className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700" onClick={() => { setEditingRowId(contextMenu.rowId); setContextMenu(null); }}>
                   <ICONS.Eye className="w-3.5 h-3.5" /> 查看详情
               </div>
               <div className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700" onClick={() => { onOpenComment(contextMenu.rowId, columns[0]?.id || allColumns[0].id); setContextMenu(null); }}>
                   <ICONS.Message className="w-3.5 h-3.5" /> 评论
               </div>
               <div className="border-t border-gray-100 my-1"></div>
               <div className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-red-600" onClick={() => { setRowToDelete(contextMenu.rowId); setContextMenu(null); }}>
                   <ICONS.Trash className="w-3.5 h-3.5" /> 删除记录
               </div>
           </div>
       )}

       {/* Row Detail Panel */}
       {editingRowId && (
           <RowDetailPanel
               row={rows.find(r => r.id === editingRowId)!}
               columns={allColumns}
               onClose={() => setEditingRowId(null)}
               onChange={onCellChange}
           />
       )}

       {/* File Preview Modal */}
       {previewFile && (
           <FilePreviewModal
               isOpen={!!previewFile}
               fileBlob={previewFile.blob}
               filename={previewFile.filename || ''}
               onClose={() => setPreviewFile(null)}
           />
       )}

       {/* Loading Overlay */}
       {isPreviewLoading && (
           <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
               <div className="bg-white p-4 rounded-lg shadow-lg flex items-center gap-3">
                   <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                   <span className="text-sm font-medium text-gray-700">加载文件...</span>
               </div>
           </div>
       )}
    </div>
  );
};

export default GalleryView;
