import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@terminalmind/core',
          '@terminalmind/services',
          '@terminalmind/api',
          '@terminalmind/ext-terminal',
          '@terminalmind/ext-ai',
          '@terminalmind/ext-ssh',
          '@terminalmind/ext-sftp',
          '@terminalmind/ext-connections',
        ],
      }),
    ],
    build: {
      rollupOptions: {
        external: ['node-pty', 'keytar', 'cpu-features'],
      },
    },
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@terminalmind/core', '@terminalmind/api'],
      }),
    ],
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
      },
    },
    plugins: [react()],
  },
});
