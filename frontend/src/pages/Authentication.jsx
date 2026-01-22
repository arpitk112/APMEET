import * as React from 'react';
import {
    Avatar,
    Button,
    CssBaseline,
    TextField,
    FormControlLabel,
    Checkbox,
    Paper,
    Box,
    Typography,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import Snackbar from '@mui/material/Snackbar';


const theme = createTheme();

export default function Authentication() {

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const [formState, setFormState] = useState(0);
    const [open, setOpen] = useState(false);

    const { handleRegister, handleLogin } = React.useContext(AuthContext)

    let handleAuth = async () => {
        try {
            // Login
            if (formState == 0) {
                let result = await handleLogin(username, password);
            }

            // SignUp
            if (formState == 1) {
                let result = await handleRegister(name, username, password);
                console.log(result);
                setUsername('');
                setMessage(result);
                setOpen(true);
                setError("");
                setFormState(0);
                setPassword('');
            }
        } catch (err) {
            let message = (err.response.data.message);
            setError(message);
        }
    }

    //Additional Event Handler--> Submit on Enter
    const handleSubmit = (e) => {
        e.preventDefault();
        handleAuth();
    };


    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box
                sx={{
                    minHeight: '100vh',
                    width: '100vw',
                    backgroundImage:
                        'url(https://images.unsplash.com/photo-1522202176988-66273c2fd55f)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Paper
                    elevation={10}
                    sx={{
                        width: 400,
                        p: 4,
                        backdropFilter: 'blur(6px)',
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                        }}
                    >
                        <Avatar sx={{ m: 1, bgcolor: 'secondary.main' }}>
                            <LockOutlinedIcon />
                        </Avatar>

                        <div>
                            <Button variant={formState == 0 ? "contained" : " "} onClick={() => setFormState(0)}>Sign In</Button>
                            <Button variant={formState == 1 ? "contained" : " "} onClick={() => setFormState(1)}>Sign Up</Button>
                        </div>

                        <Box component="form" sx={{ mt: 2 }} onSubmit={handleSubmit}>
                            {formState == 1 ? <TextField
                                fullWidth
                                margin="normal"
                                required
                                id='username'
                                label="Fullname"
                                name='username'
                                // value={name}
                                autoFocus
                                onChange={(e) => { setName(e.target.value) }}
                            /> : <></>}


                            <TextField
                                value={username}
                                fullWidth
                                margin="normal"
                                required
                                id='username'
                                label="Username"
                                name='username'
                                // value={username}
                                autoFocus
                                onChange={(e) => { setUsername(e.target.value) }}

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
                                // value={password} 
                                autoFocus
                                onChange={(e) => { setPassword(e.target.value) }}
                            />
                            <p style={{ color: "red" }}>{error}</p>

                            <Button
                                fullWidth
                                variant="contained"
                                sx={{ mt: 3 }}
                                // onClick={handleAuth}
                                type='submit'
                            >
                                {formState == 0 ? "Sign In" : "Sign Up"}
                            </Button>
                        </Box>
                    </Box>
                </Paper>
            </Box>

            <Snackbar
                open={open}
                autoHideDuration={4000}
                message={message}
            />
        </ThemeProvider>
    );
}
