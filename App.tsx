"use client";
import { useCollaboration } from "./useCollaboration";
import { useTableSync } from "./useTableSync";
import { socketManager } from "./services/socket";
// ... existing imports ...
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { motion, useDragControls } from "framer-motion";
import { createPortal } from "react-dom";
import Sidebar from "./components/Sidebar";
import GridView from "./components/GridView";
import KanbanView from "./components/KanbanView";
import CalendarView from "./components/CalendarView";
import GalleryView from "./components/GalleryView";
import GanttView from "./components/GanttView";
import DashboardView from "./components/DashboardView";
import {
  Table,
  ViewType,
  FieldType,
  Column,
  Row,
  ViewMetadata,
  FilterCondition,
  SortCondition,
  GroupCondition,
  ColorRule,
  RowHeight,
  Comment,
} from "./types";
import { ICONS } from "./constants";
import { api } from "./services/api";
import { debounce } from "lodash-es";
// ... other imports ...
import FieldConfigDialog from "./components/FieldConfigDialog";
import ViewConfigDialog from "./components/ViewConfigDialog";
import TemplateDialog from "./components/TemplateDialog";
import PublishTemplateDialog from "./components/PublishTemplateDialog";
import ImportDialog from "./components/ImportDialog";
import AppendDataDialog from "./components/AppendDataDialog";
import CommentDialog from "./components/CommentDialog";
import TokenConfigDialog from "./components/TokenConfigDialog";
import { TableMetadataDialog } from "./components/TableMetadataDialog";
import ConfirmDialog from "./components/ConfirmDialog";
import OnboardingTour, { TourStep } from "./components/OnboardingTour";
import { evaluateFormula } from "./formulaUtils";
import CollaboratorDialog from "./components/CollaboratorDialog";
import {
  FilterMenu,
  SortMenu,
  GroupMenu,
  SimpleGroupMenu,
  ColorMenu,
  RowHeightMenu,
  CalendarAppearanceMenu,
  CalendarSettingMenu,
  GanttSettingMenu,
  GallerySettingMenu,
  FieldMenu,
} from "./components/ViewMenus";

import RowDetailPanel from "./components/RowDetailPanel";
import FormViewBuilder from "./components/FormViewBuilder";
import { PublicCollectionForm } from "./components/PublicCollectionForm";
import { Toaster, toast } from "sonner";
import { ClickOutsideWrapper } from "./components/ClickOutsideWrapper";
import { Settings, BookOpen } from "lucide-react";

// Helper to flatten tree if needed or find in tree
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

const flattenRows = (rows: Row[]): Row[] => {
  let result: Row[] = [];
  for (const row of rows) {
    result.push(row);
    if (row.children && row.children.length > 0) {
      result = result.concat(flattenRows(row.children));
    }
  }
  return result;
};

const buildRowTree = (flatRows: Row[]): Row[] => {
  const rowMap = new Map<string, Row>();
  const rootRows: Row[] = [];
  const uniqueRows: Row[] = [];
  const seenIds = new Set<string>();

  flatRows.forEach((row) => {
    if (!seenIds.has(row.id)) {
      seenIds.add(row.id);
      uniqueRows.push(row);
    }
  });

  // First pass: create map and initialize children array
  uniqueRows.forEach((row) => {
    rowMap.set(row.id, { ...row, children: [] });
  });

  // Second pass: link children to parents
  uniqueRows.forEach((row) => {
    const rowWithChildren = rowMap.get(row.id)!;
    if (row.parent_id && rowMap.has(row.parent_id)) {
      const parent = rowMap.get(row.parent_id)!;
      parent.children = parent.children || [];
      parent.children.push(rowWithChildren);
    } else {
      rootRows.push(rowWithChildren);
    }
  });

  // We do NOT sort by index here because the API already returns the rows
  // in the correct sorted order based on the view's sort configuration.
  // Sorting by index would override the view's sort order.

  return rootRows;
};

const flattenTree = (nodes: Row[]): Row[] => {
  let flat: Row[] = [];
  nodes.forEach((node) => {
    const { children, ...rest } = node;
    if (!rest.isGroup) {
      flat.push(rest as Row);
    }
    if (children && children.length > 0) {
      flat = flat.concat(flattenTree(children));
    }
  });
  return flat;
};

export interface AppProps {
  hideSidebar?: boolean;
  hideHeader?: boolean;
  fullScreen?: boolean;
  defaultTableId?: string | null;
  readonly?: boolean;
}

const App: React.FC<AppProps> = ({
  hideSidebar = false,
  hideHeader = true,
  fullScreen = true,
  defaultTableId = null,
  readonly = false,
}) => {
  // --- Data State ---
  const isSharedMode = typeof window !== 'undefined' && window.location.hostname.includes('ais-pre');
  const [tables, setTables] = useState<Table[]>([]);
  // ... existing state ...
  const initialSearchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const searchId = initialSearchParams.get('search_id');
  const [activeTableId, setActiveTableId] = useState<string | null>(searchId || defaultTableId);
  const activeTableIdRef = useRef(activeTableId);
  useEffect(() => {
    activeTableIdRef.current = activeTableId;
  }, [activeTableId]);

  useEffect(() => {
    const handleUrlChange = () => {
      const currentParams = new URLSearchParams(window.location.search);
      const currentSearchId = currentParams.get('search_id');
      if (currentSearchId && currentSearchId !== activeTableIdRef.current) {
        setActiveTableId(currentSearchId);
      }
    };
    window.addEventListener('popstate', handleUrlChange);
    // Also listen to pushState/replaceState if they are overridden by a parent app
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleUrlChange();
    };
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleUrlChange();
    };

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  // Full details for the active table
  const [activeTable, setActiveTable] = useState<Table | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [totalRowsCount, setTotalRowsCount] = useState<number | undefined>(
    undefined,
  );
  const [page, setPage] = useState(1);
  const pageRef = useRef(1);

  const isTableReadonly = readonly || isSharedMode || (activeTable ? (activeTable.can_edit === false && activeTable.can_manage === false) : false);

  const [hasMore, setHasMore] = useState(false);
  const dragControls = useDragControls();
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(!hideSidebar);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const deltaX = e.clientX - startX.current;
      const newWidth = startWidth.current + deltaX;
      if (newWidth > 160 && newWidth < 600) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };

    if (isSidebarOpen) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isSidebarOpen]);

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      startX.current = e.clientX;
      startWidth.current = sidebarWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [sidebarWidth],
  );

  // --- UI State ---
  const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null); // If null, adding new
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [selectedTemplateTypeId, setSelectedTemplateTypeId] = useState<
    string | undefined
  >(undefined);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isAppendDialogOpen, setIsAppendDialogOpen] = useState(false);
  const [fieldConfigAnchor, setFieldConfigAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [commentDialogState, setCommentDialogState] = useState<{
    isOpen: boolean;
    rowId: string;
    colId: string;
  } | null>(null);
  const [currentComments, setCurrentComments] = useState<any[]>([]); // New state for comments
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [isCollaboratorDialogOpen, setIsCollaboratorDialogOpen] =
    useState(false);
  const [isTableMetadataDialogOpen, setIsTableMetadataDialogOpen] = useState(false);
  const [tableMetadataMode, setTableMetadataMode] = useState<'add' | 'edit'>('add');
  const [editingTableForMetadata, setEditingTableForMetadata] = useState<Table | null>(null);



  const [isOnlineUsersOpen, setIsOnlineUsersOpen] = useState(false);
  const [activeOnlineSid, setActiveOnlineSid] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isSuperTenant, setIsSuperTenant] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [activeDetailRowId, setActiveDetailRowId] = useState<string | null>(
    null,
  );
  const [isCreatingNewRow, setIsCreatingNewRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, any>>({});
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [departments, setDepartments] = useState<
    { id: string; name: string }[]
  >([]);
  const [rowSearchKeyword, setRowSearchKeyword] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [userProfile, setUserProfile] = useState<any>(null);

  // Fetch profile to check super admin status
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.getProfile();
        if (res) {
          const profileData = res.data || res;
          setUserProfile(profileData);
          // @ts-ignore
          setIsSuperAdmin(profileData.is_super_admin);
          // @ts-ignore
          setIsSuperTenant(profileData.is_super_tenant);
        }
      } catch (err) {
        console.error("Failed to fetch profile", err);
      }
    };
    fetchProfile();
  }, []);

  // Webhook-driven synchronization & presence logic
  const { isConnected, activeUsers, cursors, broadcastCursorPosition, socket } =
    useCollaboration(activeTableId);

  // Fallback representation of self to make sure "I am a person" in the room
  const currentUserAsRoomUser = useMemo(() => {
    if (!userProfile) return null;
    return {
      account_id: userProfile.id || "current-user-id",
      tenant_id: "",
      sid: "local-self",
      name: userProfile.name || "我",
      email: userProfile.email || "",
      phone: "",
      real_name: userProfile.name || "我",
      avatar: userProfile.avatar || userProfile.avatar_url || "",
      avatar_url: userProfile.avatar_url || userProfile.avatar || "",
    };
  }, [userProfile]);

  const displayedUsers = useMemo(() => {
    if (!isConnected) return [];
    const list = [...activeUsers];
    if (currentUserAsRoomUser) {
      const alreadyExists = list.some(
        (u) =>
          u.account_id === currentUserAsRoomUser.account_id ||
          u.name === currentUserAsRoomUser.name,
      );
      if (!alreadyExists) {
        list.push(currentUserAsRoomUser);
      }
    }
    return list;
  }, [isConnected, activeUsers, currentUserAsRoomUser]);

  const handleCursorPositionChange = useCallback(
    (rowId: string | null, colId: string | null, isEditing: boolean) => {
      const myName = userProfile?.name || userProfile?.real_name || "Guest";
      broadcastCursorPosition(rowId, colId, isEditing, myName);
    },
    [broadcastCursorPosition, userProfile],
  );

  const handleRowsSyncUpdated = useCallback((syncedRows: Row[]) => {
    const activeView = activeTable?.views?.find((v) => v.id === activeViewId);
    const useServerGrouping =
      activeView?.config?.groups &&
      activeView.config.groups.length > 0 &&
      activeView.type !== ViewType.KANBAN;

    if (useServerGrouping) {
      setRows((prevRows) => {
        const syncedMap = new Map();
        syncedRows.forEach(r => syncedMap.set(r.id, r));
        
        const updateTree = (nodes: Row[]): Row[] => {
          return nodes.map(node => {
            let updatedNode = { ...node };
            if (!node.isGroup && syncedMap.has(node.id)) {
              updatedNode.data = { ...node.data, ...syncedMap.get(node.id).data };
            }
            if (node.children) {
              updatedNode.children = updateTree(node.children);
            }
            return updatedNode;
          });
        };
        return updateTree(prevRows);
      });
    } else {
      setRows(buildRowTree(syncedRows));
    }
  }, [activeTable, activeViewId]);

  const {
    updateCell: syncUpdateCell,
    updateCellLocal: syncUpdateCellLocal,
    createRow: syncCreateRow,
    insertRowAbove: syncInsertRowAbove,
    insertRowBelow: syncInsertRowBelow,
    duplicateRow: syncDuplicateRow,
    batchDuplicateRows: syncBatchDuplicateRows,
    batchCreateRows: syncBatchCreateRows,
    deleteRow: syncDeleteRow,
    batchDeleteRows: syncBatchDeleteRows,
    moveRow: syncMoveRow,
  } = useTableSync({
    socket,
    tableId: activeTableId,
    initialRows: flattenTree(rows),
    onRowsUpdated: handleRowsSyncUpdated,
  });

  // Listen to 401 events from Socket connection to reveal config dialog
  useEffect(() => {
    const handleOpenToken = () => setIsTokenDialogOpen(true);
    window.addEventListener("open-token-config", handleOpenToken);
    return () =>
      window.removeEventListener("open-token-config", handleOpenToken);
  }, []);

  // Reference to commentDialogState to access latest cell rowId/colId without re-binding socket listeners
  const commentDialogStateRef = useRef(commentDialogState);
  useEffect(() => {
    commentDialogStateRef.current = commentDialogState;
  }, [commentDialogState]);

  // Synchronise cell Comment actions from Socket.IO in real-time
  useEffect(() => {
    if (!socket || !activeTableId) return;

    const handleRemoteCommentCreated = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;
      
      if (tableId && activeTableId && tableId !== activeTableId) return;

      const rowId = String(payloadData.row_id || event.row_id || "");
      const colId = String(payloadData.column_id || event.column_id || "");
      
      if (!rowId || !colId) return;

      const countKey = `${rowId}_${colId}`;

      // Update total comment counts map
      setCommentCounts((prev) => {
        const prevCount = prev[countKey] || 0;
        let newCount = prevCount + 1;
        if (event.total !== undefined && event.total !== null) {
          newCount = Number(event.total);
        } else if (payloadData.total !== undefined && payloadData.total !== null) {
          newCount = Number(payloadData.total);
        }
        
        return {
          ...prev,
          [countKey]: isNaN(newCount) ? prevCount + 1 : newCount,
        };
      });

      // Check if the current comment dialog is open and matching this cell
      const currentDialog = commentDialogStateRef.current;
      if (
        currentDialog?.isOpen &&
        currentDialog.rowId === rowId &&
        currentDialog.colId === colId
      ) {
        const item = event.data || event;
        const newComment = {
          id: item.comment_id || item.id || Date.now().toString(),
          text: item.content || item.text || "",
          author: item.account_name || "Guest",
          createdAt: item.created_at
            ? new Date(item.created_at).getTime()
            : Date.now(),
          rowId: rowId,
          colId: colId,
        };

        setCurrentComments((prev) => {
          if (prev.some((c) => c.id === newComment.id)) return prev;
          return [...prev, newComment];
        });
      }
    };

    const handleRemoteCommentDeleted = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;
      
      if (tableId && activeTableId && tableId !== activeTableId) return;

      const rowId = String(payloadData.row_id || event.row_id || "");
      const colId = String(payloadData.column_id || event.column_id || "");
      const targetCommentId = payloadData.comment_id || payloadData.id || event.comment_id;
      
      if (!rowId || !colId) return;

      const countKey = `${rowId}_${colId}`;

      // Update total comment counts map
      setCommentCounts((prev) => {
        const prevCount = prev[countKey] || 0;
        let newCount = prevCount - 1;
        if (event.total !== undefined && event.total !== null) {
          newCount = Number(event.total);
        } else if (payloadData.total !== undefined && payloadData.total !== null) {
          newCount = Number(payloadData.total);
        }
        
        return {
          ...prev,
          [countKey]: Math.max(0, isNaN(newCount) ? prevCount - 1 : newCount),
        };
      });

      // Check if the current comment dialog is open and matching this cell
      const currentDialog = commentDialogStateRef.current;
      if (
        currentDialog?.isOpen &&
        currentDialog.rowId === rowId &&
        currentDialog.colId === colId
      ) {
        setCurrentComments((prev) =>
          prev.filter((c) => c.id !== targetCommentId),
        );
      }
    };

    socket.on("comment:created:broadcast", handleRemoteCommentCreated);
    socket.on("comment:deleted:broadcast", handleRemoteCommentDeleted);

    return () => {
      socket.off("comment:created:broadcast", handleRemoteCommentCreated);
      socket.off("comment:deleted:broadcast", handleRemoteCommentDeleted);
    };
  }, [socket, activeTableId]);

  // View Context Menu State (moved from Sidebar)
  const [viewContextMenu, setViewContextMenu] = useState<{
    x: number;
    y: number;
    viewId: string;
  } | null>(null);
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editingViewName, setEditingViewName] = useState("");
  const [draggedViewId, setDraggedViewId] = useState<string | null>(null);
  const [dragOverViewId, setDragOverViewId] = useState<string | null>(null);
  const viewInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingViewId && viewInputRef.current) {
      viewInputRef.current.focus();
      viewInputRef.current.select();
    }
  }, [editingViewId]);

  const getViewIcon = (type: ViewType) => {
    switch (type) {
      case ViewType.GRID:
        return <ICONS.Grid />;
      case ViewType.KANBAN:
        return <ICONS.Kanban />;
      case ViewType.CALENDAR:
        return <ICONS.Calendar />;
      case ViewType.DASHBOARD:
        return <ICONS.Dashboard />;
      case ViewType.GALLERY:
        return <ICONS.Gallery />;
      case ViewType.GANTT:
        return <ICONS.Gantt />;
      default:
        return <ICONS.Grid />;
    }
  };

  const handleViewContextMenu = (e: React.MouseEvent, viewId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setViewContextMenu({ x: e.clientX, y: e.clientY, viewId });
  };

  const handleViewRenameStart = (viewId: string, currentName: string) => {
    setEditingViewId(viewId);
    setEditingViewName(currentName);
    setViewContextMenu(null);
  };

  const handleViewRenameSubmit = () => {
    if (editingViewId && editingViewName.trim()) {
      handleRenameView(editingViewId, editingViewName.trim());
    }
    setEditingViewId(null);
  };

  const handleViewKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleViewRenameSubmit();
    if (e.key === "Escape") setEditingViewId(null);
  };

  const handleRowSearch = useMemo(
    () =>
      debounce((val: string) => {
        setRowSearchKeyword(val);
      }, 300),
    [],
  );

  // Fetch departments on mount
  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const res = await api.getDepts();
        if (res.data) {
          setDepartments(
            res.data.map((d: any) => ({ id: d.dept_id, name: d.dept_name })),
          );
        }
      } catch (e) {
        console.error("Failed to fetch departments", e);
      }
    };
    fetchDepts();
  }, []);

  // Derived
  const activeView = activeTable?.views?.find((v) => v.id === activeViewId);

  const fetchUndoRedoStatus = useCallback(async () => {
    if (!activeTableId) return;
    if (socket && isConnected) {
      socket.emit("operation:get_status", { table_id: activeTableId });
    } else {
      try {
        const res = await api.getUndoRedoStatus(activeTableId);
        if (res.data) {
          setCanUndo(res.data.can_undo);
          setCanRedo(res.data.can_redo);
        }
      } catch (err) {
        console.error("Failed to fetch undo/redo status", err);
      }
    }
  }, [activeTableId, socket, isConnected]);

  // --- Auth & Initial Load ---
  useEffect(() => {
    const handleUnauthorized = () => setIsTokenDialogOpen(true);
    window.addEventListener("api:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("api:unauthorized", handleUnauthorized);
  }, []);

  // --- Initial Data Fetch ---
  const fetchTables = useCallback(async (keyword?: string) => {
    try {
      const res = await api.getTables({ keyword });
      // Handle different possible response structures
      const tableList = (res.data?.list ||
        res.data ||
        (Array.isArray(res) ? res : [])) as Table[];

      // Ensure all view configurations are objects
      tableList.forEach((table: any) => {
        if (table.views) {
          table.views.forEach((v: any) => {
            if (typeof v.config === "string" && v.config.trim() !== "") {
              try {
                v.config = JSON.parse(v.config);
              } catch (e) {
                try {
                  v.config = (new Function(`return ${v.config}`))();
                } catch (ee) {
                  v.config = {};
                }
              }
            } else if (!v.config) {
              v.config = {};
            }
          });
        }
      });

      setTables(tableList);

      if (tableList.length > 0 && !activeTableIdRef.current) {
        setActiveTableId(tableList[0].id);
      }
      return tableList;
    } catch (err) {
      console.error("Failed to fetch tables", err);
      return [];
    }
  }, []);

  const handleSearch = useMemo(
    () =>
      debounce((keyword: string) => {
        fetchTables(keyword);
      }, 300),
    [fetchTables],
  );

  useEffect(() => {
    fetchTables().finally(() => setIsInitializing(false));
  }, [fetchTables]);

  useEffect(() => {
    if (!isInitializing) {
      const hasSeen = localStorage.getItem("has_seen_onboarding_tour");
      if (!hasSeen) {
        setIsTourOpen(true);
      }
    }
  }, [isInitializing]);

  // ... fetchTableDetail ...
  const fetchTableDetail = useCallback(async (id: string) => {
    setLoading(true);
    setRows([]);

    try {
      const res = await api.getTableDetail(id);
      const detailedTable = res.data;

      // Auto-fix backend type for Department and hydrate frontend type
      if (detailedTable.columns) {
        for (const col of detailedTable.columns) {
          if (col.type === FieldType.DEPARTMENT) {
            // Found a broken column (legacy), fix it by converting to TEXT
            // We do this silently in the background
            try {
              await api.updateColumn(id, col.id, {
                type: FieldType.TEXT,
                config: { ...col.config, originalType: FieldType.DEPARTMENT },
              });
              // Update local state to reflect the fix
              col.type = FieldType.DEPARTMENT;
              col.config = {
                ...col.config,
                originalType: FieldType.DEPARTMENT,
              };
            } catch (e) {
              console.error("Failed to auto-fix Department column", e);
            }
          } else if (col.config?.originalType === FieldType.DEPARTMENT) {
            // Hydrate frontend type from config
            col.type = FieldType.DEPARTMENT;
          }
        }
        // Ensure columns are sorted by their sort index
        detailedTable.columns.sort((a, b) => (a.sort || 0) - (b.sort || 0));
      }

      if (detailedTable.views) {
        detailedTable.views.forEach((v: any) => {
          if (typeof v.config === "string" && v.config.trim() !== "") {
            try {
              v.config = JSON.parse(v.config);
            } catch (e) {
              try {
                v.config = (new Function(`return ${v.config}`))();
              } catch (ee) {
                v.config = {};
              }
            }
          } else if (!v.config) {
            v.config = {};
          }
        });
      }

      setActiveTable(detailedTable);
      setTables((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...detailedTable } : t)),
      );

      if (detailedTable.views && detailedTable.views.length > 0) {
        setActiveViewId((prev) => {
          const viewExists = detailedTable.views.find((v) => v.id === prev);
          if (viewExists) return prev;
          const defaultView = detailedTable.views.find((v) => v.is_default);
          return defaultView ? defaultView.id : detailedTable.views[0].id;
        });
      } else {
        setActiveViewId(null);
      }
    } catch (err) {
      console.error("Failed to fetch table details", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTableId) {
      fetchTableDetail(activeTableId);
    } else {
      setActiveTable(null);
      setRows([]);
    }
  }, [activeTableId, fetchTableDetail]);

  const handleOpenAddTableWithMetadata = () => {
    setTableMetadataMode('add');
    setEditingTableForMetadata(null);
    setIsTableMetadataDialogOpen(true);
  };

  const handleOpenEditTableWithMetadata = (tableId: string) => {
    const tableToEdit = tables.find((t) => t.id === tableId);
    if (tableToEdit) {
      setTableMetadataMode('edit');
      setEditingTableForMetadata(tableToEdit);
      setIsTableMetadataDialogOpen(true);
    }
  };

  const handleTableMetadataSuccess = async (targetTableId: string) => {
    await fetchTables();
    if (activeTableId === targetTableId) {
      await fetchTableDetail(targetTableId);
    } else {
      setActiveTableId(targetTableId);
    }
  };

  // Handle synchronized real-time view creation, renaming, deletion, and copying broadcasts
  useEffect(() => {
    if (!socket || !activeTableId) return;

    const handleRemoteViewCreated = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;
      
      if (tableId && activeTableId && tableId === activeTableId) {
        fetchTableDetail(activeTableId);
        toast.info(`在线用户创建了新视图: ${payloadData.name || "新视图"}`);
      }
    };

    const handleRemoteViewRenamed = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;

      if (tableId && activeTableId && tableId === activeTableId) {
        fetchTableDetail(activeTableId);
        toast.info(`在线用户重命名了视图: ${payloadData.name || "新名称"}`);
      }
    };

    const handleRemoteViewDeleted = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;

      if (tableId && activeTableId && tableId === activeTableId) {
        fetchTableDetail(activeTableId);
        toast.info("在线用户删除了一个视图");
      }
    };

    const handleRemoteViewCopied = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;

      if (tableId && activeTableId && tableId === activeTableId) {
        fetchTableDetail(activeTableId);
        toast.info(`在线用户复制了视图: ${payloadData.name || "复制视图"}`);
      }
    };

    const handleRemoteViewMoved = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;

      if (tableId && activeTableId && tableId === activeTableId) {
        fetchTableDetail(activeTableId);
        toast.info("在线用户排布了视图");
      }
    };

    const handleRemoteViewUpdated = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;

      if (tableId && activeTableId && tableId === activeTableId) {
        fetchTableDetail(activeTableId);
        toast.info(`在线用户更新了视图: ${payloadData.name || "配置已更新"}`);
      }
    };

    const handleRemoteColumnCreated = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;

      if (tableId && activeTableId && tableId === activeTableId) {
        fetchTableDetail(activeTableId);
        toast.info(`在线用户创建了新字段: ${payloadData.name || "新字段"}`);
      }
    };

    const handleRemoteColumnUpdated = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;

      if (tableId && activeTableId && tableId === activeTableId) {
        fetchTableDetail(activeTableId);
        toast.info(`在线用户更新了字段: ${payloadData.name || "字段已更新"}`);
      }
    };

    const handleRemoteColumnDeleted = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;

      if (tableId && activeTableId && tableId === activeTableId) {
        fetchTableDetail(activeTableId);
        toast.info("在线用户删除了一个字段");
      }
    };

    const handleRemoteColumnBatchDeleted = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;

      if (tableId && activeTableId && tableId === activeTableId) {
        fetchTableDetail(activeTableId);
        const count = payloadData.column_ids?.length || 0;
        toast.info(`在线用户批量删除了 ${count} 个字段`);
      }
    };

    const handleRemoteColumnSortUpdated = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;

      if (tableId && activeTableId && tableId === activeTableId) {
        fetchTableDetail(activeTableId);
        toast.info("在线用户调整了字段顺序");
      }
    };

    const handleRemoteColumnTypeConverted = (event: any) => {
      if (!event) return;
      if (event.success === false) return;
      const payloadData = event.data || {};
      const tableId = payloadData.table_id || event.table_id;

      if (tableId && activeTableId && tableId === activeTableId) {
        fetchTableDetail(activeTableId);
        toast.info(`在线用户转换了字段类型为: ${payloadData.new_type || "新类型"}`);
      }
    };

    socket.on("view:created:broadcast", handleRemoteViewCreated);
    socket.on("view:renamed:broadcast", handleRemoteViewRenamed);
    socket.on("view:deleted:broadcast", handleRemoteViewDeleted);
    socket.on("view:copied:broadcast", handleRemoteViewCopied);
    socket.on("view:moved:broadcast", handleRemoteViewMoved);
    socket.on("view:updated:broadcast", handleRemoteViewUpdated);
    socket.on("column:created:broadcast", handleRemoteColumnCreated);
    socket.on("column:updated:broadcast", handleRemoteColumnUpdated);
    socket.on("column:deleted:broadcast", handleRemoteColumnDeleted);
    socket.on("column:batch_deleted:broadcast", handleRemoteColumnBatchDeleted);
    socket.on("column:sort_updated:broadcast", handleRemoteColumnSortUpdated);
    socket.on("column:type_converted:broadcast", handleRemoteColumnTypeConverted);

    return () => {
      socket.off("view:created:broadcast", handleRemoteViewCreated);
      socket.off("view:renamed:broadcast", handleRemoteViewRenamed);
      socket.off("view:deleted:broadcast", handleRemoteViewDeleted);
      socket.off("view:copied:broadcast", handleRemoteViewCopied);
      socket.off("view:moved:broadcast", handleRemoteViewMoved);
      socket.off("view:updated:broadcast", handleRemoteViewUpdated);
      socket.off("column:created:broadcast", handleRemoteColumnCreated);
      socket.off("column:updated:broadcast", handleRemoteColumnUpdated);
      socket.off("column:deleted:broadcast", handleRemoteColumnDeleted);
      socket.off("column:batch_deleted:broadcast", handleRemoteColumnBatchDeleted);
      socket.off("column:sort_updated:broadcast", handleRemoteColumnSortUpdated);
      socket.off("column:type_converted:broadcast", handleRemoteColumnTypeConverted);
    };
  }, [socket, activeTableId, fetchTableDetail]);

  const [commentCounts, setCommentCounts] = useState<Record<string, number>>(
    {},
  );

  const fetchAllComments = useCallback(async () => {
    if (!activeTableId) return;
    try {
      // Fetch comment counts for the table
      const res = await api.getCommentCounts(activeTableId);
      const countsData = res.data;

      const newCounts: Record<string, number> = {};
      countsData.forEach((item) => {
        if (item.row_id && item.column_id) {
          newCounts[`${item.row_id}_${item.column_id}`] = item.total;
        }
      });
      setCommentCounts(newCounts);
    } catch (err) {
      // Suppress error if the endpoint is not implemented or fails
      console.warn("Failed to fetch comment counts, continuing without them.");
    }
  }, [activeTableId]);

  const getValidFilters = (filters?: FilterCondition[], columns?: Column[]) => {
    if (!filters) return [];
    return filters
      .filter((f) => {
        if (!f.column_id || !f.operator) return false;
        const unary = [
          "is_empty",
          "is_not_empty",
          "is_checked",
          "is_not_checked",
        ];
        if (unary.includes(f.operator)) return true;
        if (Array.isArray(f.value)) return f.value.length > 0;

        if (columns) {
          const col = columns.find((c) => c.id === f.column_id);
          if (col && col.type === FieldType.CHECKBOX) {
            return f.value !== undefined && f.value !== null; // allow false, '', etc.
          }
        }
        return f.value !== undefined && f.value !== "" && f.value !== null;
      })
      .map((f) => {
        if (!columns) return f;
        const col = columns.find((c) => c.id === f.column_id);

        if (col && col.type === FieldType.CHECKBOX) {
          let op = f.operator;
          let isChecked = f.value === true || f.value === "true";
          let v = isChecked ? "true" : "";
          return { ...f, operator: op, value: v };
        }

        if (col && col.type === FieldType.USER) {
          let newValue = f.value;
          if (Array.isArray(f.value)) {
            newValue = f.value.map((v) =>
              typeof v === "object" && v !== null ? v.id || v : v,
            );
          } else if (typeof f.value === "object" && f.value !== null) {
            newValue = f.value.id || f.value;
          }
          return { ...f, value: newValue };
        }
        return f;
      });
  };

  // --- Fetch Rows (Applying View Config) ---
  const fetchRows = useCallback(
    async (pageNumber = 1, reloadAll = false) => {
      if (
        !activeTableId ||
        !activeView ||
        !activeTable ||
        activeTable.id !== activeTableId
      )
        return;
      try {
        if (pageNumber === 1) {
          setLoading(true);
        } else {
          setIsLoadingMore(true);
        }

        const pageSize = activeView.type === ViewType.KANBAN ? 1000 : 50;
        const fetchPage = reloadAll ? 1 : pageNumber;
        const fetchPageSize = reloadAll ? pageRef.current * pageSize : pageSize;

        const useServerGrouping =
          activeView.config?.groups &&
          activeView.config.groups.length > 0 &&
          activeView.type !== ViewType.KANBAN;

        // Identify Department and User columns for parsing
        const deptCols = activeTable.columns.filter(
          (c) => c.type === FieldType.DEPARTMENT,
        );
        const userCols = activeTable.columns.filter(
          (c) => c.type === FieldType.USER,
        );

        if (useServerGrouping) {
          // Use group API
          const res = await api.groupRows(activeTableId, {
            groups: activeView.config?.groups || [],
            filters: getValidFilters(
              activeView.config?.filters,
              activeTable.columns,
            ),
            sorts: activeView.config?.sorts || [],
            search: rowSearchKeyword,
          });

          if (res.data) {
            // Transform grouped data into tree structure for GridView
            const groupRows: Row[] = res.data.map(
              (group: any, index: number) => {
                // Parse Department and User fields in grouped rows
                if (
                  group.rows &&
                  (deptCols.length > 0 || userCols.length > 0)
                ) {
                  group.rows.forEach((row: any) => {
                    deptCols.forEach((col) => {
                      if (typeof row[col.id] === "string") {
                        try {
                          let jsonStr = row[col.id];
                          // Simple heuristic to fix Python dict string representation if needed
                          if (jsonStr.includes("'")) {
                            jsonStr = jsonStr.replace(/'/g, '"');
                          }
                          const parsed = JSON.parse(jsonStr);
                          // Hydrate IDs to objects
                          if (Array.isArray(parsed)) {
                            row[col.id] = parsed.map((id: any) => {
                              if (typeof id === "object") return id;
                              const dept = departments.find((d) => d.id === id);
                              return dept || { id, name: "Unknown" };
                            });
                          } else if (typeof parsed === "object") {
                            row[col.id] = parsed;
                          } else {
                            const dept = departments.find(
                              (d) => d.id === parsed,
                            );
                            row[col.id] = dept || {
                              id: parsed,
                              name: "Unknown",
                            };
                          }
                        } catch (e) {
                          /* ignore */
                        }
                      }
                    });
                    userCols.forEach((col) => {
                      if (typeof row[col.id] === "string") {
                        try {
                          let jsonStr = row[col.id];
                          if (
                            jsonStr.startsWith("[") ||
                            jsonStr.startsWith("{")
                          ) {
                            if (jsonStr.includes("'")) {
                              jsonStr = jsonStr.replace(/'/g, '"');
                            }
                            row[col.id] = JSON.parse(jsonStr);
                          }
                        } catch (e) {
                          /* ignore */
                        }
                      }
                    });
                  });
                }

                const groupKeyValues = Array.isArray(group.key)
                  ? group.key
                  : group.key?.value || [];
                const groupId = `group_${index}_${groupKeyValues.join("_")}`;
                return {
                  id: groupId,
                  isGroup: true,
                  groupKey: group.key,
                  data: { count: group.count },
                  children: buildRowTree(group.rows || []),
                };
              },
            );
            setRows(groupRows);
            setHasMore(false);
            setTotalRowsCount(
              res.data.reduce(
                (acc: number, cur: any) => acc + (cur.count || 0),
                0,
              ),
            );
            fetchAllComments();
          }
        } else {
          // Normal fetch
          const res = await api.getRows(activeTableId, {
            page: fetchPage,
            page_size: fetchPageSize,
            filters: getValidFilters(
              activeView.config?.filters,
              activeTable.columns,
            ),
            sorts: activeView.config?.sorts || [],
            search: rowSearchKeyword,
          });
          if (res.data?.list) {
            // Parse Department and User fields
            if (deptCols.length > 0 || userCols.length > 0) {
              res.data.list.forEach((row: any) => {
                deptCols.forEach((col) => {
                  if (typeof row[col.id] === "string") {
                    try {
                      let jsonStr = row[col.id];
                      if (jsonStr.includes("'")) {
                        jsonStr = jsonStr.replace(/'/g, '"');
                      }
                      const parsed = JSON.parse(jsonStr);
                      // Hydrate IDs to objects
                      if (Array.isArray(parsed)) {
                        row[col.id] = parsed.map((id: any) => {
                          if (typeof id === "object") return id;
                          const dept = departments.find((d) => d.id === id);
                          return dept || { id, name: "Unknown" };
                        });
                      } else if (typeof parsed === "object") {
                        row[col.id] = parsed;
                      } else {
                        const dept = departments.find((d) => d.id === parsed);
                        row[col.id] = dept || { id: parsed, name: "Unknown" };
                      }
                    } catch (e) {
                      /* ignore */
                    }
                  }
                });
                userCols.forEach((col) => {
                  if (typeof row[col.id] === "string") {
                    try {
                      let jsonStr = row[col.id];
                      if (jsonStr.startsWith("[") || jsonStr.startsWith("{")) {
                        if (jsonStr.includes("'")) {
                          jsonStr = jsonStr.replace(/'/g, '"');
                        }
                        row[col.id] = JSON.parse(jsonStr);
                      }
                    } catch (e) {
                      /* ignore */
                    }
                  }
                });
              });
            }

            if (pageNumber === 1 || reloadAll) {
              const tree = buildRowTree(res.data.list);
              setRows(tree);
            } else {
              setRows((prev) => {
                const flatPrev = flattenTree(prev);
                const combined = [...flatPrev, ...res.data.list];
                return buildRowTree(combined);
              });
            }

            if (!reloadAll) {
              setPage(pageNumber);
              pageRef.current = pageNumber;
            }

            if (res.data.total !== undefined) {
              setHasMore(pageRef.current * pageSize < res.data.total);
              setTotalRowsCount(res.data.total);
            } else {
              setHasMore(res.data.list.length === fetchPageSize);
              setTotalRowsCount(undefined);
            }

            // Fetch comments after rows are loaded
            fetchAllComments();
          }
        }
      } catch (err) {
        console.error("Failed to fetch rows", err);
      } finally {
        setLoading(false);
        setIsLoadingMore(false);
      }
    },
    [
      activeTableId,
      activeView,
      activeTable,
      fetchAllComments,
      departments,
      rowSearchKeyword,
    ],
  );

  useEffect(() => {
    fetchRows();
    fetchUndoRedoStatus();
  }, [fetchRows, fetchUndoRedoStatus]);

  const handleUndo = useCallback(async () => {
    if (!activeTableId || !canUndo) return;
    if (socket && isConnected) {
      socket.emit("operation:undo", { table_id: activeTableId });
    } else {
      try {
        await api.undo(activeTableId);
        // Refresh data and status
        await fetchTableDetail(activeTableId);
        await fetchRows(1, true);
        await fetchUndoRedoStatus();
      } catch (err: any) {
        console.error("Undo failed", err);
        // Handle "No undoable actions" error gracefully
        if (
          err.message &&
          (err.message.includes("没有可撤回的操作") ||
            err.message.includes("No undoable actions"))
        ) {
          await fetchUndoRedoStatus(); // Sync status
        }
      }
    }
  }, [
    activeTableId,
    canUndo,
    socket,
    isConnected,
    fetchTableDetail,
    fetchRows,
    fetchUndoRedoStatus,
  ]);

  const handleRedo = useCallback(async () => {
    if (!activeTableId || !canRedo) return;
    if (socket && isConnected) {
      socket.emit("operation:redo", { table_id: activeTableId });
    } else {
      try {
        await api.redo(activeTableId);
        // Refresh data and status
        await fetchTableDetail(activeTableId);
        await fetchRows(1, true);
        await fetchUndoRedoStatus();
      } catch (err: any) {
        console.error("Redo failed", err);
        // Handle "No redoable actions" error gracefully
        if (
          err.message &&
          (err.message.includes("没有可恢复的操作") ||
            err.message.includes("No redoable actions"))
        ) {
          await fetchUndoRedoStatus(); // Sync status
        }
      }
    }
  }, [
    activeTableId,
    canRedo,
    socket,
    isConnected,
    fetchTableDetail,
    fetchRows,
    fetchUndoRedoStatus,
  ]);

  const fetchRowsRef = useRef(fetchRows);
  const fetchTableDetailRef = useRef(fetchTableDetail);
  const syncUpdateCellLocalRef = useRef(syncUpdateCellLocal);

  useEffect(() => {
    fetchRowsRef.current = fetchRows;
    fetchTableDetailRef.current = fetchTableDetail;
    syncUpdateCellLocalRef.current = syncUpdateCellLocal;
  }, [fetchRows, fetchTableDetail, syncUpdateCellLocal]);

  // Listen for WebSocket undo, redo, and status update events
  useEffect(() => {
    if (!socket || !activeTableId) return;

    const handleStatusAck = (response: any) => {
      console.log("[Socket] Received operation:get_status:ack:", response);
      if (response && response.success && response.data) {
        setCanUndo(!!response.data.can_undo);
        setCanRedo(!!response.data.can_redo);
      }
    };

    const applyPayloadUpdate = (data: any) => {
      if (!data) return;
      if (Array.isArray(data)) {
        data.forEach(item => applyPayloadUpdate(item));
        return;
      }
      const cellData = data.data || data;
      if (cellData && cellData.row_id && cellData.column_id) {
        syncUpdateCellLocalRef.current?.(cellData.row_id, cellData.column_id, cellData.value);
      }
    };

    const handleUndoAck = (response: any) => {
      console.log("[Socket] Received operation:undo:ack:", response);
      const currentTableId = activeTableIdRef.current;
      if (response && response.success !== false && currentTableId) {
        applyPayloadUpdate(response.data);
        // Safe timeout to ensure DB changes are fully settled and flushed
        setTimeout(() => {
          fetchTableDetailRef.current(currentTableId);
          fetchRowsRef.current(1, true);
        }, 50);
        if (response.status) {
          setCanUndo(!!response.status.can_undo);
          setCanRedo(!!response.status.can_redo);
        } else if (response.data) {
          setCanUndo(!!response.data.can_undo);
          setCanRedo(!!response.data.can_redo);
        } else {
          socket.emit("operation:get_status", { table_id: currentTableId });
        }
      }
    };

    const handleRedoAck = (response: any) => {
      console.log("[Socket] Received operation:redo:ack:", response);
      const currentTableId = activeTableIdRef.current;
      if (response && response.success !== false && currentTableId) {
        applyPayloadUpdate(response.data);
        // Safe timeout to ensure DB changes are fully settled and flushed
        setTimeout(() => {
          fetchTableDetailRef.current(currentTableId);
          fetchRowsRef.current(1, true);
        }, 50);
        if (response.status) {
          setCanUndo(!!response.status.can_undo);
          setCanRedo(!!response.status.can_redo);
        } else if (response.data) {
          setCanUndo(!!response.data.can_undo);
          setCanRedo(!!response.data.can_redo);
        } else {
          socket.emit("operation:get_status", { table_id: currentTableId });
        }
      }
    };

    const handleUndoneBroadcast = (response: any) => {
      console.log("[Socket] Received operation:undone:broadcast:", response);
      const currentTableId = activeTableIdRef.current;
      if (currentTableId) {
        applyPayloadUpdate(response.data);
        setTimeout(() => {
          fetchTableDetailRef.current(currentTableId);
          fetchRowsRef.current(1, true);
        }, 50);
        socket.emit("operation:get_status", { table_id: currentTableId });
      }
    };

    const handleRedoneBroadcast = (response: any) => {
      console.log("[Socket] Received operation:redone:broadcast:", response);
      const currentTableId = activeTableIdRef.current;
      if (currentTableId) {
        applyPayloadUpdate(response.data);
        setTimeout(() => {
          fetchTableDetailRef.current(currentTableId);
          fetchRowsRef.current(1, true);
        }, 50);
        socket.emit("operation:get_status", { table_id: currentTableId });
      }
    };

    const handleStatusUpdatedBroadcast = (response: any) => {
      console.log("[Socket] Received operation:status_updated:broadcast:", response);
      const currentTableId = activeTableIdRef.current;
      if (currentTableId) {
        socket.emit("operation:get_status", { table_id: currentTableId });
      }
    };

    const handleCellUpdateAck = (response: any) => {
      console.log("[Socket] Received cell:update:ack in App:", response);
      const currentTableId = activeTableIdRef.current;
      if (response && response.success !== false) {
        applyPayloadUpdate(response.data);
      }
      if (response && response.status) {
        setCanUndo(!!response.status.can_undo);
        setCanRedo(!!response.status.can_redo);
      } else if (currentTableId) {
        socket.emit("operation:get_status", { table_id: currentTableId });
      }
    };

    const handleRowOperationAck = (response: any) => {
      console.log("[Socket] Received row operation ack in App:", response);
      const currentTableId = activeTableIdRef.current;
      
      if (response && response.success !== false && currentTableId) {
        setTimeout(() => {
          fetchRowsRef.current(1, true);
        }, 50);
      }
      
      if (response && response.status) {
        setCanUndo(!!response.status.can_undo);
        setCanRedo(!!response.status.can_redo);
      } else if (currentTableId) {
        socket.emit("operation:get_status", { table_id: currentTableId });
      }
    };

    const handleTableDetailOperationAck = (response: any) => {
      console.log("[Socket] Received table detail operation ack in App:", response);
      const currentTableId = activeTableIdRef.current;
      
      if (response && response.success !== false && currentTableId) {
        setTimeout(() => {
          fetchTableDetailRef.current(currentTableId).then(() => {
            fetchRowsRef.current(1, true);
          });
        }, 50);
      }
      
      if (response && response.status) {
        setCanUndo(!!response.status.can_undo);
        setCanRedo(!!response.status.can_redo);
      } else if (currentTableId) {
        socket.emit("operation:get_status", { table_id: currentTableId });
      }
    };


    socket.on("operation:get_status:ack", handleStatusAck);
    socket.on("operation:undo:ack", handleUndoAck);
    socket.on("operation:redo:ack", handleRedoAck);
    socket.on("operation:undone:broadcast", handleUndoneBroadcast);
    socket.on("operation:redone:broadcast", handleRedoneBroadcast);
    socket.on("operation:status_updated:broadcast", handleStatusUpdatedBroadcast);
    socket.on("cell:update:ack", handleCellUpdateAck);
    socket.on("row:create:ack", handleRowOperationAck);
    socket.on("row:insert_above:ack", handleRowOperationAck);
    socket.on("row:insert_below:ack", handleRowOperationAck);
    socket.on("row:copy:ack", handleRowOperationAck);
    socket.on("row:batch_copy:ack", handleRowOperationAck);
    socket.on("row:batch_create:ack", handleRowOperationAck);
    socket.on("row:delete:ack", handleRowOperationAck);
    socket.on("row:batch_delete:ack", handleRowOperationAck);
    socket.on("row:move:ack", handleRowOperationAck);
    socket.on("column:create:ack", handleTableDetailOperationAck);
    socket.on("column:update:ack", handleTableDetailOperationAck);
    socket.on("column:delete:ack", handleTableDetailOperationAck);
    socket.on("column:batch_delete:ack", handleTableDetailOperationAck);
    socket.on("column:update_sort:ack", handleTableDetailOperationAck);
    socket.on("column:convert_type:ack", handleTableDetailOperationAck);
    socket.on("view:create:ack", handleTableDetailOperationAck);
    socket.on("view:update:ack", handleTableDetailOperationAck);
    socket.on("view:rename:ack", handleTableDetailOperationAck);
    socket.on("view:copy:ack", handleTableDetailOperationAck);
    socket.on("view:delete:ack", handleTableDetailOperationAck);
    socket.on("view:move:ack", handleTableDetailOperationAck);
    socket.on("comment:create:ack", handleTableDetailOperationAck);
    socket.on("comment:delete:ack", handleTableDetailOperationAck);

    // If connected, request status immediately
    if (isConnected) {
      socket.emit("operation:get_status", { table_id: activeTableId });
    }

    return () => {
      socket.off("operation:get_status:ack", handleStatusAck);
      socket.off("operation:undo:ack", handleUndoAck);
      socket.off("operation:redo:ack", handleRedoAck);
      socket.off("operation:undone:broadcast", handleUndoneBroadcast);
      socket.off("operation:redone:broadcast", handleRedoneBroadcast);
      socket.off("operation:status_updated:broadcast", handleStatusUpdatedBroadcast);
      socket.off("cell:update:ack", handleCellUpdateAck);
      socket.off("row:create:ack", handleRowOperationAck);
      socket.off("row:insert_above:ack", handleRowOperationAck);
      socket.off("row:insert_below:ack", handleRowOperationAck);
      socket.off("row:copy:ack", handleRowOperationAck);
      socket.off("row:batch_copy:ack", handleRowOperationAck);
      socket.off("row:batch_create:ack", handleRowOperationAck);
      socket.off("row:delete:ack", handleRowOperationAck);
      socket.off("row:batch_delete:ack", handleRowOperationAck);
      socket.off("row:move:ack", handleRowOperationAck);
      socket.off("column:create:ack", handleTableDetailOperationAck);
      socket.off("column:update:ack", handleTableDetailOperationAck);
      socket.off("column:delete:ack", handleTableDetailOperationAck);
      socket.off("column:batch_delete:ack", handleTableDetailOperationAck);
      socket.off("column:update_sort:ack", handleTableDetailOperationAck);
      socket.off("column:convert_type:ack", handleTableDetailOperationAck);
      socket.off("view:create:ack", handleTableDetailOperationAck);
      socket.off("view:update:ack", handleTableDetailOperationAck);
      socket.off("view:rename:ack", handleTableDetailOperationAck);
      socket.off("view:copy:ack", handleTableDetailOperationAck);
      socket.off("view:delete:ack", handleTableDetailOperationAck);
      socket.off("view:move:ack", handleTableDetailOperationAck);
      socket.off("comment:create:ack", handleTableDetailOperationAck);
      socket.off("comment:delete:ack", handleTableDetailOperationAck);
    };
  }, [socket, activeTableId, isConnected]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTokenDialogOpen && (e.ctrlKey || e.metaKey)) {
        if (e.key.toLowerCase() === "z") {
          // Check if editing text
          const activeEl = document.activeElement;
          const isInput =
            activeEl &&
            (activeEl.tagName === "INPUT" ||
              activeEl.tagName === "TEXTAREA" ||
              (activeEl as HTMLElement).isContentEditable);
          if (isInput) return;

          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (e.key.toLowerCase() === "y") {
          const activeEl = document.activeElement;
          const isInput =
            activeEl &&
            (activeEl.tagName === "INPUT" ||
              activeEl.tagName === "TEXTAREA" ||
              (activeEl as HTMLElement).isContentEditable);
          if (isInput) return;

          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo, isTokenDialogOpen]);

  // ... Tour Steps ...
  const tourSteps: TourStep[] = [
    {
      target: "#tour-sidebar-workspaces",
      title: "1. 工作区与项目",
      content:
        "欢迎使用！左侧是您的工作台。您可以在这里创建新的数据表，或者在不同的项目之间进行切换。",
    },
    {
      target: "#tour-sidebar-views",
      title: "2. 多维视图",
      content:
        "同一个数据表可以有多种展现形式。您可以根据需要，将数据切换为表格、看板、日历或甘特图等视图，方便从不同角度管理数据。",
    },
    {
      target: "#tour-toolbar",
      title: "3. 视图工具栏",
      content:
        "在上方工具栏中，您可以对当前视图的数据进行筛选、排序和分组，还可以配置显示的字段。这些设置会自动保存在当前视图中。",
    },
    {
      target: "#tour-main-content",
      title: "4. 数据编辑区",
      content:
        "这里是核心的数据操作区。您可以像使用 Excel 一样，直接点击单元格进行编辑，或者拖拽调整行和列的顺序。",
    },
  ];

  // ... Handlers (Table, View, Column, Row) ...
  const handleAddTable = async () => {
    try {
      const newTablePayload = {
        name: "新数据表",
        columns: [
          { name: "名称", type: FieldType.TEXT, width: 200 },
          {
            name: "状态",
            type: FieldType.SELECT,
            config: { options: ["未开始", "进行中", "已完成"] },
          },
        ],
        views: [{ name: "表格视图", type: ViewType.GRID }],
      };
      const oldTableIds = new Set(tables.map((t) => t.id));
      const res = await api.createTable(newTablePayload);
      const newTableList = await fetchTables();

      const newTableId = res.data?.id || (res as any).id;
      if (newTableId) {
        setActiveTableId(newTableId);
      } else {
        const newlyCreatedTable = newTableList.find(
          (t: any) => !oldTableIds.has(t.id),
        );
        if (newlyCreatedTable) {
          setActiveTableId(newlyCreatedTable.id);
        } else if (newTableList.length > 0) {
          setActiveTableId(newTableList[0].id);
        }
      }
    } catch (err) {
      console.error("创建失败", err);
    }
  };

  const handleImportTable = async (data: any) => {
    setIsImportDialogOpen(false);

    const toastId = toast("解析中...", {
      icon: (
        <svg
          className="animate-spin h-4 w-4 text-yellow-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      ),
      duration: 999999,
      style: {
        backgroundColor: "#fdf6ec",
        color: "#e6a23c",
        borderColor: "#faecd8",
      },
    });

    try {
      const res = await api.importMultiDimensionalData(data);
      await fetchTables();
      if (res.data && res.data.id) {
        setActiveTableId(res.data.id);
      }
      toast.success("导入成功", { id: toastId, duration: 3000 });
    } catch (err: any) {
      console.error("导入失败", err);
      toast.error(err.message || "导入失败，请检查文件格式或重试。", {
        id: toastId,
        duration: 4000,
      });
    }
  };

  const handleAppendTableData = async (data: any) => {
    setIsAppendDialogOpen(false);

    const toastId = toast("追加导入中...", {
      icon: (
        <svg
          className="animate-spin h-4 w-4 text-yellow-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      ),
      duration: 999999,
      style: {
        backgroundColor: "#fdf6ec",
        color: "#e6a23c",
        borderColor: "#faecd8",
      },
    });

    try {
      await api.importMultiDimensionalData(data);
      await fetchTables();
      if (activeTableId) {
        await fetchTableDetail(activeTableId);
      }
      toast.success("追加导入成功", { id: toastId, duration: 3000 });
    } catch (err: any) {
      console.error("追加导入失败", err);
      toast.error(err.message || "追加导入失败，请检查字段匹配与格式或重试。", {
        id: toastId,
        duration: 4000,
      });
    }
  };

  // Interface 31: Use Template API
  const handleTemplateSelect = async (template: Table, typeId: string) => {
    try {
      setLoading(true);
      // Use the API to create the table from the template ID
      const res = await api.createTableFromTemplate(template.id, {
        name: template.name,
        type_id: typeId,
      });

      // The API might return the table directly, wrapped in a data property, or just the ID string
      const newTableId =
        res.data?.id ||
        (typeof res.data === "string" ? res.data : null) ||
        (res as any).id ||
        (typeof res === "string" ? res : null);

      if (newTableId) {
        toast.success(`模版 "${template.name}" 已成功创建为新表格`);
        setIsTemplateDialogOpen(false);
        setSelectedTemplateTypeId(undefined);
        await fetchTables();
        setActiveTableId(newTableId);
      } else {
        // If we can't find the ID but the request didn't throw, assume success and refresh anyway
        toast.success(`模版 "${template.name}" 已成功创建`);
        setIsTemplateDialogOpen(false);
        setSelectedTemplateTypeId(undefined);

        // Find the newly created table by comparing old and new table lists
        const oldTableIds = new Set(tables.map((t) => t.id));
        const newTableList = await fetchTables();
        const newlyCreatedTable = newTableList.find(
          (t: any) => !oldTableIds.has(t.id),
        );

        if (newlyCreatedTable) {
          setActiveTableId(newlyCreatedTable.id);
        } else if (newTableList.length > 0) {
          // Fallback to the first table if we can't determine the new one
          setActiveTableId(newTableList[0].id);
        }
      }
    } catch (err: any) {
      console.error("使用模版失败", err);
      if (err.message !== "Unauthorized") {
        toast.error(err.message || "创建失败，请确保您已配置有效的 Token。");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRenameTable = async (id: string, newName: string) => {
    try {
      await api.updateTable(id, { name: newName });
      fetchTables();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTable = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "删除项目",
      message: "确定要删除此数据表项目吗？此操作无法撤销。",
      onConfirm: async () => {
        try {
          await api.deleteTable(id);
          if (activeTableId === id) setActiveTableId(null);
          fetchTables();
        } catch (err: any) {
          console.error("删除失败", err);
          toast.error(err.message || "删除失败");
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleDuplicateTable = async (id: string) => {
    try {
      const res = await api.duplicateTable(id);
      await fetchTables();
      setActiveTableId(res.data.id);
    } catch (err: any) {
      console.error("复制失败", err);
      toast.error(err.message || "复制失败");
    }
  };

  // --- Handlers: View ---
  const handleViewDragStart = (e: React.DragEvent, viewId: string) => {
    setDraggedViewId(viewId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleViewDragOver = (e: React.DragEvent, viewId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedViewId !== viewId) {
      setDragOverViewId(viewId);
    }
  };

  const handleViewDragLeave = () => {
    setDragOverViewId(null);
  };

  const handleViewDrop = async (e: React.DragEvent, targetViewId: string) => {
    e.preventDefault();
    setDragOverViewId(null);
    if (!draggedViewId || draggedViewId === targetViewId || !activeTable)
      return;

    const views = [...(activeTable.views || [])];
    const draggedIndex = views.findIndex((v) => v.id === draggedViewId);
    const targetIndex = views.findIndex((v) => v.id === targetViewId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [draggedView] = views.splice(draggedIndex, 1);
    views.splice(targetIndex, 0, draggedView);

    // Optimistic update
    setActiveTable((prev) => (prev ? { ...prev, views } : null));
    setTables((prev) =>
      prev.map((t) => (t.id === activeTable.id ? { ...t, views } : t)),
    );

    try {
      if (socket && socket.connected) {
        socket.once("view:move:ack", async (response: any) => {
          if (response && response.success) {
            await fetchTableDetail(activeTable.id);
          } else {
            console.warn("Socket view:move failed, retrying via API...", response);
            try {
              await api.moveView(activeTable.id, draggedViewId, targetIndex);
              await fetchTableDetail(activeTable.id);
            } catch (apiErr) {
              fetchTableDetail(activeTable.id);
            }
          }
        });

        socket.emit("view:move", {
          table_id: activeTable.id,
          view_id: draggedViewId,
          target_sort: targetIndex,
        });
      } else {
        await api.moveView(activeTable.id, draggedViewId, targetIndex);
        await fetchTableDetail(activeTable.id);
      }
    } catch (err) {
      console.error("Failed to update view sort", err);
      // Revert on failure
      fetchTableDetail(activeTable.id);
    }
    setDraggedViewId(null);
  };

  const handleViewDragEnd = () => {
    setDraggedViewId(null);
    setDragOverViewId(null);
  };

  const handleAddView = () => setIsViewDialogOpen(true);

  const handleCreateView = async (viewData: Partial<ViewMetadata>) => {
    if (!activeTableId) return;
    try {
      const payload = {
        name: viewData.name || "新视图",
        type: viewData.type || ViewType.GRID,
        is_default: false,
        config: viewData.config || {},
      };

      if (socket && socket.connected) {
        // Use Socket.IO view:create to broadcast view creation in real-time
        socket.once("view:create:ack", async (response: any) => {
          if (response && response.success) {
            const returnedView = response.data || {};
            const newViewId = returnedView.view_id || returnedView.id;
            
            await fetchTableDetail(activeTableId);
            if (newViewId) {
              setActiveViewId(newViewId);
            }
            setIsViewDialogOpen(false);
            toast.success("创建视图成功");
          } else {
            console.warn("Socket view:create failed, retrying via API...", response);
            // Fallback immediately to API if socket ack mentions failure
            try {
              const res = await api.createView(activeTableId, payload);
              await fetchTableDetail(activeTableId);
              setActiveViewId(res.data.id);
              setIsViewDialogOpen(false);
              toast.success("创建视图成功");
            } catch (apiErr: any) {
              toast.error(apiErr.message || "创建视图失败");
            }
          }
        });

        socket.emit("view:create", {
          table_id: activeTableId,
          name: payload.name,
          type: payload.type,
        });
      } else {
        // Fallback to traditional REST API
        const res = await api.createView(activeTableId, payload);
        await fetchTableDetail(activeTableId);
        setActiveViewId(res.data.id);
        setIsViewDialogOpen(false);
        toast.success("创建视图成功");
      }
    } catch (err: any) {
      console.error("创建视图失败", err);
      toast.error(err.message || "创建视图失败");
    }
  };

  const handleRenameView = async (viewId: string, newName: string) => {
    if (!activeTableId) return;
    try {
      if (socket && socket.connected) {
        socket.once("view:rename:ack", async (response: any) => {
          if (response && response.success) {
            await fetchTableDetail(activeTableId);
            toast.success("重命名视图成功");
          } else {
            console.warn("Socket view:rename failed, retrying via API...", response);
            try {
              await api.renameView(activeTableId, viewId, newName);
              await fetchTableDetail(activeTableId);
              toast.success("重命名视图成功");
            } catch (apiErr: any) {
              toast.error(apiErr.message || "重命名视图失败");
            }
          }
        });

        socket.emit("view:rename", {
          table_id: activeTableId,
          view_id: viewId,
          name: newName,
        });
      } else {
        await api.renameView(activeTableId, viewId, newName);
        await fetchTableDetail(activeTableId);
        toast.success("重命名视图成功");
      }
    } catch (err: any) {
      console.error("重命名视图失败", err);
      toast.error(err.message || "重命名视图失败");
    }
  };

  const handleDeleteView = (viewId: string) => {
    if (!activeTable) return;
    if (activeTable.views && activeTable.views.length <= 1) {
      toast.error("至少保留一个视图");
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: "删除视图",
      message: "确定删除此视图吗？相关的视图配置将丢失。",
      onConfirm: async () => {
        try {
          if (socket && socket.connected) {
            socket.once("view:delete:ack", async (response: any) => {
              if (response && response.success) {
                await fetchTableDetail(activeTable.id);
                toast.success("删除视图成功");
              } else {
                console.warn("Socket view:delete failed, retrying via API...", response);
                try {
                  await api.deleteView(activeTable.id, viewId);
                  await fetchTableDetail(activeTable.id);
                  toast.success("删除视图成功");
                } catch (apiErr: any) {
                  toast.error(apiErr.message || "删除视图失败");
                }
              }
            });

            socket.emit("view:delete", {
              table_id: activeTable.id,
              view_id: viewId,
            });
          } else {
            await api.deleteView(activeTable.id, viewId);
            await fetchTableDetail(activeTable.id);
            toast.success("删除视图成功");
          }
        } catch (err: any) {
          console.error("删除视图失败", err);
          toast.error(err.message || "删除视图失败");
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleCopyView = async (viewId: string) => {
    if (!activeTableId) return;
    try {
      if (socket && socket.connected) {
        socket.once("view:copy:ack", async (response: any) => {
          if (response && response.success) {
            const returnedView = response.data || {};
            const newViewId = returnedView.view_id || returnedView.id;

            await fetchTableDetail(activeTableId);
            if (newViewId) {
              setActiveViewId(newViewId);
            }
            setOpenMenu(null);
            setViewContextMenu(null);
            toast.success("复制视图成功");
          } else {
            console.warn("Socket view:copy failed, retrying via API...", response);
            try {
              const res = await api.copyView(activeTableId, viewId);
              await fetchTableDetail(activeTableId);
              if (res.data?.id) {
                setActiveViewId(res.data.id);
              }
              setOpenMenu(null);
              setViewContextMenu(null);
              toast.success("复制视图成功");
            } catch (apiErr: any) {
              toast.error(apiErr.message || "复制视图失败");
            }
          }
        });

        socket.emit("view:copy", {
          table_id: activeTableId,
          view_id: viewId,
        });
      } else {
        const res = await api.copyView(activeTableId, viewId);
        await fetchTableDetail(activeTableId);
        if (res.data?.id) {
          setActiveViewId(res.data.id);
        }
        setOpenMenu(null);
        setViewContextMenu(null);
        toast.success("复制视图成功");
      }
    } catch (err: any) {
      console.error("复制视图失败", err);
      toast.error(err.message || "复制视图失败");
    }
  };

  const handleSaveAsNewView = async () => {
    if (!activeTableId || !activeView) return;
    await handleCopyView(activeView.id);
  };

  const updateViewWithSync = async (
    tableId: string,
    viewId: string,
    payload: { config?: any; is_default?: boolean }
  ) => {
    try {
      if (socket && socket.connected) {
        socket.once("view:update:ack", async (response: any) => {
          if (response && response.success) {
            await fetchTableDetail(tableId);
          } else {
            console.warn("Socket view:update failed, retrying via API...", response);
            try {
              await api.updateView(tableId, viewId, payload);
              await fetchTableDetail(tableId);
            } catch (apiErr: any) {
              console.error(apiErr);
            }
          }
        });

        socket.emit("view:update", {
          table_id: tableId,
          view_id: viewId,
          ...payload,
        });
      } else {
        await api.updateView(tableId, viewId, payload);
        await fetchTableDetail(tableId);
      }
    } catch (err: any) {
      console.error("Failed to update view with sync", err);
    }
  };

  const updateColumnWithSync = async (
    tableId: string,
    columnId: string,
    updatedCol: Column
  ) => {
    try {
      if (socket && socket.connected) {
        socket.once("column:update:ack", async (response: any) => {
          if (response && response.success) {
            // Broadcast column updated event to all other clients in the table room
            const targetRoom = socketManager.getJoinedRoom(tableId);
            socket.emit("column:updated:broadcast", {
              room: targetRoom,
              success: true,
              data: {
                ...(response.data || {}),
                table_id: tableId,
                column_id: columnId,
              },
              action: "update",
              total: response.total || response.data?.total || activeTable?.columns.length || 0
            });
            await fetchTableDetail(tableId);
          } else {
            console.warn("Socket column:update failed, retrying via API...", response);
            try {
              await api.updateColumn(tableId, columnId, updatedCol);
              await fetchTableDetail(tableId);
            } catch (apiErr: any) {
              console.error(apiErr);
            }
          }
        });

        socket.emit("column:update", {
          table_id: tableId,
          column_id: columnId,
          name: updatedCol.name,
          type: updatedCol.type,
          width: updatedCol.width || 150,
          sort: updatedCol.sort,
          config: updatedCol.config || {},
          search_reference: (updatedCol as any).search_reference || false
        });
      } else {
        await api.updateColumn(tableId, columnId, updatedCol);
        await fetchTableDetail(tableId);
      }
    } catch (err: any) {
      console.error("Failed to update column with sync", err);
      try {
        await api.updateColumn(tableId, columnId, updatedCol);
        await fetchTableDetail(tableId);
      } catch (innerErr) {
        console.error(innerErr);
      }
    }
  };

  const deleteColumnWithSync = async (
    tableId: string,
    columnId: string
  ) => {
    try {
      if (socket && socket.connected) {
        return new Promise<boolean>((resolve, reject) => {
          let timeoutId: any;

          const handleAck = async (response: any) => {
            if (timeoutId) clearTimeout(timeoutId);
            if (response && response.success) {
              // Broadcast column deleted event to all other clients in the table room
              const targetRoom = socketManager.getJoinedRoom(tableId);
              socket.emit("column:deleted:broadcast", {
                room: targetRoom,
                success: true,
                data: {
                  account_id: response.data?.account_id,
                  table_id: tableId,
                  column_id: columnId,
                },
                action: "delete",
                total: response.total !== undefined ? response.total : (response.data?.total || (activeTable?.columns.length ? activeTable.columns.length - 1 : 0))
              });
              await fetchTableDetail(tableId);
              resolve(true);
            } else {
              reject(new Error(response?.message || "通过 Socket 删除字段失败"));
            }
          };

          timeoutId = setTimeout(() => {
            socket.off("column:delete:ack", handleAck);
            reject(new Error("删除字段 Socket 响应超时"));
          }, 5000);

          socket.once("column:delete:ack", handleAck);

          socket.emit("column:delete", {
            table_id: tableId,
            column_id: columnId
          });
        });
      } else {
        await api.deleteColumn(tableId, columnId);
        await fetchTableDetail(tableId);
        return true;
      }
    } catch (err: any) {
      console.error("Failed to delete column with sync", err);
      try {
        await api.deleteColumn(tableId, columnId);
        await fetchTableDetail(tableId);
        return true;
      } catch (innerErr) {
        console.error(innerErr);
        return false;
      }
    }
  };

  const batchDeleteColumnsWithSync = async (
    tableId: string,
    columnIds: string[]
  ) => {
    try {
      if (socket && socket.connected) {
        return new Promise<boolean>((resolve, reject) => {
          let timeoutId: any;

          const handleAck = async (response: any) => {
            if (timeoutId) clearTimeout(timeoutId);
            if (response && response.success) {
              // Broadcast column batch deleted event to all other clients in the table room
              const targetRoom = socketManager.getJoinedRoom(tableId);
              socket.emit("column:batch_deleted:broadcast", {
                room: targetRoom,
                success: true,
                data: {
                  account_id: response.data?.account_id,
                  table_id: tableId,
                  column_ids: columnIds,
                },
                action: "batch_delete",
                total: response.total !== undefined ? response.total : (response.data?.total || (activeTable?.columns.length ? activeTable.columns.length - columnIds.length : 0))
              });
              await fetchTableDetail(tableId);
              resolve(true);
            } else {
              reject(new Error(response?.message || "通过 Socket 批量删除字段失败"));
            }
          };

          timeoutId = setTimeout(() => {
            socket.off("column:batch_delete:ack", handleAck);
            reject(new Error("批量删除字段 Socket 响应超时"));
          }, 5000);

          socket.once("column:batch_delete:ack", handleAck);

          socket.emit("column:batch_delete", {
            table_id: tableId,
            column_ids: columnIds
          });
        });
      } else {
        await api.batchDeleteColumns(tableId, columnIds);
        await fetchTableDetail(tableId);
        return true;
      }
    } catch (err: any) {
      console.error("Failed to batch delete columns with sync", err);
      try {
        await api.batchDeleteColumns(tableId, columnIds);
        await fetchTableDetail(tableId);
        return true;
      } catch (innerErr) {
        console.error(innerErr);
        return false;
      }
    }
  };

  const updateColumnSortWithSync = async (
    tableId: string,
    sortData: { id: string; sort: number }[]
  ) => {
    try {
      if (socket && socket.connected) {
        return new Promise<boolean>((resolve, reject) => {
          let timeoutId: any;

          const handleAck = async (response: any) => {
            if (timeoutId) clearTimeout(timeoutId);
            if (response && response.success) {
              // Broadcast column sort updated event to all other clients in the table room
              const targetRoom = socketManager.getJoinedRoom(tableId);
              socket.emit("column:sort_updated:broadcast", {
                room: targetRoom,
                success: true,
                data: {
                  account_id: response.data?.account_id,
                  table_id: tableId,
                  column_sort: response.data?.column_sort || sortData,
                },
                action: "update_sort",
                total: response.total !== undefined ? response.total : (response.data?.total || sortData.length)
              });
              await fetchTableDetail(tableId);
              resolve(true);
            } else {
              reject(new Error(response?.message || "通过 Socket 调换字段顺序失败"));
            }
          };

          timeoutId = setTimeout(() => {
            socket.off("column:update_sort:ack", handleAck);
            reject(new Error("调换字段顺序 Socket 响应超时"));
          }, 5000);

          socket.once("column:update_sort:ack", handleAck);

          socket.emit("column:update_sort", {
            table_id: tableId,
            sort_data: sortData
          });
        });
      } else {
        await api.updateColumnSort(tableId, sortData);
        await fetchTableDetail(tableId);
        return true;
      }
    } catch (err: any) {
      console.error("Failed to update column sort with sync", err);
      try {
        await api.updateColumnSort(tableId, sortData);
        await fetchTableDetail(tableId);
        return true;
      } catch (innerErr) {
        console.error(innerErr);
        return false;
      }
    }
  };

  const convertColumnTypeWithSync = async (
    tableId: string,
    columnId: string,
    newType: string
  ) => {
    try {
      if (socket && socket.connected) {
        return new Promise<boolean>((resolve, reject) => {
          let timeoutId: any;

          const handleAck = async (response: any) => {
            if (timeoutId) clearTimeout(timeoutId);
            if (response && response.success) {
              // Broadcast column type converted event to all other clients in the table room
              const targetRoom = socketManager.getJoinedRoom(tableId);
              socket.emit("column:type_converted:broadcast", {
                room: targetRoom,
                success: true,
                data: response.data || {
                  table_id: tableId,
                  column_id: columnId,
                  new_type: newType,
                },
                action: "convert_type",
                total: response.total !== undefined ? response.total : (response.data?.total || activeTable?.rows?.length || 0)
              });
              await fetchTableDetail(tableId);
              resolve(true);
            } else {
              reject(new Error(response?.message || "通过 Socket 转换字段类型失败"));
            }
          };

          timeoutId = setTimeout(() => {
            socket.off("column:convert_type:ack", handleAck);
            reject(new Error("转换字段类型 Socket 响应超时"));
          }, 5000);

          socket.once("column:convert_type:ack", handleAck);

          socket.emit("column:convert_type", {
            table_id: tableId,
            column_id: columnId,
            new_type: newType
          });
        });
      } else {
        await api.convertColumnType(tableId, columnId, newType);
        await fetchTableDetail(tableId);
        return true;
      }
    } catch (err: any) {
      console.error("Failed to convert column type with sync", err);
      try {
        await api.convertColumnType(tableId, columnId, newType);
        await fetchTableDetail(tableId);
        return true;
      } catch (innerErr) {
        console.error(innerErr);
        return false;
      }
    }
  };

  const handleSetDefaultView = async (viewId: string) => {
    if (!activeTableId || !activeTable) return;
    try {
      const viewToSet = activeTable.views?.find((v) => v.id === viewId);
      if (!viewToSet) return;

      // Update locally first for rapid UI updates
      setActiveTable((prev) =>
        prev
          ? {
              ...prev,
              views:
                prev.views?.map((v) => ({
                  ...v,
                  is_default: v.id === viewId,
                })) || [],
            }
          : null,
      );

      await updateViewWithSync(activeTableId, viewId, {
        is_default: true,
        config: viewToSet.config || {},
      });
      setViewContextMenu(null);
      toast.success("已设为默认视图");
    } catch (err: any) {
      console.error("设为默认视图失败", err);
      toast.error(err.message || "设为默认视图失败");
    }
  };

  const updateViewConfig = async (updates: Partial<ViewMetadata["config"]>) => {
    if (!activeView || !activeTableId) return;

    // Create a new config object
    const newConfig = { ...activeView.config, ...updates };

    // Remove keys that are explicitly set to null
    Object.keys(updates).forEach((key) => {
      if ((updates as any)[key] === null) {
        delete (newConfig as any)[key];
      }
    });

    setActiveTable((prev) =>
      prev
        ? {
            ...prev,
            views:
              prev.views?.map((v) =>
                v.id === activeViewId ? { ...v, config: newConfig } : v,
              ) || [],
          }
        : null,
    );

    try {
      // If we are updating filters, check if any of the new filters are incomplete.
      // If any incomplete filters are present (e.g. while adding a new filter, selecting, or typing), 
      // do NOT trigger view:update socket & HTTP request on backend.
      // This keeps the UI responsive & local state synchronized without sending half-empty queries to the server.
      if (updates.filters) {
        const totalFiltersCount = updates.filters.length;
        const validFiltersCount = getValidFilters(updates.filters, activeTable?.columns).length;
        if (totalFiltersCount > 0 && validFiltersCount !== totalFiltersCount) {
          // There is an incomplete filter in the current draft list. Only trigger local update, avoid remote sync.
          return;
        }
      }

      // Filter out incomplete filters before sending to API to avoid backend errors
      const configToSave = { ...newConfig };
      if (configToSave.filters) {
        configToSave.filters = getValidFilters(
          configToSave.filters,
          activeTable.columns,
        );
      }

    if (isTableReadonly) {
        // Only apply in local state, do not push to server
        return;
      }

      await updateViewWithSync(activeTableId, activeView.id, {
        config: configToSave,
        is_default: activeView.is_default || false,
      });
      // fetchRows() is handled by useEffect when activeView changes via setActiveTable
    } catch (err: any) {
      console.error("更新视图配置失败", err);
      toast.error(err.message || "更新视图配置失败");
    }
  };

  // ... Column Handlers ...
  const handleAddColumn = () => {
    setEditingColumn(null);
    setIsFieldDialogOpen(true);
  };

  const handleSaveColumn = async (col: Column, isVisible: boolean) => {
    if (
      !activeTableId ||
      !activeView ||
      !activeTable ||
      activeTable.id !== activeTableId
    )
      return;
    try {
      let savedColId = col.id;

      // 1. Save/Update Column
      const existingCol = activeTable?.columns.find((c) => c.id === col.id);
      if (existingCol) {
        // Check if type changed
        if (existingCol.type !== col.type) {
          await convertColumnTypeWithSync(activeTableId, col.id, col.type);
        }
        await updateColumnWithSync(activeTableId, col.id, col);
      } else {
        const nextSort = activeTable ? activeTable.columns.length : 0;
        const colWithSort = { ...col, sort: nextSort };

        if (socket && socket.connected) {
          const resultPromise = new Promise<{ id: string }>((resolve, reject) => {
            let timeoutId: any;

            const handleAck = (response: any) => {
              if (timeoutId) clearTimeout(timeoutId);
              if (response && response.success) {
                const columnId = response.data?.column_id || response.data?.id;
                
                // Broadcast column created event to all other clients in the table room
                const targetRoom = socketManager.getJoinedRoom(activeTableId);
                socket.emit("column:created:broadcast", {
                  room: targetRoom,
                  success: true,
                  data: {
                    ...(response.data || {}),
                    table_id: activeTableId,
                    column_id: columnId,
                  },
                  action: "create",
                  total: response.total || response.data?.total || (activeTable.columns.length + 1)
                });
                
                resolve({ id: columnId });
              } else {
                reject(new Error(response?.message || "通过 Socket 创建字段失败"));
              }
            };

            timeoutId = setTimeout(() => {
              socket.off("column:create:ack", handleAck);
              reject(new Error("创建字段 Socket 响应超时"));
            }, 5000);

            socket.once("column:create:ack", handleAck);

            socket.emit("column:create", {
              table_id: activeTableId,
              name: colWithSort.name,
              type: colWithSort.type,
              width: colWithSort.width || 150,
              sort: colWithSort.sort,
              config: colWithSort.config || {}
            });
          });

          const result = await resultPromise;
          savedColId = result.id;
        } else {
          const res = await api.createColumn(activeTableId, colWithSort);
          savedColId = res.data.id;
        }
      }

      // 1.5 Batch Update for Search Reference
      if (
        col.type === FieldType.SEARCH_REFERENCE &&
        col.config?.search_reference_config
      ) {
        // Commented out to prevent errors when adding column
        // await api.batchUpdateSearchReference(activeTableId, savedColId);
      }

      // 1.6 Batch Update for Formula
      if (col.type === FieldType.FORMULA && col.config?.formula) {
        const allLoadedRows = flattenRows(rows);
        if (allLoadedRows.length > 0) {
          // Ensure columns array includes the updated/new column
          let updatedCols = activeTable ? [...activeTable.columns] : [];
          const existIdx = updatedCols.findIndex((c) => c.id === savedColId);
          if (existIdx >= 0) {
            updatedCols[existIdx] = { ...col, id: savedColId };
          } else {
            updatedCols.push({ ...col, id: savedColId });
          }

          const payload = allLoadedRows.map((r: Row) => {
            const val = evaluateFormula(col.config.formula, updatedCols, r);
            return {
              row_id: r.id,
              operation_type: "update",
              parent_id: r.parent_id || null,
              data: {
                [savedColId]: val,
              },
            };
          });
          await api.batchProcessRows(activeTableId, payload);
        }
      }

      // 1.7 Batch Update for Checkbox (Default false for new columns)
      if (col.type === FieldType.CHECKBOX && !existingCol) {
        const allLoadedRows = flattenRows(rows);
        if (allLoadedRows.length > 0) {
          const payload = allLoadedRows.map((r: Row) => {
            return {
              row_id: r.id,
              operation_type: "update",
              parent_id: r.parent_id || null,
              data: {
                [savedColId]: false,
              },
            };
          });
          await api.batchProcessRows(activeTableId, payload);
        }
      }

      // 2. Update View Visibility
      // If visibleColumns is undefined, it means "Show All".
      // We initialize it with all current columns to make it explicit.
      const allColIds = activeTable ? activeTable.columns.map((c) => c.id) : [];
      // If creating new, add it to the "all" list for calculation
      if (!allColIds.includes(savedColId)) allColIds.push(savedColId);

      const currentVisible = activeView.config?.visibleColumns || allColIds;
      let newVisible = [...currentVisible];

      if (isVisible) {
        if (!newVisible.includes(savedColId)) {
          newVisible.push(savedColId);
        }
      } else {
        newVisible = newVisible.filter((id) => id !== savedColId);
      }

      // Only update if changed or if we are transitioning from "Show All" (undefined) to explicit list
      if (
        JSON.stringify(newVisible) !==
        JSON.stringify(activeView.config?.visibleColumns)
      ) {
        await updateViewConfig({ visibleColumns: newVisible });
      }

      await fetchTableDetail(activeTableId);
      // Refresh rows to show updated data (especially for Search Reference or Formula)
      await fetchRows(1, true);
      setIsFieldDialogOpen(false);
    } catch (err: any) {
      console.error("保存字段失败", err);
      toast.error(err.message || "保存字段失败");
    }
  };

  const handleDeleteColumn = async (colId: string) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return false;
    try {
      await deleteColumnWithSync(activeTableId, colId);
      return true;
    } catch (err: any) {
      console.error("删除字段失败", err);
      toast.error(err.message || "删除字段失败");
      return false;
    }
  };

  const handleDeleteColumns = async (colIds: string[]) => {
    if (
      !activeTableId ||
      !activeTable ||
      activeTable.id !== activeTableId ||
      colIds.length === 0
    )
      return false;
    try {
      // 调用后端批量删除接口并在 Socket 频道中同步广播
      await batchDeleteColumnsWithSync(activeTableId, colIds);

      toast.success(`成功删除 ${colIds.length} 个字段`);
      return true;
    } catch (err: any) {
      console.error("批量删除字段失败", err);
      toast.error(err.message || "批量删除字段失败");
      // Still fetch details to reflect partial deletions (if any)
      await fetchTableDetail(activeTableId);
      return false;
    }
  };

  const handleColumnSort = async (sortedColumns: Column[]) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;
    const newColumns = sortedColumns.map((c, idx) => ({ ...c, sort: idx }));
    setActiveTable((prev) => (prev ? { ...prev, columns: newColumns } : null));
    setTables((prev) =>
      prev.map((t) =>
        t.id === activeTableId ? { ...t, columns: newColumns } : t,
      ),
    );
    const payload = newColumns.map((c) => ({ id: c.id, sort: c.sort || 0 }));
    try {
      await updateColumnSortWithSync(activeTableId, payload);
    } catch (err) {
      console.error("Sort failed", err);
      fetchTableDetail(activeTableId);
    }
  };

  const handleToggleColumnVisibility = (colId: string) => {
    if (!activeView) return;
    const currentVisible =
      activeView.config?.visibleColumns ||
      activeTable!.columns.map((c) => c.id);
    const isVisible = currentVisible.includes(colId);
    const newVisible = isVisible
      ? currentVisible.filter((id) => id !== colId)
      : [...currentVisible, colId];
    updateViewConfig({ visibleColumns: newVisible });
  };

  const debouncedUpdateViewConfig = useMemo(
    () =>
      debounce(async (tableId: string, viewId: string, config: any) => {
        try {
          await updateViewWithSync(tableId, viewId, { config });
        } catch (err) {
          console.error("Debounced update failed", err);
        }
      }, 500),
    [],
  );

  const handleColumnResize = (colId: string, width: number) => {
    if (
      !activeTableId ||
      !activeViewId ||
      !activeView ||
      !activeTable ||
      activeTable.id !== activeTableId
    )
      return;

    const currentWidths = activeView.config?.columnWidths || {};
    const newWidths = { ...currentWidths, [colId]: width };
    const newConfig = { ...activeView.config, columnWidths: newWidths };

    // Optimistic update
    setActiveTable((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        views: prev.views.map((v) =>
          v.id === activeViewId ? { ...v, config: newConfig } : v,
        ),
      };
    });

    debouncedUpdateViewConfig(activeTableId, activeViewId, newConfig);
  };

  const sanitizeUserValue = (val: any) => {
    if (Array.isArray(val)) {
      return val.map((v: any) =>
        typeof v === "object" && v !== null ? (v.id || String(v)) : String(v),
      );
    } else if (typeof val === "object" && val !== null) {
      return [val.id || String(val)];
    } else if (val) {
      return [String(val)];
    }
    return [];
  };

  // Helper to prepare data for backend (stringify complex types if needed)
  const prepareDataForBackend = (
    data: Record<string, any>,
    columns: Column[],
  ) => {
    const processed = { ...data };

    // Evaluate formula fields so their calculated values are saved to backend
    columns
      .filter((c) => c.type === FieldType.FORMULA)
      .forEach((col) => {
        const formula = col.config?.formula || col.formula || "";
        // Provide a dummy row object with the current data state for evaluation
        const displayVal = evaluateFormula(formula, columns, {
          id: "temp",
          data: processed,
          parent_id: null,
          index: 0,
        });
        processed[col.id] = displayVal;
      });

    columns.forEach((col) => {
      let val = processed[col.id];
      if (col.type === FieldType.CHECKBOX) {
        val = !!val;
        processed[col.id] = val;
      }
      if (!val && val !== 0 && val !== false) return; // Allow 0 and false for formulas/numbers fields

      if (col.type === FieldType.DEPARTMENT) {
        // Ensure it's an array of {id, name} objects as requested:
        // "field_id": [{"id": "...", "name": "..."}, ...]
        let depts: { id: string; name: string }[] = [];
        if (Array.isArray(val)) {
          depts = val.map((v: any) => {
            if (typeof v === "object" && v !== null) {
              return {
                id: v.id || v.dept_id,
                name: v.name || v.dept_name || v.id,
              };
            }
            return { id: String(v), name: String(v) };
          });
        } else if (typeof val === "object" && val !== null) {
          depts = [
            {
              id: val.id || val.dept_id,
              name: val.name || val.dept_name || val.id,
            },
          ];
        } else if (val) {
          depts = [{ id: String(val), name: String(val) }];
        }
        processed[col.id] = depts;
      } else if (col.type === FieldType.USER) {
        processed[col.id] = sanitizeUserValue(val);
      }
    });
    return processed;
  };

  // ... Row Handlers ...
  const handleAddRow = async (
    initialData: Record<string, any> = {},
    specificId?: string,
    index?: number,
  ) => {
    if (isTableReadonly) return;
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;

    const dataWithDefaults = { ...initialData };
    activeTable.columns.forEach((col) => {
      const def = col.config?.defaultValue ?? col.defaultValue;
      if (
        def !== undefined &&
        def !== null &&
        def !== "" &&
        dataWithDefaults[col.id] === undefined
      ) {
        dataWithDefaults[col.id] = def;
      }
    });

    setNewRowData(dataWithDefaults);
    setIsCreatingNewRow(true);
    return null;
  };

  const handleDirectAddRow = async (
    initialData: Record<string, any> = {},
    index?: number,
  ) => {
    if (isTableReadonly) return null;
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return null;

    const dataWithDefaults = { ...initialData };
    activeTable.columns.forEach((col) => {
      const def = col.config?.defaultValue ?? col.defaultValue;
      if (
        def !== undefined &&
        def !== null &&
        def !== "" &&
        dataWithDefaults[col.id] === undefined
      ) {
        dataWithDefaults[col.id] = def;
      }
    });

    return await handleConfirmAddRow(dataWithDefaults, index);
  };

  const handleBatchProcessRows = async (payload: any[]) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;

    // Prepare data for backend
    const processedPayload = payload.map((item) => ({
      ...item,
      data: prepareDataForBackend(item.data, activeTable.columns),
    }));

    try {
      await api.batchProcessRows(activeTableId, processedPayload);
      fetchRows(1, true);
      fetchUndoRedoStatus();
      toast.success("批量处理成功");
    } catch (err: any) {
      console.error("批量处理失败", err);
      toast.error(err.message || "批量处理失败");
    }
  };

  const handleConfirmAddRow = async (
    data: Record<string, any>,
    index?: number,
  ) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;

    const dataToSend = prepareDataForBackend(data, activeTable.columns);

    try {
      if (isConnected) {
        // Socket.IO sync mode
        syncCreateRow(dataToSend, index || 0, null, () => {
          fetchUndoRedoStatus();
          setIsCreatingNewRow(false);
          setNewRowData({});
          toast.success("添加成功");
        });
        return;
      }

      // Fallback REST API mode if socket is not connected
      const res = await api.createRow(activeTableId, {
        data: dataToSend,
        index: index,
        parent_id: null,
      });

      // Merge rich data (objects with name/avatar) from 'data' into 'res.data' for immediate correct display
      const richRowData = { ...res.data.data };
      activeTable.columns.forEach((col) => {
        if (
          (col.type === FieldType.USER ||
            col.type === FieldType.DEPARTMENT ||
            col.type === FieldType.LINK ||
            col.type === FieldType.ATTACHMENT) &&
          data[col.id]
        ) {
          richRowData[col.id] = data[col.id];
        }
      });
      const finalRow = { ...res.data, data: richRowData };

      setRows((prev) => [...prev, finalRow]);
      setTotalRowsCount((prev) => (prev !== undefined ? prev + 1 : undefined));

      fetchUndoRedoStatus();
      setIsCreatingNewRow(false);
      setNewRowData({});
      toast.success("添加成功");
      return finalRow;
    } catch (err: any) {
      console.error("添加行失败", err);
      toast.error(err.message || "添加行失败");
      return null;
    }
  };

  const handleAddSubRow = async (
    parentId: string,
    initialData: Record<string, any> = {},
  ) => {
    if (isTableReadonly) return;
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;
    const dataWithDefaults: Record<string, any> = { ...initialData };
    activeTable.columns.forEach((col) => {
      const def = col.config?.defaultValue ?? col.defaultValue;
      if (
        def !== undefined &&
        def !== null &&
        def !== "" &&
        dataWithDefaults[col.id] === undefined
      ) {
        dataWithDefaults[col.id] = def;
      }
    });

    const dataToSend = prepareDataForBackend(
      dataWithDefaults,
      activeTable.columns,
    );

    try {
      const parentRow = findRowInTree(rows, parentId);
      const nextIndex = parentRow?.children ? parentRow.children.length : 0;

      if (isConnected) {
        // Socket.IO sync mode
        syncCreateRow(dataToSend, nextIndex, parentId, () => {
          fetchUndoRedoStatus();
          toast.success("添加子行成功");
        });
        return;
      }

      // Fallback REST API mode if socket is not connected
      const res = await api.createRow(activeTableId, {
        parent_id: parentId,
        data: dataToSend,
        index: nextIndex,
      });

      setRows((prev) => {
        const updateRecursive = (list: Row[]): Row[] => {
          return list.map((r) => {
            if (r.id === parentId) {
              return { ...r, children: [...(r.children || []), res.data] };
            }
            if (r.children) {
              return { ...r, children: updateRecursive(r.children) };
            }
            return r;
          });
        };
        return updateRecursive(prev);
      });
      setTotalRowsCount((prev) => (prev !== undefined ? prev + 1 : undefined));

      fetchUndoRedoStatus();
      toast.success("添加子行成功");
    } catch (err: any) {
      console.error("添加子记录失败", err);
      toast.error(err.message || "添加子记录失败");
    }
  };

  const handleInsertRow = async (
    targetRowId: string,
    position: "before" | "after",
    initialData?: Record<string, any>,
    count: number = 1,
  ) => {
    if (isTableReadonly) return;
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;
    const dataWithDefaults = { ...(initialData || {}) };
    activeTable.columns.forEach((col) => {
      const def = col.config?.defaultValue ?? col.defaultValue;
      if (
        def !== undefined &&
        def !== null &&
        def !== "" &&
        dataWithDefaults[col.id] === undefined
      ) {
        dataWithDefaults[col.id] = def;
      }
    });

    const dataToSend = prepareDataForBackend(
      dataWithDefaults,
      activeTable.columns,
    );

    try {
      const targetRow = findRowInTree(rows, targetRowId);
      if (!targetRow) return;

      const currentIndex = targetRow.index ?? 0;

      if (isConnected) {
        if (position === "before") {
          for (let i = 0; i < count; i++) {
            syncInsertRowAbove(
              dataToSend,
              currentIndex,
              targetRow.parent_id || null,
              () => {
                fetchUndoRedoStatus();
                if (i === count - 1) {
                  toast.success("插入行成功");
                }
              },
            );
          }
        } else {
          for (let i = 0; i < count; i++) {
            syncInsertRowBelow(
              dataToSend,
              currentIndex,
              targetRow.parent_id || null,
              () => {
                fetchUndoRedoStatus();
                if (i === count - 1) {
                  toast.success("插入行成功");
                }
              },
            );
          }
        }
        return;
      }

      for (let i = 0; i < count; i++) {
        if (position === "before") {
          await api.insertRowAbove(activeTableId, {
            data: dataToSend,
            index: currentIndex,
            parent_id: targetRow.parent_id || null,
          });
        } else {
          await api.insertRowBelow(activeTableId, {
            data: dataToSend,
            index: currentIndex,
            parent_id: targetRow.parent_id || null,
          });
        }
      }

      fetchRows(1, true);
      fetchUndoRedoStatus();
    } catch (err: any) {
      console.error("插入行失败", err);
      toast.error(err.message || "插入行失败");
    }
  };

  const handleDuplicateRow = async (targetRowId: string) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;
    try {
      if (isConnected) {
        syncDuplicateRow(targetRowId, () => {
          fetchUndoRedoStatus();
          toast.success("复制行成功");
        });
        return;
      }

      await api.copyRow(activeTableId, targetRowId);
      fetchRows(1, true);
      fetchUndoRedoStatus();
    } catch (err: any) {
      console.error("复制行失败", err);
      toast.error(err.message || "复制行失败");
    }
  };

  const handleDuplicateRows = async (rowIds: string[]) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
    if (!rowIds || rowIds.length === 0) return;
    
    try {
      if (isConnected) {
        syncBatchDuplicateRows(rowIds, () => {
          fetchUndoRedoStatus();
          toast.success("批量复制成功");
        });
        return;
      }

      await api.batchCopyRows(activeTableId, rowIds);
      fetchRows(1, true);
      fetchUndoRedoStatus();
    } catch (err: any) {
      console.error("批量复制失败", err);
      toast.error(err.message || "批量复制失败");
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    if (isTableReadonly) return;
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;
    try {
      if (isConnected) {
        syncDeleteRow(rowId);
        fetchUndoRedoStatus();
        toast.success("删除成功");
        return;
      }

      await api.deleteRow(activeTableId, rowId);
      setRows((prev) => {
        const deleteRecursive = (list: Row[]): Row[] => {
          return list
            .filter((r) => r.id !== rowId)
            .map((r) => {
              if (r.children) {
                return { ...r, children: deleteRecursive(r.children) };
              }
              return r;
            });
        };
        return deleteRecursive(prev);
      });
      setTotalRowsCount((prev) =>
        prev !== undefined ? Math.max(0, prev - 1) : undefined,
      );

      fetchUndoRedoStatus();
      toast.success("删除成功");
    } catch (err: any) {
      console.error("删除失败", err);
      toast.error(err.message || "删除失败");
    }
  };

  const handleDeleteRows = async (rowIds: string[]) => {
    if (isTableReadonly) return;
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;
    try {
      if (isConnected) {
        syncBatchDeleteRows(rowIds);
        fetchUndoRedoStatus();
        toast.success("批量删除成功");
        return;
      }

      await api.batchDeleteRows(activeTableId, rowIds);
      setRows((prev) => {
        const deleteRecursive = (list: Row[]): Row[] => {
          return list
            .filter((r) => !rowIds.includes(r.id))
            .map((r) => {
              if (r.children) {
                return { ...r, children: deleteRecursive(r.children) };
              }
              return r;
            });
        };
        return deleteRecursive(prev);
      });
      setTotalRowsCount((prev) =>
        prev !== undefined ? Math.max(0, prev - rowIds.length) : undefined,
      );
      fetchUndoRedoStatus();
      toast.success("批量删除成功");
    } catch (err: any) {
      console.error("批量删除失败", err);
      toast.error(err.message || "批量删除失败");
    }
  };

  const handleMoveRow = async (rowId: string, targetIndex: number) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;
    try {
      if (isConnected) {
        syncMoveRow(rowId, targetIndex);
        fetchUndoRedoStatus();
        return;
      }

      await api.moveRow(activeTableId, rowId, targetIndex);
      fetchRows(1, true);
      fetchUndoRedoStatus();
    } catch (err: any) {
      console.error("移动行失败", err);
      toast.error(err.message || "移动行失败");
    }
  };

  const handleBatchCellChange = async (
    rowId: string,
    updates: Record<string, any>,
  ) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;
    const currentRow = findRowInTree(rows, rowId);
    if (!currentRow) return;

    // Optimistic update
    setRows((prev) => {
      const updateRecursive = (list: Row[]): Row[] => {
        return list.map((r) => {
          if (r.id === rowId) return { ...r, data: { ...r.data, ...updates } };
          if (r.children)
            return { ...r, children: updateRecursive(r.children) };
          return r;
        });
      };
      return updateRecursive(prev);
    });

    if (isConnected) {
      Object.entries(updates).forEach(([colId, val]) => {
        const column = activeTable.columns.find((c) => c.id === colId);
        let valToSend = val;
        if (column && column.type === FieldType.USER) {
          valToSend = sanitizeUserValue(val);
        }
        syncUpdateCell(rowId, colId, valToSend);
      });
      fetchUndoRedoStatus();
      return;
    }

    try {
      const updatedData = { ...currentRow.data, ...updates };
      const dataToSend = prepareDataForBackend(
        updatedData,
        activeTable.columns,
      );

      const res = await api.updateRow(activeTableId, rowId, {
        data: dataToSend,
        index: currentRow.index || 0,
        parent_id: currentRow.parent_id || null,
      });

      // Update local state with the actual updated row from backend
      setRows((prev) => {
        const updateRecursive = (list: Row[]): Row[] => {
          return list.map((r) => {
            if (r.id === rowId) {
              const finalData = { ...res.data.data };
              for (const [colId, value] of Object.entries(updates)) {
                const column = activeTable.columns.find((c) => c.id === colId);
                if (
                  column &&
                  (column.type === FieldType.USER ||
                    column.type === FieldType.DEPARTMENT ||
                    column.type === FieldType.LINK ||
                    column.type === FieldType.ATTACHMENT)
                ) {
                  finalData[colId] = value;
                }
              }
              return {
                ...r,
                ...res.data,
                data: finalData,
                children: r.children,
              };
            }
            if (r.children)
              return { ...r, children: updateRecursive(r.children) };
            return r;
          });
        };
        return updateRecursive(prev);
      });

      if (activeTable.columns.some((c) => c.type === FieldType.FORMULA)) {
        await fetchRows(1, true);
      }

      fetchUndoRedoStatus();

      // Check for dependent Search Reference columns
      let shouldFetchSearchRef = false;
      for (const colId of Object.keys(updates)) {
        const dependentCols = activeTable.columns.filter(
          (c) =>
            c.type === FieldType.SEARCH_REFERENCE &&
            c.config.search_reference_config?.filters?.some(
              (f) => f.current_field_id === colId,
            ),
        );
        if (dependentCols.length > 0) {
          // Commented out to prevent errors when cell changes
          // await api.batchUpdateSearchReference(activeTableId, colId);
          shouldFetchSearchRef = true;
        }
      }
      if (shouldFetchSearchRef) {
        await fetchRows(1, true);
      }
    } catch (err: any) {
      console.error("修改单元格(批量)失败", err);
      toast.error(err.message || "修改单元格失败");
      fetchRows(1, true);
    }
  };

  const handleCellChange = async (rowId: string, colId: string, value: any) => {
    if (isTableReadonly) return;
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;
    const currentRow = findRowInTree(rows, rowId);
    if (!currentRow) return;

    const column = activeTable.columns.find((c) => c.id === colId);

    // Optimistic update
    setRows((prev) => {
      const updateRecursive = (list: Row[]): Row[] => {
        return list.map((r) => {
          if (r.id === rowId)
            return { ...r, data: { ...r.data, [colId]: value } };
          if (r.children)
            return { ...r, children: updateRecursive(r.children) };
          return r;
        });
      };
      return updateRecursive(prev);
    });

    if (isConnected) {
      let valToSend = value;
      if (column && column.type === FieldType.USER) {
        valToSend = sanitizeUserValue(value);
      }
      syncUpdateCell(rowId, colId, valToSend);
      fetchUndoRedoStatus();
      return;
    }

    try {
      const updatedData = { ...currentRow.data, [colId]: value };
      const dataToSend = prepareDataForBackend(
        updatedData,
        activeTable.columns,
      );

      const res = await api.updateRow(activeTableId, rowId, {
        data: dataToSend,
        index: currentRow.index || 0,
        parent_id: currentRow.parent_id || null,
      });

      // Update local state with the actual updated row from backend
      setRows((prev) => {
        const updateRecursive = (list: Row[]): Row[] => {
          return list.map((r) => {
            if (r.id === rowId) {
              // Merge rich data from optimistic update if it's a USER/DEPARTMENT field
              const finalData = { ...res.data.data };
              if (
                column &&
                (column.type === FieldType.USER ||
                  column.type === FieldType.DEPARTMENT ||
                  column.type === FieldType.LINK ||
                  column.type === FieldType.ATTACHMENT)
              ) {
                finalData[colId] = value;
              }
              return {
                ...r,
                ...res.data,
                data: finalData,
                children: r.children,
              };
            }
            if (r.children)
              return { ...r, children: updateRecursive(r.children) };
            return r;
          });
        };
        return updateRecursive(prev);
      });

      // If there are formula columns, refresh data to ensure all formulas are updated
      if (activeTable.columns.some((c) => c.type === FieldType.FORMULA)) {
        await fetchRows(1, true);
      }

      // After update, if it's a USER field, we don't necessarily need to update the state with the full object
      // because we want to keep the state as IDs. The display component will handle fetching.
      // However, we can still fetch to verify or just let the display component do its job.
      // For now, I'll remove the state update with the full object to keep it as IDs.
      if (column && column.type === FieldType.USER) {
        // We don't update rows state with the rich object here anymore
        // to ensure we always store IDs.
      }

      fetchUndoRedoStatus();

      // Check for dependent Search Reference columns and trigger update
      if (activeTable) {
        const dependentCols = activeTable.columns.filter(
          (c) =>
            c.type === FieldType.SEARCH_REFERENCE &&
            c.config.search_reference_config?.filters?.some(
              (f) => f.current_field_id === colId,
            ),
        );

        if (dependentCols.length > 0) {
          // Commented out to prevent errors when cell changes
          // await api.batchUpdateSearchReference(activeTableId, colId);
          await fetchRows(1, true);
        }
      }
    } catch (err: any) {
      console.error("修改单元格失败", err);
      toast.error(err.message || "修改单元格失败");
      fetchRows(1, true);
    }
  };

  // ... Options Handlers ...
  const handleOptionChange = async (
    colId: string,
    oldOpt: string,
    newOpt: string | null,
  ) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;
    const column = activeTable.columns.find((c) => c.id === colId);
    if (!column) return;

    let newOptions = column.config.options || [];
    let newOptionColors = { ...column.config.option_colors };

    if (newOpt === null) {
      newOptions = newOptions.filter((o) => o !== oldOpt);
      delete newOptionColors[oldOpt];
    } else if (oldOpt === "new") {
      if (!newOptions.includes(newOpt)) newOptions.push(newOpt);
    } else {
      newOptions = newOptions.map((o) => (o === oldOpt ? newOpt : o));
      if (newOptionColors[oldOpt]) {
        newOptionColors[newOpt] = newOptionColors[oldOpt];
        delete newOptionColors[oldOpt];
      }
    }

    const updatedCol = {
      ...column,
      config: {
        ...column.config,
        options: newOptions,
        option_colors: newOptionColors,
      },
    };

    try {
      await updateColumnWithSync(activeTableId, colId, updatedCol);
    } catch (err: any) {
      console.error("更新选项失败", err);
      toast.error(err.message || "更新选项失败");
    }
  };

  const visibleColumns = useMemo(() => {
    if (!activeTable) return [];
    const widths = activeView?.config?.columnWidths || {};
    const visibleIds = activeView?.config?.visibleColumns;

    let cols = activeTable.columns;
    if (visibleIds) {
      cols = cols.filter((c) => visibleIds.includes(c.id));
    }

    return cols
      .map((c) => ({
        ...c,
        width: widths[c.id] || c.width || 150,
      }))
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }, [activeTable, activeView]);

  const handleColumnUpdate = async (updatedCol: Column) => {
    if (activeTableId && activeTable && activeTable.id === activeTableId) {
      try {
        await updateColumnWithSync(activeTableId, updatedCol.id, updatedCol);
      } catch (err: any) {
        console.error("更新列失败", err);
        toast.error(err.message || "更新列失败");
      }
    }
  };

  // --- Comments ---
  const handleOpenComment = async (rowId: string, colId: string) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId)
      return;
    setCommentDialogState({ isOpen: true, rowId, colId });
    if (activeTableId) {
      try {
        const res = await api.getComments(activeTableId, {
          row_id: rowId,
          column_id: colId,
        });
        setCurrentComments(res.data.list);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleAddComment = async (text: string) => {
    if (
      !commentDialogState ||
      !activeTableId ||
      !activeTable ||
      activeTable.id !== activeTableId
    )
      return;
    const { rowId, colId } = commentDialogState;

    if (socket && socket.connected) {
      try {
        socket.once("comment:create:ack", (response: any) => {
          if (response && response.success && response.data) {
            const item = response.data;
            const newComment = {
              id: item.comment_id || item.id,
              text: item.content || item.text || "",
              author: item.account_name || "Guest",
              createdAt: item.created_at
                ? new Date(item.created_at).getTime()
                : Date.now(),
              rowId: item.row_id,
              colId: item.column_id,
            };

            setCurrentComments((prev) => {
              if (prev.some((c) => c.id === newComment.id)) return prev;
              return [...prev, newComment];
            });

            // Update comment counts state locally
            const countKey = `${rowId}_${colId}`;
            setCommentCounts((prev) => {
              const prevCount = prev[countKey] || 0;
              let newCount = prevCount + 1;
              if (response.total !== undefined && response.total !== null) {
                newCount = Number(response.total);
              } else if (response.data?.total !== undefined && response.data?.total !== null) {
                newCount = Number(response.data.total);
              }
              return {
                ...prev,
                [countKey]: isNaN(newCount) ? prevCount + 1 : newCount,
              };
            });

            // Broadcast the comment:created broadcast to the room
            const targetRoom = socketManager.getJoinedRoom(activeTableId);
            socket.emit("comment:created:broadcast", {
              room: targetRoom,
              success: true,
              data: {
                ...(response.data || {}),
                table_id: activeTableId,
                row_id: rowId,
                column_id: colId,
              },
              action: "create",
            });
          } else {
            const errorMsg = response?.message || "添加评论失败";
            console.error("Socket 评论添加失败:", errorMsg);
            toast.error(errorMsg);
          }
        });

        socket.emit("comment:create", {
          table_id: activeTableId,
          column_id: colId,
          row_id: rowId,
          content: text,
        });
      } catch (err: any) {
        // Fallback cleanup if emit throws before actually sending
        socket.off("comment:create:ack");
        console.error("Socket 添加评论时发生异常", err);
        toast.error("添加评论失败");
      }
    } else {
      // Fallback REST API mode if socket is not connected
      try {
        const res: any = await api.addComment(activeTableId, {
          row_id: rowId,
          column_id: colId,
          content: text,
        });
        const newComment = res.data; // API now returns the formatted Comment object

        setCurrentComments((prev) => {
          if (prev.some((c) => c.id === newComment.id)) return prev;
          return [...prev, newComment];
        });

        // Refresh comment counts for the grid view
        fetchAllComments();
      } catch (err: any) {
        console.error("添加评论失败", err);
        toast.error(err.message || "添加评论失败");
      }
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (
      !activeTableId ||
      !commentDialogState ||
      !activeTable ||
      activeTable.id !== activeTableId
    )
      return;
    const { rowId, colId } = commentDialogState;

    if (socket && socket.connected) {
      try {
        socket.once("comment:delete:ack", (response: any) => {
          if (response && response.success) {
            setCurrentComments((prev) =>
              prev.filter((c) => c.id !== commentId),
            );

            // Update comment counts state locally
            const countKey = `${rowId}_${colId}`;
            setCommentCounts((prev) => {
              const prevCount = prev[countKey] || 0;
              let newCount = prevCount - 1;
              if (response.total !== undefined && response.total !== null) {
                newCount = Number(response.total);
              } else if (response.data?.total !== undefined && response.data?.total !== null) {
                newCount = Number(response.data.total);
              }
              return {
                ...prev,
                [countKey]: Math.max(0, isNaN(newCount) ? prevCount - 1 : newCount),
              };
            });

            // Broadcast the comment:deleted broadcast to the room
            const targetRoom = socketManager.getJoinedRoom(activeTableId);
            socket.emit("comment:deleted:broadcast", {
              room: targetRoom,
              success: true,
              data: {
                ...(response.data || {}),
                comment_id: commentId,
                table_id: activeTableId,
                row_id: rowId,
                column_id: colId,
              },
              action: "delete",
            });
          } else {
            const errorMsg = response?.message || "删除评论失败";
            console.error("Socket 评论删除失败:", errorMsg);
            toast.error(errorMsg);
          }
        });

        socket.emit("comment:delete", {
          table_id: activeTableId,
          comment_id: commentId,
        });
      } catch (err: any) {
        // Fallback cleanup if emit throws before actually sending
        socket.off("comment:delete:ack");
        console.error("Socket 删除评论时发生异常", err);
        toast.error("删除评论失败");
      }
    } else {
      // Fallback REST API mode if socket is not connected
      try {
        const res: any = await api.deleteComment(activeTableId, commentId);
        setCurrentComments((prev) => prev.filter((c) => c.id !== commentId));

        // Refresh comment counts for the grid view
        fetchAllComments();
      } catch (err: any) {
        console.error("删除评论失败", err);
        toast.error(err.message || "删除评论失败");
      }
    }
  };

  // ... Render Toolbar ...
  const handleFiltersChange = (filters: FilterCondition[]) =>
    updateViewConfig({ filters });
  const handleSortsChange = (sorts: SortCondition[]) =>
    updateViewConfig({ sorts });
  const handleGroupChange = (groups: GroupCondition[]) =>
    updateViewConfig({ groups });
  const handleColorRulesChange = (colorRules: ColorRule[]) =>
    updateViewConfig({ colorRules });
  const handleRowHeightChange = (rowHeight: RowHeight) =>
    updateViewConfig({ rowHeight });

  const handleIndividualRowHeightChange = (rowId: string, height: number) => {
    if (
      !activeTableId ||
      !activeViewId ||
      !activeView ||
      !activeTable ||
      activeTable.id !== activeTableId
    )
      return;

    const currentHeights = activeView.config?.rowHeights || {};
    const newHeights = { ...currentHeights, [rowId]: height };
    const newConfig = { ...activeView.config, rowHeights: newHeights };

    // Optimistic update
    setActiveTable((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        views: prev.views.map((v) =>
          v.id === activeViewId ? { ...v, config: newConfig } : v,
        ),
      };
    });

    debouncedUpdateViewConfig(activeTableId, activeViewId, newConfig);
  };
  const handleCalendarSettingChange = (key: string, value: any) =>
    updateViewConfig({ [key]: value });
  const handleCalendarTitleChange = (titleField: string) =>
    updateViewConfig({ titleField });
  const handleCalendarColorConfig = (
    colorFieldId?: string | null,
    customColor?: string,
  ) => updateViewConfig({ colorFieldId, customColor });
  const handleGanttSettingChange = (updates: Record<string, any>) =>
    updateViewConfig(updates);
  const handleGallerySettingChange = (key: string, value: any) =>
    updateViewConfig({ [key]: value });

  const handleExportTable = async () => {
    if (!activeTableId) return;
    try {
      const blob = await api.exportTable(activeTableId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeTable?.name || "export"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("导出失败", err);
      // If it's a 401, the api.ts already dispatches 'api:unauthorized' which opens the token dialog
    }
  };

  const renderToolbar = () => {
    if (!activeView || !activeTable) return null;
    const closeMenus = () => setOpenMenu(null);

    const addRecordButton = isTableReadonly ? null : (
      <>
        <button
          onClick={async () => {
            const newRow = await handleAddRow();
            if (newRow) {
              setActiveDetailRowId(newRow.id);
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-primary-600 hover:text-primary-700 font-bold hover:bg-primary-50 rounded-md text-xs transition-colors"
        >
          <ICONS.Plus /> 添加记录
        </button>
        <div className="h-4 w-[1px] bg-gray-200"></div>
      </>
    );

    const ToolbarButton: React.FC<{
      icon: React.ReactNode;
      label: string;
      onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
      isActive?: boolean;
    }> = ({ icon, label, onClick, isActive }) => (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onClick) onClick(e);
        }}
        className={`px-2 py-1.5 text-[11px] font-semibold rounded flex items-center gap-1.5 transition-colors ${isActive ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-100"}`}
      >
        <span className="shrink-0">{icon}</span>
        {label}
      </button>
    );

    const filterButton = (
      <div className="relative">
        <ToolbarButton
          icon={<ICONS.Filter />}
          label="筛选"
          isActive={!!activeView.config?.filters?.length}
          onClick={() => setOpenMenu(openMenu === "FILTER" ? null : "FILTER")}
        />
        {openMenu === "FILTER" && (
          <ClickOutsideWrapper onClickOutside={closeMenus}>
            <FilterMenu
              columns={activeTable.columns}
              filters={activeView.config?.filters || []}
              onChange={handleFiltersChange}
              onClose={closeMenus}
              onSaveAsView={handleSaveAsNewView}
            />
          </ClickOutsideWrapper>
        )}
      </div>
    );

    if (activeView.type === ViewType.CALENDAR) {
      return (
        <div className="flex items-center gap-2" id="tour-toolbar">
          {addRecordButton}
          <div className="relative">
            <ToolbarButton
              icon={<ICONS.Settings />}
              label="日程块配置"
              isActive={openMenu === "CAL_APP"}
              onClick={() =>
                setOpenMenu(openMenu === "CAL_APP" ? null : "CAL_APP")
              }
            />
            {openMenu === "CAL_APP" && (
              <ClickOutsideWrapper onClickOutside={closeMenus}>
                <CalendarAppearanceMenu
                  columns={activeTable.columns}
                  visibleColumns={activeView.config?.visibleColumns}
                  titleField={activeView.config?.titleField}
                  colorFieldId={activeView.config?.colorFieldId}
                  customColor={activeView.config?.customColor}
                  onToggleVisibility={handleToggleColumnVisibility}
                  onChangeTitleField={handleCalendarTitleChange}
                  onChangeColorConfig={handleCalendarColorConfig}
                  onClose={closeMenus}
                />
              </ClickOutsideWrapper>
            )}
          </div>
          <div className="relative">
            <ToolbarButton
              icon={<ICONS.Calendar />}
              label="日历配置"
              isActive={openMenu === "CAL_SET"}
              onClick={() =>
                setOpenMenu(openMenu === "CAL_SET" ? null : "CAL_SET")
              }
            />
            {openMenu === "CAL_SET" && (
              <ClickOutsideWrapper onClickOutside={closeMenus}>
                <CalendarSettingMenu
                  columns={activeTable.columns}
                  config={{
                    dateField: activeView.config?.dateField,
                    endDateField: activeView.config?.endDateField,
                    defaultDuration: activeView.config?.defaultDuration,
                  }}
                  onChange={handleCalendarSettingChange}
                  onClose={closeMenus}
                />
              </ClickOutsideWrapper>
            )}
          </div>
          {filterButton}
        </div>
      );
    }
    if (activeView.type === ViewType.GANTT) {
      return (
        <div className="flex items-center gap-2" id="tour-toolbar">
          {addRecordButton}
          {!isTableReadonly && (
            <div className="relative">
              <ToolbarButton
                icon={<ICONS.Settings />}
                label="字段配置"
                isActive={openMenu === "FIELD"}
                onClick={() => setOpenMenu(openMenu === "FIELD" ? null : "FIELD")}
              />
            {openMenu === "FIELD" && (
              <FieldMenu
                columns={activeTable.columns}
                visibleColumnIds={activeView.config?.visibleColumns}
                onClose={closeMenus}
                onEditColumn={(col, pos) => {
                  setEditingColumn(col);
                  setFieldConfigAnchor(pos || null);
                  setIsFieldDialogOpen(true);
                }}
                onAddColumn={(pos) => {
                  setEditingColumn(null);
                  setFieldConfigAnchor(pos || null);
                  setIsFieldDialogOpen(true);
                }}
                onToggleVisibility={handleToggleColumnVisibility}
                onShowAll={() =>
                  updateViewConfig({
                    visibleColumns: activeTable.columns.map((c) => c.id),
                  })
                }
                onHideAll={() =>
                  updateViewConfig({
                    visibleColumns: [activeTable.columns[0].id],
                  })
                }
                onDeleteColumn={handleDeleteColumn}
                onDeleteColumns={handleDeleteColumns}
                onSort={handleColumnSort}
              />
            )}
          </div>
          )}
          <div className="relative">
            <ToolbarButton
              icon={<ICONS.Gantt />}
              label="甘特图配置"
              isActive={openMenu === "GANTT_SET"}
              onClick={() =>
                setOpenMenu(openMenu === "GANTT_SET" ? null : "GANTT_SET")
              }
            />
            {openMenu === "GANTT_SET" && (
              <ClickOutsideWrapper onClickOutside={closeMenus}>
                <GanttSettingMenu
                  columns={activeTable.columns}
                  config={{
                    dateField: activeView.config?.dateField,
                    endDateField: activeView.config?.endDateField,
                    titleField: activeView.config?.titleField,
                    colorFieldId: activeView.config?.colorFieldId,
                    customColor: activeView.config?.customColor,
                    isWorkdayOnly: activeView.config?.isWorkdayOnly,
                  }}
                  onChange={handleGanttSettingChange}
                  onClose={closeMenus}
                />
              </ClickOutsideWrapper>
            )}
          </div>
          {filterButton}
          <div className="relative">
            <ToolbarButton
              icon={<ICONS.Group />}
              label={
                activeView.config?.groups?.length
                  ? `分组: ${activeView.config.groups.length} 个条件`
                  : "分组"
              }
              isActive={!!activeView.config?.groups?.length}
              onClick={() => setOpenMenu(openMenu === "GROUP" ? null : "GROUP")}
            />
            {openMenu === "GROUP" && (
              <GroupMenu
                columns={activeTable.columns}
                groups={activeView.config?.groups}
                onChange={handleGroupChange}
                onClose={closeMenus}
                onSaveAsView={handleSaveAsNewView}
              />
            )}
          </div>
          <div className="relative">
            <ToolbarButton
              icon={<ICONS.Sort />}
              label="排序"
              isActive={!!activeView.config?.sorts?.length}
              onClick={() => setOpenMenu(openMenu === "SORT" ? null : "SORT")}
            />
            {openMenu === "SORT" && (
              <SortMenu
                columns={activeTable.columns}
                sorts={activeView.config?.sorts || []}
                onChange={handleSortsChange}
                onClose={closeMenus}
                onSaveAsView={handleSaveAsNewView}
              />
            )}
          </div>
        </div>
      );
    }
    if (activeView.type === ViewType.GALLERY) {
      return (
        <div className="flex items-center gap-2" id="tour-toolbar">
          {addRecordButton}
          <div className="relative">
            <ToolbarButton
              icon={<ICONS.Settings />}
              label="卡片配置"
              isActive={openMenu === "GALLERY_SET"}
              onClick={() =>
                setOpenMenu(openMenu === "GALLERY_SET" ? null : "GALLERY_SET")
              }
            />
            {openMenu === "GALLERY_SET" && (
              <ClickOutsideWrapper onClickOutside={closeMenus}>
                <GallerySettingMenu
                  allColumns={activeTable.columns}
                  visibleColumns={activeView.config?.visibleColumns}
                  config={{
                    coverFieldId: activeView.config?.coverFieldId,
                    galleryStyle: activeView.config?.galleryStyle,
                    showFieldNames: activeView.config?.showFieldNames,
                  }}
                  onChange={handleGallerySettingChange}
                  onToggleVisibility={handleToggleColumnVisibility}
                  onAddColumn={() => {
                    setEditingColumn(null);
                    setIsFieldDialogOpen(true);
                  }}
                  onClose={closeMenus}
                />
              </ClickOutsideWrapper>
            )}
          </div>
          {filterButton}
          <div className="relative">
            <ToolbarButton
              icon={<ICONS.Sort />}
              label="排序"
              isActive={!!activeView.config?.sorts?.length}
              onClick={() => setOpenMenu(openMenu === "SORT" ? null : "SORT")}
            />
            {openMenu === "SORT" && (
              <SortMenu
                columns={activeTable.columns}
                sorts={activeView.config?.sorts || []}
                onChange={handleSortsChange}
                onClose={closeMenus}
                onSaveAsView={handleSaveAsNewView}
              />
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2" id="tour-toolbar">
        {addRecordButton}
        <div className="relative">
          <ToolbarButton
            icon={<ICONS.Group />}
            label={
              activeView.type === ViewType.KANBAN
                ? activeView.config?.groups?.[0]?.column_id
                  ? `分组依据: ${activeTable.columns.find((c) => c.id === activeView.config?.groups?.[0]?.column_id)?.name}`
                  : "分组"
                : activeView.config?.groups?.length
                  ? `分组: ${activeView.config.groups.length} 个条件`
                  : "分组"
            }
            isActive={!!activeView.config?.groups?.length}
            onClick={() => setOpenMenu(openMenu === "GROUP" ? null : "GROUP")}
          />
          {openMenu === "GROUP" && (
            <ClickOutsideWrapper onClickOutside={closeMenus}>
              {activeView.type === ViewType.KANBAN ? (
                <SimpleGroupMenu
                  columns={activeTable.columns}
                  groups={activeView.config?.groups}
                  onChange={handleGroupChange}
                  onClose={closeMenus}
                  onSaveAsView={handleSaveAsNewView}
                />
              ) : (
                <GroupMenu
                  columns={activeTable.columns}
                  groups={activeView.config?.groups}
                  onChange={handleGroupChange}
                  onClose={closeMenus}
                  onSaveAsView={handleSaveAsNewView}
                />
              )}
            </ClickOutsideWrapper>
          )}
        </div>
        {!isTableReadonly && (
          <div className="relative">
            <ToolbarButton
              icon={<ICONS.Settings />}
              label={
                activeView.type === ViewType.KANBAN ? "卡片配置" : "字段配置"
              }
              isActive={openMenu === "FIELD"}
              onClick={() => setOpenMenu(openMenu === "FIELD" ? null : "FIELD")}
            />
          {openMenu === "FIELD" && (
            <ClickOutsideWrapper onClickOutside={closeMenus}>
              <FieldMenu
                columns={activeTable.columns}
                visibleColumnIds={activeView.config?.visibleColumns}
                onClose={closeMenus}
                onEditColumn={(col, pos) => {
                  setEditingColumn(col);
                  setFieldConfigAnchor(pos || null);
                  setIsFieldDialogOpen(true);
                }}
                onAddColumn={(pos) => {
                  setEditingColumn(null);
                  setFieldConfigAnchor(pos || null);
                  setIsFieldDialogOpen(true);
                }}
                onToggleVisibility={handleToggleColumnVisibility}
                onShowAll={() =>
                  updateViewConfig({
                    visibleColumns: activeTable.columns.map((c) => c.id),
                  })
                }
                onHideAll={() =>
                  updateViewConfig({
                    visibleColumns: [activeTable.columns[0].id],
                  })
                }
                onDeleteColumn={handleDeleteColumn}
                onDeleteColumns={handleDeleteColumns}
                onSort={handleColumnSort}
              />
            </ClickOutsideWrapper>
          )}
        </div>
        )}
        {filterButton}
        <div className="relative">
          <ToolbarButton
            icon={<ICONS.Sort />}
            label="排序"
            isActive={!!activeView.config?.sorts?.length}
            onClick={() => setOpenMenu(openMenu === "SORT" ? null : "SORT")}
          />
          {openMenu === "SORT" && (
            <ClickOutsideWrapper onClickOutside={closeMenus}>
              <SortMenu
                columns={activeTable.columns}
                sorts={activeView.config?.sorts || []}
                onChange={handleSortsChange}
                onClose={closeMenus}
                onSaveAsView={handleSaveAsNewView}
              />
            </ClickOutsideWrapper>
          )}
        </div>
        {activeView.type === ViewType.GRID && (
          <div className="relative">
            <ToolbarButton
              icon={<ICONS.Height />}
              label="行高"
              onClick={() =>
                setOpenMenu(openMenu === "HEIGHT" ? null : "HEIGHT")
              }
            />
            {openMenu === "HEIGHT" && (
              <ClickOutsideWrapper onClickOutside={closeMenus}>
                <RowHeightMenu
                  current={activeView.config?.rowHeight || "MEDIUM"}
                  onChange={handleRowHeightChange}
                  onClose={closeMenus}
                />
              </ClickOutsideWrapper>
            )}
          </div>
        )}
        {activeView.type !== ViewType.KANBAN && (
          <div className="relative">
            <ToolbarButton
              icon={<ICONS.Color />}
              label="填色"
              isActive={!!activeView.config?.colorRules?.length}
              onClick={() => setOpenMenu(openMenu === "COLOR" ? null : "COLOR")}
            />
            {openMenu === "COLOR" && (
              <ClickOutsideWrapper onClickOutside={closeMenus}>
                <ColorMenu
                  columns={activeTable.columns}
                  rules={activeView.config?.colorRules || []}
                  onChange={handleColorRulesChange}
                  onClose={closeMenus}
                  onSaveAsView={handleSaveAsNewView}
                />
              </ClickOutsideWrapper>
            )}
          </div>
        )}
      </div>
    );
  };

  const flattenedRowsForViews = useMemo(() => flattenTree(rows), [rows]);

  // --- Main Render ---
  const searchParams = new URLSearchParams(window.location.search);
  const publicShareCode = searchParams.get('share_code');
  const isPublicCollectionForm = window.location.pathname.includes('/collectionform') || !!publicShareCode;

  if (isPublicCollectionForm) {
    if (!publicShareCode) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2">未提供分享码</h2>
            <p className="text-gray-500 text-sm">请核对格式，带上正确的 ?share_code=xxx 参数。</p>
          </div>
        </div>
      );
    }
    return <PublicCollectionForm shareCode={publicShareCode} />;
  }

  if (isInitializing) {
    return null;
  }

  return (
    <>
      <div className={`flex flex-col ${fullScreen ? "h-[calc(100vh-100px)]" : "h-full min-h-[500px]"} w-full overflow-hidden bg-white text-sm relative`}>
        {/* Global Header */}
        {!hideHeader && (
          <header className="h-[64px] bg-white border-b border-gray-200 px-7 flex items-center justify-between  sticky top-0 shadow-sm shrink-0">
            <div className="flex items-center gap-2 text-gray-800">
              {!isSidebarOpen && !hideSidebar && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-1.5 text-gray-500 hover:bg-gray-100 rounded mr-2"
                  title="展开菜单"
                >
                  <ICONS.ChevronsRight className="w-5 h-5" />
                </button>
              )}
              <h1 className="text-lg font-semibold tracking-tight">多维表格</h1>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTourOpen(true);
                }}
                className="flex items-center gap-2 px-3 py-2 bg-primary-50 text-primary-600 border border-primary-100 rounded-lg text-sm font-medium hover:bg-primary-100 transition-all shadow-sm"
              >
                <BookOpen className="w-4 h-4" />
                新手指引
              </button>

              <button
                onClick={() => setIsTokenDialogOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 rounded-lg text-sm font-medium transition-all shadow-sm"
              >
                <ICONS.Settings className="w-4 h-4 text-gray-500" />
                配置协同
              </button>
            </div>
          </header>
        )}

        <div className="mdtable-scrollbar flex flex-1 w-full overflow-hidden relative">
          <Toaster position="top-right" richColors />
          {isSidebarOpen && !hideSidebar && (
            <>
              <Sidebar
                tables={tables}
                activeTableId={activeTableId || ""}
                onTableSelect={setActiveTableId}
                onAddTable={handleOpenAddTableWithMetadata}
                onImport={() => setIsImportDialogOpen(true)}
                onTemplate={(typeId) => {
                  setSelectedTemplateTypeId(typeId);
                  setIsTemplateDialogOpen(true);
                }}
                onRenameTable={handleRenameTable}
                onDeleteTable={handleDeleteTable}
                onDuplicateTable={handleDuplicateTable}
                onConfigureTable={handleOpenEditTableWithMetadata}
                onSearch={handleSearch}
                onToggleSidebar={() => setIsSidebarOpen(false)}
                width={sidebarWidth}
              />
              <div
                className="w-1 hover:w-1.5 bg-transparent hover:bg-primary-400 cursor-col-resize z-50 shrink-0"
                onMouseDown={startResizing}
              />
            </>
          )}

          <div ref={searchContainerRef} className="flex-1 flex flex-col h-full overflow-hidden relative">
            {activeTable && activeView && activeView.type === ViewType.FORM && (
              <FormViewBuilder
                table={activeTable}
                viewConfig={activeView.config}
                onUpdateConfig={updateViewConfig}
                onBack={() => {
                  const firstNonFormView = activeTable.views?.find(v => v.type !== ViewType.FORM);
                  if (firstNonFormView) {
                    setActiveViewId(firstNonFormView.id);
                  }
                }}
              />
            )}

            {activeTable && activeView?.type !== ViewType.FORM && (
              <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 h-[56px] shrink-0 px-2 w-full relative z-40">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar h-full">
                  {!isSidebarOpen && !hideSidebar && (
                    <button
                      onClick={() => setIsSidebarOpen(true)}
                      className="p-1.5 text-gray-500 hover:bg-gray-100 rounded ml-2 shrink-0"
                      title="展开菜单"
                    >
                      <ICONS.ChevronsRight className="w-5 h-5" />
                    </button>
                  )}
                  {!isSidebarOpen && (
                    <div className="flex items-center gap-1 group/tablename mr-2 ml-1 shrink-0">
                      <span className="text-sm font-bold text-gray-700 truncate">
                        {activeTable.name}
                      </span>
                      {activeTable.can_manage !== false && (
                        <button
                          onClick={() => handleOpenEditTableWithMetadata(activeTable.id)}
                          className="opacity-0 group-hover/tablename:opacity-100 p-0.5 text-gray-400 hover:text-primary-600 rounded hover:bg-gray-200 transition-all"
                          title="自定义属性"
                        >
                          <ICONS.Settings className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  {activeTable.views?.map((view) => (
                    <div
                      key={view.id}
                      className={`relative shrink-0 ${draggedViewId === view.id ? "opacity-50" : ""}`}
                      draggable
                      onDragStart={(e) => handleViewDragStart(e, view.id)}
                      onDragOver={(e) => handleViewDragOver(e, view.id)}
                      onDragLeave={handleViewDragLeave}
                      onDrop={(e) => handleViewDrop(e, view.id)}
                      onDragEnd={handleViewDragEnd}
                    >
                      {dragOverViewId === view.id && (
                        <div className="absolute top-0 left-0 bottom-0 w-0.5 bg-primary-500 z-20 pointer-events-none" />
                      )}
                      {editingViewId === view.id ? (
                        <div className="px-3 py-1 flex items-center gap-2 bg-white border border-primary-400 rounded-t-md h-full">
                          <span className="text-primary-600 scale-75">
                            {getViewIcon(view.type)}
                          </span>
                          <input
                            ref={viewInputRef}
                            value={editingViewName}
                            onChange={(e) => setEditingViewName(e.target.value)}
                            onBlur={handleViewRenameSubmit}
                            onKeyDown={handleViewKeyDown}
                            className="text-xs bg-transparent outline-none text-gray-900 w-24"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setActiveViewId(view.id)}
                          onContextMenu={(e) =>
                            handleViewContextMenu(e, view.id)
                          }
                          className={`px-4 py-2 flex items-center gap-2 text-xs transition-all relative rounded-t-md border-t border-x ${
                            activeViewId === view.id
                              ? "bg-white border-gray-200 text-primary-600 font-bold -mb-[1px]"
                              : "bg-transparent border-transparent text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                          <span
                            className={
                              activeViewId === view.id
                                ? "text-primary-600"
                                : "text-gray-400"
                            }
                          >
                            {getViewIcon(view.type)}
                          </span>
                          <span className="truncate max-w-[120px]">
                            {view.name}
                          </span>

                          {activeViewId === view.id && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewContextMenu(e, view.id);
                              }}
                              className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
                            >
                              <ICONS.ChevronDown className="w-3 h-3" />
                            </div>
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                  {!isTableReadonly && (
                    <button
                      onClick={handleAddView}
                      className="p-2 hover:bg-gray-200 rounded-md text-gray-400 hover:text-primary-600 transition-colors shrink-0"
                      title="添加视图"
                    >
                      <ICONS.Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Real-time Collaboration Status & Avatars on the right */}
                {!isTableReadonly && (
                  <div className="flex items-center gap-2 px-2 shrink-0 relative">
                    <div
                    onClick={() => setIsOnlineUsersOpen(!isOnlineUsersOpen)}
                    className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-200/60 p-1 rounded-lg transition-all"
                    title="点击查看在线成员详情"
                  >
                    <div className="flex items-center gap-1.5 hidden sm:flex">
                      <span className={`relative flex h-2.5 w-2.5`}>
                        {isConnected && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        )}
                        <span
                          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isConnected ? "bg-green-500" : "bg-amber-500"}`}
                        ></span>
                      </span>
                      <span className="text-xs font-semibold text-gray-500">
                        {isConnected
                          ? `在线 (${displayedUsers.length})`
                          : "未连接团队"}
                      </span>
                    </div>

                    {/* Overlapping User Avatars */}
                    {displayedUsers.length > 0 && (
                      <div className="flex -space-x-2 overflow-hidden ml-1">
                        {displayedUsers.map((u, idx) => {
                          const displayName =
                            u.real_name || u.name || "Co-worker";
                          const initial = displayName.charAt(0).toUpperCase();

                          const colors = [
                            "#EF4444",
                            "#F97316",
                            "#F59E0B",
                            "#10B981",
                            "#06B6D4",
                            "#3B82F6",
                            "#6366F1",
                            "#8B5CF6",
                            "#EC4899",
                            "#14B8A6",
                          ];
                          let hash = 0;
                          for (let i = 0; i < displayName.length; i++) {
                            hash =
                              displayName.charCodeAt(i) + ((hash << 5) - hash);
                          }
                          const colorIndex = Math.abs(hash) % colors.length;
                          const avatarColor = colors[colorIndex];
                          const itemAvatar = u.avatar_url || u.avatar;

                          return (
                            <div
                              key={u.sid || idx}
                              className="relative"
                            >
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white shadow-sm hover:scale-110 transition-transform overflow-hidden"
                                style={{ backgroundColor: avatarColor }}
                              >
                                {itemAvatar ? (
                                  <img src={itemAvatar} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                ) : (
                                  initial
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Online Users Detail Popover */}
                  {isOnlineUsersOpen && (() => {
                    const activeUser = displayedUsers.find(u => u.sid === activeOnlineSid) || displayedUsers[0];
                    if (!activeUser) return null;

                    const activeUserDisplayName = activeUser.real_name || activeUser.name || "Co-worker";
                    const activeUserInitial = activeUserDisplayName.charAt(0).toUpperCase();
                    
                    const activeColors = [
                      "#EF4444", "#F97316", "#F59E0B", "#10B981", "#06B6D4",
                      "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#14B8A6"
                    ];
                    let activeHash = 0;
                    for (let i = 0; i < activeUserDisplayName.length; i++) {
                      activeHash = activeUserDisplayName.charCodeAt(i) + ((activeHash << 5) - activeHash);
                    }
                    const activeColorIndex = Math.abs(activeHash) % activeColors.length;
                    const activeAvatarColor = activeColors[activeColorIndex];

                    const handleCopy = (text: string, fieldName: string) => {
                      navigator.clipboard.writeText(text);
                      setCopiedField(fieldName);
                      setTimeout(() => setCopiedField(null), 1500);
                    };

                    return (
                      <div className="absolute right-2 top-11 z-[300] w-[360px]">
                        <ClickOutsideWrapper onClickOutside={() => setIsOnlineUsersOpen(false)}>
                          <div className="bg-white border border-gray-100 shadow-2xl rounded-xl p-4 flex flex-col gap-3 min-w-[320px] animate-in fade-in slide-in-from-top-2 duration-150">
                            {/* Banner Header */}
                            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                <span className="text-sm font-bold text-gray-800">在线参与人员</span>
                              </div>
                              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                {displayedUsers.length} 人在线
                              </span>
                            </div>

                            {/* User Tab Switchers (切换标签栏) */}
                            <div className="flex gap-1.5 overflow-x-auto pb-2 border-b border-gray-100/80 no-scrollbar">
                              {displayedUsers.map((u, idx) => {
                                const displayName = u.real_name || u.name || "Co-worker";
                                const initial = displayName.charAt(0).toUpperCase();

                                let hash = 0;
                                for (let i = 0; i < displayName.length; i++) {
                                  hash = displayName.charCodeAt(i) + ((hash << 5) - hash);
                                }
                                const colorIndex = Math.abs(hash) % activeColors.length;
                                const avatarColor = activeColors[colorIndex];
                                const isSelected = activeUser.sid === u.sid;

                                return (
                                  <button
                                    key={u.sid || idx}
                                    onClick={() => setActiveOnlineSid(u.sid || null)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all select-none shrink-0 ${
                                      isSelected 
                                        ? "border-primary-500 bg-primary-50 text-primary-700 shadow-sm animate-pulse-fast" 
                                        : "border-gray-100 bg-gray-50/50 hover:bg-gray-100/80 text-gray-600"
                                    }`}
                                  >
                                    <div 
                                      className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 overflow-hidden"
                                      style={{ backgroundColor: avatarColor }}
                                    >
                                      {u.avatar_url || u.avatar ? (
                                        <img src={u.avatar_url || u.avatar} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                      ) : (
                                        initial
                                      )}
                                    </div>
                                    <span>{displayName}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Selected User Details Profile View */}
                            <div className="flex flex-col gap-3.5 pt-1">
                              {/* Avatar and Info Header Card */}
                              <div className="flex items-center gap-3 bg-gray-50/50 border border-gray-100/75 p-3 rounded-xl">
                                <div 
                                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-sm animate-in fade-in duration-300 overflow-hidden"
                                  style={{ backgroundColor: activeAvatarColor }}
                                >
                                  {activeUser.avatar_url || activeUser.avatar ? (
                                    <img src={activeUser.avatar_url || activeUser.avatar} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                  ) : (
                                    activeUserInitial
                                  )}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <h4 className="font-bold text-gray-900 text-[14px] truncate">
                                    {activeUser.real_name || activeUser.name || "在线协作者"}
                                  </h4>
                                </div>
                              </div>

                              {/* Attributes Form */}
                              <div className="flex flex-col gap-2.5 bg-white rounded-xl border border-gray-100 p-3 bg-gradient-to-b from-white to-gray-50/20 shadow-sm">
                                {[
                                  { label: "真实姓名 (real_name)", value: activeUser.real_name, key: "real_name" },
                                  { label: "登录账号 (name)", value: activeUser.name, key: "name" },
                                  { label: "电子邮箱 (email)", value: activeUser.email, key: "email" },
                                  { label: "联系电话 (phone)", value: activeUser.phone, key: "phone" }
                                ].map((field) => (
                                  <div key={field.key} className="flex flex-col gap-1 border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                                    <span className="text-[10px] text-gray-400 font-medium">{field.label}</span>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold text-gray-700 font-mono select-all truncate">
                                        {field.value || "无"}
                                      </span>
                                      {field.value && (
                                        <button
                                          onClick={() => handleCopy(field.value, field.key)}
                                          className="text-[10px] text-primary-600 hover:text-primary-700 font-semibold hover:bg-primary-50 px-1.5 py-0.5 rounded transition-all shrink-0 select-none border border-transparent hover:border-primary-100"
                                        >
                                          {copiedField === field.key ? "已复制!" : "复制"}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </ClickOutsideWrapper>
                      </div>
                    );
                  })()}
                </div>
                )}
              </div>
            )}

            {/* Top Header */}
            <div className="h-12 border-b border-gray-200 flex items-center justify-between px-4 bg-white shrink-0 relative z-index:40">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">{renderToolbar()}</div>
              </div>

              <div className="flex items-center gap-2">
                {activeView && (
                  <button
                    onClick={() => setIsSearchOpen(!isSearchOpen)}
                    className={`p-1.5 rounded transition-colors ${isSearchOpen ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-100 hover:text-primary-600"}`}
                    title="查找"
                  >
                    <ICONS.Search className="w-4 h-4" />
                  </button>
                )}
                {activeView?.type === ViewType.GRID && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleExportTable}
                      className="flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded transition-colors font-medium text-xs mr-1"
                      title="导出表格"
                    >
                      <ICONS.Download className="w-4 h-4" /> 导出表格
                    </button>
                    {!isTableReadonly && (
                      <button
                        onClick={() => setIsAppendDialogOpen(true)}
                        className="flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded transition-colors font-medium text-xs mr-2"
                        title="导入表格"
                      >
                        <ICONS.Import className="w-4 h-4" /> 导入表格
                      </button>
                    )}
                  </div>
                )}
                {!isTableReadonly && (
                  <div className="flex items-center gap-1 mr-2">
                    <button
                      onClick={handleUndo}
                      disabled={!canUndo}
                      className={`p-1.5 rounded transition-colors ${canUndo ? "text-gray-600 hover:bg-gray-100 hover:text-primary-600" : "text-gray-300 cursor-not-allowed"}`}
                      title="撤回"
                    >
                      <ICONS.Undo className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleRedo}
                      disabled={!canRedo}
                      className={`p-1.5 rounded transition-colors ${canRedo ? "text-gray-600 hover:bg-gray-100 hover:text-primary-600" : "text-gray-300 cursor-not-allowed"}`}
                      title="恢复"
                    >
                      <ICONS.Redo className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {!isTableReadonly && (
                  <button
                    onClick={() => setIsTokenDialogOpen(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded transition-colors font-medium text-xs mr-2"
                  >
                    <ICONS.Settings className="w-4 h-4" /> 配置Token
                  </button>
                )}
                {!isTableReadonly && activeTable?.can_manage !== false && (
                  <button
                    onClick={() => setIsCollaboratorDialogOpen(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors font-medium text-xs"
                  >
                    <ICONS.Users className="w-4 h-4" /> 权限管理
                  </button>
                )}
              </div>
            </div>

            {/* Main View Area */}
            <div
              className="flex-1 overflow-hidden relative"
              id="tour-main-content"
            >
              {loading && (
                <div className="absolute inset-0 bg-white/50 z-50 flex items-center justify-center">
                  Loading...
                </div>
              )}
            {tables.length === 0 && !loading && !activeTable && (
                <div className="flex h-full w-full items-center justify-center">
                    {isTokenDialogOpen ? (
                      <TokenConfigDialog onClose={() => setIsTokenDialogOpen(false)} />
                    ) : (
                      <div className="text-center">
                        <h3 className="mb-4 text-gray-500">创建一个多维表格</h3>
                        <div className="flex items-center justify-center gap-4">
                          <button
                            onClick={handleOpenAddTableWithMetadata}
                            className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors font-medium"
                          >
                            立即新建表格
                          </button>
                           <button
                            onClick={() => setIsTokenDialogOpen(true)}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center gap-2"
                          >
                            <ICONS.Settings className="w-4 h-4" /> 配置Token
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
              )}
              {activeTable &&
                activeView &&
                activeView.type === ViewType.GRID && (
                  <GridView
                    readonly={isTableReadonly}
                    key={activeView.id}
                    tableId={activeTable.id}
                    columns={visibleColumns}
                    allColumns={activeTable.columns}
                    allTables={tables}
                    rows={rows}
                    totalCount={totalRowsCount}
                    groups={activeView.config?.groups}
                    rowHeight={activeView.config?.rowHeight}
                    rowHeights={activeView.config?.rowHeights}
                    colorRules={activeView.config?.colorRules}
                    onCellChange={handleCellChange}
                    onAddColumn={handleAddColumn}
                    cursors={cursors}
                    onCursorPositionChange={handleCursorPositionChange}
                    onEditColumn={(col, pos) => {
                      setEditingColumn(col);
                      setFieldConfigAnchor(pos || null);
                      setIsFieldDialogOpen(true);
                    }}
                    onAddRow={handleAddRow}
                    onDirectAddRow={handleDirectAddRow}
                    onBatchProcessRows={handleBatchProcessRows}
                    onAddSubRow={handleAddSubRow}
                    onInsertRow={handleInsertRow}
                    onDuplicateRow={handleDuplicateRow}
                    onDuplicateRows={handleDuplicateRows}
                    onDeleteRow={handleDeleteRow}
                    onDeleteRows={handleDeleteRows}
                    onMoveRow={handleMoveRow}
                    onOpenComment={handleOpenComment}
                    onOpenDetail={(row) => setActiveDetailRowId(row.id)}
                    onColumnResize={handleColumnResize}
                    onRowHeightChange={handleIndividualRowHeightChange}
                    onColumnUpdate={handleColumnUpdate}
                    onOptionChange={handleOptionChange}
                    commentCounts={commentCounts}
                    searchKeyword={rowSearchKeyword}
                    onRefresh={fetchRows}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    onLoadMore={() => fetchRows(page + 1)}
                    onSort={handleColumnSort}
                  />
                )}

              {activeTable &&
                activeView &&
                activeView.type === ViewType.KANBAN && (
                  <KanbanView
                    tableId={activeTable.id}
                    columns={visibleColumns}
                    allColumns={activeTable.columns}
                    rows={flattenedRowsForViews}
                    groupByFieldId={
                      activeView.config?.groups?.[0]?.column_id ||
                      activeView.config?.groupBy ||
                      visibleColumns[1]?.id ||
                      visibleColumns[0].id
                    }
                    onAddRow={handleAddRow}
                    onDirectAddRow={handleDirectAddRow}
                    onAddGroup={(colId, opt) =>
                      handleOptionChange(colId, "new", opt)
                    }
                    onOptionChange={handleOptionChange}
                    onCellChange={handleCellChange}
                    onInsertRow={handleInsertRow}
                    onDuplicateRow={handleDuplicateRow}
                    onDeleteRow={handleDeleteRow}
                    onOpenComment={handleOpenComment}
                    onOpenDetail={(row) => setActiveDetailRowId(row.id)}
                    commentCounts={commentCounts}
                    searchKeyword={rowSearchKeyword}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    onLoadMore={() => fetchRows(page + 1)}
                  />
                )}

              {activeTable &&
                activeView &&
                activeView.type === ViewType.CALENDAR && (
                  <CalendarView
                    tableId={activeTable.id}
                    columns={visibleColumns}
                    allColumns={activeTable.columns}
                    rows={flattenedRowsForViews}
                    dateFieldId={activeView.config?.dateField}
                    endDateFieldId={activeView.config?.endDateField}
                    titleFieldId={activeView.config?.titleField}
                    colorFieldId={activeView.config?.colorFieldId}
                    customColor={activeView.config?.customColor}
                    onAddRow={handleAddRow}
                    onDirectAddRow={handleDirectAddRow}
                    onCellChange={handleCellChange}
                    onDeleteRows={handleDeleteRows}
                    onOpenComment={handleOpenComment}
                    onOpenDetail={(row) => setActiveDetailRowId(row.id)}
                    commentCounts={commentCounts}
                    searchKeyword={rowSearchKeyword}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    onLoadMore={() => fetchRows(page + 1)}
                  />
                )}

              {activeTable &&
                activeView &&
                activeView.type === ViewType.GALLERY && (
                  <GalleryView
                    tableId={activeTable.id}
                    columns={visibleColumns}
                    allColumns={activeTable.columns}
                    rows={flattenedRowsForViews}
                    coverFieldId={activeView.config?.coverFieldId}
                    displayMode={activeView.config?.galleryStyle}
                    showFieldNames={activeView.config?.showFieldNames}
                    onAddRow={handleAddRow}
                    onDirectAddRow={handleDirectAddRow}
                    onCellChange={handleCellChange}
                    onInsertRow={handleInsertRow}
                    onDuplicateRow={handleDuplicateRow}
                    onDeleteRow={handleDeleteRow}
                    onOpenComment={handleOpenComment}
                    commentCounts={commentCounts}
                    searchKeyword={rowSearchKeyword}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    onLoadMore={() => fetchRows(page + 1)}
                  />
                )}

              {activeTable &&
                activeView &&
                activeView.type === ViewType.GANTT && (
                  <GanttView
                    tableId={activeTable.id}
                    columns={visibleColumns}
                    allColumns={activeTable.columns}
                    rows={rows}
                    dateFieldId={activeView.config?.dateField}
                    endDateFieldId={activeView.config?.endDateField}
                    titleFieldId={activeView.config?.titleField}
                    colorFieldId={activeView.config?.colorFieldId}
                    customColor={activeView.config?.customColor}
                    isWorkdayOnly={activeView.config?.isWorkdayOnly}
                    viewMode={activeView.config?.ganttViewMode || "month"}
                    onViewModeChange={(mode) =>
                      updateViewConfig({ ganttViewMode: mode })
                    }
                    onAddRow={handleAddRow}
                    onDirectAddRow={handleDirectAddRow}
                    onInsertRow={handleInsertRow}
                    onDeleteRows={handleDeleteRows}
                    onOpenComment={handleOpenComment}
                    onColumnResize={handleColumnResize}
                    onCellChange={handleCellChange}
                    onBatchCellChange={handleBatchCellChange}
                    onColumnUpdate={handleColumnUpdate}
                    onOpenDetail={(row) => setActiveDetailRowId(row.id)}
                    commentCounts={commentCounts}
                    searchKeyword={rowSearchKeyword}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    onLoadMore={() => fetchRows(page + 1)}
                  />
                )}

              {activeTable &&
                activeView &&
                activeView.type === ViewType.DASHBOARD && (
                  <DashboardView columns={activeTable.columns} rows={rows} />
                )}
            </div>
          </div>

          {/* Dialogs */}
          {isFieldDialogOpen && (
            <FieldConfigDialog
              tableId={activeTableId || ""}
              column={editingColumn || undefined}
              allColumns={activeTable?.columns}
              allTables={tables}
              isVisible={
                editingColumn
                  ? activeView?.config?.visibleColumns
                    ? activeView.config.visibleColumns.includes(
                        editingColumn.id,
                      )
                    : true
                  : true
              }
              anchorEl={fieldConfigAnchor}
              mode={fieldConfigAnchor ? "popover" : "modal"}
              onClose={() => {
                setIsFieldDialogOpen(false);
                setFieldConfigAnchor(null);
              }}
              onSave={handleSaveColumn}
              onDelete={handleDeleteColumn}
            />
          )}

          {isViewDialogOpen && (
            <ViewConfigDialog
              onClose={() => setIsViewDialogOpen(false)}
              onSave={handleCreateView}
            />
          )}

          {isTemplateDialogOpen && (
            <TemplateDialog
              initialTypeId={selectedTemplateTypeId}
              onClose={() => {
                setIsTemplateDialogOpen(false);
                setSelectedTemplateTypeId(undefined);
              }}
              onSelect={handleTemplateSelect}
            />
          )}

          {isImportDialogOpen && (
            <ImportDialog
              onClose={() => setIsImportDialogOpen(false)}
              onImport={handleImportTable}
            />
          )}

          {isAppendDialogOpen && activeTableId && activeTable && (
            <AppendDataDialog
              onClose={() => setIsAppendDialogOpen(false)}
              onImport={handleAppendTableData}
              targetTableId={activeTableId}
              targetTableName={activeTable.name || ""}
              existingMetadataValues={activeTable.metadata_values || []}
            />
          )}

          {commentDialogState && commentDialogState.isOpen && activeTable && (
            <CommentDialog
              comments={currentComments}
              rowName={
                rows.find((r) => r.id === commentDialogState.rowId)?.data[
                  activeTable.columns[0].id
                ] || "记录"
              }
              columnName={
                activeTable.columns.find(
                  (c) => c.id === commentDialogState.colId,
                )?.name || "字段"
              }
              onClose={() => {
                setCommentDialogState(null);
                setCurrentComments([]);
              }}
              onAdd={handleAddComment}
              onDelete={handleDeleteComment}
            />
          )}

          {isTokenDialogOpen && (
            <TokenConfigDialog onClose={() => setIsTokenDialogOpen(false)} />
          )}

          {isTableMetadataDialogOpen && (
            <TableMetadataDialog
              isOpen={isTableMetadataDialogOpen}
              onClose={() => setIsTableMetadataDialogOpen(false)}
              mode={tableMetadataMode}
              table={editingTableForMetadata}
              onSuccess={handleTableMetadataSuccess}
            />
          )}

          {isCollaboratorDialogOpen && activeTableId && (
            <CollaboratorDialog
              tableId={activeTableId}
              onClose={() => setIsCollaboratorDialogOpen(false)}
            />
          )}

          {confirmDialog && (
            <ConfirmDialog
              isOpen={confirmDialog.isOpen}
              title={confirmDialog.title}
              message={confirmDialog.message}
              onConfirm={confirmDialog.onConfirm}
              onCancel={() => setConfirmDialog(null)}
            />
          )}

          <OnboardingTour
            steps={tourSteps}
            isOpen={isTourOpen}
            onClose={() => {
              setIsTourOpen(false);
              localStorage.setItem("has_seen_onboarding_tour", "true");
            }}
          />

          {/* View Context Menu */}
          {viewContextMenu && (
            <div
              className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-[100] min-w-[140px] animate-in fade-in zoom-in-95 duration-100"
              style={{ top: viewContextMenu.y, left: viewContextMenu.x }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={() =>
                  handleViewRenameStart(
                    viewContextMenu.viewId,
                    activeTable?.views?.find(
                      (v) => v.id === viewContextMenu.viewId,
                    )?.name || "",
                  )
                }
                className="w-full text-left px-3 py-2 text-xs hover:bg-primary-50 hover:text-primary-600 flex items-center gap-2 text-gray-700"
              >
                <ICONS.Edit /> 重命名视图
              </button>
              <button
                onClick={() => handleCopyView(viewContextMenu.viewId)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-primary-50 hover:text-primary-600 flex items-center gap-2 text-gray-700"
              >
                <ICONS.Copy /> 复制视图
              </button>
              {(() => {
                const viewObj = activeTable?.views?.find(
                  (v) => v.id === viewContextMenu.viewId,
                );
                const isDefault = viewObj?.is_default;
                return !isDefault ? (
                  <button
                    onClick={() => handleSetDefaultView(viewContextMenu.viewId)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-primary-50 hover:text-primary-600 flex items-center gap-2 text-gray-700"
                  >
                    <svg className="w-3.5 h-3.5 text-yellow-500 fill-none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> 设为默认视图
                  </button>
                ) : (
                  <div className="w-full text-left px-3 py-2 text-xs text-gray-400 flex items-center gap-2 cursor-default font-medium">
                    <svg className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> 默认视图
                  </div>
                );
              })()}
              <div className="h-[1px] bg-gray-100 my-1"></div>
              <button
                onClick={() => {
                  handleDeleteView(viewContextMenu.viewId);
                  setViewContextMenu(null);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 hover:text-red-600 flex items-center gap-2 text-red-500"
              >
                <ICONS.Trash /> 删除视图
              </button>
            </div>
          )}

          {/* Menus Overlay Click Handler */}
          {(openMenu || viewContextMenu) && (
            <div
              className="fixed inset-0 z-40 bg-transparent"
              onClick={() => {
                setOpenMenu(null);
                setViewContextMenu(null);
              }}
            />
          )}

          {activeDetailRowId &&
            activeTable &&
            (() => {
              const row = findRowInTree(rows, activeDetailRowId);
              if (!row) return null;
              const flatIndex = flattenRows(rows).findIndex(
                (r) => r.id === activeDetailRowId,
              );
              const flatRowsArray = flattenRows(rows);
              const canPrev = flatIndex > 0;
              const canNext =
                flatIndex !== -1 && flatIndex < flatRowsArray.length - 1;

              return (
                <RowDetailPanel
                  tableId={activeTable.id}
                  row={row}
                  columns={activeTable.columns}
                  onClose={() => setActiveDetailRowId(null)}
                  onChange={(rowId, colId, val) =>
                    handleCellChange(rowId, colId, val)
                  }
                  onAddColumn={handleAddColumn}
                  canPrev={canPrev}
                  canNext={canNext}
                  onPrev={() =>
                    canPrev &&
                    setActiveDetailRowId(flatRowsArray[flatIndex - 1].id)
                  }
                  onNext={() =>
                    canNext &&
                    setActiveDetailRowId(flatRowsArray[flatIndex + 1].id)
                  }
                />
              );
            })()}

          {isCreatingNewRow && activeTable && (
            <RowDetailPanel
              tableId={activeTable.id}
              row={{ id: "new", data: newRowData } as any}
              columns={activeTable.columns}
              onClose={() => {
                setIsCreatingNewRow(false);
                setNewRowData({});
              }}
              onChange={(rowId, colId, val) => {
                setNewRowData((prev) => ({ ...prev, [colId]: val }));
              }}
              onConfirm={() => handleConfirmAddRow(newRowData)}
              isNew={true}
            />
          )}

           {/* Search Panel */}
          {isSearchOpen && activeView && (
              <motion.div
                drag
              dragConstraints={searchContainerRef}
                dragElastic={0.1}
                dragMomentum={false}
                dragControls={dragControls}
                dragListener={false}
              className="absolute top-4 right-4 z-40"
              >
                <div className="bg-white shadow-xl border border-gray-200 rounded-lg p-1.5 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div
                    className="cursor-move p-1"
                    onPointerDown={(e) => dragControls.start(e)}
                  >
                    <ICONS.Search className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    className="w-40 text-sm outline-none text-gray-700 placeholder-gray-400"
                    placeholder="查找..."
                    autoFocus
                    defaultValue={rowSearchKeyword}
                    onChange={(e) => handleRowSearch(e.target.value)}
                  />
                  <div className="h-4 w-[1px] bg-gray-200 mx-1"></div>
                  <span className="text-xs text-gray-400 whitespace-nowrap px-1">
                    {rowSearchKeyword ? `共 ${rows.length} 条` : "请输入关键字"}
                  </span>
                  <button
                    onClick={() => {
                      setIsSearchOpen(false);
                      setRowSearchKeyword("");
                      handleRowSearch("");
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors ml-1"
                  >
                    <ICONS.Close className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
          )}
        </div>
      </div>
      <style jsx global>{`
        .mdtable-scrollbar ::-webkit-scrollbar:horizontal {
          height: 10px !important;
        }
        .mdtable-scrollbar ::-webkit-scrollbar {
          height: 10px !important;
        }
      `}</style>
    </>
  );
};

export default App;
