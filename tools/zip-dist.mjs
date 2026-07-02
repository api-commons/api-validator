// Post-build step: package the built site (dist/) into dist/api-validator.zip so
// the "Run Locally" button can hand a user the whole app as a static bundle they
// serve themselves. Runs after `vite build`; uses the system `zip` (present on
// macOS and the ubuntu CI runner).
//
// The build uses a relative base ('./'), so assets resolve from any folder. The
// app still needs a real HTTP server — browsers block ES modules and web workers
// over file:// — so we include double-clickable launchers + a how-to.
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, chmodSync } from 'node:fs';

const OUT = 'api-validator.zip';

if (!existsSync('dist')) {
  console.error('zip-dist: dist/ not found — run `vite build` first.');
  process.exit(1);
}

// How-to that travels inside the archive.
writeFileSync(
  'dist/RUN-LOCALLY.txt',
  [
    'API Validator — run locally',
    '',
    'This is the fully built, static app. It runs entirely in your browser; there',
    'is no backend and no keys are required.',
    '',
    'IMPORTANT: you must serve the folder over http — you cannot just double-click',
    'index.html. Browsers block JavaScript modules and web workers over file://,',
    'so the page would load but the app would not run.',
    '',
    'Easiest: double-click the launcher for your OS (it starts a local server and',
    'opens your browser):',
    '   • macOS:    start.command',
    '   • Windows:  start.bat',
    '   • Linux:    start.sh   (or run it in a terminal)',
    '',
    'Or do it by hand, from inside this folder:',
    '   python3 -m http.server 8000      # then open http://localhost:8000/',
    '   # or:  npx serve .',
    '',
    'Source: https://github.com/api-commons/api-validator',
    '',
  ].join('\n'),
);

// macOS / Linux launcher — serve this folder and open the browser.
writeFileSync(
  'dist/start.command',
  [
    '#!/bin/bash',
    'cd "$(dirname "$0")"',
    'PORT=8000',
    'URL="http://localhost:$PORT/"',
    'echo "Serving API Validator at $URL  (press Ctrl+C to stop)"',
    '( sleep 1; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") ) &',
    'python3 -m http.server "$PORT" 2>/dev/null || python -m http.server "$PORT"',
    '',
  ].join('\n'),
);
// A plain .sh alias for Linux users who prefer it.
writeFileSync('dist/start.sh', 'exec "$(dirname "$0")/start.command"\n');
chmodSync('dist/start.command', 0o755);
chmodSync('dist/start.sh', 0o755);

// Windows launcher.
writeFileSync(
  'dist/start.bat',
  [
    '@echo off',
    'cd /d "%~dp0"',
    'set PORT=8000',
    'start "" "http://localhost:%PORT%/"',
    'py -m http.server %PORT% 2>nul || python -m http.server %PORT%',
    '',
  ].join('\r\n'),
);

// Build the archive from inside dist/ (so paths are relative), excluding any
// pre-existing zip. -X drops extra macOS metadata for a clean cross-platform zip.
// Never fail the build over the optional archive — the site still deploys.
try {
  execSync(`cd dist && rm -f ${OUT} && zip -r -q -X ${OUT} . -x '*.zip'`, { stdio: 'inherit' });
  console.log(`zip-dist: wrote dist/${OUT}`);
} catch (e) {
  console.warn(`zip-dist: could not create ${OUT} (is \`zip\` installed?) — skipping. ${e?.message || e}`);
}
