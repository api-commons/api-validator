# API Validator

A browser-first API governance tool — lint **OpenAPI (3.x _and_ Swagger 2.0),
AsyncAPI, Arazzo, and JSON Schema** in the browser with
[Spectral](https://github.com/stoplightio/spectral) rules. No backend and no
accounts; your tokens and documents never leave the page. Live at
**[validator.apicommons.org](https://validator.apicommons.org)**.

**Swagger 2.0 at full parity with OpenAPI 3.x.** The curated OpenAPI catalog
governs Swagger / OpenAPI **2.0** documents exactly as it governs 3.x — Spectral
auto-detects each document's format and applies the matching rules, so nothing
false-positives across versions.

Part of the [API Commons](https://apicommons.org/tools/) tools, alongside
[API Discovery](https://github.com/api-commons/api-discovery),
[API Documentation](https://github.com/api-commons/api-documentation),
[API Reusability](https://github.com/api-commons/api-reusability), and
[MCP Install](https://github.com/api-commons/mcp-install).

## Features

- **Four artifact types, on purpose** — OpenAPI (both **3.x** and **Swagger
  2.0**), AsyncAPI, Arazzo, and JSON Schema. A deliberately narrow, simple
  validator.
- **Swagger 2.0 parity** — the OpenAPI catalog lints `swagger: "2.0"` documents
  at full parity with `openapi: 3.x`. Rules are either broadened to match both
  structures (`$.components.schemas.*` **and** `$.definitions.*`) or shipped as
  format-gated `oas2`/`oas3` twins, so a rule only fires on the versions it
  applies to and never false-positives across formats. The design is documented
  in [`rules/SWAGGER-2.0-PARITY.md`](./rules/SWAGGER-2.0-PARITY.md).
- **Powered by Spectral** — runs the published `@stoplight/spectral-*` engine
  entirely in the browser. OpenAPI and AsyncAPI extend Spectral's built-in
  `spectral:oas` / `spectral:asyncapi` rulesets; Arazzo and JSON Schema are
  linted by the curated inline rules. Every rule ships at **`info`** — the goal
  is to educate, not block; raise individual rules to `warn`/`error` for the
  conventions you choose to enforce.
- **Search GitHub / GitLab / Bitbucket** — pick an artifact type, search code
  across your Git host with your own token, and load any result straight into the
  editor. GitHub is on by default; GitLab and Bitbucket are opt-in.
- **Upload from disk** or edit in a Monaco editor with a **YAML ⇄ JSON** toggle;
  artifact type and format are auto-detected on upload.
- **Best-of-breed rules** compiled from the first-party
  [API Evangelist](https://github.com/api-evangelist/rules) OpenAPI governance
  ruleset plus public, redistribution-compatible Spectral rulesets (SPS Commerce,
  Adidas, Trimble, Paystack, DigitalOcean, Microcks, Baloise, Team Digitale,
  Schwarz IT — all Apache-2.0 or MIT). Attribution and vendored licenses are in
  [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) and
  [`rules/sources/`](./rules/sources). The AGPL-3.0 Italian Government ruleset is
  intentionally excluded.
- **Retune any rule safely** — the rule editor is a focused form: **severity,
  message, and description** (inline rules), or severity-only for built-ins.
  Overrides and disables persist in your browser; no raw-YAML foot-guns.
- **Filter rules by tag** (`experience:*`, `spec:*`, …).
- **Generate documentation** — the **Docs** tab renders readable docs for the
  current artifact (internal `$ref`s resolved inline, descriptions rendered as
  Markdown) with **Download HTML**, **Download Markdown**, and **Print** (PDF).
- **Per-artifact utilities** — bundle `$ref`s, componentize, split by
  tag/channel/workflow, migrate JSON Schema drafts, and more. Assemble everything
  you've saved into a single **APIs.json 0.21** index and download it.
- **Save, commit, and PR to Git** — documents autosave to local storage; commit
  or open a PR to any repo you add, using your GitHub token.
- **Run locally / offline** — the **Run Locally** button downloads the whole app
  as a single self-contained `index.html` (all JS, CSS, and workers inlined) that
  runs from a double-click, no server required.

## Develop

```bash
npm install
npm run dev        # local dev server
npm run build      # production build → dist/ + single-file build → dist-local/ + zip
npm run check      # construct + run the ruleset for all 4 formats against Spectral
```

`npm run build` produces two targets: the multi-chunk site (`dist/`) that deploys
to `validator.apicommons.org`, and a single-file offline build (`dist-local/`,
via `SINGLEFILE=1 vite build`) that is zipped into `dist/api-validator.zip` for
the "Run Locally" download.

The curated rule catalog's source of truth is
[`rules/all-rules.yaml`](./rules/all-rules.yaml), compiled to the runtime
[`src/all-rules.json`](./src/all-rules.json) (grouped by artifact type — the
**`openapi` group is 462 rules**, and covers both Swagger 2.0 and OpenAPI 3.x
via the twins/format-gating described in
[`rules/SWAGGER-2.0-PARITY.md`](./rules/SWAGGER-2.0-PARITY.md)). The custom lint
functions live in [`src/compiled-ruleset.ts`](./src/compiled-ruleset.ts)
(generated by [`tools/compile-rules.mjs`](./tools/compile-rules.mjs); all are
committed, so the deploy doesn't regenerate them). The documentation generator is
[`src/docs.ts`](./src/docs.ts). Deployed to GitHub Pages via
[`.github/workflows/pages.yml`](./.github/workflows/pages.yml) (Pages source must
be set to **GitHub Actions**).

## Privacy

Everything runs client-side. Search and Git tokens, API keys, saved artifacts, and
rule overrides are stored only in your browser's local storage and are sent
directly from your browser to GitHub/GitLab/Bitbucket when you use those features —
never to any API Validator server (there isn't one). **Reset** clears it all.

## The tags, and the why

The rule catalog's tag vocabulary — `format:` / `experience:` / `spec:` / `topic:` /
`owasp:` — is the canonical reference in [`rules/TAG-TAXONOMY.md`](./rules/TAG-TAXONOMY.md);
filter and group rules by any of them. Each rule is a machine-executable check; for the
human *why* behind them, see the [governance guidance](https://guidance.apievangelist.com/store/rules/)
at guidance.apievangelist.com.

---

A project of [API Evangelist](https://apievangelist.com), maintained openly under
[API Commons](https://apicommons.org). Free to fork; API Evangelist offers expert
governance services when you want help.
