
// Declare the shape of our runtime config
interface WindowEnv {
    GEMINI_API_KEY?: string;
}

declare global {
    interface Window {
        ENV?: WindowEnv;
    }
}

// Helper to get the API Key with fallback to build-time env vars
// In Vite dev: process.env.API_KEY is replaced by the actual key from .env
// In Docker prod: window.ENV.GEMINI_API_KEY is set by config.js
const key = window.ENV?.GEMINI_API_KEY || import.meta.env?.VITE_GEMINI_API_KEY || process.env.API_KEY || '';
console.log('[Config] Loaded API Key length:', key.length, 'Last 4 chars:', key.slice(-4));
if (!key) console.error('[Config] API Key is missing!');

export const Config = {
    GEMINI_API_KEY: key,
};
