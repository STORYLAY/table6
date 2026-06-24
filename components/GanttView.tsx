import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Column, Row, FieldType } from '../types';

/* 
Tailwind Safelist:
bg-primary-500 bg-red-500 bg-orange-500 bg-amber-500 bg-green-500 bg-teal-500 bg-blue-500 bg-indigo-500 bg-purple-500 bg-pink-500
bg-gray-500 bg-yellow-500 bg-rose-500
*/
import { evaluateFormula } from '../formulaUtils';
import { ICONS, FIELD_TYPE_ICONS, getTagColor, formatDateForDisplay, formatDateForInput, parseLinkValues, parseJsonArray, formatFieldValue } from '../constants';
import { api } from '../services/api';
import { Tooltip } from './Tooltip';
import { ClickOutsideWrapper } from './ClickOutsideWrapper';
import { FilePreviewModal } from './FilePreviewModal';
import LinkRecordDialog from './LinkRecordDialog';
import { UserSelector } from './UserSelector';
import { UserCellDisplay } from './UserCellDisplay';
import { SelectCellEditor, MultiSelectCellEditor, AutoResizeTextarea } from './CellEditors';

interface GanttViewProps {
  tableId: string;
  columns: Column[]; // Visible columns for left panel
  allColumns: Column[]; // All columns for field resolution
  rows: Row[];
  dateFieldId?: string;
  endDateFieldId?: string;
  titleFieldId?: string;
  colorFieldId?: string;
  customColor?: string;
  isWorkdayOnly?: boolean;
  viewMode?: 'week' | 'month' | 'quarter' | 'year';
  onViewModeChange: (mode: 'week' | 'month' | 'quarter' | 'year') => void;
  onAddRow: (initialData: Record<string, any>) => void; // Support click-to-add
  onDirectAddRow?: (data: Record<string, any>) => void;
  onInsertRow: (targetRowId: string, position: 'before' | 'after', initialData?: Record<string, any>, count?: number) => void;
  onDeleteRows: (rowIds: string[]) => void;
  onOpenComment: (rowId: string, colId: string) => void;
  onColumnResize: (colId: string, width: number) => void;
  onCellChange: (rowId: string, colId: string, value: any) => void;
  onBatchCellChange?: (rowId: string, updates: Record<string, any>) => void;
  onColumnUpdate: (col: Column) => void;
  onOpenDetail?: (row: Row) => void;
  commentCounts?: Record<string, number>;
  searchKeyword?: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

// Helper: Get color
const getOptionColor = (text: string) => {
    const colors = [
      'bg-primary-500 border-primary-600',
      'bg-green-500 border-green-600',
      'bg-yellow-500 border-yellow-600',
      'bg-purple-500 border-purple-600',
      'bg-pink-500 border-pink-600',
      'bg-indigo-500 border-indigo-600',
      'bg-orange-500 border-orange-600',
      'bg-teal-500 border-teal-600',
    ];
    if (!text) return 'bg-gray-400 border-gray-500';
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
};

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

// Helper: Get ISO Week number
function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const GanttView: React.FC<GanttViewProps> = ({ 
    tableId,
    columns, 
    allColumns,
    rows, 
    dateFieldId, 
    endDateFieldId, 
    titleFieldId,
    colorFieldId,
    customColor,
    isWorkdayOnly,
    viewMode = 'month',
    onViewModeChange,
    onAddRow,
    onDirectAddRow,
    onInsertRow,
    onDeleteRows,
    onOpenComment,
    onColumnResize,
    onCellChange,
    onBatchCellChange,
    onColumnUpdate,
    onOpenDetail,
    commentCounts = {},
    searchKeyword,
    hasMore,
    isLoadingMore,
    onLoadMore
}) => {
  // Use allColumns for resolution to ensure fields are found even if hidden in left panel
  const colsToSearch = allColumns && allColumns.length > 0 ? allColumns : columns;

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

  const targetDateCol = dateFieldId 
    ? colsToSearch.find(c => c.id === dateFieldId) 
    : colsToSearch.find(c => c.type === FieldType.DATE);
  
  const targetEndDateCol = endDateFieldId
    ? colsToSearch.find(c => c.id === endDateFieldId)
    : undefined;

  const targetTitleCol = titleFieldId
    ? colsToSearch.find(c => c.id === titleFieldId)
    : colsToSearch[0];

  // --- Resizing Logic ---
  const [resizingCol, setResizingCol] = useState<{ id: string, startX: number, startWidth: number, currentWidth: number } | null>(null);
  const [activeEditingCell, setActiveEditingCell] = useState<{ rowId: string, colId: string, rect?: DOMRect } | null>(null);
  const [editingValue, setEditingValue] = useState<any>(null);
  const isSavingRef = useRef(false);
  const [focusedCell, setFocusedCell] = useState<{ rowId: string, colId: string } | null>(null);
  const hiddenInputRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [lastSelectedRowId, setLastSelectedRowId] = useState<string | null>(null);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  // Clean up selected ids, focused cell, etc when rows are deleted or updated
  useEffect(() => {
    if (!rows || rows.length === 0) {
      if (selectedRowIds.size > 0) setSelectedRowIds(new Set());
      if (focusedCell) setFocusedCell(null);
      if (lastSelectedRowId) setLastSelectedRowId(null);
      return;
    }

    const existingIds = new Set<string>();
    const collectIdsRecursive = (items: Row[]) => {
      for (const item of items) {
        if (!item.isGroup) {
          existingIds.add(item.id);
        }
        if (item.children && item.children.length > 0) {
          collectIdsRecursive(item.children);
        }
      }
    };
    collectIdsRecursive(rows);

    // 1. Filter out deleted row IDs from selectedRowIds
    if (selectedRowIds.size > 0) {
      let changed = false;
      const filteredSelected = new Set<string>();
      selectedRowIds.forEach((id) => {
        if (existingIds.has(id)) {
          filteredSelected.add(id);
        } else {
          changed = true;
        }
      });
      if (changed) {
        setSelectedRowIds(filteredSelected);
      }
    }

    // 2. Clear focusedCell if its row was deleted
    if (focusedCell && !existingIds.has(focusedCell.rowId)) {
      setFocusedCell(null);
    }

    // 3. Clear lastSelectedRowId if its row was deleted
    if (lastSelectedRowId && !existingIds.has(lastSelectedRowId)) {
      setLastSelectedRowId(null);
    }
  }, [rows, selectedRowIds, focusedCell, lastSelectedRowId]);
  const seenGroupIdsRef = useRef<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, rowId: string, colId?: string } | null>(null);
  const [insertAboveCount, setInsertAboveCount] = useState(1);
  const [insertBelowCount, setInsertBelowCount] = useState(1);
  const [previewFile, setPreviewFile] = useState<{ blob: Blob, filename: string } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
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

  const saveEditing = () => {
      if (activeEditingCell && !isSavingRef.current) {
          isSavingRef.current = true;
          
          if (editingValue !== null && editingValue !== undefined) {
              const row = findRowInTree(rows, activeEditingCell.rowId);
              const originalVal = row?.data?.[activeEditingCell.colId];
              
              if (editingValue !== originalVal) {
                  onCellChange(activeEditingCell.rowId, activeEditingCell.colId, editingValue);
              }
          }
          
          setActiveEditingCell(null);
          setEditingValue(null);
          setTimeout(() => { isSavingRef.current = false; }, 100);
      }
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
          const toast = (await import('sonner')).toast;
          toast.error(e.message || '获取文件内容失败');
      } finally {
          setIsPreviewLoading(false);
      }
  };

  // Flatten rows for rendering (handling groups and expansion)
  const [hoveredCell, setHoveredCell] = useState<{ 
      rowId: string, 
      colId: string, 
      rect: DOMRect, 
      content: string 
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [timelineDrag, setTimelineDrag] = useState<{
      active: boolean;
      mode: 'move' | 'resize-start' | 'resize-end';
      rowId: string;
      initialX: number;
      initialStartStr: string;
      initialEndStr: string;
      currentStartStr: string;
      currentEndStr: string;
  } | null>(null);

  const [savingRows, setSavingRows] = useState<Record<string, { start: string, end: string }>>({});

  useEffect(() => {
     if (Object.keys(savingRows).length === 0) return;
     setSavingRows(prev => {
         const next = { ...prev };
         let changed = false;
         for (const [rowId, val] of Object.entries(prev) as [string, { start: string, end: string }][]) {
             const row = findRowInTree(rows, rowId);
             if (row) {
                 const actualStart = row.data?.[targetDateCol?.id || ''];
                 const actualEnd = row.data?.[targetEndDateCol?.id || ''];
                 if (actualStart === val.start && (targetEndDateCol ? actualEnd === val.end : true)) {
                     delete next[rowId];
                     changed = true;
                 }
             }
         }
         return changed ? next : prev;
     });
  }, [rows, targetDateCol, targetEndDateCol, savingRows]);

  const handleCellMouseEnter = (e: React.MouseEvent, row: Row, col: Column, content: any) => {
      // If content is empty or we are editing, do not show hover
      if (!content || activeEditingCell) return;
      // Convert to string to check length
      const strContent = formatFieldValue(content, col.type);
      const isLookup = col.type === FieldType.LOOKUP || col.type === FieldType.SEARCH_REFERENCE;
      if (!isLookup && strContent.trim().length < 5) return; 

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      
      hoverTimeoutRef.current = setTimeout(() => {
          setHoveredCell({ rowId: row.id, colId: col.id, rect, content: strContent });
      }, 600); 
  };

  const handleCellMouseLeave = () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      setHoveredCell(null);
  };

  const CommentBadge = ({ count, rowId, colId, isHover = false }: { count: number, rowId: string, colId: string, isHover?: boolean }) => {
      if (count <= 0) return null;
      if (isHover) {
          return (
            <Tooltip content="查看评论">
                <div 
                    className="flex items-center text-gray-400 text-[10px] gap-1 px-1.5 border-l border-gray-100 ml-1 hover:text-primary-600 cursor-pointer transition-colors"
                    onClick={(e) => { e.stopPropagation(); onOpenComment(rowId, colId); }}
                >
                    <ICONS.Message className="w-3 h-3 text-yellow-500" />
                    <span className="font-bold text-yellow-600">{count}</span>
                </div>
            </Tooltip>
          );
      }
      return (
        <Tooltip content="查看评论">
            <div 
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] font-bold px-1.5 py-0.5 rounded-md z-10 flex items-center gap-1 cursor-pointer hover:bg-yellow-50 transition-colors"
                onClick={(e) => { e.stopPropagation(); onOpenComment(rowId, colId); }}
            >
                 <ICONS.Message className="w-3 h-3 text-yellow-500" />
                 <span className="text-yellow-600">{count}</span>
            </div>
        </Tooltip>
      );
  };

  const flattenedRows = useMemo(() => {
      const result: { row: Row, level: number, isGroup: boolean }[] = [];
      
      const traverse = (nodes: Row[], level: number) => {
          nodes.forEach(node => {
              if (node.isGroup) {
                  result.push({ row: node, level, isGroup: true });
                  if (expandedRowIds.has(node.id) && node.children) {
                      traverse(node.children, level + 1);
                  }
              } else {
                  result.push({ row: node, level, isGroup: false });
                  // If we support subtasks in future, handle children here
                  if (node.children && expandedRowIds.has(node.id)) {
                      traverse(node.children, level + 1);
                  }
              }
          });
      };
      traverse(rows, 0);
      return result;
  }, [rows, expandedRowIds]);

  // Reset expanded group IDs cache and expanded items when switching tables
  useEffect(() => {
     seenGroupIdsRef.current.clear();
     setExpandedRowIds(new Set());
  }, [tableId]);

  // Auto-expand groups
  useEffect(() => {
     let changed = false;
     const newExpanded = new Set(expandedRowIds);
     
     const findGroups = (r: Row[]) => {
         r.forEach(row => {
             if (row.isGroup || (row.children && row.children.length > 0)) {
                 if (!seenGroupIdsRef.current.has(row.id)) {
                     seenGroupIdsRef.current.add(row.id);
                     newExpanded.add(row.id);
                     changed = true;
                 }
                 if (row.children) findGroups(row.children);
             }
         });
     };
     findGroups(rows);
     
     if (changed) {
         setExpandedRowIds(newExpanded);
     }
  }, [rows, expandedRowIds]);

  const toggleRow = (rowId: string) => {
      const newSet = new Set(expandedRowIds);
      if (newSet.has(rowId)) {
          newSet.delete(rowId);
      } else {
          newSet.add(rowId);
      }
      setExpandedRowIds(newSet);
  };

  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  const [scrollX, setScrollX] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1000);

  // Sync Scrolling and Virtualization state
  useEffect(() => {
      const left = leftPanelRef.current;
      const right = rightPanelRef.current;
      if (!left || !right) return;

      setViewportWidth(right.clientWidth);
      let lastScrollX = right.scrollLeft;
      setScrollX(lastScrollX);

      const handleScroll = (e: Event) => {
          updateHiddenInputPosition();
          const target = e.target as HTMLDivElement;
          if (target === right) {
              left.scrollTop = right.scrollTop;
              if (Math.abs(right.scrollLeft - lastScrollX) > 200) {
                  lastScrollX = right.scrollLeft;
                  setScrollX(lastScrollX);
              }
          }
      };
      
      right.addEventListener('scroll', handleScroll, { passive: true });
      
      const resizeObserver = new ResizeObserver(entries => {
          for (let entry of entries) {
              if (entry.target === right) {
                  setViewportWidth(entry.contentRect.width);
              }
          }
      });
      resizeObserver.observe(right);

      return () => {
          right.removeEventListener('scroll', handleScroll);
          resizeObserver.disconnect();
      };
  }, []);

  // Global Mouse Events for Resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (resizingCol) {
            e.preventDefault();
            const diff = e.clientX - resizingCol.startX;
            const newWidth = Math.max(60, resizingCol.startWidth + diff); 
            setResizingCol(prev => prev ? { ...prev, currentWidth: newWidth } : null);
        }
    };

    const handleMouseUp = () => {
        if (resizingCol) {
            onColumnResize(resizingCol.id, resizingCol.currentWidth);
            setResizingCol(null);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = '';
        }
    };

    if (resizingCol) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }

    return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
    };
  }, [resizingCol, onColumnResize]);

  const startResizeCol = (e: React.MouseEvent, colId: string, width: number) => {
      e.preventDefault();
      e.stopPropagation();
      setResizingCol({ 
          id: colId, 
          startX: e.clientX, 
          startWidth: width,
          currentWidth: width
      });
  };

  const getSelectableRowIds = (rowsList: Row[]): string[] => {
      let ids: string[] = [];
      rowsList.forEach(row => {
          if (!row.isGroup) {
              ids.push(row.id);
          }
          if (row.children) {
              ids = ids.concat(getSelectableRowIds(row.children));
          }
      });
      return ids;
  };

  const handleRowSelect = (e: React.MouseEvent, rowId: string) => {
      e.stopPropagation();
      const newSet = new Set(selectedRowIds);
      
      if (e.shiftKey && lastSelectedRowId) {
          const selectableIds = getSelectableRowIds(rows);
          const startIdx = selectableIds.indexOf(lastSelectedRowId);
          const endIdx = selectableIds.indexOf(rowId);
          
          if (startIdx !== -1 && endIdx !== -1) {
              const minIdx = Math.min(startIdx, endIdx);
              const maxIdx = Math.max(startIdx, endIdx);
              
              for (let i = minIdx; i <= maxIdx; i++) {
                  newSet.add(selectableIds[i]);
              }
          } else {
              if (newSet.has(rowId)) {
                  newSet.delete(rowId);
              } else {
                  newSet.add(rowId);
              }
          }
      } else {
          if (newSet.has(rowId)) {
              newSet.delete(rowId);
          } else {
              newSet.add(rowId);
          }
      }
      
      setSelectedRowIds(newSet);
      setLastSelectedRowId(rowId);
  };

  const handleSelectAll = () => {
      const selectableIds = getSelectableRowIds(rows);
      if (selectedRowIds.size === selectableIds.length && selectableIds.length > 0) {
          setSelectedRowIds(new Set());
      } else {
          setSelectedRowIds(new Set(selectableIds));
      }
  };

  const handleContextMenu = (e: React.MouseEvent, rowId: string, colId?: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      const menuWidth = 160;
      const menuHeight = colId ? 380 : 280;
      const offsetBuffer = 20; // Add a small buffer to ensure it doesn't clip
      
      let x = e.clientX;
      let y = e.clientY;
      
      if (window.innerWidth - x < menuWidth + offsetBuffer) {
          x = window.innerWidth - menuWidth - offsetBuffer;
      }
      
      if (window.innerHeight - y < menuHeight + offsetBuffer) {
          y = window.innerHeight - menuHeight - offsetBuffer;
      }
      
      setContextMenu({ x: Math.max(0, x), y: Math.max(0, y), rowId, colId });
  };

  useEffect(() => {
      const handleClick = () => setContextMenu(null);
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
  }, []);

  // --- Keyboard navigation logic start ---
  const startEditing = (rowId: string, colId: string, initialValue: any) => {
      const el = document.querySelector(`[data-row-id="${rowId}"][data-col-id="${colId}"]`);
      if (el) {
          setActiveEditingCell({ rowId, colId, rect: el.getBoundingClientRect() });
          setEditingValue(initialValue);
      }
  };

  const navigateToCell = React.useCallback((rowId: string, colId: string, direction: 'next' | 'prev') => {
      const flatRows = flattenedRows.filter(r => !r.isGroup);
      const rIdx = flatRows.findIndex(r => r.row.id === rowId);
      const cIdx = columns.findIndex(c => c.id === colId);
      if (rIdx === -1 || cIdx === -1) return;

      let nextR = rIdx;
      let nextC = cIdx;

      if (direction === 'next') {
          if (cIdx < columns.length - 1) {
              nextC = cIdx + 1;
          } else if (rIdx < flatRows.length - 1) {
              nextC = 0;
              nextR = rIdx + 1;
          } else {
              return;
          }
      } else {
          if (cIdx > 0) {
              nextC = cIdx - 1;
          } else if (rIdx > 0) {
              nextC = columns.length - 1;
              nextR = rIdx - 1;
          } else {
              return;
          }
      }

      const nextRow = flatRows[nextR];
      const nextCol = columns[nextC];
      if (nextRow && nextCol) {
          setFocusedCell({ rowId: nextRow.row.id, colId: nextCol.id });
          setTimeout(() => {
              const element = document.querySelector(`[data-row-id="${nextRow.row.id}"][data-col-id="${nextCol.id}"]`);
              if (element) {
                  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }
          }, 0);
      }
  }, [flattenedRows, columns]);

  const moveVertical = React.useCallback((rowId: string, colId: string, offset: number) => {
      const flatRows = flattenedRows.filter(r => !r.isGroup);
      const rIdx = flatRows.findIndex(r => r.row.id === rowId);
      if (rIdx === -1) return;
      const nextR = rIdx + offset;
      if (nextR >= 0 && nextR < flatRows.length) {
          const nextRow = flatRows[nextR];
          setFocusedCell({ rowId: nextRow.row.id, colId });
          setTimeout(() => {
              const element = document.querySelector(`[data-row-id="${nextRow.row.id}"][data-col-id="${colId}"]`);
              if (element) {
                  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }
          }, 0);
      }
  }, [flattenedRows]);

  const updateHiddenInputPosition = React.useCallback(() => {
      if (focusedCell && !activeEditingCell && hiddenInputRef.current) {
          const el = document.querySelector(`[data-row-id="${focusedCell.rowId}"][data-col-id="${focusedCell.colId}"]`);
          if (el) {
              const rect = el.getBoundingClientRect();
              hiddenInputRef.current.style.left = `${rect.left}px`;
              hiddenInputRef.current.style.top = `${rect.top}px`;
              hiddenInputRef.current.style.width = `${rect.width}px`;
              hiddenInputRef.current.style.height = `${rect.height}px`;
          }
      }
  }, [focusedCell, activeEditingCell]);

  useEffect(() => {
      if (focusedCell && !activeEditingCell && hiddenInputRef.current) {
          setTimeout(() => {
              updateHiddenInputPosition();
              if (hiddenInputRef.current) {
                  hiddenInputRef.current.focus({ preventScroll: true });
              }
          }, 0);
      }
  }, [focusedCell, activeEditingCell, updateHiddenInputPosition]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          const isHiddenInput = e.target === hiddenInputRef.current;
          const isInput = (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) && !isHiddenInput;
          
          if (isInput) {
              if (e.key === 'Tab') {
                  e.preventDefault();
                  const currentCell = activeEditingCell || focusedCell;
                  if (currentCell) {
                      saveEditing();
                      navigateToCell(currentCell.rowId, currentCell.colId, e.shiftKey ? 'prev' : 'next');
                  }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const currentCell = activeEditingCell || focusedCell;
                  if (currentCell) {
                      saveEditing();
                      moveVertical(currentCell.rowId, currentCell.colId, e.shiftKey ? -1 : 1);
                  }
              }
              if (e.key === 'Escape') {
                  setActiveEditingCell(null);
                  setEditingValue(null);
              }
              return;
          }

          if (!focusedCell || activeEditingCell) {
              if (e.key === 'Escape' && activeEditingCell) {
                  setActiveEditingCell(null);
                  setEditingValue(null);
              }
              return;
          }

          if (e.ctrlKey || e.metaKey || e.altKey) return;

          if (e.key === 'Tab') {
              e.preventDefault();
              navigateToCell(focusedCell.rowId, focusedCell.colId, e.shiftKey ? 'prev' : 'next');
              return;
          }

          if (e.key === 'ArrowRight') {
              e.preventDefault();
              navigateToCell(focusedCell.rowId, focusedCell.colId, 'next');
              return;
          } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              navigateToCell(focusedCell.rowId, focusedCell.colId, 'prev');
              return;
          } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              moveVertical(focusedCell.rowId, focusedCell.colId, -1);
              return;
          } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              moveVertical(focusedCell.rowId, focusedCell.colId, 1);
              return;
          }

          const col = columns.find(c => c.id === focusedCell.colId);
          if (!col) return;

          const row = flattenedRows.find(r => r.row.id === focusedCell.rowId)?.row;
          if (!row) return;

          if (e.key === 'F2') {
              e.preventDefault();
              if ([FieldType.USER, FieldType.DEPARTMENT, FieldType.SELECT, FieldType.MULTI_SELECT, FieldType.ATTACHMENT].includes(col.type)) {
                  const cellElement = document.querySelector(`[data-row-id="${focusedCell.rowId}"][data-col-id="${focusedCell.colId}"]`);
                  const rect = cellElement?.getBoundingClientRect();
                  setActiveEditingCell({ rowId: focusedCell.rowId, colId: focusedCell.colId, rect });
              } else if (col.type === FieldType.LINK) {
                  const targetTableId = col.config?.linked_table_id;
                  if (targetTableId) {
                      const primaryColId = columns[0]?.id;
                      const rowTitle = primaryColId ? String(row.data[primaryColId] || row.id) : row.id;
                      const val = row.data[col.id];
                      const values = Array.isArray(val) ? val : (val ? [val] : []);
                      setLinkDialogState({
                          isOpen: true,
                          rowId: row.id,
                          colId: col.id,
                          targetTableId,
                          initialValues: values,
                          title: rowTitle
                      });
                  }
              } else if (![FieldType.CHECKBOX, FieldType.FORMULA, FieldType.LOOKUP, FieldType.SEARCH_REFERENCE].includes(col.type)) {
                  startEditing(focusedCell.rowId, focusedCell.colId, row.data[col.id]);
              }
              return;
          }

          if (e.key === 'Enter') {
              e.preventDefault();
              moveVertical(focusedCell.rowId, focusedCell.colId, e.shiftKey ? -1 : 1);
              return;
          }
          
          if (e.key === 'Backspace' || e.key === 'Delete') {
              e.preventDefault();
              if (col.type !== FieldType.CHECKBOX && col.type !== FieldType.FORMULA && col.type !== FieldType.LOOKUP) {
                  onCellChange(row.id, col.id, '');
              }
              return;
          }

          if (e.key.length === 1) {
              const textTypes = [FieldType.TEXT, FieldType.NUMBER, FieldType.HYPERLINK];
              if (textTypes.includes(col.type)) {
                  if (e.keyCode === 229 || e.isComposing) {
                      return;
                  }
                  if (isHiddenInput) {
                      startEditing(focusedCell.rowId, focusedCell.colId, e.key);
                  }
              }
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedCell, activeEditingCell, flattenedRows, columns, navigateToCell, moveVertical]);
  // --- Keyboard navigation logic end ---

  // --- 1. Timeline Config based on ViewMode ---
  const timelineConfig = useMemo(() => {
      switch (viewMode) {
          case 'week': return { cellWidth: 100, unit: 'day', step: 1 };
          case 'month': return { cellWidth: 40, unit: 'day', step: 1 };
          case 'quarter': return { cellWidth: 60, unit: 'week', step: 7 }; // Week granularity
          case 'year': return { cellWidth: 80, unit: 'month', step: 30 }; // Month granularity
          default: return { cellWidth: 40, unit: 'day', step: 1 };
      }
  }, [viewMode]);

  useEffect(() => {
      if (!timelineDrag?.active) return;
      
      const onMouseMove = (e: MouseEvent) => {
          setTimelineDrag(prev => {
              if (!prev || !targetDateCol) return prev;
              const deltaX = e.clientX - prev.initialX;
              
              let daysMoved = 0;
              if (viewMode === 'month' || viewMode === 'week') {
                  daysMoved = Math.round(deltaX / timelineConfig.cellWidth);
              } else if (viewMode === 'quarter') {
                  daysMoved = Math.round(deltaX / (timelineConfig.cellWidth / 7));
              } else if (viewMode === 'year') {
                  daysMoved = Math.round(deltaX / (timelineConfig.cellWidth / 30.4375));
              }

              const addDaysToYYYYMMDD = (dateStr: string, days: number): string => {
                 const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
                 const date = new Date(Date.UTC(y, m - 1, d));
                 date.setUTCDate(date.getUTCDate() + days);
                 return date.toISOString().split('T')[0];
              };

              let currentStartStr = prev.initialStartStr;
              let currentEndStr = prev.initialEndStr || prev.initialStartStr;

              if (prev.mode === 'move') {
                  currentStartStr = addDaysToYYYYMMDD(prev.initialStartStr, daysMoved);
                  currentEndStr = addDaysToYYYYMMDD(prev.initialEndStr || prev.initialStartStr, daysMoved);
              } else if (prev.mode === 'resize-start') {
                  currentStartStr = addDaysToYYYYMMDD(prev.initialStartStr, daysMoved);
                  if (currentStartStr > currentEndStr) currentStartStr = currentEndStr;
              } else if (prev.mode === 'resize-end') {
                  currentEndStr = addDaysToYYYYMMDD(prev.initialEndStr || prev.initialStartStr, daysMoved);
                  if (currentEndStr < currentStartStr) currentEndStr = currentStartStr;
              }

              if (currentStartStr === prev.currentStartStr && currentEndStr === prev.currentEndStr) {
                  return prev;
              }

              return {
                  ...prev,
                  currentStartStr,
                  currentEndStr
              };
          });
      };

      const onMouseUp = (e: MouseEvent) => {
          setTimelineDrag(prev => {
              if (prev && targetDateCol && (prev.currentStartStr !== prev.initialStartStr || prev.currentEndStr !== prev.initialEndStr)) {
                  setSavingRows(s => ({ ...s, [prev.rowId]: { start: prev.currentStartStr, end: prev.currentEndStr } }));
                  
                  if (onBatchCellChange) {
                      const updates: Record<string, any> = { [targetDateCol.id]: prev.currentStartStr };
                      if (targetEndDateCol) {
                          updates[targetEndDateCol.id] = prev.currentEndStr;
                      }
                      onBatchCellChange(prev.rowId, updates);
                  } else {
                      onCellChange(prev.rowId, targetDateCol.id, prev.currentStartStr);
                      if (targetEndDateCol) {
                          onCellChange(prev.rowId, targetEndDateCol.id, prev.currentEndStr);
                      }
                  }
              }
              return null;
          });
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
      };
  }, [timelineDrag?.active, viewMode, timelineConfig.cellWidth, targetDateCol, targetEndDateCol, onCellChange, onBatchCellChange]);

  const getAffectedRowCount = (targetIds: Set<string>): number => {
      let count = 0;
      const traverse = (nodes: Row[]) => {
          for (const node of nodes) {
              if (targetIds.has(node.id)) {
                  count += 1 + countDescendants(node);
              } else {
                  if (node.children) {
                      traverse(node.children);
                  }
              }
          }
      };
      const countDescendants = (node: Row): number => {
          if (!node.children) return 0;
          return node.children.reduce((acc, child) => acc + 1 + countDescendants(child), 0);
      };
      traverse(rows);
      return count;
  };

  const indexColWidth = 40;
  const totalLeftPanelWidth = columns.reduce((acc, col) => {
      const width = resizingCol?.id === col.id ? resizingCol.currentWidth : (col.width || 150);
      return acc + width;
  }, 0) + indexColWidth;

  // --- 2. Calculate Date Range & Generate Units ---
  const { timelineUnits, minDate, maxDate, totalWidth } = useMemo(() => {
      let minTs = Infinity;
      let maxTs = -Infinity;
      const today = new Date(); today.setHours(0,0,0,0);

      // Recursive helper to find range
      const findRange = (nodes: Row[]) => {
          nodes.forEach(r => {
              if (r.isGroup) {
                  if (r.children) findRange(r.children);
                  return;
              }
              const startStr = targetDateCol ? r.data?.[targetDateCol.id] : null;
              const endStr = targetEndDateCol ? r.data?.[targetEndDateCol.id] : null;
              if (startStr) {
                  const d = new Date(startStr).getTime();
                  if (!isNaN(d)) { minTs = Math.min(minTs, d); maxTs = Math.max(maxTs, d); }
              }
              if (endStr) {
                  const d = new Date(endStr).getTime();
                  if (!isNaN(d)) { maxTs = Math.max(maxTs, d); }
              }
          });
      };
      
      findRange(rows);
      
      let hasData = minTs !== Infinity;

      if (!hasData) {
          minTs = today.getTime() - 15 * 24 * 3600 * 1000;
          maxTs = today.getTime() + 15 * 24 * 3600 * 1000;
      } else {
          // Buffers
          const buffer = viewMode === 'year' ? 180 : (viewMode === 'quarter' ? 60 : 15);
          minTs -= buffer * 24 * 3600 * 1000;
          maxTs += buffer * 24 * 3600 * 1000;
      }
      
      // Normalize Start Date based on view mode (start of month/week/year)
      const startDate = new Date(minTs);
      if (viewMode === 'year') startDate.setMonth(0, 1);
      else if (viewMode === 'quarter') startDate.setDate(startDate.getDate() - startDate.getDay()); // Start of week
      else if (viewMode === 'month') startDate.setDate(1); // Start of month

      const endDate = new Date(maxTs);
      
      const units = [];
      const curr = new Date(startDate);
      curr.setHours(0,0,0,0);

      while (curr <= endDate) {
          const unitDate = new Date(curr);
          let label = '';
          let subLabel = '';
          let isWeekend = false;
          let isToday = false;

          // Unit Logic
          if (viewMode === 'year') {
              label = `${unitDate.getMonth() + 1}月`;
              subLabel = `${unitDate.getFullYear()}`;
              isToday = unitDate.getMonth() === today.getMonth() && unitDate.getFullYear() === today.getFullYear();
              // Next step
              curr.setMonth(curr.getMonth() + 1);
          } else if (viewMode === 'quarter') {
              const wn = getWeekNumber(unitDate);
              label = `${wn}周`;
              isToday = wn === getWeekNumber(today) && unitDate.getFullYear() === today.getFullYear();
              // Next step
              curr.setDate(curr.getDate() + 7);
          } else {
              // Day based (Week / Month)
              label = `${unitDate.getDate()}`;
              isWeekend = unitDate.getDay() === 0 || unitDate.getDay() === 6;
              isToday = unitDate.getTime() === today.getTime();
              // Next step
              curr.setDate(curr.getDate() + 1);
          }

          units.push({
              date: unitDate,
              label,
              subLabel,
              isWeekend,
              isToday,
              left: units.length * timelineConfig.cellWidth
          });
      }

      return { timelineUnits: units, minDate: startDate, maxDate: endDate, totalWidth: units.length * timelineConfig.cellWidth };
  }, [rows, targetDateCol, targetEndDateCol, viewMode, timelineConfig]);

  // --- 3. Headers Grouping ---
  const headerGroups = useMemo(() => {
      const groups: { label: string, width: number }[] = [];
      if (timelineUnits.length === 0) return groups;

      let currentLabel = '';
      let count = 0;

      timelineUnits.forEach(u => {
          let label = '';
          if (viewMode === 'year') label = `${u.date.getFullYear()}年`;
          else if (viewMode === 'quarter') label = `${u.date.getFullYear()}年${u.date.getMonth() + 1}月`;
          else label = `${u.date.getFullYear()}年${u.date.getMonth() + 1}月`; // Month/Week

          if (label !== currentLabel) {
              if (currentLabel) groups.push({ label: currentLabel, width: count * timelineConfig.cellWidth });
              currentLabel = label;
              count = 1;
          } else {
              count++;
          }
      });
      groups.push({ label: currentLabel, width: count * timelineConfig.cellWidth });
      return groups;
  }, [timelineUnits, viewMode, timelineConfig]);

  // --- 4. Render Logic ---
  const { visibleStartIndex, visibleEndIndex } = useMemo(() => {
      const buffer = 10;
      const start = Math.max(0, Math.floor(scrollX / timelineConfig.cellWidth) - buffer);
      const end = Math.min(timelineUnits.length, Math.ceil((scrollX + viewportWidth) / timelineConfig.cellWidth) + buffer);
      return { visibleStartIndex: start, visibleEndIndex: end };
  }, [scrollX, viewportWidth, timelineConfig.cellWidth, timelineUnits.length]);

  const visibleUnits = useMemo(() => timelineUnits.slice(visibleStartIndex, visibleEndIndex), [timelineUnits, visibleStartIndex, visibleEndIndex]);

  const todayUnit = timelineUnits.find(u => u.isToday);
  const todayLeft = todayUnit ? todayUnit.left + (timelineConfig.cellWidth / 2) : -1;

  if (!targetDateCol) return <div className="flex-1 flex flex-col items-center justify-center text-gray-400"><ICONS.Gantt /><p>需配置开始日期</p></div>;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      updateHiddenInputPosition();
      const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 100;
      if (bottom && hasMore && !isLoadingMore && onLoadMore) {
          onLoadMore();
      }
  };

  const handleTimelineClick = (unitDate: Date) => {
      const dateStr = unitDate.toISOString().split('T')[0];
      const newRowData: any = {};
      if (targetDateCol) newRowData[targetDateCol.id] = dateStr;
      if (targetEndDateCol) newRowData[targetEndDateCol.id] = dateStr;
      if (onDirectAddRow) {
          onDirectAddRow(newRowData);
      } else {
          onAddRow(newRowData);
      }
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden h-full relative text-gray-700 select-none">
       <textarea 
           ref={hiddenInputRef}
           className="fixed opacity-0 p-0 m-0 border-0 outline-none pointer-events-none text-xs px-3"
           style={{ zIndex: -1, resize: 'none', background: 'transparent' }}
           onCompositionStart={() => { 
               updateHiddenInputPosition();
               isComposingRef.current = true; 
           }}
           onCompositionEnd={(e) => {
               isComposingRef.current = false;
               if (focusedCell && !activeEditingCell) {
                   const col = columns.find(c => c.id === focusedCell.colId);
                   if (col && [FieldType.TEXT, FieldType.NUMBER, FieldType.HYPERLINK].includes(col.type)) {
                       startEditing(focusedCell.rowId, focusedCell.colId, e.currentTarget.value);
                       e.currentTarget.value = '';
                   }
               }
           }}
           onBlur={() => {
               if (hiddenInputRef.current) hiddenInputRef.current.value = '';
           }}
       />
      {/* Top Bar with Switcher */}
      <div className="h-10 border-b border-gray-200 flex items-center justify-between px-4 bg-white shrink-0 z-30">
          <div className="text-sm font-bold text-gray-700 flex items-center gap-2">
              {headerGroups[0]?.label || '甘特图'} 
              <span className="text-gray-400 font-normal text-xs">({rows.length} 任务)</span>
              {hasMore && (
                  <button 
                      onClick={() => onLoadMore && onLoadMore()} 
                      disabled={isLoadingMore}
                      className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-primary-50 transition-colors ml-2 font-normal"
                  >
                      {isLoadingMore ? <span className="animate-pulse">加载中...</span> : '加载更多数据'}
                  </button>
              )}
          </div>
          <div className="flex bg-gray-100 p-0.5 rounded-md">
              {['week', 'month', 'quarter', 'year'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onViewModeChange(mode as any)}
                    className={`px-3 py-1 text-xs rounded transition-all ${viewMode === mode ? 'bg-white text-primary-600 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                      {{'week': '周', 'month': '月', 'quarter': '季', 'year': '年'}[mode]}
                  </button>
              ))}
          </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Grid */}
        <div 
            className="border-r border-gray-200 flex flex-col bg-white shadow-[2px_0_5px_rgba(0,0,0,0.05)] z-20 shrink-0 transition-[width] duration-75 ease-out overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200" 
            style={{ width: totalLeftPanelWidth, maxWidth: '60%' }}
        >
          {/* Header */}
          <div className="h-[60px] border-b border-gray-200 flex bg-[#fbfcfd] shrink-0" style={{ width: totalLeftPanelWidth }}>
             <div 
                 style={{ width: indexColWidth }} 
                 className="border-r border-gray-100 flex items-center justify-center text-gray-400 shrink-0 cursor-pointer"
                 onClick={handleSelectAll}
             >
                 {(() => {
                     const selectableIds = getSelectableRowIds(rows);
                     const isAllSelected = selectableIds.length > 0 && selectedRowIds.size === selectableIds.length;
                     const isSomeSelected = selectedRowIds.size > 0 && !isAllSelected;
                     if (isAllSelected) return <CheckboxChecked />;
                     if (isSomeSelected) return <div className="w-3 h-3 bg-primary-500 rounded flex items-center justify-center"><div className="w-2 h-0.5 bg-white rounded-sm" /></div>;
                     return <ICONS.Grid />;
                 })()}
             </div>
             {columns.map((col, idx) => {
                 const width = resizingCol?.id === col.id ? resizingCol.currentWidth : (col.width || 150);
                 return (
                 <div 
                    key={col.id} 
                    className="border-r border-gray-100 px-3 flex flex-col justify-center overflow-hidden relative group shrink-0"
                    style={{ width }}
                 >
                     <div className="flex items-center gap-1 text-[10px] text-gray-400">
                         {FIELD_TYPE_ICONS[col.type]}
                         <span className="truncate">{col.name}</span>
                     </div>
                     {/* Resizer */}
                     <div 
                        className="absolute right-0 top-0 bottom-0 w-4 translate-x-1/2 cursor-col-resize z-50 flex justify-center group/resizer"
                        onMouseDown={(e) => startResizeCol(e, col.id, width)}
                        onClick={(e) => e.stopPropagation()} 
                     >
                        <div className={`w-[2px] h-full transition-colors duration-150 ${resizingCol?.id === col.id ? 'bg-primary-600' : 'bg-transparent group-hover/resizer:bg-primary-400'}`} />
                     </div>
                 </div>
                 );
             })}
          </div>
          {/* Rows */}
          <div className="flex-1 overflow-hidden bg-white scrollbar-hide" ref={leftPanelRef} style={{ width: totalLeftPanelWidth }} onScroll={handleScroll}>
            {flattenedRows.map(({ row, level, isGroup }, idx) => {
              const isSelected = selectedRowIds.has(row.id);
              
              if (isGroup) {
                  const isExpanded = expandedRowIds.has(row.id);
                  return (
                      <div 
                          key={row.id} 
                          className="h-9 border-b border-gray-100 flex bg-gray-50/50 hover:bg-gray-100 transition-colors cursor-pointer"
                          onClick={() => toggleRow(row.id)}
                      >
                          <div style={{ width: indexColWidth }} className="border-r border-gray-100 flex items-center justify-center shrink-0">
                              {isExpanded ? <ICONS.ChevronDown className="w-3 h-3 text-gray-500" /> : <ICONS.ChevronRight className="w-3 h-3 text-gray-500" />}
                          </div>
                          <div className="flex-1 px-3 flex items-center text-xs font-medium text-gray-700 truncate">
                              <span style={{ paddingLeft: `${level * 16}px` }}>
                                  {((row.groupKey && !Array.isArray(row.groupKey)) ? (row.groupKey as any).label.join(' / ') : ((row.groupKey as string[] | undefined)?.join(' / ') || '未分组'))} 
                                  <span className="text-gray-400 font-normal ml-2">({row.data?.count || 0})</span>
                              </span>
                          </div>
                      </div>
                  );
              }

              return (
              <div 
                  key={row.id} 
                  className={`h-9 border-b border-gray-100 flex transition-colors group ${isSelected ? 'bg-primary-50 hover:bg-primary-50' : 'hover:bg-primary-50/30'} ${activeEditingCell?.rowId === row.id ? 'relative z-50' : ''}`}
                  onContextMenu={(e) => handleContextMenu(e, row.id)}
              >
                 <div 
                    style={{ width: indexColWidth }} 
                    className={`border-r border-gray-100 flex items-center justify-center text-[10px] shrink-0 cursor-pointer group/handle ${isSelected ? 'bg-primary-50' : 'bg-gray-50/30 text-gray-400'}`}
                    onClick={(e) => handleRowSelect(e, row.id)}
                 >
                     {!isSelected && (
                         <>
                             <span className="group-hover/handle:hidden">{idx + 1}</span>
                             <div className="hidden group-hover/handle:block"><CheckboxUnchecked /></div>
                         </>
                     )}
                     {isSelected && <CheckboxChecked />}
                 </div>
                 {columns.map((col, cIdx) => {
                     const isEditing = activeEditingCell?.rowId === row.id && activeEditingCell?.colId === col.id;
                     const val = row.data?.[col.id];
                     const width = resizingCol?.id === col.id ? resizingCol.currentWidth : (col.width || 150);
                     return (
                         <div 
                            key={col.id}
                            data-row-id={row.id}
                            data-col-id={col.id}
                            className={`border-r border-gray-100 px-0 flex items-center text-xs text-gray-700 min-w-0 shrink-0 cursor-text relative group/cell ${focusedCell?.rowId === row.id && focusedCell?.colId === col.id ? 'ring-2 ring-inset ring-primary-500 z-20 bg-primary-50/30' : ''}`}
                            style={{ width, paddingLeft: cIdx === 0 ? `${level * 16 + 12}px` : undefined }}
                            onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
                            onMouseLeave={handleCellMouseLeave}
                            onClick={(e) => {
                                if (e.shiftKey) {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    handleRowSelect(e, row.id);
                                } else if (col.type === FieldType.CHECKBOX) {
                                    setFocusedCell({ rowId: row.id, colId: col.id });
                                    setLastSelectedRowId(row.id);
                                    onCellChange(row.id, col.id, !val);
                                } else {
                                    if (focusedCell?.rowId === row.id && focusedCell?.colId === col.id) {
                                        setActiveEditingCell({ rowId: row.id, colId: col.id, rect: e.currentTarget.getBoundingClientRect() });
                                    } else {
                                        setLastSelectedRowId(row.id);
                                        setFocusedCell({ rowId: row.id, colId: col.id });
                                    }
                                }
                            }}
                            onDoubleClick={(e) => {
                                if (col.type !== FieldType.CHECKBOX) {
                                    setActiveEditingCell({ rowId: row.id, colId: col.id, rect: e.currentTarget.getBoundingClientRect() });
                                    setEditingValue(row.data?.[col.id]);
                                }
                            }}
                            onContextMenu={(e) => handleContextMenu(e, row.id, col.id)}
                         >
                             {cIdx === 0 && row.children && row.children.length > 0 && (
                                 <div 
                                     className="w-4 h-full flex items-center justify-center cursor-pointer hover:bg-gray-100 rounded mr-1 shrink-0 z-10"
                                     onClick={(e) => {
                                         e.stopPropagation();
                                         toggleRow(row.id);
                                     }}
                                 >
                                     {expandedRowIds.has(row.id) ? <ICONS.ChevronDown className="w-3 h-3 text-gray-400" /> : <ICONS.ChevronRight className="w-3 h-3 text-gray-400" />}
                                 </div>
                             )}
                             {isEditing ? (
                                 col.type === FieldType.USER ? (
                                     <>
                                         <div className="w-full h-full flex items-center gap-1 overflow-hidden px-1 opacity-50">
                                             <UserCellDisplay 
                                                 tableId={tableId}
                                                 rowId={row.id}
                                                 colId={col.id}
                                                 value={val}
                                                 searchKeyword={searchKeyword}
                                             />
                                         </div>
                                         {createPortal(
                                             <div className="fixed z-[9999]" style={{ top: activeEditingCell?.rect?.bottom, left: activeEditingCell?.rect?.left }}>
                                                 <div 
                                                     className="fixed inset-0 z-[100]" 
                                                     onClick={(e) => { e.stopPropagation(); setActiveEditingCell(null); }}
                                                 />
                                                 <div className="relative z-[101]">
                                                     <UserSelector 
                                                         value={val} 
                                                         onChange={(newVal) => {
                                                             onCellChange(row.id, col.id, newVal);
                                                             setActiveEditingCell(null);
                                                         }}
                                                         onClose={() => setActiveEditingCell(null)}
                                                     />
                                                 </div>
                                             </div>,
                                             document.body
                                          )}
                                      </>
                                  ) : col.type === FieldType.SELECT ? (
                                      <div className="w-full h-full relative">
                                          <div className="w-full h-full flex items-center px-2 border-2 border-primary-500 bg-white absolute inset-0 z-[101]">
                                               {(() => {
                                                   const colorStyle = getTagColor(val, col.config?.option_colors);
                                                   return val ? (
                                                       <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${colorStyle.bg} ${colorStyle.text} border border-transparent`}>
                                                           {val}
                                                       </div>
                                                   ) : null;
                                               })()}
                                           </div>
                                           <SelectCellEditor 
                                              val={val} 
                                              col={col} 
                                              row={row} 
                                              onCellChange={onCellChange} 
                                              onColumnUpdate={onColumnUpdate} 
                                              setActiveEditingCell={setActiveEditingCell} 
                                              rect={activeEditingCell?.rect}
                                          />
                                      </div>
                                  ) : col.type === FieldType.MULTI_SELECT ? (
                                      <div className="w-full h-full relative">
                                          <div className="w-full h-full flex items-center px-2 gap-1 overflow-hidden border-2 border-primary-500 bg-white absolute inset-0 z-[101]">
                                               {(() => {
                                                   const selectedValues = Array.isArray(val) ? val : (val ? String(val).split(',') : []);
                                                   return selectedValues.map((v: string, i: number) => {
                                                       const colorStyle = getTagColor(v, col.config?.option_colors);
                                                       return (
                                                           <div key={i} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${colorStyle.bg} ${colorStyle.text} border border-transparent shrink-0`}>
                                                               {v}
                                                           </div>
                                                       );
                                                   });
                                               })()}
                                           </div>
                                           <MultiSelectCellEditor 
                                              val={val} 
                                              col={col} 
                                              row={row} 
                                              onCellChange={onCellChange} 
                                              onColumnUpdate={onColumnUpdate} 
                                              setActiveEditingCell={setActiveEditingCell} 
                                              rect={activeEditingCell?.rect}
                                          />
                                      </div>
                                 ) : col.type === FieldType.ATTACHMENT ? (
                                    // Attachment Editing Mode
                                    <div className="flex items-center gap-1 overflow-hidden h-full opacity-50">
                                        <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center shrink-0 text-gray-500">
                                            <ICONS.Plus className="w-4 h-4" />
                                        </div>
                                        {(Array.isArray(val) ? val : []).map((f: any, i: number) => (
                                            <div key={i} className="w-6 h-6 rounded border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                                                {f.type?.startsWith('image') || ['jpg','jpeg','png','gif','webp'].includes((f.extension || '').toLowerCase()) ? (
                                                    <>
                                                        <img src={f.url || api.getFileUrl(f.path)} className="w-full h-full object-cover" alt="" onError={(e) => { e.currentTarget.style.display='none'; if(e.currentTarget.nextElementSibling) e.currentTarget.nextElementSibling.classList.remove('hidden'); }} />
                                                        <span className="hidden text-[6px] font-bold text-gray-500 uppercase">{(f.extension || 'FILE').substring(0, 3)}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-[6px] font-bold text-gray-500 uppercase">{(f.extension || 'FILE').substring(0, 3)}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                 ) : col.type === FieldType.LINK ? (
                                     (() => {
                                         const values = parseLinkValues(val);
                                         const targetTableId = col.config?.linked_table_id;
                                         return (
                                             <div 
                                                 className="w-full h-full flex items-center px-2 gap-1 overflow-hidden cursor-pointer relative group/cell"
                                                 onClick={(e) => {
                                                     setFocusedCell({ rowId: row.id, colId: col.id });
                                                 }}
                                                 onDoubleClick={(e) => {
                                                     e.stopPropagation();
                                                     if (targetTableId) {
                                                         const primaryColId = columns[0]?.id;
                                                         const rowTitle = primaryColId ? String(row.data?.[primaryColId] || row.id) : row.id;
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
                                             >
                                                 {values.length > 0 ? values.map((v: any, idx: number) => (
                                                     <span key={idx} className="px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap bg-primary-50 text-primary-600 border border-primary-100 flex items-center gap-1">
                                                         {highlightText(v.name || (typeof v === 'object' ? v.id : String(v)))}
                                                         <span 
                                                             className="hover:text-red-500 cursor-pointer"
                                                             onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 const newValues = values.filter((_, i) => i !== idx);
                                                                 onCellChange(row.id, col.id, newValues);
                                                             }}
                                                         >×</span>
                                                     </span>
                                                 )) : <span className="text-gray-300 text-[10px]">点击关联</span>}
                                                 
                                                 <div className="ml-auto shrink-0 text-gray-400 opacity-0 group-hover/cell:opacity-100 transition-opacity pr-1">
                                                     <ICONS.ChevronDown className="w-4 h-4" />
                                                 </div>
                                             </div>
                                         );
                                     })()
                                 ) : col.type === FieldType.TEXT ? (
                                     <span className="truncate flex-1 px-2">{highlightText(val && col.type !== FieldType.DATE ? formatFieldValue(val, col.type) : val)}</span>
                                 ) : col.type === FieldType.HYPERLINK ? (
                                     <div className="w-full h-full flex items-center px-2 overflow-hidden">
                                         <span className="truncate flex-1 text-primary-600 underline cursor-pointer" onClick={(e) => {
                                             e.stopPropagation();
                                             if (val) window.open(String(val).startsWith('http') ? String(val) : `https://${val}`, '_blank');
                                         }}>{highlightText(String(val || ''))}</span>
                                     </div>
                                 ) : (
                                     <div className="absolute top-0 left-0 w-full h-full z-[100]">
                                         <input 
                                             type={col.type === FieldType.DATE ? 'date' : col.type === FieldType.NUMBER ? 'number' : 'text'}
                                             className="relative z-[101] w-full min-h-full bg-white border-2 border-primary-500 outline-none px-2 py-1 text-sm shadow-lg text-gray-700"
                                             value={(editingValue !== null && editingValue !== undefined) ? editingValue : (val || '')}
                                             onChange={(e) => setEditingValue(e.target.value)}
                                             autoFocus
                                             onFocus={(e: any) => {
                                                 const val = e.target.value;
                                                 if (col.type !== FieldType.DATE && col.type !== FieldType.NUMBER) {
                                                     e.target.setSelectionRange(val.length, val.length);
                                                 }
                                             }}
                                             onBlur={saveEditing}
                                             onKeyDown={(e) => {
                                                 if (e.key === 'Enter') saveEditing();
                                             }}
                                         />
                                     </div>
                                 )
                             ) : (
                                 <>
                                    {col.type === FieldType.USER ? (
                                         <div className="w-full h-full flex items-center px-2 overflow-hidden gap-1">
                                             <UserCellDisplay 
                                                 tableId={tableId}
                                                 rowId={row.id}
                                                 colId={col.id}
                                                 value={val}
                                                 searchKeyword={searchKeyword}
                                             />
                                         </div>
                                     ) : col.type === FieldType.SELECT ? (
                                         (() => {
                                             const colorStyle = getTagColor(val, col.config?.option_colors);
                                             return val ? (
                                                 <div className="w-full h-full flex items-center px-2 overflow-hidden">
                                                     <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${colorStyle.bg} ${colorStyle.text} border border-transparent truncate max-w-full`}>
                                                         {highlightText(String(val))}
                                                     </div>
                                                 </div>
                                             ) : null;
                                         })()
                                     ) : col.type === FieldType.MULTI_SELECT ? (
                                         <div className="w-full h-full flex items-center px-2 gap-1 overflow-hidden">
                                             {(() => {
                                                 const selectedValues = Array.isArray(val) ? val : (val ? String(val).split(',') : []);
                                                 return selectedValues.map((v: string, i: number) => {
                                                     const colorStyle = getTagColor(v, col.config?.option_colors);
                                                     return (
                                                         <div key={i} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${colorStyle.bg} ${colorStyle.text} border border-transparent shrink-0`}>
                                                             {highlightText(v)}
                                                         </div>
                                                     );
                                                 });
                                             })()}
                                         </div>
                                     ) : col.type === FieldType.ATTACHMENT ? (
                                         <div className="w-full h-full flex items-center px-2 gap-1 overflow-hidden">
                                             {(Array.isArray(val) ? val : []).map((f: any, i: number) => (
                                                 <div key={i} className="w-6 h-6 rounded border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                                                     {f.type?.startsWith('image') || ['jpg','jpeg','png','gif','webp'].includes((f.extension || '').toLowerCase()) ? (
                                                         <>
                                                            <img src={f.url || api.getFileUrl(f.path)} className="w-full h-full object-cover" alt="" onError={(e) => { e.currentTarget.style.display='none'; if(e.currentTarget.nextElementSibling) e.currentTarget.nextElementSibling.classList.remove('hidden'); }} />
                                                            <span className="hidden text-[6px] font-bold text-gray-400 uppercase">{(f.extension || 'FILE').substring(0, 3)}</span>
                                                         </>
                                                     ) : (
                                                         <span className="text-[6px] font-bold text-gray-400 uppercase">{(f.extension || 'FILE').substring(0, 3)}</span>
                                                     )}
                                                 </div>
                                             ))}
                                         </div>
                                     ) : col.type === FieldType.LINK ? (
                                         <div className="w-full h-full flex items-center px-2 gap-1 overflow-hidden">
                                             {parseLinkValues(val).map((v: any, idx: number) => (
                                                 <span key={idx} className="px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap bg-primary-50 text-primary-600 border border-primary-100 flex items-center gap-1">
                                                     {highlightText(v.name || (typeof v === 'object' ? v.id : String(v)))}
                                                 </span>
                                             ))}
                                         </div>
                                     ) : col.type === FieldType.CHECKBOX ? (
                                         <div className="w-full h-full flex items-center justify-center">
                                             {val ? <CheckboxChecked /> : <CheckboxUnchecked />}
                                         </div>
                                     ) : col.type === FieldType.HYPERLINK ? (
                                         <div className="w-full h-full flex items-center px-2 overflow-hidden">
                                             <span className="truncate flex-1 text-primary-600 underline cursor-pointer" onClick={(e) => {
                                                 e.stopPropagation();
                                                 if (val) window.open(String(val).startsWith('http') ? String(val) : `https://${val}`, '_blank');
                                             }}>{highlightText(String(val || ''))}</span>
                                         </div>
                                     ) : (
                                         <span className="truncate flex-1 px-2">{highlightText(val && col.type !== FieldType.DATE ? formatFieldValue(val, col.type) : val)}</span>
                                     )}
                                     
                                     {/* First Column Actions */}
                                     {columns[0].id === col.id && (
                                         <>
                                             <div className="hidden group-hover/cell:flex items-center gap-0.5 bg-white border border-gray-200/80 p-0.5 rounded-md absolute right-2 top-1/2 -translate-y-1/2 shadow-sm z-20 whitespace-nowrap">
                                                <Tooltip content="查看">
                                                    <button 
                                                        className="flex items-center justify-center w-6 h-6 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                                                        onClick={(e) => { e.stopPropagation(); onOpenDetail?.(row); }}
                                                    >
                                                        <ICONS.Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                </Tooltip>
                                                <CommentBadge count={commentCounts[`${row.id}_${col.id}`] || 0} rowId={row.id} colId={col.id} isHover />
                                             </div>
                                             <CommentBadge count={commentCounts[`${row.id}_${col.id}`] || 0} rowId={row.id} colId={col.id} />
                                         </>
                                     )}
                                 </>
                             )}
                         </div>
                     );
                 })}
              </div>
              );
            })}

            {/* Add Row Button */}
            <div 
                className={`flex h-9 border-b border-gray-100 hover:bg-primary-50 cursor-pointer group bg-white sticky left-0 z-10`}
                style={{ width: 'max-content', minWidth: '100%' }}
                onClick={() => onDirectAddRow ? onDirectAddRow({}) : onAddRow({})}
            >
                <div style={{ width: indexColWidth }} className="flex items-center justify-center border-r border-transparent shrink-0 bg-transparent">
                    <ICONS.Plus className="w-4 h-4 text-gray-400 group-hover:text-primary-500" />
                </div>
                <div className="flex items-center px-3 text-gray-400 group-hover:text-primary-600 font-medium text-xs">
                    添加新记录
                </div>
            </div>

            {/* Fillers */}
            {Array.from({length: Math.max(0, 20 - rows.length)}).map((_, i) => (
                <div key={`empty-${i}`} className="h-9 border-b border-gray-50/50 flex">
                    <div style={{ width: indexColWidth }} className="border-r border-gray-50/50 shrink-0" />
                    {columns.map(c => {
                        const width = resizingCol?.id === c.id ? resizingCol.currentWidth : (c.width || 150);
                        return <div key={c.id} style={{ width }} className="border-r border-gray-50/50 shrink-0" />;
                    })}
                </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Timeline */}
        <div className="flex-1 overflow-auto bg-white relative scrollbar-thin scrollbar-thumb-gray-200" ref={rightPanelRef} onScroll={handleScroll}>
          <div style={{ width: Math.max(totalWidth, 800) }}>
             {/* Timeline Header */}
             <div className="sticky top-0 z-30 bg-[#fbfcfd] shadow-[0_1px_0_rgba(0,0,0,0.05)] h-[60px]">
                 {/* Group Row */}
                 <div className="flex border-b border-gray-100 h-[30px]">
                     {headerGroups.map((g, i) => (
                         <div key={i} className="border-r border-gray-100 relative" style={{ width: g.width, minWidth: g.width }}>
                             <div className="sticky left-0 px-2 flex items-center h-full text-xs font-medium text-gray-500 truncate w-max max-w-full">
                                 {g.label}
                             </div>
                         </div>
                     ))}
                 </div>
                 {/* Unit Row */}
                 <div className="flex h-[30px] border-b border-gray-200 relative">
                    <div style={{ width: visibleStartIndex * timelineConfig.cellWidth, minWidth: visibleStartIndex * timelineConfig.cellWidth, flexShrink: 0 }} />
                    {visibleUnits.map((u, idx) => (
                      <div 
                        key={idx} 
                        className={`border-r border-gray-100 flex items-center justify-center text-[10px] ${u.isWeekend ? 'bg-gray-50/50 text-gray-400' : 'text-gray-600'} ${u.isToday ? 'bg-primary-50/50' : ''}`}
                        style={{ width: timelineConfig.cellWidth, minWidth: timelineConfig.cellWidth, flexShrink: 0 }}
                      >
                         <span className={u.isToday ? 'font-bold text-primary-600' : ''}>{u.label}</span>
                      </div>
                    ))}
                 </div>
             </div>

             {/* Gantt Body */}
             <div className="relative">
                {/* Background Grid & Click Area */}
                <div className="absolute inset-0 flex z-0">
                    <div style={{ width: visibleStartIndex * timelineConfig.cellWidth, minWidth: visibleStartIndex * timelineConfig.cellWidth, flexShrink: 0 }} />
                    {visibleUnits.map((u, idx) => (
                        <div 
                            key={idx} 
                            className={`border-r border-gray-100 h-full ${u.isWeekend ? 'bg-gray-50/30' : ''}`} 
                            style={{ width: timelineConfig.cellWidth, minWidth: timelineConfig.cellWidth, flexShrink: 0 }} 
                        />
                    ))}
                </div>

                {/* Today Line */}
                {todayLeft >= 0 && (
                    <div className="absolute top-0 bottom-0 border-l border-primary-400 z-10 pointer-events-none" style={{ left: todayLeft }}>
                        <div className="w-1.5 h-1.5 bg-primary-500 rounded-full -ml-[3.5px] -mt-[3px]" />
                    </div>
                )}

                {/* Rows & Bars */}
                {flattenedRows.map(({ row, isGroup }) => {
                    if (isGroup) {
                        return (
                            <div key={row.id} className="h-9 border-b border-gray-100 bg-gray-50/50 relative z-10" />
                        );
                    }

                    let startStr = targetDateCol ? row.data?.[targetDateCol.id] : null;
                    let endStr = targetEndDateCol ? row.data?.[targetEndDateCol.id] : (startStr || null);

                    if (savingRows[row.id]) {
                        startStr = savingRows[row.id].start;
                        endStr = savingRows[row.id].end;
                    }

                    if (timelineDrag?.rowId === row.id) {
                        startStr = timelineDrag.currentStartStr;
                        endStr = timelineDrag.currentEndStr;
                    }

                    let left = 0;
                    let width = 0;
                    let isVisible = false;

                    if (startStr) {
                        const start = new Date(startStr);
                        // Calculate offset
                        const diffMs = start.getTime() - minDate.getTime();
                        let unitDiff = 0;
                        
                        if (viewMode === 'year') {
                            // Approx months
                            unitDiff = (start.getFullYear() - minDate.getFullYear()) * 12 + (start.getMonth() - minDate.getMonth());
                            // Add day offset
                            unitDiff += start.getDate() / 30;
                        } else if (viewMode === 'quarter') {
                            // Weeks
                            unitDiff = diffMs / (7 * 24 * 3600 * 1000);
                        } else {
                            // Days
                            unitDiff = diffMs / (24 * 3600 * 1000);
                        }

                        if (unitDiff >= -5) { // Allow slight offscreen
                            left = unitDiff * timelineConfig.cellWidth;
                            isVisible = true;
                            
                            // Duration
                            let durationMs = 24*3600*1000;
                            if (endStr) durationMs = new Date(endStr).getTime() - start.getTime() + 24*3600*1000;
                            
                            let durationUnits = 1;
                            if (viewMode === 'year') durationUnits = durationMs / (30 * 24 * 3600 * 1000);
                            else if (viewMode === 'quarter') durationUnits = durationMs / (7 * 24 * 3600 * 1000);
                            else durationUnits = durationMs / (24 * 3600 * 1000);

                            width = Math.max(4, durationUnits * timelineConfig.cellWidth);
                        }
                    }

                    // Color
                    let bgClass = 'bg-primary-500';
                    if (customColor) {
                        bgClass = customColor.startsWith('bg-') ? customColor.split(' ')[0] : `bg-${customColor}-500`;
                    } else if (colorFieldId) {
                        const val = row.data?.[colorFieldId];
                        const colorCol = colsToSearch.find(c => c.id === colorFieldId);
                        
                        let actualVal = val;
                        if (Array.isArray(val) && val.length > 0) {
                            actualVal = typeof val[0] === 'object' && val[0] !== null ? (val[0].id || val[0].name) : val[0];
                        } else if (typeof val === 'object' && val !== null) {
                            actualVal = val.id || val.name;
                        }

                        if (actualVal !== undefined && actualVal !== null) {
                            const tagColor = getTagColor(String(actualVal), colorCol?.config?.option_colors);
                            bgClass = tagColor.bg.replace('bg-', 'bg-').replace('100', '500'); 
                            // Try to map to 500 variant for stronger color or keep as is?
                            // CalendarView uses getTagColor which returns bg-primary-100 etc.
                            // The Gantt bars currently seem to use 500 variants.
                            // Let's see if bgClass = tagColor.bg is what we want.
                            // The bgClass in CalendarView seems to be used as bg-white border-left.
                            // Here we use bgClass as the background of the bar.
                            // If we use bg-primary-100 it might be too light for white text?
                            // Let's try to map the color part.
                            const colorMatch = tagColor.bg.match(/bg-(.+)-100/);
                            if (colorMatch) {
                                bgClass = `bg-${colorMatch[1]}-500`;
                            } else {
                                bgClass = tagColor.bg;
                            }
                        }
                    }

                    // Safely get title
                    const rowTitle = targetTitleCol ? (row.data?.[targetTitleCol.id] || '无标题') : '无标题';
                    const durationDays = endStr && startStr ? Math.max(1, Math.round((new Date(endStr).getTime() - new Date(startStr).getTime()) / (24*3600*1000)) + 1) : 1;

                    return (
                        <div key={row.id} className="h-9 border-b border-gray-100/50 relative hover:bg-gray-50/30 group z-10 hover:z-[60] flex items-center w-full">
                            {/* Empty space click detector layer could go here if needed per row, but global is easier */}
                            {isVisible && (
                                <div 
                                    className={`absolute h-6 rounded shadow-sm opacity-90 hover:opacity-100 cursor-pointer text-[10px] text-white flex items-center px-1 transition-all hover:ring-2 hover:ring-offset-1 hover:ring-primary-200 hover:z-50 group/bar ${bgClass}`}
                                    style={{ left: Math.max(0, left), width: width, zIndex: timelineDrag?.rowId === row.id ? 40 : 10 }}
                                    onDoubleClick={() => onOpenDetail && onOpenDetail(row)}
                                    onMouseDown={(e) => {
                                        if ((e.target as HTMLElement).closest('.resize-handle')) return;
                                        setTimelineDrag({
                                            active: true, mode: 'move', rowId: row.id,
                                            initialX: e.clientX, initialStartStr: startStr!, initialEndStr: endStr || startStr!,
                                            currentStartStr: startStr!, currentEndStr: endStr || startStr!
                                        });
                                    }}
                                >
                                    <div 
                                      className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize hover:bg-white/30 resize-handle flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity rounded-l"
                                      onMouseDown={(e) => {
                                          e.stopPropagation();
                                          setTimelineDrag({
                                              active: true, mode: 'resize-start', rowId: row.id,
                                              initialX: e.clientX, initialStartStr: startStr!, initialEndStr: endStr || startStr!,
                                              currentStartStr: startStr!, currentEndStr: endStr || startStr!
                                          });
                                      }}
                                    >
                                        <div className="w-[1px] h-3 bg-white/60"></div>
                                    </div>

                                    <span className="truncate drop-shadow-md font-medium px-1 flex-1 pointer-events-none select-none pl-1.5">{highlightText(rowTitle)}</span>
                                    
                                    {width > 60 && (
                                      <span className="text-[10px] font-normal opacity-90 mr-1.5 pointer-events-none select-none">
                                          {durationDays} 天
                                      </span>
                                    )}

                                    {targetEndDateCol && (
                                      <div 
                                        className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize hover:bg-white/30 resize-handle flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity rounded-r"
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setTimelineDrag({
                                                active: true, mode: 'resize-end', rowId: row.id,
                                                initialX: e.clientX, initialStartStr: startStr!, initialEndStr: endStr || startStr!,
                                                currentStartStr: startStr!, currentEndStr: endStr || startStr!
                                            });
                                        }}
                                      >
                                        <div className="flex gap-[1px]">
                                            <div className="w-[1px] h-2 bg-white/60"></div>
                                            <div className="w-[1px] h-2 bg-white/60"></div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Custom Tooltip */}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-[7px] hidden group-hover/bar:block w-max max-w-[360px] z-[100] cursor-default pointer-events-none text-left">
                                        <div className="bg-[#28292e] text-[#e5e5e6] text-[13px] rounded-lg shadow-2xl p-4 whitespace-normal break-words leading-relaxed relative border border-gray-700/50">
                                            <div className="absolute -top-[6px] left-1/2 -translate-x-1/2 border-x-[6px] border-x-transparent border-b-[6px] border-b-[#28292e]"></div>
                                            {rowTitle}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {startStr && (
                                <div className="sticky right-2 ml-auto z-20 pointer-events-auto flex items-center transition-all bg-transparent backdrop-blur-none rounded">
                                    {/* Unhovered state: just a gray arrow, opacity-50, group-hover:hidden */}
                                    <button 
                                        className="w-5 h-5 flex items-center justify-center text-gray-500 bg-gray-100/80 rounded border border-gray-200 shadow-sm opacity-60 group-hover:hidden hover:opacity-100 hover:bg-gray-200"
                                        title="定位到该日期"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (rightPanelRef.current) {
                                                rightPanelRef.current.scrollTo({ left: Math.max(0, left - 100), behavior: 'smooth' });
                                            }
                                        }}
                                    >
                                        <ICONS.ArrowRight className="w-3 h-3" />
                                    </button>

                                    {/* Hovered state: text + blue arrow, hidden group-hover:flex */}
                                    <div className="hidden group-hover:flex items-center bg-white/90 rounded py-0.5 px-1 gap-1 shadow-sm border border-gray-200 backdrop-blur-sm">
                                        <span className="text-[10px] text-gray-600 font-medium whitespace-nowrap pl-1">
                                            {formatDateForDisplay(startStr)} {endStr ? ` - ${formatDateForDisplay(endStr)}` : ''}
                                        </span>
                                        <button 
                                            className="w-5 h-5 flex items-center justify-center bg-primary-500 text-white rounded hover:bg-primary-600 transition-colors shadow-sm"
                                            title="定位到该日期"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (rightPanelRef.current) {
                                                    rightPanelRef.current.scrollTo({ left: Math.max(0, left - 100), behavior: 'smooth' });
                                                }
                                            }}
                                        >
                                            <ICONS.ArrowRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Add Row Matching Row for Timeline */}
                <div 
                    className="h-9 border-b border-gray-100 relative w-full hover:bg-primary-50/30 cursor-pointer transition-colors"
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const unitIndex = Math.floor(x / timelineConfig.cellWidth);
                        if (timelineUnits[unitIndex]) {
                            handleTimelineClick(timelineUnits[unitIndex].date);
                        }
                    }}
                />

                {/* Empty Clickable Area for Creating New Rows */}
                {Array.from({length: Math.max(0, 20 - rows.length)}).map((_, i) => (
                    <div 
                        key={`empty-bg-${i}`} 
                        className="h-9 border-b border-gray-100/50 relative w-full hover:bg-gray-50/50 cursor-pointer flex items-center group/empty transition-colors"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const unitIndex = Math.floor(x / timelineConfig.cellWidth);
                            if (timelineUnits[unitIndex]) {
                                handleTimelineClick(timelineUnits[unitIndex].date);
                            }
                        }}
                    >
                    </div>
                ))}
             </div>
          </div>
        </div>
      </div>
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
                        onInsertRow(contextMenu.rowId, 'before', undefined, insertAboveCount);
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
                        onInsertRow(contextMenu.rowId, 'after', undefined, insertBelowCount);
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
                        if (selectedRowIds.has(contextMenu.rowId)) {
                            onDeleteRows(Array.from(selectedRowIds));
                        } else {
                            onDeleteRows([contextMenu.rowId]);
                        }
                        setContextMenu(null);
                    }}
                >
                    <ICONS.Trash className="w-3.5 h-3.5" />
                    删除记录 {(() => {
                        const targetIds = selectedRowIds.has(contextMenu.rowId) ? selectedRowIds : new Set([contextMenu.rowId]);
                        const count = getAffectedRowCount(targetIds);
                        return count > 1 ? `(${count})` : '';
                    })()}
                </div>
            </div>
       )}

       {/* Attachment Popup */}
       {activeEditingCell && activeEditingCell.rect && (
           (() => {
               const row = rows.find(r => r.id === activeEditingCell.rowId);
               const col = columns.find(c => c.id === activeEditingCell.colId);
               
               if (!row || !col) return null;

               if (col.type === FieldType.MULTI_SELECT) {
                   const val = row.data?.[col.id];
                   const selectedValues = Array.isArray(val) ? val : (val ? String(val).split(',') : []);
                   return (
                       <ClickOutsideWrapper onClickOutside={() => setActiveEditingCell(null)}>
                       <div 
                           className="fixed z-[100] bg-white border border-primary-500 rounded-lg shadow-xl p-2 min-w-[200px] animate-in fade-in zoom-in-95 duration-100"
                           style={{ 
                               top: activeEditingCell.rect.bottom + 5, 
                               left: activeEditingCell.rect.left 
                           }}
                           onClick={(e) => e.stopPropagation()}
                       >
                           <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                               {col.config?.options?.map(opt => {
                                   const isSelected = selectedValues.includes(opt);
                                   const colorStyle = getTagColor(opt, col.config?.option_colors);
                                   
                                   return (
                                       <label key={opt} className="flex items-center gap-2 hover:bg-gray-50 p-1.5 rounded cursor-pointer transition-colors">
                                           <input 
                                               type="checkbox"
                                               checked={isSelected}
                                               onChange={(e) => {
                                                   const newValues = e.target.checked 
                                                       ? [...selectedValues, opt]
                                                       : selectedValues.filter((v: string) => v !== opt);
                                                   onCellChange(row.id, col.id, newValues);
                                               }}
                                               className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                                           />
                                           <span className={`px-1.5 py-0.5 rounded text-xs ${colorStyle.bg} ${colorStyle.text}`}>{opt}</span>
                                       </label>
                                   );
                               })}
                               {(!col.config?.options || col.config.options.length === 0) && (
                                   <div className="text-xs text-gray-400 p-2 text-center">暂无选项</div>
                               )}
                           </div>
                           <div className="mt-2 pt-2 border-t border-gray-100 text-right">
                               <button 
                                   className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded hover:bg-primary-700 transition-colors shadow-sm"
                                   onClick={(e) => { e.stopPropagation(); setActiveEditingCell(null); }}
                               >
                                   完成
                               </button>
                           </div>
                       </div>
                       </ClickOutsideWrapper>
                   );
               }

               if (col.type === FieldType.ATTACHMENT) {
                   const files = parseJsonArray(row.data?.[col.id]);
                   return (
                       <ClickOutsideWrapper onClickOutside={() => setActiveEditingCell(null)}>
                       <div 
                           className="fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-xl p-3 min-w-[320px] flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-100"
                           style={{ 
                               top: activeEditingCell.rect.bottom + 5, 
                               left: activeEditingCell.rect.left 
                           }}
                           onClick={(e) => e.stopPropagation()}
                       >
                           <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                               {files.map((f: any, i: number) => (
                                   <div key={i} className="relative w-32 h-24 rounded-lg overflow-hidden border border-gray-200 group bg-gray-100 flex items-center justify-center">
                                       {/* File Preview/Icon */}
                                       {f.url || f.path ? (
                                           (f.extension && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes((f.extension || '').toLowerCase())) ? (
                                               <>
                                                   <img src={f.url || api.getFileUrl(f.path)} className="w-full h-full object-cover" alt={f.filename || f.name} onError={(e) => { e.currentTarget.style.display='none'; if(e.currentTarget.nextElementSibling) { e.currentTarget.nextElementSibling.classList.remove('hidden'); e.currentTarget.nextElementSibling.classList.add('flex'); } }} />
                                                   <div className="hidden flex-col items-center justify-center text-gray-400 w-full h-full p-2">
                                                       <ICONS.File className="w-8 h-8 mb-1 text-primary-500" />
                                                       <span className="text-xs font-medium uppercase truncate w-full text-center px-1">{String(f.extension || f.name?.split('.').pop() || 'FILE').substring(0, 3)}</span>
                                                   </div>
                                               </>
                                           ) : (
                                               <div className="flex flex-col items-center justify-center text-gray-400">
                                                   <ICONS.File className="w-8 h-8 mb-1 text-primary-500" />
                                                   <span className="text-xs font-medium uppercase">{String(f.extension || f.name?.split('.').pop() || 'FILE').substring(0, 3)}</span>
                                               </div>
                                           )
                                       ) : (
                                           <div className="flex flex-col items-center justify-center text-gray-400">
                                               <ICONS.File className="w-8 h-8 mb-1 text-primary-500" />
                                               <span className="text-xs font-medium uppercase">{String(f.extension || f.name?.split('.').pop() || 'FILE').substring(0, 3)}</span>
                                           </div>
                                       )}
                                       
                                       {/* Top Gradient & Filename */}
                                       <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-black/60 to-transparent p-1.5 flex items-start justify-between z-10">
                                           <span className="text-[10px] text-white truncate drop-shadow-md pr-4">{f.filename || f.name}</span>
                                       </div>

                                       {/* Delete Button */}
                                       <button 
                                           className="absolute top-1 right-1 w-4 h-4 bg-white/80 hover:bg-white rounded-full flex items-center justify-center z-20 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                           onClick={(e) => {
                                               e.stopPropagation();
                                               const newFiles = [...files];
                                               newFiles.splice(i, 1);
                                               onCellChange(row.id, col.id, newFiles);
                                           }}
                                           title="删除"
                                       >
                                           <ICONS.Close className="w-2.5 h-2.5 text-gray-600" />
                                       </button>

                                       {/* Hover Overlay */}
                                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 z-10">
                                           <button 
                                               className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors"
                                               onClick={(e) => { e.stopPropagation(); handlePreview(f); }}
                                               title="预览"
                                           >
                                               <ICONS.Eye className="w-5 h-5" />
                                           </button>
                                           <button 
                                               className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors"
                                               onClick={(e) => { e.stopPropagation(); api.downloadFile(f.id, f.filename || f.name); }}
                                               title="下载"
                                           >
                                               <ICONS.Download className="w-5 h-5" />
                                           </button>
                                       </div>
                                   </div>
                               ))}
                           </div>

                           <div className="relative">
                               <input 
                                   type="file"
                                   multiple
                                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                   onChange={async (e) => {
                                       if (e.target.files && e.target.files.length > 0) {
                                           try {
                                               const newFiles = [];
                                               for (const file of Array.from(e.target.files) as File[]) {
                                                   const res = await api.uploadFile(file);
                                                   if (res.data) {
                                                       newFiles.push(res.data);
                                                   }
                                               }
                                               onCellChange(row.id, col.id, [...files, ...newFiles]);
                                           } catch (err) {
                                               console.error('Upload failed', err);
                                               alert('上传失败');
                                           }
                                       }
                                   }}
                               />
                               <div className="w-full py-2 flex items-center justify-center gap-1 text-sm text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors cursor-pointer border border-dashed border-gray-300 hover:border-primary-300">
                                   <ICONS.Plus className="w-4 h-4" /> 添加本地文件
                               </div>
                           </div>
                       </div>
                       </ClickOutsideWrapper>
                   );
               }
                if (col.type === FieldType.TEXT || col.type === FieldType.HYPERLINK) {
                    const rowVal = row.data?.[col.id];
                    return createPortal(
                        <ClickOutsideWrapper onClickOutside={saveEditing}>
                            <div 
                                className={`fixed z-[9999] shadow-2xl ${col.type === FieldType.HYPERLINK ? 'flex flex-col border-[2px] border-primary-500 bg-white' : ''}`}
                                style={{
                                    top: activeEditingCell.rect.top - 2,
                                    left: activeEditingCell.rect.left - 2,
                                    width: activeEditingCell.rect.width + 4,
                                    minHeight: activeEditingCell.rect.height + 4,
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <AutoResizeTextarea
                                    className={`relative z-[9999] w-full min-h-full ${col.type === FieldType.TEXT ? 'bg-white border-[2px] border-primary-500 shadow-2xl' : 'bg-transparent'} outline-none px-2 py-1 text-sm resize-none overflow-hidden`}
                                    value={(editingValue !== null && editingValue !== undefined) ? editingValue : (rowVal || '')}
                                    onChange={(e: any) => {
                                        setEditingValue(e.target.value);
                                    }}
                                    autoFocus
                                    onFocus={(e: any) => {
                                        const val = e.target.value;
                                        e.target.setSelectionRange(val.length, val.length);
                                    }}
                                    onBlur={saveEditing}
                                    onKeyDown={(e: any) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            saveEditing();
                                        }
                                    }}
                                    style={{ minHeight: activeEditingCell.rect.height }}
                                />
                                {col.type === FieldType.HYPERLINK && rowVal && (
                                    <div className="border-t border-gray-100 bg-gray-50 flex items-center justify-end px-2 py-1 shrink-0 z-[101]">
                                        <button 
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                window.open(String(rowVal).startsWith('http') ? String(rowVal) : `https://${rowVal}`, '_blank');
                                            }}
                                            className="px-2 py-1 bg-white text-blue-600 hover:bg-blue-50 border border-gray-200 rounded text-xs flex items-center gap-1 shadow-sm"
                                        >
                                            <ICONS.Link className="w-3 h-3" /> 打卡链接
                                        </button>
                                    </div>
                                )}
                            </div>
                        </ClickOutsideWrapper>,
                        document.body
                    );
                }
               return null;
           })()
       )}

       {/* Link Record Dialog */}
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
               title={linkDialogState.title}
           />
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
        {hoveredCell && hoveredCell.content && !activeEditingCell && (() => {
            let popoverTop = hoveredCell.rect.bottom + 4;
            let popoverLeft = hoveredCell.rect.left;
            
            const windowHeight = window.innerHeight;
            if (popoverTop > windowHeight - 60) {
                popoverTop = Math.max(0, hoveredCell.rect.top - 4 - 40);
            }
            
            return createPortal(
                <div 
                    className="fixed z-[9999] bg-gray-800 text-white text-xs px-2 py-1.5 rounded shadow-xl pointer-events-none break-words max-w-[400px] animate-in fade-in zoom-in duration-200"
                    style={{ top: popoverTop, left: popoverLeft }}
                >
                    {hoveredCell.content}
                </div>,
                document.body
            );
        })()}
    </div>
  );
};

export default GanttView;