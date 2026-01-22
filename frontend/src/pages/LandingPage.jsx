import React from "react"
import "../App.css"
import { Link, useNavigate } from "react-router-dom"


export default function LandingPage() {

    const generateMeetingCode = () => {
        return `apm-${Math.random().toString(36).substring(2, 6)}-${Math.random()
            .toString(36)
            .substring(2, 6)}`;
    };

    const code = generateMeetingCode();

    const router = useNavigate();
    const handleGetStarted = () => {
        const token = localStorage.getItem("token");

        if (token) {
            router("/home");
        } else {
            router("/auth");
        }
    };

    const handleLoginClick = () => {
        const token = localStorage.getItem("token");

        if (token) {
            router("/home");
        } else {
            router("/auth");
        }
    };



    return (
        <div className="landingPageContainer">
            <nav>
                <div className="navHeader">
                    <h2>AP Meet</h2>
                </div>
                <div className="navList">
                    <p onClick={() => {
                        router(`${code}`)
                    }}>Join as Guest</p>
                    <p onClick={() => {
                        router("/auth")
                    }}>Register</p>
                    <div role="button" onClick={handleLoginClick}>Login</div>
                </div>
            </nav>

            <div className="landingMainContainer">
                <div><h1><span style={{ color: "#FF9839" }}>Connect </span>with your Loved Ones</h1>
                    <p>Cover a distance by AP MEET video call</p>
                    <div role="button" onClick={handleGetStarted} style={{ cursor: "pointer" }} >
                        Get Started
                    </div>
                </div>
                <div>
                    <img src="/mobile.png" alt="mobile" />
                </div>
            </div>
        </div>
    )
}