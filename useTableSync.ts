import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { Socket } from "socket.io-client";
import { Row, Table } from "./types";
import { socketManager } from "./services/socket";
import {
  YjsSocketIOProvider,
  rowYMapInit,
  rowYMapSetParentId,
  shiftRowIndices,
  shiftIndicesForInsert,
} from "./yjsProvider";

export interface UseTableSyncOptions {
  socket: Socket | null;
  tableId: string | null;
  initialRows: Row[];
  onRowsUpdated: (rows: Row[]) => void;
}

/**
 * React hook that binds Yjs document with Socket.IO to keep React state synchronised
 * dynamically with multiple users in real-time.
 */
export function useTableSync({
  socket,
  tableId,
  initialRows,
  onRowsUpdated,
}: UseTableSyncOptions) {
  const [doc, setDoc] = useState(() => new Y.Doc());
  const providerRef = useRef<YjsSocketIOProvider | null>(null);
  const isInitializingRef = useRef(false);
  const onRowsUpdatedRef = useRef(onRowsUpdated);

  useEffect(() => {
    onRowsUpdatedRef.current = onRowsUpdated;
  }, [onRowsUpdated]);

  // When table changes, create a new document
  useEffect(() => {
    setDoc(new Y.Doc());
    isInitializingRef.current = false;
  }, [tableId]);

  // Synchronize Yjs state back to React Rows state
  const syncToReactState = useCallback(() => {
    const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
    const result: Row[] = [];

    rowsMap.forEach((rowMap, rowId) => {
      if (rowMap instanceof Y.Map) {
        const id = rowMap.get("id") || rowId;
        const index =
          rowMap.get("index") !== undefined ? rowMap.get("index") : 0;
        const parentId = rowMap.get("parent_id") || null;

        const dataMap = rowMap.get("data");
        const data: Record<string, any> = {};

        if (dataMap instanceof Y.Map) {
          dataMap.forEach((val, key) => {
            if (val && typeof val === "object" && typeof (val as any).toJSON === "function") {
              data[key] = (val as any).toJSON();
            } else {
              data[key] = val;
            }
          });
        }

        result.push({
          id,
          index,
          parent_id: parentId,
          data,
        });
      }
    });

    // Sort by row index to maintain the order in the spreadsheet view
    const sortedRows = result.sort((a, b) => (a.index || 0) - (b.index || 0));
    onRowsUpdatedRef.current(sortedRows);
  }, [doc]);

  // Hook up Socket.IO + Yjs Provider link when socket & tableId are loaded
  useEffect(() => {
    if (!socket || !tableId) return;

    console.log(`[Sync] Initiating state sync for Table: ${tableId}`);

    // Create connection provider bridge
    const provider = new YjsSocketIOProvider(doc, { socket, tableId });
    providerRef.current = provider;

    // Listen to changes on Yjs rowsMap
    const rowsMap = doc.getMap("rows");
    const observeDeep = () => {
      syncToReactState();
    };
    rowsMap.observeDeep(observeDeep);

    // Unmount cleanup
    return () => {
      rowsMap.unobserveDeep(observeDeep);
      provider.destroy();
      providerRef.current = null;
    };
  }, [socket, tableId, doc, syncToReactState]);

  // Sync initial rows when table loads for the first time or updates dynamically (e.g. via REST/Undo/Redo)
  useEffect(() => {
    if (!tableId || initialRows.length === 0 || isInitializingRef.current)
      return;

    const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
    let newlySeeded = false;

    isInitializingRef.current = true;

    try {
      doc.transact(() => {
        // 1. Synchronize row deletions
        const activeIds = new Set(initialRows.map((r) => r.id));
        rowsMap.forEach((_, rowId) => {
          if (!activeIds.has(rowId)) {
            rowsMap.delete(rowId);
            newlySeeded = true;
          }
        });

        // 2. Synchronize additions & updates
        initialRows.forEach((row) => {
          if (!rowsMap.has(row.id)) {
            const rowYMap = new Y.Map();
            rowYMapInit(
              rowYMap,
              row.id,
              row.data,
              row.index || 0,
              row.parent_id || null,
            );
            rowsMap.set(row.id, rowYMap);
            newlySeeded = true;
          } else {
            // Row exists. Compare and update fields, index, and parent_id
            const rowYMap = rowsMap.get(row.id);
            if (rowYMap instanceof Y.Map) {
              let rowChanged = false;

              // Sync index
              if (rowYMap.get("index") !== row.index) {
                rowYMap.set("index", row.index ?? 0);
                rowChanged = true;
              }

              // Sync parent_id
              if (rowYMap.get("parent_id") !== row.parent_id) {
                rowYMap.set("parent_id", row.parent_id || null);
                rowChanged = true;
              }

              // Sync data values
              const dataYMap = rowYMap.get("data");
              if (dataYMap instanceof Y.Map) {
                Object.entries(row.data || {}).forEach(([colId, val]) => {
                  const currentYVal = dataYMap.get(colId);
                  const isDiff =
                    typeof val === "object" && val !== null
                      ? JSON.stringify(val) !== JSON.stringify(currentYVal)
                      : currentYVal !== val;

                  if (isDiff) {
                    dataYMap.set(colId, val);
                    rowChanged = true;
                  }
                });

                // Clean up keys deleted from the React side
                dataYMap.forEach((_, colId) => {
                  if (row.data && !(colId in row.data)) {
                    dataYMap.delete(colId);
                    rowChanged = true;
                  }
                });
              }

              if (rowChanged) {
                newlySeeded = true;
              }
            }
          }
        });
      }, "local-initial-seed");
    } finally {
      isInitializingRef.current = false;
    }

    isInitializingRef.current = false;
    
    if (newlySeeded) {
      syncToReactState();
    }
  }, [tableId, initialRows, doc, syncToReactState]);

  const emitWithAckQueue = useCallback(
    (
      eventName: string,
      payload: any,
      ackEventName: string,
      callback: (response: any) => void
    ) => {
      if (!socket) return;
      
      // Store the callback in a global queue attached to the socket object directly
      // to survive component re-renders
      const socketAny = socket as any;
      if (!socketAny._ackQueues) socketAny._ackQueues = {};
      if (!socketAny._ackQueues[ackEventName]) {
        socketAny._ackQueues[ackEventName] = [];
        socket.on(ackEventName, (response: any) => {
          const cb = socketAny._ackQueues[ackEventName].shift();
          if (cb) cb(response);
        });
      }
      
      socketAny._ackQueues[ackEventName].push(callback);
      socket.emit(eventName, payload);
    },
    [socket]
  );

  /**
   * Action: Update a cell value collaboratively.
   * Optimistically updates local Yjs Doc and broadcasts event to peers/server.
   */
  const updateCell = useCallback(
    (rowId: string, columnId: string, value: any) => {
      if (!tableId || !socket) return;

      // 1. Optimistic update in local Yjs Store
      doc.transact(() => {
        const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
        let rowMap = rowsMap.get(rowId);

        if (!rowMap) {
          rowYMapInit((rowMap = new Y.Map()), rowId, {}, 0, null);
          rowsMap.set(rowId, rowMap);
        }

        const dataMap = rowMap.get("data");
        if (dataMap instanceof Y.Map) {
          dataMap.set(columnId, value);
        }
      }, "local-mutation");

      // 2. Transmit to server to apply DB modification & propagate broadcast
      emitWithAckQueue(
        "cell:update",
        {
          table_id: tableId,
          row_id: rowId,
          column_id: columnId,
          value: value,
        },
        "cell:update:ack",
        (response: any) => {
        // Broadcast the cell update since server doesn't do it automatically
        const targetRoom = socketManager.getJoinedRoom(tableId);
        
        let broadcastData = response?.data;
        if (!broadcastData || !broadcastData.data) {
          broadcastData = {
            data: {
              account_id: response?.data?.data?.account_id || "",
              table_id: tableId,
              row_id: rowId,
              column_id: columnId,
              cell_id: response?.data?.data?.cell_id || "",
              value: value,
              created_at: response?.data?.data?.created_at || new Date().toISOString(),
              updated_at: response?.data?.data?.updated_at || new Date().toISOString(),
            }
          };
        }

        socket.emit("cell:updated:broadcast", {
          room: targetRoom,
          success: response?.success ?? true,
          data: broadcastData,
          action: "update"
        });
      });
    },
    [tableId, socket, doc, emitWithAckQueue]
  );

  const updateCellLocal = useCallback(
    (rowId: string, columnId: string, value: any) => {
      doc.transact(() => {
        const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
        let rowMap = rowsMap.get(rowId);

        if (!rowMap) {
          rowYMapInit((rowMap = new Y.Map()), rowId, {}, 0, null);
          rowsMap.set(rowId, rowMap);
        }

        const dataMap = rowMap.get("data");
        if (dataMap instanceof Y.Map) {
          dataMap.set(columnId, value);
        }
      }, "local-mutation");
    },
    [doc]
  );

  const createRowQueueRef = useRef<Array<(res: any) => void>>([]);

  useEffect(() => {
    if (!socket) return;
    const handleCreateAck = (response: any) => {
      const resolver = createRowQueueRef.current.shift();
      if (resolver) resolver(response);
    };
    socket.on("row:create:ack", handleCreateAck);
    return () => {
      socket.off("row:create:ack", handleCreateAck);
    };
  }, [socket]);

  /**
   * Action: Create a new row.
   */
  const createRow = useCallback(
    (
      rowData: Record<string, any>,
      index: number,
      parentId: string | null = null,
      onAck?: (row: any) => void,
    ) => {
      if (!tableId || !socket) return;

      emitWithAckQueue(
        "row:create",
        {
          table_id: tableId,
          row_data: {
            data: rowData,
            index,
            parent_id: parentId,
          },
        },
        "row:create:ack",
        (response: any) => {
        if (response && response.success && response.data) {
          const newRowId = response.data.row_id;


          doc.transact(() => {
            const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
            if (!rowsMap.has(newRowId)) {
              shiftIndicesForInsert(rowsMap, response.data.parent_id || parentId || null, response.data.index ?? index, 1);
              const rowYMap = new Y.Map();
              rowYMapInit(
                rowYMap,
                newRowId,
                response.data.data || rowData,
                response.data.index ?? index,
                response.data.parent_id || parentId,
              );
              rowsMap.set(newRowId, rowYMap);
            }
          }, "local-mutation");

          // Broadcast the response exactly as expected by the server
          const targetRoom = socketManager.getJoinedRoom(tableId);
          socket.emit("row:created:broadcast", {
            room: targetRoom,
            success: response.success ?? true,
            data: {
              account_id: response.data?.account_id ?? "",
              table_id: response.data?.table_id ?? tableId,
              row_id: response.data?.row_id ?? newRowId,
              parent_id:
                response.data?.parent_id !== undefined
                  ? response.data.parent_id
                  : parentId,
              data: response.data?.data ?? rowData,
              index:
                response.data?.index !== undefined
                  ? response.data.index
                  : index,
              created_at: response.data?.created_at ?? new Date().toISOString(),
              updated_at: response.data?.updated_at ?? new Date().toISOString(),
            },
            action: response.action ?? "create",
            total: response.total ?? 0,
          });

          if (onAck) onAck(response.data);
        }
      });
    },
    [tableId, socket, doc, emitWithAckQueue],
  );

  /**
   * Action: Insert a row above (collaborative).
   */
  const insertRowAbove = useCallback(
    (
      rowData: Record<string, any>,
      index: number,
      parentId: string | null = null,
      onAck?: (row: any) => void,
    ) => {
      if (!tableId || !socket) return;

      emitWithAckQueue(
        "row:insert_above",
        {
          table_id: tableId,
          row_data: {
            data: rowData,
            index,
          },
        },
        "row:insert_above:ack",
        (response: any) => {
        if (response && response.success && response.data) {
          const newRowId = response.data.row_id;

          doc.transact(() => {
            const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
            if (!rowsMap.has(newRowId)) {
              shiftIndicesForInsert(rowsMap, response.data.parent_id || parentId || null, response.data.index ?? index, 1);
              const rowYMap = new Y.Map();
              rowYMapInit(
                rowYMap,
                newRowId,
                response.data.data || rowData,
                response.data.index ?? index,
                response.data.parent_id || parentId,
              );
              rowsMap.set(newRowId, rowYMap);
            }
          }, "local-mutation");

          // Broadcast the response exactly as expected by the server
          const targetRoom = socketManager.getJoinedRoom(tableId);
          socket.emit("row:inserted_above:broadcast", {
            room: targetRoom,
            success: response.success ?? true,
            data: {
              account_id: response.data?.account_id ?? "",
              table_id: response.data?.table_id ?? tableId,
              row_id: response.data?.row_id ?? newRowId,
              parent_id:
                response.data?.parent_id !== undefined
                  ? response.data.parent_id
                  : parentId,
              data: response.data?.data ?? rowData,
              index:
                response.data?.index !== undefined
                  ? response.data.index
                  : index,
              created_at: response.data?.created_at ?? new Date().toISOString(),
              updated_at: response.data?.updated_at ?? new Date().toISOString(),
            },
            action: "insert_above",
            total: response.total ?? 0,
          });

          if (onAck) onAck(response.data);
        }
      });
    },
    [tableId, socket, doc, emitWithAckQueue],
  );

  /**
   * Action: Insert a row below (collaborative).
   */
  const insertRowBelow = useCallback(
    (
      rowData: Record<string, any>,
      index: number,
      parentId: string | null = null,
      onAck?: (row: any) => void,
    ) => {
      if (!tableId || !socket) return;

      emitWithAckQueue(
        "row:insert_below",
        {
          table_id: tableId,
          row_data: {
            data: rowData,
            index,
          },
        },
        "row:insert_below:ack",
        (response: any) => {
        if (response && response.success && response.data) {
          const newRowId = response.data.row_id;

          doc.transact(() => {
            const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
            if (!rowsMap.has(newRowId)) {
              shiftIndicesForInsert(rowsMap, response.data.parent_id || parentId || null, response.data.index ?? index, 1);
              const rowYMap = new Y.Map();
              rowYMapInit(
                rowYMap,
                newRowId,
                response.data.data || rowData,
                response.data.index ?? index,
                response.data.parent_id || parentId,
              );
              rowsMap.set(newRowId, rowYMap);
            }
          }, "local-mutation");

          const targetRoom = socketManager.getJoinedRoom(tableId);
          socket.emit("row:inserted_below:broadcast", {
            room: targetRoom,
            success: response.success ?? true,
            data: {
              account_id: response.data?.account_id ?? "",
              table_id: response.data?.table_id ?? tableId,
              row_id: response.data?.row_id ?? newRowId,
              parent_id:
                response.data?.parent_id !== undefined
                  ? response.data.parent_id
                  : parentId,
              data: response.data?.data ?? rowData,
              index:
                response.data?.index !== undefined
                  ? response.data.index
                  : index,
              created_at: response.data?.created_at ?? new Date().toISOString(),
              updated_at: response.data?.updated_at ?? new Date().toISOString(),
            },
            action: "insert_below",
            total: response.total ?? 0,
          });

          if (onAck) onAck(response.data);
        }
      });
    },
    [tableId, socket, doc, emitWithAckQueue],
  );

  /**
   * Action: Duplicate a row.
   */
  const duplicateRow = useCallback(
    (rowId: string, onAck?: (row: any) => void) => {
      if (!tableId || !socket) return;

      emitWithAckQueue(
        "row:copy",
        {
          table_id: tableId,
          row_id: rowId,
        },
        "row:copy:ack",
        (response: any) => {
        if (response && response.success && response.data) {
          const newRowId = response.data.row_id;
          const index = response.data.index ?? 0;

          doc.transact(() => {
            const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
            if (!rowsMap.has(newRowId)) {
              shiftIndicesForInsert(rowsMap, response.data.parent_id || null, index, 1);
              const rowYMap = new Y.Map();
              rowYMapInit(
                rowYMap,
                newRowId,
                response.data.data || {},
                index,
                response.data.parent_id || null,
              );
              rowsMap.set(newRowId, rowYMap);
            }
          }, "local-mutation");

          const targetRoom = socketManager.getJoinedRoom(tableId);
          socket.emit("row:copied:broadcast", {
            room: targetRoom,
            success: response.success ?? true,
            data: {
              account_id: response.data?.account_id ?? "",
              table_id: response.data?.table_id ?? tableId,
              row_id: response.data?.row_id ?? newRowId,
              parent_id: response.data?.parent_id || null,
              data: response.data?.data || {},
              index: index,
              created_at: response.data?.created_at ?? new Date().toISOString(),
              updated_at: response.data?.updated_at ?? new Date().toISOString(),
            },
            action: "copy",
            total: response.total ?? 0,
          });

          if (onAck) onAck(response.data);
        }
      });
    },
    [tableId, socket, doc, emitWithAckQueue],
  );

  /**
   * Action: Batch Duplicate rows.
   */
  const batchDuplicateRows = useCallback(
    (rowIds: string[], onAck?: (rowsData: any[]) => void) => {
      if (!tableId || !socket) return;

      emitWithAckQueue(
        "row:batch_copy",
        {
          table_id: tableId,
          row_ids: rowIds,
        },
        "row:batch_copy:ack",
        (response: any) => {
        if (response && response.success && response.data && Array.isArray(response.data.rows_data)) {
          const rowsData = response.data.rows_data;

          doc.transact(() => {
            const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
            rowsData.forEach((rowPayload: any) => {
              const newRowId = rowPayload.row_id;
              const index = rowPayload.index ?? 0;
              if (!rowsMap.has(newRowId)) {
                shiftIndicesForInsert(rowsMap, rowPayload.parent_id || null, index, 1);
                const rowYMap = new Y.Map();
                rowYMapInit(
                  rowYMap,
                  newRowId,
                  rowPayload.data || {},
                  index,
                  rowPayload.parent_id || null,
                );
                rowsMap.set(newRowId, rowYMap);
              }
            });
          }, "local-mutation");

          const targetRoom = socketManager.getJoinedRoom(tableId);
          socket.emit("row:batch_copied:broadcast", {
            room: targetRoom,
            success: response.success ?? true,
            data: {
              account_id: response.data?.account_id ?? "",
              table_id: response.data?.table_id ?? tableId,
              rows_data: rowsData.map((rowPayload: any) => ({
                account_id: rowPayload.account_id ?? "",
                table_id: rowPayload.table_id ?? tableId,
                row_id: rowPayload.row_id ?? "",
                parent_id: rowPayload.parent_id || null,
                data: rowPayload.data || {},
                index: rowPayload.index ?? 0,
                created_at: rowPayload.created_at ?? new Date().toISOString(),
                updated_at: rowPayload.updated_at ?? new Date().toISOString(),
              })),
            },
            action: "batch_copy",
            total: response.total ?? 0,
          });

          if (onAck) onAck(rowsData);
        }
      });
    },
    [tableId, socket, doc, emitWithAckQueue],
  );

  /**
   * Action: Batch Create rows.
   */
  const batchCreateRows = useCallback(
    (
      rowsPayload: Array<{ data: Record<string, any>; index: number | null; parent_id?: string | null }>,
      onAck?: (rowsData: any[]) => void,
    ) => {
      if (!tableId || !socket) return;

      emitWithAckQueue(
        "row:batch_create",
        {
          table_id: tableId,
          rows_data: rowsPayload,
        },
        "row:batch_create:ack",
        (response: any) => {
          let returnedRows: any[] = [];
          if (response && response.success) {
            if (Array.isArray(response.data)) {
              returnedRows = response.data;
            } else if (response.data && Array.isArray(response.data.data)) {
              returnedRows = response.data.data;
            } else if (response.data && Array.isArray(response.data.rows_data)) {
              returnedRows = response.data.rows_data;
            }
          }

          if (returnedRows.length > 0) {
            doc.transact(() => {
              const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
              returnedRows.forEach((rowPayload: any) => {
                const newRowId = rowPayload.row_id;
                const index = rowPayload.index ?? 0;
                if (!rowsMap.has(newRowId)) {
                  shiftIndicesForInsert(rowsMap, rowPayload.parent_id || null, index, 1);
                  const rowYMap = new Y.Map();
                  rowYMapInit(
                    rowYMap,
                    newRowId,
                    rowPayload.data || {},
                    index,
                    rowPayload.parent_id || null,
                  );
                  rowsMap.set(newRowId, rowYMap);
                }
              });
            }, "local-mutation");

            const targetRoom = socketManager.getJoinedRoom(tableId);
            socket.emit("row:batch_created:broadcast", {
              room: targetRoom,
              success: response.success ?? true,
              data: returnedRows.map((rowPayload: any) => ({
                account_id: rowPayload.account_id ?? "",
                table_id: rowPayload.table_id ?? tableId,
                row_id: rowPayload.row_id ?? "",
                parent_id: rowPayload.parent_id || null,
                data: rowPayload.data || {},
                index: rowPayload.index ?? 0,
                created_at: rowPayload.created_at ?? new Date().toISOString(),
                updated_at: rowPayload.updated_at ?? new Date().toISOString(),
              })),
              action: "batch_create",
              total: response.total ?? 0,
            });

            if (onAck) onAck(returnedRows);
          }
        }
      );
    },
    [tableId, socket, doc, emitWithAckQueue]
  );

  /**
   * Action: Delete a row.
   */
  const deleteRow = useCallback(
    (rowId: string) => {
      if (!tableId || !socket) return;

      doc.transact(() => {
        const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
        if (rowsMap.has(rowId)) {
          rowsMap.delete(rowId);
        }
      }, "local-mutation");

      emitWithAckQueue(
        "row:delete",
        {
          table_id: tableId,
          row_id: rowId,
        },
        "row:delete:ack",
        (response: any) => {
        const targetRoom = socketManager.getJoinedRoom(tableId);
        socket.emit("row:deleted:broadcast", {
          room: targetRoom,
          success: response.success ?? true,
          data: {
            account_id: response.data?.account_id ?? "",
            table_id: response.data?.table_id ?? tableId,
            row_id: response.data?.row_id ?? rowId,
          },
          total: response.total ?? 0,
          action: "delete",
        });
      });
    },
    [tableId, socket, doc, emitWithAckQueue],
  );

  /**
   * Action: Batch Delete rows.
   */
  const batchDeleteRows = useCallback(
    (rowIds: string[]) => {
      if (!tableId || !socket) return;

      doc.transact(() => {
        const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
        rowIds.forEach((id) => {
          if (rowsMap.has(id)) {
            rowsMap.delete(id);
          }
        });
      }, "local-mutation");

      emitWithAckQueue(
        "row:batch_delete",
        {
          table_id: tableId,
          row_ids: rowIds,
        },
        "row:batch_delete:ack",
        (response: any) => {
        const targetRoom = socketManager.getJoinedRoom(tableId);
        socket.emit("row:batch_deleted:broadcast", {
          room: targetRoom,
          success: response.success ?? true,
          data: {
            account_id: response.data?.account_id ?? "",
            table_id: response.data?.table_id ?? tableId,
            row_ids: response.data?.row_ids ?? rowIds,
          },
          total: response.total ?? 0,
          action: "batch_delete",
        });
      });
    },
    [tableId, socket, doc, emitWithAckQueue],
  );

  /**
   * Action: Move a row's slot.
   */
  const moveRow = useCallback(
    (rowId: string, targetIndex: number) => {
      if (!tableId || !socket) return;

      doc.transact(() => {
        const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
        shiftRowIndices(rowsMap, rowId, targetIndex);
      }, "local-mutation");

      emitWithAckQueue(
        "row:move",
        {
          table_id: tableId,
          row_id: rowId,
          target_index: targetIndex,
        },
        "row:move:ack",
        (response: any) => {
        const actualIndex = response.data?.index;
        // Correct optimistic update with actual backend index if they differ
        if (typeof actualIndex === "number" && actualIndex !== targetIndex) {
          doc.transact(() => {
            const rowsMap = doc.getMap("rows") as Y.Map<Y.Map<any>>;
            shiftRowIndices(rowsMap, rowId, actualIndex);
          }, "local-mutation");
        }

        const targetRoom = socketManager.getJoinedRoom(tableId);
        socket.emit("row:moved:broadcast", {
          room: targetRoom,
          success: response.success ?? true,
          data: {
            account_id: response.data?.account_id ?? "",
            table_id: response.data?.table_id ?? tableId,
            row_id: response.data?.row_id ?? rowId,
            index: actualIndex ?? targetIndex,
          },
          total: response.total ?? 0,
          action: "move",
        });
      });
    },
    [tableId, socket, doc, emitWithAckQueue],
  );

  return {
    doc,
    updateCell,
    updateCellLocal,
    createRow,
    insertRowAbove,
    insertRowBelow,
    duplicateRow,
    batchDuplicateRows,
    batchCreateRows,
    deleteRow,
    batchDeleteRows,
    moveRow,
  };
}
