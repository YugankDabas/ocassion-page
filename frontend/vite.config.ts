import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const apiTarget = 'http://localhost:4000';
  return {
    plugins: [react()],
    // Shown on the sign-in screen, to tell which build is running.
    define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
    server: {
      port: 5173,
      // Same-origin in dev: the panel calls /api/* and Vite forwards to the backend.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
        '/uploads': { target: apiTarget, changeOrigin: false },
      },
    },
    build: {
      sourcemap: true,
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router'],
            editor: ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-link', '@tiptap/extension-underline'],
            vendor: ['@tanstack/react-query', '@dnd-kit/core', '@dnd-kit/sortable', 'zod', 'sonner'],
          },
        },
      },
    },
  };
});
