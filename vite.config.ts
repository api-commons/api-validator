import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Static SPA. Use a RELATIVE base ('./') so the built assets resolve no matter
// where the app is served from — the custom domain root (validator.apicommons.org)
// AND an unzipped "Run Locally" copy served from any folder.
// Strip the `crossorigin` attribute Vite stamps on the injected <link>/<script>
// tags. On the live (same-origin) site it's a harmless no-op, but when the
// unzipped "Run Locally" copy is opened over file://, a crossorigin stylesheet is
// a CORS request against a null origin with no CORS headers — so the browser
// refuses to apply the CSS. Removing it lets the CSS load from file:// too.
const stripCrossorigin = {
  name: 'strip-crossorigin',
  transformIndexHtml: {
    order: 'post' as const,
    handler: (html: string) => html.replace(/\s+crossorigin(=(["'][^"']*["']|\S+))?/g, ''),
  },
};

export default defineConfig({
  base: './',
  plugins: [
    nodePolyfills({
      // The Spectral engine pulls in a few Node built-ins.
      globals: { process: true, Buffer: true },
    }),
    stripCrossorigin,
  ],
  worker: { format: 'es' },
  build: { target: 'es2020', sourcemap: false },
});
