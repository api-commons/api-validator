# API Commons rule tag taxonomy

The canonical, namespaced tag vocabulary for API Commons governance rules. Every rule in the catalog (`rules/all-rules.yaml`) carries tags from these namespaces, and the API Validator uses them to filter and group rules. This is the reference other tools, rulesets, and the book's *Categorizing and tagging rules* chapter align to.

A tag is `namespace:value`. Five namespaces, each answering a different question:

## `format:` — which artifact type

The machine-readable artifact the rule governs. Exactly one per rule. **12 values:**

`openapi` · `asyncapi` · `arazzo` · `jsonschema` · `apis-json` · `mcp` · `plans` · `rate-limits` · `finops` · `json-structure` · `json-ld` · `agent-skill`

(The `openapi` format covers both OpenAPI 3.x **and Swagger 2.0** — 2.0 rules are `formats: [oas2]` twins of their 3.x siblings.)

## `experience:` — which consumer-experience dimension it improves

The reason the rule exists, expressed as the API-consumer quality it protects. This is the most useful axis for "what does turning this on actually buy me." **14 values:**

`consistency` · `documentation` · `reliability` · `data-modeling` · `governance` · `discoverability` · `usability` · `naming` · `security` · `error-handling` · `performance` · `versioning` · `pagination` · `observability`

## `spec:` — where in the artifact it fires

The structural location the rule's `given` targets — so you can see coverage across an artifact at a glance. **30 values**, e.g.:

`document` · `info` · `paths` · `operations` · `parameters` · `request-body` · `responses` · `schemas` · `properties` · `components` · `media-types` · `headers` · `servers` · `security` · `tags` · `examples` · `channels` · `messages` (AsyncAPI) · `workflows` · `steps` · `source-descriptions` (Arazzo) · `plans` · `limits` · `costs` · `capabilities` · `maintainers` · `frontmatter` (Agent Skills) · …

## `topic:` — which cross-cutting feature or pattern

A capability that cuts across formats and locations. **9 values:**

`pagination` · `content-negotiation` · `rate-limiting` · `caching` · `tracing` · `deprecation` · `conditional-requests` · `cors` · `idempotency`

## `owasp:` — which OWASP API Security Top 10 (2023) item

Present on security rules that map to a specific Top-10 category. **`api1`–`api10`** (e.g. `owasp:api1` BOLA, `owasp:api2` Broken Authentication, …). See [`@api-common/spectral-owasp-ruleset`](https://github.com/api-commons/spectral-owasp-ruleset) for the grounded security ruleset.

---

### How the namespaces compose

The four query axes are orthogonal and combine, which is where the "new math" of tags comes from — you select a governable subset by intersecting them:

- `format:openapi` + `experience:security` + `owasp:api2` → the OpenAPI authentication rules.
- `format:openapi` + `spec:responses` + `experience:error-handling` → how you're governing error responses.
- `experience:documentation` across all formats → your whole documentation posture.

Rules also carry a `source:` provenance value (internal — where the rule came from) and a per-rule `severity`, `title`, `reference`, and an AI-remediation `prompt`; those are rule *properties*, not filter namespaces.

### Adding a value

New `format:`/`experience:`/`spec:`/`topic:`/`owasp:` values are added here first (this file is the registry), then used in `all-rules.yaml`. Keep values lowercase-kebab. The rule **id** follows a separate convention (Spec / Version / Property / Semantics / Severity) — see the book's naming-convention chapter and [`spectral-ruleset-studio`](https://studio.apicommons.org).
