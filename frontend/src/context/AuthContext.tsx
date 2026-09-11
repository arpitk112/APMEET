import axios, { HttpStatusCode } from "axios";
import { createContext, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import server from "../environment";

export interface UserData {
    name?: string;
    username?: string;
    avatar?: string;
    email?: string;
    [key: string]: any;
}

export interface AuthContextType {
    userData: any;
    setUserData: React.Dispatch<React.SetStateAction<any>>;
    getHistoryOfUser: () => Promise<any>;
    handleRegister: (name: string, username: string, password: string) => Promise<any>;
    handleLogin: (username: string, password: string) => Promise<void>;
    handleGoogleAuth: (credential: string) => Promise<any>;
    addToUserHistory: (meetingCode: string) => Promise<any>;
    deleteFromHistory: (meetingCode: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const client = axios.create({
    baseURL: `${server}/api/v1/users`
});

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [userData, setUserData] = useState<any>(null);
    const router = useNavigate();

    // Google OAuth login & signup handler
    const handleGoogleAuth = async (credential: string) => {
        try {
            const request = await client.post("/google-auth", { credential });
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

    const handleLogin = async (username: string, password: string) => {
        try {
            const request = await client.post("/login", {
                username,
                password
            });

            if (request.status === HttpStatusCode.Ok) {
                localStorage.setItem("token", request.data.token);
                router("/home");
            }
        } catch (err) {
            throw err;
        }
    };

    const handleRegister = async (name: string, username: string, password: string) => {
        try {
            const request = await client.post("/register", {
                name,
                username,
                password
            });

            if (request.status === HttpStatusCode.Created) {
                return request.data.message;
            }
        } catch (err) {
            throw err;
        }
    };

    const getHistoryOfUser = async () => {
        try {
            const request = await client.get("/get_all_activity", {
                params: {
                    token: localStorage.getItem("token")
                }
            });
            return request.data;
        } catch (err) {
            throw err;
        }
    };

    const addToUserHistory = async (meetingCode: string) => {
        try {
            const request = await client.post("/add_to_activity", {
                token: localStorage.getItem("token"),
                meeting_code: meetingCode
            });
            return request;
        } catch (e) {
            throw e;
        }
    };

    const deleteFromHistory = async (meetingCode: string) => {
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

    const data: AuthContextType = {
        userData,
        setUserData,
        getHistoryOfUser,
        handleRegister,
        handleLogin,
        handleGoogleAuth,
        addToUserHistory,
        deleteFromHistory
    };

    return (
        <AuthContext.Provider value={data}>
            {children}
        </AuthContext.Provider>
    );
};
