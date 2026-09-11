// Connects to your laptop IP on phone/LAN, localhost in dev, or Render in prod
const IS_PROD = import.meta.env.PROD;

const getDevServerUrl = () => {
    if (typeof window !== "undefined" && window.location.hostname) {
        return `http://${window.location.hostname}:8000`;
    }
    return "http://localhost:8000";
};

const server = import.meta.env.VITE_API_URL ||
    (IS_PROD ? "https://apmeet-backend.onrender.com" : getDevServerUrl());

export default server;