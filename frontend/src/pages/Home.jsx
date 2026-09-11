import React, { useState, useContext } from "react";
import withAuth from "../utils/withAuth";
import { useNavigate } from "react-router-dom";
import { IconButton, TextField, Button } from "@mui/material";
import RestoreIcon from '@mui/icons-material/Restore';
import LogoutIcon from '@mui/icons-material/Logout';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import "../styles/Home.css";
import { AuthContext } from "../context/AuthContext";
import Footer from "../components/Footer";

function Home() {
    const navigate = useNavigate();
    const [meetingCode, setMeetingCode] = useState("");
    const { addToUserHistory } = useContext(AuthContext);

    const generateMeetingCode = () => {
        return `apm-${Math.random().toString(36).substring(2, 6)}-${Math.random()
            .toString(36)
            .substring(2, 6)}`;
    };

    const handleJoinVideoCall = async (codeToJoin) => {
        const targetCode = codeToJoin || meetingCode;
        if (!targetCode) return;
        try {
            await addToUserHistory(targetCode);
        } catch (e) {
            console.log("Could not sync to history:", e);
        }
        navigate(`/${targetCode}`);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!meetingCode.trim()) return;
        await handleJoinVideoCall(meetingCode.trim());
    };

    const handleInstantMeeting = async () => {
        const newCode = generateMeetingCode();
        await handleJoinVideoCall(newCode);
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        navigate("/auth");
    };

    return (
        <div className="homePageWrapper">
            {/* Ambient Background Lights strictly clipped to page bounds */}
            <div className="homeAmbientContainer">
                <div className="homeAmbientGlow homeGlow1"></div>
                <div className="homeAmbientGlow homeGlow2"></div>
            </div>

            {/* Glass Navigation Bar */}
            <header className="homeNavContainer">
                <div className="homeNavGlass">
                    <div className="homeBrand" onClick={() => navigate('/')}>
                        <div className="homeLogoIcon">
                            <VideocamIcon style={{ fontSize: 24, color: '#fff' }} />
                        </div>
                        <h3>AP<span>MEET</span></h3>
                    </div>

                    <div className="homeNavActions">
                        <button 
                            className="homeGlassBtn"
                            onClick={() => navigate("/history")}
                        >
                            <RestoreIcon style={{ fontSize: 20 }} />
                            <span>History</span>
                        </button>
                        <button 
                            className="homeLogoutBtn"
                            onClick={handleLogout}
                        >
                            <LogoutIcon style={{ fontSize: 18 }} />
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Dashboard Content */}
            <main className="homeMainSection">
                <div className="homeGlassCard">
                    <div className="cardHeaderBadge">
                        <span className="liveDot"></span>
                        <span>HD Video Conference Ready</span>
                    </div>

                    <h2>High Quality Video Calls Made <span className="homeGradientText">Effortless</span></h2>
                    <p className="cardSubtitle">
                        Enter an existing room code or start a brand new instant meeting with low-latency peer-to-peer connection.
                    </p>

                    <form onSubmit={handleSubmit} className="joinForm">
                        <div className="inputRow">
                            <TextField
                                value={meetingCode}
                                onChange={(e) => setMeetingCode(e.target.value)}
                                id="meeting-code-input"
                                label="Enter Meeting Code (e.g. apm-xxxx-xxxx)"
                                variant="outlined"
                                fullWidth
                                className="glassTextField"
                                autoFocus
                            />
                            <button type="submit" className="joinPrimaryBtn" disabled={!meetingCode.trim()}>
                                <span>Connect</span>
                                <ArrowForwardIcon style={{ fontSize: 18 }} />
                            </button>
                        </div>
                    </form>

                    <div className="orDivider">
                        <span>or start instantly</span>
                    </div>

                    <div className="instantActionsRow">
                        <button className="instantMeetingBtn" onClick={handleInstantMeeting}>
                            <AddCircleOutlineIcon style={{ fontSize: 20 }} />
                            <span>Create Instant Meeting</span>
                        </button>
                    </div>

                    <div className="quickTips">
                        <p>🔒 All calls are end-to-end WebRTC peer connections.</p>
                    </div>
                </div>

                <div className="homeIllustrationArea">
                    <div className="illustrationGlowCircle"></div>
                    <img src="/home.svg" alt="Video Call Illustration" className="homeIllustrationImg" />
                </div>
            </main>

            {/* Glassmorphic Footer */}
            <Footer />
        </div>
    );
}

export default withAuth(Home);
