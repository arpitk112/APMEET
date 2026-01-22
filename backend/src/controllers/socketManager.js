import { Server, Socket } from "socket.io";

let connections = {}
let messages = {}
let timeOnLine = {}


export const connectToSocket = (server) => {
    const io = new Server(server, {
        // Not to be done at Production level
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: "*",
            credentials: true
        }
    });

    io.on("connection", (socket) => {

        console.log("something connected");

        socket.on("join-call", (path) => {
            if (connections[path] === undefined) {
                connections[path] = []
            }
            connections[path].push(socket.id);

            timeOnLine[socket.id] = new Date();

            for (let a = 0; a < connections[path].length; a++) {
                io.to(connections[path][a]).emit("user-joined", socket.id, connections[path])
            }
            if (messages[path] !== undefined) {
                for (let a = 0; a < messages[path].length; ++a) {
                    io.to(socket.id).emit("chat-message", messages[path][a]['data'],
                        messages[path][a]["sender"], messages[path][a]["socket-id-sender"])
                }
            }
        })

        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message)
        })

        socket.on("chat-message", (data, sender) => {
            const [matchingRoom, found] = Object.entries(connections)
                .reduce(([room, isFound], [roomKey, roomValue]) => {
                    if (!isFound && roomValue.includes(socket.id)) {
                        return [roomKey, true];
                    }
                    return [room, isFound]
                }, ['', false]);

            if (found == true) {
                if (messages[matchingRoom] === undefined) {
                    messages[matchingRoom] = []
                }

                messages[matchingRoom].push({ 'sender': sender, "data": data, "socket-id-sender": socket.id })
                console.log("message", matchingRoom, ":", sender, data)

                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit('chat-message', data, sender, socket.id)
                })
            }

        })

        socket.on("disconnect", () => {
            for (const [room, users] of Object.entries(connections)) {
                if (users.includes(socket.id)) {

                    // notify all users in the room
                    users.forEach(id => {
                        io.to(id).emit("user-left", socket.id);
                    });

                    // remove disconnected socket
                    connections[room] = users.filter(id => id !== socket.id);

                    // delete empty room
                    if (connections[room].length === 0) {
                        delete connections[room];
                    }

                    break;
                }
            }

            // cleanup time tracking
            delete timeOnLine[socket.id];
        });

    })
    return io;
}
