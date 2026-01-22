import express from "express";
import { createServer } from "node:http";
import { connectToSocket } from "./controllers/socketManager.js";

import mongoose from "mongoose";

import cors from "cors";
import userRoutes from "./routes/user.routes.js"

const app = express();
const server = createServer(app);
const io = connectToSocket(server);

app.set("port", (process.env.PORT || 8000))
app.use(cors());
app.use(express.json({ limit: "40kb" }))
app.use(express.urlencoded({ limit: "40kb", extended: true }))

app.use("/api/v1/users", userRoutes)

const start = async () => {
    app.set("mongo_user ")
    const connectionDb = await mongoose.connect("mongodb+srv://iamarpitgoyal069_db_user:Mongo098@cluster0.k8uvhei.mongodb.net/?appName=Cluster0")
    console.log(`MONGO DB Connected Host ${connectionDb.connection.host}`)
    server.listen(app.get("port"), () => {
        console.log(`Server Running on port 8000`)
    })
}

start();