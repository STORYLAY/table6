import { io, Socket } from "socket.io-client";
// import {getRequestURL} from "@/utils";

// const DEFAULT_SOCKET_URL = getRequestURL()
const DEFAULT_SOCKET_URL = "http://192.168.1.201:5005";
const DEFAULT_NAMESPACE = "/ws/multi/dimensional/tables";

export interface RoomUserInfo {
  account_id: string;
  tenant_id: string;
  sid: string;
  name: string;
  email: string;
  phone: string;
  real_name: string;
  avatar_url?: string;
  avatar?: string;
}

export interface JoinRoomResponse {
  success: boolean;
  room: string;
  users?: RoomUserInfo[];
}

export interface UsersUpdatedPayload {
  room: string;
  users: RoomUserInfo[];
}

/**
 * SocketManager Class encapsulates the connection lifecycle,
 * namespace management, and event-handling wrapper functions for Socket.IO.
 */
export class SocketManager {
  private socket: Socket | null = null;
  private url: string;
  private namespace: string;
  private roomOpQueue: Promise<any> = Promise.resolve();
  private activeRooms = new Map<string, string>();

  public queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.roomOpQueue.then(operation);
    this.roomOpQueue = task.catch(() => {});
    return task;
  }

  constructor(url = DEFAULT_SOCKET_URL, namespace = DEFAULT_NAMESPACE) {
    this.url = url;
    this.namespace = namespace;
  }

  /**
   * Retrieves cached server room name string for a given tableId.
   */
  public getJoinedRoom(tableId: string): string {
    return this.activeRooms.get(tableId) || tableId;
  }

  /**
   * Initializes and establishes the Socket.IO connection.
   */
  public connect(token?: string): Socket {
    const serverUrl =
      localStorage.getItem("socket_server_url") || DEFAULT_SOCKET_URL;
    const currentToken =
      token || localStorage.getItem("console_token") || "guest";
    const connectionUrl = `${serverUrl}${this.namespace}`;

    let needsNewConnection = false;

    if (this.socket) {
      const oldToken = (this.socket.auth as any)?.token || (this.socket.io?.opts?.query as any)?.token;
      const oldUrl = (this.socket as any).io?.uri || "";
      
      // Reconnect if the credentials or server URL changed radically
      if (oldToken !== currentToken || (oldUrl && !oldUrl.includes(serverUrl))) {
        console.log("[Socket] Token or URL changed. Reconnecting and dropping old socket...");
        this.socket.disconnect();
        needsNewConnection = true;
      } else {
        if (!this.socket.connected) {
          this.socket.connect();
        }
        return this.socket;
      }
    } else {
      needsNewConnection = true;
    }

    if (needsNewConnection) {
      console.log(`[Socket] Connecting to ${connectionUrl}...`);

      this.socket = io(connectionUrl, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        auth: {
          token: currentToken,
        },
        query: {
          token: currentToken,
        },
      });

      this.setupDiagnosticListeners();
    }

    return this.socket!;
  }

  /**
   * Diagnostic loggers for WebSocket testing and troubleshooting.
   */
  private setupDiagnosticListeners() {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log(`[Socket] Connected successfully. SID: ${this.socket?.id}`);
    });

    this.socket.on("connect_error", (error: any) => {
      console.error("[Socket] Connection failed:", error.message);

      const isAuthError =
        error.message?.toLowerCase().includes("auth") ||
        error.message?.toLowerCase().includes("401") ||
        error.message?.toLowerCase().includes("unauthorized") ||
        error.data?.status === 401 ||
        (error.message && error.message.indexOf("401") > -1);

      if (isAuthError) {
        // Prompt the user directly in the UI if we encounter unauthorized access
        const currentToken = localStorage.getItem("console_token") || "";
        const newToken = prompt(
          "【同步服务器 401 鉴权失效】\n请输入您的 Console API Token 进行连接，或在右上角「配置Token」中配置：",
          currentToken,
        );

        if (newToken !== null) {
          const trimmedToken = newToken.trim();
          if (trimmedToken) {
            localStorage.setItem("console_token", trimmedToken);
            if (this.socket) {
              this.socket.auth = { token: trimmedToken };
              if (this.socket.io && this.socket.io.opts) {
                this.socket.io.opts.query = { token: trimmedToken };
              }
              this.socket.connect();
            }
          }
        }

        // Emit custom event to trigger beautiful React config dialog display
        window.dispatchEvent(new CustomEvent("open-token-config"));
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.warn("[Socket] Disconnected from workspace. Reason:", reason);
    });

    this.socket.on("reconnect_attempt", (attempt) => {
      console.info(`[Socket] Reconnection attempt #${attempt}`);
    });
  }

  /**
   * Requests joining a table's specific synchronization room via Socket.IO.
   */
  public joinRoom(tableId: string): Promise<JoinRoomResponse> {
    return new Promise<JoinRoomResponse>((resolve, reject) => {
      const socket = this.getSocket();

      // Hear acknowledgment back
      socket.once("room:join:ack", (response: JoinRoomResponse) => {
        console.log("[Socket] Received room:join:ack:", response);
        if (response && response.success) {
          console.log(`[Socket] Joined table room: ${response.room}`);
          this.activeRooms.set(tableId, response.room);
          resolve(response);
        } else {
          console.error("[Socket] Failed to join room:", response);
          window.dispatchEvent(new CustomEvent("open-token-config"));
          reject(new Error(`Failed to join room for table ID: ${tableId}`));
        }
      });

      const doJoin = () => {
        console.log(`[Socket] Sending room:join for ${tableId}`);
        socket.emit("room:join", { table_id: tableId });
      };

      if (!socket.connected) {
        console.warn(
          "[Socket] Waiting for connection before executing room:join...",
        );
        socket.once("connect", doJoin);
      } else {
        doJoin();
      }

      // Handle accidental timeout to avoid hanging UI
      setTimeout(() => {
        console.warn(
          `[Socket] room:join timeout on table ID ${tableId}. Retrying or falling back gracefully.`,
        );
        reject(
          new Error(
            `Failed to join room for table ID: ${tableId}. Request timed out.`,
          ),
        );
      }, 10000);
    });
  }

  /**
   * Requests leaving a table's specific synchronization room.
   */
  public leaveRoom(tableId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = this.getSocket();
      if (!socket.connected) {
        return resolve();
      }
      socket.once("room:leave:ack", () => {
        console.log(`[Socket] Left room for table ID: ${tableId}`);
        this.activeRooms.delete(tableId);
        resolve();
      });

      socket.emit("room:leave", { table_id: tableId });

      setTimeout(() => resolve(), 1500); // Fail-safe fallback if server misses ack
    });
  }

  /**
   * Forces fetching latest list of active online users in a table room.
   */
  public getRoomUsers(
    tableId: string,
  ): Promise<{ success: boolean; table_id: string; users: RoomUserInfo[] }> {
    return new Promise<{
      success: boolean;
      table_id: string;
      users: RoomUserInfo[];
    }>((resolve, reject) => {
      const socket = this.getSocket();
      if (!socket.connected) {
        return reject(new Error("Socket disconnected"));
      }
      socket.once(
        "room:get_users:ack",
        (response: {
          success: boolean;
          table_id: string;
          users: RoomUserInfo[];
        }) => {
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error("Failed to retrieve room users"));
          }
        },
      );

      socket.emit("room:get_users", { table_id: tableId });

      setTimeout(() => reject(new Error("Get room users timed out")), 5000);
    });
  }

  /**
   * Sends cell content/value updates to the room.
   */
  public updateCell(payload: {
    table_id: string;
    row_id: string;
    column_id: string;
    value: any;
  }) {
    const socket = this.getSocket();
    socket.emit("cell:update", payload);
  }

  /**
   * Emits Row changes to trigger server broad-sync.
   */
  public createRow(
    tableId: string,
    rowData: any,
    index: number | null = null,
    parentId: string | null = null,
  ) {
    const socket = this.getSocket();
    socket.emit("row:create", {
      table_id: tableId,
      row_data: {
        data: rowData,
        index,
        parent_id: parentId,
      },
    });
  }

  public deleteRow(tableId: string, rowId: string) {
    const socket = this.getSocket();
    socket.emit("row:delete", {
      table_id: tableId,
      row_id: rowId,
    });
  }

  public moveRow(tableId: string, rowId: string, targetIndex: number) {
    const socket = this.getSocket();
    socket.emit("row:move", {
      table_id: tableId,
      row_id: rowId,
      target_index: targetIndex,
    });
  }

  /**
   * Requests the undo/redo status for a given table.
   */
  public getUndoRedoStatus(tableId: string) {
    const socket = this.getSocket();
    socket.emit("operation:get_status", { table_id: tableId });
  }

  /**
   * Requests undo of the last operation on a given table.
   */
  public undo(tableId: string) {
    const socket = this.getSocket();
    socket.emit("operation:undo", { table_id: tableId });
  }

  /**
   * Requests redo of the next operation on a given table.
   */
  public redo(tableId: string) {
    const socket = this.getSocket();
    socket.emit("operation:redo", { table_id: tableId });
  }

  /**
   * Safely returns active Socket instance or throws if not initialized.
   */
  public getSocket(): Socket {
    if (!this.socket) {
      throw new Error(
        "[Socket] Manager must connect before using Socket operations.",
      );
    }
    return this.socket;
  }

  /**
   * Forces a complete disconnection and reconnection of the socket.
   * Useful when returning to the application from another SPA module.
   */
  public forceReconnect() {
    if (this.socket) {
      console.log("[Socket] Forcing immediate disconnect and reconnect...");
      this.socket.disconnect();
      
      const serverUrl = localStorage.getItem("socket_server_url") || DEFAULT_SOCKET_URL;
      const currentToken = localStorage.getItem("console_token") || "guest";
      
      (this.socket as any).auth = { token: currentToken };
      if (this.socket.io && (this.socket.io as any).opts) {
        (this.socket.io as any).opts.query = { token: currentToken };
      }
      
      this.socket.connect();
    }
  }

  /**
   * Fully disconnects socket connection.
   */
  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log("[Socket] Disconnected and torn down client successfully.");
    }
  }
}

// Global Singleton for instant import and socket access
export const socketManager = new SocketManager();
