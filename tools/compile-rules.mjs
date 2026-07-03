#!/usr/bin/env node
// Compile the best-of-breed ruleset from rules/sources/* into a tagged ruleset.
// Rule names are kept general (no source prefix); provenance lives in tags
// (source:*). Exact duplicates are merged. Each rule gets a verbose description.
// Rules are validated against the engine — both that they construct AND that they
// actually lint a sample without errors (Nimma) — and pruned if they fail.
//
// Emits src/compiled-ruleset.ts and rules/spotlight-recommended.yaml.

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { parse, stringify } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'rules', 'sources');
// Curated names + spec:/experience: tags, keyed by `${format}|${currentSlug}`.
const META_PATH = join(ROOT, 'tools', 'rule-meta.json');
const META = existsSync(META_PATH) ? JSON.parse(readFileSync(META_PATH, 'utf8')) : {};
const metaTags = (m) => [...(m?.spec ?? []).map((s) => `spec:${s}`), ...(m?.experience ?? []).map((e) => `experience:${e}`)];
const FN_DIR = join(ROOT, 'src', 'functions');
const require = createRequire(import.meta.url);
const builtins = require('@stoplight/spectral-functions');
const BUILTINS = new Set(Object.keys(builtins).filter((k) => typeof builtins[k] === 'function'));

const customFns = {};
if (existsSync(FN_DIR)) {
  for (const src of readdirSync(FN_DIR)) {
    const d = join(FN_DIR, src);
    if (!statSync(d).isDirectory()) continue;
    customFns[src] = new Set(readdirSync(d).filter((f) => /\.m?js$/.test(f)).map((f) => f.replace(/\.m?js$/, '')));
  }
}

const SOURCES = {
  'adidas.yaml': { id: 'adidas', format: 'openapi' },
  'baloise.yaml': { id: 'baloise', format: 'openapi' },
  'digitalocean.yaml': { id: 'digitalocean', format: 'openapi' },
  'microcks.yaml': { id: 'microcks', format: 'openapi' },
  'paystack.yaml': { id: 'paystack', format: 'openapi' },
  'schwarz-it.yaml': { id: 'schwarz-it', format: 'openapi' },
  'team-digitale.yaml': { id: 'team-digitale', format: 'openapi' },
  'trimble.yaml': { id: 'trimble', format: 'openapi' },
};
const DIR_SOURCES = {
  'sps-commerce': { id: 'sps-commerce', format: 'openapi' },
  // API Evangelist's own OpenAPI governance rules (first-party). Each rule ships
  // an `-error`/`-warn` violation and a paired `-info` positive-confirmation that
  // fires on COMPLIANT docs — drop the confirmations, they're noise in a linter.
  'api-evangelist': { id: 'api-evangelist', format: 'openapi', drop: (k) => /-info$/.test(k) },
};

const CATEGORY_KEYWORDS = [
  ['security', /secur|auth|oauth|https|secret|cors|jwt|scope/i],
  ['naming', /nam|casing|case|kebab|camel|snake|pascal/i],
  ['documentation', /doc|description|summary|example|comment|contact|license|info/i],
  ['versioning', /version|deprecat/i],
  ['pagination', /pagina|cursor|limit|offset/i],
  ['errors', /error|problem|4xx|5xx|status/i],
  ['structure', /path|url|resource|tag|operation|param|schema|response|request|header|media|ref/i],
];
function inferCategory(name, fileHint) {
  const hint = (fileHint || '').toLowerCase();
  for (const [cat, re] of CATEGORY_KEYWORDS) if (re.test(hint)) return cat;
  for (const [cat, re] of CATEGORY_KEYWORDS) if (re.test(name)) return cat;
  return 'general';
}

function resolveFunctions(then, srcId, used) {
  const arr = Array.isArray(then) ? then : [then];
  for (const t of arr) {
    if (!t || typeof t !== 'object' || t.function === undefined) continue;
    const fn = t.function;
    if (typeof fn !== 'string' || BUILTINS.has(fn)) continue;
    if (customFns[srcId]?.has(fn)) { const ns = `${srcId}:${fn}`; t.function = ns; used.set(ns, { src: srcId, fn }); }
    else return false;
  }
  return true;
}

// strip source-identifying tokens (sources bake their name in). Keep oas2/oas3
// tokens — they distinguish the format twins used for Swagger 2.0 ↔ 3.x parity.
const SOURCE_TOKENS = new Set(['adidas', 'baloise', 'sps', 'tas', 'trimble', 'microcks', 'paystack', 'schwarz', 'italia', 'teamdigitale', 'digitalocean', 'spscommerce']);
const STRIP_TOKENS = new Set([...SOURCE_TOKENS]);
function cleanName(name) {
  const parts = name.split('-').filter((p) => !STRIP_TOKENS.has(p.toLowerCase()));
  const r = parts.join('-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
  return r || name;
}

// ---- verbose descriptions ----
const humanize = (n) => n.replace(/[-_/]/g, ' ').replace(/\s+/g, ' ').trim();
function describeCheck(then) {
  const arr = Array.isArray(then) ? then : [then];
  return arr
    .map((t) => {
      if (!t || typeof t !== 'object') return '';
      const o = t.functionOptions || {};
      const field = t.field ? ` the \`${t.field}\` field` : ' the targeted value';
      switch (t.function) {
        case 'truthy': return `requires${field} to be present and non-empty`;
        case 'falsy': return `requires${field} to be absent or empty`;
        case 'defined': return `requires${field} to be defined`;
        case 'undefined': return `requires${field} to be undefined`;
        case 'pattern': return o.match ? `requires${field} to match the pattern \`${o.match}\``
          : o.notMatch ? `requires${field} not to match \`${o.notMatch}\`` : `applies a pattern check to${field}`;
        case 'casing': return `requires ${o.type || 'a specific'} casing on${field}`;
        case 'length': return `constrains the length of${field}${o.min != null ? ` to at least ${o.min}` : ''}${o.max != null ? ` and at most ${o.max}` : ''}`;
        case 'enumeration': return `requires${field} to be one of ${JSON.stringify(o.values || [])}`;
        case 'alphabetical': return `requires${field} to be in alphabetical order`;
        case 'schema': return `validates${field} against a JSON Schema`;
        case 'xor': return `requires exactly one of ${JSON.stringify(o.properties || [])} to be present`;
        case 'or': return `requires at least one of ${JSON.stringify(o.properties || [])} to be present`;
        case 'unreferencedReusableObject': return `flags reusable components that are never referenced`;
        default: return `applies a custom validation to${field}`;
      }
    })
    .filter(Boolean)
    .join(', and ');
}
function verboseDescription(name, rule) {
  let base = (rule.description || rule.message || humanize(name)).trim().replace(/\s+/g, ' ');
  if (!/[.!?]$/.test(base)) base += '.';
  const check = describeCheck(rule.then);
  const given = Array.isArray(rule.given) ? rule.given.join('`, `') : rule.given;
  const sev = rule.severity != null ? String(rule.severity) : 'warn';
  let out = base;
  if (check) out += ` It ${check}`;
  if (given) out += ` (evaluated at \`${given}\`)`;
  out += `. Severity: ${sev}.`;
  return out;
}

// ---- collect rules (de-namespaced, deduped) ----
const VALID = new Set(['description', 'documentationUrl', 'recommended', 'given', 'resolved', 'severity', 'message', 'formats', 'then', 'type', 'extensions']);
const compiled = {};
const usedCustom = new Map();
const sigMap = new Map();
const used = new Set();
const stats = {};

function addSource(srcId, format, rulesObj, fileHint, dropFn) {
  if (!rulesObj || typeof rulesObj !== 'object') return;
  stats[srcId] ??= { kept: 0, skipped: 0, merged: 0, dropped: 0 };
  for (const [origName, rule] of Object.entries(rulesObj)) {
    if (rule === false || rule === 'off') continue;
    if (typeof rule !== 'object' || rule === null) continue;
    if (dropFn && dropFn(origName)) { stats[srcId].dropped++; continue; }
    // Swagger / OpenAPI 2.0 is a first-class target now — keep oas2-named rules
    // and oas2 in formats so the ruleset reaches parity with OpenAPI 3.x.
    const clean = {};
    for (const [k, v] of Object.entries(rule)) if (VALID.has(k) || k.startsWith('x-')) clean[k] = structuredClone(v);
    if (clean.then !== undefined && !resolveFunctions(clean.then, srcId, usedCustom)) { stats[srcId].skipped++; continue; }

    const sig = JSON.stringify([clean.given, clean.then]);
    if (sigMap.has(sig)) {
      const ex = compiled[sigMap.get(sig)];
      ex.tags = [...new Set([...ex.tags, `source:${srcId}`])];
      stats[srcId].merged++;
      continue;
    }
    const curSlug = cleanName(origName);
    const m = META[`${format}|${curSlug}`];
    let key = m?.slug ?? curSlug;
    if (used.has(key)) { let i = 2; while (used.has(`${key}-${i}`)) i++; key = `${key}-${i}`; }
    used.add(key); sigMap.set(sig, key);
    // curated spec:/experience: tags from rule-meta (fall back to inferred category)
    const fallback = m ? [] : [`category:${inferCategory(origName, fileHint)}`];
    const tags = [...new Set([...(rule.tags || []), `source:${srcId}`, `format:${format}`, ...metaTags(m), ...fallback])];
    compiled[key] = { ...clean, tags, description: verboseDescription(origName, clean) };
    stats[srcId].kept++;
  }
}

for (const [file, meta] of Object.entries(SOURCES)) {
  const p = join(SRC, file);
  if (!existsSync(p)) continue;
  let doc; try { doc = parse(readFileSync(p, 'utf8'), { merge: true }); } catch { continue; }
  addSource(meta.id, meta.format, doc?.rules, file);
}
for (const [dir, meta] of Object.entries(DIR_SOURCES)) {
  const dp = join(SRC, dir);
  if (!existsSync(dp) || !statSync(dp).isDirectory()) continue;
  for (const file of readdirSync(dp)) {
    if (!/\.ya?ml$/.test(file)) continue;
    let doc; try { doc = parse(readFileSync(join(dp, file), 'utf8'), { merge: true }); } catch { continue; }
    addSource(meta.id, meta.format, doc?.rules, basename(file, '.yml'), meta.drop);
  }
}

// ---- engine setup + JS-form conversion ----
const core = require('@stoplight/spectral-core');
const fmts = require('@stoplight/spectral-formats');
const parsers = require('@stoplight/spectral-parsers');
const { oas } = require('@stoplight/spectral-rulesets');
const FA = { 'oas3.0': 'oas3_0', 'oas3.1': 'oas3_1' };
const lf = (n) => fmts[FA[n] ?? n] ?? fmts[n];
const fnMap = { ...builtins };
for (const [ns, { src, fn }] of usedCustom) {
  let file = join(FN_DIR, src, `${fn}.js`);
  if (!existsSync(file)) file = join(FN_DIR, src, `${fn}.mjs`);
  const mod = await import(pathToFileURL(file).href);
  fnMap[ns] = mod.default ?? mod;
}
const toJs = (node) =>
  Array.isArray(node) ? node.map(toJs)
  : node && typeof node === 'object'
    ? Object.fromEntries(Object.entries(node).map(([k, v]) =>
        k === 'function' && typeof v === 'string' ? [k, fnMap[v] ?? v]
        : k === 'formats' && Array.isArray(v) ? [k, v.map((f) => (typeof f === 'string' ? lf(f) : f)).filter(Boolean)]
        : [k, toJs(v)]))
    : node;

// ---- 1) structural prune (must construct) ----
let pruned = 0;
for (let i = 0; i < 80; i++) {
  try { new core.Ruleset({ ...toJs({ rules: compiled }), extends: [[oas, 'recommended']] }, { source: 'compile' }); break; }
  catch (e) {
    const unesc = (k) => String(k).replace(/~1/g, '/').replace(/~0/g, '~');
    const bad = new Set((e?.errors ?? []).map((x) => x?.path?.[1]).filter(Boolean).map(unesc));
    if (bad.size === 0) { console.error('unprunable:', e.message); break; }
    for (const k of bad) { delete compiled[k]; pruned++; }
  }
}

// ---- 2) runtime prune (must lint a sample without Nimma errors) ----
const SAMPLE = `openapi: "3.0.3"
info: { title: Sample, version: "1.0.0", description: d, contact: { name: n, url: "https://e.co" }, license: { name: MIT } }
servers: [{ url: "https://api.example.com/v1" }]
tags: [{ name: pets, description: p }]
paths:
  /pets:
    get:
      operationId: listPets
      summary: s
      tags: [pets]
      parameters: [{ name: limit, in: query, schema: { type: integer } }]
      responses: { "200": { description: ok, content: { application/json: { schema: { $ref: "#/components/schemas/Pet" } } } } }
    post:
      operationId: createPet
      summary: s
      tags: [pets]
      requestBody: { content: { application/json: { schema: { $ref: "#/components/schemas/Pet" } } } }
      responses: { "201": { description: created } }
components:
  schemas:
    Pet: { type: object, properties: { id: { type: integer }, name: { type: string } }, required: [id] }
  securitySchemes:
    bearer: { type: http, scheme: bearer }
`;
// the exact default the app loads first (must lint cleanly on first load)
const PETSTORE = `openapi: "3.0.3"
info:
  title: Pet Store
  version: "1.0.0"
paths:
  /Pets:
    get:
      responses:
        "200":
          description: A list of pets.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/Pet"
components:
  schemas:
    Pet:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
`;
// a clean Swagger / OpenAPI 2.0 document, so oas2-format rules are exercised
// (constructed + linted) during the runtime prune rather than silently dropped.
const SAMPLE_OAS2 = `swagger: "2.0"
info: { title: Sample, version: "1.0.0", description: d, contact: { name: n, url: "https://e.co" }, license: { name: MIT } }
host: api.example.com
basePath: /v1
schemes: [https]
consumes: [application/json]
produces: [application/json]
tags: [{ name: pets, description: p }]
paths:
  /pets:
    get:
      operationId: listPets
      summary: s
      tags: [pets]
      parameters: [{ name: limit, in: query, type: integer }]
      responses: { "200": { description: ok, schema: { $ref: "#/definitions/Pet" } } }
    post:
      operationId: createPet
      summary: s
      tags: [pets]
      parameters: [{ name: body, in: body, required: true, schema: { $ref: "#/definitions/Pet" } }]
      responses: { "201": { description: created } }
securityDefinitions:
  bearer: { type: apiKey, name: Authorization, in: header }
definitions:
  Pet: { type: object, properties: { id: { type: integer }, name: { type: string } }, required: [id] }
`;
// NOTE: SAMPLE_OAS2 is intentionally NOT in the destructive prune set yet — an
// untagged 3.x-structure rule throws on a 2.0 doc and would be wrongly pruned.
// During the parity port, 3.x-only rules get `formats: [oas3]` and oas2 rules get
// `formats: [oas2]`; once tagged, re-add SAMPLE_OAS2 here as a regression guard.
const SAMPLES_DOC = [PETSTORE, SAMPLE];
const Yaml = parsers.Yaml;
async function lints(rules, withOas) {
  try {
    const sp = new core.Spectral();
    const def = withOas ? { ...toJs({ rules }), extends: [[oas, 'recommended']] } : toJs({ rules });
    sp.setRuleset(new core.Ruleset(def, { source: 'rt' }));
    for (const s of SAMPLES_DOC) await sp.run(new core.Document(s, Yaml, 'sample.yaml'));
    return true;
  } catch { return false; }
}
let nimmaPruned = 0;
if (!(await lints(compiled, true))) {
  for (const key of Object.keys(compiled)) {
    if (!(await lints({ [key]: compiled[key] }, false))) { delete compiled[key]; nimmaPruned++; }
  }
  if (!(await lints(compiled, true))) console.error('WARNING: ruleset still errors after runtime prune');
}

// ---- drop now-unused custom imports ----
const stillUsed = new Set();
for (const r of Object.values(compiled)) for (const t of (Array.isArray(r.then) ? r.then : [r.then])) if (t?.function && usedCustom.has(t.function)) stillUsed.add(t.function);

const ruleset = {
  description: 'Spotlight best-of-breed API governance ruleset, compiled from public Spectral rulesets. Select rules with tags (source:*, category:*, format:*).',
  documentationUrl: 'https://github.com/api-commons/spotlight-validator',
  extends: [['spotlight:oas', 'recommended']],
  rules: compiled,
};

const imports = [];
const mapEntries = [];
let idx = 0;
for (const ns of stillUsed) {
  const { src, fn } = usedCustom.get(ns);
  const ext = existsSync(join(FN_DIR, src, `${fn}.js`)) ? 'js' : 'mjs';
  const local = `f${idx++}`;
  imports.push(`import ${local} from './functions/${src}/${fn}.${ext}';`);
  mapEntries.push(`  ${JSON.stringify(ns)}: ${local},`);
}
const ts = `/* GENERATED by tools/compile-rules.mjs — do not edit. */
import * as builtins from '@stoplight/spectral-functions';
${imports.join('\n')}

export const functions: Record<string, unknown> = {
  ...builtins,
${mapEntries.join('\n')}
};

export const ruleset = ${JSON.stringify(ruleset, null, 2)} as const;
`;
writeFileSync(join(ROOT, 'src', 'compiled-ruleset.ts'), ts);
writeFileSync(join(ROOT, 'rules', 'spotlight-recommended.yaml'), stringify(ruleset));

const cats = {};
for (const r of Object.values(compiled)) for (const t of r.tags) if (t.startsWith('category:')) cats[t] = (cats[t] || 0) + 1;
console.log(`compiled ${Object.keys(compiled).length} rules — structural-pruned ${pruned}, nimma-pruned ${nimmaPruned}, ${stillUsed.size} custom fns`);
console.log('categories:', Object.entries(cats).map(([c, n]) => `${c.split(':')[1]}(${n})`).join(', '));
