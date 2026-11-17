# Contributing to Vigueur

This page is for developers. User documentation lives in [user-docs](user-docs/README.md), with its
own writing rules in [user-docs/CONTRIBUTING.md](user-docs/CONTRIBUTING.md).

## Prerequisites

- Node.js 22.12 or later for the test toolchain (vitest 5). The server itself runs on Node.js 20 or
  later.
- A PISTE application (free account on https://piste.gouv.fr) for the live tests and for running
  the server. The `vigueur_status` tool lists the setup steps.

## Commands

```sh
cp .env.example .env   # then fill in PISTE_CLIENT_ID, PISTE_CLIENT_SECRET and PISTE_ENV
npm install
npm test               # builds, then runs the offline test suite (no credentials, no network)
npm run typecheck
npm run lint
npm run test:live      # opt-in: calls PISTE with the credentials in .env
npm run dev            # builds and starts the server on stdio with .env
npm run inspect        # builds and opens the server in the MCP Inspector
```

Live tests spend real API quota. Run the one you need with `-t` before running the whole live
suite.

## Running your build in Claude Code

- **One session, uncommitted work:** `claude --plugin-dir /absolute/path/to/vigueur-mcp`.
- **Installed plugin:** install it from a separate, clean clone of the repository, never from your
  working folder. Claude Code copies the whole folder into `~/.claude/plugins/cache/vigueur/` at
  install, `.env` and other ignored files included, and leaves the copy behind on uninstall. To
  ship a change to that install: commit it, then in the clean clone run `git pull && npm run build`.
- **Plain MCP registration** (credentials read from `.env`, not copied into Claude Code's config):

  ```sh
  claude mcp add vigueur --scope user -- node --env-file=/absolute/path/to/.env /absolute/path/to/dist/index.js
  ```

After a new build, an open session keeps the old server until you run `/mcp`, select vigueur, then
Reconnect. `/reload-plugins` alone keeps the running server.

## Architecture

- `src/domain/`: pure logic (citations, versions, statuses on a date, changes).
- `src/services/`: use cases, written against ports (`services/*/ports.ts`).
- `src/clients/`: the PISTE, Légifrance and Judilibre clients that implement those ports.
- `src/tools/`: MCP tool definitions, their output schemas and the answer builders.
- `src/compose.ts` and `src/index.ts` wire clients into services and tools.

`test/architecture.test.ts` enforces the dependency rule: services never import clients or tools,
clients never import tools.

Every tool returns one JSON object, as `structuredContent` and as the same JSON in its text block;
its shape is declared in the tool's `outputSchema`. An answer is at most 40 000 characters, within a
45-second limit per call.

## Rules

- **Facts, not reasoning.** Tools return what the sources say, plus exact computations on it (dates
  compared, identical wording, same ECLI). No relevance judgements, no guesses, no MCP prompts:
  reasoning belongs to the model.
- **Never log or record HTTP response headers.** Some PISTE error answers echo the request's
  headers, the access token included.
- **Test fixtures** in `test/fixtures/` are verbatim production response bodies, never headers.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/).
