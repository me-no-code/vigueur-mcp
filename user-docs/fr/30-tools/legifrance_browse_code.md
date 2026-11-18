---
title: "legifrance_browse_code"
level: reference
tags: [tool, legifrance, code, table-of-contents]
summary: "Parcourir la table des matières d'un code, un niveau à la fois, telle qu'elle était à une date donnée."
updated: 2026-11-18
---

# legifrance_browse_code

Montre un niveau de la table des matières d'un code français sur Légifrance (parties, livres, titres, chapitres, sections et articles), telle qu'elle était à une date donnée. Vous partez du sommet et descendez en passant un identifiant de section tiré de la réponse précédente.

## Ce que vous pouvez demander

- « Montre-moi le plan du Code du travail. » / « Show me the table of contents of the Code du travail. »
- « Quels articles contient le chapitre sur le règlement intérieur ? » / « Which articles does the chapter on internal rules contain? »
- « Quel était le plan du Code du travail au 1er janvier 2005 ? » / « What did the table of contents of the Code du travail look like on 2005-01-01? »

## Ce qu'il faut fournir

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `code` | Oui | Le code à parcourir. | Le titre du code, comme `Code civil` ou `Code du travail`. Les abréviations courantes fonctionnent, par exemple `C. trav.`. | Aucun |
| `section_id` | Non | La section à ouvrir : la réponse liste ce qu'elle contient. | Un `section_id` tiré d'une réponse précédente | Le niveau supérieur du code |
| `at_date` | Non | La table des matières en vigueur à cette date. | Une date valide au format `YYYY-MM-DD` | Aujourd'hui (heure de Paris) |
| `include_repealed` | Non | `true` liste aussi les sections qui ne sont pas en vigueur à la date, chacune avec la date de sa fin ou de son début, et, à la date du jour, les articles abrogés. | `true` ou `false` | `false` |
| `page` | Non | La page d'une longue liste. | Un nombre entier, 1 ou plus | 1 |

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; les extraits ci-dessous sont indentés, et `…` marque les champs ou les éléments omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

Le type de réponse (`outcome`) vaut `results`, ou `no_results` quand rien à ce niveau n'est en vigueur à la date, ou quand vous demandez une page au-delà de la dernière.

Les extraits de cette page viennent d'un enregistrement raccourci de la table des matières du Code du travail, qui ne garde qu'un seul chemin dans le code. Au-dessus du chapitre montré, une réponse réelle liste plus d'éléments à chaque niveau, et ses comptes sont plus élevés.

Le niveau supérieur liste les parties du code. Le champ `cached` indique que la table des matières vient de la mémoire de Vigueur, et à quel moment elle a été récupérée :

```
{
  "source": "Légifrance",
  "outcome": "results",
  "warnings": [
    "Pass a section_id to list what it contains; read an article with legifrance_get_article an…"
  ],
  "code": "Code du travail",
  "code_id": "LEGITEXT000006072050",
  "on": "2026-11-16",
  "link": "https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006072050",
  "section": null,
  "section_count": 1,
  "article_count": 0,
  "results": 1,
  "hidden_not_in_force": 0,
  "page": {
    "number": 1,
    "of": 1
  },
  "next": null,
  "items": [
    {
      "type": "section",
      "title": "Partie législative",
      "section_id": "LEGISCTA000006112874",
      "status": {
        "state": "in_force",
        "on": "2026-11-16",
        "from": "2008-05-01",
        "until": null,
        "until_undetermined": false
      }
    }
  ],
  …
  "cached": [
    {
      "what": "Code du travail table of contents on 2026-11-16",
      "retrieved": "2026-11-16T10:42:07Z"
    }
  ],
  …
}
```

Un chapitre liste ses articles avec le libellé de Légifrance et l'identifiant qui permet de lire chacun :

```
{
  …
  "outcome": "results",
  …
  "code": "Code du travail",
  …
  "on": "2026-11-16",
  "link": "https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006072050/LEGISCTA000006177885",
  "section": {
    "path": [
      "Partie législative",
      "Première partie : Les relations individuelles de travail",
      …
    ],
    "section_id": "LEGISCTA000006177885"
  },
  "section_count": 0,
  "article_count": 7,
  "results": 7,
  "hidden_not_in_force": 0,
  "page": {
    "number": 1,
    "of": 1
  },
  "next": null,
  "items": [
    {
      "type": "article",
      "number": "L1321-1",
      "id": "LEGIARTI000006901432",
      "legifrance_status_today": "VIGUEUR"
    },
    {
      "type": "article",
      "number": "L1321-2",
      "id": "LEGIARTI000045391757",
      "legifrance_status_today": "VIGUEUR"
    },
    …
  ],
  …
}
```

| Champ | Ce qu'il contient |
|---|---|
| `code`, `code_id`, `on` | Le titre et l'identifiant du code, et la date pour laquelle la table des matières est lue. |
| `link` | La page officielle du code, ou de la section quand vous avez donné un `section_id`. |
| `section` | La section dont le contenu est listé : son `path` depuis le code et son `section_id`. `null` au niveau supérieur. |
| `section_count`, `article_count`, `results` | Les sections et les articles de ce niveau, et leur total, sur toutes les pages. |
| `hidden_not_in_force` | Le nombre de sections et d'articles de ce niveau écartés parce qu'ils ne sont pas en vigueur à la date `on`. |
| `page`, `next` | Cette page et le nombre de pages, et la page suivante (`{ "page": 2 }`, ou `null`). |
| `items` | Les sections d'abord, puis les articles, dans l'ordre officiel. Un seul niveau est affiché. |

Un élément de type section contient son `title`, son `section_id` et un `status` (les mêmes champs que dans [`legifrance_get_article`](legifrance_get_article.md) : `state`, `on`, `from`, `until`, `until_undetermined`), calculé à partir des dates propres à la section. Un élément de type article contient son `number`, son `id` et `legifrance_status_today`, le libellé propre à Légifrance à la date du jour. Les `warnings` portent l'indication `Pass a section_id to list what it contains; read an article with legifrance_get_article and its id.`

### Ce qui est masqué, et quand

- **Sections.** Elles sont jugées d'après leurs propres dates de vigueur au jour demandé. Une section qui n'est pas en vigueur ce jour-là est masquée, sauf si `include_repealed` vaut `true`. Dans ce cas, chacune de ces sections porte son `status` : `not_in_force` (elle a pris fin), `not_yet_in_force` ou `never_applied`.
- **Articles.** La table des matières ne donne aucune date aux articles, seulement le libellé actuel de Légifrance. À la date du jour, les articles abrogés sont masqués, sauf si `include_repealed` vaut `true`. À toute autre date, tous les articles sont listés, et chacun porte le libellé du jour dans `legifrance_status_today`, non son état juridique à cette date. Un avertissement le dit : `Article labels are Légifrance's current ones; open an article with legifrance_get_article and at_date to check it on <date>.`
- **Le compte.** Ce qui a été masqué est compté dans `hidden_not_in_force` et dans un avertissement : `(<n> items not in force on <date> hidden — include_repealed: true to show them)`, ou `(1 item not in force on <date> hidden — …)` pour un seul.
- **Rien à lister.** Quand rien à ce niveau n'est en vigueur à la date, le type de réponse est `no_results` et un avertissement dit `Nothing in force here on <date>.`

Par exemple, au 1er janvier 2005, la partie législative actuelle du Code du travail n'était pas encore en vigueur : dans l'enregistrement raccourci, elle est masquée et comptée (`no_results`, `"hidden_not_in_force": 1`), et avec `include_repealed` elle apparaît comme un élément dont le `status` dit qu'elle commence plus tard :

```
{
  …
  "outcome": "results",
  …
  "on": "2005-01-01",
  …
  "results": 1,
  "hidden_not_in_force": 0,
  …
  "items": [
    {
      "type": "section",
      "title": "Partie législative",
      "section_id": "LEGISCTA000006112874",
      "status": {
        "state": "not_yet_in_force",
        "on": "2005-01-01",
        "from": "2008-05-01",
        "until": null,
        "until_undetermined": false
      }
    }
  ],
  …
}
```

Une longue liste est paginée : chaque page répète le code et la section, et `next` vaut `{ "page": 2 }` quand il y a une suite. Une page au-delà de la dernière répond `no_results`, et `page` indique la page demandée et le nombre de pages.

### Erreurs

Une réponse d'erreur est un objet JSON avec `outcome: "error"` et un champ `error` qui contient un `kind` et un `message` (voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas)). Celles qui sont propres à cet outil :

- `No code is titled "<code>".` suivi de `Did you mean: <titles>?` quand des titres contiennent ce que vous avez saisi. Vigueur ne remplace jamais votre saisie par une suggestion.
- `"<section_id>" is not a section of <code> on <date>. Browse the code without a section to list its top-level parts.`

Les autres erreurs sont les mêmes pour tous les outils ; voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md).

## Limites

- Un niveau par réponse : pour descendre, passez un `section_id` tiré de la réponse.
- La table des matières ne dit pas de quoi parle un article. Pour en lire un, utilisez [`legifrance_get_article`](legifrance_get_article.md) avec son identifiant.
- À une date passée, les libellés des articles sont ceux d'aujourd'hui. Vérifiez un article à une date donnée avec `legifrance_get_article` et `at_date`.
- Une section est affichée ou masquée d'après ses propres dates, non d'après son libellé.

## Voir aussi

- [`legifrance_get_article`](legifrance_get_article.md)
- [`legifrance_search_legislation`](legifrance_search_legislation.md)
- [`legifrance_list_changes`](legifrance_list_changes.md)
- [Codes, lois et décrets](../20-using/02-legislation.md)
