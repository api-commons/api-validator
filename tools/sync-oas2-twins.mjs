import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
const y = parse(readFileSync('rules/all-rules.yaml','utf8')).openapi;
const j = JSON.parse(readFileSync('src/all-rules.json','utf8'));
const SPECIAL = { 'document-require-swagger': 'document-require-openapi' };
let added=0, missingOrig=[];
for (const [name, r] of Object.entries(y)) {
  const isTwin = Array.isArray(r.formats) && r.formats.length===1 && r.formats[0]==='oas2';
  if (!isTwin || j.openapi[name]) continue;
  const orig = SPECIAL[name] ?? (name.endsWith('-oas2') ? name.slice(0,-5) : null);
  const origJson = orig ? j.openapi[orig] : null;
  if (!origJson && orig) missingOrig.push(`${name} <- ${orig}`);
  const severity = origJson?.severity ?? r.severity ?? 'info';
  j.openapi[name] = { ...r, severity };
  added++;
}
writeFileSync('src/all-rules.json', JSON.stringify(j));
console.log(JSON.stringify({ added, json_openapi_now: Object.keys(j.openapi).length, missingOrig }, null, 2));
