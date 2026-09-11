// Main video meeting component: manages WebRTC peer connections, socket events, and whiteboard
import React, { useEffect, useRef, useState } from "react";
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import styles from "../styles/VideoComponent.module.css"
import { io } from "socket.io-client";
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
import Whiteboard from "../components/Whiteboard";
import { useNavigate } from "react-router-dom";
import server from "../environment";

const server_url = server;

// Active WebRTC connections keyed by peer socket id: { [socketId]: RTCPeerConnection }
var connections = {};

// Free Google STUN servers for NAT traversal
const peerConfigConnections = {
    "iceServers": [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" }
    ]
}

export default function VideoMeetComponent() {
    var socketRef = useRef();
    let socketIdRef = useRef();
    let localVideoRef = useRef();

    let [videoAvailable, setVideoAvailable] = useState(true);
    let [audioAvailable, setAudioAvailable] = useState(true);
    let [screenAvailable, setScreenAvailable] = useState();

    let [video, setVideo] = useState();
    let [audio, setAudio] = useState();
    let [screen, setScreen] = useState();

    let [showModal, setShowModal] = useState(false); // Chat panel toggle
    let [showWhiteboard, setShowWhiteboard] = useState(false); // Whiteboard toggle
    let [whiteboardNotification, setWhiteboardNotification] = useState({ open: false, sender: "" }); // "User opened whiteboard" popup
    let [newWhiteboardActivity, setNewWhiteboardActivity] = useState(false);

    let [messages, setMessages] = useState([]);
    let [message, setMessage] = useState("");
    let [newMessages, setNewMessages] = useState(0);

    let [askForUsername, setAskForUsername] = useState(true); // Lobby screen toggle
    let [username, setUsername] = useState("");

    const videoRef = useRef([]);
    let [videos, setVideos] = useState([]);
    let [spotlightVideo, setSpotlightVideo] = useState(null); // Clicked video pinned in spotlight mode

    const getPermissions = async () => {
        try {
            const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true })
            if (videoPermission) {
                setVideoAvailable(true);
                videoPermission.getTracks().forEach(track => track.stop());
            } else {
                setVideoAvailable(false);
            }

            const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true })
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
    }

    useEffect(() => {
        getPermissions();
    }, [])

    let getUserMediaSuccess = (stream) => {
        try {
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => track.stop())
            }
        } catch (e) {
            console.log(e);
        }

        window.localStream = stream;
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
        }

        for (let id in connections) {
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
                    let tracks = localVideoRef.current.srcObject.getTracks()
                    tracks.forEach(track => track.stop())
                }
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = window.localStream;
            }

            for (let id in connections) {
                const senders = connections[id].getSenders();
                window.localStream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track && s.track.kind === track.kind);
                    if (sender) {
                        sender.replaceTrack(track);
                    }
                });
            }
        })
    }

    let silence = () => {
        let ctx = new AudioContext();
        let oscillator = ctx.createOscillator();

        let dst = oscillator.connect(ctx.createMediaStreamDestination());

        oscillator.start();
        ctx.resume()
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
    }

    let black = ({ width = 640, height = 480 } = {}) => {
        let canvas = Object.assign(document.createElement("canvas"), { width, height });

        canvas.getContext('2d').fillRect(0, 0, width, height);
        let stream = canvas.captureStream();
        return Object.assign(stream.getVideoTracks()[0], { enabled: false })
    }

    let getUserMedia = () => {
        if ((video && videoAvailable) || (audio && audioAvailable)) {
            navigator.mediaDevices.getUserMedia({ video: video, audio: audio })
                .then(getUserMediaSuccess)
                .then((stream) => { })
                .catch((e) => console.log(e))
        } else {
            try {
                if (localVideoRef.current && localVideoRef.current.srcObject) {
                    let tracks = localVideoRef.current.srcObject.getTracks();
                    tracks.forEach(track => track.stop());
                }
            } catch (e) { }
        }
    }

    useEffect(() => {
        if (video !== undefined && audio !== undefined) {
            getUserMedia();
        }
    }, [audio, video])

    /**
     * WEBRTC SIGNALING MESSAGE DISPATCHER:
     * Receives SDP offers, SDP answers, and ICE candidates routed via Socket.IO.
     */
    let gotMessageFromServer = (fromId, message) => {
        var signal = JSON.parse(message)

        if (fromId !== socketIdRef.current) {
            // 1. Session Description Protocol (SDP) exchange
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    // If received an offer, create an answer and send back to caller
                    if (signal.sdp.type === "offer") {
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current.emit("signal", fromId, JSON.stringify({ "sdp": connections[fromId].localDescription }))
                            }).catch(e => console.log(e));
                        }).catch(e => console.log(e));
                    }
                }).catch(e => console.log(e))
            }

            // 2. Interactive Connectivity Establishment (ICE) candidate exchange
            if (signal.ice) {
                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e))
            }
        }
    }

    let addMessage = (data, sender, socketIdSender) => {
        setMessages((prevMessages) => [
            ...prevMessages, { sender: sender, data: data }
        ]);

        if (socketIdSender !== socketIdRef.current) {
            setNewMessages((prevMessages) => prevMessages + 1);
        }
    }

    // Connects to signaling server and listens for WebRTC & chat events
    let connectToSocketServer = () => {
        socketRef.current = io.connect(server_url)

        socketRef.current.on('signal', gotMessageFromServer)

        socketRef.current.on("connect", () => {
            // Join room using pathname so localhost and LAN mobile IP land in the same room
            socketRef.current.emit("join-call", window.location.pathname)

            socketIdRef.current = socketRef.current.id;

            socketRef.current.on("chat-message", addMessage)

            // Popup alert when someone starts using the whiteboard
            socketRef.current.on("whiteboard-started", (senderName) => {
                setWhiteboardNotification({
                    open: true,
                    sender: senderName || "A participant",
                });
                setNewWhiteboardActivity(true);
            });

            // Remove participant video and close connection when they leave
            socketRef.current.on("user-left", (id) => {
                setVideos((videos) => videos.filter((video) => video.socketId !== id));
                videoRef.current = videoRef.current.filter((video) => video.socketId !== id);
                if (connections[id]) {
                    try { connections[id].close(); } catch (e) { }
                    delete connections[id];
                }
            })

            // Set up WebRTC connection whenever a new user joins
            socketRef.current.on("user-joined", (id, clients) => {
                clients.forEach((socketListId) => {
                    connections[socketListId] = new RTCPeerConnection(peerConfigConnections);

                    connections[socketListId].onicecandidate = (event) => {
                        if (event.candidate != null) {
                            socketRef.current.emit("signal", socketListId, JSON.stringify({ 'ice': event.candidate }))
                        }
                    }

                    // Attach remote video track (supports mobile Safari stream fallback)
                    connections[socketListId].ontrack = (event) => {
                        const incomingStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
                        let videoExists = videoRef.current.find(video => video.socketId === socketListId);

                        if (videoExists) {
                            let updateVideos = videoRef.current.map(video =>
                                video.socketId === socketListId ? { ...video, stream: incomingStream } : video
                            );
                            videoRef.current = updateVideos;
                            setVideos(updateVideos);
                        } else {
                            let newVideo = {
                                socketId: socketListId,
                                stream: incomingStream,
                                autoPlay: true,
                                playsinline: true
                            }
                            
                            let updatedVideos = [...videoRef.current, newVideo];
                            videoRef.current = updatedVideos;
                            setVideos(updatedVideos);
                        }
                    };

                    if (window.localStream !== undefined && window.localStream !== null) {
                        window.localStream.getTracks().forEach(track => {
                            connections[socketListId].addTrack(track, window.localStream);
                        });
                    } else {
                        let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
                        window.localStream = blackSilence();
                        window.localStream.getTracks().forEach(track => {
                            connections[socketListId].addTrack(track, window.localStream);
                        });
                    }
                })

                if (id === socketIdRef.current) {
                    for (let id2 in connections) {
                        if (id2 === socketIdRef.current) continue

                        try {
                            connections[id2].createOffer().then((description) => {
                                connections[id2].setLocalDescription(description)
                                    .then(() => {
                                        socketRef.current.emit("signal", id2, JSON.stringify({ "sdp": connections[id2].localDescription }))
                                    })
                                    .catch(e => console.log(e))
                            })
                        } catch (e) {
                            console.log(e)
                        }
                    }
                }
            })
        })
    }

    let getMedia = () => {
        setVideo(videoAvailable);
        setAudio(audioAvailable);
        connectToSocketServer();
    }

    let routeTo = useNavigate();

    let connect = () => {
        if (!username.trim()) return;
        setAskForUsername(false);
        getMedia();
    }

    let handleVideo = () => {
        setVideo(!video);
    }

    let handleAudio = () => {
        setAudio(!audio);
    }

    let handleChat = () => {
        setShowModal(!showModal);
        setNewMessages(0);
    }

    let getDisplayMediaSuccess = (stream) => {
        try {
            window.localStream.getTracks().forEach(track => track.stop());
        } catch (e) {
            console.log(e)
        }

        window.localStream = stream;
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
        }

        for (let id in connections) {
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
                    let tracks = localVideoRef.current.srcObject.getTracks()
                    tracks.forEach(track => track.stop())
                }
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = window.localStream;
            }

            getUserMedia();
        })
    }

    let getDisplayMedia = () => {
        if (screen) {
            if (navigator.mediaDevices.getDisplayMedia) {
                navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                    .then(getDisplayMediaSuccess)
                    .then((stream) => { })
                    .catch((e) => console.log(e));
            }
        }
    }

    useEffect(() => {
        if (screen !== undefined) {
            getDisplayMedia();
        }
    }, [screen])

    let handleScreen = () => {
        setScreen(!screen)
    }

    let sendMessage = () => {
        if (!message.trim()) {
            return;
        }
        socketRef.current.emit("chat-message", message, username);
        setMessage("");
    }

    let handleVideoClick = (socketId) => {
        if (spotlightVideo === socketId) {
            setSpotlightVideo(null); // Exit spotlight mode
        } else {
            setSpotlightVideo(socketId); // Enter spotlight mode
        }
    }

    let handleLocalVideoClick = () => {
        if (spotlightVideo === 'local') {
            setSpotlightVideo(null);
        } else {
            setSpotlightVideo('local');
        }
    }

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

    let handleEndCall = () => {
        try {
            if (localVideoRef.current && localVideoRef.current.srcObject) {
                let tracks = localVideoRef.current.srcObject.getTracks();
                tracks.forEach(track => track.stop());
            }
        } catch (e) {
            console.log(e);
        }

        // Close all peer connections
        for (let id in connections) {
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
    }

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
                    {/* Chat Panel with slide animation */}
                    <div className={`${styles.chatRoom} ${showModal ? styles.open : ''}`}>
                        <div className={styles.chatContainer}>
                            <div className={styles.chatHeader}>
                                <span>In-Call Messages</span>
                                <button
                                    onClick={handleChat}
                                    className={styles.chatCloseBtn}
                                    title="Close Chat"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className={styles.chattingDisplay}>
                                {messages.length > 0 ? messages.map((item, index) => {
                                    return (
                                        <div
                                            key={index}
                                            className={`${styles.chatMessage} ${item.sender === username ? styles.myMessage : styles.otherMessage
                                                }`}
                                        >
                                            <span className={styles.sender}>{item.sender}</span>
                                            <p className={styles.messageText}>{item.data}</p>
                                        </div>
                                    )
                                }) : <p className={styles.noMessages}>No messages yet. Say hello!</p>}
                            </div>

                            <div className={styles.chattingArea}>
                                <TextField
                                    id="outlined-basic"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            sendMessage();
                                        }
                                    }}
                                    placeholder="Send a message..."
                                    variant="outlined"
                                    fullWidth
                                    size="small"
                                    className="glassTextField"
                                />
                                <Button
                                    variant="contained"
                                    onClick={sendMessage}
                                    disabled={!message.trim()}
                                    className={styles.chatSendBtn}
                                >
                                    Send
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Video Area - dynamically resizes when chat opens */}
                    <div className={`${styles.videoArea} ${showModal ? styles.chatOpen : ''}`}>
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

                        {/* Spotlight Mode or Grid Mode */}
                        {spotlightVideo ? (
                            // Spotlight View: Large main video + thumbnail strip
                            <div className={styles.spotlightContainer}>
                                <div className={styles.mainVideoContainer}>
                                    {spotlightVideo === 'local' ? (
                                        <video
                                            className={styles.mainVideo}
                                            ref={localVideoRef}
                                            autoPlay
                                            muted
                                            onClick={handleLocalVideoClick}
                                        />
                                    ) : (
                                        videos.filter(v => v.socketId === spotlightVideo).map((video) => (
                                            <div key={video.socketId} className={styles.videoWrapper}>
                                                <video
                                                    className={styles.mainVideo}
                                                    ref={ref => {
                                                        if (ref && video.stream) {
                                                            ref.srcObject = video.stream;
                                                        }
                                                    }}
                                                    autoPlay
                                                    onClick={() => handleVideoClick(video.socketId)}
                                                />
                                                <div className={styles.videoLabel}>
                                                    <span>Participant</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Thumbnail strip */}
                                <div className={styles.thumbnailStrip}>
                                    {/* Local video thumbnail */}
                                    {spotlightVideo !== 'local' && (
                                        <div className={styles.thumbnailWrapper} onClick={handleLocalVideoClick}>
                                            <video
                                                className={styles.thumbnailVideo}
                                                ref={localVideoRef}
                                                autoPlay
                                                muted
                                            />
                                            <div className={styles.thumbnailLabel}>
                                                <span>{username} (You)</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Remote video thumbnails */}
                                    {videos.filter(v => v.socketId !== spotlightVideo).map((video) => (
                                        <div
                                            key={video.socketId}
                                            className={styles.thumbnailWrapper}
                                            onClick={() => handleVideoClick(video.socketId)}
                                        >
                                            <video
                                                className={styles.thumbnailVideo}
                                                ref={ref => {
                                                    if (ref && video.stream) {
                                                        ref.srcObject = video.stream;
                                                    }
                                                }}
                                                autoPlay
                                            />
                                            <div className={styles.thumbnailLabel}>
                                                <span>Participant</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            // Grid View: All videos in responsive grid
                            <>
                                <div className={styles.conferenceView}>
                                    {videos.map((video) => (
                                        <div
                                            key={video.socketId}
                                            onClick={() => handleVideoClick(video.socketId)}
                                            className={styles.videoTile}
                                        >
                                            <video
                                                data-socket={video.socketId}
                                                ref={ref => {
                                                    if (ref && video.stream) {
                                                        ref.srcObject = video.stream;
                                                    }
                                                }}
                                                autoPlay
                                            ></video>
                                            <div className={styles.videoLabel}>
                                                <span>Participant</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Local video (Picture-in-Picture) - only show in grid mode */}
                                <div className={styles.pipWrapper} onClick={handleLocalVideoClick}>
                                    <video
                                        className={styles.meetUserVideo}
                                        ref={localVideoRef}
                                        autoPlay
                                        muted
                                    ></video>
                                    <div className={styles.pipLabel}>
                                        <span>{username || "You"} (You)</span>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Bottom floating glass control bar */}
                        <div className={styles.buttonContainers}>
                            <IconButton 
                                className={`${styles.controlBtn} ${video === false ? styles.controlBtnOff : ''}`} 
                                onClick={handleVideo}
                                title={video ? "Turn off camera" : "Turn on camera"}
                            >
                                {video === true ? <VideocamIcon /> : <VideocamOffIcon />}
                            </IconButton>

                            <IconButton 
                                className={`${styles.controlBtn} ${audio === false ? styles.controlBtnOff : ''}`} 
                                onClick={handleAudio}
                                title={audio ? "Mute microphone" : "Unmute microphone"}
                            >
                                {audio === true ? <MicIcon /> : <MicOffIcon />}
                            </IconButton>

                            {screenAvailable === true && (
                                <IconButton 
                                    className={styles.controlBtn} 
                                    onClick={handleScreen}
                                    title={screen ? "Stop sharing screen" : "Share screen"}
                                >
                                    {screen === true ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                                </IconButton>
                            )}

                            <Badge badgeContent={newMessages} max={99} color="primary">
                                <IconButton 
                                    className={`${styles.controlBtn} ${showModal ? styles.controlBtnActive : ''}`} 
                                    onClick={handleChat}
                                    title="Toggle chat"
                                >
                                    <ChatIcon />
                                </IconButton>
                            </Badge>

                            <Badge color="secondary" variant="dot" invisible={showWhiteboard || !newWhiteboardActivity}>
                                <IconButton 
                                    className={`${styles.controlBtn} ${showWhiteboard ? styles.controlBtnActive : ''}`} 
                                    onClick={() => {
                                        const nextState = !showWhiteboard;
                                        setShowWhiteboard(nextState);
                                        if (nextState) {
                                            setNewWhiteboardActivity(false);
                                            socketRef.current?.emit("whiteboard-started", username || "A participant");
                                        }
                                    }}
                                    title={showWhiteboard ? "Close Whiteboard" : "Open Collaborative Whiteboard"}
                                >
                                    <DrawIcon />
                                </IconButton>
                            </Badge>

                            <IconButton 
                                onClick={handleEndCall} 
                                className={styles.endCallBtn}
                                title="Leave call"
                            >
                                <CallEndIcon />
                            </IconButton>
                        </div>

                        {/* Collaborative Glass Whiteboard Overlay */}
                        <Whiteboard
                            socketRef={socketRef}
                            isOpen={showWhiteboard}
                            username={username}
                            onClose={() => setShowWhiteboard(false)}
                        />
                    </div>
                </div>
            }
        </div>
    )
}