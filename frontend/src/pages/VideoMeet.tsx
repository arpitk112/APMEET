// Main video meeting component: Google Meet-inspired UI with Host Controls & WebRTC
import React, { useEffect, useRef, useState, KeyboardEvent } from "react";
import axios from "axios";
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import styles from "../styles/VideoComponent.module.css";
import { io, Socket } from "socket.io-client";
import IconButton from "@mui/material/IconButton";
import Switch from "@mui/material/Switch";
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
import PeopleIcon from "@mui/icons-material/People";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import SentimentSatisfiedAltIcon from "@mui/icons-material/SentimentSatisfiedAlt";
import PanToolIcon from "@mui/icons-material/PanTool";
import LockIcon from "@mui/icons-material/Lock";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import PushPinIcon from "@mui/icons-material/PushPin";
import DevicesIcon from "@mui/icons-material/Devices";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
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
    username?: string;
    autoPlay?: boolean;
    playsinline?: boolean;
}

interface ChatMessage {
    id?: string;
    sender: string;
    data: string;
    timestamp?: string;
}

interface KnockCandidate {
    socketId: string;
    username: string;
    clientId?: string;
}

interface ReactionItem {
    id: string;
    emoji: string;
    sender: string;
    left: number;
}

const server_url: string = server;

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

// Returns a persistent tab session ID to prevent duplicate sockets on reload
const getClientSessionId = (): string => {
    try {
        let id = sessionStorage.getItem("apm_client_session_id");
        if (!id) {
            id = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            sessionStorage.setItem("apm_client_session_id", id);
        }
        return id;
    } catch (e) {
        return `client_${Date.now()}`;
    }
};

// Returns a stable persistent user identifier (from login account or persistent device guest ID)
const getBrowserUserId = (): string => {
    try {
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
            const parsed = JSON.parse(storedUser);
            if (parsed.id) return `user_${parsed.id}`;
            if (parsed.username) return `user_${parsed.username}`;
            if (parsed.email) return `user_${parsed.email}`;
        }
        const token = localStorage.getItem("token");
        if (token) return `token_${token.substring(0, 16)}`;
        let id = localStorage.getItem("apm_browser_user_id");
        if (!id) {
            id = `browser_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            localStorage.setItem("apm_browser_user_id", id);
        }
        return id;
    } catch (e) {
        return `browser_${Date.now()}`;
    }
};

// Memoized Video Player to prevent reload/flickering on parent re-renders
interface VideoPlayerProps {
    stream: MediaStream | null | undefined;
    className?: string;
    autoPlay?: boolean;
    muted?: boolean;
    playsInline?: boolean;
    onClick?: () => void;
}

const VideoPlayer = React.memo(({ stream, className, autoPlay = true, muted = false, playsInline = true, onClick }: VideoPlayerProps) => {
    const internalVideoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const video = internalVideoRef.current;
        if (!video) return;

        if (stream) {
            if (video.srcObject !== stream) {
                video.srcObject = stream;
            }
            if (video.paused) {
                video.play().catch((err) => {
                    if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
                        console.log("Autoplay note:", err);
                    }
                });
            }
        } else {
            video.srcObject = null;
        }
    }, [stream]);

    return (
        <video
            ref={internalVideoRef}
            className={className}
            autoPlay={autoPlay}
            muted={muted}
            playsInline={playsInline}
            onClick={onClick}
        />
    );
});

export default function VideoMeetComponent(): React.JSX.Element {
    const socketRef = useRef<Socket | any>(null);
    const socketIdRef = useRef<string | undefined>(undefined);
    const connectionsRef = useRef<Record<string, RTCPeerConnection>>({});
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);

    const [videoAvailable, setVideoAvailable] = useState<boolean>(true);
    const [audioAvailable, setAudioAvailable] = useState<boolean>(true);
    const [screenAvailable, setScreenAvailable] = useState<boolean | undefined>(undefined);

    const [video, setVideo] = useState<boolean | undefined>(undefined);
    const [audio, setAudio] = useState<boolean | undefined>(undefined);
    const [screen, setScreen] = useState<boolean | undefined>(undefined);

    // Call state: 'lobby' (pre-join), 'waiting' (waiting room / knocking), 'in-call', 'denied', 'kicked'
    const [callState, setCallState] = useState<'lobby' | 'waiting' | 'in-call' | 'denied' | 'kicked'>('lobby');
    const [kickedReason, setKickedReason] = useState<string>("");
    const [tabReplaced, setTabReplaced] = useState<boolean>(false);
    const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
    const [isHost, setIsHost] = useState<boolean>(false);
    const [hostName, setHostName] = useState<string>("Host");
    const [pendingKnocks, setPendingKnocks] = useState<KnockCandidate[]>([]);
    const [chatEnabled, setChatEnabled] = useState<boolean>(true);

    const [username, setUsername] = useState<string>("");
    const [activeDrawer, setActiveDrawer] = useState<'chat' | 'people' | 'host' | 'info' | 'more' | null>(null);
    const [showWhiteboard, setShowWhiteboard] = useState<boolean>(false);
    const [newWhiteboardActivity, setNewWhiteboardActivity] = useState<boolean>(false);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [message, setMessage] = useState<string>("");
    const [newMessages, setNewMessages] = useState<number>(0);

    const videoRef = useRef<VideoItem[]>([]);
    const [videos, setVideos] = useState<VideoItem[]>([]);
    const [spotlightVideo, setSpotlightVideo] = useState<string | null>(null);

    const [currentTime, setCurrentTime] = useState<string>("");
    const [copiedCode, setCopiedCode] = useState<boolean>(false);
    const [handRaised, setHandRaised] = useState<boolean>(false);
    const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});
    const [showReactionsPicker, setShowReactionsPicker] = useState<boolean>(false);
    const [reactions, setReactions] = useState<ReactionItem[]>([]);

    // 3-Second countdown timer for host admit prompt
    const [knockCountdown, setKnockCountdown] = useState<number>(3);
    const knockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Responsive mobile detection & 2-user slider state
    const [isMobile, setIsMobile] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return window.innerWidth <= 768;
        }
        return false;
    });
    const [mobileSlideIdx, setMobileSlideIdx] = useState<number>(0);
    const touchStartX = useRef<number | null>(null);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 768);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const routeTo = useNavigate();

    // Saves session to sessionStorage for persistent refresh re-entry
    const saveActiveSession = (uName: string, vid?: boolean, aud?: boolean) => {
        try {
            const roomCode = getRoomCode();
            sessionStorage.setItem(`apm_active_call_${roomCode}`, JSON.stringify({
                active: true,
                username: uName,
                video: vid !== undefined ? vid : (video ?? true),
                audio: aud !== undefined ? aud : (audio ?? true),
                timestamp: Date.now()
            }));
        } catch (e) { }
    };

    // Live clock updater
    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        };
        updateClock();
        const timer = setInterval(updateClock, 1000);
        return () => clearInterval(timer);
    }, []);

    const getRoomCode = (): string => {
        return window.location.pathname.replace(/^\/meet\/?/, '').replace(/^\//, '') || "default-meeting";
    };

    const handleCopyCode = (): void => {
        try {
            navigator.clipboard.writeText(window.location.href);
            setCopiedCode(true);
            setTimeout(() => setCopiedCode(false), 2200);
        } catch (e) {
            console.error("Clipboard copy failed", e);
        }
    };

    const getPermissions = async (initialVideo?: boolean, initialAudio?: boolean): Promise<MediaStream | null> => {
        let hasVideo = false;
        let hasAudio = false;

        try {
            const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoPermission) {
                hasVideo = true;
                setVideoAvailable(true);
                videoPermission.getTracks().forEach(track => track.stop());
            } else {
                setVideoAvailable(false);
            }
        } catch (e) {
            setVideoAvailable(false);
        }

        try {
            const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (audioPermission) {
                hasAudio = true;
                setAudioAvailable(true);
                audioPermission.getTracks().forEach(track => track.stop());
            } else {
                setAudioAvailable(false);
            }
        } catch (e) {
            setAudioAvailable(false);
        }

        if (navigator.mediaDevices.getDisplayMedia) {
            setScreenAvailable(true);
        } else {
            setScreenAvailable(false);
        }

        const wantVideo = initialVideo !== undefined ? (initialVideo && hasVideo) : hasVideo;
        const wantAudio = initialAudio !== undefined ? (initialAudio && hasAudio) : hasAudio;

        try {
            if (hasVideo || hasAudio) {
                const userMediaStream = await navigator.mediaDevices.getUserMedia({
                    video: wantVideo,
                    audio: wantAudio
                });
                if (userMediaStream) {
                    window.localStream = userMediaStream;
                    setLocalStream(userMediaStream);
                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = userMediaStream;
                    }
                    return userMediaStream;
                }
            }
        } catch (err) {
            console.log("Media setup note:", err);
        }
        return null;
    };

    const getUserMediaSuccess = (stream: MediaStream): void => {
        try {
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => track.stop());
            }
        } catch (e) {
            console.log(e);
        }

        window.localStream = stream;
        setLocalStream(stream);
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
        }

        for (const id in connectionsRef.current) {
            if (id === socketIdRef.current) continue;

            const senders = connectionsRef.current[id].getSenders();

            stream.getTracks().forEach(track => {
                const sender = senders.find(s => s.track && s.track.kind === track.kind);
                if (sender) {
                    sender.replaceTrack(track);
                } else {
                    connectionsRef.current[id].addTrack(track, stream);
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

            for (const id in connectionsRef.current) {
                const senders = connectionsRef.current[id].getSenders();
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
        const dst = oscillator.connect(ctx.createMediaStreamDestination()) as any;
        oscillator.start();
        ctx.resume();
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
    };

    const black = ({ width = 640, height = 480 } = {}): MediaStreamTrack => {
        const canvas = Object.assign(document.createElement("canvas"), { width, height });
        canvas.getContext('2d')?.fillRect(0, 0, width, height);
        const stream = (canvas as any).captureStream();
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
     * Helper to create or reuse an RTCPeerConnection for a remote peer socket
     */
    const createPeerConnection = (peerId: string): RTCPeerConnection => {
        if (connectionsRef.current[peerId]) {
            return connectionsRef.current[peerId];
        }

        const pc = new RTCPeerConnection(peerConfigConnections);
        connectionsRef.current[peerId] = pc;

        pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
            if (event.candidate != null) {
                socketRef.current?.emit("signal", peerId, JSON.stringify({ 'ice': event.candidate }));
            }
        };

        pc.ontrack = (event: RTCTrackEvent) => {
            const incomingStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
            const videoExists = videoRef.current.find(v => v.socketId === peerId);

            if (videoExists) {
                if (videoExists.stream === incomingStream) return;
                const updateVideos = videoRef.current.map(v =>
                    v.socketId === peerId ? { ...v, stream: incomingStream } : v
                );
                videoRef.current = updateVideos;
                setVideos(updateVideos);
            } else {
                const newVideo: VideoItem = {
                    socketId: peerId,
                    stream: incomingStream,
                    autoPlay: true,
                    playsinline: true
                };

                const updatedVideos = [...videoRef.current, newVideo];
                videoRef.current = updatedVideos;
                setVideos(updatedVideos);
            }
        };

        if (window.localStream) {
            window.localStream.getTracks().forEach(track => {
                pc.addTrack(track, window.localStream!);
            });
        } else {
            const blackSilence = (...args: any[]) => new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            window.localStream.getTracks().forEach(track => {
                pc.addTrack(track, window.localStream!);
            });
        }

        return pc;
    };

    const gotMessageFromServer = (fromId: string, messageStr: string): void => {
        if (!messageStr) return;
        let signal: any;
        try {
            signal = JSON.parse(messageStr);
        } catch (e) {
            return;
        }

        if (fromId !== socketIdRef.current && fromId !== socketRef.current?.id) {
            const peer = createPeerConnection(fromId);

            if (signal.sdp) {
                peer.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    if (signal.sdp.type === "offer") {
                        peer.createAnswer().then((description) => {
                            peer.setLocalDescription(description).then(() => {
                                socketRef.current?.emit("signal", fromId, JSON.stringify({ "sdp": peer.localDescription }));
                            }).catch(e => console.log(e));
                        }).catch(e => console.log(e));
                    }
                }).catch(e => console.log(e));
            }

            if (signal.ice) {
                peer.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e));
            }
        }
    };

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

        if (socketIdSender !== socketIdRef.current && activeDrawer !== 'chat') {
            setNewMessages((prev) => prev + 1);
        }
    };

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

    const connectToSocketServer = (overrideUsername?: string): void => {
        const activeUsername = (overrideUsername || username || "Guest").trim();
        if (socketRef.current) {
            socketRef.current.removeAllListeners();
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        socketRef.current = io(server_url);

        socketRef.current.on('signal', gotMessageFromServer);
        socketRef.current.off("chat-history").on("chat-history", handleChatHistory);
        socketRef.current.off("chat-message").on("chat-message", addMessage);

        socketRef.current.on("connect", () => {
            socketIdRef.current = socketRef.current.id;

            // Join call with room path, username, persistent client session ID, and stable user ID
            socketRef.current.emit("join-call", {
                path: window.location.pathname,
                username: activeUsername,
                clientId: getClientSessionId(),
                userId: getBrowserUserId()
            });

            // Host status update from server
            socketRef.current.on("host-status", (data: { isHost: boolean, hostSocketId?: string, hostName?: string, chatEnabled?: boolean }) => {
                setIsHost(data.isHost);
                if (data.hostName) setHostName(data.hostName);
                if (data.chatEnabled !== undefined) setChatEnabled(data.chatEnabled);
                setCallState('in-call');
                setIsReconnecting(false);
                saveActiveSession(activeUsername);
            });

            // Guest placed into waiting room
            socketRef.current.on("knock-waiting", (data: { message: string, hostName?: string }) => {
                if (data.hostName) setHostName(data.hostName);
                setCallState('waiting');
                setIsReconnecting(false);
            });

            // Host receives a knock request from candidate
            socketRef.current.on("knock-request", (candidate: KnockCandidate) => {
                setPendingKnocks(prev => {
                    if (prev.some(k => k.socketId === candidate.socketId)) return prev;
                    return [...prev, candidate];
                });
            });

            // Candidate admitted by host
            socketRef.current.on("admitted", () => {
                setCallState('in-call');
                setIsReconnecting(false);
                saveActiveSession(activeUsername);
            });

            // Candidate denied by host
            socketRef.current.on("denied", (data: { message: string }) => {
                setKickedReason(data.message || "The host denied your request to join.");
                setCallState('denied');
                setIsReconnecting(false);
                try { sessionStorage.removeItem(`apm_active_call_${getRoomCode()}`); } catch (e) { }
            });

            // Participant removed/kicked by host
            socketRef.current.on("kicked", (data: { message: string }) => {
                setKickedReason(data.message || "You were removed from the meeting by the host.");
                setCallState('kicked');
                setIsReconnecting(false);
                try { sessionStorage.removeItem(`apm_active_call_${getRoomCode()}`); } catch (e) { }
            });

            // Duplicate tab replaced event from backend
            socketRef.current.on("duplicate-tab-replaced", () => {
                setTabReplaced(true);
                for (const id in connectionsRef.current) {
                    try { connectionsRef.current[id].close(); } catch (e) { }
                }
                connectionsRef.current = {};
            });

            // Chat permission updated by host
            socketRef.current.on("chat-permission-changed", (enabled: boolean) => {
                setChatEnabled(enabled);
            });

            // Emoji reaction received
            socketRef.current.on("reaction-received", (item: { id: string, emoji: string, sender: string, socketId: string }) => {
                const randomX = Math.floor(Math.random() * 60) + 20; // 20% to 80% screen width
                const newReaction: ReactionItem = {
                    id: item.id,
                    emoji: item.emoji,
                    sender: item.sender,
                    left: randomX
                };
                setReactions(prev => [...prev, newReaction]);
                setTimeout(() => {
                    setReactions(prev => prev.filter(r => r.id !== item.id));
                }, 3000);
            });

            // Hand raise status changed
            socketRef.current.on("hand-raise-changed", (data: { socketId: string, sender: string, isRaised: boolean }) => {
                setRaisedHands(prev => ({
                    ...prev,
                    [data.socketId]: data.isRaised
                }));
            });

            // Whiteboard activity alert
            socketRef.current.off("whiteboard-started").on("whiteboard-started", () => {
                setNewWhiteboardActivity(true);
            });

            // User left room
            socketRef.current.off("user-left").on("user-left", (id: string) => {
                setVideos((vids) => vids.filter((v) => v.socketId !== id));
                videoRef.current = videoRef.current.filter((v) => v.socketId !== id);
                if (spotlightVideo === id) {
                    setSpotlightVideo(null);
                }
                if (connectionsRef.current[id]) {
                    try { connectionsRef.current[id].close(); } catch (e) { }
                    delete connectionsRef.current[id];
                }
                setPendingKnocks(prev => prev.filter(k => k.socketId !== id));
                setRaisedHands(prev => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                });
            });

            // New user joined room
            socketRef.current.off("user-joined").on("user-joined", (id: string, clients: string[]) => {
                clients.forEach((socketListId: string) => {
                    if (socketListId === socketIdRef.current || socketListId === socketRef.current?.id) return;
                    if (connectionsRef.current[socketListId]) return;

                    createPeerConnection(socketListId);
                });

                if (id === socketIdRef.current || id === socketRef.current?.id) {
                    for (const id2 in connectionsRef.current) {
                        if (id2 === socketIdRef.current || id2 === socketRef.current?.id) continue;

                        try {
                            connectionsRef.current[id2].createOffer().then((description) => {
                                connectionsRef.current[id2].setLocalDescription(description)
                                    .then(() => {
                                        socketRef.current?.emit("signal", id2, JSON.stringify({ "sdp": connectionsRef.current[id2].localDescription }));
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

    const connect = (): void => {
        const activeName = username.trim();
        if (!activeName) return;
        setTabReplaced(false);
        setVideo(videoAvailable);
        setAudio(audioAvailable);
        saveActiveSession(activeName, videoAvailable, audioAvailable);
        connectToSocketServer(activeName);

        const token = localStorage.getItem("token");
        const roomCode = getRoomCode();
        if (token && roomCode) {
            axios.post(`${server_url}/api/v1/users/add_to_activity`, {
                token,
                meeting_code: roomCode
            }).catch(e => console.log("History sync error:", e));
        }
    };

    // Initialize session: restore if refreshed, or load saved user name
    useEffect(() => {
        const roomCode = getRoomCode();
        let savedSession: any = null;
        try {
            const raw = sessionStorage.getItem(`apm_active_call_${roomCode}`);
            if (raw) savedSession = JSON.parse(raw);
        } catch (e) { }

        const storedUser = localStorage.getItem("user");
        let initialName = "";
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                if (parsed.name) initialName = parsed.name;
                else if (parsed.username) initialName = parsed.username;
            } catch (e) { }
        }

        if (savedSession && savedSession.active && savedSession.username) {
            // User was actively in this call before refresh!
            const restoredName = savedSession.username;
            setUsername(restoredName);
            setIsReconnecting(true);
            setCallState('in-call');

            const restoreVideo = savedSession.video !== undefined ? savedSession.video : true;
            const restoreAudio = savedSession.audio !== undefined ? savedSession.audio : true;
            setVideo(restoreVideo);
            setAudio(restoreAudio);

            getPermissions(restoreVideo, restoreAudio).then(() => {
                connectToSocketServer(restoredName);
            }).catch(() => {
                connectToSocketServer(restoredName);
            });
        } else {
            if (initialName) setUsername(initialName);
            getPermissions();
        }
    }, []);

    const handleVideo = (): void => {
        const next = !video;
        setVideo(next);
        saveActiveSession(username, next, audio);
    };

    const handleAudio = (): void => {
        const next = !audio;
        setAudio(next);
        saveActiveSession(username, video, next);
    };

    const handleScreen = (): void => {
        setScreen(!screen);
    };

    const getDisplayMediaSuccess = (stream: MediaStream): void => {
        try {
            window.localStream?.getTracks().forEach(track => track.stop());
        } catch (e) {
            console.log(e);
        }

        window.localStream = stream;
        setLocalStream(stream);
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
        }

        for (const id in connectionsRef.current) {
            if (id === socketIdRef.current) continue;

            const senders = connectionsRef.current[id].getSenders();

            stream.getTracks().forEach(track => {
                const sender = senders.find(s => s.track && s.track.kind === track.kind);
                if (sender) {
                    sender.replaceTrack(track);
                } else {
                    connectionsRef.current[id].addTrack(track, stream);
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

    const sendMessage = (): void => {
        if (!message.trim()) return;
        if (!chatEnabled && !isHost) return;

        socketRef.current?.emit("chat-message", message, username);
        setMessage("");
    };

    // 3-second countdown timer on the admit option when a participant knocks
    useEffect(() => {
        if (isHost && pendingKnocks.length > 0) {
            setKnockCountdown(3);
            const targetCandidate = pendingKnocks[0];

            if (knockTimerRef.current) clearInterval(knockTimerRef.current);

            let remaining = 3;
            knockTimerRef.current = setInterval(() => {
                remaining -= 1;
                setKnockCountdown(remaining);
                if (remaining <= 0) {
                    if (knockTimerRef.current) clearInterval(knockTimerRef.current);
                    handleAdmit(targetCandidate.socketId);
                }
            }, 1000);

            return () => {
                if (knockTimerRef.current) clearInterval(knockTimerRef.current);
            };
        } else {
            if (knockTimerRef.current) clearInterval(knockTimerRef.current);
        }
    }, [isHost, pendingKnocks[0]?.socketId]);

    // Host actions
    const handleAdmit = (targetSocketId: string): void => {
        if (knockTimerRef.current) clearInterval(knockTimerRef.current);
        socketRef.current?.emit("admit-user", targetSocketId);
        setPendingKnocks(prev => prev.filter(k => k.socketId !== targetSocketId));
    };

    const handleDeny = (targetSocketId: string): void => {
        if (knockTimerRef.current) clearInterval(knockTimerRef.current);
        socketRef.current?.emit("deny-user", targetSocketId);
        setPendingKnocks(prev => prev.filter(k => k.socketId !== targetSocketId));
    };

    const handleRemoveUser = (targetSocketId: string): void => {
        socketRef.current?.emit("remove-user", targetSocketId);
    };

    const handleToggleChatPermission = (enabled: boolean): void => {
        socketRef.current?.emit("toggle-chat-permission", enabled);
        setChatEnabled(enabled);
    };

    const handleSendReaction = (emoji: string): void => {
        socketRef.current?.emit("send-reaction", emoji);
        setShowReactionsPicker(false);
    };

    const handleToggleHandRaise = (): void => {
        const next = !handRaised;
        setHandRaised(next);
        socketRef.current?.emit("toggle-hand-raise", next);
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            for (const id in connectionsRef.current) {
                try {
                    connectionsRef.current[id].close();
                } catch (e) { }
            }
            connectionsRef.current = {};

            if (window.localStream) {
                try {
                    window.localStream.getTracks().forEach(t => t.stop());
                } catch (e) { }
                window.localStream = undefined;
            }

            if (socketRef.current) {
                try {
                    socketRef.current.removeAllListeners();
                    socketRef.current.disconnect();
                } catch (e) { }
                socketRef.current = null;
            }
        };
    }, []);

    const handleEndCall = (): void => {
        try {
            sessionStorage.removeItem(`apm_active_call_${getRoomCode()}`);
        } catch (e) { }

        for (const id in connectionsRef.current) {
            try { connectionsRef.current[id].close(); } catch (e) { }
        }
        connectionsRef.current = {};

        if (window.localStream) {
            try { window.localStream.getTracks().forEach(t => t.stop()); } catch (e) { }
            window.localStream = undefined;
        }

        if (socketRef.current) {
            try {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
            } catch (e) { }
            socketRef.current = null;
        }

        routeTo("/home");
    };

    // 0. Duplicate Tab Replaced Screen
    if (tabReplaced) {
        return (
            <div className={styles.waitingLobbyContainer}>
                <div className={styles.waitingCard}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <DevicesIcon style={{ color: '#3b82f6', fontSize: 32 }} />
                    </div>
                    <h2>Meeting Active in Another Tab</h2>
                    <p>You opened or joined this meeting in another tab or window. Only one active window is kept per account to avoid duplicate streams and audio feedback.</p>
                    <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                        <Button
                            variant="contained"
                            onClick={() => {
                                setTabReplaced(false);
                                connect();
                            }}
                            style={{ background: '#2563eb', borderRadius: 10, textTransform: 'none', fontWeight: 600 }}
                        >
                            Switch to this Tab
                        </Button>
                        <Button
                            variant="outlined"
                            onClick={handleEndCall}
                            style={{ color: '#cbd5e1', borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, textTransform: 'none' }}
                        >
                            Leave Meeting
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // 1. Lobby Screen (Enter name & check preview)
    if (callState === 'lobby') {
        return (
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
                            Ask to Join / Enter Meeting
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // 2. Waiting Room Screen (Guest waiting for host admission)
    if (callState === 'waiting') {
        return (
            <div className={styles.waitingLobbyContainer}>
                <div className={styles.waitingCard}>
                    <div className={styles.waitingPulseDot}>
                        <VideocamIcon style={{ color: '#fff', fontSize: 28 }} />
                    </div>
                    <h2>Asking to join...</h2>
                    <p>You will join the call when <strong>{hostName}</strong> lets you in.</p>
                    <Button
                        variant="outlined"
                        onClick={handleEndCall}
                        style={{ color: '#cbd5e1', borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, marginTop: 12, textTransform: 'none' }}
                    >
                        Cancel Request
                    </Button>
                </div>
            </div>
        );
    }

    // 3. Denied or Kicked Screen
    if (callState === 'denied' || callState === 'kicked') {
        return (
            <div className={styles.waitingLobbyContainer}>
                <div className={styles.waitingCard}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CloseIcon style={{ color: '#ef4444', fontSize: 32 }} />
                    </div>
                    <h2>{callState === 'kicked' ? "Removed from Meeting" : "Entry Denied"}</h2>
                    <p>{kickedReason}</p>
                    <Button
                        variant="contained"
                        onClick={() => routeTo("/home")}
                        style={{ background: '#2563eb', borderRadius: 10, marginTop: 12, textTransform: 'none' }}
                    >
                        Return to Dashboard
                    </Button>
                </div>
            </div>
        );
    }

    // 4. In-Call Google Meet Interface
    return (
        <div className={styles.meetContainer}>
            {isReconnecting && (
                <div style={{
                    position: 'absolute',
                    top: 64,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1000,
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    backdropFilter: 'blur(8px)',
                    color: '#60a5fa',
                    padding: '6px 18px',
                    borderRadius: 20,
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
                }}>
                    <span className={styles.lobbyLiveDot} style={{ background: '#60a5fa', boxShadow: '0 0 8px #60a5fa' }}></span>
                    Reconnecting to meeting...
                </div>
            )}
            {/* Top Bar (Clock, Meeting Code, Participant Counter Badge, Whiteboard Trigger) */}
            <div className={styles.topBar}>
                <div className={styles.topBarLeft}>
                    <span className={styles.liveClock}>{currentTime}</span>
                    <span className={styles.topDivider}>|</span>
                    <div
                        className={styles.meetingCodePill}
                        onClick={handleCopyCode}
                        title="Click to copy meeting link"
                    >
                        <span>{getRoomCode()}</span>
                        {copiedCode ? <CheckIcon style={{ fontSize: 15, color: '#10b981' }} /> : <ContentCopyIcon style={{ fontSize: 14 }} />}
                    </div>
                    <IconButton className={styles.topInfoBtn} onClick={() => setActiveDrawer(activeDrawer === 'more' ? null : 'more')} title="Meeting Info & Options">
                        <InfoOutlinedIcon style={{ fontSize: 18 }} />
                    </IconButton>
                </div>

                <div className={styles.topBarRight}>
                    <div className={styles.securityBadge} title="Call is active and secured">
                        <CheckIcon style={{ fontSize: 14 }} />
                        <span>Secured</span>
                    </div>

                    <div
                        className={styles.participantCountBadge}
                        onClick={() => setActiveDrawer(activeDrawer === 'people' ? null : 'people')}
                        title="View participants"
                    >
                        <div className={styles.badgeAvatarCircle}>
                            {(username || "U").substring(0, 2).toUpperCase()}
                        </div>
                        <span>{videos.length + 1}</span>
                    </div>

                    <div
                        className={styles.topWhiteboardBtn}
                        onClick={() => setShowWhiteboard(!showWhiteboard)}
                        title="Open Collaborative Whiteboard"
                    >
                        <DrawIcon style={{ fontSize: 16 }} />
                    </div>
                </div>
            </div>

            {/* Host Knocking Prompt Banner with 3-second auto-admit timer */}
            {isHost && pendingKnocks.length > 0 && (
                <div className={styles.knockToast}>
                    <div className={styles.knockToastProgressBar}>
                        <div
                            className={styles.knockToastProgressFill}
                            style={{ width: `${(knockCountdown / 3) * 100}%` }}
                        />
                    </div>
                    <div className={styles.knockText}>
                        <p><strong>{pendingKnocks[0].username}</strong> wants to join this call</p>
                        <span>Auto-admitting in <span className={styles.knockCountdownBadge}>{knockCountdown}s</span></span>
                    </div>
                    <div className={styles.knockActions}>
                        <button className={styles.denyBtn} onClick={() => handleDeny(pendingKnocks[0].socketId)}>
                            Deny
                        </button>
                        <button className={styles.admitBtn} onClick={() => handleAdmit(pendingKnocks[0].socketId)}>
                            Admit ({knockCountdown}s)
                        </button>
                    </div>
                </div>
            )}

            {/* Main Stage Video Area */}
            <div className={styles.mainStage}>
                <div className={styles.videoStage}>
                    {(() => {
                        // 1. Spotlight / Maximized Mode (Triggered when user clicks their video or any participant)
                        if (videos.length > 0 && spotlightVideo !== null) {
                            const isLocal = spotlightVideo === 'local';
                            const spotlightPeer = !isLocal ? videos.find(p => p.socketId === spotlightVideo) : null;

                            return (
                                <div className={styles.spotlightLayout}>
                                    {/* Main Maximized Stage */}
                                    <div className={`${styles.spotlightHero} ${isLocal ? (handRaised ? styles.spotlightHeroActiveSpeaker : '') : (spotlightPeer && raisedHands[spotlightPeer.socketId] ? styles.spotlightHeroActiveSpeaker : '')}`}>
                                        <button
                                            className={styles.spotlightUnpinBtn}
                                            onClick={() => setSpotlightVideo(null)}
                                            title="Minimize and return to grid view"
                                        >
                                            <PushPinIcon style={{ fontSize: 16, transform: 'rotate(45deg)' }} />
                                            <span>Minimize</span>
                                        </button>

                                        {isLocal ? (
                                            video === false ? (
                                                <div className={styles.cameraOffTile}>
                                                    <div className={`${styles.cameraOffAvatar} ${styles.avatarVariantBlue}`} style={{ width: 88, height: 88, fontSize: '2.2rem' }}>
                                                        {(username || "U").substring(0, 2).toUpperCase()}
                                                    </div>
                                                </div>
                                            ) : (
                                                <VideoPlayer
                                                    className={`${styles.tileVideo} ${styles.tileVideoSelf}`}
                                                    stream={localStream || window.localStream}
                                                    muted
                                                />
                                            )
                                        ) : spotlightPeer ? (
                                            <VideoPlayer
                                                className={styles.tileVideo}
                                                stream={spotlightPeer.stream}
                                            />
                                        ) : null}

                                        <div className={styles.tileNameBadge}>
                                            <span>{isLocal ? `${username || "You"} (You)` : (spotlightPeer?.username || `Participant ${videos.findIndex(p => p.socketId === spotlightVideo) + 1}`)}</span>
                                            {isLocal && isHost && <span className={styles.hostTag}>Host</span>}
                                        </div>

                                        {isLocal ? (
                                            !audio && (
                                                <div className={styles.tileMicBadge} title="Microphone muted">
                                                    <MicOffIcon style={{ fontSize: 15 }} />
                                                </div>
                                            )
                                        ) : (
                                            <div className={styles.tileMicBadge}>
                                                <MicIcon style={{ fontSize: 15 }} />
                                            </div>
                                        )}

                                        {((isLocal && handRaised) || (!isLocal && spotlightPeer && raisedHands[spotlightPeer.socketId])) && (
                                            <div className={styles.tileHandBadge}>
                                                <PanToolIcon style={{ fontSize: 14 }} />
                                                <span>Hand raised</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Minimized Participant Filmstrip */}
                                    <div className={styles.spotlightFilmstrip}>
                                        {/* If a remote peer is maximized, include local user in the filmstrip */}
                                        {!isLocal && (
                                            <div
                                                className={`${styles.minimizedTile} ${handRaised ? styles.minimizedTileActiveSpeaker : ''}`}
                                                onClick={() => setSpotlightVideo('local')}
                                                title="Click to maximize your video"
                                            >
                                                {video === false ? (
                                                    <div className={styles.cameraOffTile}>
                                                        <div className={`${styles.cameraOffAvatar} ${styles.avatarVariantBlue}`} style={{ width: 44, height: 44, fontSize: '1.1rem' }}>
                                                            {(username || "U").substring(0, 2).toUpperCase()}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <VideoPlayer
                                                        className={`${styles.tileVideo} ${styles.tileVideoSelf}`}
                                                        stream={localStream || window.localStream}
                                                        muted
                                                    />
                                                )}
                                                <div className={styles.tileNameBadge} style={{ fontSize: '0.72rem', bottom: 4, left: 4 }}>
                                                    <span>You</span>
                                                </div>
                                                {!audio && (
                                                    <div className={styles.tileMicBadge} style={{ top: 4, right: 4, width: 20, height: 20 }}>
                                                        <MicOffIcon style={{ fontSize: 11 }} />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Remote participants in filmstrip */}
                                        {videos.map((peer, idx) => {
                                            if (!isLocal && peer.socketId === spotlightVideo) return null;
                                            return (
                                                <div
                                                    key={peer.socketId}
                                                    className={`${styles.minimizedTile} ${raisedHands[peer.socketId] ? styles.minimizedTileActiveSpeaker : ''}`}
                                                    onClick={() => setSpotlightVideo(peer.socketId)}
                                                    title={`Click to maximize Participant ${idx + 1}`}
                                                >
                                                    <VideoPlayer
                                                        className={styles.tileVideo}
                                                        stream={peer.stream}
                                                    />
                                                    <div className={styles.tileNameBadge} style={{ fontSize: '0.72rem', bottom: 4, left: 4 }}>
                                                        <span>Participant {idx + 1}</span>
                                                    </div>
                                                    {raisedHands[peer.socketId] && (
                                                        <div className={styles.tileMicBadge} style={{ top: 4, right: 4, width: 20, height: 20, background: '#f59e0b' }}>
                                                            <PanToolIcon style={{ fontSize: 11 }} />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        }

                        // 2. 1 Participant (User alone on stage)
                        if (videos.length === 0) {
                            return (
                                <div className={styles.gridSingle}>
                                    <div className={`${styles.videoTile} ${handRaised ? styles.videoTileActiveSpeaker : ''}`}>
                                        {video === false ? (
                                            <div className={styles.cameraOffTile}>
                                                <div className={styles.cameraOffAvatar}>
                                                    {(username || "U").substring(0, 2).toUpperCase()}
                                                </div>
                                            </div>
                                        ) : (
                                            <VideoPlayer
                                                className={`${styles.tileVideo} ${styles.tileVideoSelf}`}
                                                stream={localStream || window.localStream}
                                                muted
                                            />
                                        )}

                                        <div className={styles.tileNameBadge}>
                                            <span>{username || "You"} (You)</span>
                                            {isHost && <span className={styles.hostTag}>Host</span>}
                                        </div>

                                        {!audio && (
                                            <div className={styles.tileMicBadge} title="Microphone muted">
                                                <MicOffIcon style={{ fontSize: 15 }} />
                                            </div>
                                        )}

                                        {handRaised && (
                                            <div className={styles.tileHandBadge}>
                                                <PanToolIcon style={{ fontSize: 14 }} />
                                                <span>Hand raised</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        // 3. 2 Participants (Google Meet 50/50 Side-by-Side Split Screen)
                        if (videos.length === 1) {
                            const peer = videos[0];
                            return (
                                <div className={styles.gridDouble}>
                                    {/* Local User Tile */}
                                    <div
                                        className={styles.videoTile}
                                        onClick={() => setSpotlightVideo('local')}
                                        style={{ cursor: 'pointer' }}
                                        title="Click to maximize your video"
                                    >
                                        {video === false ? (
                                            <div className={styles.cameraOffTile}>
                                                <div className={`${styles.cameraOffAvatar} ${styles.avatarVariantBlue}`}>
                                                    {(username || "U").substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className={styles.tileHoverActions}>
                                                    <button
                                                        className={styles.tileActionBtn}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSpotlightVideo('local');
                                                        }}
                                                        title="Maximize your video"
                                                    >
                                                        <PushPinIcon style={{ fontSize: 18 }} />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <VideoPlayer
                                                className={`${styles.tileVideo} ${styles.tileVideoSelf}`}
                                                stream={localStream || window.localStream}
                                                muted
                                            />
                                        )}

                                        <div className={styles.tileHoverActions}>
                                            <button
                                                className={styles.tileActionBtn}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSpotlightVideo('local');
                                                }}
                                                title="Maximize your video"
                                            >
                                                <PushPinIcon style={{ fontSize: 18 }} />
                                            </button>
                                        </div>

                                        <div className={styles.tileNameBadge}>
                                            <span>{username || "You"} (You)</span>
                                            {isHost && <span className={styles.hostTag}>Host</span>}
                                        </div>

                                        {!audio && (
                                            <div className={styles.tileMicBadge} title="Microphone muted">
                                                <MicOffIcon style={{ fontSize: 15 }} />
                                            </div>
                                        )}

                                        {handRaised && (
                                            <div className={styles.tileHandBadge}>
                                                <PanToolIcon style={{ fontSize: 14 }} />
                                                <span>Hand raised</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Remote Peer Tile */}
                                    <div
                                        className={styles.videoTile}
                                        onClick={() => setSpotlightVideo(peer.socketId)}
                                        style={{ cursor: 'pointer' }}
                                        title="Click to maximize participant"
                                    >
                                        <VideoPlayer
                                            className={styles.tileVideo}
                                            stream={peer.stream}
                                        />

                                        <div className={styles.tileHoverActions}>
                                            <button
                                                className={styles.tileActionBtn}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSpotlightVideo(peer.socketId);
                                                }}
                                                title="Maximize participant"
                                            >
                                                <PushPinIcon style={{ fontSize: 18 }} />
                                            </button>
                                            {isHost && (
                                                <button
                                                    className={styles.tileActionBtn}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveUser(peer.socketId);
                                                    }}
                                                    title="Remove participant"
                                                    style={{ color: '#ef4444' }}
                                                >
                                                    <PersonRemoveIcon style={{ fontSize: 18 }} />
                                                </button>
                                            )}
                                        </div>

                                        <div className={styles.tileNameBadge}>
                                            <span>{peer.username || "Participant 1"}</span>
                                        </div>

                                        {raisedHands[peer.socketId] && (
                                            <div className={styles.tileHandBadge}>
                                                <PanToolIcon style={{ fontSize: 14 }} />
                                                <span>Hand raised</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        // 4. 3+ Participants:
                        // On Mobile Screens: 2 users per slide stacked Up & Down with Slider
                        if (isMobile) {
                            const allMeetingParticipants: Array<{
                                type: 'local' | 'remote';
                                socketId: string;
                                username: string;
                                stream?: MediaStream;
                                isHost?: boolean;
                            }> = [
                                {
                                    type: 'local',
                                    socketId: 'local',
                                    username: username || "You",
                                    stream: localStream || window.localStream,
                                    isHost: isHost
                                },
                                ...videos.map(p => ({
                                    type: 'remote' as const,
                                    socketId: p.socketId,
                                    username: p.username || "Participant",
                                    stream: p.stream,
                                    isHost: false
                                }))
                            ];

                            const totalSlides = Math.ceil(allMeetingParticipants.length / 2);
                            const safeSlideIdx = Math.min(mobileSlideIdx, Math.max(0, totalSlides - 1));
                            const currentPair = allMeetingParticipants.slice(safeSlideIdx * 2, safeSlideIdx * 2 + 2);

                            return (
                                <div
                                    className={styles.mobileSliderContainer}
                                    onTouchStart={(e) => {
                                        touchStartX.current = e.touches[0].clientX;
                                    }}
                                    onTouchEnd={(e) => {
                                        if (touchStartX.current !== null) {
                                            const diff = touchStartX.current - e.changedTouches[0].clientX;
                                            if (diff > 45 && safeSlideIdx < totalSlides - 1) {
                                                setMobileSlideIdx(safeSlideIdx + 1);
                                            } else if (diff < -45 && safeSlideIdx > 0) {
                                                setMobileSlideIdx(safeSlideIdx - 1);
                                            }
                                            touchStartX.current = null;
                                        }
                                    }}
                                >
                                    {/* Previous Slide Button */}
                                    {safeSlideIdx > 0 && (
                                        <button
                                            type="button"
                                            className={`${styles.sliderNavBtn} ${styles.sliderNavPrev}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setMobileSlideIdx(safeSlideIdx - 1);
                                            }}
                                            title="Previous 2 participants"
                                        >
                                            <ChevronLeftIcon style={{ fontSize: 24 }} />
                                        </button>
                                    )}

                                    {/* Next Slide Button */}
                                    {safeSlideIdx < totalSlides - 1 && (
                                        <button
                                            type="button"
                                            className={`${styles.sliderNavBtn} ${styles.sliderNavNext}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setMobileSlideIdx(safeSlideIdx + 1);
                                            }}
                                            title="Next 2 participants"
                                        >
                                            <ChevronRightIcon style={{ fontSize: 24 }} />
                                        </button>
                                    )}

                                    {/* Two Users Stacked Up and Down */}
                                    <div className={styles.mobileSliderSlide}>
                                        {currentPair.map((p) => {
                                            if (p.type === 'local') {
                                                return (
                                                    <div
                                                        key="local"
                                                        className={styles.videoTile}
                                                        onClick={() => setSpotlightVideo('local')}
                                                        style={{ cursor: 'pointer' }}
                                                        title="Click to maximize your video"
                                                    >
                                                        {video === false ? (
                                                            <div className={styles.cameraOffTile}>
                                                                <div className={`${styles.cameraOffAvatar} ${styles.avatarVariantBlue}`}>
                                                                    {(username || "U").substring(0, 2).toUpperCase()}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <VideoPlayer
                                                                className={`${styles.tileVideo} ${styles.tileVideoSelf}`}
                                                                stream={localStream || window.localStream}
                                                                muted
                                                            />
                                                        )}

                                                        <div className={styles.tileHoverActions}>
                                                            <button
                                                                className={styles.tileActionBtn}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSpotlightVideo('local');
                                                                }}
                                                                title="Maximize your video"
                                                            >
                                                                <PushPinIcon style={{ fontSize: 18 }} />
                                                            </button>
                                                        </div>

                                                        <div className={styles.tileNameBadge}>
                                                            <span>{username || "You"} (You)</span>
                                                            {isHost && <span className={styles.hostTag}>Host</span>}
                                                        </div>

                                                        {!audio && (
                                                            <div className={styles.tileMicBadge} title="Microphone muted">
                                                                <MicOffIcon style={{ fontSize: 15 }} />
                                                            </div>
                                                        )}

                                                        {handRaised && (
                                                            <div className={styles.tileHandBadge}>
                                                                <PanToolIcon style={{ fontSize: 14 }} />
                                                                <span>Hand raised</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            } else {
                                                return (
                                                    <div
                                                        key={p.socketId}
                                                        className={styles.videoTile}
                                                        onClick={() => setSpotlightVideo(p.socketId)}
                                                        style={{ cursor: 'pointer' }}
                                                        title="Click to maximize participant"
                                                    >
                                                        <VideoPlayer
                                                            className={styles.tileVideo}
                                                            stream={p.stream}
                                                        />

                                                        <div className={styles.tileHoverActions}>
                                                            <button
                                                                className={styles.tileActionBtn}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSpotlightVideo(p.socketId);
                                                                }}
                                                                title="Maximize participant"
                                                            >
                                                                <PushPinIcon style={{ fontSize: 18 }} />
                                                            </button>
                                                            {isHost && (
                                                                <button
                                                                    className={styles.tileActionBtn}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleRemoveUser(p.socketId);
                                                                    }}
                                                                    title="Remove participant"
                                                                    style={{ color: '#ef4444' }}
                                                                >
                                                                    <PersonRemoveIcon style={{ fontSize: 18 }} />
                                                                </button>
                                                            )}
                                                        </div>

                                                        <div className={styles.tileNameBadge}>
                                                            <span>{p.username || "Participant"}</span>
                                                        </div>

                                                        {raisedHands[p.socketId] && (
                                                            <div className={styles.tileHandBadge}>
                                                                <PanToolIcon style={{ fontSize: 14 }} />
                                                                <span>Hand raised</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }
                                        })}
                                    </div>

                                    {/* Slider Pagination Dots and Counter */}
                                    {totalSlides > 1 && (
                                        <div className={styles.sliderPaginationBar}>
                                            {Array.from({ length: totalSlides }).map((_, sIdx) => (
                                                <span
                                                    key={sIdx}
                                                    className={sIdx === safeSlideIdx ? styles.sliderDotActive : styles.sliderDot}
                                                    onClick={() => setMobileSlideIdx(sIdx)}
                                                />
                                            ))}
                                            <span className={styles.sliderPageCounter}>
                                                {safeSlideIdx + 1} / {totalSlides}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        // On Desktop: Equal Multi-Grid with floating self-view
                        return (
                            <div className={styles.gridMulti}>
                                {videos.map((peer, idx) => (
                                    <div
                                        key={peer.socketId}
                                        className={styles.videoTile}
                                        onClick={() => setSpotlightVideo(peer.socketId)}
                                        style={{ cursor: 'pointer' }}
                                        title={`Click to maximize Participant ${idx + 1}`}
                                    >
                                        <VideoPlayer
                                            className={styles.tileVideo}
                                            stream={peer.stream}
                                        />

                                        <div className={styles.tileHoverActions}>
                                            <button
                                                className={styles.tileActionBtn}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSpotlightVideo(peer.socketId);
                                                }}
                                                title="Maximize participant"
                                            >
                                                <PushPinIcon style={{ fontSize: 18 }} />
                                            </button>
                                            {isHost && (
                                                <button
                                                    className={styles.tileActionBtn}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveUser(peer.socketId);
                                                    }}
                                                    title="Remove participant"
                                                    style={{ color: '#ef4444' }}
                                                >
                                                    <PersonRemoveIcon style={{ fontSize: 18 }} />
                                                </button>
                                            )}
                                        </div>

                                        <div className={styles.tileNameBadge}>
                                            <span>Participant {idx + 1}</span>
                                        </div>

                                        {raisedHands[peer.socketId] && (
                                            <div className={styles.tileHandBadge}>
                                                <PanToolIcon style={{ fontSize: 14 }} />
                                                <span>Hand raised</span>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* Floating Picture-in-Picture Local Tile */}
                                <div
                                    className={styles.floatingSelfPiP}
                                    onClick={() => setSpotlightVideo('local')}
                                    title="Click to maximize your video"
                                >
                                    <div className={styles.floatingPiPMaximizeHint}>
                                        <PushPinIcon style={{ fontSize: 11 }} />
                                        <span>Maximize</span>
                                    </div>
                                    {video === false ? (
                                        <div className={styles.cameraOffTile}>
                                            <div className={`${styles.cameraOffAvatar} ${styles.avatarVariantBlue}`} style={{ width: 52, height: 52, fontSize: '1.2rem' }}>
                                                {(username || "U").substring(0, 2).toUpperCase()}
                                            </div>
                                        </div>
                                    ) : (
                                        <VideoPlayer
                                            className={`${styles.tileVideo} ${styles.tileVideoSelf}`}
                                            stream={localStream || window.localStream}
                                            muted
                                        />
                                    )}
                                    <div className={styles.tileNameBadge} style={{ fontSize: '0.72rem', bottom: 6, left: 6 }}>
                                        <span>You</span>
                                    </div>
                                    {!audio && (
                                        <div className={styles.tileMicBadge} style={{ top: 6, right: 6, width: 22, height: 22 }}>
                                            <MicOffIcon style={{ fontSize: 12 }} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Bottom Toolbar (Google Meet Center Dock + Right Drawer Toggles) */}
            <div className={styles.bottomBar}>
                <div className={styles.bottomLeft}>
                    <span className={styles.bottomMeetingCode}>{getRoomCode()}</span>
                </div>

                {/* Center Floating Dock of Circular Action Buttons */}
                <div className={styles.bottomCenterDock}>
                    <IconButton
                        className={`${styles.ctrlBtn} ${audio === false ? styles.ctrlBtnOff : ''}`}
                        onClick={handleAudio}
                        title={audio ? "Turn off microphone" : "Turn on microphone"}
                    >
                        {audio === true ? <MicIcon style={{ fontSize: 20 }} /> : <MicOffIcon style={{ fontSize: 20 }} />}
                    </IconButton>

                    <IconButton
                        className={`${styles.ctrlBtn} ${video === false ? styles.ctrlBtnOff : ''}`}
                        onClick={handleVideo}
                        title={video ? "Turn off camera" : "Turn on camera"}
                    >
                        {video === true ? <VideocamIcon style={{ fontSize: 20 }} /> : <VideocamOffIcon style={{ fontSize: 20 }} />}
                    </IconButton>

                    {screenAvailable === true && (
                        <IconButton
                            className={`${styles.ctrlBtn} ${styles.ctrlBtnDesktopOnly} ${screen ? styles.ctrlBtnActive : ''}`}
                            onClick={handleScreen}
                            title={screen ? "Stop sharing screen" : "Share screen"}
                        >
                            {screen === true ? <StopScreenShareIcon style={{ fontSize: 20 }} /> : <ScreenShareIcon style={{ fontSize: 20 }} />}
                        </IconButton>
                    )}

                    {/* Emoji Reactions Trigger */}
                    <div style={{ position: 'relative' }}>
                        <IconButton
                            className={`${styles.ctrlBtn} ${showReactionsPicker ? styles.ctrlBtnActive : ''}`}
                            onClick={() => setShowReactionsPicker(!showReactionsPicker)}
                            title="Send a reaction"
                        >
                            <SentimentSatisfiedAltIcon style={{ fontSize: 20 }} />
                        </IconButton>

                        {showReactionsPicker && (
                            <div className={styles.reactionsPopup}>
                                {['👍', '❤️', '👏', '😂', '😮', '🎉'].map(emoji => (
                                    <button
                                        key={emoji}
                                        className={styles.reactionEmojiBtn}
                                        onClick={() => handleSendReaction(emoji)}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <IconButton
                        className={`${styles.ctrlBtn} ${styles.ctrlBtnDesktopOnly} ${showWhiteboard ? styles.ctrlBtnActive : ''}`}
                        onClick={() => {
                            setShowWhiteboard(!showWhiteboard);
                            setNewWhiteboardActivity(false);
                        }}
                        title="Whiteboard"
                    >
                        <DrawIcon style={{ fontSize: 20 }} />
                    </IconButton>

                    <IconButton
                        className={`${styles.ctrlBtn} ${handRaised ? styles.ctrlBtnHandActive : ''}`}
                        onClick={handleToggleHandRaise}
                        title={handRaised ? "Lower hand" : "Raise hand"}
                    >
                        <PanToolIcon style={{ fontSize: 20 }} />
                    </IconButton>

                    <IconButton
                        className={`${styles.ctrlBtn} ${activeDrawer === 'more' ? styles.ctrlBtnActive : ''}`}
                        onClick={() => setActiveDrawer(activeDrawer === 'more' ? null : 'more')}
                        title="More options"
                    >
                        <Badge badgeContent={newMessages} color="error" variant="dot">
                            <MoreVertIcon style={{ fontSize: 20 }} />
                        </Badge>
                    </IconButton>

                    {/* Red Pill Call End Button */}
                    <IconButton
                        className={styles.endCallPillBtn}
                        onClick={handleEndCall}
                        title="Leave call"
                    >
                        <CallEndIcon style={{ fontSize: 22 }} />
                    </IconButton>
                </div>

                {/* Right Bottom Toggles */}
                <div className={styles.bottomRightToggles}>
                    <IconButton
                        className={`${styles.drawerToggleBtn} ${activeDrawer === 'more' ? styles.drawerToggleBtnActive : ''}`}
                        onClick={() => setActiveDrawer(activeDrawer === 'more' ? null : 'more')}
                        title="Meeting details & options"
                    >
                        <InfoOutlinedIcon style={{ fontSize: 20 }} />
                    </IconButton>

                    <IconButton
                        className={`${styles.drawerToggleBtn} ${activeDrawer === 'people' ? styles.drawerToggleBtnActive : ''}`}
                        onClick={() => setActiveDrawer(activeDrawer === 'people' ? null : 'people')}
                        title="People"
                    >
                        <Badge badgeContent={videos.length + 1} color="primary">
                            <PeopleIcon style={{ fontSize: 20 }} />
                        </Badge>
                    </IconButton>

                    <IconButton
                        className={`${styles.drawerToggleBtn} ${activeDrawer === 'chat' ? styles.drawerToggleBtnActive : ''}`}
                        onClick={() => {
                            setActiveDrawer(activeDrawer === 'chat' ? null : 'chat');
                            setNewMessages(0);
                        }}
                        title="Chat with everyone"
                    >
                        <Badge badgeContent={newMessages} color="error">
                            <ChatIcon style={{ fontSize: 20 }} />
                        </Badge>
                    </IconButton>

                    {isHost && (
                        <IconButton
                            className={`${styles.drawerToggleBtn} ${activeDrawer === 'host' ? styles.drawerToggleBtnActive : ''}`}
                            onClick={() => setActiveDrawer(activeDrawer === 'host' ? null : 'host')}
                            title="Host controls"
                        >
                            <LockIcon style={{ fontSize: 20 }} />
                        </IconButton>
                    )}
                </div>
            </div>

            {/* Floating Animated Reaction Particles */}
            {reactions.map(r => (
                <div key={r.id} className={styles.floatingParticle} style={{ left: `${r.left}%` }}>
                    {r.emoji}
                </div>
            ))}

            {/* In-Call Messages Drawer (Matching Screenshot 1) */}
            {activeDrawer === 'chat' && (
                <div className={styles.sideDrawer}>
                    <div className={styles.drawerHeader}>
                        <span className={styles.drawerTitle}>In-call messages</span>
                        <button className={styles.drawerCloseBtn} onClick={() => setActiveDrawer(null)} title="Close">
                            <CloseIcon style={{ fontSize: 18 }} />
                        </button>
                    </div>

                    {/* Host Permission Switch (Screenshot 1) */}
                    {isHost && (
                        <div className={styles.hostChatSwitchRow}>
                            <span>Let participants send messages</span>
                            <Switch
                                checked={chatEnabled}
                                onChange={(e) => handleToggleChatPermission(e.target.checked)}
                                color="primary"
                                size="small"
                            />
                        </div>
                    )}

                    {/* Continuous Chat Disclaimer Alert (Screenshot 1) */}
                    <div className={styles.chatDisclaimerBox}>
                        <div className={styles.chatDisclaimerHeader}>
                            <span>💬 Continuous chat is turned off</span>
                        </div>
                        <span>Messages will not be saved for meeting participants when the call ends. You can send messages to people who are currently in the call.</span>
                    </div>

                    {/* Empty Chat Illustration or Chat Feed */}
                    {messages.length === 0 ? (
                        <div className={styles.chatEmptyState}>
                            <svg className={styles.emptyIllustrationSvg} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="100" cy="100" r="90" fill="#1e293b" opacity="0.4" />
                                <rect x="40" y="55" width="75" height="55" rx="10" fill="#2563eb" opacity="0.8" />
                                <path d="M55 110 L55 125 L75 110 Z" fill="#2563eb" opacity="0.8" />
                                <circle cx="130" cy="85" r="30" fill="#f87171" opacity="0.9" />
                                <path d="M110 150 C110 120 150 120 150 150 Z" fill="#60a5fa" />
                            </svg>
                            <p>No chat messages yet</p>
                        </div>
                    ) : (
                        <div className={styles.chatMessagesList}>
                            {messages.map(item => {
                                const isSelf = item.sender === username;
                                return (
                                    <div key={item.id} className={`${styles.chatMsgItem} ${isSelf ? styles.chatMsgSelf : styles.chatMsgOther}`}>
                                        <div className={styles.chatMsgMeta}>
                                            <span>{isSelf ? "You" : item.sender}</span>
                                            <span>{new Date(item.timestamp || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div className={styles.chatMsgBubble}>
                                            {item.data}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Capsule Message Input Dock */}
                    <div className={styles.chatInputDock}>
                        <input
                            type="text"
                            className={styles.chatInputCapsule}
                            placeholder={!chatEnabled && !isHost ? "Chat is disabled by the host" : "Send a message..."}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            disabled={!chatEnabled && !isHost}
                            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                        />
                        <button
                            className={styles.chatSendBtn}
                            onClick={sendMessage}
                            disabled={!message.trim() || (!chatEnabled && !isHost)}
                            title="Send message"
                        >
                            <SendIcon style={{ fontSize: 16 }} />
                        </button>
                    </div>
                </div>
            )}

            {/* People / Participants Drawer */}
            {activeDrawer === 'people' && (
                <div className={styles.sideDrawer}>
                    <div className={styles.drawerHeader}>
                        <span className={styles.drawerTitle}>People ({videos.length + 1})</span>
                        <button className={styles.drawerCloseBtn} onClick={() => setActiveDrawer(null)} title="Close">
                            <CloseIcon style={{ fontSize: 18 }} />
                        </button>
                    </div>

                    <div style={{ padding: '12px 16px 4px 16px' }}>
                        <Button
                            variant="outlined"
                            fullWidth
                            onClick={handleCopyCode}
                            style={{ borderColor: 'rgba(255,255,255,0.15)', color: '#60a5fa', textTransform: 'none', borderRadius: 10, fontSize: '0.84rem' }}
                        >
                            {copiedCode ? "Link Copied!" : "+ Add people / Copy link"}
                        </Button>
                    </div>

                    {/* Waiting Room Queue for Host */}
                    {isHost && pendingKnocks.length > 0 && (
                        <div style={{ padding: '8px 16px' }}>
                            <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 600 }}>Waiting to join ({pendingKnocks.length})</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                                {pendingKnocks.map(k => (
                                    <div key={k.socketId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '6px 10px', borderRadius: 8 }}>
                                        <span style={{ fontSize: '0.84rem', color: '#fff' }}>{k.username}</span>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className={styles.denyBtn} onClick={() => handleDeny(k.socketId)} style={{ padding: '2px 8px', fontSize: '0.74rem' }}>Deny</button>
                                            <button className={styles.admitBtn} onClick={() => handleAdmit(k.socketId)} style={{ padding: '2px 8px', fontSize: '0.74rem' }}>Admit</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className={styles.peopleListFeed}>
                        {/* Local User */}
                        <div className={styles.peopleItem}>
                            <div className={styles.peopleInfo}>
                                <div className={styles.peopleAvatar}>
                                    {(username || "U").substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <div className={styles.peopleName}>{username || "You"} (You)</div>
                                    <div className={styles.peopleRole}>{isHost ? "Meeting host" : "Participant"}</div>
                                </div>
                            </div>
                            <div className={styles.peopleActions}>
                                {audio ? <MicIcon style={{ fontSize: 18, color: "#10b981" }} /> : <MicOffIcon style={{ fontSize: 18, color: "#ef4444" }} />}
                            </div>
                        </div>

                        {/* Remote Participants */}
                        {videos.map((peer, idx) => (
                            <div key={peer.socketId} className={styles.peopleItem}>
                                <div className={styles.peopleInfo}>
                                    <div className={styles.peopleAvatar}>
                                        {`P${idx + 1}`}
                                    </div>
                                    <div>
                                        <div className={styles.peopleName}>Participant {idx + 1}</div>
                                        <div className={styles.peopleRole}>Guest</div>
                                    </div>
                                </div>
                                <div className={styles.peopleActions}>
                                    <MicIcon style={{ fontSize: 18, color: "#10b981" }} />
                                    {isHost && (
                                        <button
                                            className={styles.kickBtn}
                                            onClick={() => handleRemoveUser(peer.socketId)}
                                            title="Remove participant from call"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Host Controls Drawer */}
            {isHost && activeDrawer === 'host' && (
                <div className={styles.sideDrawer}>
                    <div className={styles.drawerHeader}>
                        <span className={styles.drawerTitle}>Host controls</span>
                        <button className={styles.drawerCloseBtn} onClick={() => setActiveDrawer(null)} title="Close">
                            <CloseIcon style={{ fontSize: 18 }} />
                        </button>
                    </div>

                    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.45 }}>
                            Use these host settings to keep control of your meeting. Only hosts have access to these controls.
                        </div>

                        <div className={styles.hostChatSwitchRow} style={{ padding: 0, border: 'none', background: 'transparent' }}>
                            <div>
                                <div style={{ color: '#ffffff', fontWeight: 500 }}>Let participants send chat messages</div>
                                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Turn off to restrict chat to hosts only</div>
                            </div>
                            <Switch
                                checked={chatEnabled}
                                onChange={(e) => handleToggleChatPermission(e.target.checked)}
                                color="primary"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* More Options & Meeting Details Drawer */}
            {(activeDrawer === 'more' || activeDrawer === 'info') && (
                <div className={styles.sideDrawer}>
                    <div className={styles.drawerHeader}>
                        <span className={styles.drawerTitle}>Meeting options & info</span>
                        <button className={styles.drawerCloseBtn} onClick={() => setActiveDrawer(null)} title="Close">
                            <CloseIcon style={{ fontSize: 18 }} />
                        </button>
                    </div>

                    <div className={styles.moreOptionsList}>
                        {/* Messages / Chat */}
                        <div
                            className={styles.moreOptionItem}
                            onClick={() => {
                                setActiveDrawer('chat');
                                setNewMessages(0);
                            }}
                        >
                            <div className={styles.moreOptionIconWrap}>
                                <Badge badgeContent={newMessages} color="error">
                                    <ChatIcon style={{ fontSize: 22, color: '#60a5fa' }} />
                                </Badge>
                            </div>
                            <div className={styles.moreOptionInfo}>
                                <div className={styles.moreOptionTitle}>In-call messages</div>
                                <div className={styles.moreOptionSub}>Send messages to participants</div>
                            </div>
                        </div>

                        {/* People */}
                        <div
                            className={styles.moreOptionItem}
                            onClick={() => setActiveDrawer('people')}
                        >
                            <div className={styles.moreOptionIconWrap}>
                                <PeopleIcon style={{ fontSize: 22, color: '#34d399' }} />
                            </div>
                            <div className={styles.moreOptionInfo}>
                                <div className={styles.moreOptionTitle}>People ({videos.length + 1})</div>
                                <div className={styles.moreOptionSub}>View and manage participants</div>
                            </div>
                        </div>

                        {/* Whiteboard */}
                        <div
                            className={styles.moreOptionItem}
                            onClick={() => {
                                setShowWhiteboard(true);
                                setActiveDrawer(null);
                            }}
                        >
                            <div className={styles.moreOptionIconWrap}>
                                <DrawIcon style={{ fontSize: 22, color: '#f59e0b' }} />
                            </div>
                            <div className={styles.moreOptionInfo}>
                                <div className={styles.moreOptionTitle}>Collaborative Whiteboard</div>
                                <div className={styles.moreOptionSub}>Draw and brainstorm in real time</div>
                            </div>
                        </div>

                        {/* Screen Share */}
                        {screenAvailable && (
                            <div
                                className={styles.moreOptionItem}
                                onClick={() => {
                                    handleScreen();
                                    setActiveDrawer(null);
                                }}
                            >
                                <div className={styles.moreOptionIconWrap}>
                                    <ScreenShareIcon style={{ fontSize: 22, color: screen ? '#ef4444' : '#a78bfa' }} />
                                </div>
                                <div className={styles.moreOptionInfo}>
                                    <div className={styles.moreOptionTitle}>{screen ? "Stop sharing screen" : "Share screen"}</div>
                                    <div className={styles.moreOptionSub}>Present your screen to everyone</div>
                                </div>
                            </div>
                        )}

                        {/* Host Controls */}
                        {isHost && (
                            <div
                                className={styles.moreOptionItem}
                                onClick={() => setActiveDrawer('host')}
                            >
                                <div className={styles.moreOptionIconWrap}>
                                    <LockIcon style={{ fontSize: 22, color: '#ec4899' }} />
                                </div>
                                <div className={styles.moreOptionInfo}>
                                    <div className={styles.moreOptionTitle}>Host controls</div>
                                    <div className={styles.moreOptionSub}>Meeting security and permissions</div>
                                </div>
                            </div>
                        )}

                        {/* Joining Info Card */}
                        <div className={styles.moreOptionCard}>
                            <div className={styles.moreOptionCardHeader}>
                                <span>Joining info</span>
                                <Button
                                    size="small"
                                    onClick={handleCopyCode}
                                    style={{ color: '#60a5fa', textTransform: 'none', fontSize: '0.8rem' }}
                                    startIcon={copiedCode ? <CheckIcon style={{ fontSize: 14 }} /> : <ContentCopyIcon style={{ fontSize: 14 }} />}
                                >
                                    {copiedCode ? "Copied" : "Copy link"}
                                </Button>
                            </div>
                            <div style={{ fontSize: '0.84rem', color: '#94a3b8', marginTop: 6, wordBreak: 'break-all' }}>
                                {window.location.href}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
                                Meeting code: <strong>{getRoomCode()}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Collaborative Glass Whiteboard Overlay */}
            <Whiteboard
                isOpen={showWhiteboard}
                onClose={() => setShowWhiteboard(false)}
                socketRef={socketRef}
                username={username || "Host"}
            />
        </div>
    );
}
