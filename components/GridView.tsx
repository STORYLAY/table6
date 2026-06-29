import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { UserCursor } from "../useCollaboration";
import {
  Column,
  Row,
  Table,
  FieldType,
  ColorRule,
  RowHeight,
  GroupCondition,
} from "../types";
import {
  ICONS,
  FIELD_TYPE_ICONS,
  getTagColor,
  formatDateForInput,
  formatDateForDisplay,
  formatTimeForDisplay,
  parseLinkValues,
  parseJsonArray,
  formatFieldValue,
} from "../constants";
import { Tooltip } from "./Tooltip";
import { api } from "../services/api";
import { evaluateFormula } from "../formulaUtils";
import { FilePreviewModal } from "./FilePreviewModal";
import LinkRecordDialog from "./LinkRecordDialog";
import { UserSelector } from "./UserSelector";
import {
  SelectCellEditor,
  MultiSelectCellEditor,
  AutoResizeTextarea,
} from "./CellEditors";
import { ClickOutsideWrapper } from "./ClickOutsideWrapper";
import { UserCellDisplay } from "./UserCellDisplay";

interface GridViewProps {
  tableId: string;
  columns: Column[];
  allColumns: Column[];
  allTables: Table[];
  rows: Row[];
  totalCount?: number;
  groups?: GroupCondition[];
  rowHeight?: RowHeight;
  rowHeights?: Record<string, number>;
  colorRules?: ColorRule[];
  onCellChange: (rowId: string, colId: string, value: any) => void;
  onAddColumn: () => void;
  onEditColumn: (col: Column, pos?: { top: number; left: number }) => void;
  onAddRow: (
    initialData?: Record<string, any>,
    specificId?: string,
    index?: number,
  ) => void;
  onDirectAddRow?: (data: Record<string, any>, index?: number) => void;
  onBatchProcessRows?: (payload: any[]) => void;
  onAddSubRow: (parentId: string, initialData?: Record<string, any>) => void;
  onInsertRow: (
    targetRowId: string,
    position: "before" | "after",
    initialData?: Record<string, any>,
    count?: number,
  ) => void;
  onDuplicateRow: (targetRowId: string) => void;
  onDuplicateRows?: (rowIds: string[]) => void;
  onDeleteRow: (rowId: string) => void;
  onDeleteRows: (rowIds: string[]) => void;
  onMoveRow?: (rowId: string, targetIndex: number) => void;
  onOpenComment: (rowId: string, colId: string) => void;
  onOpenDetail: (row: Row) => void;
  onColumnResize: (colId: string, width: number) => void;
  onRowHeightChange: (rowId: string, height: number) => void;
  onColumnUpdate: (col: Column) => void;
  onOptionChange: (
    colId: string,
    oldOpt: string,
    newOpt: string | null,
  ) => void;
  onSort?: (columns: Column[]) => void;
  commentCounts?: Record<string, number>; // Format: `${rowId}_${colId}` -> count
  searchKeyword?: string;
  onRefresh?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  cursors?: Record<string, UserCursor>;
  onCursorPositionChange?: (rowId: string | null, colId: string | null, isEditing: boolean) => void;
  readonly?: boolean;
}

const CheckboxUnchecked = () => (
  <div className="w-3.5 h-3.5 border border-gray-300 rounded bg-white hover:border-primary-400 transition-colors" />
);

const CheckboxChecked = () => (
  <div className="w-3.5 h-3.5 border border-primary-600 bg-primary-600 rounded flex items-center justify-center transition-colors">
    <svg
      className="w-2.5 h-2.5 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3}
        d="M5 13l4 4L19 7"
      />
    </svg>
  </div>
);

const DepartmentSelector = ({
  value,
  onChange,
  onClose,
}: {
  value: any;
  onChange: (val: any) => void;
  onClose: () => void;
}) => {
  const [depts, setDepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Normalize value to array
  const selectedDepts = useMemo(() => {
    let arr = Array.isArray(value) ? value : value ? [value] : [];
    if (typeof value === "string" && value.startsWith("[")) {
      try {
        arr = JSON.parse(value);
      } catch (e) {}
    }
    return arr.map((d) => {
      if (typeof d === "object" && d !== null) return d;
      return { id: d, name: "Dept " + d };
    });
  }, [value]);

  useEffect(() => {
    if (listRef.current && highlightedIndex >= 0) {
      const element = listRef.current.children[highlightedIndex] as HTMLElement;
      if (element) {
        element.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [highlightedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setHighlightedIndex((prev) => Math.min(prev + 1, depts.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      const dept = depts[highlightedIndex];
      if (dept) {
        toggleDept(dept);
      }
    } else if (e.key === "Escape") {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      onClose();
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.getDepts();
        setDepts(res.data || []);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    load();
  }, []);

  const toggleDept = (dept: any) => {
    const exists = selectedDepts.find((d: any) => d.id === dept.dept_id);
    let newValue;
    if (exists) {
      newValue = selectedDepts.filter((d: any) => d.id !== dept.dept_id);
    } else {
      newValue = [...selectedDepts, { id: dept.dept_id, name: dept.dept_name }];
    }
    onChange(newValue);
  };

  return (
    <div
      className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 shadow-xl rounded-lg z-[100] flex flex-col overflow-hidden outline-none"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      autoFocus
    >
      <div
        ref={listRef}
        className="max-h-60 overflow-y-auto custom-scrollbar py-1"
      >
        {loading ? (
          <div className="p-2 text-center text-gray-400 text-xs">加载中...</div>
        ) : depts.length > 0 ? (
          depts.map((d, idx) => {
            const isSel = selectedDepts.some(
              (sel: any) => sel.id === d.dept_id,
            );
            const isHighlighted = highlightedIndex === idx;
            return (
              <div
                key={d.dept_id}
                className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm ${isSel ? "bg-primary-50" : isHighlighted ? "bg-gray-100" : ""}`}
                onClick={() => toggleDept(d)}
              >
                <ICONS.Building
                  className={`w-4 h-4 ${isSel ? "text-primary-600" : "text-gray-400"}`}
                />
                <span className="truncate flex-1 text-gray-700">
                  {d.dept_name}
                </span>
                {isSel && (
                  <svg
                    className="w-3 h-3 text-primary-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-2 text-center text-gray-400 text-xs">无结果</div>
        )}
      </div>
    </div>
  );
};

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

const getVisibleRows = (rowsList: Row[], expandedIds: Set<string>): Row[] => {
  let visible: Row[] = [];
  rowsList.forEach((row) => {
    if (!row.isGroup) {
      visible.push(row);
    }
    if (row.children && expandedIds.has(row.id)) {
      visible = visible.concat(getVisibleRows(row.children, expandedIds));
    }
  });
  return visible;
};

const GridView: React.FC<GridViewProps> = ({
  tableId,
  columns,
  allColumns,
  allTables,
  rows,
  totalCount,
  groups,
  rowHeight = "MEDIUM",
  rowHeights,
  colorRules,
  onCellChange,
  onAddColumn,
  onEditColumn,
  onAddRow,
  onDirectAddRow,
  onBatchProcessRows,
  onAddSubRow,
  onInsertRow,
  onDuplicateRow,
  onDuplicateRows,
  onDeleteRow,
  onDeleteRows,
  onMoveRow,
  onOpenComment,
  onOpenDetail,
  onColumnResize,
  onRowHeightChange,
  onColumnUpdate,
  onOptionChange,
  onSort,
  commentCounts = {},
  searchKeyword = "",
  onRefresh,
  hasMore,
  isLoadingMore,
  onLoadMore,
  cursors,
  onCursorPositionChange,
  readonly = false,
}) => {
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [lastSelectedRowId, setLastSelectedRowId] = useState<string | null>(
    null,
  );
  const [focusedCell, setFocusedCell] = useState<{
    rowId: string;
    colId: string;
  } | null>(null);
  const focusedCellAtMouseDown = useRef<{
    rowId: string;
    colId: string;
  } | null>(null);
  const hiddenInputRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const [dragFillStart, setDragFillStart] = useState<{
    rowId: string;
    colId: string;
    rowIndex: number;
    colIndex: number;
  } | null>(null);
  const [dragFillEnd, setDragFillEnd] = useState<{
    rowId: string;
    colId: string;
    rowIndex: number;
    colIndex: number;
  } | null>(null);
  const [isDragFilling, setIsDragFilling] = useState(false);

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{
    rowId: string;
    colId: string;
  } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{
    rowId: string;
    colId: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  const seenGroupIds = useRef<Set<string>>(new Set());
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);

  const [draggedColIndex, setDraggedColIndex] = useState<number | null>(null);
  const [dropTargetColIndex, setDropTargetColIndex] = useState<number | null>(
    null,
  );

  // Clean up selected ids, focused cell, and selection ranges when rows are deleted or updated
  useEffect(() => {
    if (!rows || rows.length === 0) {
      if (selectedRowIds.size > 0) setSelectedRowIds(new Set());
      if (focusedCell) setFocusedCell(null);
      if (selectionStart) setSelectionStart(null);
      if (selectionEnd) setSelectionEnd(null);
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

    // 3. Clear selection start if its row was deleted
    if (selectionStart && !existingIds.has(selectionStart.rowId)) {
      setSelectionStart(null);
    }

    // 4. Clear selection end if its row was deleted
    if (selectionEnd && !existingIds.has(selectionEnd.rowId)) {
      setSelectionEnd(null);
    }

    // 5. Clear lastSelectedRowId if its row was deleted
    if (lastSelectedRowId && !existingIds.has(lastSelectedRowId)) {
      setLastSelectedRowId(null);
    }
  }, [rows, selectedRowIds, focusedCell, selectionStart, selectionEnd, lastSelectedRowId]);

  const visibleRows = useMemo(
    () => getVisibleRows(rows, expandedRowIds),
    [rows, expandedRowIds],
  );

  const selectionRange = useMemo(() => {
    if (!selectionStart || !selectionEnd) {
      if (focusedCell) {
        const rIdx = visibleRows.findIndex((r) => r.id === focusedCell.rowId);
        const cIdx = columns.findIndex((c) => c.id === focusedCell.colId);
        if (rIdx !== -1 && cIdx !== -1) {
          return {
            rowIds: new Set([focusedCell.rowId]),
            colIds: new Set([focusedCell.colId]),
            minR: rIdx,
            maxR: rIdx,
            minC: cIdx,
            maxC: cIdx,
          };
        }
      }
      return null;
    }

    const startR = visibleRows.findIndex((r) => r.id === selectionStart.rowId);
    const endR = visibleRows.findIndex((r) => r.id === selectionEnd.rowId);
    const startC = columns.findIndex((c) => c.id === selectionStart.colId);
    const endC = columns.findIndex((c) => c.id === selectionEnd.colId);

    if (startR === -1 || endR === -1 || startC === -1 || endC === -1)
      return null;

    const minR = Math.min(startR, endR);
    const maxR = Math.max(startR, endR);
    const minC = Math.min(startC, endC);
    const maxC = Math.max(startC, endC);

    const rowIds = new Set<string>();
    for (let r = minR; r <= maxR; r++) {
      rowIds.add(visibleRows[r].id);
    }

    const colIds = new Set<string>();
    for (let c = minC; c <= maxC; c++) {
      colIds.add(columns[c].id);
    }

    return { rowIds, colIds, minR, maxR, minC, maxC };
  }, [selectionStart, selectionEnd, focusedCell, visibleRows, columns]);

  const dragRange = useMemo(() => {
    if (!isDragFilling || !dragFillStart || !dragFillEnd) return null;

    const startR = visibleRows.findIndex((r) => r.id === dragFillStart.rowId);
    const endR = visibleRows.findIndex((r) => r.id === dragFillEnd.rowId);
    const startC = columns.findIndex((c) => c.id === dragFillStart.colId);
    const endC = columns.findIndex((c) => c.id === dragFillEnd.colId);

    if (startR === -1 || endR === -1 || startC === -1 || endC === -1)
      return null;

    const minR = Math.min(startR, endR);
    const maxR = Math.max(startR, endR);
    const minC = Math.min(startC, endC);
    const maxC = Math.max(startC, endC);

    const rowIds = new Set<string>();
    for (let r = minR; r <= maxR; r++) {
      rowIds.add(visibleRows[r].id);
    }

    const colIds = new Set<string>();
    for (let c = minC; c <= maxC; c++) {
      colIds.add(columns[c].id);
    }

    return { rowIds, colIds };
  }, [isDragFilling, dragFillStart, dragFillEnd, visibleRows, columns]);

  useEffect(() => {
    const handleMouseUp = () => setIsSelecting(false);
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (!selectionRange) return;

      const { minR, maxR, minC, maxC } = selectionRange;
      let tsv = "";
      let cellCount = 0;
      for (let r = minR; r <= maxR; r++) {
        const row = visibleRows[r];
        const rowData = [];
        for (let c = minC; c <= maxC; c++) {
          const col = columns[c];
          let val = row.data[col.id];
          if (val === null || val === undefined) val = "";
          else if (typeof val === "object") {
            if (Array.isArray(val)) {
              val = val
                .map((v) =>
                  typeof v === "object"
                    ? v.name || v.id || JSON.stringify(v)
                    : v,
                )
                .join(", ");
            } else {
              val = val.name || val.id || JSON.stringify(val);
            }
          }
          rowData.push(val);
          cellCount++;
        }
        tsv += rowData.join("\t") + "\n";
      }
      e.clipboardData?.setData("text/plain", tsv);
      e.preventDefault();
      toast.success(`已复制了 ${cellCount} 个单元格`);
    };
    document.addEventListener("copy", handleCopy);
    return () => document.removeEventListener("copy", handleCopy);
  }, [selectionRange, visibleRows, columns]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Ignore paste if the user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const text = e.clipboardData?.getData("text");
      if (!text) return;

      if (!focusedCell) return;

      const rowsData = text
        .split("\n")
        .map((row) => row.split("\t"))
        .filter((cells) => cells.some((cell) => cell.trim() !== ""));

      const colIndex = columns.findIndex((c) => c.id === focusedCell.colId);
      if (colIndex === -1) return;

      const rowIndex = visibleRows.findIndex((r) => r.id === focusedCell.rowId);
      if (rowIndex === -1) return;

      const payload: any[] = [];

      rowsData.forEach((rowData, rIdx) => {
        let targetRow = visibleRows[rowIndex + rIdx];

        if (!targetRow) {
          const initialData: Record<string, any> = {};
          rowData.forEach((cellValue, cIdx) => {
            const targetCol = columns[colIndex + cIdx];
            if (targetCol) {
              initialData[targetCol.id] = cellValue;
            }
          });
          payload.push({
            data: initialData,
            index: rowIndex + rIdx,
            parent_id: null,
            operation_type: "create",
          });
        } else {
          const updateData: Record<string, any> = {};
          rowData.forEach((cellValue, cIdx) => {
            const targetCol = columns[colIndex + cIdx];
            if (!targetCol) return;
            updateData[targetCol.id] = cellValue;

            if (
              activeEditingCell &&
              activeEditingCell.rowId === targetRow.id &&
              activeEditingCell.colId === targetCol.id
            ) {
              setEditingValue(cellValue);
            }
          });
          if (Object.keys(updateData).length > 0) {
            payload.push({
              data: updateData,
              index: rowIndex + rIdx,
              parent_id: targetRow.parent_id || null,
              operation_type: "update",
              row_id: targetRow.id,
            });
          }
        }
      });

      if (payload.length > 0 && onBatchProcessRows) {
        onBatchProcessRows(payload);
      } else {
        // Fallback if onBatchProcessRows is not provided
        rowsData.forEach((rowData, rIdx) => {
          let targetRow = visibleRows[rowIndex + rIdx];
          if (!targetRow) {
            const initialData: Record<string, any> = {};
            rowData.forEach((cellValue, cIdx) => {
              const targetCol = columns[colIndex + cIdx];
              if (targetCol) {
                initialData[targetCol.id] = cellValue;
              }
            });
            if (onDirectAddRow) {
              onDirectAddRow(initialData, rowIndex + rIdx);
            } else {
              onAddRow(initialData, undefined, rowIndex + rIdx);
            }
            return;
          }
          rowData.forEach((cellValue, cIdx) => {
            const targetCol = columns[colIndex + cIdx];
            if (!targetCol) return;
            onCellChangeInternal(targetRow.id, targetCol.id, cellValue);
          });
        });
      }

      e.preventDefault();
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [
    focusedCell,
    columns,
    visibleRows,
    onCellChange,
    onBatchProcessRows,
    onDirectAddRow,
    onAddRow,
  ]);
  const [activeEditingCell, setActiveEditingCell] = useState<{
    rowId: string;
    colId: string;
    rect?: DOMRect;
  } | null>(null);

  // Synchronize dynamic cell focus and active editing status with online peers
  useEffect(() => {
    if (!onCursorPositionChange) return;

    const rowId = activeEditingCell?.rowId || focusedCell?.rowId || null;
    const colId = activeEditingCell?.colId || focusedCell?.colId || null;
    const isEditing = !!activeEditingCell;

    const timer = setTimeout(() => {
      onCursorPositionChange(rowId, colId, isEditing);
    }, 150);

    return () => clearTimeout(timer);
  }, [
    focusedCell?.rowId,
    focusedCell?.colId,
    activeEditingCell?.rowId,
    activeEditingCell?.colId,
    !!activeEditingCell,
    onCursorPositionChange
  ]);

  const isValChanged = (v1: any, v2: any) => {
    if (v1 === v2) return false;
    const isEmpty = (x: any) => {
      if (x === null || x === undefined || x === "") return true;
      if (Array.isArray(x) && x.length === 0) return true;
      return false;
    };
    if (isEmpty(v1) && isEmpty(v2)) return false;
    if (isEmpty(v1) || isEmpty(v2)) return true;
    if (typeof v1 === "object" || typeof v2 === "object") {
      return JSON.stringify(v1) !== JSON.stringify(v2);
    }
    return v1 !== v2;
  };

  const handleSetActiveEditingCell = (
    cell: { rowId: string; colId: string; rect?: DOMRect } | null,
  ) => {
    if (cell) {
      setFocusedCell({ rowId: cell.rowId, colId: cell.colId });
      const row = rows.find((r) => r.id === cell.rowId);
      const val = row ? row.data[cell.colId] : null;
      setEditingValue(val);
    }
    setActiveEditingCell(cell);
  };
  const [editingValue, setEditingValue] = useState<any>(null);
  const [resizingCol, setResizingCol] = useState<{
    id: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [resizingRow, setResizingRow] = useState<{
    id: string;
    startY: number;
    startHeight: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    rowId: string;
    colId?: string;
  } | null>(null);
  const [insertAboveCount, setInsertAboveCount] = useState<number | string>(1);
  const [insertBelowCount, setInsertBelowCount] = useState<number | string>(1);
  const [copiedCellData, setCopiedCellData] = useState<any>(null);
  const [previewFile, setPreviewFile] = useState<{
    blob: Blob;
    filename: string;
  } | null>(null);

  const handleColDragStart = (e: React.DragEvent, index: number) => {
    const col = columns[index];
    const isLocked = col.id === allColumns[0]?.id;
    if (isLocked) {
      e.preventDefault();
      return;
    }
    setDraggedColIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Create a transparent drag image
    const img = new Image();
    img.src =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleColDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedColIndex === null) return;
    const col = columns[index];
    const isLocked = col.id === allColumns[0]?.id;
    if (isLocked) return;
    setDropTargetColIndex(index);
  };

  const handleColDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (
      draggedColIndex === null ||
      dropTargetColIndex === null ||
      draggedColIndex === dropTargetColIndex
    ) {
      setDraggedColIndex(null);
      setDropTargetColIndex(null);
      return;
    }

    const newAllColumns = [...allColumns];
    const draggedCol = columns[draggedColIndex];
    const targetCol = columns[dropTargetColIndex];

    const draggedAllIndex = newAllColumns.findIndex(
      (c) => c.id === draggedCol.id,
    );
    const targetAllIndexOriginal = newAllColumns.findIndex(
      (c) => c.id === targetCol.id,
    );

    const [movedCol] = newAllColumns.splice(draggedAllIndex, 1);

    let targetAllIndex = newAllColumns.findIndex((c) => c.id === targetCol.id);

    if (draggedAllIndex < targetAllIndexOriginal) {
      targetAllIndex = targetAllIndex + 1;
    }

    newAllColumns.splice(targetAllIndex, 0, movedCol);

    if (onSort) {
      onSort(newAllColumns);
    }

    setDraggedColIndex(null);
    setDropTargetColIndex(null);
  };

  const handleColDragEnd = () => {
    setDraggedColIndex(null);
    setDropTargetColIndex(null);
  };

  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [visibleRowCount, setVisibleRowCount] = useState(50);
  const [linkDialogState, setLinkDialogState] = useState<{
    isOpen: boolean;
    rowId: string;
    colId: string;
    targetTableId: string;
    initialValues: { id: string; name: string }[];
    title: string;
  } | null>(null);

  // Hover Popover State
  const [hoveredCell, setHoveredCell] = useState<{
    rowId: string;
    colId: string;
    rect: DOMRect;
    content: any;
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingRef = useRef(false);
  const prevRowsLengthRef = useRef(rows.length);

  useEffect(() => {
    loadingRef.current = isLoadingMore || false;
  }, [isLoadingMore]);

  useEffect(() => {
    setVisibleRowCount(50);
  }, [tableId, searchKeyword]);

  useEffect(() => {
    if (rows.length > prevRowsLengthRef.current) {
      setVisibleRowCount((prev) => Math.min(prev + 50, rows.length));
    } else if (rows.length < prevRowsLengthRef.current) {
      setVisibleRowCount((prev) => Math.min(prev, rows.length));
    }
    prevRowsLengthRef.current = rows.length;
  }, [rows.length]);

  const handleCellMouseEnter = (
    e: React.MouseEvent,
    row: Row,
    col: Column,
    content: any,
  ) => {
    // If content is empty or we are editing, do not show hover
    if (!content || activeEditingCell) return;
    // Convert to string to check length using formatFieldValue
    const strContent = formatFieldValue(content, col.type);
    const isLookup =
      col.type === FieldType.LOOKUP || col.type === FieldType.SEARCH_REFERENCE;
    if (!isLookup && strContent.trim().length < 5) return; // Too short to need a popover that takes up space

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredCell({
        rowId: row.id,
        colId: col.id,
        rect,
        content: strContent,
      });
    }, 600); // 600ms delay to avoid flickering while quickly moving mouse
  };

  const handleCellMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredCell(null);
  };

  const startEditing = React.useCallback(
    (rowId: string, colId: string, val: any) => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      setHoveredCell(null); // Clear hover when editing starts
      handleSetActiveEditingCell({
        rowId,
        colId,
        rect: document
          .querySelector(`[data-row-id="${rowId}"][data-col-id="${colId}"]`)
          ?.getBoundingClientRect(),
      });
      setEditingValue(val);
    },
    [handleSetActiveEditingCell],
  );

  const onCellChangeInternal = React.useCallback(
    (rowId: string, colId: string, value: any) => {
      onCellChange(rowId, colId, value);
      if (
        activeEditingCell &&
        activeEditingCell.rowId === rowId &&
        activeEditingCell.colId === colId
      ) {
        setEditingValue(value);
      }
    },
    [onCellChange, activeEditingCell],
  );

  const navigateToCell = React.useCallback(
    (rowId: string, colId: string, direction: "next" | "prev") => {
      const rIdx = visibleRows.findIndex((r) => r.id === rowId);
      const cIdx = columns.findIndex((c) => c.id === colId);
      if (rIdx === -1 || cIdx === -1) return;

      let nextR = rIdx;
      let nextC = cIdx;

      if (direction === "next") {
        if (cIdx < columns.length - 1) {
          nextC = cIdx + 1;
        } else if (rIdx < visibleRows.length - 1) {
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

      const nextRow = visibleRows[nextR];
      const nextCol = columns[nextC];
      if (nextRow && nextCol) {
        setFocusedCell({ rowId: nextRow.id, colId: nextCol.id });
        // Ensure the cell is visible
        setTimeout(() => {
          const element = document.querySelector(
            `[data-row-id="${nextRow.id}"][data-col-id="${nextCol.id}"]`,
          );
          if (element) {
            element.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        }, 0);
      }
    },
    [visibleRows, columns],
  );

  const moveVertical = React.useCallback(
    (rowId: string, colId: string, offset: number) => {
      const rIdx = visibleRows.findIndex((r) => r.id === rowId);
      if (rIdx === -1) return;
      const nextR = rIdx + offset;
      if (nextR >= 0 && nextR < visibleRows.length) {
        const nextRow = visibleRows[nextR];
        setFocusedCell({ rowId: nextRow.id, colId });
        // Ensure the cell is visible
        setTimeout(() => {
          const element = document.querySelector(
            `[data-row-id="${nextRow.id}"][data-col-id="${colId}"]`,
          );
          if (element) {
            element.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        }, 0);
      }
    },
    [visibleRows],
  );

  const handleBlur = () => {
    saveEditing();
  };

  const isSavingRef = useRef(false);

  const saveEditing = React.useCallback(() => {
    if (activeEditingCell && !isSavingRef.current) {
      isSavingRef.current = true;

      if (editingValue !== null && editingValue !== undefined) {
        const row = rows.find((r) => r.id === activeEditingCell.rowId);
        const originalVal = row?.data?.[activeEditingCell.colId];

        if (isValChanged(editingValue, originalVal)) {
          onCellChangeInternal(
            activeEditingCell.rowId,
            activeEditingCell.colId,
            editingValue,
          );
        }
      }

      handleSetActiveEditingCell(null);
      setEditingValue(null);
      setTimeout(() => {
        isSavingRef.current = false;
      }, 100);
    }
  }, [
    activeEditingCell,
    editingValue,
    onCellChangeInternal,
    handleSetActiveEditingCell,
    rows,
    isValChanged,
  ]);

  const updateHiddenInputPosition = React.useCallback(() => {
    if (focusedCell && !activeEditingCell && hiddenInputRef.current) {
      const el = document.querySelector(
        `[data-row-id="${focusedCell.rowId}"][data-col-id="${focusedCell.colId}"]`,
      );
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
      const isInput =
        (e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target as HTMLElement).isContentEditable) &&
        !isHiddenInput;

      if (isInput) {
        if (e.key === "Tab") {
          e.preventDefault();
          const currentCell = activeEditingCell || focusedCell;
          if (currentCell) {
            saveEditing();
            navigateToCell(
              currentCell.rowId,
              currentCell.colId,
              e.shiftKey ? "prev" : "next",
            );
          }
        }
        if (e.key === "Enter") {
          const currentCell = activeEditingCell || focusedCell;
          if (currentCell) {
            saveEditing();
            // After enter, move down (or up if shift)
            moveVertical(
              currentCell.rowId,
              currentCell.colId,
              e.shiftKey ? -1 : 1,
            );
          }
        }
        if (e.key === "Escape") {
          handleSetActiveEditingCell(null);
          setEditingValue(null);
        }
        return;
      }

      if (!focusedCell || activeEditingCell) {
        if (e.key === "Escape" && activeEditingCell) {
          handleSetActiveEditingCell(null);
          setEditingValue(null);
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Tab") {
        e.preventDefault();
        navigateToCell(
          focusedCell.rowId,
          focusedCell.colId,
          e.shiftKey ? "prev" : "next",
        );
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateToCell(focusedCell.rowId, focusedCell.colId, "next");
        return;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateToCell(focusedCell.rowId, focusedCell.colId, "prev");
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveVertical(focusedCell.rowId, focusedCell.colId, -1);
        return;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveVertical(focusedCell.rowId, focusedCell.colId, 1);
        return;
      }

      const col = columns.find((c) => c.id === focusedCell.colId);
      if (!col) return;

      const row = findRowInTree(rows, focusedCell.rowId);
      if (!row) return;

      if (e.key === "F2") {
        e.preventDefault();
        if (
          [
            FieldType.USER,
            FieldType.DEPARTMENT,
            FieldType.SELECT,
            FieldType.MULTI_SELECT,
            FieldType.ATTACHMENT,
          ].includes(col.type)
        ) {
          const cellElement = document.querySelector(
            `[data-row-id="${focusedCell.rowId}"][data-col-id="${focusedCell.colId}"]`,
          );
          const rect = cellElement?.getBoundingClientRect();
          handleSetActiveEditingCell({
            rowId: focusedCell.rowId,
            colId: focusedCell.colId,
            rect,
          });
        } else if (col.type === FieldType.LINK) {
          const targetTableId = col.config?.linked_table_id;
          if (targetTableId) {
            const primaryColId = columns[0]?.id;
            const rowTitle = primaryColId
              ? String(row.data[primaryColId] || row.id)
              : row.id;
            const val = row.data[col.id];
            const values = Array.isArray(val) ? val : val ? [val] : [];
            setLinkDialogState({
              isOpen: true,
              rowId: row.id,
              colId: col.id,
              targetTableId,
              initialValues: values,
              title: rowTitle,
            });
          }
        } else if (
          ![
            FieldType.CHECKBOX,
            FieldType.FORMULA,
            FieldType.LOOKUP,
            FieldType.SEARCH_REFERENCE,
          ].includes(col.type)
        ) {
          startEditing(focusedCell.rowId, focusedCell.colId, row.data[col.id]);
        }
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        moveVertical(focusedCell.rowId, focusedCell.colId, e.shiftKey ? -1 : 1);
        return;
      }

      if (e.key === " ") {
        if (col.type === FieldType.CHECKBOX) {
          e.preventDefault();
          onCellChangeInternal(
            focusedCell.rowId,
            focusedCell.colId,
            !row.data[col.id],
          );
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        const editableTypes = [
          FieldType.TEXT,
          FieldType.NUMBER,
          FieldType.HYPERLINK,
          FieldType.SELECT,
          FieldType.MULTI_SELECT,
          FieldType.USER,
          FieldType.DEPARTMENT,
          FieldType.DATE,
          FieldType.TIME,
          FieldType.LINK,
          FieldType.ATTACHMENT,
          FieldType.CHECKBOX,
        ];
        if (editableTypes.includes(col.type)) {
          e.preventDefault();
          onCellChangeInternal(
            focusedCell.rowId,
            focusedCell.colId,
            col.type === FieldType.CHECKBOX ? false : null,
          );
        }
        return;
      }

      if (e.key.length === 1) {
        const textTypes = [
          FieldType.TEXT,
          FieldType.NUMBER,
          FieldType.HYPERLINK,
        ];
        if (textTypes.includes(col.type)) {
          if (e.keyCode === 229 || e.isComposing) {
            return;
          }
          if (isHiddenInput) {
            return;
          }
          e.preventDefault();
          startEditing(focusedCell.rowId, focusedCell.colId, e.key);
        } else {
          const choiceTypes = [
            FieldType.SELECT,
            FieldType.MULTI_SELECT,
            FieldType.USER,
            FieldType.DEPARTMENT,
            FieldType.DATE,
            FieldType.TIME,
            FieldType.LINK,
            FieldType.ATTACHMENT,
          ];
          if (choiceTypes.includes(col.type)) {
            e.preventDefault();
            onCellChangeInternal(focusedCell.rowId, focusedCell.colId, null);
            const cellElement = document.querySelector(
              `[data-row-id="${focusedCell.rowId}"][data-col-id="${focusedCell.colId}"]`,
            );
            const rect = cellElement?.getBoundingClientRect();
            handleSetActiveEditingCell({
              rowId: focusedCell.rowId,
              colId: focusedCell.colId,
              rect,
            });
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    focusedCell,
    activeEditingCell,
    columns,
    rows,
    visibleRows,
    navigateToCell,
    moveVertical,
    saveEditing,
    handleSetActiveEditingCell,
    onCellChangeInternal,
    startEditing,
  ]);

  const handlePreview = async (f: any) => {
    try {
      setIsPreviewLoading(true);
      const fileId = typeof f === "object" ? f.id : f;
      const filename = typeof f === "object" ? f.filename || f.name : f;
      const blob = await api.getFileBlob(fileId);
      setPreviewFile({ blob, filename: filename || "文件" });
    } catch (e: any) {
      console.error("Preview failed:", e);
      toast.error(e.message || "获取文件内容失败");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleLinkConfirm = (selectedRows: Row[], targetColumns: Column[]) => {
    if (!linkDialogState) return;
    const { rowId, colId } = linkDialogState;

    // Construct the value to save.
    // We store { id, name } where name is the primary column value.
    const primaryColId = targetColumns[0]?.id;

    const newValue = selectedRows.map((r) => {
      // If it's a full row with data
      if ("data" in r && r.data && primaryColId) {
        return {
          id: r.id,
          name: r.data[primaryColId],
        };
      }
      // If it's a partial object (e.g. from initialValues)
      if ("name" in r) {
        return {
          id: r.id,
          name: (r as any).name,
        };
      }
      // Fallback
      return {
        id: r.id,
        name: r.id,
      };
    });

    onCellChangeInternal(rowId, colId, newValue);
    setLinkDialogState(null);
  };

  // Reset expanded group IDs cache and expanded items when switching tables or altering group definitions,
  // prompting new groups to automatically expand by default on-load
  const groupsStringified = JSON.stringify(groups || []);
  useEffect(() => {
    seenGroupIds.current.clear();
    setExpandedRowIds(new Set());
  }, [tableId, groupsStringified]);

  useEffect(() => {
    setExpandedRowIds((prev) => {
      const newExpanded = new Set(prev);
      let changed = false;

      const findGroups = (r: Row[]) => {
        r.forEach((row) => {
          if (row.isGroup) {
            if (!seenGroupIds.current.has(row.id)) {
              seenGroupIds.current.add(row.id);
              newExpanded.add(row.id);
              changed = true;
            }
            if (row.children) findGroups(row.children);
          }
        });
      };
      findGroups(rows);

      return changed ? newExpanded : prev;
    });
  }, [rows]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizingCol) {
        setIsDragging(true);
        const diff = e.clientX - resizingCol.startX;
        const minWidth = resizingCol.id === columns[0]?.id ? 120 : 50;
        onColumnResize(
          resizingCol.id,
          Math.max(minWidth, resizingCol.startWidth + diff),
        );
      }
      if (resizingRow) {
        setIsDragging(true);
        const diff = e.clientY - resizingRow.startY;
        onRowHeightChange(
          resizingRow.id,
          Math.max(20, resizingRow.startHeight + diff),
        );
      }
    };
    const handleMouseUp = () => {
      setTimeout(() => setIsDragging(false), 0);
      setResizingCol(null);
      setResizingRow(null);
    };
    if (resizingCol || resizingRow) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingCol, resizingRow, onColumnResize, onRowHeightChange]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // Handle clicking outside the cell grid to cancel cell focus and selections.
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target) return;

      // 1. Check if the click is inside a cell
      const isCellClick = !!target.closest('[data-row-id][data-col-id]');
      if (isCellClick) return;

      // 2. Check if the click is inside any interactive grid-related popup, dialog, context menu, modal, selector, etc.
      // We don't want to clear focus when the user is interacting inside custom dropdowns/popovers/modals/panel.
      const isInteractiveClick = !!(
        target.closest('[role="dialog"]') ||
        target.closest('[data-modal-portal="true"]') ||
        target.closest('[data-select-dropdown="true"]') ||
        target.closest('.fixed') || // details panels, modals overlay
        target.closest('.z-\\[100\\]') || // dialogs, sidebar drawers
        target.closest('.z-\\[110\\]') || // sub-selectors
        target.closest('.ClickOutsideWrapper') ||
        target.closest('.toast') ||
        target.closest('.hot-toast') ||
        target.closest('[data-popover="true"]') ||
        target.closest('[data-dropdown="true"]') ||
        target.closest('.user-selector') ||
        target.closest('.dept-selector') ||
        target.closest('.link-dialog') ||
        target.closest('.context-menu') ||
        target.closest('.ant-bubble') ||
        target.closest('.tooltip') ||
        target.closest('.pointer-events-none')
      );

      if (isInteractiveClick) return;

      setFocusedCell(null);
      setSelectionStart(null);
      setSelectionEnd(null);
    };

    document.addEventListener("mousedown", handleOutsideClick, true);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick, true);
    };
  }, []);

  // Initialize expanded state for rows with children (optional, or default collapsed)
  // For now, let's keep default collapsed, or maybe expand all on load?
  // Let's stick to manual toggle for better performance/control.

  const toggleRow = (rowId: string) => {
    const newSet = new Set(expandedRowIds);
    if (newSet.has(rowId)) {
      newSet.delete(rowId);
    } else {
      newSet.add(rowId);
    }
    setExpandedRowIds(newSet);
  };

  const handleDragFillStart = (
    e: React.MouseEvent,
    rowId: string,
    colId: string,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setDragFillStart({ rowId, colId, rowIndex: 0, colIndex: 0 }); // We'll look up indices on the fly
    setDragFillEnd({ rowId, colId, rowIndex: 0, colIndex: 0 });
    setIsDragFilling(true);
  };

  const handleDragFillMove = (rowId: string, colId: string) => {
    if (!isDragFilling || !dragFillStart) return;
    setDragFillEnd({ rowId, colId, rowIndex: 0, colIndex: 0 });
  };

  const handleDragFillEnd = () => {
    if (!isDragFilling || !dragFillStart || !dragFillEnd) {
      setIsDragFilling(false);
      setDragFillStart(null);
      setDragFillEnd(null);
      return;
    }

    const startR = visibleRows.findIndex((r) => r.id === dragFillStart.rowId);
    const endR = visibleRows.findIndex((r) => r.id === dragFillEnd.rowId);
    const startC = columns.findIndex((c) => c.id === dragFillStart.colId);
    const endC = columns.findIndex((c) => c.id === dragFillEnd.colId);

    if (startR === -1 || endR === -1 || startC === -1 || endC === -1) {
      setIsDragFilling(false);
      setDragFillStart(null);
      setDragFillEnd(null);
      return;
    }

    const minR = Math.min(startR, endR);
    const maxR = Math.max(startR, endR);
    const minC = Math.min(startC, endC);
    const maxC = Math.max(startC, endC);

    const sourceRow = visibleRows[startR];
    const sourceCol = columns[startC];
    const sourceValue = sourceRow.data[sourceCol.id];

    // Apply to all cells in range except the source cell
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (r === startR && c === startC) continue;
        const targetRow = visibleRows[r];
        const targetCol = columns[c];

        // Skip read-only columns
        if (
          targetCol &&
          (targetCol.type === FieldType.LOOKUP ||
            targetCol.type === FieldType.SEARCH_REFERENCE ||
            targetCol.type === FieldType.FORMULA)
        ) {
          continue;
        }

        if (targetRow && targetCol) {
          onCellChangeInternal(targetRow.id, targetCol.id, sourceValue);
        }
      }
    }

    setIsDragFilling(false);
    setDragFillStart(null);
    setDragFillEnd(null);
  };

  const handleAddSubRowInternal = (
    rowId: string,
    initialData?: Record<string, any>,
  ) => {
    onAddSubRow(rowId, initialData);
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });
  };

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
      return node.children.reduce(
        (acc, child) => acc + 1 + countDescendants(child),
        0,
      );
    };
    traverse(rows);
    return count;
  };

  // Helper to determine row height in pixels
  const getRowHeight = (h: RowHeight | string): number => {
    if (typeof h === "number") return h;
    switch (h) {
      case "SHORT":
        return 32;
      case "MEDIUM":
        return 40;
      case "TALL":
        return 64;
      case "EXTRA":
        return 96;
      default:
        return 40;
    }
  };

  const hBase = getRowHeight(rowHeight);

  // Helper for color rules
  const getRowColorClass = (row: Row) => {
    if (!colorRules || colorRules.length === 0) return "";
    for (const rule of colorRules) {
      const col = allColumns.find((c) => c.id === rule.fieldId);
      let val = row.data[rule.fieldId];

      // Parse JSON string if necessary for User/Department fields
      if (
        (col?.type === FieldType.USER || col?.type === FieldType.DEPARTMENT) &&
        typeof val === "string" &&
        val.startsWith("[")
      ) {
        try {
          val = JSON.parse(val);
        } catch (e) {}
      }

      let match = false;
      let ruleVal = rule.value;
      // Parse JSON string if necessary for User/Department fields rule value
      if (
        (col?.type === FieldType.USER || col?.type === FieldType.DEPARTMENT) &&
        typeof ruleVal === "string" &&
        ruleVal.startsWith("[")
      ) {
        try {
          ruleVal = JSON.parse(ruleVal);
        } catch (e) {}
      }

      // Special handling for User/Department fields when value is an array of IDs or objects
      if (
        (col?.type === FieldType.USER || col?.type === FieldType.DEPARTMENT) &&
        Array.isArray(ruleVal)
      ) {
        const selectedIds = ruleVal.map((v) =>
          String(v && typeof v === "object" ? v.id : v),
        );
        if (selectedIds.length === 0) {
          if (rule.operator === "is_empty" || rule.operator === "isEmpty")
            match = !val || (Array.isArray(val) && val.length === 0);
          else if (
            rule.operator === "is_not_empty" ||
            rule.operator === "isNotEmpty"
          )
            match = !!val && (!Array.isArray(val) || val.length > 0);
          else continue;
        } else {
          const rowIds = Array.isArray(val)
            ? val.map((v) => String(v && typeof v === "object" ? v.id : v))
            : val
              ? [String(val.id || val)]
              : [];

          const hasMatch = rowIds.some((id) => selectedIds.includes(id));

          switch (rule.operator) {
            case "is":
            case "eq":
              match = hasMatch;
              break;
            case "isNot":
            case "neq":
              match = !hasMatch;
              break;
            case "contains":
              match = hasMatch;
              break;
            case "not_contains":
              match = !hasMatch;
              break;
            case "isEmpty":
            case "is_empty":
              match = rowIds.length === 0;
              break;
            case "isNotEmpty":
            case "is_not_empty":
              match = rowIds.length > 0;
              break;
          }
        }
      } else {
        // Helper to get string representation for comparison
        const getComparableValue = (v: any): string => {
          if (col?.type === FieldType.CHECKBOX) {
            if (v === true || v === "true") return "true";
            return "";
          }
          if (v === null || v === undefined) return "";
          if (typeof v === "string" && v.startsWith("[")) {
            try {
              v = JSON.parse(v);
            } catch (e) {}
          }
          if (Array.isArray(v)) {
            return v
              .map((item) => {
                if (typeof item === "object" && item !== null) {
                  return (
                    item.real_name ||
                    item.name ||
                    item.dept_name ||
                    item.id ||
                    String(item)
                  );
                }
                return String(item);
              })
              .filter(Boolean)
              .join(", ");
          }
          if (typeof v === "object" && v !== null) {
            return v.real_name || v.name || v.dept_name || v.id || String(v);
          }
          return String(v);
        };

        const comparableVal = getComparableValue(val);
        const ruleComparableValue = getComparableValue(ruleVal);

        switch (rule.operator) {
          case "is":
          case "eq":
            match = comparableVal === ruleComparableValue;
            break;
          case "isNot":
          case "neq":
            match = comparableVal !== ruleComparableValue;
            break;
          case "contains":
            match = comparableVal
              .toLowerCase()
              .includes(ruleComparableValue.toLowerCase());
            break;
          case "not_contains":
            match = !comparableVal
              .toLowerCase()
              .includes(ruleComparableValue.toLowerCase());
            break;
          case "isEmpty":
          case "is_empty":
            match = !comparableVal;
            break;
          case "isNotEmpty":
          case "is_not_empty":
            match = !!comparableVal;
            break;
        }
      }

      if (match) {
        return `${rule.color} ${rule.isBold ? "font-bold" : ""}`.trim();
      }
    }
    return "";
  };

  const getSelectableRowIds = (rowsList: Row[]): string[] => {
    let ids: string[] = [];
    rowsList.forEach((row) => {
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

  const handleRowMove = async (rowId: string, targetRowId: string) => {
    try {
      const getAllRealRows = (rowsList: Row[]): Row[] => {
        let result: Row[] = [];
        for (const row of rowsList) {
          if (row.isGroup) {
            if (row.children) {
              result = result.concat(getAllRealRows(row.children));
            }
          } else {
            result.push(row);
            if (row.children) {
              result = result.concat(getAllRealRows(row.children));
            }
          }
        }
        return result;
      };

      const allRealRows = getAllRealRows(rows);
      const targetRow = allRealRows.find((r) => r.id === targetRowId);
      const sourceRow = allRealRows.find((r) => r.id === rowId);

      if (!targetRow || !sourceRow) return;

      const normalizeParentId = (id: string | null | undefined) => id || null;
      const targetParentId = normalizeParentId(targetRow.parent_id);
      const sourceParentId = normalizeParentId(sourceRow.parent_id);

      const targetSiblings = allRealRows.filter(
        (r) => normalizeParentId(r.parent_id) === targetParentId,
      );

      let targetIndex = targetRow.index ?? targetSiblings.findIndex((r) => r.id === targetRowId);

      if (onMoveRow) {
        onMoveRow(rowId, targetIndex);
      } else {
        await api.moveRow(tableId, rowId, targetIndex);
        // Refresh rows after move
        if (onRefresh) {
          onRefresh();
        }
      }
    } catch (error: any) {
      if (error.message === "Unauthorized") {
        alert("Token已过期，请重新配置token");
      } else {
        console.error("Failed to move row:", error);
        alert("移动行失败");
      }
    }
  };

  const handleSelectAll = () => {
    const selectableIds = getSelectableRowIds(rows);
    if (
      selectedRowIds.size === selectableIds.length &&
      selectableIds.length > 0
    ) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(selectableIds));
    }
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    rowId: string,
    colId?: string,
  ) => {
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

  // Helper to format numbers
  const formatNumber = (val: any, format: string): string => {
    if (val === null || val === undefined || val === "") return "";
    const num = Number(val);
    if (isNaN(num)) return String(val);

    switch (format) {
      case "0":
        return num.toFixed(0);
      case "0.0":
        return num.toFixed(1);
      case "0.00":
        return num.toFixed(2);
      case "0%":
        return `${(num * 100).toFixed(0)}%`;
      case "¥0.00":
        return `¥${num.toFixed(2)}`;
      default:
        return String(num);
    }
  };

  // Highlight text helper
  const highlightText = (text: any) => {
    if (text === null || text === undefined || text === "") return null;
    const str = String(text);
    if (
      !searchKeyword ||
      !str.toLowerCase().includes(searchKeyword.toLowerCase())
    ) {
      return str;
    }

    const parts = str.split(new RegExp(`(${searchKeyword})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === searchKeyword.toLowerCase() ? (
            <span
              key={i}
              className="bg-[#ffec3d] text-black rounded-[2px] box-decoration-clone"
            >
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </>
    );
  };

  // Render cell content based on type
  const renderCell = (
    row: Row,
    col: Column,
    level: number = 0,
    parentLines: boolean[] = [],
  ) => {
    const val = row.data[col.id];
    const isEditing =
      activeEditingCell?.rowId === row.id &&
      activeEditingCell?.colId === col.id;

    const isFirstCol = columns[0].id === col.id;

    const TreeLines = () => {
      if (level <= 0 || !isFirstCol) return null;
      return (
        <div
          className="absolute left-0 top-0 bottom-0 flex pointer-events-none"
          style={{ width: level * 24 }}
        >
          {parentLines.map((hasMore, i) => (
            <div
              key={i}
              className="relative w-6 h-full flex justify-center shrink-0"
            >
              {/* Vertical Line for this ancestor level */}
              {hasMore && (
                <div className="absolute top-0 bottom-0 left-1/2 w-[1px] border-l border-dashed border-gray-300"></div>
              )}
              {/* Horizontal Hook and Vertical Line for the current depth */}
              {i === level - 1 && (
                <>
                  <div
                    className={`absolute top-0 ${parentLines[i] ? "bottom-0" : "h-1/2"} left-1/2 w-[1px] border-l border-dashed border-gray-300`}
                  ></div>
                  <div className="absolute top-1/2 left-1/2 w-3 h-[1px] border-t border-dashed border-gray-300"></div>
                </>
              )}
            </div>
          ))}
        </div>
      );
    };

    const commentCount: number = commentCounts[`${row.id}_${col.id}`] || 0;

    const CommentBadge = ({
      count,
      rowId,
      colId,
      isHover = false,
      className,
    }: {
      count: number;
      rowId: string;
      colId: string;
      isHover?: boolean;
      className?: string;
    }) => {
      if (count <= 0) return null;

      const handleClick = (e: React.MouseEvent | React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenComment(rowId, colId);
      };

      if (isHover) {
        return (
          <div className="relative group/tooltip inline-flex shrink-0">
            <button
              className="peer flex items-center justify-center w-auto h-6 px-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded transition-colors gap-1 border-l border-gray-100 cursor-pointer pointer-events-auto"
              onClick={handleClick}
              onPointerDown={handleClick}
              type="button"
            >
              <ICONS.Message className="w-3.5 h-3.5 text-yellow-500" />
              <span className="font-bold text-yellow-600 text-[10px]">
                {count}
              </span>
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 peer-hover:opacity-100 pointer-events-none transition-opacity shadow-xl z-[9999]">
              查看评论
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-[3px] border-transparent border-t-gray-800"></div>
            </div>
          </div>
        );
      }
      return (
        <button
          title="查看评论"
          type="button"
          className={
            className ||
            "absolute right-2 top-1/2 -translate-y-1/2 z-10 w-auto h-auto transition-opacity shadow-sm bg-white/90 hover:bg-yellow-50 rounded-md cursor-pointer pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 border border-gray-100"
          }
          onClick={handleClick}
          onPointerDown={handleClick}
        >
          <ICONS.Message className="w-3 h-3 text-yellow-500" />
          <span className="text-yellow-600 text-[10px] font-bold">{count}</span>
        </button>
      );
    };

    const handleCellClick = (e: React.MouseEvent) => {
      const wasFocused =
        focusedCellAtMouseDown.current?.rowId === row.id &&
        focusedCellAtMouseDown.current?.colId === col.id;

      if (wasFocused && !activeEditingCell) {
        e.stopPropagation();
        e.preventDefault();
        if (col.type === FieldType.LINK) {
          const values = parseLinkValues(val);
          const targetTableId = col.config?.linked_table_id;
          if (targetTableId) {
            const primaryColId = columns[0]?.id;
            const rowTitle = primaryColId
              ? String(row.data[primaryColId] || row.id)
              : row.id;

            setLinkDialogState({
              isOpen: true,
              rowId: row.id,
              colId: col.id,
              targetTableId,
              initialValues: values,
              title: rowTitle,
            });
          } else {
            toast.error("请先配置关联表");
          }
        } else if (
          [
            FieldType.USER,
            FieldType.DEPARTMENT,
            FieldType.SELECT,
            FieldType.MULTI_SELECT,
            FieldType.ATTACHMENT,
          ].includes(col.type)
        ) {
          const rect = e.currentTarget.getBoundingClientRect();
          handleSetActiveEditingCell({ rowId: row.id, colId: col.id, rect });
        } else if (
          ![
            FieldType.CHECKBOX,
            FieldType.FORMULA,
            FieldType.LOOKUP,
            FieldType.SEARCH_REFERENCE,
          ].includes(col.type)
        ) {
          startEditing(row.id, col.id, val);
        }
        return;
      }

      setFocusedCell({ rowId: row.id, colId: col.id });
      if (col.type === FieldType.CHECKBOX && !wasFocused) {
        onCellChangeInternal(row.id, col.id, !val);
      }
    };

    // Handle editing state first
    if (isEditing) {
      if (
        col.type === FieldType.LOOKUP ||
        col.type === FieldType.SEARCH_REFERENCE ||
        col.type === FieldType.FORMULA
      ) {
        // Read-only fields shouldn't be editable
        setActiveEditingCell(null);
        return null;
      }
      if (col.type === FieldType.USER) {
        const currentEditValue = editingValue !== null && editingValue !== undefined ? editingValue : val;
        return (
          <ClickOutsideWrapper
            onClickOutside={saveEditing}
            className="w-full h-full relative"
          >
            <div className="w-full h-full flex items-center px-2 gap-1 overflow-hidden border-2 border-primary-500 bg-white absolute inset-0 z-[101]">
              <UserCellDisplay
                tableId={tableId}
                rowId={row.id}
                colId={col.id}
                value={currentEditValue}
                onDelete={(index) => {
                  const curr = Array.isArray(currentEditValue) ? currentEditValue : [];
                  const newValue = curr.filter((_, i) => i !== index);
                  setEditingValue(newValue);
                }}
              />
            </div>
            <UserSelector
              value={currentEditValue}
              onChange={(newVal) =>
                setEditingValue(newVal)
              }
              onClose={saveEditing}
            />
          </ClickOutsideWrapper>
        );
      }

      if (col.type === FieldType.DEPARTMENT) {
        const currentEditValue = editingValue !== null && editingValue !== undefined ? editingValue : val;
        const depts = Array.isArray(currentEditValue) ? currentEditValue : (currentEditValue ? [currentEditValue] : []);
        return (
          <ClickOutsideWrapper
            onClickOutside={saveEditing}
            className="w-full h-full relative"
          >
            <div className="w-full h-full flex items-center px-2 gap-1 overflow-hidden border-2 border-primary-500 bg-white absolute inset-0 z-[101]">
              {depts.map((d: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center gap-1 bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[10px] border border-gray-200 shrink-0"
                >
                  <ICONS.Building className="w-3 h-3 text-gray-500" />
                  <span className="truncate max-w-[60px]">{d.name}</span>
                </div>
              ))}
              {depts.length === 0 && (
                <span className="text-gray-300 text-xs">选择部门</span>
              )}
            </div>
            <DepartmentSelector
              value={currentEditValue}
              onChange={(newVal) => setEditingValue(newVal)}
              onClose={saveEditing}
            />
          </ClickOutsideWrapper>
        );
      }

      if (col.type === FieldType.SELECT) {
        const colorStyle = getTagColor(val, col.config?.option_colors);
        return (
          <div className="w-full h-full relative">
            <div className="w-full h-full flex items-center px-2 border-2 border-primary-500 bg-white absolute inset-0 z-[101]">
              {val ? (
                <div
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${colorStyle.bg} ${colorStyle.text} border border-transparent`}
                >
                  {val}
                </div>
              ) : null}
            </div>
            <SelectCellEditor
              val={val}
              col={col}
              row={row}
              onCellChange={onCellChangeInternal}
              onColumnUpdate={onColumnUpdate}
              setActiveEditingCell={handleSetActiveEditingCell}
              rect={activeEditingCell?.rect}
            />
          </div>
        );
      }

      if (col.type === FieldType.MULTI_SELECT) {
        const selectedValues = Array.isArray(val)
          ? val
          : val
            ? String(val).split(",")
            : [];
        return (
          <div className="w-full h-full relative">
            <div className="w-full h-full flex items-center px-2 gap-1 overflow-hidden border-2 border-primary-500 bg-white absolute inset-0 z-[101]">
              {selectedValues.map((v: string, i: number) => {
                const colorStyle = getTagColor(v, col.config?.option_colors);
                return (
                  <div
                    key={i}
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${colorStyle.bg} ${colorStyle.text} border border-transparent shrink-0`}
                  >
                    {v}
                  </div>
                );
              })}
            </div>
            <MultiSelectCellEditor
              val={val}
              col={col}
              row={row}
              onCellChange={onCellChangeInternal}
              onColumnUpdate={onColumnUpdate}
              setActiveEditingCell={handleSetActiveEditingCell}
              rect={activeEditingCell?.rect}
            />
          </div>
        );
      }

      if (col.type === FieldType.ATTACHMENT) {
        const currentEditValue = editingValue !== null && editingValue !== undefined ? editingValue : val;
        const files = parseJsonArray(currentEditValue);
        return (
          <ClickOutsideWrapper
            onClickOutside={saveEditing}
            className="w-full h-full relative"
          >
            {/* The cell itself (looks like non-editing state but with blue border) */}
            <div className="w-full h-full flex items-center px-1 gap-1 overflow-hidden border-2 border-primary-500 bg-white absolute inset-0 z-[101]">
              <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center shrink-0 text-gray-500">
                <ICONS.Plus className="w-4 h-4" />
              </div>
              {files.length > 0 && (
                <div className="flex items-center gap-1 overflow-hidden">
                  {files.map((f: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-center w-6 h-6 bg-primary-50 text-primary-600 rounded shrink-0 border border-primary-100"
                      title={f.filename || f.name}
                    >
                      <span className="text-[10px] font-bold uppercase">
                        {String(
                          f.extension || f.name?.split(".").pop() || "F",
                        ).substring(0, 3)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="ml-auto shrink-0 text-gray-400 pr-1">
                <ICONS.ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* The Popup */}
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[102] p-3 min-w-[320px] flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto">
                {files.map((f: any, i: number) => (
                  <div
                    key={i}
                    className="relative w-32 h-24 rounded-lg overflow-hidden border border-gray-200 group bg-gray-100 flex items-center justify-center"
                  >
                    {/* File Preview/Icon */}
                    {f.url || f.path ? (
                      f.extension &&
                      ["jpg", "jpeg", "png", "gif", "webp"].includes(
                        f.extension.toLowerCase(),
                      ) ? (
                        <>
                          <img
                            src={f.url || api.getFileUrl(f.path)}
                            className="w-full h-full object-cover"
                            alt={f.filename || f.name}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              if (e.currentTarget.nextElementSibling) {
                                e.currentTarget.nextElementSibling.classList.remove(
                                  "hidden",
                                );
                                e.currentTarget.nextElementSibling.classList.add(
                                  "flex",
                                );
                              }
                            }}
                          />
                          <div className="hidden flex-col items-center justify-center text-gray-400 w-full h-full">
                            <ICONS.File className="w-8 h-8 mb-1 text-primary-500" />
                            <span className="text-xs font-medium uppercase truncate px-1 w-full text-center">
                              {f.extension ||
                                f.name?.split(".").pop() ||
                                "FILE"}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-gray-400">
                          <ICONS.File className="w-8 h-8 mb-1 text-primary-500" />
                          <span className="text-xs font-medium uppercase">
                            {f.extension || f.name?.split(".").pop() || "FILE"}
                          </span>
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <ICONS.File className="w-8 h-8 mb-1 text-primary-500" />
                        <span className="text-xs font-medium uppercase">
                          {f.extension || f.name?.split(".").pop() || "FILE"}
                        </span>
                      </div>
                    )}

                    {/* Top Gradient & Filename */}
                    <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-black/60 to-transparent p-1.5 flex items-start justify-between z-10">
                      <span className="text-[10px] text-white truncate drop-shadow-md pr-4">
                        {f.filename || f.name}
                      </span>
                    </div>

                    {/* Delete Button */}
                    <Tooltip content="删除">
                      <button
                        className="absolute top-1 right-1 w-4 h-4 bg-white/80 hover:bg-white rounded-full flex items-center justify-center z-20 shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newFiles = [...files];
                          newFiles.splice(i, 1);
                          setEditingValue(newFiles);
                        }}
                      >
                        <ICONS.Close className="w-2.5 h-2.5 text-gray-600" />
                      </button>
                    </Tooltip>

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 z-10">
                      <Tooltip content="预览">
                        <button
                          className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(f);
                          }}
                        >
                          <ICONS.Eye className="w-5 h-5" />
                        </button>
                      </Tooltip>
                      <Tooltip content="下载">
                        <button
                          className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            api.downloadFile(f.id, f.filename || f.name);
                          }}
                        >
                          <ICONS.Download className="w-5 h-5" />
                        </button>
                      </Tooltip>
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
                        for (const file of Array.from(
                          e.target.files,
                        ) as File[]) {
                          const res = await api.uploadFile(file);
                          if (res.data) {
                            newFiles.push(res.data);
                          }
                        }
                        setEditingValue([
                          ...files,
                          ...newFiles,
                        ]);
                      } catch (err) {
                        console.error("Upload failed", err);
                      }
                    }
                  }}
                />
                <div className="w-full py-2 flex items-center justify-center gap-1 text-sm text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors cursor-pointer">
                  <ICONS.Plus className="w-4 h-4" /> 添加本地文件
                </div>
              </div>
            </div>
          </ClickOutsideWrapper>
        );
      }

      if (col.type === FieldType.TEXT) {
        return (
          <ClickOutsideWrapper
            onClickOutside={saveEditing}
            className="absolute top-0 left-0 w-full h-full z-[100]"
          >
            <AutoResizeTextarea
              className="relative z-[101] w-full min-h-full bg-white border-2 border-primary-500 outline-none px-2 py-1 text-sm resize-none overflow-hidden shadow-lg"
              value={
                editingValue !== null && editingValue !== undefined
                  ? editingValue
                  : val || ""
              }
              onChange={(e: any) => {
                setEditingValue(e.target.value);
              }}
              autoFocus
              onFocus={(e: any) => {
                const val = e.target.value;
                e.target.setSelectionRange(val.length, val.length);
              }}
              onKeyDown={(e: any) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveEditing();
                }
              }}
            />
          </ClickOutsideWrapper>
        );
      }

      let inputType = "text";
      if (col.type === FieldType.NUMBER) inputType = "number";
      else if (col.type === FieldType.TIME) inputType = "time";
      else if (col.type === FieldType.DATE) {
        const fmt = col.config?.format || col.format || "";
        if (fmt.includes("HH") || fmt.includes("mm")) {
          inputType = "datetime-local";
        } else {
          inputType = "date";
        }
      }

      let displayValue =
        editingValue !== null && editingValue !== undefined
          ? editingValue
          : val || "";
      if (col.type === FieldType.DATE) {
        displayValue = formatDateForInput(
          displayValue,
          inputType === "datetime-local",
        );
      }

      const handleSave = () => {
        let valToSave = editingValue;
        if (
          inputType === "datetime-local" &&
          valToSave &&
          typeof valToSave === "string"
        ) {
          valToSave = valToSave.replace("T", " ");
        }
        if (activeEditingCell && !isSavingRef.current) {
          isSavingRef.current = true;
          onCellChangeInternal(
            activeEditingCell.rowId,
            activeEditingCell.colId,
            valToSave,
          );
          handleSetActiveEditingCell(null);
          setTimeout(() => {
            isSavingRef.current = false;
          }, 100);
        }
      };

      const includeSeconds = col.type === FieldType.TIME && col.config?.format?.includes('ss');

      return (
        <input
          type={inputType}
          step={includeSeconds ? "1" : undefined}
          className="w-full h-full bg-transparent outline-none px-2"
          value={displayValue}
          onChange={(e) => setEditingValue(e.target.value)}
          autoFocus
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSave();
            }
          }}
        />
      );
    }

    if (col.type === FieldType.USER) {
      return (
        <div
          className="w-full h-full flex items-center px-2 gap-1 overflow-hidden cursor-pointer relative group/cell"
          onClick={handleCellClick}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
          onMouseLeave={handleCellMouseLeave}
        >
          <UserCellDisplay
            tableId={tableId}
            rowId={row.id}
            colId={col.id}
            value={val}
            searchKeyword={searchKeyword}
            onDelete={(index) => {
              const newValue = Array.isArray(val)
                ? val.filter((_, i) => i !== index)
                : [];
              onCellChangeInternal(row.id, col.id, newValue);
            }}
          />
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    if (col.type === FieldType.DEPARTMENT) {
      const depts = Array.isArray(val) ? val : val ? [val] : [];
      return (
        <div
          className="w-full h-full flex items-center px-2 gap-1 overflow-hidden cursor-pointer relative group/cell"
          onClick={handleCellClick}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
          onMouseLeave={handleCellMouseLeave}
        >
          {depts.length > 0 ? (
            depts.map((d: any, i: number) => (
              <div
                key={i}
                className="flex items-center gap-1 bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[10px] border border-gray-200 shrink-0"
              >
                <ICONS.Building className="w-3 h-3 text-gray-500" />
                <span className="truncate max-w-[60px]">
                  {highlightText(d.name)}
                </span>
              </div>
            ))
          ) : (
            <span className="text-gray-300 text-xs">选择部门</span>
          )}
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    if (col.type === FieldType.SELECT) {
      const colorStyle = getTagColor(val, col.config?.option_colors);
      return (
        <div
          className="w-full h-full flex items-center px-2 cursor-pointer relative group/cell"
          onClick={handleCellClick}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
          onMouseLeave={handleCellMouseLeave}
        >
          {val ? (
            <span
              className={`px-2 py-0.5 rounded text-xs ${colorStyle.bg} ${colorStyle.text} truncate max-w-full`}
            >
              {highlightText(String(val))}
            </span>
          ) : (
            <span className="text-gray-300 text-xs">请选择</span>
          )}
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    if (col.type === FieldType.MULTI_SELECT) {
      const values = Array.isArray(val)
        ? val
        : val
          ? String(val).split(",")
          : [];
      return (
        <div
          className="w-full h-full flex items-center px-2 gap-1 overflow-hidden cursor-pointer relative group/cell"
          onClick={handleCellClick}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
          onMouseLeave={handleCellMouseLeave}
        >
          {values.length > 0 ? (
            values.map((v: string, idx: number) => {
              const colorStyle = getTagColor(v, col.config?.option_colors);
              return (
                <span
                  key={idx}
                  className={`px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap ${colorStyle.bg} ${colorStyle.text}`}
                >
                  {highlightText(v)}
                </span>
              );
            })
          ) : (
            <span className="text-gray-300 text-xs">请选择</span>
          )}
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    if (col.type === FieldType.CHECKBOX) {
      return (
        <div
          className="flex justify-center cursor-pointer w-full h-full items-center relative group/cell"
          onClick={() => {
            setFocusedCell({ rowId: row.id, colId: col.id });
            onCellChangeInternal(row.id, col.id, !val);
          }}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
          onMouseLeave={handleCellMouseLeave}
        >
          {val ? <CheckboxChecked /> : <CheckboxUnchecked />}
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    if (col.type === FieldType.ATTACHMENT) {
      const files = parseJsonArray(val);
      return (
        <div
          className="w-full h-full flex items-center px-1 gap-1 cursor-pointer overflow-hidden relative group/cell"
          onClick={handleCellClick}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
          onMouseLeave={handleCellMouseLeave}
        >
          <div className="w-6 h-6 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center shrink-0 text-gray-500 transition-colors">
            <ICONS.Plus className="w-4 h-4" />
          </div>
          {files.length > 0 && (
            <div className="flex items-center gap-1 overflow-hidden">
              {files.map((f: any, i: number) => {
                const filename =
                  typeof f === "object" ? f.filename || f.name : String(f);
                const ext = String(
                  f.extension || filename?.split(".").pop() || "FILE",
                ).toUpperCase();
                return (
                  <div
                    key={i}
                    className="flex items-center justify-center w-6 h-6 bg-primary-50 text-primary-600 rounded shrink-0 border border-primary-100"
                    title={filename}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(f);
                    }}
                  >
                    <span className="text-[8px] font-bold">
                      {ext.substring(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="ml-auto shrink-0 text-gray-400 opacity-0 group-hover/cell:opacity-100 transition-opacity pr-1">
            <ICONS.ChevronDown className="w-4 h-4" />
          </div>
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    if (col.type === FieldType.LINK) {
      const values = parseLinkValues(val);
      const targetTableId = col.config?.linked_table_id;

      return (
        <div
          className="w-full h-full flex items-center px-2 gap-1 overflow-hidden cursor-pointer relative group/cell"
          onClick={handleCellClick}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
          onMouseLeave={handleCellMouseLeave}
        >
          {values.length > 0 ? (
            values.map((v: any, idx: number) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap bg-primary-50 text-primary-600 border border-primary-100 flex items-center gap-1"
              >
                {highlightText(
                  v.name || (typeof v === "object" ? v.id : String(v)),
                )}
                <span
                  className="hover:text-red-500 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newValues = values.filter((_, i) => i !== idx);
                    onCellChangeInternal(row.id, col.id, newValues);
                  }}
                >
                  ×
                </span>
              </span>
            ))
          ) : (
            <span className="text-gray-300 text-[10px]">点击关联</span>
          )}

          <div className="ml-auto shrink-0 text-gray-400 opacity-0 group-hover/cell:opacity-100 transition-opacity pr-1">
            <ICONS.ChevronDown className="w-4 h-4" />
          </div>
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    if (col.type === FieldType.NUMBER) {
      return (
        <div
          className="px-2 truncate text-sm text-gray-700 w-full h-full flex items-center cursor-text group/cell relative justify-end text-right font-mono"
          onClick={handleCellClick}
          onContextMenu={(e) => handleContextMenu(e, row.id, col.id)}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
          onMouseLeave={handleCellMouseLeave}
        >
          {highlightText(
            formatNumber(val, col.config?.format || col.format || ""),
          )}
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    if (col.type === FieldType.DATE) {
      return (
        <div
          className="px-2 truncate text-sm text-gray-700 w-full h-full flex items-center cursor-text group/cell relative"
          onClick={handleCellClick}
          onContextMenu={(e) => handleContextMenu(e, row.id, col.id)}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
          onMouseLeave={handleCellMouseLeave}
        >
          {highlightText(
            formatDateForDisplay(
              val,
              col.config?.format || col.format || "YYYY-MM-DD",
            ),
          )}
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    if (col.type === FieldType.TIME) {
      return (
        <div
          className="px-2 truncate text-sm text-gray-700 w-full h-full flex items-center cursor-text group/cell relative"
          onClick={handleCellClick}
          onContextMenu={(e) => handleContextMenu(e, row.id, col.id)}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
          onMouseLeave={handleCellMouseLeave}
        >
          {highlightText(
            formatTimeForDisplay(
              val,
              col.config?.format || "HH:mm",
            ),
          )}
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    if (
      col.type === FieldType.LOOKUP ||
      col.type === FieldType.SEARCH_REFERENCE
    ) {
      // These are derived fields, usually read-only
      // They might contain multiple values if it's a search reference
      const displayVal = Array.isArray(val)
        ? val
            .map((v) => (typeof v === "object" ? v.name || v.id : String(v)))
            .join(", ")
        : String(val || "");
      return (
        <div
          className="px-2 truncate text-sm text-gray-700 w-full h-full flex items-center justify-start cursor-default bg-gray-50/30 relative group/cell"
          onClick={handleCellClick}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, displayVal)}
          onMouseLeave={handleCellMouseLeave}
        >
          <div className="flex items-center gap-1 text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 w-fit max-w-full">
            <span className="font-mono font-bold text-[10px] text-gray-400 shrink-0">
              🔍
            </span>
            <span className="truncate font-mono text-gray-700 text-xs">
              {highlightText(
                String(
                  displayVal !== undefined && displayVal !== null
                    ? displayVal
                    : "",
                ),
              )}
            </span>
          </div>
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    if (col.type === FieldType.FORMULA) {
      const formula = col.config?.formula || col.formula;
      let displayVal = evaluateFormula(formula || "", columns, row);

      if (typeof displayVal === "boolean") {
        displayVal = displayVal ? "TRUE" : "FALSE";
      }

      // Use input type number style as requested
      // Check if it's a number to use input type="number"
      const isNumeric =
        !isNaN(Number(displayVal)) &&
        displayVal !== "" &&
        displayVal !== null &&
        displayVal !== undefined &&
        typeof displayVal !== "boolean";

      if (isNumeric) {
        return (
          <div
            className="w-full h-full px-2 flex items-center group/cell relative"
            onClick={handleCellClick}
          >
            <input
              type="number"
              className="w-full h-full bg-transparent outline-none text-sm text-gray-700 font-mono"
              value={String(displayVal)}
              readOnly
            />
            <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
          </div>
        );
      }

      return (
        <div
          className="px-2 truncate text-sm text-gray-700 w-full h-full flex items-center cursor-default bg-gray-50/50 relative group/cell font-mono"
          onClick={handleCellClick}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, displayVal)}
          onMouseLeave={handleCellMouseLeave}
        >
          {/* Formula results are read-only */}
          {highlightText(
            String(
              displayVal !== undefined && displayVal !== null ? displayVal : "",
            ),
          )}
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    if (col.type === FieldType.HYPERLINK) {
      return (
        <div
          className="px-2 truncate text-sm text-gray-700 w-full h-full flex items-center cursor-text group/cell relative"
          onClick={handleCellClick}
          onContextMenu={(e) => handleContextMenu(e, row.id, col.id)}
          onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
          onMouseLeave={handleCellMouseLeave}
        >
          <span
            className="truncate flex-1 text-blue-600 underline cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (val)
                window.open(
                  val.startsWith("http") ? val : `https://${val}`,
                  "_blank",
                );
            }}
          >
            {highlightText(String(val || ""))}
          </span>
          <CommentBadge count={commentCount} rowId={row.id} colId={col.id} />
        </div>
      );
    }

    return (
      <div
        className="px-2 text-sm text-gray-700 w-full h-full flex items-center cursor-text group/cell relative hover:z-30"
        onClick={handleCellClick}
        onContextMenu={(e) => handleContextMenu(e, row.id, col.id)}
        style={
          isFirstCol
            ? { paddingLeft: level > 0 ? `${level * 24 + 8}px` : "8px" }
            : {}
        }
        onMouseEnter={(e) => handleCellMouseEnter(e, row, col, val)}
        onMouseLeave={handleCellMouseLeave}
      >
        <TreeLines />
        {isFirstCol && (
          <div
            className={`w-4 h-4 mr-1 flex items-center justify-center cursor-pointer hover:bg-gray-100 rounded shrink-0 ${row.children && row.children.length > 0 ? "" : "invisible"}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleRow(row.id);
            }}
          >
            {expandedRowIds.has(row.id) ? (
              <ICONS.ChevronDown className="w-3 h-3 text-gray-400" />
            ) : (
              <ICONS.ChevronRight className="w-3 h-3 text-gray-400" />
            )}
          </div>
        )}
        <span className="truncate flex-1">
          {highlightText(String(val || ""))}
        </span>

        {/* First Column Actions */}
        {columns[0].id === col.id && (
          <>
            {/* Hover Actions */}
            <div className="hidden group-hover/cell:flex items-center gap-0.5 bg-white border border-gray-200/80 p-0.5 rounded-md absolute right-2 top-1/2 -translate-y-1/2 shadow-sm z-20 whitespace-nowrap">
              <div className="relative group/tooltip">
                <button
                  className="peer flex items-center justify-center w-6 h-6 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetail(row);
                  }}
                >
                  <ICONS.Eye className="w-3.5 h-3.5" />
                </button>
                {/* Tooltip: Always above, highest z-index */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 peer-hover:opacity-100 pointer-events-none transition-opacity shadow-xl z-[9999]">
                  查看
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-[3px] border-transparent border-t-gray-800"></div>
                </div>
              </div>
              <div className="relative group/tooltip">
                <button
                  className="peer flex items-center justify-center w-6 h-6 text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    const initialData: Record<string, any> = {};
                    if (groups) {
                      groups.forEach((g) => {
                        if (row.data[g.column_id] !== undefined) {
                          initialData[g.column_id] = row.data[g.column_id];
                        }
                      });
                    }
                    handleAddSubRowInternal(row.id, initialData);
                  }}
                >
                  <ICONS.Plus className="w-4 h-4" />
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 peer-hover:opacity-100 pointer-events-none transition-opacity shadow-xl z-[9999]">
                  添加子记录
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-[3px] border-transparent border-t-gray-800"></div>
                </div>
              </div>
              <CommentBadge
                count={commentCount}
                rowId={row.id}
                colId={col.id}
                isHover
              />
            </div>

            {/* Default Comment Count (Non-Hover) */}
            <CommentBadge
              count={commentCount}
              rowId={row.id}
              colId={col.id}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-auto h-auto transition-opacity shadow-sm bg-white/90 hover:bg-yellow-50 rounded-md cursor-pointer pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 border border-gray-100 group-hover/cell:opacity-0 group-hover/cell:pointer-events-none"
            />
          </>
        )}
      </div>
    );
  };

  const renderRowRecursive = (
    row: Row,
    level = 0,
    indexPos: number,
    parentLines: boolean[] = [],
  ): React.ReactNode => {
    const isExpanded = expandedRowIds.has(row.id);
    const isSelected = selectedRowIds.has(row.id);
    const colorClass: string = getRowColorClass(row);
    // Row is highlighted if any cell in it is being edited, or if selected
    const isRowEditing = activeEditingCell?.rowId === row.id;
    let rowBgClass = "bg-white hover:bg-gray-50";
    if (isSelected) {
      rowBgClass = "bg-primary-50 hover:bg-primary-50";
    } else if (colorClass) {
      rowBgClass = `${colorClass} hover:brightness-95`;
    }

    const rowHeightVal = rowHeights?.[row.id] || hBase;

    if (row.isGroup) {
      return (
        <React.Fragment key={row.id}>
          <div
            className="flex border-b border-gray-200 bg-gray-50 group relative cursor-pointer hover:bg-gray-100 transition-colors"
            style={{ height: 36 }}
            onClick={() => toggleRow(row.id)}
          >
            <div
              className="flex items-center px-4 w-full text-sm font-medium text-gray-700"
              style={{ paddingLeft: `${level * 24 + 16}px` }}
            >
              <div className="w-4 h-4 mr-2 flex items-center justify-center shrink-0">
                {isExpanded ? (
                  <ICONS.ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ICONS.ChevronRight className="w-4 h-4 text-gray-500" />
                )}
              </div>
              <div className="flex items-center gap-2">
                {(row.groupKey && !Array.isArray(row.groupKey)
                  ? (row.groupKey as any).label
                  : (row.groupKey as any[]) || []
                ).map((k: any, i: number) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-gray-400">/</span>}
                    <span
                      className={
                        !k || k === "(空)" ? "text-gray-400 italic" : ""
                      }
                    >
                      {k || "(空)"}
                    </span>
                  </React.Fragment>
                ))}
                <span className="text-gray-400 text-xs ml-2 font-normal">
                  {row.data.count} 条记录
                </span>
              </div>
            </div>
          </div>
          {isExpanded && row.children && (
            <>
              {row.children.map((child, idx) =>
                renderRowRecursive(child, level + 1, idx, [
                  ...parentLines,
                  idx < row.children!.length - 1,
                ]),
              )}
              <div
                className="flex border-b border-gray-100 bg-white hover:bg-gray-50 cursor-pointer transition-colors items-center text-gray-400 text-xs gap-2"
                style={{
                  height: 36,
                  paddingLeft: `${(level + 1) * 24 + 16 + 24}px`,
                }}
                onClick={() => {
                  const initialData: Record<string, any> = {};
                  if (groups && row.groupKey) {
                    groups.forEach((g, i) => {
                      const val = Array.isArray(row.groupKey)
                        ? row.groupKey[i]
                        : (row.groupKey as any)?.value?.[i];
                      if (val && val !== "(空)") {
                        initialData[g.column_id] = val;
                      }
                    });
                  }
                  if (onDirectAddRow) {
                    onDirectAddRow(initialData);
                  } else {
                    onAddRow(initialData);
                  }
                }}
              >
                <ICONS.Plus className="w-3 h-3" /> 添加新记录
              </div>
            </>
          )}
        </React.Fragment>
      );
    }

    return (
      <React.Fragment key={row.id}>
        <div
          className={`group/row flex border-b border-gray-100 group relative transition-colors ${rowBgClass} ${isRowEditing ? "z-20 ring-1 ring-primary-400" : "hover:z-50"} ${dropTargetRowId === row.id ? "border-t-2 border-t-primary-500" : ""}`}
          style={{ height: rowHeightVal }}
          onContextMenu={(e) => handleContextMenu(e, row.id)}
          data-row-id={row.id}
          onDragOver={(e) => {
            e.preventDefault();
            if (draggedRowId !== row.id) {
              setDropTargetRowId(row.id);
              e.dataTransfer.dropEffect = "move";
            }
          }}
          onDragLeave={() => {
            setDropTargetRowId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDropTargetRowId(null);
            const draggedRowId = e.dataTransfer.getData("text/plain");
            if (draggedRowId !== row.id) {
              handleRowMove(draggedRowId, row.id);
            }
          }}
        >
          {/* Row Header / Handle */}
          <div
            className={`w-10 shrink-0 border-r border-gray-100 flex items-center justify-center text-xs select-none cursor-pointer group/handle relative ${isSelected ? "bg-primary-50" : ""}`}
            onClick={(e) => handleRowSelect(e, row.id)}
            draggable
            onDragStart={(e) => {
              setDraggedRowId(row.id);
              e.dataTransfer.setData("text/plain", row.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              setDraggedRowId(null);
              setDropTargetRowId(null);
            }}
          >
            <div className="absolute left-0.5 opacity-0 group-hover/handle:opacity-100 transition-opacity">
              <ICONS.GripVertical className="w-3.5 h-3.5 text-gray-400" />
            </div>
            {!isSelected && (
              <>
                <span className="text-gray-400 group-hover/handle:hidden ml-1">
                  {indexPos + 1}
                </span>
                <div className="hidden group-hover/handle:block ml-3.5">
                  <CheckboxUnchecked />
                </div>
              </>
            )}
            {isSelected && <CheckboxChecked />}
          </div>

          {/* Cells */}
          {columns.map((col, index) => {
            const isFocused =
              focusedCell?.rowId === row.id && focusedCell?.colId === col.id;
            const isInDragRange =
              dragRange?.rowIds.has(row.id) && dragRange?.colIds.has(col.id);
            const isInSelectionRange =
              selectionRange?.rowIds.has(row.id) &&
              selectionRange?.colIds.has(col.id);

            // Filter active collaborative cursors on this specific cell
            const cellCursors = cursors ? (Object.values(cursors) as UserCursor[]).filter(
              (c) => c.rowId === row.id && c.columnId === col.id
            ) : [];

            let zIndexClass = "";
            if (cellCursors.length > 0) {
              zIndexClass = "z-[35]";
            } else if (isFocused) {
              zIndexClass = "z-20";
            } else if (isInDragRange) {
              zIndexClass = "z-10";
            }

            return (
              <div
                key={col.id}
                className={`border-r border-gray-100 flex items-center relative shrink-0 ${zIndexClass} ${isInDragRange ? "bg-primary-50/30 ring-1 ring-inset ring-primary-400" : ""} ${isInSelectionRange && !isInDragRange ? "bg-primary-50/40" : ""}`}
                style={{ width: col.width || 150 }}
                data-row-id={row.id}
                data-col-id={col.id}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  if (
                    activeEditingCell &&
                    (activeEditingCell.rowId !== row.id ||
                      activeEditingCell.colId !== col.id)
                  ) {
                    saveEditing();
                  }
                  focusedCellAtMouseDown.current = focusedCell;
                  if (e.shiftKey) {
                    setSelectionEnd({ rowId: row.id, colId: col.id });
                    setIsSelecting(true);
                  } else {
                    setSelectionStart({ rowId: row.id, colId: col.id });
                    setSelectionEnd({ rowId: row.id, colId: col.id });
                    setIsSelecting(true);
                    setFocusedCell({ rowId: row.id, colId: col.id });
                  }
                }}
                onMouseEnter={() => {
                  if (isSelecting) {
                    setSelectionEnd({ rowId: row.id, colId: col.id });
                  }
                  if (isDragFilling) {
                    handleDragFillMove(row.id, col.id);
                  }
                }}
                onClick={(e) => {
                  setLastSelectedRowId(row.id);
                }}
              >
                {renderCell(row, col, level, parentLines)}

                {/* Collaborative Peer Cursor Highlight & Label Overlays */}
                {cellCursors.map((c, idx) => {
                  const showAtBottom = indexPos === 0;
                  return (
                    <div
                      key={c.socketId}
                      className="absolute inset-0 pointer-events-none border-2 z-30"
                      style={{ borderColor: c.userColor }}
                    >
                      <span
                        className="absolute left-0 text-[10px] px-1.5 py-0.5 rounded-sm text-white font-medium shadow-sm flex items-center gap-1 shrink-0 z-40 select-none pointer-events-none whitespace-nowrap"
                        style={{ 
                          backgroundColor: c.userColor,
                          ...(showAtBottom ? {
                            bottom: `-${16 + idx * 14}px`
                          } : {
                            top: `-${16 + idx * 14}px`
                          })
                        }}
                      >
                        {c.userName}
                        {c.isEditing ? (
                          <span className="inline-flex items-center gap-1 ml-1 scale-90">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            <span className="text-[9px] opacity-90">编辑中</span>
                          </span>
                        ) : (
                          <span className="text-[9px] opacity-85">查看</span>
                        )}
                      </span>
                    </div>
                  );
                })}

                {/* Drag Handle */}
                {isFocused && !activeEditingCell && (
                  <div
                    className="absolute bottom-[-4px] right-[-4px] w-2 h-2 bg-primary-600 border border-white rounded-sm cursor-crosshair z-30 hover:scale-125 transition-transform"
                    onMouseDown={(e) => handleDragFillStart(e, row.id, col.id)}
                  />
                )}
              </div>
            );
          })}

          {/* Add Column Button Placeholder at end of row */}
          <div className="flex-1 min-w-[50px] border-r border-transparent" />

          {/* Row Height Resizer */}
          <div
            className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary-400 z-10 opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => {
              e.stopPropagation();
              setResizingRow({
                id: row.id,
                startY: e.clientY,
                startHeight: rowHeightVal,
              });
            }}
          />
        </div>
        {isExpanded &&
          row.children &&
          row.children.map((child, idx) =>
            renderRowRecursive(child, level + 1, idx, [
              ...parentLines,
              idx < row.children.length - 1,
            ]),
          )}
      </React.Fragment>
    );
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    updateHiddenInputPosition();
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 300) {
      if (visibleRowCount < rows.length) {
        setVisibleRowCount((prev) => Math.min(prev + 50, rows.length));
      } else if (hasMore && !loadingRef.current && onLoadMore) {
        loadingRef.current = true;
        onLoadMore();
      }
    }
  };

  return (
    <div
      className="flex flex-col h-full relative select-none"
      onMouseLeave={() => {
        handleCellMouseLeave();
        if (isDragFilling) handleDragFillEnd();
      }}
      onMouseUp={() => isDragFilling && handleDragFillEnd()}
    >
      <textarea
        ref={hiddenInputRef}
        className="fixed opacity-0 p-0 m-0 border-0 outline-none pointer-events-none text-sm px-2"
        style={{ zIndex: -1, resize: "none", background: "transparent" }}
        onCompositionStart={() => {
          updateHiddenInputPosition();
          isComposingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false;
          if (focusedCell && !activeEditingCell) {
            const col = columns.find((c) => c.id === focusedCell.colId);
            if (
              col &&
              [FieldType.TEXT, FieldType.NUMBER, FieldType.HYPERLINK].includes(
                col.type,
              )
            ) {
              startEditing(
                focusedCell.rowId,
                focusedCell.colId,
                e.currentTarget.value,
              );
              e.currentTarget.value = "";
            }
          }
        }}
        onInput={(e) => {
          if (isComposingRef.current) return;
          if (focusedCell && !activeEditingCell) {
            const col = columns.find((c) => c.id === focusedCell.colId);
            if (
              col &&
              [FieldType.TEXT, FieldType.NUMBER, FieldType.HYPERLINK].includes(
                col.type,
              )
            ) {
              startEditing(
                focusedCell.rowId,
                focusedCell.colId,
                e.currentTarget.value,
              );
              e.currentTarget.value = "";
            }
          }
        }}
        onBlur={() => {
          if (hiddenInputRef.current) hiddenInputRef.current.value = "";
        }}
      />
      {/* Body */}
      <div className="flex-1 overflow-auto bg-white" onScroll={handleScroll}>
        <div className="w-max min-w-full">
          {/* Header */}
          <div className="flex border-b border-gray-200 bg-[#f8fafc] font-medium text-xs text-gray-500 sticky top-0">
            <div
              className="w-10 shrink-0 border-r border-gray-200 flex items-center justify-center bg-[#f8fafc] cursor-pointer"
              onClick={handleSelectAll}
            >
              {(() => {
                const selectableIds = getSelectableRowIds(rows);
                const isAllSelected =
                  selectableIds.length > 0 &&
                  selectedRowIds.size === selectableIds.length;
                const isSomeSelected =
                  selectedRowIds.size > 0 && !isAllSelected;
                if (isAllSelected) return <CheckboxChecked />;
                if (isSomeSelected)
                  return (
                    <div className="w-3 h-3 bg-primary-500 rounded flex items-center justify-center">
                      <div className="w-2 h-0.5 bg-white rounded-sm" />
                    </div>
                  );
                return <CheckboxUnchecked />;
              })()}
            </div>
            {columns.map((col, index) => {
              const isLocked = col.id === allColumns[0]?.id;
              return (
                <div
                  key={col.id}
                  draggable={!isLocked}
                  onDragStart={(e) => handleColDragStart(e, index)}
                  onDragOver={(e) => handleColDragOver(e, index)}
                  onDrop={handleColDrop}
                  onDragEnd={handleColDragEnd}
                  className={`border-r border-gray-200 px-2 py-2 flex items-center gap-1.5 hover:bg-gray-100 cursor-pointer relative group shrink-0 transition-colors ${
                    draggedColIndex === index ? "opacity-40 bg-gray-100" : ""
                  } ${
                    dropTargetColIndex === index && draggedColIndex !== index
                      ? draggedColIndex !== null && draggedColIndex < index
                        ? "bg-primary-50 border-r-2 border-r-primary-500"
                        : "bg-primary-50 border-l-2 border-l-primary-500"
                      : ""
                  }`}
                  style={{ width: col.width || 150 }}
                  onClick={(e) => {
                    if (!isDragging) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      onEditColumn(col, {
                        top: rect.bottom + 4,
                        left: rect.left,
                      });
                    }
                  }}
                >
                  <span className="text-gray-400">
                    {FIELD_TYPE_ICONS[col.type]}
                  </span>
                  <span className="truncate">{col.name}</span>
                  {isLocked && <ICONS.Lock className="w-3 h-3 text-gray-400" />}
                  {/* Resizer */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-400 z-10"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setResizingCol({
                        id: col.id,
                        startX: e.clientX,
                        startWidth: col.width || 150,
                      });
                    }}
                  />
                </div>
              );
            })}
            <div
              className="px-3 py-2 border-r border-gray-200 hover:bg-gray-100 cursor-pointer text-gray-400 flex items-center justify-center min-w-[40px] shrink-0"
              onClick={onAddColumn}
            >
              <ICONS.Plus />
            </div>
            <div className="flex-1 bg-gray-50" />
          </div>

          {rows
            .slice(0, visibleRowCount)
            .map((row, idx) => renderRowRecursive(row, 0, idx, []))}
          {visibleRowCount < rows.length && (
            <div className="h-10 flex items-center justify-center text-gray-400 text-xs gap-2">
              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              加载更多...
            </div>
          )}
          {visibleRowCount >= rows.length && hasMore && (
            <div className="h-10 flex items-center justify-center text-gray-400 text-xs gap-2">
              {isLoadingMore ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  加载更多数据...
                </>
              ) : (
                "向下滚动加载更多..."
              )}
            </div>
          )}
          {!readonly && (
            <div
              className="h-10 border-b border-gray-100 flex items-center text-gray-400 hover:bg-gray-50 cursor-pointer pl-10 text-xs gap-2"
              onClick={() => (onDirectAddRow ? onDirectAddRow({}) : onAddRow())}
            >
              <ICONS.Plus /> 添加新记录
            </div>
          )}
        </div>
      </div>

      {contextMenu &&
        (() => {
          const isMultiCellSelection =
            selectionRange &&
            selectionRange.rowIds.has(contextMenu.rowId) &&
            (contextMenu.colId
              ? selectionRange.colIds.has(contextMenu.colId)
              : true) &&
            (selectionRange.rowIds.size > 1 || selectionRange.colIds.size > 1);

          return (
            <div
              className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-[100] w-64 text-sm"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              {!isMultiCellSelection && (
                <>
                  <div
                    className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700"
                    onClick={() => {
                      const row = findRowInTree(rows, contextMenu.rowId);
                      if (row) {
                        onOpenDetail(row);
                      }
                      setContextMenu(null);
                    }}
                  >
                    <ICONS.Eye className="w-3.5 h-3.5" />
                    查看详情
                  </div>

                  <div className="border-t border-gray-100 my-1"></div>

                  {contextMenu.colId && (
                    <>
                      <div
                        className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700"
                        onClick={() => {
                          const row = findRowInTree(rows, contextMenu.rowId);
                          if (row && contextMenu.colId) {
                            const val = row.data[contextMenu.colId];
                            setCopiedCellData(val);
                            if (
                              typeof val === "string" ||
                              typeof val === "number"
                            ) {
                              navigator.clipboard
                                .writeText(String(val))
                                .catch(() => {});
                            }
                          }
                          setContextMenu(null);
                        }}
                      >
                        <ICONS.Copy className="w-3.5 h-3.5" />
                        复制单元格
                      </div>
                      {!readonly && (
                        <>
                          <div
                            className={`px-4 py-2 flex items-center gap-2 ${copiedCellData !== null ? "hover:bg-gray-50 cursor-pointer text-gray-700" : "text-gray-300 cursor-not-allowed"}`}
                            onClick={() => {
                              if (copiedCellData !== null && contextMenu.colId) {
                                onCellChangeInternal(
                                  contextMenu.rowId,
                                  contextMenu.colId,
                                  copiedCellData,
                                );
                                setContextMenu(null);
                              }
                            }}
                          >
                            <ICONS.Paste className="w-3.5 h-3.5" />
                            粘贴单元格
                          </div>
                          <div className="border-t border-gray-100 my-1"></div>
                        </>
                      )}
                    </>
                  )}

                  {!readonly && (
                    <>
                      <div
                        className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700"
                        onClick={() => {
                          if (onDuplicateRows) {
                            let targetIds = new Set<string>();
                            if (
                              selectionRange &&
                              selectionRange.rowIds.has(contextMenu.rowId)
                            ) {
                              selectionRange.rowIds.forEach((id) => targetIds.add(id));
                            } else if (selectedRowIds.has(contextMenu.rowId)) {
                              targetIds = selectedRowIds;
                            } else {
                              targetIds.add(contextMenu.rowId);
                            }
                            
                            if (targetIds.size > 1) {
                              onDuplicateRows(Array.from(targetIds));
                            } else {
                              onDuplicateRow(contextMenu.rowId);
                            }
                          } else {
                            onDuplicateRow(contextMenu.rowId);
                          }
                          setContextMenu(null);
                        }}
                      >
                        <ICONS.Copy className="w-3.5 h-3.5" />
                        复制记录{" "}
                        {(() => {
                          let targetIds = new Set<string>();
                          if (
                            selectionRange &&
                            selectionRange.rowIds.has(contextMenu.rowId)
                          ) {
                            selectionRange.rowIds.forEach((id) => targetIds.add(id));
                          } else if (selectedRowIds.has(contextMenu.rowId)) {
                            targetIds = selectedRowIds;
                          } else {
                            targetIds.add(contextMenu.rowId);
                          }
                          return targetIds.size > 1 ? `(${targetIds.size})` : "";
                        })()}
                      </div>

                      <div className="px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                        <div
                          className="flex items-center gap-2 cursor-pointer"
                          onClick={() => {
                            onInsertRow(
                              contextMenu.rowId,
                              "before",
                              undefined,
                              Number(insertAboveCount) || 1,
                            );
                            setContextMenu(null);
                          }}
                        >
                          <ICONS.ArrowUp className="w-3.5 h-3.5" />
                          <span>向上插入</span>
                        </div>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          className="w-12 border border-gray-200 rounded px-1 text-center text-xs h-6 outline-none focus:border-primary-500"
                          value={insertAboveCount}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "") setInsertAboveCount("");
                            else {
                              const num = parseInt(val);
                              if (!isNaN(num))
                                setInsertAboveCount(Math.max(1, num));
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span>行</span>
                      </div>
                      <div className="px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                        <div
                          className="flex items-center gap-2 cursor-pointer"
                          onClick={() => {
                            onInsertRow(
                              contextMenu.rowId,
                              "after",
                              undefined,
                              Number(insertBelowCount) || 1,
                            );
                            setContextMenu(null);
                          }}
                        >
                          <ICONS.ArrowDown className="w-3.5 h-3.5" />
                          <span>向下插入</span>
                        </div>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          className="w-12 border border-gray-200 rounded px-1 text-center text-xs h-6 outline-none focus:border-primary-500"
                          value={insertBelowCount}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "") setInsertBelowCount("");
                            else {
                              const num = parseInt(val);
                              if (!isNaN(num))
                                setInsertBelowCount(Math.max(1, num));
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span>行</span>
                      </div>

                      {columns.length > 0 &&
                        columns[0].id === contextMenu.colId && (
                          <div
                            className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700"
                            onClick={() => {
                              handleAddSubRowInternal(contextMenu.rowId);
                              setContextMenu(null);
                            }}
                          >
                            <ICONS.Branch className="w-3.5 h-3.5" />
                            添加子记录
                          </div>
                        )}

                      <div className="border-t border-gray-100 my-1"></div>
                    </>
                  )}

                  <div
                    className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700"
                    onClick={() => {
                      if (columns.length > 0) {
                        onOpenComment(
                          contextMenu.rowId,
                          contextMenu.colId || columns[0].id,
                        );
                      }
                      setContextMenu(null);
                    }}
                  >
                    <ICONS.Message className="w-3.5 h-3.5" />
                    添加评论
                  </div>

                  <div className="border-t border-gray-100 my-1"></div>
                </>
              )}

              {!readonly && (
                <div
                  className="px-4 py-2 hover:bg-red-50 cursor-pointer flex items-center gap-2 text-red-600"
                  onClick={() => {
                    let targetIds = new Set<string>();
                    if (
                      selectionRange &&
                      selectionRange.rowIds.has(contextMenu.rowId)
                    ) {
                      selectionRange.rowIds.forEach((id) => targetIds.add(id));
                    } else if (selectedRowIds.has(contextMenu.rowId)) {
                      targetIds = selectedRowIds;
                    } else {
                      targetIds.add(contextMenu.rowId);
                    }
                    onDeleteRows(Array.from(targetIds));
                    setContextMenu(null);
                  }}
                >
                  <ICONS.Trash className="w-3.5 h-3.5" />
                  删除记录{" "}
                  {(() => {
                    let targetIds = new Set<string>();
                    if (
                      selectionRange &&
                      selectionRange.rowIds.has(contextMenu.rowId)
                    ) {
                      selectionRange.rowIds.forEach((id) => targetIds.add(id));
                    } else if (selectedRowIds.has(contextMenu.rowId)) {
                      targetIds = selectedRowIds;
                    } else {
                      targetIds.add(contextMenu.rowId);
                    }
                    const count = getAffectedRowCount(targetIds);
                    return count > 1 ? `(${count})` : "";
                  })()}
                </div>
              )}
            </div>
          );
        })()}

      {/* Footer Status Bar */}
      <div className="flex items-center px-4 border-t border-gray-200 bg-white text-[11px] text-gray-500 shrink-0 select-text z-40 relative mt-auto h-8 shadow-sm">
        共{" "}
        <span className="mx-1 font-semibold text-gray-700">
          {totalCount !== undefined ? totalCount : rows.length}
        </span>{" "}
        条记录
      </div>

      {/* File Preview Modal */}
      <FilePreviewModal
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        fileBlob={previewFile?.blob || null}
        filename={previewFile?.filename || ""}
      />

      {/* Loading Overlay for Preview */}
      {isPreviewLoading && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-white/50">
          <div className="flex flex-col items-center gap-3 bg-white p-6 rounded-xl shadow-xl">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium text-gray-700">
              正在获取文件内容...
            </span>
          </div>
        </div>
      )}

      {/* Hover Popover */}
      {hoveredCell &&
        hoveredCell.content &&
        !activeEditingCell &&
        (() => {
          let popoverTop = hoveredCell.rect.bottom + 4;
          let popoverLeft = hoveredCell.rect.left;

          if (popoverTop + 100 > window.innerHeight) {
            popoverTop = Math.max(0, hoveredCell.rect.top - 4 - 40);
          }

          return createPortal(
            <div
              className="fixed z-[200] max-w-[400px] max-h-[300px] overflow-y-auto bg-black text-white text-xs px-3 py-2 rounded shadow-xl pointer-events-none break-words leading-relaxed whitespace-pre-wrap"
              style={{ top: popoverTop, left: popoverLeft }}
            >
              {hoveredCell.content}
            </div>,
            document.body,
          );
        })()}

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
    </div>
  );
};

export default GridView;
