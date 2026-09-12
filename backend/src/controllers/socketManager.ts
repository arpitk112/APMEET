import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";

export interface ChatMessage {
    id: string;
    sender: string;
    data: string;
    "socket-id-sender": string;
    timestamp: string;
}

// Stores room participants, chat history, whiteboard strokes, and client sessions in memory
const connections: Record<string, string[]> = {};
const messages: Record<string, ChatMessage[]> = {};
const timeOnLine: Record<string, Date> = {};
const whiteboardData: Record<string, any[]> = {};
const clientSessionMap: Record<string, string> = {};
const socketUserMap: Record<string, string> = {};
const socketUserIdMap: Record<string, string> = {};

// Host tracking & settings per room
interface RoomHost {
    socketId: string;
    username: string;
    clientId: string;
    userId: string;
    disconnectGraceTimeout?: NodeJS.Timeout | null;
}

interface RoomSettings {
    chatEnabled: boolean;
    waitingRoomEnabled: boolean;
}

const roomHosts: Record<string, RoomHost> = {};
const waitingRooms: Record<string, Array<{ socketId: string, username: string, clientId: string, userId?: string }>> = {};
const admittedParticipants: Record<string, Set<string>> = {};
const roomSettings: Record<string, RoomSettings> = {};
const roomCleanupTimeouts: Record<string, NodeJS.Timeout> = {};

export const connectToSocket = (server: HTTPServer): SocketIOServer => {
    const io = new SocketIOServer(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"]
        }
    });

    // Strips full URLs down to just "/apm-room-id" so phones and laptops match
    const normalizeRoom = (path: string | undefined): string => {
        if (!path) return "/default";
        try {
            if (typeof path === "string" && path.includes("://")) {
                return new URL(path).pathname;
            }
        } catch (e) { }
        return typeof path === "string" && path.startsWith("/") ? path : "/" + path;
    };

    io.on("connection", (socket: Socket) => {
        console.log("Client connected:", socket.id);

        // User joins a room or requests entry
        socket.on("join-call", (payload: any) => {
            let rawPath: string = "";
            let username: string = "";
            let clientId: string = "";
            let userId: string = "";

            if (typeof payload === "string") {
                rawPath = payload;
            } else if (payload && typeof payload === "object") {
                rawPath = payload.path || "";
                username = payload.username || "";
                clientId = payload.clientId || "";
                userId = payload.userId || clientId || `user_${Date.now()}`;
            }

            const path = normalizeRoom(rawPath);
            socketUserMap[socket.id] = username || "Guest";
            socketUserIdMap[socket.id] = userId;
            if (clientId) clientSessionMap[socket.id] = clientId;

            console.log(`Socket ${socket.id} joining room: ${path} (user: ${username || 'anonymous'}, userId: ${userId}, client: ${clientId || 'unknown'})`);

            // Cancel any pending cleanup of this room if it was empty
            if (roomCleanupTimeouts[path]) {
                clearTimeout(roomCleanupTimeouts[path]);
                delete roomCleanupTimeouts[path];
            }

            if (connections[path] === undefined) {
                connections[path] = [];
            }
            if (waitingRooms[path] === undefined) {
                waitingRooms[path] = [];
            }
            if (roomSettings[path] === undefined) {
                roomSettings[path] = { chatEnabled: true, waitingRoomEnabled: true };
            }

            // 1. Prune dead sockets that are no longer connected
            connections[path] = connections[path].filter(id => {
                const s = io.sockets.sockets.get(id);
                return s && s.connected;
            });
            waitingRooms[path] = waitingRooms[path].filter(item => {
                const s = io.sockets.sockets.get(item.socketId);
                return s && s.connected;
            });

            // 2. Prune previous duplicate or stale socket for this user/client in this room
            const staleIds = connections[path].filter(id => {
                return id !== socket.id && (
                    (userId && socketUserIdMap[id] === userId) ||
                    (clientId && clientSessionMap[id] === clientId)
                );
            });

            staleIds.forEach(staleId => {
                console.log(`User ${userId} joined on socket ${socket.id}. Replacing older socket ${staleId}`);
                const staleSocket = io.sockets.sockets.get(staleId);
                if (staleSocket) {
                    staleSocket.emit("duplicate-tab-replaced", {
                        message: "You are active in this meeting in another tab or window."
                    });
                    try { staleSocket.disconnect(true); } catch (e) { }
                }
                connections[path] = connections[path].filter(id => id !== staleId);
                connections[path].forEach(id => {
                    io.to(id).emit("user-left", staleId);
                });
                delete socketUserIdMap[staleId];
                delete clientSessionMap[staleId];
                delete socketUserMap[staleId];
                delete timeOnLine[staleId];
            });

            // 3. Determine Host status
            let isCurrentHost = false;
            const currentHost = roomHosts[path];

            // Check if reconnecting user is the existing host (by userId or clientId or socketId)
            if (currentHost && (currentHost.userId === userId || currentHost.clientId === clientId || currentHost.socketId === socket.id)) {
                if (currentHost.disconnectGraceTimeout) {
                    clearTimeout(currentHost.disconnectGraceTimeout);
                    currentHost.disconnectGraceTimeout = null;
                }
                currentHost.socketId = socket.id;
                currentHost.username = username || currentHost.username;
                currentHost.userId = userId;
                if (clientId) currentHost.clientId = clientId;
                isCurrentHost = true;
                console.log(`Host ${username} (${userId}) reconnected to ${path}. Host status preserved.`);
            } else if (!currentHost || (!currentHost.socketId && !currentHost.disconnectGraceTimeout)) {
                // Room has no active host and no host in grace period
                roomHosts[path] = {
                    socketId: socket.id,
                    username: username || "Host",
                    clientId,
                    userId,
                    disconnectGraceTimeout: null
                };
                isCurrentHost = true;
                console.log(`Socket ${socket.id} (${username}) became new host of ${path}.`);
            } else {
                // Room already has an active host or host is in grace period
                isCurrentHost = false;
            }

            // 4. If there is already an active host and this user is NOT the host, check waiting room
            // If user was already admitted by the host, allow them to rejoin smoothly without knocking again
            const isAlreadyAdmitted = Boolean(
                (userId && admittedParticipants[path]?.has(userId)) ||
                (clientId && admittedParticipants[path]?.has(clientId))
            );

            if (!isCurrentHost && roomSettings[path].waitingRoomEnabled && !isAlreadyAdmitted) {
                if (!waitingRooms[path].some(w => w.socketId === socket.id)) {
                    waitingRooms[path].push({ socketId: socket.id, username, clientId, userId });
                }

                socket.emit("knock-waiting", {
                    message: "Waiting for the host to let you in...",
                    hostName: currentHost?.username || "Host"
                });

                if (roomHosts[path] && roomHosts[path].socketId) {
                    io.to(roomHosts[path].socketId).emit("knock-request", {
                        socketId: socket.id,
                        username: username || "Guest",
                        clientId,
                        userId
                    });
                }
                return;
            }

            // 5. Admit directly into the room (Host or instant join)
            admitSocketIntoRoom(socket, path, username, isCurrentHost);
        });

        // Helper: joins an admitted socket into room connections and triggers signaling
        const admitSocketIntoRoom = (targetSocket: Socket, path: string, username: string, isHost: boolean) => {
            if (!connections[path].includes(targetSocket.id)) {
                connections[path].push(targetSocket.id);
            }
            timeOnLine[targetSocket.id] = new Date();

            // Send host status and room settings to the participant
            targetSocket.emit("host-status", {
                isHost,
                hostSocketId: roomHosts[path]?.socketId,
                hostName: roomHosts[path]?.username,
                chatEnabled: roomSettings[path]?.chatEnabled ?? true
            });

            // Tell all users in the room about the updated participant list
            for (let a = 0; a < connections[path].length; a++) {
                io.to(connections[path][a]).emit("user-joined", targetSocket.id, connections[path]);
            }

            // Send existing chat history to the newly connected participant
            if (messages[path] !== undefined && messages[path].length > 0) {
                targetSocket.emit("chat-history", messages[path]);
            }

            // Replay past whiteboard strokes
            if (whiteboardData[path] !== undefined && whiteboardData[path].length > 0) {
                targetSocket.emit("whiteboard-history", whiteboardData[path]);
            }
        };

        // Host admits a knocking candidate
        socket.on("admit-user", (candidateSocketId: string) => {
            const [matchingRoom] = Object.entries(connections)
                .find(([_, ids]) => ids.includes(socket.id)) || ['', []];

            if (!matchingRoom || roomHosts[matchingRoom]?.socketId !== socket.id) {
                return; // Only host can admit
            }

            const candidateIndex = (waitingRooms[matchingRoom] || []).findIndex(w => w.socketId === candidateSocketId);
            if (candidateIndex !== -1) {
                const candidate = waitingRooms[matchingRoom][candidateIndex];
                waitingRooms[matchingRoom].splice(candidateIndex, 1);

                // Remember this user as admitted so page refreshes don't re-trigger waiting room
                if (!admittedParticipants[matchingRoom]) {
                    admittedParticipants[matchingRoom] = new Set<string>();
                }
                if (candidate.userId) admittedParticipants[matchingRoom].add(candidate.userId);
                if (candidate.clientId) admittedParticipants[matchingRoom].add(candidate.clientId);
                if (candidate.username) admittedParticipants[matchingRoom].add(candidate.username);

                const targetSocket = io.sockets.sockets.get(candidateSocketId);
                if (targetSocket) {
                    targetSocket.emit("admitted", {
                        path: matchingRoom,
                        message: "The host admitted you into the meeting."
                    });
                    admitSocketIntoRoom(targetSocket, matchingRoom, candidate.username, false);
                }
            }
        });

        // Host denies a knocking candidate
        socket.on("deny-user", (candidateSocketId: string) => {
            const [matchingRoom] = Object.entries(connections)
                .find(([_, ids]) => ids.includes(socket.id)) || ['', []];

            if (!matchingRoom || roomHosts[matchingRoom]?.socketId !== socket.id) {
                return; // Only host can deny
            }

            if (waitingRooms[matchingRoom]) {
                waitingRooms[matchingRoom] = waitingRooms[matchingRoom].filter(w => w.socketId !== candidateSocketId);
            }

            const targetSocket = io.sockets.sockets.get(candidateSocketId);
            if (targetSocket) {
                targetSocket.emit("denied", {
                    message: "The host denied your request to join this call."
                });
            }
        });

        // Host removes/kicks a participant from the call
        socket.on("remove-user", (targetSocketId: string) => {
            const [matchingRoom] = Object.entries(connections)
                .find(([_, ids]) => ids.includes(socket.id)) || ['', []];

            if (!matchingRoom || roomHosts[matchingRoom]?.socketId !== socket.id) {
                return; // Only host can remove
            }

            // Invalidate admitted status if kicked by host
            const kickedClientId = clientSessionMap[targetSocketId];
            const kickedUserId = socketUserIdMap[targetSocketId];
            const kickedUsername = socketUserMap[targetSocketId];
            if (admittedParticipants[matchingRoom]) {
                if (kickedClientId) admittedParticipants[matchingRoom].delete(kickedClientId);
                if (kickedUserId) admittedParticipants[matchingRoom].delete(kickedUserId);
                if (kickedUsername) admittedParticipants[matchingRoom].delete(kickedUsername);
            }

            if (connections[matchingRoom]?.includes(targetSocketId)) {
                connections[matchingRoom] = connections[matchingRoom].filter(id => id !== targetSocketId);

                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.emit("kicked", {
                        message: "You were removed from the meeting by the host."
                    });
                }

                // Broadcast user-left to remaining peers
                connections[matchingRoom].forEach(id => {
                    io.to(id).emit("user-left", targetSocketId);
                });
            }
        });

        // Host toggles chat permission
        socket.on("toggle-chat-permission", (enabled: boolean) => {
            const [matchingRoom] = Object.entries(connections)
                .find(([_, ids]) => ids.includes(socket.id)) || ['', []];

            if (!matchingRoom || roomHosts[matchingRoom]?.socketId !== socket.id) {
                return;
            }

            if (roomSettings[matchingRoom]) {
                roomSettings[matchingRoom].chatEnabled = enabled;
            }

            // Broadcast to all participants in the room
            connections[matchingRoom].forEach(id => {
                io.to(id).emit("chat-permission-changed", enabled);
            });
        });

        // Broadcast emoji reactions to all peers in the room
        socket.on("send-reaction", (emoji: string) => {
            const [matchingRoom] = Object.entries(connections)
                .find(([_, ids]) => ids.includes(socket.id)) || ['', []];

            if (matchingRoom) {
                const senderName = socketUserMap[socket.id] || "Participant";
                connections[matchingRoom].forEach(id => {
                    io.to(id).emit("reaction-received", {
                        id: `${Date.now()}-${Math.random()}`,
                        emoji,
                        sender: senderName,
                        socketId: socket.id
                    });
                });
            }
        });

        // Broadcast hand raise/lower to all peers in the room
        socket.on("toggle-hand-raise", (isRaised: boolean) => {
            const [matchingRoom] = Object.entries(connections)
                .find(([_, ids]) => ids.includes(socket.id)) || ['', []];

            if (matchingRoom) {
                const senderName = socketUserMap[socket.id] || "Participant";
                connections[matchingRoom].forEach(id => {
                    io.to(id).emit("hand-raise-changed", {
                        socketId: socket.id,
                        sender: senderName,
                        isRaised
                    });
                });
            }
        });

        // Relays WebRTC signaling (offers, answers, ICE candidates) between peers
        socket.on("signal", (toId: string, message: any) => {
            io.to(toId).emit("signal", socket.id, message);
        });

        // Broadcasts a chat message with unique ID and timestamp to the room
        socket.on("chat-message", (data: string, sender: string) => {
            const [matchingRoom, found] = Object.entries(connections)
                .reduce<[string, boolean]>(([room, isFound], [roomKey, roomValue]) => {
                    if (!isFound && roomValue.includes(socket.id)) {
                        return [roomKey, true];
                    }
                    return [room, isFound];
                }, ['', false]);

            if (found === true) {
                // Enforce host chat permission
                if (roomSettings[matchingRoom]?.chatEnabled === false && socket.id !== roomHosts[matchingRoom]?.socketId) {
                    socket.emit("error-message", "Chat is currently disabled by the host.");
                    return;
                }

                if (messages[matchingRoom] === undefined) {
                    messages[matchingRoom] = [];
                }

                const msgObj: ChatMessage = {
                    id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                    sender: sender,
                    data: data,
                    "socket-id-sender": socket.id,
                    timestamp: new Date().toISOString()
                };

                messages[matchingRoom].push(msgObj);
                console.log("message in", matchingRoom, ":", sender, data);

                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit('chat-message', data, sender, socket.id, msgObj.id, msgObj.timestamp);
                });
            }
        });

        // Saves a drawing stroke and forwards it to others in the room
        socket.on("whiteboard-draw", (strokeData: any) => {
            const [matchingRoom, found] = Object.entries(connections)
                .reduce<[string, boolean]>(([room, isFound], [roomKey, roomValue]) => {
                    if (!isFound && roomValue.includes(socket.id)) {
                        return [roomKey, true];
                    }
                    return [room, isFound];
                }, ['', false]);

            if (found === true) {
                if (whiteboardData[matchingRoom] === undefined) {
                    whiteboardData[matchingRoom] = [];
                }

                whiteboardData[matchingRoom].push(strokeData);

                // Cap stroke history at 6000 to prevent memory leaks
                if (whiteboardData[matchingRoom].length > 6000) {
                    whiteboardData[matchingRoom].shift();
                }

                connections[matchingRoom].forEach((peerId) => {
                    if (peerId !== socket.id) {
                        io.to(peerId).emit("whiteboard-draw", strokeData);
                    }
                });
            }
        });

        // Clears the room's whiteboard for everyone
        socket.on("whiteboard-clear", () => {
            const [matchingRoom, found] = Object.entries(connections)
                .reduce<[string, boolean]>(([room, isFound], [roomKey, roomValue]) => {
                    if (!isFound && roomValue.includes(socket.id)) {
                        return [roomKey, true];
                    }
                    return [room, isFound];
                }, ['', false]);

            if (found === true) {
                whiteboardData[matchingRoom] = [];
                connections[matchingRoom].forEach((peerId) => {
                    io.to(peerId).emit("whiteboard-clear");
                });
            }
        });

        // Sends the complete drawing history to a user who just opened the board
        socket.on("whiteboard-get-history", () => {
            const [matchingRoom, found] = Object.entries(connections)
                .reduce<[string, boolean]>(([room, isFound], [roomKey, roomValue]) => {
                    if (!isFound && roomValue.includes(socket.id)) {
                        return [roomKey, true];
                    }
                    return [room, isFound];
                }, ['', false]);

            if (found === true && whiteboardData[matchingRoom] && whiteboardData[matchingRoom].length > 0) {
                socket.emit("whiteboard-history", whiteboardData[matchingRoom]);
            }
        });

        // Alerts other participants with a popup when someone starts drawing
        socket.on("whiteboard-started", (sender?: string) => {
            const [matchingRoom, found] = Object.entries(connections)
                .reduce<[string, boolean]>(([room, isFound], [roomKey, roomValue]) => {
                    if (!isFound && roomValue.includes(socket.id)) {
                        return [roomKey, true];
                    }
                    return [room, isFound];
                }, ['', false]);

            if (found === true) {
                connections[matchingRoom].forEach((peerId) => {
                    if (peerId !== socket.id) {
                        io.to(peerId).emit("whiteboard-started", sender || "A participant");
                    }
                });
            }
        });

        // Cleans up when a user disconnects, and frees room memory if empty
        socket.on("disconnect", () => {
            delete clientSessionMap[socket.id];
            delete socketUserMap[socket.id];
            delete socketUserIdMap[socket.id];
            delete timeOnLine[socket.id];

            // Remove from waiting room if candidate disconnected while waiting
            for (const [room, waitingList] of Object.entries(waitingRooms)) {
                waitingRooms[room] = waitingList.filter(w => w.socketId !== socket.id);
            }

            for (const [room, users] of Object.entries(connections)) {
                if (users.includes(socket.id)) {
                    connections[room] = users.filter(id => id !== socket.id);

                    // Notify remaining users in the room
                    connections[room].forEach(id => {
                        io.to(id).emit("user-left", socket.id);
                    });

                    // If the disconnecting socket was the host, start a 20s grace period for reconnection
                    const currentHost = roomHosts[room];
                    if (currentHost && currentHost.socketId === socket.id) {
                        console.log(`Host socket ${socket.id} (${currentHost.username}) disconnected from ${room}. Starting 20s grace period...`);
                        currentHost.socketId = ""; // clear active socketId while waiting for reconnect
                        if (currentHost.disconnectGraceTimeout) {
                            clearTimeout(currentHost.disconnectGraceTimeout);
                        }
                        currentHost.disconnectGraceTimeout = setTimeout(() => {
                            currentHost.disconnectGraceTimeout = null;
                            // Only reassign if host has not reconnected yet
                            if (!currentHost.socketId) {
                                if (connections[room] && connections[room].length > 0) {
                                    const newHostId = connections[room][0];
                                    const newHostName = socketUserMap[newHostId] || "Host";
                                    const newHostClientId = clientSessionMap[newHostId] || "";
                                    const newHostUserId = socketUserIdMap[newHostId] || "";
                                    roomHosts[room] = {
                                        socketId: newHostId,
                                        username: newHostName,
                                        clientId: newHostClientId,
                                        userId: newHostUserId,
                                        disconnectGraceTimeout: null
                                    };
                                    console.log(`Host grace period expired. Reassigned host in ${room} to ${newHostName}`);
                                    io.to(newHostId).emit("host-status", {
                                        isHost: true,
                                        hostSocketId: newHostId,
                                        hostName: newHostName,
                                        chatEnabled: roomSettings[room]?.chatEnabled ?? true
                                    });
                                    connections[room].forEach(id => {
                                        if (id !== newHostId) {
                                            io.to(id).emit("host-status", {
                                                isHost: false,
                                                hostSocketId: newHostId,
                                                hostName: newHostName,
                                                chatEnabled: roomSettings[room]?.chatEnabled ?? true
                                            });
                                        }
                                    });
                                } else {
                                    delete roomHosts[room];
                                    delete waitingRooms[room];
                                    delete roomSettings[room];
                                }
                            }
                        }, 20000);
                    }

                    // Empty room grace period: don't delete immediately on refresh
                    if (connections[room].length === 0) {
                        if (roomCleanupTimeouts[room]) {
                            clearTimeout(roomCleanupTimeouts[room]);
                        }
                        roomCleanupTimeouts[room] = setTimeout(() => {
                            if (!connections[room] || connections[room].length === 0) {
                                delete connections[room];
                                delete messages[room];
                                delete whiteboardData[room];
                                delete roomHosts[room];
                                delete waitingRooms[room];
                                delete admittedParticipants[room];
                                delete roomSettings[room];
                                delete roomCleanupTimeouts[room];
                                console.log(`Cleaned up empty room after grace period: ${room}`);
                            }
                        }, 45000);
                    }

                    break;
                }
            }
        });
    });

    return io;
};
