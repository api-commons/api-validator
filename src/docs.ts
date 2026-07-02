// Human-readable documentation generator for the four supported artifact types.
// Parses the current document and renders it as HTML (for the Docs tab preview and
// a standalone download) and Markdown (for download). No external deps.
import { parse as parseYaml } from 'yaml';

const isObj = (x: any): x is Record<string, any> => x != null && typeof x === 'object' && !Array.isArray(x);
const esc = (s: any): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
// Render a description block: escape, keep paragraph breaks.
const desc = (s: any): string => {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return `<div class="doc-desc">${t.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
};
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
const anchor = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ---- schema type labelling + property tables --------------------------------
function refName(ref: string): string { return String(ref).split('/').pop() || 'ref'; }
function typeLabel(s: any): string {
  if (!isObj(s)) return '';
  if (s.$ref) return refName(s.$ref);
  if (Array.isArray(s.type)) return s.type.join(' | ');
  if (s.enum) return `enum(${s.enum.map((e: any) => JSON.stringify(e)).join(', ')})`;
  const t = s.type;
  if (t === 'array') { const it = s.items ? typeLabel(s.items) : 'any'; return `array<${it}>`; }
  if (s.oneOf || s.anyOf || s.allOf) return (s.oneOf ? 'oneOf' : s.anyOf ? 'anyOf' : 'allOf');
  return t || (s.properties ? 'object' : '');
}
function constraints(s: any): string {
  if (!isObj(s)) return '';
  const c: string[] = [];
  for (const k of ['format', 'pattern', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'default'])
    if (s[k] !== undefined) c.push(`${k}: ${typeof s[k] === 'object' ? JSON.stringify(s[k]) : s[k]}`);
  return c.length ? `<div class="doc-constraints">${esc(c.join(' · '))}</div>` : '';
}
// Recursive property table for an object schema.
function schemaTable(schema: any, depth = 0): string {
  if (!isObj(schema)) return '';
  if (schema.$ref) return `<p class="doc-ref">→ <code>${esc(refName(schema.$ref))}</code></p>`;
  const props = schema.properties;
  if (!isObj(props)) {
    // Non-object schema: describe it inline.
    const t = typeLabel(schema);
    return `<p class="doc-inline-type">${t ? `<code>${esc(t)}</code>` : ''}${desc(schema.description)}</p>${constraints(schema)}`;
  }
  const required: string[] = Array.isArray(schema.required) ? schema.required : [];
  const rows = Object.entries<any>(props).map(([name, p]) => {
    const nested = depth < 3 && isObj(p) && !p.$ref && (isObj(p.properties) || (p.type === 'array' && isObj(p.items?.properties)))
      ? `<div class="doc-nested">${schemaTable(p.type === 'array' ? p.items : p, depth + 1)}</div>`
      : '';
    return `<tr>
      <td class="doc-pname"><code>${esc(name)}</code>${required.includes(name) ? '<span class="doc-req" title="required">*</span>' : ''}</td>
      <td class="doc-ptype"><code>${esc(typeLabel(p))}</code></td>
      <td class="doc-pdesc">${isObj(p) ? (desc(p.description) || '') : ''}${constraints(p)}${nested}</td>
    </tr>`;
  }).join('');
  return `<table class="doc-table"><thead><tr><th>Property</th><th>Type</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function pageHeader(title: string, version: any, description: any, kind: string): string {
  return `<header class="doc-header">
    <div class="doc-kind">${esc(kind)}</div>
    <h1>${esc(title || 'Untitled')}${version ? ` <span class="doc-version">v${esc(version)}</span>` : ''}</h1>
    ${desc(description)}
  </header>`;
}
function section(title: string, body: string, id?: string): string {
  if (!body) return '';
  return `<section class="doc-section"${id ? ` id="${esc(id)}"` : ''}><h2>${esc(title)}</h2>${body}</section>`;
}

// ---- OpenAPI ----------------------------------------------------------------
function renderOpenAPI(d: any): string {
  const parts: string[] = [pageHeader(d.info?.title, d.info?.version, d.info?.description, 'OpenAPI ' + (d.openapi || d.swagger || ''))];
  if (Array.isArray(d.servers) && d.servers.length)
    parts.push(section('Servers', `<ul class="doc-list">${d.servers.map((s: any) => `<li><code>${esc(s.url)}</code>${s.description ? ` — ${esc(s.description)}` : ''}</li>`).join('')}</ul>`));

  const paths = isObj(d.paths) ? d.paths : {};
  const ops: Array<{ path: string; method: string; op: any }> = [];
  for (const [p, item] of Object.entries<any>(paths))
    for (const [m, op] of Object.entries<any>(item || {})) if (METHODS.includes(m) && isObj(op)) ops.push({ path: p, method: m, op });

  const opCard = ({ path, method, op }: { path: string; method: string; op: any }) => {
    const params = [...(paths[path].parameters || []), ...(op.parameters || [])];
    const paramRows = params.length ? `<h4>Parameters</h4><table class="doc-table"><thead><tr><th>Name</th><th>In</th><th>Type</th><th>Req</th><th>Description</th></tr></thead><tbody>${
      params.map((pa: any) => `<tr><td><code>${esc(pa.name)}</code></td><td>${esc(pa.in)}</td><td><code>${esc(typeLabel(pa.schema || pa))}</code></td><td>${pa.required ? 'yes' : ''}</td><td>${esc(pa.description || '')}</td></tr>`).join('')
    }</tbody></table>` : '';
    const body = op.requestBody?.content ? `<h4>Request body</h4>${Object.entries<any>(op.requestBody.content).map(([ct, mt]) => `<div class="doc-media"><code>${esc(ct)}</code>${schemaTable(mt.schema || {})}</div>`).join('')}` : '';
    const responses = isObj(op.responses) ? `<h4>Responses</h4><table class="doc-table"><thead><tr><th>Status</th><th>Description</th><th>Content</th></tr></thead><tbody>${
      Object.entries<any>(op.responses).map(([code, r]) => `<tr><td><code>${esc(code)}</code></td><td>${esc(r?.description || '')}</td><td>${r?.content ? Object.keys(r.content).map((c) => `<code>${esc(c)}</code>`).join(' ') : ''}</td></tr>`).join('')
    }</tbody></table>` : '';
    return `<div class="doc-op" id="op-${esc(anchor(method + '-' + path))}">
      <div class="doc-op-head"><span class="doc-method doc-m-${esc(method)}">${esc(method.toUpperCase())}</span><code class="doc-path">${esc(path)}</code></div>
      ${op.summary ? `<div class="doc-summary">${esc(op.summary)}</div>` : ''}
      ${op.operationId ? `<div class="doc-opid">operationId: <code>${esc(op.operationId)}</code></div>` : ''}
      ${desc(op.description)}${paramRows}${body}${responses}
    </div>`;
  };

  // Group operations by first tag (fallback: "default").
  const groups = new Map<string, typeof ops>();
  for (const o of ops) { const tag = o.op.tags?.[0] || 'default'; (groups.get(tag) ?? groups.set(tag, []).get(tag)!).push(o); }
  const opsHtml = [...groups.entries()].map(([tag, list]) =>
    `<div class="doc-tag-group"><h3 class="doc-tag">${esc(tag)}</h3>${list.map(opCard).join('')}</div>`).join('');
  parts.push(section(`Operations (${ops.length})`, opsHtml, 'operations'));

  const schemas = d.components?.schemas;
  if (isObj(schemas))
    parts.push(section(`Schemas (${Object.keys(schemas).length})`, Object.entries<any>(schemas).map(([n, s]) =>
      `<div class="doc-schema" id="schema-${esc(anchor(n))}"><h3><code>${esc(n)}</code></h3>${desc(s.description)}${schemaTable(s)}</div>`).join(''), 'schemas'));
  return parts.join('');
}

// ---- AsyncAPI ---------------------------------------------------------------
function renderAsyncAPI(d: any): string {
  const parts: string[] = [pageHeader(d.info?.title, d.info?.version, d.info?.description, 'AsyncAPI ' + (d.asyncapi || ''))];
  if (isObj(d.servers))
    parts.push(section('Servers', `<ul class="doc-list">${Object.entries<any>(d.servers).map(([n, s]) => `<li><strong>${esc(n)}</strong> — <code>${esc(s.url || s.host || '')}</code>${s.protocol ? ` (${esc(s.protocol)})` : ''}${s.description ? ` — ${esc(s.description)}` : ''}</li>`).join('')}</ul>`));

  const channels = isObj(d.channels) ? d.channels : {};
  const chHtml = Object.entries<any>(channels).map(([name, ch]) => {
    // AsyncAPI 2.x: subscribe/publish operations with a message. 3.x: messages map.
    const opBlocks = ['subscribe', 'publish'].filter((k) => isObj(ch?.[k])).map((k) => {
      const op = ch[k];
      const payload = op.message?.payload || op.message?.oneOf;
      return `<div class="doc-op"><div class="doc-op-head"><span class="doc-method doc-m-${k === 'publish' ? 'post' : 'get'}">${k.toUpperCase()}</span></div>${desc(op.summary || op.description)}${payload ? `<h4>Message payload</h4>${schemaTable(payload)}` : ''}</div>`;
    }).join('');
    const messages = isObj(ch?.messages) ? `<h4>Messages</h4>${Object.entries<any>(ch.messages).map(([mn, m]) => `<div class="doc-media"><strong>${esc(mn)}</strong>${desc(m.summary || m.description)}${m.payload ? schemaTable(m.payload) : ''}</div>`).join('')}` : '';
    return `<div class="doc-channel"><h3><code>${esc(ch.address || name)}</code></h3>${desc(ch.description)}${opBlocks}${messages}</div>`;
  }).join('');
  parts.push(section(`Channels (${Object.keys(channels).length})`, chHtml, 'channels'));

  const schemas = d.components?.schemas;
  if (isObj(schemas))
    parts.push(section(`Schemas (${Object.keys(schemas).length})`, Object.entries<any>(schemas).map(([n, s]) =>
      `<div class="doc-schema"><h3><code>${esc(n)}</code></h3>${desc(s.description)}${schemaTable(s)}</div>`).join('')));
  return parts.join('');
}

// ---- JSON Schema ------------------------------------------------------------
function renderJsonSchema(d: any): string {
  const parts: string[] = [pageHeader(d.title, undefined, d.description, 'JSON Schema')];
  const meta: string[] = [];
  if (d.$schema) meta.push(`<li>$schema: <code>${esc(d.$schema)}</code></li>`);
  if (d.$id) meta.push(`<li>$id: <code>${esc(d.$id)}</code></li>`);
  if (d.type) meta.push(`<li>type: <code>${esc(Array.isArray(d.type) ? d.type.join(' | ') : d.type)}</code></li>`);
  if (meta.length) parts.push(section('Schema', `<ul class="doc-list">${meta.join('')}</ul>`));
  if (isObj(d.properties)) parts.push(section('Properties', schemaTable(d)));
  const defs = d.$defs || d.definitions;
  if (isObj(defs))
    parts.push(section(`Definitions (${Object.keys(defs).length})`, Object.entries<any>(defs).map(([n, s]) =>
      `<div class="doc-schema"><h3><code>${esc(n)}</code></h3>${desc(s.description)}${schemaTable(s)}</div>`).join('')));
  return parts.join('');
}

// ---- Arazzo -----------------------------------------------------------------
function renderArazzo(d: any): string {
  const parts: string[] = [pageHeader(d.info?.title, d.info?.version, d.info?.summary || d.info?.description, 'Arazzo ' + (d.arazzo || ''))];
  if (Array.isArray(d.sourceDescriptions) && d.sourceDescriptions.length)
    parts.push(section('Source descriptions', `<ul class="doc-list">${d.sourceDescriptions.map((s: any) => `<li><strong>${esc(s.name)}</strong> (${esc(s.type || 'openapi')}) — <code>${esc(s.url)}</code></li>`).join('')}</ul>`));

  const workflows = Array.isArray(d.workflows) ? d.workflows : [];
  const wfHtml = workflows.map((w: any) => {
    const inputs = isObj(w.inputs) ? `<h4>Inputs</h4>${schemaTable(w.inputs)}` : '';
    const steps = Array.isArray(w.steps) ? `<h4>Steps (${w.steps.length})</h4><ol class="doc-steps">${w.steps.map((st: any) => `<li>
        <div class="doc-step-id"><code>${esc(st.stepId || '')}</code>${st.operationId ? ` → <code>${esc(st.operationId)}</code>` : st.operationPath ? ` → <code>${esc(st.operationPath)}</code>` : st.workflowId ? ` → workflow <code>${esc(st.workflowId)}</code>` : ''}</div>
        ${desc(st.description)}
        ${Array.isArray(st.parameters) && st.parameters.length ? `<div class="doc-step-params">params: ${st.parameters.map((p: any) => `<code>${esc(p.name)}</code>`).join(', ')}</div>` : ''}
        ${Array.isArray(st.successCriteria) && st.successCriteria.length ? `<div class="doc-step-crit">success: ${st.successCriteria.map((c: any) => `<code>${esc(c.condition || c)}</code>`).join(', ')}</div>` : ''}
      </li>`).join('')}</ol>` : '';
    return `<div class="doc-workflow"><h3><code>${esc(w.workflowId || 'workflow')}</code></h3>${w.summary ? `<div class="doc-summary">${esc(w.summary)}</div>` : ''}${desc(w.description)}${inputs}${steps}</div>`;
  }).join('');
  parts.push(section(`Workflows (${workflows.length})`, wfHtml, 'workflows'));
  return parts.join('');
}

const RENDERERS: Record<string, (d: any) => string> = {
  openapi: renderOpenAPI, asyncapi: renderAsyncAPI, jsonschema: renderJsonSchema, arazzo: renderArazzo,
};

export interface DocsResult { html: string; error?: string; }

// Render the document text as documentation HTML for the given artifact format.
export function renderDocs(format: string, text: string): DocsResult {
  let d: any;
  try { d = parseYaml(text); } catch (e) { return { html: '', error: `Could not parse the document: ${e instanceof Error ? e.message : String(e)}` }; }
  if (!isObj(d)) return { html: '', error: 'The document is empty or not an object.' };
  const fn = RENDERERS[format];
  if (!fn) return { html: '', error: `No documentation renderer for “${format}”.` };
  try { return { html: fn(d) }; } catch (e) { return { html: '', error: `Could not render documentation: ${e instanceof Error ? e.message : String(e)}` }; }
}

// The stylesheet used both in the app (scoped by .doc-view) and the standalone
// download. Kept here so the download is fully self-contained.
export const DOCS_CSS = `
.doc-view { color: #1e1e1e; line-height: 1.55; }
.doc-view a { color: #0d6efd; }
.doc-header { border-bottom: 2px solid #eee; padding-bottom: 0.75rem; margin-bottom: 1rem; }
.doc-kind { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px; color: #888; font-weight: 700; }
.doc-header h1 { margin: 0.2rem 0; font-size: 1.7rem; }
.doc-version { font-size: 0.9rem; color: #666; font-weight: 500; }
.doc-desc { color: #333; }
.doc-desc p { margin: 0.4rem 0; }
.doc-section { margin: 1.5rem 0; }
.doc-section > h2 { font-size: 1.25rem; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }
.doc-list { margin: 0.4rem 0; padding-left: 1.2rem; }
.doc-tag { font-size: 1.05rem; color: #0d6efd; margin: 1rem 0 0.4rem; }
.doc-op { border: 1px solid #e3e7ee; border-radius: 8px; padding: 0.75rem 0.9rem; margin: 0.6rem 0; background: #fafbfc; }
.doc-op-head { display: flex; align-items: center; gap: 0.6rem; }
.doc-method { color: #fff; font-weight: 700; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; letter-spacing: 0.5px; }
.doc-m-get { background: #0d6efd; } .doc-m-post { background: #198754; } .doc-m-put { background: #fd7e14; }
.doc-m-patch { background: #6f42c1; } .doc-m-delete { background: #dc3545; } .doc-m-head, .doc-m-options, .doc-m-trace { background: #6c757d; }
.doc-path { font-size: 0.95rem; }
.doc-summary { font-weight: 600; margin: 0.4rem 0 0.2rem; }
.doc-opid { font-size: 0.8rem; color: #777; }
.doc-op h4 { margin: 0.7rem 0 0.3rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; color: #666; }
.doc-table { width: 100%; border-collapse: collapse; margin: 0.3rem 0; font-size: 0.9rem; }
.doc-table th, .doc-table td { border: 1px solid #e3e7ee; padding: 5px 8px; text-align: left; vertical-align: top; }
.doc-table th { background: #f1f3f6; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.4px; color: #555; }
.doc-req { color: #dc3545; font-weight: 700; }
.doc-constraints { font-size: 0.8rem; color: #888; margin-top: 2px; }
.doc-nested { margin-top: 0.4rem; padding-left: 0.6rem; border-left: 2px solid #e3e7ee; }
.doc-schema, .doc-channel, .doc-workflow { margin: 1rem 0; }
.doc-schema h3, .doc-channel h3, .doc-workflow h3 { font-size: 1rem; }
.doc-steps { padding-left: 1.2rem; }
.doc-steps li { margin: 0.5rem 0; }
.doc-step-params, .doc-step-crit { font-size: 0.82rem; color: #666; margin-top: 2px; }
.doc-ref { color: #666; }
.doc-view code { background: #eef1f5; padding: 1px 5px; border-radius: 3px; font-size: 0.88em; }
`;

// A fully self-contained HTML document for download.
export function standaloneDocs(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Documentation</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;background:#fff;}${DOCS_CSS}</style>
</head><body><div class="doc-view">${inner}</div></body></html>`;
}
