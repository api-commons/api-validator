import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Spectral, Document, Ruleset } = require('@stoplight/spectral-core');
const Parsers = require('@stoplight/spectral-parsers');
const { oas } = require('@stoplight/spectral-rulesets');
const fmts = require('@stoplight/spectral-formats');
import { functions as compiledFunctions } from '../src/compiled-ruleset';
import all from '../src/all-rules.json';
const FN_MAP: any = { ...compiledFunctions };
const FMT_ALIAS: any = { 'oas3.0': 'oas3_0', 'oas3.1': 'oas3_1' };
const lookF = (n: string) => fmts[FMT_ALIAS[n] ?? n] ?? fmts[n];
const toJs = (node: any): any => Array.isArray(node) ? node.map(toJs) : (node && typeof node === 'object') ? Object.fromEntries(Object.entries(node).map(([k, v]) => k === 'function' && typeof v === 'string' ? [k, FN_MAP[v] ?? v] : k === 'formats' && Array.isArray(v) ? [k, v.map((f: any) => typeof f === 'string' ? lookF(f) : f).filter(Boolean)] : [k, toJs(v)])) : node;
const engineRule = (r: any) => { const { source, title, reference, prompt, _format, ...rest } = r; return rest; };
const rules: any = {};
for (const [n, r] of Object.entries<any>((all as any).openapi)) { if (r.source === 'builtin') continue; rules[n] = toJs(engineRule(r)); }
const def = { rules, extends: [oas] };
const CLEAN = `swagger: "2.0"
info: {title: Things API, version: "1.0.0", description: A clean 2.0 API, contact: {name: n, url: "https://e.co"}}
host: api.example.org
basePath: /v1
schemes: [https]
consumes: [application/json]
produces: [application/json]
tags: [{name: things, description: things ops}]
paths:
  /things:
    get: {operationId: getThings, summary: List, description: List things, tags: [things], responses: {"200": {description: ok, schema: {$ref: "#/definitions/Thing"}}}}
securityDefinitions: {key: {type: apiKey, name: Authorization, in: header}}
security: [{key: []}]
definitions: {Thing: {type: object, description: a thing, properties: {id: {type: integer}}}}`;
const BAD = `swagger: "2.0"
info: {title: t, version: "1"}
host: example.com
schemes: [http]
paths:
  /things:
    get: {responses: {"200": {description: ok}}}
securityDefinitions: {basicAuth: {type: basic}, keyQuery: {type: apiKey, name: api_key, in: query}}`;
const sp = new Spectral();
sp.setRuleset(new Ruleset(def, { source: 'v' }));
for (const [label, doc] of [['CLEAN 2.0', CLEAN], ['BAD 2.0', BAD]] as const) {
  const d = await sp.run(new Document(doc, Parsers.Yaml, 'x.yaml'));
  const sev = [0,0,0,0]; for (const x of d) sev[x.severity]++;
  const oas2fired = [...new Set(d.map((x:any)=>x.code).filter((c:string)=>String(c).includes('oas2')))];
  console.log(`\n${label}: ${d.length} findings  [err ${sev[0]}, warn ${sev[1]}, info ${sev[2]}, hint ${sev[3]}]`);
  console.log(`  oas2 twins fired: ${oas2fired.length}` + (oas2fired.length? ' -> '+oas2fired.slice(0,10).join(', ') : ''));
}
