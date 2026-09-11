import axios, { HttpStatusCode } from "axios";
import { createContext, useContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import server from "../environment";


export const AuthContext = createContext({});

const client = axios.create({
    baseURL: `${server}/api/v1/users`
})

export const AuthProvider = ({ children }) => {

    const authContext = useContext(AuthContext);

    const [userData, setUserData] = useState(authContext);

    // Navigation router hook
    const router = useNavigate();

    // Google OAuth login & signup handler
    const handleGoogleAuth = async (credential) => {
        try {
            let request = await client.post("/google-auth", { credential });
            if (request.status === HttpStatusCode.Ok) {
                localStorage.setItem("token", request.data.token);
                if (request.data.user) {
                    setUserData(request.data.user);
                    localStorage.setItem("user", JSON.stringify(request.data.user));
                }
                router("/home");
                return request.data;
            }
        } catch (err) {
            throw err;
        }
    };

    const handleLogin = async (username, password) => {
        try {
            let request = await client.post("/login", {
                username: username,
                password: password
            })

            if (request.status === HttpStatusCode.Ok) {
                localStorage.setItem("token", request.data.token);
                router("/home");
            }

        } catch (err) {
            throw err;
        }
    }

    const handleRegister = async (name, username, password) => {
        try {
            let request = await client.post("/register", {
                name: name,
                username: username,
                password: password
            })

            if (request.status === HttpStatusCode.Created) {
                return request.data.message;
            }
        } catch (err) {
            throw err;
        }
    }

    const getHistoryOfUser = async () => {
        try {
            let request = await client.get("/get_all_activity", {
                params: {
                    token: localStorage.getItem("token")
                }
            });
            return request.data
        } catch (err) {
            throw err;
        }
    }

    const addToUserHistory = async (meetingCode) => {
        try {
            let request = await client.post("/add_to_activity", {
                token: localStorage.getItem("token"),
                meeting_code: meetingCode
            })
            return request;
        } catch (e) {
            throw e;
        }
    }

    const deleteFromHistory = async (meetingCode) => {
        try {
            await client.delete("/delete_activity", {
                data: {
                    token: localStorage.getItem("token"),
                    meeting_code: meetingCode
                }
            });
        } catch (err) {
            throw err;
        }
    };



    const data = {
        userData, setUserData, getHistoryOfUser, handleRegister, handleLogin, handleGoogleAuth, addToUserHistory, deleteFromHistory
    }

    return (
        <AuthContext.Provider value={data}>
            {children}
        </AuthContext.Provider>
    )



}