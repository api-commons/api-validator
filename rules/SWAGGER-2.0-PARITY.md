# Swagger 2.0 ↔ OpenAPI 3.x rule parity

The API Commons governance rules must apply to **Swagger / OpenAPI 2.0** with parity to **OpenAPI 3.x**. Spectral auto-detects a document's format (`swagger: "2.0"` → `oas2`; `openapi: 3.x` → `oas3`/`oas3_0`/`oas3_1`) and only runs a rule on a document whose format is in the rule's `formats` (or on every document when a rule declares no `formats`). This doc is the authoritative reference for porting.

## Porting strategy (in priority order)

1. **Broaden the `given` to a multi-path array** when the same `then` check is valid for both formats. One rule, no `formats`, fires on whichever path exists. Preferred — keeps rule count and names clean.
   - `given: [$.components.schemas.*, $.definitions.*]`
2. **Author a format-tagged twin** when the structure OR the check genuinely differs. Two rules with distinct keys and `formats: [oas2]` / `formats: [oas3]`. Suffix keys `-oas2` / `-oas3` (the compiler now keeps these tokens in names).
3. **Tag a rule `formats: [oas3]`** when the concept does not exist in 2.0 (see below), and conversely `formats: [oas2]` for 2.0-only concepts. Never silently leave a 3.x-only `given` un-tagged — it just no-ops on 2.0 and looks like a gap.

Only port the compiled rules — the `-info` positive-confirmation variants are dropped at compile, so leave them or mirror them, they won't ship.

## Structural mapping (3.x → 2.0)

| Concept | OpenAPI 3.x | Swagger 2.0 |
| --- | --- | --- |
| Version key | `$.openapi` (`3.x`) | `$.swagger` (`2.0`) |
| Servers / base URL | `$.servers[*].url` | `$.host` + `$.basePath` + `$.schemes[*]` |
| Reusable schemas | `$.components.schemas.*` | `$.definitions.*` |
| Security schemes | `$.components.securitySchemes.*` | `$.securityDefinitions.*` |
| Reusable parameters | `$.components.parameters.*` | `$.parameters.*` (top-level) |
| Reusable responses | `$.components.responses.*` | `$.responses.*` (top-level) |
| Reusable request bodies | `$.components.requestBodies.*` | *(none — body is a parameter)* |
| Reusable headers/examples/links/callbacks | `$.components.headers/examples/links/callbacks.*` | headers only (inline); links/callbacks/examples: **none** |
| Request body | `$.paths[*][*].requestBody` + `.content['mt'].schema` | `$.paths[*][*].parameters[?(@.in=='body')].schema` and `[?(@.in=='formData')]` |
| Request media types | `$.paths[*][*].requestBody.content` (keys) | operation/root `consumes[*]` |
| Response media types | `$.paths[*][*].responses[*].content` (keys) | operation/root `produces[*]` |
| Response body schema | `$.paths[*][*].responses[*].content['mt'].schema` | `$.paths[*][*].responses[*].schema` |
| Parameter data shape | param `.schema` (all params) | param `.schema` **only** for `in: body`; `in: query/path/header/formData` carry `type`/`items`/`format` **inline** on the parameter |
| Content negotiation | per-operation `content` maps | root/operation `consumes` + `produces` |

Format-common (usually a single format-agnostic rule — no `formats`, same `given`): `$.info.*`, `$.tags[*]`, `$.externalDocs`, `$.paths` (path keys), `$.paths[*]` (operations), `operationId`, `summary`, `description`, `tags`, `deprecated`, `$.security`, response **existence** and `description`, `$.paths[*][*].parameters[*].name/in/required`.

## Concept availability

- **3.x-only (tag `formats: [oas3]`):** `requestBody` object, `content`/media-type maps, `components.links`, `components.callbacks`, `components.requestBodies`, cookie parameters (`in: cookie`), multiple `servers`, `servers.variables`, `webhooks` (3.1), `oneOf`/`anyOf`/`not` at schema roots the 2.0 subset forbids, `nullable` via `type` arrays (3.1).
- **2.0-only (tag `formats: [oas2]`):** `$.host`, `$.basePath`, `$.schemes`, `formData` parameters, `in: body` parameter, `collectionFormat`, top-level `consumes`/`produces`, `$.definitions`, `$.securityDefinitions`.
- **Shape differs, needs twins:** security scheme objects (3.x `type: http|apiKey|oauth2|openIdConnect` + `scheme`/`flows`; 2.0 `type: basic|apiKey|oauth2` + `flow`/`authorizationUrl`), parameter typing (schema vs inline), server/host URL checks (e.g. "https only" → `servers[*].url` pattern vs `schemes` contains `https` and not `http`).

## Worked examples

**A — multi-path (schema must have a description):**
```yaml
schema-description:            # was components-schemas-description (oas3-only)
  given: [$.components.schemas.*, $.definitions.*]
  then: { field: description, function: truthy }
```

**B — twin (https-only server):**
```yaml
server-https-only-oas3:
  formats: [oas3]
  given: $.servers[*]
  then: { field: url, function: pattern, functionOptions: { match: "^https://" } }
server-https-only-oas2:
  formats: [oas2]
  given: $
  then: { field: schemes, function: schema, functionOptions: { schema: { type: array, not: { contains: { const: http } }, contains: { const: https } } } }
```

**C — 3.x-only concept (request body content typed):**
```yaml
request-body-content-schema:
  formats: [oas3]
  given: $.paths[*][*].requestBody.content.*
  then: { field: schema, function: truthy }
# 2.0 analog — body parameter has a schema:
request-body-parameter-schema-oas2:
  formats: [oas2]
  given: $.paths[*][*].parameters[?(@.in=='body')]
  then: { field: schema, function: truthy }
```

## Verification (run after every porting pass)

1. Recompile: `node tools/compile-rules.mjs` — it must report a non-zero rule count and NOT prune your new rules; check the console for structural/nimma prunes.
2. Confirm oas2 coverage exists: `grep -c 'oas2' rules/all-rules.yaml` must be > 0.
3. Lint a real Swagger 2.0 doc and a 3.x doc through the compiled ruleset; confirm the ported rules **fire on 2.0** where expected and **don't misfire** (e.g., a 3.x-only rule must not error on 2.0 — tag it). Use `samples/openapi-2.0.yaml` (added) and `samples/openapi.yaml`.
4. A rule that no-ops on both samples is either mis-pathed or needs a `formats` tag — fix it, don't ship it.
