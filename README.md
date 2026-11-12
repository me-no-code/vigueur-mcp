# Vigueur

Local MCP server giving Claude reliable access to French law (Légifrance, Judilibre).

Status: work in progress — not yet published.

## Development

Prerequisites: Node.js ≥ 22.12 (required by the test toolchain, vitest 5) and a PISTE application
(free account on https://piste.gouv.fr; the `vigueur_status` tool lists the setup steps).

```sh
cp .env.example .env   # then fill in PISTE_CLIENT_ID, PISTE_CLIENT_SECRET and PISTE_ENV
npm install
npm test               # builds, then runs the offline test suite (no credentials, no network)
npm run test:live      # opt-in: calls PISTE with the credentials in .env
npm run dev            # builds and starts the server on stdio with .env
npm run inspect        # builds and opens the server in the MCP Inspector
```

Register the local build in Claude Code:

```sh
claude mcp add vigueur -e PISTE_CLIENT_ID=… -e PISTE_CLIENT_SECRET=… -e PISTE_ENV=sandbox -- node /absolute/path/to/dist/index.js
```

Licence: [PolyForm Shield 1.0.0](LICENSE): use Vigueur for any purpose, except to provide a
product that competes with it.
