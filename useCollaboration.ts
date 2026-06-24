import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Socket } from "socket.io-client";
import { socketManager, RoomUserInfo, UsersUpdatedPayload } from "./services/socket";

export interface UserCursor {
  socketId: string;
  accountId: string;
  userName: string;
  userColor: string;
  rowId: string | null;
  columnId: string | null;
  isEditing?: boolean;
}

export function useCollaboration(tableId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<RoomUserInfo[]>([]);
  const [cursors, setCursors] = useState<Record<string, UserCursor>>({});
  
  // Guarantee instant socket availability across component boundary lifecycle
  const socket = useMemo(() => {
    return socketManager.connect();
  }, []);
  const roomStrRef = useRef<string | null>(null);

  // Manage global socket lifecycle tied to the App module
  useEffect(() => {
    // When entering the module, guarantee the connection is fresh,
    // which drops any stale sessions from other modules if the SPA
    // kept the socket alive improperly in the background.
    socketManager.forceReconnect();
    
    return () => {
      // Intentionally avoiding socketManager.disconnect() here because React
      // 18 Strict Mode double-invokes effects, leaving useMemo with a dead socket.
    };
  }, []);

  // Generate a premium distinct color for presence overlays based on name hash
  const getUserColor = useCallback((name: string): string => {
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
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }, []);

  // Connect & Join Room
  useEffect(() => {
    let isMounted = true;
    if (!tableId) {
      setIsConnected(false);
      setActiveUsers([]);
      return;
    }

    const handleConnect = () => {
      setIsConnected(true);
      // Attempt joining selected room on connect sequentially
      socketManager.queueOperation(() => {
        return socketManager
          .joinRoom(tableId)
          .then((response: any) => {
            if (!isMounted) return;
            const roomStr = response?.room || tableId;
            roomStrRef.current = roomStr;

            // Broadcast join completion FIRST before fetching the user list
            const targetRoom = roomStr || tableId;
            socket.emit("room:users_updated:broadcast", {
              room: targetRoom,
              users: [],
            });

            // After broadcasting, trigger the online users check
            return socketManager.getRoomUsers(tableId);
          })
          .then((response: any) => {
            if (!isMounted || !response) return;
            const users = response.users || [];
            setActiveUsers(users);
          })
          .catch((err) =>
            console.error("[Collaboration] JoinRoom failed:", err),
          );
      });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleUsersUpdated = (event: UsersUpdatedPayload) => {
      if (!event || !event.room) return;
      const joinedRoom = roomStrRef.current || socketManager.getJoinedRoom(tableId);
      
      const isMyRoom = 
        event.room === joinedRoom || 
        event.room === tableId || 
        event.room.endsWith("_" + tableId) || 
        event.room.endsWith("/" + tableId);

      if (isMyRoom) {
        if (event.users && event.users.length > 0) {
          setActiveUsers(event.users);
        } else {
          // Add a 300ms delay to let the server complete the departure process
          // before remaining clients query the latest active users list.
          setTimeout(() => {
            if (!isMounted) return;
            socketManager
              .getRoomUsers(tableId)
              .then((res: any) => {
                if (isMounted) setActiveUsers(res?.users || []);
              })
              .catch(() => {});
          }, 300);
        }
      }
    };

    // Presence cursors
    const handleRemoteCursor = (event: {
      socketId: string;
      accountId: string;
      userName: string;
      rowId: string | null;
      columnId: string | null;
      is_editing?: boolean;
      isEditing?: boolean;
    }) => {
      setCursors((prev) => {
        const next = { ...prev };
        if (!event.rowId && !event.columnId) {
          delete next[event.socketId];
        } else {
          next[event.socketId] = {
            socketId: event.socketId,
            accountId: event.accountId,
            userName: event.userName,
            userColor: getUserColor(event.userName),
            rowId: event.rowId,
            columnId: event.columnId,
            isEditing: !!(event.is_editing || event.isEditing),
          };
        }
        return next;
      });
    };

    const handleUserLeave = (event: { socketId: string }) => {
      setCursors((prev) => {
        const next = { ...prev };
        delete next[event.socketId];
        return next;
      });
      setActiveUsers((prev) => prev.filter((u) => u.sid !== event.socketId));
    };

    const handleTrackPositionAck = (response: any) => {
      console.log("[Socket] Received cell:track_position:ack:", response);
      if (!response || response.success === false) return;
      const tracks = response.data || [];
      const activeSids = new Set(
        tracks
          .filter((t: any) => t && t.sid)
          .map((t: any) => t.sid)
      );

      setCursors((prev) => {
        const next = { ...prev };
        
        // Remove any cursor not present in the active SIDs from this broadcast
        Object.keys(next).forEach((sid) => {
          if (!activeSids.has(sid)) {
            delete next[sid];
          }
        });

        tracks.forEach((track: any) => {
          if (!track || !track.sid) return;
          if (!track.row_id && !track.column_id) {
            delete next[track.sid];
          } else {
            const userName = track.real_name || track.name || "Co-worker";
            next[track.sid] = {
              socketId: track.sid,
              accountId: track.account_id || "",
              userName: userName,
              userColor: getUserColor(userName),
              rowId: track.row_id || null,
              columnId: track.column_id || null,
              isEditing: !!(track.is_editing || track.isEditing),
            };
          }
        });
        return next;
      });
    };

    const handlePositionUpdatedBroadcast = (response: any) => {
      console.log("[Socket] Received cell:position_updated:broadcast:", response);
      if (!response || response.success === false) return;
      const tracks = response.data || [];
      const activeSids = new Set(
        tracks
          .filter((t: any) => t && t.sid)
          .map((t: any) => t.sid)
      );

      setCursors((prev) => {
        const next = { ...prev };
        
        // Remove any cursor not present in the active SIDs from this broadcast
        Object.keys(next).forEach((sid) => {
          if (!activeSids.has(sid)) {
            delete next[sid];
          }
        });

        tracks.forEach((track: any) => {
          if (!track || !track.sid) return;
          if (!track.row_id && !track.column_id) {
            delete next[track.sid];
          } else {
            const userName = track.real_name || track.name || "Co-worker";
            next[track.sid] = {
              socketId: track.sid,
              accountId: track.account_id || "",
              userName: userName,
              userColor: getUserColor(userName),
              rowId: track.row_id || null,
              columnId: track.column_id || null,
              isEditing: !!(track.is_editing || track.isEditing),
            };
          }
        });
        return next;
      });
    };

    // Attach listeners
    if (socket.connected) {
      handleConnect();
    }
    socket.on("connect", handleConnect);

    socket.on("disconnect", handleDisconnect);
    socket.on("room:users_updated:broadcast", handleUsersUpdated);
    socket.on("cursor:moved:broadcast", handleRemoteCursor);
    socket.on("user:disconnected:broadcast", handleUserLeave);
    socket.on("cell:track_position:ack", handleTrackPositionAck);
    socket.on("cell:position_updated:broadcast", handlePositionUpdatedBroadcast);

    // Unmount cleanup
    return () => {
      isMounted = false;
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room:users_updated:broadcast", handleUsersUpdated);
      socket.off("cursor:moved:broadcast", handleRemoteCursor);
      socket.off("user:disconnected:broadcast", handleUserLeave);
      socket.off("cell:track_position:ack", handleTrackPositionAck);
      socket.off("cell:position_updated:broadcast", handlePositionUpdatedBroadcast);

      // Notify server about departure sequentially
      socketManager.queueOperation(() => {
        const targetRoom = roomStrRef.current || tableId;

        // Broadcast the departure to the room BEFORE leaving so the socket is still in the room
        // and authorized by the server to broadcast messages to that room's occupants.
        socket.emit("room:users_updated:broadcast", {
          room: targetRoom,
          users: [],
        });

        return socketManager
          .leaveRoom(tableId)
          .catch(() => {});
      });
    };
  }, [tableId, getUserColor]);

  /**
   * Broadcasts the local client's active editing/selection state to peers.
   */
  const broadcastCursorPosition = useCallback(
    (rowId: string | null, columnId: string | null, isEditing = false, myName = "Co-worker") => {
      if (!socket || !socket.connected || !tableId) return;

      socket.emit("cursor:move", {
        table_id: tableId,
        row_id: rowId,
        column_id: columnId,
        user_name: myName,
        is_editing: isEditing,
        isEditing: isEditing,
      });

      socket.emit("cell:track_position", {
        table_id: tableId,
        column_id: columnId,
        row_id: rowId,
      });
    },
    [tableId],
  );

  return {
    isConnected,
    activeUsers,
    cursors,
    broadcastCursorPosition,
    socket,
  };
}
