import * as React from 'react';
import {
    Avatar,
    Button,
    CssBaseline,
    TextField,
    Box,
    Typography,
    Snackbar,
    Alert,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VideocamIcon from '@mui/icons-material/Videocam';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

// Dark Glass Theme for Material UI
const glassTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#f97316',
            light: '#fb923c',
            dark: '#ea580c',
        },
        secondary: {
            main: '#6366f1',
        },
        background: {
            default: '#0a0d18',
            paper: 'rgba(15, 23, 42, 0.7)',
        },
        text: {
            primary: '#ffffff',
            secondary: '#94a3b8',
        },
    },
    typography: {
        fontFamily: "'Poppins', sans-serif",
    },
    components: {
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        backdropFilter: 'blur(8px)',
                        borderRadius: '12px',
                        color: '#ffffff',
                        transition: 'all 0.2s ease',
                        '& fieldset': {
                            borderColor: 'rgba(255, 255, 255, 0.15)',
                        },
                        '&:hover fieldset': {
                            borderColor: 'rgba(255, 255, 255, 0.3)',
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: '#f97316',
                            borderWidth: '1.5px',
                            boxShadow: '0 0 12px rgba(249, 115, 22, 0.3)',
                        },
                    },
                    '& .MuiInputLabel-root': {
                        color: '#94a3b8',
                        '&.Mui-focused': {
                            color: '#f97316',
                        },
                    },
                },
            },
        },
    },
});

export default function Authentication() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const [formState, setFormState] = useState(0); // 0 = Sign In, 1 = Sign Up
    const [open, setOpen] = useState(false);

    const navigate = useNavigate();
    const { handleRegister, handleLogin } = useContext(AuthContext);

    const handleAuth = async () => {
        try {
            setError("");
            if (formState === 0) {
                await handleLogin(username, password);
            }

            if (formState === 1) {
                const result = await handleRegister(name, username, password);
                setUsername('');
                setName('');
                setPassword('');
                setMessage(result || "Account created successfully! Please sign in.");
                setOpen(true);
                setFormState(0);
            }
        } catch (err) {
            const errorMsg = err?.response?.data?.message || err?.message || "An error occurred during authentication.";
            setError(errorMsg);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        handleAuth();
    };

    return (
        <ThemeProvider theme={glassTheme}>
            <CssBaseline />
            <Box
                sx={{
                    minHeight: '100vh',
                    width: '100vw',
                    position: 'relative',
                    background: 'radial-gradient(circle at 50% 30%, #151a30 0%, #0a0d18 80%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 2,
                    overflow: 'hidden',
                }}
            >
                {/* Ambient Glows */}
                <Box
                    sx={{
                        position: 'absolute',
                        top: '-10%',
                        left: '15%',
                        width: '450px',
                        height: '450px',
                        borderRadius: '50%',
                        background: 'rgba(99, 102, 241, 0.15)',
                        filter: 'blur(100px)',
                        pointerEvents: 'none',
                    }}
                />
                <Box
                    sx={{
                        position: 'absolute',
                        bottom: '-10%',
                        right: '15%',
                        width: '500px',
                        height: '500px',
                        borderRadius: '50%',
                        background: 'rgba(249, 115, 22, 0.14)',
                        filter: 'blur(110px)',
                        pointerEvents: 'none',
                    }}
                />

                {/* Back to Home button */}
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/')}
                    sx={{
                        position: 'absolute',
                        top: 24,
                        left: 24,
                        color: '#94a3b8',
                        background: 'rgba(255, 255, 255, 0.05)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        px: 2,
                        py: 1,
                        textTransform: 'none',
                        '&:hover': {
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: '#ffffff',
                        },
                    }}
                >
                    Back to Home
                </Button>

                {/* Frosted Glass Auth Card */}
                <Box
                    sx={{
                        position: 'relative',
                        zIndex: 1,
                        width: '100%',
                        maxWidth: '440px',
                        p: { xs: 3, sm: 4.5 },
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '24px',
                        boxShadow: '0 20px 50px 0 rgba(0, 0, 0, 0.5)',
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
                            mb: 2.5,
                            cursor: 'pointer',
                        }}
                        onClick={() => navigate('/')}
                    >
                        <Box
                            sx={{
                                width: 44,
                                height: 44,
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #f97316, #ec4899)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 4px 15px rgba(249, 115, 22, 0.4)',
                            }}
                        >
                            <VideocamIcon sx={{ color: '#fff', fontSize: 24 }} />
                        </Box>
                        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>
                            AP<span style={{ color: '#f97316' }}>MEET</span>
                        </Typography>
                    </Box>

                    <Typography variant="body2" sx={{ color: '#94a3b8', mb: 3, textAlign: 'center' }}>
                        {formState === 0 ? "Welcome back! Enter your details to sign in." : "Create your account and start video conferencing."}
                    </Typography>

                    {/* Segmented Glass Pill Switcher */}
                    <Box
                        sx={{
                            display: 'flex',
                            width: '100%',
                            p: 0.6,
                            background: 'rgba(255, 255, 255, 0.05)',
                            backdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '14px',
                            mb: 3,
                        }}
                    >
                        <Button
                            fullWidth
                            onClick={() => { setFormState(0); setError(""); }}
                            sx={{
                                py: 1,
                                borderRadius: '10px',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                color: formState === 0 ? '#ffffff' : '#94a3b8',
                                background: formState === 0
                                    ? 'linear-gradient(135deg, #f97316, #ea580c)'
                                    : 'transparent',
                                boxShadow: formState === 0 ? '0 4px 15px rgba(249, 115, 22, 0.35)' : 'none',
                                transition: 'all 0.25s ease',
                                '&:hover': {
                                    background: formState === 0
                                        ? 'linear-gradient(135deg, #f97316, #ea580c)'
                                        : 'rgba(255, 255, 255, 0.05)',
                                },
                            }}
                        >
                            Sign In
                        </Button>
                        <Button
                            fullWidth
                            onClick={() => { setFormState(1); setError(""); }}
                            sx={{
                                py: 1,
                                borderRadius: '10px',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                color: formState === 1 ? '#ffffff' : '#94a3b8',
                                background: formState === 1
                                    ? 'linear-gradient(135deg, #f97316, #ea580c)'
                                    : 'transparent',
                                boxShadow: formState === 1 ? '0 4px 15px rgba(249, 115, 22, 0.35)' : 'none',
                                transition: 'all 0.25s ease',
                                '&:hover': {
                                    background: formState === 1
                                        ? 'linear-gradient(135deg, #f97316, #ea580c)'
                                        : 'rgba(255, 255, 255, 0.05)',
                                },
                            }}
                        >
                            Sign Up
                        </Button>
                    </Box>

                    {/* Auth Form */}
                    <Box component="form" sx={{ width: '100%' }} onSubmit={handleSubmit}>
                        {formState === 1 && (
                            <TextField
                                fullWidth
                                margin="normal"
                                required
                                id='name'
                                label="Full Name"
                                name='name'
                                value={name}
                                autoFocus
                                onChange={(e) => setName(e.target.value)}
                            />
                        )}

                        <TextField
                            value={username}
                            fullWidth
                            margin="normal"
                            required
                            id='username'
                            label="Username"
                            name='username'
                            autoFocus={formState === 0}
                            onChange={(e) => setUsername(e.target.value)}
                        />

                        <TextField
                            value={password}
                            fullWidth
                            margin="normal"
                            required
                            id='password'
                            label="Password"
                            name='password'
                            type='password'
                            onChange={(e) => setPassword(e.target.value)}
                        />

                        {error && (
                            <Alert
                                severity="error"
                                sx={{
                                    mt: 2,
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#fca5a5',
                                    borderRadius: '10px',
                                }}
                            >
                                {error}
                            </Alert>
                        )}

                        <Button
                            fullWidth
                            variant="contained"
                            type='submit'
                            sx={{
                                mt: 3.5,
                                py: 1.35,
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #db2777 100%)',
                                color: '#ffffff',
                                textTransform: 'none',
                                fontSize: '1rem',
                                fontWeight: 600,
                                boxShadow: '0 8px 25px rgba(249, 115, 22, 0.35)',
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                    boxShadow: '0 12px 30px rgba(249, 115, 22, 0.5)',
                                    transform: 'translateY(-2px)',
                                    filter: 'brightness(1.1)',
                                },
                            }}
                        >
                            {formState === 0 ? "Sign In to AP Meet" : "Create Account"}
                        </Button>
                    </Box>
                </Box>
            </Box>

            <Snackbar
                open={open}
                autoHideDuration={4000}
                onClose={() => setOpen(false)}
            >
                <Alert severity="success" sx={{ width: '100%', borderRadius: '10px' }}>
                    {message}
                </Alert>
            </Snackbar>
        </ThemeProvider>
    );
}
