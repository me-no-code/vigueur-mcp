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

*En français : [Outils](#outils).*

- `vigueur_status` — checks your PISTE credentials and which sources are reachable.
  Example: "Run vigueur_status: is my Légifrance access working?"
- `legifrance_get_article` — reads one article of a French code and says whether it is in force.
  Use `at_date` to ask what applied on a past date, and `include_neighbours` to also see the previous and next articles.
  Example: "What does art. L1234-1 of the Code du travail say, and was it in force on 2019-03-01?"
- `legifrance_get_article_history` — lists the versions of an article and the texts that amended it.
  Example: "Quelles lois ont modifié l'article 1240 du Code civil ?"
- `legifrance_search_legislation` — searches codes, laws (LODA), the Journal officiel (JORF) and collective agreements (KALI).
  Example: "Cherche « préavis » dans le Code du travail."
- `legifrance_list_changes` — lists what changed in a code between two dates; with `text`, the change log of a law or decree.
  Example: "Qu'est-ce qui a changé dans le Code civil depuis le 1er janvier 2026 ?" or "Quelles modifications de la loi Informatique et Libertés depuis 2018 ?"
- `legifrance_get_text` — reads a law, decree or other text (by nature and number, NOR or id): outline or articles, and whether it is in force.
  Example: "Que dit la loi Informatique et Libertés à son article 1er ?"
- `legifrance_browse_code` — shows the table of contents of a code, section by section.
  Example: "Montre-moi le sommaire du Code de la consommation."
- `legifrance_latest_jo` — shows the latest Journal officiel and what it published.
  Example: "Qu'a publié le Journal officiel aujourd'hui pour le ministère du travail ?"
- `legifrance_list_reference_values` — lists the valid values (codes, JORF natures, emitters) to use as filters.
  Example: "Quelles natures de textes existe-t-il au Journal officiel ?"

## Outils

*In English: [Tools](#tools).*

- `vigueur_status` — vérifie vos identifiants PISTE et les sources joignables.
  Exemple : « Lance vigueur_status : mon accès à Légifrance fonctionne-t-il ? »
- `legifrance_get_article` — lit un article d'un code français et indique s'il est en vigueur.
  `at_date` donne le texte applicable à une date passée, `include_neighbours` ajoute les articles précédent et suivant.
  Exemple : « Que dit l'article L1234-1 du Code du travail, et était-il en vigueur le 1er mars 2019 ? »
- `legifrance_get_article_history` — liste les versions d'un article et les textes qui l'ont modifié.
  Exemple : « Quelles lois ont modifié l'article 1240 du Code civil ? »
- `legifrance_search_legislation` — cherche dans les codes, les lois et décrets (LODA), le Journal officiel (JORF) et les conventions collectives (KALI).
  Exemple : « Cherche “préavis” dans le Code du travail. »
- `legifrance_list_changes` — liste ce qui a changé dans un code entre deux dates ; avec `text`, l'historique des modifications d'une loi ou d'un décret.
  Exemple : « Qu'est-ce qui a changé dans le Code civil depuis le 1er janvier 2026 ? » ou « Quelles modifications de la loi Informatique et Libertés depuis 2018 ? »
- `legifrance_get_text` — lit une loi, un décret ou un autre texte (par nature et numéro, NOR ou identifiant) : son plan ou ses articles, et s'il est en vigueur.
  Exemple : « Que dit la loi Informatique et Libertés à son article 1er ? »
- `legifrance_browse_code` — affiche la table des matières d'un code, section par section.
  Exemple : « Montre-moi le sommaire du Code de la consommation. »
- `legifrance_latest_jo` — affiche le dernier Journal officiel et ce qu'il a publié.
  Exemple : « Qu'a publié le Journal officiel aujourd'hui pour le ministère du travail ? »
- `legifrance_list_reference_values` — liste les valeurs acceptées comme filtres (codes, natures et émetteurs du JORF).
  Exemple : « Quelles natures de textes existe-t-il au Journal officiel ? »

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
