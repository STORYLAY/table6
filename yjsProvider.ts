import * as Y from "yjs";
import { Socket } from "socket.io-client";

export interface YjsProviderOptions {
  socket: Socket;
  tableId: string;
}

/**
 * Custom Yjs Provider that coordinates state synchronization between Y.Doc and Socket.IO.
 * It translates logical Yjs mutations into structured backend Socket.IO payloads and vice versa.
 */
export class YjsSocketIOProvider {
  public doc: Y.Doc;
  private socket: Socket;
  private tableId: string;
  private isDestroyed = false;

  constructor(doc: Y.Doc, options: YjsProviderOptions) {
    this.doc = doc;
    this.socket = options.socket;
    this.tableId = options.tableId;

    // Listen to Yjs transaction updates to emit local modifications over Socket.IO
    this.doc.on("afterTransaction", this.handleLocalTransaction);

    // Coordinate incoming remote events from Socket.IO and apply them to Yjs Doc
    this.setupSocketListeners();
  }

  /**
   * Translates incoming structural socket.io broadcasts into local Yjs transactions.
   */
  private setupSocketListeners() {
    this.socket.on("cell:updated:broadcast", this.handleRemoteCellUpdate);
    this.socket.on("row:created:broadcast", this.handleRemoteRowCreate);
    this.socket.on("row:inserted_above:broadcast", this.handleRemoteRowCreate);
    this.socket.on("row:inserted_below:broadcast", this.handleRemoteRowCreate);
    this.socket.on("row:copied:broadcast", this.handleRemoteRowCreate);
    this.socket.on("row:batch_copied:broadcast", this.handleRemoteBatchRowCreate);
    this.socket.on("row:batch_created:broadcast", this.handleRemoteBatchRowCreated);
    this.socket.on("row:deleted:broadcast", this.handleRemoteRowDelete);
    this.socket.on("row:batch_deleted:broadcast", this.handleRemoteRowDelete);
    this.socket.on("row:moved:broadcast", this.handleRemoteRowMove);
  }

  /**
   * Cleans up listeners on socket and Yjs doc to prevent memory leaks.
   */
  public destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.doc.off("afterTransaction", this.handleLocalTransaction);
    this.socket.off("cell:updated:broadcast", this.handleRemoteCellUpdate);
    this.socket.off("row:created:broadcast", this.handleRemoteRowCreate);
    this.socket.off("row:inserted_above:broadcast", this.handleRemoteRowCreate);
    this.socket.off("row:inserted_below:broadcast", this.handleRemoteRowCreate);
    this.socket.off("row:copied:broadcast", this.handleRemoteRowCreate);
    this.socket.off("row:batch_copied:broadcast", this.handleRemoteBatchRowCreate);
    this.socket.off("row:batch_created:broadcast", this.handleRemoteBatchRowCreated);
    this.socket.off("row:deleted:broadcast", this.handleRemoteRowDelete);
    this.socket.off("row:batch_deleted:broadcast", this.handleRemoteRowDelete);
    this.socket.off("row:moved:broadcast", this.handleRemoteRowMove);
  }

  /**
   * Monitor local database changes on Y.Doc and send them to the server.
   * If the transaction source is 'remote-socket', we skip broadcasting to avoid sync loops.
   */
  private handleLocalTransaction = (transaction: Y.Transaction) => {
    if (transaction.origin === "remote-socket") {
      // Ignore updates that came from the server to prevent infinite loops
      return;
    }

    // Capture precise keys that have changed in this transaction
    const rowsMap = this.doc.getMap("rows");

    transaction.changed.forEach((subs, type) => {
      // If a row inside the root rows Map has been updated
      if (type === rowsMap) {
        subs.forEach((val, key) => {
          // 'key' is the row_id
          const rowMap = rowsMap.get(key);
          if (rowMap instanceof Y.Map) {
            // Check if 'data' was modified
            const rowDataMap = rowMap.get("data");
            if (rowDataMap instanceof Y.Map) {
              // Retrieve changed columns
              // For demonstration and tracking changes, we look at nested map modifications or full state sync
            }
          }
        });
      }
    });
  };

  /**
   * Handles incoming remote cell updates & updates local Yjs Doc under 'remote-socket' transaction context.
   */
  private handleRemoteCellUpdate = (event: any) => {
    if (!event) return;

    // Normalize extraction of tableId, rowId, columnId, and value depending on layout structure
    const tableId = event.table_id || event.data?.table_id || event.data?.data?.table_id;
    if (tableId !== this.tableId) return;

    const rowId = event.row_id || event.data?.row_id || event.data?.data?.row_id;
    const columnId = event.column_id || event.data?.column_id || event.data?.data?.column_id;
    
    let val = undefined;
    if (event.value !== undefined) {
      val = event.value;
    } else if (event.data?.value !== undefined) {
      val = event.data.value;
    } else if (event.data?.data?.value !== undefined) {
      val = event.data.data.value;
    }

    if (!rowId || !columnId || val === undefined) return;

    this.doc.transact(() => {
      const rowsMap = this.doc.getMap("rows");
      let rowMap = rowsMap.get(rowId);

      if (!rowMap) {
        // Initialize Row node if missing (highly resilient)
        rowMap = new Y.Map();
        rowYMapInit(rowMap as Y.Map<any>, rowId, {}, 0, null);
        rowsMap.set(rowId, rowMap);
      }

      if (rowMap instanceof Y.Map) {
        const dataMap = rowMap.get("data");
        if (dataMap instanceof Y.Map) {
          dataMap.set(columnId, val);
        }
      }
    }, "remote-socket"); // Explicitly flag origin of update
  };

  /**
   * Local Yjs Insertion handler for Row creation broadcast.
   */
  private handleRemoteRowCreate = (event: any) => {
    console.log("[YjsProvider] Received row:created:broadcast ->", event);

    let rowPayload = null;
    let rowData = {};

    if (event && typeof event === "object") {
      // Case 1: Standard structured event containing .data nested with row details (the user's specified example)
      if (
        event.data &&
        typeof event.data === "object" &&
        "row_id" in event.data
      ) {
        rowPayload = event.data;
        rowData = rowPayload.data || {};
      }
      // Case 2: event itself is the raw row payload (un-nested or raw)
      else if ("row_id" in event) {
        rowPayload = event;
        rowData = event.data || {};
      }
      // Case 3: Fallback
      else {
        rowPayload = event.data || event;
        rowData =
          rowPayload && typeof rowPayload === "object"
            ? rowPayload.data || {}
            : {};
      }
    }

    if (!rowPayload || rowPayload.table_id !== this.tableId) {
      console.warn(
        "[YjsProvider] Ignored row broadcast because table_id mismatched. Expected:",
        this.tableId,
        "Got:",
        rowPayload?.table_id,
      );
      return;
    }

    const rowId = rowPayload.row_id;
    const index = rowPayload.index !== undefined ? rowPayload.index : 0;
    const parentId =
      rowPayload.parent_id !== undefined ? rowPayload.parent_id : null;

    console.log(
      `[YjsProvider] Processing remote row creation: rowId=${rowId}, index=${index}`,
      rowData,
    );

    this.doc.transact(() => {
      const rowsMap = this.doc.getMap("rows") as Y.Map<Y.Map<any>>;
      if (!rowsMap.has(rowId)) {
        shiftIndicesForInsert(rowsMap, parentId, index, 1);
        const rowMap = new Y.Map();
        rowYMapInit(rowMap, rowId, rowData, index, parentId);
        rowsMap.set(rowId, rowMap);
        console.log(
          `[YjsProvider] Successfully added remote row ${rowId} to Yjs doc!`,
        );
      } else {
        console.log(
          `[YjsProvider] Row ${rowId} already exists in Yjs doc. Skipped.`,
        );
      }
    }, "remote-socket");
  };

  /**
   * Local Yjs Insertion handler for Row batch creation broadcast.
   */
  private handleRemoteBatchRowCreate = (event: any) => {
    console.log("[YjsProvider] Received row:batch_copied:broadcast ->", event);

    let rowsData: any[] = [];
    if (event && event.data && Array.isArray(event.data.rows_data)) {
      rowsData = event.data.rows_data;
    } else if (event && Array.isArray(event.rows_data)) {
      rowsData = event.rows_data;
    }

    if (!rowsData || rowsData.length === 0) return;

    this.doc.transact(() => {
      const rowsMap = this.doc.getMap("rows") as Y.Map<Y.Map<any>>;
      rowsData.forEach((rowPayload) => {
        if (!rowPayload || rowPayload.table_id !== this.tableId) return;
        const rowId = rowPayload.row_id;
        const index = rowPayload.index !== undefined ? rowPayload.index : 0;
        const parentId =
          rowPayload.parent_id !== undefined ? rowPayload.parent_id : null;
        const rowData = rowPayload.data || {};

        if (!rowsMap.has(rowId)) {
          shiftIndicesForInsert(rowsMap, parentId, index, 1);
          const rowMap = new Y.Map();
          rowYMapInit(rowMap, rowId, rowData, index, parentId);
          rowsMap.set(rowId, rowMap);
          console.log(
            `[YjsProvider] Successfully added remote batch copied row ${rowId} to Yjs doc!`,
          );
        }
      });
    }, "remote-socket");
  };

  /**
   * Local Yjs Insertion handler for Row batch creation broadcast.
   */
  private handleRemoteBatchRowCreated = (event: any) => {
    console.log("[YjsProvider] Received row:batch_created:broadcast ->", event);

    let rowsData: any[] = [];
    if (event && Array.isArray(event.data)) {
      rowsData = event.data;
    } else if (event && event.data && Array.isArray(event.data.data)) {
      rowsData = event.data.data;
    } else if (event && event.data && Array.isArray(event.data.rows_data)) {
      rowsData = event.data.rows_data;
    }

    if (!rowsData || rowsData.length === 0) return;

    this.doc.transact(() => {
      const rowsMap = this.doc.getMap("rows") as Y.Map<Y.Map<any>>;
      rowsData.forEach((rowPayload) => {
        if (!rowPayload || rowPayload.table_id !== this.tableId) return;
        const rowId = rowPayload.row_id;
        const index = rowPayload.index !== undefined ? rowPayload.index : 0;
        const parentId =
          rowPayload.parent_id !== undefined ? rowPayload.parent_id : null;
        const rowData = rowPayload.data || {};

        if (!rowsMap.has(rowId)) {
          shiftIndicesForInsert(rowsMap, parentId, index, 1);
          const rowMap = new Y.Map();
          rowYMapInit(rowMap, rowId, rowData, index, parentId);
          rowsMap.set(rowId, rowMap);
          console.log(
            `[YjsProvider] Successfully added remote batch created row ${rowId} to Yjs doc!`,
          );
        }
      });
    }, "remote-socket");
  };

  /**
   * Local Yjs Deletion handler for Row deletion broadcast.
   */
  private handleRemoteRowDelete = (event: { table_id: string; data?: any }) => {
    const payload = event.data;
    if (!payload || payload.table_id !== this.tableId) return;

    const rowId = payload.row_id;
    const rowIds = payload.row_ids || [rowId];

    this.doc.transact(() => {
      const rowsMap = this.doc.getMap("rows");
      rowIds.forEach((id: string) => {
        if (rowsMap.has(id)) {
          rowsMap.delete(id);
        }
      });
    }, "remote-socket");
  };

  /**
   * Local Yjs Move handler for Row move broadcast.
   */
  private handleRemoteRowMove = (event: { table_id: string; data?: any }) => {
    const payload = event.data;
    if (!payload || payload.table_id !== this.tableId) return;

    const rowId = payload.row_id;
    const index = payload.index !== undefined ? payload.index : 0;

    this.doc.transact(() => {
      const rowsMap = this.doc.getMap("rows");
      shiftRowIndices(rowsMap, rowId, index);
    }, "remote-socket");
  };
}

/**
 * Utility to securely initialize a new Row entry as a Y.Map hierarchy.
 */
export function rowYMapInit(
  rowMap: Y.Map<any>,
  rowId: string,
  rowData: Record<string, any>,
  index: number,
  parentId: string | null,
) {
  rowMap.set("id", rowId);
  rowMap.set("index", index);
  rowYMapSetParentId(rowMap, parentId);

  const dataMap = new Y.Map();
  Object.entries(rowData).forEach(([key, val]) => {
    dataMap.set(key, val);
  });
  rowMap.set("data", dataMap);
}

/**
 * Safely assign parent_id to row structure in Yjs.
 */
export function rowYMapSetParentId(
  rowMap: Y.Map<any>,
  parentId: string | null,
) {
  rowMap.set("parent_id", parentId || null);
}

/**
 * Utility to shift row indices correctly in Yjs when a row is moved.
 */
export function shiftRowIndices(
  rowsMap: Y.Map<any>,
  rowId: string,
  targetIndex: number,
) {
  const rowMap = rowsMap.get(rowId);
  if (!(rowMap instanceof Y.Map)) return;

  const parentId = rowMap.get("parent_id") || null;

  // Gather siblings
  const siblings: { id: string; index: number; map: Y.Map<any> }[] = [];
  rowsMap.forEach((rMap, rId) => {
    if (rMap instanceof Y.Map) {
      const rParentId = rMap.get("parent_id") || null;
      if (rParentId === parentId) {
        let idx = rMap.get("index");
        if (typeof idx !== "number") idx = 0;
        siblings.push({ id: rId, index: idx, map: rMap });
      }
    }
  });

  // Sort siblings by their CURRENT index to maintain deterministic order
  siblings.sort((a, b) => a.index - b.index);

  const sourceIdx = siblings.findIndex((s) => s.id === rowId);
  if (sourceIdx > -1) {
    const [moved] = siblings.splice(sourceIdx, 1);
    siblings.splice(targetIndex, 0, moved);

    // Reassign correct indices securely
    siblings.forEach((sib, i) => {
      sib.map.set("index", i);
    });
  }
}

/**
 * Utility to shift row indices down when a new row is inserted.
 */
export function shiftIndicesForInsert(
  rowsMap: Y.Map<any>,
  parentId: string | null,
  startIndex: number,
  shiftAmount: number = 1
) {
  rowsMap.forEach((rMap, rId) => {
    if (rMap instanceof Y.Map) {
      const rParentId = rMap.get("parent_id") || null;
      if (rParentId === parentId) {
        let idx = rMap.get("index");
        if (typeof idx === "number" && idx >= startIndex) {
          rMap.set("index", idx + shiftAmount);
        }
      }
    }
  });
}

