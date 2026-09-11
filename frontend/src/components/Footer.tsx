import React from "react";
import styles from "../styles/Footer.module.css";
import { useNavigate } from "react-router-dom";
import VideocamIcon from "@mui/icons-material/Videocam";
import GitHubIcon from "@mui/icons-material/GitHub";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import EmailIcon from "@mui/icons-material/Email";
import LaunchIcon from "@mui/icons-material/Launch";

export default function Footer(): React.JSX.Element {
    const navigate = useNavigate();

    // Generate a fresh random room code for the instant call link
    const generateMeetingCode = (): string => {
        return `apm-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 6)}`;
    };

    return (
        <footer className={styles.footerContainer}>
            <div className={styles.footerContent}>
                {/* Brand & Mission */}
                <div className={styles.brandColumn}>
                    <div className={styles.brandLogo} onClick={() => navigate("/")}>
                        <div className={styles.logoIconWrapper}>
                            <VideocamIcon className={styles.logoIcon} />
                        </div>
                        <h3 className={styles.brandTitle}>
                            AP<span>MEET</span>
                        </h3>
                    </div>

                    <p className={styles.brandBio}>
                        Next-generation peer-to-peer video conferencing with real-time collaborative glass whiteboard, sub-second latency, and end-to-end WebRTC security.
                    </p>

                    <div className={styles.statusBadge}>
                        <div className={styles.statusDot}></div>
                        <span>All Systems Operational</span>
                    </div>
                </div>

                {/* Quick Navigation Links */}
                <div>
                    <h4 className={styles.columnTitle}>Navigation</h4>
                    <ul className={styles.linkList}>
                        <li>
                            <button className={styles.footerLink} onClick={() => navigate("/")}>
                                Home
                            </button>
                        </li>
                        <li>
                            <button className={styles.footerLink} onClick={() => navigate(`/${generateMeetingCode()}`)}>
                                Instant Meeting
                            </button>
                        </li>
                        <li>
                            <button className={styles.footerLink} onClick={() => navigate("/auth")}>
                                Sign In / Register
                            </button>
                        </li>
                        <li>
                            <button className={styles.footerLink} onClick={() => navigate("/history")}>
                                Call History
                            </button>
                        </li>
                    </ul>
                </div>

                {/* Developer Profile & Connect */}
                <div className={styles.developerColumn}>
                    <h4 className={styles.columnTitle}>Developer</h4>
                    <div className={styles.developerCard}>
                        <div className={styles.devInfo}>
                            <p className={styles.devName}>Arpit Kumar</p>
                            <p className={styles.devRole}>Full-Stack Web Developer</p>
                        </div>

                        {/* Social Buttons */}
                        <div className={styles.socialRow}>
                            <a
                                href="https://github.com/arpitk112/APMEET"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.socialBtn}
                                title="View Source Code on GitHub"
                            >
                                <GitHubIcon style={{ fontSize: 16 }} />
                                <span>GitHub</span>
                                <LaunchIcon style={{ fontSize: 12, opacity: 0.7 }} />
                            </a>

                            <a
                                href="https://www.linkedin.com/in/arpit-kumar-wd/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.socialBtn}
                                title="Connect on LinkedIn"
                            >
                                <LinkedInIcon style={{ fontSize: 16 }} />
                                <span>LinkedIn</span>
                                <LaunchIcon style={{ fontSize: 12, opacity: 0.7 }} />
                            </a>
                        </div>

                        {/* Email Link */}
                        <a
                            href="mailto:arpitkr.x12@gmail.com"
                            className={styles.emailLink}
                            title="Send an email"
                        >
                            <EmailIcon style={{ fontSize: 16, color: "#f97316" }} />
                            <span>arpitkr.x12@gmail.com</span>
                        </a>
                    </div>
                </div>
            </div>

            {/* Bottom copyright & attribution */}
            <div className={styles.bottomBar}>
                <div>
                    © {new Date().getFullYear()} AP-MEET. Built by{" "}
                    <strong style={{ color: "#f1f5f9" }}>Arpit Kumar</strong>.
                </div>
                <div>
                    Powered by WebRTC, Socket.IO & React
                </div>
            </div>
        </footer>
    );
}
