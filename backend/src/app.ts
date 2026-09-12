import express, { Express } from "express";
import { createServer, Server as HTTPServer } from "node:http";
import { connectToSocket } from "./controllers/socketManager.js";
import "dotenv/config";
import mongoose from "mongoose";
import cors from "cors";
import userRoutes from "./routes/user.routes.js";

const app: Express = express();
const server: HTTPServer = createServer(app);
const io = connectToSocket(server);

app.set("port", process.env.PORT || 8000);
app.use(cors());
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

app.use("/api/v1/users", userRoutes);

// Health check endpoint to verify backend service status and uptime
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "AP-MEET backend",
        message: "Backend is live and healthy",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime())
    });
});

app.get("/", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "AP-MEET backend",
        message: "Backend server is running",
        timestamp: new Date().toISOString()
    });
});

const start = async (): Promise<void> => {
    app.set("mongo_user", "");
    const mongoUri = process.env.MONGO_URI || "";
    const connectionDb = await mongoose.connect(mongoUri);
    console.log(`MONGO DB Connected Host ${connectionDb.connection.host}`);
    server.listen(app.get("port"), "0.0.0.0", () => {
        console.log(`Server Running on port ${app.get("port")} (0.0.0.0)`);
    });
};

start();
