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
import { useNavigate } from "react-router-dom";
import server from "../environment";

const server_url = server;

var connections = {};

const peerConfigConnections = {
    "iceServers": [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
}

export default function VideoMeetComponent() {

    var socketRef = useRef();
    let socketIdRef = useRef();

    let localVideoRef = useRef();

    let [videoAvailable, setVideoAvailable] = useState(true);

    let [audioAvailable, setAudioAvailable] = useState(true);

    let [video, setVideo] = useState();

    let [audio, setAudio] = useState();

    let [screen, setScreen] = useState();

    let [showModal, setShowModal] = useState(false);

    let [screenAvailable, setScreenAvailable] = useState();

    let [messages, setMessages] = useState([]);

    let [message, setMessage] = useState("");

    let [newMessages, setNewMessages] = useState(0);

    let [askForUsername, setAskForUsername] = useState(true)

    let [username, setUsername] = useState("");

    const videoRef = useRef([]);

    let [videos, setVideos] = useState([]);

    let [spotlightVideo, setSpotlightVideo] = useState(null);

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
            window.localStream.getTracks().forEach(track => track.stop())
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
                let tracks = localVideoRef.current.srcObject.getTracks();
                tracks.forEach(track => track.stop());
            } catch (e) { }
        }
    }

    useEffect(() => {
        if (video !== undefined && audio !== undefined) {
            getUserMedia();
        }
    }, [audio, video])

    let gotMessageFromServer = (fromId, message) => {
        var signal = JSON.parse(message)

        if (fromId !== socketIdRef.current) {
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    if (signal.sdp.type === "offer") {
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current.emit("signal", fromId, JSON.stringify({ "sdp": connections[fromId].localDescription }))
                            }).catch(e => console.log(e));
                        }).catch(e => console.log(e));
                    }
                }).catch(e => console.log(e))
            }

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

    let connectToSocketServer = () => {
        socketRef.current = io.connect(server_url)

        socketRef.current.on('signal', gotMessageFromServer)

        socketRef.current.on("connect", () => {

            socketRef.current.emit("join-call", window.location.href)

            socketIdRef.current = socketRef.current.id;

            socketRef.current.on("chat-message", addMessage)

            socketRef.current.on("user-left", (id) => {
                setVideos((videos) => videos.filter((video) => video.socketId !== id))
            })

            socketRef.current.on("user-joined", (id, clients) => {
                clients.forEach((socketListId) => {

                    connections[socketListId] = new RTCPeerConnection(peerConfigConnections);

                    connections[socketListId].onicecandidate = (event) => {
                        if (event.candidate != null) {
                            socketRef.current.emit("signal", socketListId, JSON.stringify({ 'ice': event.candidate }))
                        }
                    }

                    connections[socketListId].onaddstream = (event) => {

                        let videoExists = videoRef.current.find(video => video.socketId === socketListId);

                        if (videoExists) {
                            setVideos(videos => {
                                const updateVideos = videos.map(video =>
                                    video.socketId === socketListId ? { ...video, stream: event.stream } : video
                                );
                                videoRef.current = updateVideos;
                                return updateVideos;
                            })
                        } else {
                            let newVideo = {
                                socketId: socketListId,
                                stream: event.stream,
                                autoPlay: true,
                                playsinline: true
                            }

                            setVideos(videos => {
                                const updatedVideos = [...videos, newVideo];
                                videoRef.current = updatedVideos;
                                return updatedVideos;
                            });
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
                    <div className={styles.lobbyCard}>
                        <h2>Enter into Lobby</h2>

                        <video
                            className={styles.lobbyVideo}
                            ref={localVideoRef}
                            autoPlay
                            muted
                        />

                        <div className={styles.lobbyActions}>
                            <TextField
                                label="Username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                variant="outlined"
                                fullWidth
                            />
                            <Button
                                variant="contained"
                                onClick={connect}
                                fullWidth
                            >
                                Connect
                            </Button>
                        </div>
                    </div>
                </div> :

                <div className={styles.meetVideoContainer}>
                    {/* Chat Panel with slide animation */}
                    <div className={`${styles.chatRoom} ${showModal ? styles.open : ''}`}>
                        <div className={styles.chatContainer}>
                            <div className={styles.chatHeader}>
                                <span>In-call messages</span>
                                <IconButton
                                    onClick={handleChat}
                                    size="small"
                                    style={{ marginLeft: 'auto', color: '#5f6368' }}
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                                    </svg>
                                </IconButton>
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
                                }) : <p className={styles.noMessages}>No messages yet</p>}
                            </div>

                            <div className={styles.chattingArea}>
                                <TextField
                                    id="outlined-basic"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                    placeholder="Send a message to everyone"
                                    variant="outlined"
                                    fullWidth
                                    size="small"
                                />
                                <Button
                                    variant="contained"
                                    onClick={sendMessage}
                                    disabled={!message.trim()}
                                >
                                    Send
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Video Area - dynamically resizes when chat opens */}
                    <div className={`${styles.videoArea} ${showModal ? styles.chatOpen : ''}`}>
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
                                        <span>{username} (You)</span>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Bottom control bar */}
                        <div className={styles.buttonContainers}>
                            <IconButton style={{ color: "white" }} onClick={handleVideo}>
                                {(video === true) ? <VideocamIcon /> : <VideocamOffIcon />}
                            </IconButton>
                            <IconButton onClick={handleEndCall} style={{ color: "red" }}>
                                <CallEndIcon />
                            </IconButton>
                            <IconButton style={{ color: "white" }} onClick={handleAudio}>
                                {(audio === true) ? <MicIcon /> : <MicOffIcon />}
                            </IconButton>

                            {screenAvailable === true ? <IconButton style={{ color: "white" }} onClick={handleScreen}>
                                {screen === true ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                            </IconButton> : <> </>}

                            <Badge badgeContent={newMessages} max={999} color="secondary">
                                <IconButton onClick={handleChat} style={{ color: "white" }} >
                                    <ChatIcon />
                                </IconButton>
                            </Badge>
                        </div>
                    </div>
                </div>
            }
        </div>
    )
}