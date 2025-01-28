import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';

// https://vitejs.dev/config/
export default defineConfig({
  cacheDir: './.vite',
  build: {
    target: 'esnext',
    minify: false,
  },
  plugins: [react(), viteCommonjs()],
  esbuild: {
    supported: {
      'top-level-await': true, // browsers can handle top-level-await features
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  define: {
    // Some GraphQL package checks for this env variable, so we need to define it to avoid dapp crashing
    'process.env.NODE_DEBUG': 'false',
  },
});
