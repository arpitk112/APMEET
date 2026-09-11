import React from "react";
import "../App.css";
import { useNavigate } from "react-router-dom";
import VideocamIcon from "@mui/icons-material/Videocam";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SecurityIcon from "@mui/icons-material/Security";
import BoltIcon from "@mui/icons-material/Bolt";
import HighQualityIcon from "@mui/icons-material/HighQuality";
import Footer from "../components/Footer";

export default function LandingPage(): React.JSX.Element {
    const generateMeetingCode = (): string => {
        return `apm-${Math.random().toString(36).substring(2, 6)}-${Math.random()
            .toString(36)
            .substring(2, 6)}`;
    };

    const code = generateMeetingCode();
    const router = useNavigate();

    const handleGetStarted = (): void => {
        const token = localStorage.getItem("token");
        if (token) {
            router("/home");
        } else {
            router("/auth");
        }
    };

    const handleLoginClick = (): void => {
        const token = localStorage.getItem("token");
        if (token) {
            router("/home");
        } else {
            router("/auth");
        }
    };

    return (
        <div className="landingPageContainer">
            {/* Ambient Background Glows strictly clipped to page bounds */}
            <div className="ambientContainer">
                <div className="ambientGlow glow1"></div>
                <div className="ambientGlow glow2"></div>
                <div className="ambientGlow glow3"></div>
            </div>

            {/* Floating Glass Navbar */}
            <header className="navWrapper">
                <nav className="glassNav">
                    <div className="navBrand" onClick={() => router("/")}>
                        <div className="logoIconWrapper">
                            <VideocamIcon className="logoIcon" />
                        </div>
                        <h2>AP<span>MEET</span></h2>
                    </div>

                    <div className="navList">
                        <button 
                            className="navGlassBtn navHideMobile"
                            onClick={() => router(`/${code}`)}
                        >
                            Quick Call
                        </button>
                        <button 
                            className="navPrimaryBtn"
                            onClick={handleLoginClick}
                        >
                            Sign In with Google
                        </button>
                    </div>
                </nav>
            </header>

            {/* Hero Section */}
            <main className="landingMainContainer">
                <div className="heroContent">
                    <div className="heroBadge">
                        <span className="badgePulse"></span>
                        <span>⚡ Real-Time Ultra-HD Video Experience</span>
                    </div>

                    <h1 className="heroTitle">
                        Connect <span className="gradientText">Seamlessly</span> with Everyone, Anywhere.
                    </h1>

                    <p className="heroDescription">
                        Experience frictionless, crystal-clear meetings with real-time WebRTC, instant screen sharing, and interactive in-call chat — wrapped in a fluid glassmorphism interface.
                    </p>

                    <div className="heroActions">
                        <button className="ctaPrimaryBtn" onClick={handleGetStarted}>
                            <span>Get Started Free</span>
                            <ArrowForwardIcon className="btnIcon" />
                        </button>

                        <button className="ctaSecondaryBtn" onClick={() => router(`/${code}`)}>
                            <span>Quick Instant Call</span>
                        </button>
                    </div>

                    {/* Feature Highlights Grid */}
                    <div className="featureHighlightRow">
                        <div className="glassFeaturePill">
                            <HighQualityIcon className="featurePillIcon" />
                            <span>HD Audio & Video</span>
                        </div>
                        <div className="glassFeaturePill">
                            <BoltIcon className="featurePillIcon" />
                            <span>Sub-second Latency</span>
                        </div>
                        <div className="glassFeaturePill">
                            <SecurityIcon className="featurePillIcon" />
                            <span>P2P Encrypted</span>
                        </div>
                    </div>
                </div>

                {/* Hero Showcase Mockup */}
                <div className="heroShowcase">
                    <div className="glassMockupCard">
                        <div className="mockupHeader">
                            <div className="mockupDot dotRed"></div>
                            <div className="mockupDot dotYellow"></div>
                            <div className="mockupDot dotGreen"></div>
                        </div>
                        <div className="mockupImageContainer">
                            <img src="/mobile.png" alt="AP Meet Interactive Interface" className="mockupImage" />
                            
                            {/* Floating Glass Badges */}
                            <div className="floatingGlassBadge badgeTopRight">
                                <div className="liveIndicator"></div>
                                <span>Live Stream • 60 FPS</span>
                            </div>
                            <div className="floatingGlassBadge badgeBottomLeft">
                                <span className="badgeIcon">🔒</span>
                                <span>End-to-End Secure</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Glassmorphic Footer */}
            <Footer />
        </div>
    );
}
