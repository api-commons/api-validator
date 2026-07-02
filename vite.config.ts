import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Static SPA. Use a RELATIVE base ('./') so the built assets resolve no matter
// where the app is served from — the custom domain root (validator.apicommons.org)
// AND an unzipped "Run Locally" copy served from any folder.
export default defineConfig({
  base: './',
  plugins: [
    nodePolyfills({
      // The Spotlight (Spectral) engine pulls in a few Node built-ins.
      globals: { process: true, Buffer: true },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2020', sourcemap: false },
});
