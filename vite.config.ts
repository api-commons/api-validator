import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two build targets:
//   default        -> dist/       multi-chunk site for validator.apicommons.org
//   SINGLEFILE=1   -> dist-local/ ONE self-contained index.html for the
//                     "Run Locally" download, so a double-clicked file:// page
//                     works with no external module/worker fetches (which the
//                     browser blocks over file://). Workers are inlined via
//                     ?worker&inline in main.ts.
const singleFile = process.env.SINGLEFILE === '1';

// Strip the `crossorigin` attribute Vite stamps on the injected <link>/<script>
// tags. On the live (same-origin) site it's a harmless no-op, but over file:// a
// crossorigin stylesheet is a CORS request against a null origin — the browser
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
    ...(singleFile ? [viteSingleFile()] : []),
  ],
  // Classic (iife) workers inline as blob URLs that run over file://; ES-module
  // blob workers can be blocked there.
  worker: { format: 'iife' },
  build: {
    target: 'es2020',
    sourcemap: false,
    outDir: singleFile ? 'dist-local' : 'dist',
  },
});
