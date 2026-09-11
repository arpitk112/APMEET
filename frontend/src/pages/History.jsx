import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { IconButton } from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import EventIcon from '@mui/icons-material/Event';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VideocamIcon from '@mui/icons-material/Videocam';
import "../styles/History.css";
import Footer from "../components/Footer";

export default function History() {
    const { getHistoryOfUser, deleteFromHistory } = useContext(AuthContext);
    const [meetings, setMeetings] = useState([]);
    const [toastMessage, setToastMessage] = useState("");
    const [openToast, setOpenToast] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const history = await getHistoryOfUser();
                if (Array.isArray(history)) {
                    setMeetings(history);
                }
            } catch (e) {
                setToastMessage("Failed to fetch meeting history");
                setOpenToast(true);
            }
        };
        fetchHistory();
    }, []);

    const handleDelete = async (meetingCode) => {
        try {
            await deleteFromHistory(meetingCode);
            setMeetings(prev => prev.filter(m => m.meetingCode !== meetingCode));
            setToastMessage("Meeting removed from history");
            setOpenToast(true);
        } catch (err) {
            setToastMessage("Failed to delete meeting");
            setOpenToast(true);
        }
    };

    const handleCopyCode = (code) => {
        navigator.clipboard.writeText(code);
        setToastMessage(`Copied "${code}" to clipboard!`);
        setOpenToast(true);
    };

    const handleRejoin = (meetingCode) => {
        navigate(`/${meetingCode}`);
    };

    const formatDate = (dateString) => {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch (e) {
            return dateString;
        }
    };

    return (
        <div className="historyPageWrapper">
            {/* Ambient Background Lights */}
            <div className="historyAmbientGlow glowLeft"></div>
            <div className="historyAmbientGlow glowRight"></div>

            {/* Header */}
            <header className="historyNav">
                <button className="historyBackBtn" onClick={() => navigate("/home")}>
                    <ArrowBackIcon style={{ fontSize: 20 }} />
                    <span>Back to Dashboard</span>
                </button>

                <div className="historyBrand" onClick={() => navigate('/home')}>
                    <div className="historyLogoIcon">
                        <VideocamIcon style={{ fontSize: 22, color: '#fff' }} />
                    </div>
                    <h2>Meeting <span>History</span></h2>
                </div>
            </header>

            {/* Main Content */}
            <main className="historyContent">
                {meetings.length > 0 ? (
                    <div className="historyGrid">
                        {meetings.map((meeting, i) => (
                            <div key={i} className="glassHistoryCard">
                                <div className="cardTopRow">
                                    <div className="meetingIconBadge">
                                        <VideoCallIcon style={{ fontSize: 22, color: '#f97316' }} />
                                    </div>
                                    <div className="cardTopActions">
                                        <button 
                                            className="iconActionBtn copyBtn"
                                            title="Copy meeting code"
                                            onClick={() => handleCopyCode(meeting.meetingCode)}
                                        >
                                            <ContentCopyIcon style={{ fontSize: 16 }} />
                                        </button>
                                        <button 
                                            className="iconActionBtn deleteBtn"
                                            title="Delete from history"
                                            onClick={() => handleDelete(meeting.meetingCode)}
                                        >
                                            <DeleteOutlineIcon style={{ fontSize: 18 }} />
                                        </button>
                                    </div>
                                </div>

                                <div className="cardBody">
                                    <span className="codeLabel">ROOM CODE</span>
                                    <h4 className="meetingCodeText">{meeting.meetingCode}</h4>
                                    
                                    <div className="meetingDateBadge">
                                        <EventIcon style={{ fontSize: 14 }} />
                                        <span>{formatDate(meeting.date)}</span>
                                    </div>
                                </div>

                                <div className="cardFooter">
                                    <button 
                                        className="rejoinBtn"
                                        onClick={() => handleRejoin(meeting.meetingCode)}
                                    >
                                        <PlayArrowIcon style={{ fontSize: 18 }} />
                                        <span>Rejoin Call</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="glassEmptyState">
                        <div className="emptyIconCircle">
                            <VideoCallIcon style={{ fontSize: 48, color: '#94a3b8' }} />
                        </div>
                        <h3>No Call History Found</h3>
                        <p>When you participate in or host calls, your past meetings will be saved here for instant rejoining.</p>
                        <button className="emptyActionBtn" onClick={() => navigate("/home")}>
                            Start a Meeting
                        </button>
                    </div>
                )}
            </main>

            <Snackbar
                open={openToast}
                autoHideDuration={3000}
                onClose={() => setOpenToast(false)}
            >
                <Alert severity="info" sx={{ background: 'rgba(15, 23, 42, 0.9)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {toastMessage}
                </Alert>
            </Snackbar>

            {/* Glassmorphic Footer */}
            <Footer />
        </div>
    );
}