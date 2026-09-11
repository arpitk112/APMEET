// Connects to your laptop IP on phone/LAN, localhost in dev, or Render in prod
const IS_PROD: boolean = import.meta.env.PROD;

const getDevServerUrl = (): string => {
    if (typeof window !== "undefined" && window.location.hostname) {
        return `http://${window.location.hostname}:8000`;
    }
    return "http://localhost:8000";
};

const server: string = (import.meta.env.VITE_API_URL as string) ||
    (IS_PROD ? "https://apmeet-bckend.onrender.com" : getDevServerUrl());

export const GOOGLE_CLIENT_ID: string = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || "";

export default server;
