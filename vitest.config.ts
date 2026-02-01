/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}', '**/__tests__/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**'],
        setupFiles: ['./tests/setup.ts'],
    },
});
