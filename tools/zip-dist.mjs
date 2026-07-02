// Post-build step: package the built site (dist/) into dist/api-validator.zip so
// the "Run Locally" button can hand a user the whole app as a static bundle they
// serve themselves. Runs after `vite build`; uses the system `zip` (present on
// macOS and the ubuntu CI runner).
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const OUT = 'api-validator.zip';

if (!existsSync('dist')) {
  console.error('zip-dist: dist/ not found — run `vite build` first.');
  process.exit(1);
}

// A short how-to that travels inside the archive.
writeFileSync(
  'dist/RUN-LOCALLY.txt',
  [
    'API Validator — run locally',
    '',
    'This is the fully built, static app. It runs entirely in your browser; there',
    'is no backend and no keys are required.',
    '',
    '1. Unzip this archive.',
    '2. From the unzipped folder, start any static web server at the folder ROOT:',
    '',
    '     python3 -m http.server 8000',
    '   or',
    '     npx serve .',
    '',
    '3. Open http://localhost:8000/ in your browser.',
    '',
    '(Opening index.html directly via file:// will not work — ES modules need to be',
    'served over http, so use a local server as above.)',
    '',
    'Source: https://github.com/api-commons/api-validator',
    '',
  ].join('\n'),
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
