import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import Snackbar from '@mui/material/Snackbar';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { IconButton } from "@mui/material";
import HomeIcon from '@mui/icons-material/Home';
import "../styles/History.css"
import DeleteIcon from '@mui/icons-material/Delete';


export default function History() {

    const { getHistoryOfUser, deleteFromHistory } = useContext(AuthContext);

    const [meetings, setMeetings] = useState([]);

    const routeTo = useNavigate();

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const history = await getHistoryOfUser();
                setMeetings(history);
            } catch (e) {
                <Snackbar
                    open={open}
                    autoHideDuration={4000}
                    message={e}
                />
            }
        }
        fetchHistory();
    }, [])

    const handleDelete = async (meetingCode) => {
        await deleteFromHistory(meetingCode);
        setMeetings(prev =>
            prev.filter(m => m.meetingCode !== meetingCode)
        );
    };


    let formatDate = (dateString) => {
        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0")
        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
    }

    return (
        <div className="historyPage">

            <div className="historyHeader">
                <IconButton onClick={() => routeTo("/home")}>
                    <HomeIcon />
                </IconButton>
                <h2>Meeting History</h2>
            </div>

            {meetings.length !== 0 ? (
                <div className="historyGrid">
                    {meetings.map((e, i) => (
                        <Card key={i} className="historyCard" variant="outlined">
                            <CardContent>
                                <Typography className="meetingCode">
                                    Meeting Code: {e.meetingCode}
                                </Typography>
                                <Typography className="meetingDate">
                                    Date: {formatDate(e.date)}
                                </Typography>
                            </CardContent>
                            <CardActions className="cardActions">
                                <IconButton
                                    size="small"
                                    onClick={() => handleDelete(e.meetingCode)}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </CardActions>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="emptyState">
                    No meetings yet
                </div>
            )}
        </div>

    )
}