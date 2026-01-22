import React from "react";
import withAuth from "../utils/withAuth";
import { useNavigate } from "react-router-dom";
import { IconButton, TextField } from "@mui/material";
import { useState, useContext } from "react";
import RestoreIcon from '@mui/icons-material/Restore';
import Button from '@mui/material/Button';
import "../styles/Home.css"
import { AuthContext } from "../context/AuthContext";

function Home() {

    let navigate = useNavigate();
    const [meetingCode, setMeetingCode] = useState("");

    const { addToUserHistory } = useContext(AuthContext);
    let handleJoinVideoCall = async () => {
        await addToUserHistory(meetingCode);
        navigate(`/${meetingCode}`)
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!meetingCode) return;
        await handleJoinVideoCall();
    };

    return (

        <>
            <div className="navBar">
                <div style={{ display: "flex", alignItems: "center" }}>
                    <h3 style={{ cursor: "pointer" }} onClick={() => {
                        navigate('/')
                    }}>AP Meet</h3>
                </div>

                <div style={{ display: "flex", alignItems: "center" }}>
                    <IconButton onClick={() => {
                        navigate("/history");
                    }}>
                        <RestoreIcon />
                        <p style={{ fontSize: "1.35rem" }}>History</p>
                    </IconButton>
                    <Button onClick={() => {
                        localStorage.removeItem("token")
                        navigate("/auth")
                    }}>
                        Logout
                    </Button>
                </div>
            </div>

            <div className="meetContainer">
                <div className="leftPanel">
                    <div>
                        <h2>Providing Quality Video Call</h2>

                        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px" }}>
                            <TextField
                                onChange={e => setMeetingCode(e.target.value)}
                                id="outlined-basic"
                                label="Meeting Code"
                                variant="outlined"
                                fullWidth
                            />
                            <Button type="submit" variant="contained">
                                Connect
                            </Button>
                        </form>

                        {/* <div style={{ display: "flex", gap: "10px" }}>
                            <TextField onChange={e => setMeetingCode(e.target.value)} id="outlined-basic" label="Meeting Code" variant="outlined" />
                            <Button onClick={handleJoinVideoCall} variant="contained">Connect</Button>
                        </div> */}
                        <h4>Enter a meeting code to join instantly</h4>
                    </div>
                </div>
                <div className="rightPanel">
                    <img srcSet="/hom.svg" />
                </div>

            </div>
        </>
    )
}

export default withAuth(Home);


