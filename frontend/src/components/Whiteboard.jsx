import React, { useRef, useState, useEffect, useCallback } from "react";
import styles from "../styles/Whiteboard.module.css";
import BrushIcon from "@mui/icons-material/Brush";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import DownloadIcon from "@mui/icons-material/Download";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import UndoIcon from "@mui/icons-material/Undo";

// Neon colors matching the dark glass theme
const COLOR_PALETTE = [
    "#ffffff", // White
    "#06b6d4", // Cyan
    "#f97316", // Orange
    "#a855f7", // Violet
    "#10b981", // Green
    "#facc15", // Yellow
    "#ef4444", // Red
];

// Brush sizes: fine, medium, bold
const BRUSH_SIZES = [
    { label: "Fine", value: 3 },
    { label: "Medium", value: 6 },
    { label: "Bold", value: 12 },
];

// Fixed 16:9 canvas resolution so drawing on a phone never stretches on a laptop
const VIRTUAL_WIDTH = 1920;
const VIRTUAL_HEIGHT = 1080;

export default function Whiteboard({ socketRef, isOpen, username, onClose }) {
    const canvasRef = useRef(null);
    const strokesRef = useRef([]); // All strokes drawn so far (for undo/sync)
    const isDrawingRef = useRef(false);
    const startPosRef = useRef({ x: 0, y: 0 }); // Mouse/touch start position
    const snapshotRef = useRef(null); // Canvas screenshot for line/rect preview
    const hasNotifiedRef = useRef(false); // Only notify room once per session

    const [color, setColor] = useState("#f97316");
    const [brushSize, setBrushSize] = useState(4);
    const [activeTool, setActiveTool] = useState("pen"); // 'pen' | 'eraser' | 'line' | 'rect'

    // Draws a single stroke or shape using normalized 0-1 coordinates
    const drawStroke = useCallback((stroke) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const { type, prevX, prevY, currX, currY, color: strokeColor, size, tool } = stroke;

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Eraser just draws with the board's dark background color
        if (tool === "eraser") {
            ctx.strokeStyle = "#0c1020";
            ctx.lineWidth = Math.max(size * 4, 24);
        } else {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = size;
        }

        // Scale normalized (0-1) coordinates up to the 1920x1080 virtual canvas
        const startX = prevX * VIRTUAL_WIDTH;
        const startY = prevY * VIRTUAL_HEIGHT;
        const endX = currX * VIRTUAL_WIDTH;
        const endY = currY * VIRTUAL_HEIGHT;

        ctx.beginPath();
        if (type === "freehand" || !type) {
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        } else if (type === "line") {
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        } else if (type === "rect") {
            const width = endX - startX;
            const height = endY - startY;
            ctx.strokeRect(startX, startY, width, height);
        }

        ctx.restore();
    }, []);

    // Clears canvas and redraws every saved stroke (used for undo and sync)
    const redrawAll = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        strokesRef.current.forEach((stroke) => drawStroke(stroke));
    }, [drawStroke]);

    // Set internal canvas resolution to 1920x1080 on first mount
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = VIRTUAL_WIDTH;
        canvas.height = VIRTUAL_HEIGHT;
        redrawAll();
    }, [redrawAll]);

    // Listen for real-time strokes and clear events from other users in the call
    useEffect(() => {
        const socket = socketRef?.current;
        if (!socket) return;

        const handleRemoteDraw = (stroke) => {
            strokesRef.current.push(stroke);
            drawStroke(stroke);
        };

        const handleRemoteClear = () => {
            strokesRef.current = [];
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext("2d");
                if (ctx) ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
            }
        };

        const handleRemoteHistory = (history) => {
            if (Array.isArray(history)) {
                strokesRef.current = history;
                redrawAll();
            }
        };

        socket.on("whiteboard-draw", handleRemoteDraw);
        socket.on("whiteboard-clear", handleRemoteClear);
        socket.on("whiteboard-history", handleRemoteHistory);

        // Fetch any strokes drawn before we opened the whiteboard
        socket.emit("whiteboard-get-history");

        return () => {
            socket.off("whiteboard-draw", handleRemoteDraw);
            socket.off("whiteboard-clear", handleRemoteClear);
            socket.off("whiteboard-history", handleRemoteHistory);
        };
    }, [socketRef, drawStroke, redrawAll]);

    // Redraw whenever the user toggles the whiteboard open
    useEffect(() => {
        if (isOpen) {
            const canvas = canvasRef.current;
            if (canvas) {
                if (canvas.width !== VIRTUAL_WIDTH || canvas.height !== VIRTUAL_HEIGHT) {
                    canvas.width = VIRTUAL_WIDTH;
                    canvas.height = VIRTUAL_HEIGHT;
                }
                redrawAll();
            }
            socketRef?.current?.emit("whiteboard-get-history");
        }
    }, [isOpen, redrawAll, socketRef]);

    // Turns mouse/touch pixel coordinates into 0.0 to 1.0 percentages
    const getNormalizedCoords = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();

        let clientX = e.clientX;
        let clientY = e.clientY;

        // Support mobile touch events
        if ((clientX === undefined || clientY === undefined) && e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        // Keep values between 0 and 1 so strokes don't go outside canvas
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

        return { x, y };
    };

    // Starts a stroke when pointer/finger touches down
    const startDrawing = (e) => {
        e.preventDefault();
        const coords = getNormalizedCoords(e);
        isDrawingRef.current = true;
        startPosRef.current = coords;

        // Show "user started whiteboard" popup to others in call
        if (!hasNotifiedRef.current) {
            hasNotifiedRef.current = true;
            socketRef?.current?.emit("whiteboard-started", username || "A participant");
        }

        // Save a canvas snapshot for live rectangle and line previews
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
                snapshotRef.current = ctx.getImageData(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
            }
        }
    };

    // Draws while dragging mouse or finger
    const draw = (e) => {
        if (!isDrawingRef.current) return;
        e.preventDefault();

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const coords = getNormalizedCoords(e);

        if (activeTool === "pen" || activeTool === "eraser") {
            const stroke = {
                type: "freehand",
                prevX: startPosRef.current.x,
                prevY: startPosRef.current.y,
                currX: coords.x,
                currY: coords.y,
                color,
                size: brushSize,
                tool: activeTool,
            };

            strokesRef.current.push(stroke);
            drawStroke(stroke);

            // Send stroke to everyone in the room
            socketRef?.current?.emit("whiteboard-draw", stroke);

            startPosRef.current = coords;
        } else if (activeTool === "line" || activeTool === "rect") {
            // Restore snapshot so preview doesn't leave trails while dragging
            if (snapshotRef.current) {
                ctx.putImageData(snapshotRef.current, 0, 0);
            }

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = brushSize;
            ctx.lineCap = "round";

            const startX = startPosRef.current.x * VIRTUAL_WIDTH;
            const startY = startPosRef.current.y * VIRTUAL_HEIGHT;
            const endX = coords.x * VIRTUAL_WIDTH;
            const endY = coords.y * VIRTUAL_HEIGHT;

            ctx.beginPath();
            if (activeTool === "line") {
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            } else if (activeTool === "rect") {
                ctx.strokeRect(startX, startY, endX - startX, endY - startY);
            }
            ctx.restore();
        }
    };

    // Finishes stroke on release and broadcasts final shape
    const stopDrawing = (e) => {
        if (!isDrawingRef.current) return;
        isDrawingRef.current = false;

        const coords = getNormalizedCoords(e);

        if (activeTool === "line" || activeTool === "rect") {
            const stroke = {
                type: activeTool,
                prevX: startPosRef.current.x,
                prevY: startPosRef.current.y,
                currX: coords.x,
                currY: coords.y,
                color,
                size: brushSize,
                tool: activeTool,
            };

            strokesRef.current.push(stroke);
            drawStroke(stroke);

            socketRef?.current?.emit("whiteboard-draw", stroke);
        }
    };

    // Clears canvas locally and sends clear command to all participants
    const handleClearCanvas = () => {
        strokesRef.current = [];
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        }
        socketRef?.current?.emit("whiteboard-clear");
    };

    // Removes the last drawn stroke
    const handleUndo = () => {
        if (strokesRef.current.length === 0) return;
        strokesRef.current.pop();
        redrawAll();
    };

    // Downloads the current sketch as a PNG with dark background
    const handleExportPNG = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = VIRTUAL_WIDTH;
        exportCanvas.height = VIRTUAL_HEIGHT;
        const exportCtx = exportCanvas.getContext("2d");

        exportCtx.fillStyle = "#0c1020";
        exportCtx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        exportCtx.drawImage(canvas, 0, 0);

        const dataUrl = exportCanvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.download = `AP-Meet-Whiteboard-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
    };

    return (
        <div className={`${styles.whiteboardOverlay} ${!isOpen ? styles.whiteboardHidden : ""}`}>
            {/* Top glass toolbar */}
            <div className={styles.toolbarContainer}>
                {/* Tools: pen, line, rect, eraser */}
                <div className={styles.toolGroup}>
                    <button
                        className={`${styles.toolBtn} ${activeTool === "pen" ? styles.activeTool : ""}`}
                        onClick={() => setActiveTool("pen")}
                        title="Pen Tool"
                    >
                        <BrushIcon style={{ fontSize: 18 }} />
                    </button>
                    <button
                        className={`${styles.toolBtn} ${activeTool === "line" ? styles.activeTool : ""}`}
                        onClick={() => setActiveTool("line")}
                        title="Line Tool"
                    >
                        <ShowChartIcon style={{ fontSize: 18 }} />
                    </button>
                    <button
                        className={`${styles.toolBtn} ${activeTool === "rect" ? styles.activeTool : ""}`}
                        onClick={() => setActiveTool("rect")}
                        title="Rectangle Tool"
                    >
                        <CropSquareIcon style={{ fontSize: 18 }} />
                    </button>
                    <button
                        className={`${styles.toolBtn} ${activeTool === "eraser" ? styles.activeTool : ""}`}
                        onClick={() => setActiveTool("eraser")}
                        title="Eraser"
                    >
                        <span style={{ fontSize: 14 }}>🧹</span>
                    </button>
                </div>

                <div className={styles.divider}></div>

                {/* Color swatches */}
                <div className={styles.colorPalette}>
                    {COLOR_PALETTE.map((c) => (
                        <div
                            key={c}
                            className={`${styles.colorSwatch} ${color === c && activeTool !== "eraser" ? styles.activeColor : ""}`}
                            style={{ backgroundColor: c }}
                            onClick={() => {
                                setColor(c);
                                if (activeTool === "eraser") setActiveTool("pen");
                            }}
                        />
                    ))}
                </div>

                <div className={styles.divider}></div>

                {/* Brush size buttons */}
                <div className={styles.toolGroup}>
                    {BRUSH_SIZES.map((s) => (
                        <button
                            key={s.value}
                            className={`${styles.sizeBtn} ${brushSize === s.value ? styles.activeSize : ""}`}
                            onClick={() => setBrushSize(s.value)}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                <div className={styles.divider}></div>

                {/* Actions: undo, clear, save, close */}
                <div className={styles.toolGroup}>
                    <button className={styles.actionBtn} onClick={handleUndo} title="Undo">
                        <UndoIcon style={{ fontSize: 16 }} />
                    </button>
                    <button className={`${styles.actionBtn} ${styles.clearBtn}`} onClick={handleClearCanvas} title="Clear board">
                        <DeleteOutlineIcon style={{ fontSize: 16 }} />
                        <span>Clear</span>
                    </button>
                    <button className={styles.actionBtn} onClick={handleExportPNG} title="Save as image">
                        <DownloadIcon style={{ fontSize: 16 }} />
                        <span>Save</span>
                    </button>
                    <button className={styles.closeBtn} onClick={onClose} title="Close">
                        <CloseIcon style={{ fontSize: 18 }} />
                    </button>
                </div>
            </div>

            {/* 16:9 canvas board */}
            <div className={styles.canvasWrapper}>
                <div className={styles.canvasBoard}>
                    <canvas
                        ref={canvasRef}
                        className={styles.drawingCanvas}
                        onPointerDown={startDrawing}
                        onPointerMove={draw}
                        onPointerUp={stopDrawing}
                        onPointerLeave={stopDrawing}
                    />
                </div>

                {/* Mobile portrait hint */}
                <div className={styles.rotateTip}>
                    <span>🔄 Rotate phone to landscape for wider drawing</span>
                </div>
            </div>

            {/* Live sync pill */}
            <div className={styles.syncIndicator}>
                <div className={styles.pulseDot}></div>
                <span>Collaborative Glass Whiteboard • Live Sync Active</span>
            </div>
        </div>
    );
}
