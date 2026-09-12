// Main video meeting component: manages WebRTC peer connections, socket events, and whiteboard
import React, { useEffect, useRef, useState, KeyboardEvent } from "react";
import axios from "axios";
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import styles from "../styles/VideoComponent.module.css";
import { io, Socket } from "socket.io-client";
import IconButton from "@mui/material/IconButton";
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import Badge from "@mui/material/Badge";
import ChatIcon from "@mui/icons-material/Chat";
import DrawIcon from "@mui/icons-material/Draw";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import SendIcon from "@mui/icons-material/Send";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import CheckIcon from "@mui/icons-material/Check";
import PeopleIcon from "@mui/icons-material/People";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import CloseIcon from "@mui/icons-material/Close";
import Whiteboard from "../components/Whiteboard";
import { useNavigate } from "react-router-dom";
import server from "../environment";

declare global {
    interface Window {
        localStream?: MediaStream;
    }
}

interface VideoItem {
    socketId: string;
    stream: MediaStream;
    autoPlay?: boolean;
    playsinline?: boolean;
}

interface ChatMessage {
    id?: string;
    sender: string;
    data: string;
    timestamp?: string;
}

interface WhiteboardNotification {
    open: boolean;
    sender: string;
}

const server_url: string = server;

// Active WebRTC connections keyed by peer socket id: { [socketId]: RTCPeerConnection }
let connections: Record<string, RTCPeerConnection> = {};

// Free Google STUN servers for NAT traversal
const peerConfigConnections: RTCConfiguration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" }
    ]
};

export default function VideoMeetComponent(): React.JSX.Element {
    const socketRef = useRef<Socket | any>(null);
    const socketIdRef = useRef<string | undefined>(undefined);
    const localVideoRef = useRef<HTMLVideoElement | null>(null);

    const [videoAvailable, setVideoAvailable] = useState<boolean>(true);
    const [audioAvailable, setAudioAvailable] = useState<boolean>(true);
    const [screenAvailable, setScreenAvailable] = useState<boolean | undefined>(undefined);

    const [video, setVideo] = useState<boolean | undefined>(undefined);
    const [audio, setAudio] = useState<boolean | undefined>(undefined);
    const [screen, setScreen] = useState<boolean | undefined>(undefined);

    const [showModal, setShowModal] = useState<boolean>(false); // Chat panel toggle
    const [showWhiteboard, setShowWhiteboard] = useState<boolean>(false); // Whiteboard toggle
    const [whiteboardNotification, setWhiteboardNotification] = useState<WhiteboardNotification>({ open: false, sender: "" }); // "User opened whiteboard" popup
    const [newWhiteboardActivity, setNewWhiteboardActivity] = useState<boolean>(false);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [message, setMessage] = useState<string>("");
    const [newMessages, setNewMessages] = useState<number>(0);

    const [askForUsername, setAskForUsername] = useState<boolean>(true); // Lobby screen toggle
    const [username, setUsername] = useState<string>("");

    const videoRef = useRef<VideoItem[]>([]);
    const [videos, setVideos] = useState<VideoItem[]>([]);
    const [spotlightVideo, setSpotlightVideo] = useState<string | null>(null); // Clicked video pinned in spotlight mode
    const [sidebarTab, setSidebarTab] = useState<'chat' | 'participants'>('chat');
    const [callSeconds, setCallSeconds] = useState<number>(0);
    const [copiedInvite, setCopiedInvite] = useState<boolean>(false);
    const [volume, setVolume] = useState<number>(85);

    useEffect(() => {
        if (!askForUsername) {
            const timer = setInterval(() => {
                setCallSeconds(prev => prev + 1);
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [askForUsername]);

    const formatCallTime = (totalSecs: number): string => {
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleCopyInvite = (): void => {
        try {
            navigator.clipboard.writeText(window.location.href);
            setCopiedInvite(true);
            setTimeout(() => setCopiedInvite(false), 2200);
        } catch (e) {
            console.error("Clipboard copy failed", e);
        }
    };

    const handleVolumeSliderClick = (e: React.MouseEvent<HTMLDivElement>): void => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const h = rect.height;
        const newVol = Math.max(0, Math.min(100, Math.round((1 - clickY / h) * 100)));
        setVolume(newVol);
    };

    const getPermissions = async (): Promise<void> => {
        try {
            const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoPermission) {
                setVideoAvailable(true);
                videoPermission.getTracks().forEach(track => track.stop());
            } else {
                setVideoAvailable(false);
            }

            const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (audioPermission) {
                setAudioAvailable(true);
                audioPermission.getTracks().forEach(track => track.stop());
            } else {
                setAudioAvailable(false);
            }

            if (navigator.mediaDevices.getDisplayMedia) {
                setScreenAvailable(true);
            } else {
                setScreenAvailable(false);
            }

            if (videoAvailable || audioAvailable) {
                const userMediaStream = await navigator.mediaDevices.getUserMedia({ video: videoAvailable, audio: audioAvailable });

                if (userMediaStream) {
                    window.localStream = userMediaStream;
                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = userMediaStream;
                    }
                }
            }

        } catch (err) {
            console.log(err);
        }
    };

    useEffect(() => {
        getPermissions();
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                if (parsed.name) setUsername(parsed.name);
            } catch (e) { }
        }
    }, []);

    const getUserMediaSuccess = (stream: MediaStream): void => {
        try {
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => track.stop());
            }
        } catch (e) {
            console.log(e);
        }

        window.localStream = stream;
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
        }

        for (const id in connections) {
            if (id === socketIdRef.current) continue;

            const senders = connections[id].getSenders();

            stream.getTracks().forEach(track => {
                const sender = senders.find(s => s.track && s.track.kind === track.kind);
                if (sender) {
                    sender.replaceTrack(track);
                } else {
                    connections[id].addTrack(track, stream);
                }
            });
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setVideo(false);
            setAudio(false);

            try {
                if (localVideoRef.current && localVideoRef.current.srcObject) {
                    const tracks = (localVideoRef.current.srcObject as MediaStream).getTracks();
                    tracks.forEach(t => t.stop());
                }
            } catch (e) { console.log(e); }

            const blackSilence = (...args: any[]) => new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = window.localStream;
            }

            for (const id in connections) {
                const senders = connections[id].getSenders();
                window.localStream.getTracks().forEach(t => {
                    const sender = senders.find(s => s.track && s.track.kind === t.kind);
                    if (sender) {
                        sender.replaceTrack(t);
                    }
                });
            }
        });
    };

    const silence = (): MediaStreamTrack => {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const dst = ctx.createMediaStreamDestination();
        oscillator.connect(dst);

        oscillator.start();
        ctx.resume();
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
    };

    const black = ({ width = 640, height = 480 } = {}): MediaStreamTrack => {
        const canvas = Object.assign(document.createElement("canvas"), { width, height });
        canvas.getContext('2d')?.fillRect(0, 0, width, height);
        const stream = canvas.captureStream();
        return Object.assign(stream.getVideoTracks()[0], { enabled: false });
    };

    const getUserMedia = (): void => {
        if ((video && videoAvailable) || (audio && audioAvailable)) {
            navigator.mediaDevices.getUserMedia({ video, audio })
                .then(getUserMediaSuccess)
                .catch((e) => console.log(e));
        } else {
            try {
                if (localVideoRef.current && localVideoRef.current.srcObject) {
                    const tracks = (localVideoRef.current.srcObject as MediaStream).getTracks();
                    tracks.forEach(t => t.stop());
                }
            } catch (e) { }
        }
    };

    useEffect(() => {
        if (video !== undefined && audio !== undefined) {
            getUserMedia();
        }
    }, [audio, video]);

    /**
     * WEBRTC SIGNALING MESSAGE DISPATCHER:
     * Receives SDP offers, SDP answers, and ICE candidates routed via Socket.IO.
     */
    const gotMessageFromServer = (fromId: string, messageStr: string): void => {
        const signal = JSON.parse(messageStr);

        if (fromId !== socketIdRef.current) {
            // 1. Session Description Protocol (SDP) exchange
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    // If received an offer, create an answer and send back to caller
                    if (signal.sdp.type === "offer") {
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current.emit("signal", fromId, JSON.stringify({ "sdp": connections[fromId].localDescription }));
                            }).catch(e => console.log(e));
                        }).catch(e => console.log(e));
                    }
                }).catch(e => console.log(e));
            }

            // 2. Interactive Connectivity Establishment (ICE) candidate exchange
            if (signal.ice) {
                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e));
            }
        }
    };

    // Appends message if not already present to ensure chat stays strictly in sync
    const addMessage = (data: string, sender: string, socketIdSender: string, id?: string, timestamp?: string): void => {
        const msgId = id || `${sender}-${data}-${Date.now()}`;
        setMessages((prevMessages) => {
            const exists = prevMessages.some(m =>
                (m.id && m.id === msgId) ||
                (m.sender === sender && m.data === data && (!timestamp || Math.abs(new Date(m.timestamp || 0).getTime() - new Date(timestamp || 0).getTime()) < 1500))
            );
            if (exists) return prevMessages;

            return [
                ...prevMessages, { id: msgId, sender, data, timestamp: timestamp || new Date().toISOString() }
            ];
        });

        if (socketIdSender !== socketIdRef.current) {
            setNewMessages((prevMessages) => prevMessages + 1);
        }
    };

    // Loads complete room chat history when joining or reconnecting
    const handleChatHistory = (history: any[]): void => {
        if (Array.isArray(history)) {
            setMessages(history.map(item => ({
                id: item.id || `${item.sender}-${item.data}-${Math.random()}`,
                sender: item.sender,
                data: item.data,
                timestamp: item.timestamp || new Date().toISOString()
            })));
        }
    };

    // Connects to signaling server and listens for WebRTC & chat events
    const connectToSocketServer = (): void => {
        socketRef.current = io(server_url);

        socketRef.current.on('signal', gotMessageFromServer);

        // Detach previous listeners before attaching to prevent duplicates on reconnect
        socketRef.current.off("chat-history").on("chat-history", handleChatHistory);
        socketRef.current.off("chat-message").on("chat-message", addMessage);

        socketRef.current.on("connect", () => {
            // Join room using pathname so localhost and LAN mobile IP land in the same room
            socketRef.current.emit("join-call", window.location.pathname);

            socketIdRef.current = socketRef.current.id;

            // Popup alert when someone starts using the whiteboard
            socketRef.current.off("whiteboard-started").on("whiteboard-started", (senderName: string) => {
                setWhiteboardNotification({
                    open: true,
                    sender: senderName || "A participant",
                });
                setNewWhiteboardActivity(true);
            });

            // Remove participant video and close connection when they leave
            socketRef.current.off("user-left").on("user-left", (id: string) => {
                setVideos((vids) => vids.filter((v) => v.socketId !== id));
                videoRef.current = videoRef.current.filter((v) => v.socketId !== id);
                if (connections[id]) {
                    try { connections[id].close(); } catch (e) { }
                    delete connections[id];
                }
            });

            // Set up WebRTC connection whenever a new user joins
            socketRef.current.off("user-joined").on("user-joined", (id: string, clients: string[]) => {
                clients.forEach((socketListId: string) => {
                    connections[socketListId] = new RTCPeerConnection(peerConfigConnections);

                    connections[socketListId].onicecandidate = (event: RTCPeerConnectionIceEvent) => {
                        if (event.candidate != null) {
                            socketRef.current.emit("signal", socketListId, JSON.stringify({ 'ice': event.candidate }));
                        }
                    };

                    // Attach remote video track (supports mobile Safari stream fallback)
                    connections[socketListId].ontrack = (event: RTCTrackEvent) => {
                        const incomingStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
                        const videoExists = videoRef.current.find(v => v.socketId === socketListId);

                        if (videoExists) {
                            const updateVideos = videoRef.current.map(v =>
                                v.socketId === socketListId ? { ...v, stream: incomingStream } : v
                            );
                            videoRef.current = updateVideos;
                            setVideos(updateVideos);
                        } else {
                            const newVideo: VideoItem = {
                                socketId: socketListId,
                                stream: incomingStream,
                                autoPlay: true,
                                playsinline: true
                            };
                            
                            const updatedVideos = [...videoRef.current, newVideo];
                            videoRef.current = updatedVideos;
                            setVideos(updatedVideos);
                        }
                    };

                    if (window.localStream !== undefined && window.localStream !== null) {
                        window.localStream.getTracks().forEach(track => {
                            connections[socketListId].addTrack(track, window.localStream!);
                        });
                    } else {
                        const blackSilence = (...args: any[]) => new MediaStream([black(...args), silence()]);
                        window.localStream = blackSilence();
                        window.localStream.getTracks().forEach(track => {
                            connections[socketListId].addTrack(track, window.localStream!);
                        });
                    }
                });

                if (id === socketIdRef.current) {
                    for (const id2 in connections) {
                        if (id2 === socketIdRef.current) continue;

                        try {
                            connections[id2].createOffer().then((description) => {
                                connections[id2].setLocalDescription(description)
                                    .then(() => {
                                        socketRef.current.emit("signal", id2, JSON.stringify({ "sdp": connections[id2].localDescription }));
                                    })
                                    .catch(e => console.log(e));
                            });
                        } catch (e) {
                            console.log(e);
                        }
                    }
                }
            });
        });
    };

    const getMedia = (): void => {
        setVideo(videoAvailable);
        setAudio(audioAvailable);
        connectToSocketServer();
    };

    const routeTo = useNavigate();

    const connect = (): void => {
        if (!username.trim()) return;
        setAskForUsername(false);
        getMedia();

        const token = localStorage.getItem("token");
        const roomCode = window.location.pathname.replace(/^\/+/, "");
        if (token && roomCode) {
            axios.post(`${server_url}/api/v1/users/add_to_activity`, {
                token,
                meeting_code: roomCode
            }).catch(e => console.log("History sync error:", e));
        }
    };

    const handleVideo = (): void => {
        setVideo(!video);
    };

    const handleAudio = (): void => {
        setAudio(!audio);
    };

    const handleChat = (): void => {
        setShowModal(!showModal);
        setNewMessages(0);
    };

    const getDisplayMediaSuccess = (stream: MediaStream): void => {
        try {
            window.localStream?.getTracks().forEach(track => track.stop());
        } catch (e) {
            console.log(e);
        }

        window.localStream = stream;
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
        }

        for (const id in connections) {
            if (id === socketIdRef.current) continue;

            const senders = connections[id].getSenders();

            stream.getTracks().forEach(track => {
                const sender = senders.find(s => s.track && s.track.kind === track.kind);
                if (sender) {
                    sender.replaceTrack(track);
                } else {
                    connections[id].addTrack(track, stream);
                }
            });
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setScreen(false);
            try {
                if (localVideoRef.current && localVideoRef.current.srcObject) {
                    const tracks = (localVideoRef.current.srcObject as MediaStream).getTracks();
                    tracks.forEach(t => t.stop());
                }
            } catch (e) { console.log(e); }

            const blackSilence = (...args: any[]) => new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = window.localStream;
            }

            getUserMedia();
        });
    };

    const getDisplayMedia = (): void => {
        if (screen) {
            if (navigator.mediaDevices.getDisplayMedia) {
                navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                    .then(getDisplayMediaSuccess)
                    .catch((e) => console.log(e));
            }
        }
    };

    useEffect(() => {
        if (screen !== undefined) {
            getDisplayMedia();
        }
    }, [screen]);

    const handleScreen = (): void => {
        setScreen(!screen);
    };

    const sendMessage = (): void => {
        if (!message.trim()) {
            return;
        }
        socketRef.current?.emit("chat-message", message, username);
        setMessage("");
    };

    const handleVideoClick = (socketId: string): void => {
        if (spotlightVideo === socketId) {
            setSpotlightVideo(null); // Exit spotlight mode
        } else {
            setSpotlightVideo(socketId); // Enter spotlight mode
        }
    };

    const handleLocalVideoClick = (): void => {
        if (spotlightVideo === 'local') {
            setSpotlightVideo(null);
        } else {
            setSpotlightVideo('local');
        }
    };

    // Re-attach local video stream when spotlight mode changes
    useEffect(() => {
        if (localVideoRef.current && window.localStream) {
            localVideoRef.current.srcObject = window.localStream;
        }
    }, [spotlightVideo]);

    // Re-attach local video stream when screen sharing stops
    useEffect(() => {
        if (localVideoRef.current && window.localStream && screen === false) {
            // Small delay to ensure getUserMedia has completed
            const timer = setTimeout(() => {
                if (localVideoRef.current && window.localStream) {
                    localVideoRef.current.srcObject = window.localStream;
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [screen]);

    // Auto-dismiss whiteboard notification popup after 3.5 seconds (3 to 4 seconds)
    useEffect(() => {
        if (whiteboardNotification.open) {
            const timer = setTimeout(() => {
                setWhiteboardNotification({ open: false, sender: "" });
            }, 3500);
            return () => clearTimeout(timer);
        }
    }, [whiteboardNotification.open]);

    const handleEndCall = (): void => {
        try {
            if (localVideoRef.current && localVideoRef.current.srcObject) {
                const tracks = (localVideoRef.current.srcObject as MediaStream).getTracks();
                tracks.forEach(track => track.stop());
            }
        } catch (e) {
            console.log(e);
        }

        // Close all peer connections
        for (const id in connections) {
            try {
                connections[id].close();
            } catch (e) {
                console.log(e);
            }
        }
        connections = {};

        // Disconnect socket
        if (socketRef.current) {
            socketRef.current.disconnect();
        }

        routeTo("/home");
    };

    return (
        <div>
            {askForUsername === true ?
                <div className={styles.lobbyContainer}>
                    <div className={styles.lobbyGlow}></div>
                    <div className={styles.lobbyCard}>
                        <div className={styles.lobbyHeader}>
                            <div className={styles.lobbyBrandLogo}>
                                <VideocamIcon style={{ color: '#fff', fontSize: 24 }} />
                            </div>
                            <h2>Ready to Join?</h2>
                            <p className={styles.lobbySubtitle}>Check your camera and audio preview before entering</p>
                        </div>

                        <div className={styles.lobbyVideoWrapper}>
                            <video
                                className={styles.lobbyVideo}
                                ref={localVideoRef}
                                autoPlay
                                muted
                            />
                            <div className={styles.lobbyVideoBadge}>
                                <span className={styles.lobbyLiveDot}></span>
                                <span>Preview Active</span>
                            </div>
                        </div>

                        <div className={styles.lobbyActions}>
                            <TextField
                                label="Your Display Name"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                variant="outlined"
                                fullWidth
                                className="glassTextField"
                                autoFocus
                            />
                            <Button
                                variant="contained"
                                onClick={connect}
                                fullWidth
                                disabled={!username.trim()}
                                className={styles.lobbyJoinBtn}
                            >
                                Enter Meeting Room
                            </Button>
                        </div>
                    </div>
                </div> :

                <div className={styles.meetVideoContainer}>
                    {/* Top Navigation Bar */}
                    <div className={styles.topNavBar}>
                        <div className={styles.navLeft}>
                            <div className={styles.brandLogoBadge}>
                                <div className={styles.brandLogoGlow}></div>
                            </div>
                            <span className={styles.navBrandTitle}>Video Call</span>
                            <div className={styles.navTopicBadge}>
                                <span className={styles.topicBullet}></span>
                                <span>{window.location.pathname.replace(/^\/meet\/?/, '').replace(/^\//, '') ? `Room: ${window.location.pathname.replace(/^\/meet\/?/, '').replace(/^\//, '')}` : "Marketing UI Design"}</span>
                            </div>
                        </div>

                        <div className={styles.navRight}>
                            <IconButton className={styles.navIconBtn} title="Notifications">
                                <Badge color="primary" variant="dot" invisible={newMessages === 0 && !newWhiteboardActivity}>
                                    <NotificationsNoneIcon style={{ fontSize: 20 }} />
                                </Badge>
                            </IconButton>

                            <div className={styles.navUserAvatar} title={username || "You"}>
                                {(username || "U").substring(0, 2).toUpperCase()}
                                <span className={styles.navUserStatusDot}></span>
                            </div>
                        </div>
                    </div>

                    {/* Sub-Header Ribbon */}
                    <div className={styles.subHeaderRibbon}>
                        <div className={styles.subHeaderLeft}>
                            <span className={styles.reminderLabel}>Reminder</span>
                            <div className={styles.meetingPill}>
                                <CalendarTodayIcon style={{ fontSize: 16, color: "#60a5fa" }} />
                                <span className={styles.meetingPillTitle}>Morning meeting</span>
                                <span className={styles.meetingPillTime}>
                                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>

                        <div className={styles.subHeaderRight}>
                            <button
                                className={styles.inviteBtn}
                                onClick={handleCopyInvite}
                                title="Click to copy meeting link"
                            >
                                <GroupAddIcon style={{ fontSize: 18 }} />
                                <span>{copiedInvite ? "Copied Link!" : "Invite to the call"}</span>
                                <span className={styles.invitePillCount}>{videos.length + 1}</span>
                            </button>

                            <div className={styles.statBadge}>
                                <PeopleIcon style={{ fontSize: 18 }} />
                                <span>Participants:</span>
                                <span className={styles.statPillCount}>{videos.length + 1}</span>
                            </div>
                        </div>
                    </div>

                    {/* Whiteboard Notification Banner */}
                    {whiteboardNotification.open && (
                        <div className={styles.whiteboardNotificationBanner}>
                            <div className={styles.whiteboardNotificationContent}>
                                <div className={styles.whiteboardIconPill}>
                                    <DrawIcon style={{ fontSize: 20, color: "#f97316" }} />
                                </div>
                                <div className={styles.whiteboardNotificationText}>
                                    <p><strong>{whiteboardNotification.sender}</strong> started using the Whiteboard</p>
                                    <span>Click to view and sketch collaboratively</span>
                                </div>
                                <button
                                    className={styles.whiteboardNotificationAction}
                                    onClick={() => {
                                        setShowWhiteboard(true);
                                        setNewWhiteboardActivity(false);
                                        setWhiteboardNotification({ open: false, sender: "" });
                                    }}
                                >
                                    Open Board
                                </button>
                                <button
                                    className={styles.whiteboardNotificationClose}
                                    onClick={() => setWhiteboardNotification({ open: false, sender: "" })}
                                    title="Dismiss notification"
                                >
                                    ✕
                                </button>
                                <div className={styles.whiteboardNotificationProgressBar}></div>
                            </div>
                        </div>
                    )}

                    {/* Main Call Body (2-Column Grid) */}
                    <div className={styles.callMainBody}>
                        {/* Left Video Stage */}
                        <div className={styles.videoStage}>
                            {/* Hero Video Card */}
                            <div className={styles.heroVideoCard}>
                                {(() => {
                                    // Determine who is spotlighted in Hero Card
                                    const isLocalSpotlight = spotlightVideo === 'local' || (videos.length === 0 && (!spotlightVideo || spotlightVideo === 'local'));
                                    const activeRemoteVid = !isLocalSpotlight ? (videos.find(v => v.socketId === spotlightVideo) || videos[0]) : null;

                                    if (isLocalSpotlight || !activeRemoteVid) {
                                        // Display Local Video
                                        return (
                                            <>
                                                {video === false ? (
                                                    <div className={styles.videoOffPlaceholder}>
                                                        <div className={styles.videoOffAvatar}>
                                                            {(username || "Y").substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <span className={styles.videoOffName}>{username || "You"} (Camera Off)</span>
                                                    </div>
                                                ) : (
                                                    <video
                                                        className={styles.heroVideoElement}
                                                        ref={localVideoRef}
                                                        autoPlay
                                                        muted
                                                    />
                                                )}
                                                <div className={styles.heroNameBadge}>
                                                    <span className={styles.activeDot}></span>
                                                    <span>{username ? `${username} (You)` : "You"}</span>
                                                </div>
                                            </>
                                        );
                                    } else {
                                        // Display Active Remote Participant
                                        return (
                                            <>
                                                <video
                                                    className={styles.heroVideoElement}
                                                    ref={ref => {
                                                        if (ref && activeRemoteVid.stream) {
                                                            ref.srcObject = activeRemoteVid.stream;
                                                        }
                                                    }}
                                                    autoPlay
                                                />
                                                <div className={styles.heroNameBadge}>
                                                    <span className={styles.activeDot}></span>
                                                    <span>Participant</span>
                                                </div>
                                            </>
                                        );
                                    }
                                })()}

                                {/* Top-Right LIVE / Call Duration Badge */}
                                <div className={styles.heroLiveBadge}>
                                    <span className={styles.recDot}></span>
                                    <span>{formatCallTime(callSeconds)}</span>
                                </div>

                                {/* Left Vertical Audio Volume Slider */}
                                <div className={styles.heroVolumeBar} title={`Volume: ${volume}%`}>
                                    <div className={styles.volumeSliderTrack} onClick={handleVolumeSliderClick}>
                                        <div className={styles.volumeSliderFill} style={{ height: `${volume}%` }}></div>
                                    </div>
                                    {volume === 0 ? (
                                        <VolumeOffIcon style={{ fontSize: 16, color: "#ef4444", cursor: 'pointer' }} onClick={() => setVolume(80)} />
                                    ) : (
                                        <VolumeUpIcon style={{ fontSize: 16, color: "#94a3b8", cursor: 'pointer' }} onClick={() => setVolume(0)} />
                                    )}
                                </div>

                                {/* Center Floating Control Dock */}
                                <div className={styles.heroControlDock}>
                                    <IconButton
                                        className={`${styles.dockBtn} ${video === false ? styles.dockBtnOff : ''}`}
                                        onClick={handleVideo}
                                        title={video ? "Turn off camera" : "Turn on camera"}
                                    >
                                        {video === true ? <VideocamIcon /> : <VideocamOffIcon />}
                                    </IconButton>

                                    <IconButton
                                        className={`${styles.dockBtn} ${audio === false ? styles.dockBtnOff : ''}`}
                                        onClick={handleAudio}
                                        title={audio ? "Mute microphone" : "Unmute microphone"}
                                    >
                                        {audio === true ? <MicIcon /> : <MicOffIcon />}
                                    </IconButton>

                                    <IconButton
                                        onClick={handleEndCall}
                                        className={styles.dockEndCallBtn}
                                        title="Leave call"
                                    >
                                        <CallEndIcon />
                                    </IconButton>

                                    {screenAvailable === true && (
                                        <IconButton
                                            className={`${styles.dockBtn} ${screen ? styles.dockBtnActive : ''}`}
                                            onClick={handleScreen}
                                            title={screen ? "Stop sharing screen" : "Share screen"}
                                        >
                                            {screen === true ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                                        </IconButton>
                                    )}

                                    <Badge color="secondary" variant="dot" invisible={showWhiteboard || !newWhiteboardActivity}>
                                        <IconButton
                                            className={`${styles.dockBtn} ${showWhiteboard ? styles.dockBtnActive : ''}`}
                                            onClick={() => {
                                                const nextState = !showWhiteboard;
                                                setShowWhiteboard(nextState);
                                                if (nextState) {
                                                    setNewWhiteboardActivity(false);
                                                    socketRef.current?.emit("whiteboard-started", username || "A participant");
                                                }
                                            }}
                                            title={showWhiteboard ? "Close Whiteboard" : "Collaborative Whiteboard"}
                                        >
                                            <DrawIcon />
                                        </IconButton>
                                    </Badge>

                                    <Badge badgeContent={newMessages} max={99} color="primary">
                                        <IconButton
                                            className={`${styles.dockBtn} ${showModal ? styles.dockBtnActive : ''}`}
                                            onClick={handleChat}
                                            title="Toggle In-Call Chat"
                                        >
                                            <ChatIcon />
                                        </IconButton>
                                    </Badge>
                                </div>
                            </div>

                            {/* Bottom Participant Thumbnails Strip */}
                            <div className={styles.thumbnailsRow}>
                                {(() => {
                                    const isLocalSpotlight = spotlightVideo === 'local' || (videos.length === 0 && (!spotlightVideo || spotlightVideo === 'local'));
                                    const activeSpotlightId = isLocalSpotlight ? 'local' : (spotlightVideo || (videos[0] ? videos[0].socketId : 'local'));

                                    return (
                                        <>
                                            {/* Local video thumbnail (when not spotlighted) */}
                                            {activeSpotlightId !== 'local' && (
                                                <div
                                                    className={`${styles.thumbnailCard} ${activeSpotlightId === 'local' ? styles.thumbnailActiveSpotlight : ''}`}
                                                    onClick={handleLocalVideoClick}
                                                    title="Click to spotlight your video"
                                                >
                                                    <video
                                                        className={styles.thumbnailVideo}
                                                        ref={localVideoRef}
                                                        autoPlay
                                                        muted
                                                    />
                                                    <div className={styles.thumbnailNameBadge}>
                                                        <span className={styles.activeDot}></span>
                                                        <span>{username || "You"} (You)</span>
                                                    </div>
                                                    <div className={styles.thumbnailMicBadge}>
                                                        {audio ? <MicIcon style={{ fontSize: 13, color: "#10b981" }} /> : <MicOffIcon style={{ fontSize: 13, color: "#ef4444" }} />}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Remote video thumbnails */}
                                            {videos.filter(v => v.socketId !== activeSpotlightId).map((vid) => (
                                                <div
                                                    key={vid.socketId}
                                                    className={`${styles.thumbnailCard} ${activeSpotlightId === vid.socketId ? styles.thumbnailActiveSpotlight : ''}`}
                                                    onClick={() => handleVideoClick(vid.socketId)}
                                                    title="Click to spotlight this participant"
                                                >
                                                    <video
                                                        className={styles.thumbnailVideo}
                                                        ref={ref => {
                                                            if (ref && vid.stream) {
                                                                ref.srcObject = vid.stream;
                                                            }
                                                        }}
                                                        autoPlay
                                                    />
                                                    <div className={styles.thumbnailNameBadge}>
                                                        <span className={styles.activeDot}></span>
                                                        <span>Participant</span>
                                                    </div>
                                                    <div className={styles.thumbnailMicBadge}>
                                                        <MicIcon style={{ fontSize: 13, color: "#10b981" }} />
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Empty or invite teammate card when alone in room */}
                                            {videos.length === 0 && (
                                                <div
                                                    className={styles.thumbnailCard}
                                                    onClick={handleCopyInvite}
                                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(30, 41, 59, 0.4)' }}
                                                    title="Click to copy meeting link"
                                                >
                                                    <GroupAddIcon style={{ fontSize: 24, color: "#60a5fa" }} />
                                                    <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 500 }}>
                                                        {copiedInvite ? "Link Copied!" : "+ Invite People"}
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Right Sidebar (Chat & Participants) */}
                        <div className={`${styles.chatSidebar} ${showModal ? styles.open : ''}`}>
                            {/* Horizontal Participant Avatars Bar */}
                            <div className={styles.sidebarAvatarsSection}>
                                <div className={styles.avatarItem} onClick={handleLocalVideoClick} title="You">
                                    <div className={`${styles.avatarCircle} ${styles.avatarCircleYou}`}>
                                        {(username || "U").substring(0, 2).toUpperCase()}
                                        <span className={styles.avatarStatusDot}></span>
                                    </div>
                                    <span className={styles.avatarName}>You</span>
                                </div>

                                {videos.length > 0 ? (
                                    videos.map((vid, idx) => (
                                        <div
                                            key={vid.socketId}
                                            className={styles.avatarItem}
                                            onClick={() => handleVideoClick(vid.socketId)}
                                            title={`Participant ${idx + 1}`}
                                        >
                                            <div className={styles.avatarCircle}>
                                                {`P${idx + 1}`}
                                                <span className={styles.avatarStatusDot}></span>
                                            </div>
                                            <span className={styles.avatarName}>{`Peer ${idx + 1}`}</span>
                                        </div>
                                    ))
                                ) : (
                                    <>
                                        <div className={styles.avatarItem} onClick={handleCopyInvite} title="Invite William">
                                            <div className={styles.avatarCircle} style={{ opacity: 0.7 }}>
                                                W
                                                <span className={styles.avatarStatusDot} style={{ background: '#94a3b8' }}></span>
                                            </div>
                                            <span className={styles.avatarName}>William</span>
                                        </div>
                                        <div className={styles.avatarItem} onClick={handleCopyInvite} title="Invite Amel">
                                            <div className={styles.avatarCircle} style={{ opacity: 0.7 }}>
                                                A
                                                <span className={styles.avatarStatusDot} style={{ background: '#94a3b8' }}></span>
                                            </div>
                                            <span className={styles.avatarName}>Amel</span>
                                        </div>
                                        <div className={styles.avatarItem} onClick={handleCopyInvite} title="Invite Robbert">
                                            <div className={styles.avatarCircle} style={{ opacity: 0.7 }}>
                                                R
                                                <span className={styles.avatarStatusDot} style={{ background: '#94a3b8' }}></span>
                                            </div>
                                            <span className={styles.avatarName}>Robbert</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Sidebar Header & Tabs */}
                            <div className={styles.sidebarNav}>
                                <div className={styles.sidebarTitleRow}>
                                    <span className={styles.sidebarTitle}>Chat</span>
                                    <button
                                        className={styles.sidebarCloseBtn}
                                        onClick={handleChat}
                                        title="Close"
                                    >
                                        <CloseIcon style={{ fontSize: 18 }} />
                                    </button>
                                </div>

                                <div className={styles.sidebarTabs}>
                                    <button
                                        className={`${styles.sidebarTab} ${sidebarTab === 'chat' ? styles.sidebarTabActive : ''}`}
                                        onClick={() => setSidebarTab('chat')}
                                    >
                                        All Chat
                                    </button>
                                    <button
                                        className={`${styles.sidebarTab} ${sidebarTab === 'participants' ? styles.sidebarTabActive : ''}`}
                                        onClick={() => setSidebarTab('participants')}
                                    >
                                        Participants ({videos.length + 1})
                                    </button>
                                </div>
                            </div>

                            {sidebarTab === 'chat' ? (
                                <>
                                    {/* Chat Messages Feed */}
                                    <div className={styles.chatMessagesFeed}>
                                        {messages.length > 0 ? (
                                            messages.map((item, index) => {
                                                const isSelf = item.sender === username;
                                                const initials = (item.sender || "P").substring(0, 2).toUpperCase();
                                                return (
                                                    <div
                                                        key={item.id || index}
                                                        className={`${styles.msgRow} ${isSelf ? styles.msgRowSelf : ''}`}
                                                    >
                                                        {!isSelf && (
                                                            <div className={styles.msgAvatar} title={item.sender}>
                                                                {initials}
                                                            </div>
                                                        )}
                                                        <div className={styles.msgBubbleContainer}>
                                                            {!isSelf && <span className={styles.msgSenderName}>{item.sender}</span>}
                                                            <div className={`${styles.msgBubble} ${isSelf ? styles.msgBubbleSelf : styles.msgBubbleOther}`}>
                                                                {item.data}
                                                            </div>
                                                            <span className={`${styles.msgMeta} ${isSelf ? styles.msgMetaSelf : ''}`}>
                                                                {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                                                                {isSelf && <CheckIcon style={{ fontSize: 13, color: "#60a5fa" }} />}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className={styles.emptyChatPrompt}>
                                                <p>No messages yet.</p>
                                                <span>Say hello to start the discussion!</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Bottom Message Input Dock */}
                                    <div className={styles.sidebarInputDock}>
                                        <div className={styles.inputFieldWrapper}>
                                            <input
                                                type="text"
                                                className={styles.messageTextInput}
                                                placeholder="Write your message..."
                                                value={message}
                                                onChange={(e) => setMessage(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        sendMessage();
                                                    }
                                                }}
                                            />
                                        </div>

                                        <button
                                            className={styles.inputActionBtn}
                                            onClick={sendMessage}
                                            disabled={!message.trim()}
                                            title="Send message"
                                        >
                                            <SendIcon style={{ fontSize: 16 }} />
                                        </button>

                                        <IconButton
                                            className={styles.navIconBtn}
                                            style={{ width: 36, height: 36 }}
                                            onClick={handleCopyInvite}
                                            title="Options & Invite"
                                        >
                                            <MoreHorizIcon style={{ fontSize: 18 }} />
                                        </IconButton>
                                    </div>
                                </>
                            ) : (
                                /* Participants Tab */
                                <div className={styles.participantsListFeed}>
                                    <div className={styles.participantItem}>
                                        <div className={styles.participantItemInfo}>
                                            <div className={styles.msgAvatar}>
                                                {(username || "U").substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className={styles.participantItemName}>{username || "You"} (You)</div>
                                                <div className={styles.participantItemRole}>Host</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {audio ? <MicIcon style={{ fontSize: 18, color: "#10b981" }} /> : <MicOffIcon style={{ fontSize: 18, color: "#ef4444" }} />}
                                            {video ? <VideocamIcon style={{ fontSize: 18, color: "#10b981" }} /> : <VideocamOffIcon style={{ fontSize: 18, color: "#ef4444" }} />}
                                        </div>
                                    </div>

                                    {videos.map((vid, idx) => (
                                        <div key={vid.socketId} className={styles.participantItem}>
                                            <div className={styles.participantItemInfo}>
                                                <div className={styles.msgAvatar}>
                                                    {`P${idx + 1}`}
                                                </div>
                                                <div>
                                                    <div className={styles.participantItemName}>{`Participant ${idx + 1}`}</div>
                                                    <div className={styles.participantItemRole}>Guest</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <MicIcon style={{ fontSize: 18, color: "#10b981" }} />
                                                <VideocamIcon style={{ fontSize: 18, color: "#10b981" }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Collaborative Glass Whiteboard Overlay */}
                    <Whiteboard
                        socketRef={socketRef}
                        isOpen={showWhiteboard}
                        username={username}
                        onClose={() => setShowWhiteboard(false)}
                    />
                </div>
            }
        </div>
    );
}
