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

        // User joins a room - send them existing chat & whiteboard history
        socket.on("join-call", (payload: any) => {
            let rawPath: string = "";
            let username: string = "";
            let clientId: string = "";

            if (typeof payload === "string") {
                rawPath = payload;
            } else if (payload && typeof payload === "object") {
                rawPath = payload.path || "";
                username = payload.username || "";
                clientId = payload.clientId || "";
            }

            const path = normalizeRoom(rawPath);
            console.log(`Socket ${socket.id} joined room: ${path} (user: ${username || 'anonymous'}, client: ${clientId || 'unknown'})`);

            if (connections[path] === undefined) {
                connections[path] = [];
            }

            // 1. Prune dead sockets that are no longer connected
            connections[path] = connections[path].filter(id => {
                const s = io.sockets.sockets.get(id);
                return s && s.connected;
            });

            // 2. Prune previous stale socket from the same client session in this room
            if (clientId) {
                const staleIds = connections[path].filter(id => {
                    return id !== socket.id && clientSessionMap[id] === clientId;
                });

                staleIds.forEach(staleId => {
                    console.log(`Pruning older socket ${staleId} for client session ${clientId}`);
                    const staleSocket = io.sockets.sockets.get(staleId);
                    if (staleSocket) {
                        try { staleSocket.disconnect(true); } catch (e) { }
                    }
                    connections[path] = connections[path].filter(id => id !== staleId);
                    connections[path].forEach(id => {
                        io.to(id).emit("user-left", staleId);
                    });
                    delete clientSessionMap[staleId];
                    delete timeOnLine[staleId];
                });

                clientSessionMap[socket.id] = clientId;
            }

            if (!connections[path].includes(socket.id)) {
                connections[path].push(socket.id);
            }
            timeOnLine[socket.id] = new Date();

            // Tell all users in the room about the updated participant list
            for (let a = 0; a < connections[path].length; a++) {
                io.to(connections[path][a]).emit("user-joined", socket.id, connections[path]);
            }

            // Send existing chat history to the newly connected participant
            if (messages[path] !== undefined && messages[path].length > 0) {
                io.to(socket.id).emit("chat-history", messages[path]);
            }

            // Replay past whiteboard strokes
            if (whiteboardData[path] !== undefined && whiteboardData[path].length > 0) {
                io.to(socket.id).emit("whiteboard-history", whiteboardData[path]);
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
            delete timeOnLine[socket.id];

            for (const [room, users] of Object.entries(connections)) {
                if (users.includes(socket.id)) {
                    connections[room] = users.filter(id => id !== socket.id);

                    // Notify remaining users in the room
                    connections[room].forEach(id => {
                        io.to(id).emit("user-left", socket.id);
                    });

                    // Delete room data once all users leave
                    if (connections[room].length === 0) {
                        delete connections[room];
                        delete messages[room];
                        delete whiteboardData[room];
                        console.log(`Cleaned up empty room: ${room}`);
                    }

                    break;
                }
            }
        });
    });

    return io;
};
