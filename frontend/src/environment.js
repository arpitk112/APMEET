// Use environment variable if available, otherwise fall back to production/development logic
const IS_PROD = import.meta.env.PROD;

const server = import.meta.env.VITE_API_URL ||
    (IS_PROD ? "https://apmeet.onrender.com" : "http://localhost:8000");

export default server;