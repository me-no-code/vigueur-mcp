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

The plugin loads in place from the clone. After a new build, restart the server in each open
session: `/mcp`, select vigueur, then Reconnect (`/reload-plugins` alone keeps the server already
running). A new session also starts the new build. To try it for one session without installing:
`claude --plugin-dir /absolute/path/to/vigueur-mcp`.

Once published: `/plugin install vigueur --marketplace <owner>/vigueur-mcp`.

No PISTE account yet? Enable the plugin with empty credentials and ask Claude to run
`vigueur_status`: it walks you through creating the free account and application.

## Tools

_En français : [Outils](#outils)._

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
- `judilibre_search_decisions` — searches Cour de cassation and lower-court decisions in Judilibre, with filters (chamber, formation, publication, solution, dates, court location) and a sort by newest, oldest or relevance.
  Example: "Find the recent social-chamber decisions on forfait jours."
- `judilibre_get_decision` — reads one Judilibre decision: identity, summary, attacked decision, linked texts and the full text, or one zone (introduction, exposé, moyens, motivations, dispositif, annexes).
  Example: "Read the motivations of decision 6af2c6c06c2e1778126fe2c7."
- `judilibre_list_taxonomy` — lists the values Judilibre accepts as filters (chambers, formations, publications, solutions, jurisdictions, locations).
  Example: "List the chambers of the Cour de cassation."
- `legifrance_search_case_law` — searches the Légifrance case-law collections: judicial (Cour de cassation and appeal courts), administrative (Conseil d'État and administrative courts), Conseil constitutionnel, financial courts and CNIL. Searches by number or ECLI as well as by words.
  Example: "Find Conseil constitutionnel decision 2026-1217/1218."
- `legifrance_get_decision` — reads one Légifrance decision by its id (JURITEXT…, CETATEXT…, CONSTEXT…, …), with the text paged.
  Example: "Read decision JURITEXT000053197030."

### Case law: which source?

Facts about the two sources, side by side:

- Judilibre (`judilibre_*`) covers the Cour de cassation, the courts of appeal, the tribunaux judiciaires, the commercial courts and the labour courts, including the Cour de cassation's unreasoned rejections. Its search matches all the words of the query by default (`match` can be set to an exact phrase or to any word).
- Légifrance (`legifrance_*_case_law`, `legifrance_get_decision`) covers the Cour de cassation and the courts of appeal (the latter only until early 2023), the administrative courts (including the Conseil d'État), the Conseil constitutionnel, the financial courts and the CNIL.
- Légifrance does not hold every Cour de cassation decision: in particular not its unreasoned rejections and non-admissions. It receives the Cour de cassation decisions it holds weeks after Judilibre, and holds no appeal-court decisions after early 2023. A decision missing from Légifrance therefore does not mean it does not exist.

The Judilibre tools need the JUDILIBRE API subscribed on your PISTE application (the `vigueur_status` setup steps include it).

## Outils

_In English: [Tools](#tools)._

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
- `judilibre_search_decisions` — cherche des décisions de la Cour de cassation et des juridictions du fond dans Judilibre, avec des filtres (chambre, formation, publication, solution, dates, siège) et un tri par plus récent, plus ancien ou pertinence.
  Exemple : « Trouve les arrêts récents de la chambre sociale sur le forfait jours. »
- `judilibre_get_decision` — lit une décision de Judilibre : identité, sommaire, décision attaquée, textes liés et texte intégral, ou une seule zone (introduction, exposé, moyens, motivations, dispositif, annexes).
  Exemple : « Lis les motivations de la décision 6af2c6c06c2e1778126fe2c7. »
- `judilibre_list_taxonomy` — liste les valeurs acceptées par Judilibre comme filtres (chambres, formations, niveaux de publication, solutions, juridictions, sièges).
  Exemple : « Quelles sont les chambres de la Cour de cassation ? »
- `legifrance_search_case_law` — cherche dans les fonds de jurisprudence de Légifrance : judiciaire (Cour de cassation et cours d'appel), administratif (Conseil d'État et juridictions administratives), Conseil constitutionnel, juridictions financières et CNIL. Recherche par numéro ou ECLI comme par mots.
  Exemple : « Trouve la décision 2026-1217/1218 du Conseil constitutionnel. »
- `legifrance_get_decision` — lit une décision de Légifrance par son identifiant (JURITEXT…, CETATEXT…, CONSTEXT…, …), texte paginé.
  Exemple : « Lis la décision JURITEXT000053197030. »

### Jurisprudence : quelle source ?

Les faits sur les deux sources :

- Judilibre (`judilibre_*`) couvre la Cour de cassation, les cours d'appel, les tribunaux judiciaires, les tribunaux de commerce et les conseils de prud'hommes, y compris les rejets non spécialement motivés de la Cour de cassation. Sa recherche exige tous les mots de la requête par défaut (`match` permet de choisir l'expression exacte ou un mot quelconque).
- Légifrance (`legifrance_*_case_law`, `legifrance_get_decision`) couvre la Cour de cassation et les cours d'appel (ces dernières seulement jusqu'au début de 2023), les juridictions administratives (dont le Conseil d'État), le Conseil constitutionnel, les juridictions financières et la CNIL.
- Légifrance ne détient pas toutes les décisions de la Cour de cassation : notamment pas ses rejets non spécialement motivés ni ses non-admissions. Il reçoit les décisions de la Cour de cassation qu'il détient quelques semaines après Judilibre, et ne contient aucune décision de cour d'appel postérieure au début de 2023. Une décision absente de Légifrance ne signifie donc pas qu'elle n'existe pas.

Les outils Judilibre nécessitent que l'API JUDILIBRE soit souscrite sur votre application PISTE (les étapes de `vigueur_status` l'incluent).

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
