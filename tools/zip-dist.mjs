// Post-build step: package the SINGLE-FILE build (dist-local/, a self-contained
// index.html produced by `SINGLEFILE=1 vite build`) into dist/api-validator.zip,
// which the live site serves for the "Run Locally" button. Because everything —
// JS, CSS, and the Monaco workers — is inlined, a user can just unzip and open
// index.html directly (file://); no server or external fetches required.
//
// Uses the system `zip` (present on macOS and the ubuntu CI runner). Never fails
// the build over the optional archive — the site still deploys.
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const SRC = 'dist-local';   // single-file build output
const OUTDIR = 'dist';      // where the servable zip must land
const OUT = 'api-validator.zip';

if (!existsSync(SRC)) {
  console.warn(`zip-dist: ${SRC}/ not found (run \`SINGLEFILE=1 vite build\`) — skipping zip.`);
  process.exit(0);
}

// Short how-to that travels inside the archive.
writeFileSync(
  `${SRC}/RUN-LOCALLY.txt`,
  [
    'API Validator — run locally',
    '',
    'index.html is fully self-contained (all JavaScript, CSS, and workers are',
    'inlined). Just unzip and open index.html in your browser — double-click it,',
    'or drag it into a browser window. No server, no internet, no keys.',
    '',
    'Everything runs locally in your browser.',
    '',
    'Source: https://github.com/api-commons/api-validator',
    '',
  ].join('\n'),
);

try {
  execSync(`rm -f ${OUTDIR}/${OUT} && cd ${SRC} && zip -r -q -X ../${OUTDIR}/${OUT} . -x '*.zip'`, { stdio: 'inherit' });
  console.log(`zip-dist: wrote ${OUTDIR}/${OUT} from ${SRC}/`);
} catch (e) {
  console.warn(`zip-dist: could not create ${OUT} (is \`zip\` installed?) — skipping. ${e?.message || e}`);
}
