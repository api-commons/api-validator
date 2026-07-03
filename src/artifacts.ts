// The artifact types the validator supports. Each maps to a `format` tag used to
// select rules, a starter Spectral ruleset (rules/defaults/<id>.yaml), and a
// starter sample (samples/<id>.yaml). Scope: OpenAPI (3.x) and Swagger 2.0,
// AsyncAPI, Arazzo, and JSON Schema.
import { parse as parseYaml } from 'yaml';

export interface ArtifactType {
  id: string; // matches the default-ruleset + sample filename
  label: string;
  format: string; // format tag used by compiled + default rules
  searchNote?: string; // shown when a code search returns nothing
}

// Order as requested. OpenAPI and Swagger 2.0 share the `openapi` format (and its
// ruleset); Spectral auto-detects the document version and runs the matching rules.
export const ARTIFACTS: ArtifactType[] = [
  { id: 'openapi', label: 'OpenAPI', format: 'openapi' },
  { id: 'swagger', label: 'Swagger 2.0', format: 'openapi' },
  { id: 'asyncapi', label: 'AsyncAPI', format: 'asyncapi' },
  { id: 'arazzo', label: 'Arazzo', format: 'arazzo' },
  { id: 'json-schema', label: 'JSON Schema', format: 'jsonschema' },
];

export const artifactById = (id: string): ArtifactType =>
  ARTIFACTS.find((a) => a.id === id) ?? ARTIFACTS[0];

const defaultFiles = import.meta.glob('../rules/defaults/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const sampleFiles = import.meta.glob('../samples/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function byId(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [p, raw] of Object.entries(files)) out[p.split('/').pop()!.replace(/\.ya?ml$/, '')] = raw;
  return out;
}

// id -> default ruleset definition (data form: { extends?, rules? }).
export const DEFAULT_RULESETS: Record<string, any> = {};
for (const [id, raw] of Object.entries(byId(defaultFiles))) DEFAULT_RULESETS[id] = parseYaml(raw) || {};

// id -> starter sample text.
export const SAMPLES: Record<string, string> = byId(sampleFiles);
