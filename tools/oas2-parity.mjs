#!/usr/bin/env node
// Swagger 2.0 ↔ OpenAPI 3.x parity pass over rules/all-rules.yaml (openapi group only).
// SURGICAL: classifies rules with the yaml parser, then edits the RAW TEXT line-by-line
// so the hand-curated formatting/comments are preserved byte-for-byte outside the exact
// lines changed. For each target rule it either inserts a `formats:` block right after the
// rule key, or rewrites its single-line `given:` into a multipath seq. A twin worklist is
// written to tools/oas2-twin-worklist.json. Idempotent (skips rules already declaring formats).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'rules', 'all-rules.yaml');
const text = readFileSync(FILE, 'utf8');
const doc = parseDocument(text);
const oa = doc.get('openapi', true);

const asList = (g) => (g == null ? [] : Array.isArray(g) ? g : [g]).map(String);
const RX = {
  oas2: /\$\.definitions\b|\$\.securityDefinitions\b|\bswagger\b|\$\.host\b|\$\.basePath\b|\$\.schemes\b|in\s*==\s*'(body|formData)'/,
  security: /components\.securitySchemes/,
  schemas: /components\.schemas/,
  compParams: /components\.parameters/,
  compResponses: /components\.responses/,
  oas3Given: /requestBody|\.content\b|components\.(requestBodies|links|callbacks)|\$\.servers\b|\bwebhooks\b|\$\.openapi\b/,
};
const OAS3_THEN_FIELDS = new Set(['requestBody', 'content', 'servers', 'webhooks', 'components', 'openapi']);
const thenFields = (t) => (Array.isArray(t) ? t : [t]).filter(Boolean).map((x) => String(x.field ?? ''));

// ---- classify: name -> { tag?: 'oas2'|'oas3', broaden?: [from,to] } ----
const actions = new Map();
const worklist = [];
for (const pair of oa.items) {
  const name = String(pair.key.value);
  const r = pair.value?.toJSON ? pair.value.toJSON() : {};
  if (r.formats != null) continue; // already scoped
  const gs = asList(r.given);
  const joined = gs.join(' || ');
  const tf = thenFields(r.then);
  const fo = JSON.stringify(r.then || '');
  const has = (rx) => rx.test(joined);
  const thenIs3x = tf.some((f) => OAS3_THEN_FIELDS.has(f)) || /servers|requestBody/.test(fo);

  if (has(RX.oas2)) { actions.set(name, { tag: 'oas2' }); continue; }
  if (has(RX.security)) { actions.set(name, { tag: 'oas3' }); worklist.push({ name, kind: 'security-twin', given: gs }); continue; }
  if (has(RX.schemas)) { actions.set(name, { broaden: ['components.schemas', 'definitions'] }); continue; }
  if (has(RX.compParams)) {
    if (tf.includes('schema')) { actions.set(name, { tag: 'oas3' }); worklist.push({ name, kind: 'param-schema-twin', given: gs }); }
    else actions.set(name, { broaden: ['components.parameters', 'parameters'] });
    continue;
  }
  if (has(RX.compResponses)) { actions.set(name, { broaden: ['components.responses', 'responses'] }); continue; }
  if (has(RX.oas3Given) || thenIs3x) {
    actions.set(name, { tag: 'oas3' });
    const kind = /requestBody/.test(joined + fo) ? 'requestBody-twin'
      : /\.content\b/.test(joined) || tf.includes('content') ? 'response-content-twin'
      : /servers/.test(joined + fo) ? 'servers-twin' : 'review';
    worklist.push({ name, kind, given: gs });
  }
}

// ---- surgical text edit, scoped to the openapi group ----
const lines = text.split('\n');
const out = [];
let group = null;
let currentRule = null;
const stats = { tagged_oas3: 0, tagged_oas2: 0, broadened: 0, broaden_skipped: [] };
const topKey = /^([a-z][a-z0-9-]*):\s*$/;        // 0-indent group key
const ruleKey = /^  ([a-z0-9][a-z0-9_-]*):\s*$/; // 2-indent rule key
const givenLine = /^    given: (.*)$/;           // single-line given

for (const line of lines) {
  const tk = line.match(topKey);
  if (tk) { group = tk[1]; currentRule = null; out.push(line); continue; }
  if (group === 'openapi') {
    const rk = line.match(ruleKey);
    if (rk) {
      currentRule = rk[1];
      out.push(line);
      const a = actions.get(currentRule);
      if (a?.tag) { out.push('    formats:', `      - ${a.tag}`); a.tag === 'oas3' ? stats.tagged_oas3++ : stats.tagged_oas2++; }
      continue;
    }
    const gl = line.match(givenLine);
    const act = actions.get(currentRule);
    if (gl && act?.broaden) {
      const [from, to] = act.broaden;
      const raw = gl[1];
      const sib = raw.split(from).join(to);
      if (sib !== raw) { out.push('    given:', `      - ${raw}`, `      - ${sib}`); stats.broadened++; continue; }
      stats.broaden_skipped.push(currentRule);
    } else if (act?.broaden && /^    given:\s*$/.test(line)) {
      stats.broaden_skipped.push(currentRule); // multi-line given — left agnostic (no 2.0 misfire, coverage gap only)
    }
  }
  out.push(line);
}

writeFileSync(FILE, out.join('\n'));
writeFileSync(join(ROOT, 'tools', 'oas2-twin-worklist.json'), JSON.stringify(worklist, null, 2));

// ---- mirror the same changes into the runtime artifact src/all-rules.json ----
// (it carries build-processed fields like remapped severity, so we PATCH it in place
// rather than regenerate — only adding `formats` and broadening `given` by rule name.)
const JSON_FILE = join(ROOT, 'src', 'all-rules.json');
const jdoc = JSON.parse(readFileSync(JSON_FILE, 'utf8'));
const jstats = { tagged: 0, broadened: 0 };
for (const [name, a] of actions) {
  const r = jdoc.openapi?.[name];
  if (!r) continue;
  if (a.tag && r.formats == null) { r.formats = [a.tag]; jstats.tagged++; }
  if (a.broaden) {
    const [from, to] = a.broaden;
    const gs = Array.isArray(r.given) ? r.given : [r.given];
    const extra = gs.map((g) => String(g).split(from).join(to)).filter((g) => !gs.includes(g));
    if (extra.length) { r.given = [...gs, ...extra]; jstats.broadened++; }
  }
}
writeFileSync(JSON_FILE, JSON.stringify(jdoc));
console.log('json patched:', JSON.stringify(jstats));
console.log(JSON.stringify({ ...stats, worklist: worklist.length, worklist_by_kind: worklist.reduce((a, w) => ((a[w.kind] = (a[w.kind] || 0) + 1), a), {}) }, null, 2));
