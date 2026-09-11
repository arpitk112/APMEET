import React, { useState, useContext, FormEvent } from 'react';
import {
    Button,
    CssBaseline,
    Box,
    Typography,
    Snackbar,
    Alert,
} from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BoltIcon from '@mui/icons-material/Bolt';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { AuthContext } from '../context/AuthContext';

// Glassmorphism theme using the custom color palette (#141619, #2C2E3A, #050A44, #0A21C0, #B3B4BD)
const glassTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#0A21C0',
            light: '#1A34E8',
            dark: '#050A44',
        },
        background: {
            default: '#141619',
            paper: 'rgba(44, 46, 58, 0.75)',
        },
        text: {
            primary: '#ffffff',
            secondary: '#B3B4BD',
        },
    },
    typography: {
        fontFamily: "'Poppins', sans-serif",
    },
});

export default function Authentication(): React.JSX.Element {
    const [quickCode, setQuickCode] = useState<string>('');
    const [error, setError] = useState<string>('');

    const navigate = useNavigate();
    const { handleGoogleAuth } = useContext(AuthContext);

    // Generates a random room code for instant guest meetings
    const generateCode = (): string => {
        return `apm-${Math.random().toString(36).substring(2, 6)}-${Math.random()
            .toString(36)
            .substring(2, 6)}`;
    };

    // Google Sign-In success handler
    const onGoogleSuccess = async (credentialResponse: CredentialResponse): Promise<void> => {
        try {
            setError("");
            if (credentialResponse?.credential) {
                await handleGoogleAuth(credentialResponse.credential);
            } else {
                setError("No credential returned from Google.");
            }
        } catch (err: any) {
            const errorMsg = err?.response?.data?.message || err?.message || "Google Authentication failed.";
            setError(errorMsg);
        }
    };

    // Handles instant call start without requiring login
    const handleStartInstantCall = (): void => {
        const code = generateCode();
        navigate(`/${code}`);
    };

    // Handles joining an existing meeting without login
    const handleJoinQuickCall = (e: FormEvent<HTMLFormElement>): void => {
        e.preventDefault();
        if (!quickCode.trim()) {
            setError("Please enter a meeting code");
            return;
        }
        navigate(`/${quickCode.trim()}`);
    };

    return (
        <ThemeProvider theme={glassTheme}>
            <CssBaseline />
            <Box
                sx={{
                    minHeight: '100vh',
                    width: '100%',
                    position: 'relative',
                    background: 'radial-gradient(circle at 50% 25%, #050A44 0%, #141619 80%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: { xs: 2, sm: 3 },
                    overflow: 'hidden',
                }}
            >
                {/* Ambient Background Glows */}
                <Box
                    sx={{
                        position: 'absolute',
                        top: '-10%',
                        left: '10%',
                        width: '450px',
                        height: '450px',
                        borderRadius: '50%',
                        background: 'rgba(10, 33, 192, 0.22)',
                        filter: 'blur(90px)',
                        pointerEvents: 'none',
                    }}
                />
                <Box
                    sx={{
                        position: 'absolute',
                        bottom: '-10%',
                        right: '10%',
                        width: '500px',
                        height: '500px',
                        borderRadius: '50%',
                        background: 'rgba(5, 10, 68, 0.45)',
                        filter: 'blur(100px)',
                        pointerEvents: 'none',
                    }}
                />

                {/* Back to Home Button */}
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/')}
                    sx={{
                        position: 'absolute',
                        top: { xs: 16, sm: 24 },
                        left: { xs: 16, sm: 24 },
                        color: '#B3B4BD',
                        background: 'rgba(44, 46, 58, 0.5)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(179, 180, 189, 0.16)',
                        borderRadius: '12px',
                        px: 2,
                        py: 0.8,
                        textTransform: 'none',
                        fontSize: '0.88rem',
                        '&:hover': {
                            background: 'rgba(44, 46, 58, 0.85)',
                            color: '#ffffff',
                            borderColor: 'rgba(179, 180, 189, 0.35)',
                        },
                    }}
                >
                    Back to Home
                </Button>

                {/* Main Auth & Quick Call Card */}
                <Box
                    sx={{
                        position: 'relative',
                        zIndex: 1,
                        width: '100%',
                        maxWidth: '440px',
                        p: { xs: 3, sm: 4.5 },
                        background: 'rgba(44, 46, 58, 0.65)',
                        backdropFilter: 'blur(24px) saturate(180%)',
                        border: '1px solid rgba(179, 180, 189, 0.16)',
                        borderRadius: '24px',
                        boxShadow: '0 20px 50px 0 rgba(0, 0, 0, 0.6)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                    }}
                >
                    {/* Header Logo */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            mb: 2,
                            cursor: 'pointer',
                        }}
                        onClick={() => navigate('/')}
                    >
                        <Box
                            sx={{
                                width: 44,
                                height: 44,
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #0A21C0, #1A34E8)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 4px 18px rgba(10, 33, 192, 0.45)',
                            }}
                        >
                            <VideocamIcon sx={{ color: '#fff', fontSize: 24 }} />
                        </Box>
                        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: -0.5, color: '#fff' }}>
                            AP<span style={{ color: '#0A21C0' }}>MEET</span>
                        </Typography>
                    </Box>

                    <Typography variant="body2" sx={{ color: '#B3B4BD', mb: 3, textAlign: 'center', lineHeight: 1.6 }}>
                        Sign in with Google to sync meeting history and host secure sessions across all your devices.
                    </Typography>

                    {/* Google OAuth Section */}
                    <Box
                        sx={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'center',
                            mb: 3,
                            p: 1,
                            background: 'rgba(20, 22, 25, 0.5)',
                            borderRadius: '16px',
                            border: '1px solid rgba(179, 180, 189, 0.12)',
                        }}
                    >
                        <GoogleLogin
                            onSuccess={onGoogleSuccess}
                            onError={() => setError("Google Sign-In was cancelled or failed.")}
                            theme="filled_blue"
                            size="large"
                            shape="pill"
                            text="continue_with"
                            width="340"
                        />
                    </Box>

                    {/* Or Divider */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            width: '100%',
                            my: 1.5,
                            '&::before, &::after': {
                                content: '""',
                                flex: 1,
                                borderBottom: '1px solid rgba(179, 180, 189, 0.15)',
                            },
                        }}
                    >
                        <Typography
                            variant="caption"
                            sx={{
                                px: 1.5,
                                color: '#838594',
                                textTransform: 'uppercase',
                                letterSpacing: '0.6px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                            }}
                        >
                            No Account Needed
                        </Typography>
                    </Box>

                    {/* Quick Instant Call Section */}
                    <Box
                        sx={{
                            width: '100%',
                            mt: 1.5,
                            p: 2.5,
                            background: 'rgba(20, 22, 25, 0.6)',
                            border: '1px solid rgba(179, 180, 189, 0.14)',
                            borderRadius: '18px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1.5,
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <BoltIcon sx={{ color: '#0A21C0', fontSize: 20 }} />
                            <Typography sx={{ color: '#fff', fontSize: '0.92rem', fontWeight: 600 }}>
                                Quick Instant Call
                            </Typography>
                        </Box>

                        <Typography sx={{ color: '#B3B4BD', fontSize: '0.8rem', lineHeight: 1.5 }}>
                            Jump directly into a video call without creating an account or logging in.
                        </Typography>

                        {/* Start Instant Meeting Button */}
                        <Button
                            fullWidth
                            variant="contained"
                            onClick={handleStartInstantCall}
                            endIcon={<ArrowForwardIcon />}
                            sx={{
                                background: 'linear-gradient(135deg, #0A21C0 0%, #1A34E8 100%)',
                                color: '#ffffff',
                                borderRadius: '12px',
                                py: 1.1,
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.92rem',
                                boxShadow: '0 4px 15px rgba(10, 33, 192, 0.35)',
                                '&:hover': {
                                    boxShadow: '0 6px 20px rgba(10, 33, 192, 0.55)',
                                    transform: 'translateY(-1px)',
                                },
                            }}
                        >
                            Start New Meeting
                        </Button>

                        {/* Join with code form */}
                        <Box
                            component="form"
                            onSubmit={handleJoinQuickCall}
                            sx={{
                                display: 'flex',
                                gap: 1,
                                mt: 0.5,
                            }}
                        >
                            <input
                                type="text"
                                placeholder="Or enter meeting code"
                                value={quickCode}
                                onChange={(e) => setQuickCode(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: '0.65rem 0.9rem',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(179, 180, 189, 0.2)',
                                    background: 'rgba(44, 46, 58, 0.6)',
                                    color: '#ffffff',
                                    fontSize: '0.85rem',
                                    outline: 'none',
                                }}
                            />
                            <Button
                                type="submit"
                                variant="outlined"
                                sx={{
                                    borderColor: 'rgba(179, 180, 189, 0.25)',
                                    color: '#B3B4BD',
                                    borderRadius: '12px',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    px: 2,
                                    '&:hover': {
                                        borderColor: '#0A21C0',
                                        color: '#ffffff',
                                        background: 'rgba(10, 33, 192, 0.15)',
                                    },
                                }}
                            >
                                Join
                            </Button>
                        </Box>
                    </Box>
                </Box>

                {/* Error & Info Feedback Snackbar */}
                <Snackbar
                    open={!!error}
                    autoHideDuration={4000}
                    onClose={() => setError('')}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                >
                    <Alert
                        onClose={() => setError('')}
                        severity="error"
                        sx={{
                            background: 'rgba(30, 20, 25, 0.95)',
                            backdropFilter: 'blur(16px)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#ffffff',
                            borderRadius: '14px',
                        }}
                    >
                        {error}
                    </Alert>
                </Snackbar>
            </Box>
        </ThemeProvider>
    );
}
