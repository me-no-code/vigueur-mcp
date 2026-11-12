# Vigueur

Local MCP server giving Claude reliable access to French law (Légifrance, Judilibre).

Status: work in progress — not yet published.

## Install in Claude Code (plugin)

Vigueur ships as a Claude Code plugin: Claude Code starts the server, asks for your PISTE
credentials when you enable it (the client secret goes to your system's secure credential store),
and lets you turn it on and off from `/plugin`.

Until the repository is published, install it from a local clone (build it first with
`npm install && npm run build`):

```
/plugin marketplace add /absolute/path/to/vigueur-mcp
/plugin install vigueur@vigueur
```

The plugin loads in place from the clone, so `/reload-plugins` picks up a new build. To try it for
one session without installing: `claude --plugin-dir /absolute/path/to/vigueur-mcp`.

Once published: `/plugin install vigueur --marketplace <owner>/vigueur-mcp`.

No PISTE account yet? Enable the plugin with empty credentials and ask Claude to run
`vigueur_status`: it walks you through creating the free account and application.

## Tools

- `vigueur_status` — checks your PISTE credentials and which sources are reachable.
  Example: "Run vigueur_status: is my Légifrance access working?"
- `legifrance_get_article` — reads one article of a French code and says whether it is in force.
  Use `at_date` to ask what applied on a past date.
  Example: "What does art. L1234-1 of the Code du travail say, and was it in force on 2019-03-01?"
- `legifrance_get_article_history` — lists the versions of an article and the texts that amended it.
  Example: "Quelles lois ont modifié l'article 1240 du Code civil ?"
- `legifrance_search_legislation` — searches codes, laws (LODA), the Journal officiel (JORF) and collective agreements (KALI).
  Example: "Cherche « préavis » dans le Code du travail."
- `legifrance_list_changes` — lists what changed in a code between two dates.
  Example: "Qu'est-ce qui a changé dans le Code civil depuis le 1er janvier 2026 ?"

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

Without the plugin, a plain MCP registration also works (credentials read from `.env`, not copied
into Claude Code's config):

```sh
claude mcp add vigueur --scope user -- node --env-file=/absolute/path/to/.env /absolute/path/to/dist/index.js
```

Licence: [PolyForm Shield 1.0.0](LICENSE): use Vigueur for any purpose, except to provide a
product that competes with it.
