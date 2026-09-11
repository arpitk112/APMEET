import { Server } from "socket.io";

// Stores room participants, chat history, and whiteboard strokes in memory
let connections = {};
let messages = {};
let timeOnLine = {};
let whiteboardData = {};

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"]
        }
    });

    // Strips full URLs down to just "/apm-room-id" so phones and laptops match
    const normalizeRoom = (path) => {
        if (!path) return "/default";
        try {
            if (typeof path === "string" && path.includes("://")) {
                return new URL(path).pathname;
            }
        } catch (e) { }
        return typeof path === "string" && path.startsWith("/") ? path : "/" + path;
    };

    io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);

        // User joins a room - send them existing chat & whiteboard history
        socket.on("join-call", (rawPath) => {
            const path = normalizeRoom(rawPath);
            console.log(`Socket ${socket.id} joined room: ${path}`);

            if (connections[path] === undefined) {
                connections[path] = [];
            }
            connections[path].push(socket.id);
            timeOnLine[socket.id] = new Date();

            // Tell all users in the room about the new participant
            for (let a = 0; a < connections[path].length; a++) {
                io.to(connections[path][a]).emit("user-joined", socket.id, connections[path]);
            }

            // Replay past chat messages
            if (messages[path] !== undefined) {
                for (let a = 0; a < messages[path].length; ++a) {
                    io.to(socket.id).emit(
                        "chat-message",
                        messages[path][a]['data'],
                        messages[path][a]["sender"],
                        messages[path][a]["socket-id-sender"]
                    );
                }
            }

            // Replay past whiteboard strokes
            if (whiteboardData[path] !== undefined && whiteboardData[path].length > 0) {
                io.to(socket.id).emit("whiteboard-history", whiteboardData[path]);
            }
        });

        // Relays WebRTC signaling (offers, answers, ICE candidates) between peers
        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        });

        // Broadcasts a chat message to everyone in the same room
        socket.on("chat-message", (data, sender) => {
            const [matchingRoom, found] = Object.entries(connections)
                .reduce(([room, isFound], [roomKey, roomValue]) => {
                    if (!isFound && roomValue.includes(socket.id)) {
                        return [roomKey, true];
                    }
                    return [room, isFound];
                }, ['', false]);

            if (found === true) {
                if (messages[matchingRoom] === undefined) {
                    messages[matchingRoom] = [];
                }

                messages[matchingRoom].push({ 'sender': sender, "data": data, "socket-id-sender": socket.id });
                console.log("message in", matchingRoom, ":", sender, data);

                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit('chat-message', data, sender, socket.id);
                });
            }
        });

        // Saves a drawing stroke and forwards it to others in the room
        socket.on("whiteboard-draw", (strokeData) => {
            const [matchingRoom, found] = Object.entries(connections)
                .reduce(([room, isFound], [roomKey, roomValue]) => {
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
                .reduce(([room, isFound], [roomKey, roomValue]) => {
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
                .reduce(([room, isFound], [roomKey, roomValue]) => {
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
        socket.on("whiteboard-started", (sender) => {
            const [matchingRoom, found] = Object.entries(connections)
                .reduce(([room, isFound], [roomKey, roomValue]) => {
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
            for (const [room, users] of Object.entries(connections)) {
                if (users.includes(socket.id)) {
                    users.forEach(id => {
                        io.to(id).emit("user-left", socket.id);
                    });

                    connections[room] = users.filter(id => id !== socket.id);

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

            delete timeOnLine[socket.id];
        });
    });

    return io;
};
