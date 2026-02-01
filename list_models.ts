import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function listModels() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        console.log('Listing models to models.txt...');
        const result = await ai.models.list();

        // Check if result itself is iterable or has .models
        let models = [];
        if (Array.isArray(result)) {
            models = result;
        } else if ((result as any).models) {
            models = (result as any).models;
        } else {
            // Try iterating if it's an async iterable (common in google sdks)
            // But for sync write safely let's just inspect
            models = [result];
        }

        const output = JSON.stringify(result, null, 2);
        fs.writeFileSync('models.txt', output);
        console.log('Done.');

    } catch (error) {
        console.error('Error listing models:', error);
    }
}

listModels();
