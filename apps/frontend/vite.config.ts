import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react(), tailwindcss()],
	build: {
		outDir: resolve(fileURLToPath(new URL('.', import.meta.url)), '../../www/frontend'),
		emptyOutDir: true,
	},
});
