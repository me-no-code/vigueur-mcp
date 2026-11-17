---
title: "legifrance_get_text"
level: reference
tags: [tool, legifrance, law, decree, text]
summary: "Lire une loi, une ordonnance, un décret ou un arrêté, sous forme de plan ou article par article, dans la version en vigueur à une date ou dans sa version publiée au Journal officiel."
updated: 2026-11-17
---

# legifrance_get_text

Lit sur Légifrance une loi, une ordonnance, un décret ou un arrêté français. Vous obtenez soit son plan (titre, statut, publication, sections avec nombre d'articles), soit le texte de ses articles, page par page.

## Ce que vous pouvez demander

- « Montre-moi le plan de la loi du 6 janvier 1978 (loi Informatique et libertés). » / « Show me the outline of loi 78-17. »
- « Donne-moi les articles du chapitre Ier de la loi 78-17. » / « Give me the articles of chapter I of loi 78-17. »
- « Quel est le texte de l'ordonnance 2016-131 dans sa version publiée au Journal officiel ? » / « What is ordonnance 2016-131 as published in the Journal officiel? »
- « Le décret 2005-1309 dans sa version du 1er janvier 2015. » / « Décret 2005-1309 as it stood on 2015-01-01. »

## Ce qu'il faut fournir

Donnez exactement une cible : un `id`, un `nor`, ou une `nature` avec un `number`. Les valeurs vides comptent comme non fournies.

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `id` | Une cible est obligatoire | L'identifiant Légifrance du texte. | `LEGITEXT` plus 12 chiffres (la version consolidée) ou `JORFTEXT` plus 12 chiffres (la version publiée au Journal officiel) | Aucun |
| `nor` | Une cible est obligatoire | Le NOR du texte. Le texte est alors lu dans sa version publiée au Journal officiel. | Un NOR comme `JUSC1522466R` | Aucun |
| `nature` | Avec `number` | La nature du texte. | `loi`, `loi_organique`, `ordonnance`, `decret`, `arrete` | Aucun |
| `number` | Avec `nature` | Le numéro du texte. Un « n° » en tête n'en fait pas partie. | `78-17`, `2016-131`, `n° 78-17` | Aucun |
| `at_date` | Non | Lit la version consolidée en vigueur à cette date. Pas pour un identifiant `JORFTEXT` ni pour un NOR. | Une date valide au format `YYYY-MM-DD` | Aujourd'hui (heure de Paris) |
| `section_id` | Non | Limite la réponse à une section : son plan, ou ses articles. | Un `section_id` tiré d'un plan précédent | Texte entier |
| `part` | Non | Ce qu'il faut afficher. | `outline` (titre, statut, publication, sections avec nombre d'articles) ou `articles` (les textes des articles, page par page) | `outline` |
| `page` | Non | La page du plan ou des articles. | Un nombre entier, 1 ou plus | 1 |

Deux façons de lire un texte :

- **Consolidé** (un identifiant `LEGITEXT`, ou `nature` avec `number`) : la version en vigueur à la date `at_date`, avec le statut de chaque article à cette date.
- **Dans sa version publiée** (un identifiant `JORFTEXT` ou un NOR) : le texte initial publié au Journal officiel. Les modifications ultérieures n'y figurent pas, et la réponse ne dit pas si le texte est en vigueur. `at_date` est refusé ici.

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; les extraits ci-dessous sont indentés, et `…` marque les champs ou les éléments omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

Le type de réponse (`outcome`) vaut `found`, `no_results` (une page au-delà de la dernière), `several_matches`, `not_in_force` ou `not_found`. Le champ `part` de la réponse (`outline` ou `articles`) indique laquelle des deux vues vous avez obtenue.

### Le plan

```
{
  "source": "Légifrance",
  "outcome": "found",
  "warnings": [],
  "id": "LEGITEXT000006068624",
  …
  "title": "Loi n° 78-17 du 6 janvier 1978 relative à l'informatique, aux fichiers et aux li…",
  "nature": "LOI",
  "legifrance_status": "Vigueur",
  …
  "published": "1978-01-07",
  …
  "version": "consolidated",
  "on": "2026-11-16",
  "link": "https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068624",
  "section": null,
  "part": "outline",
  "article_count": 187,
  "in_force_count": 133,
  "outside_sections_count": 0,
  "results": 50,
  "page": {
    "number": 1,
    "of": 1
  },
  "next": null,
  "items": [
    {
      "type": "section",
      "title": "Titre Ier : Dispositions communes",
      "section_id": "LEGISCTA000037802702",
      "depth": 0,
      "articles": 52,
      "in_force": 42
    },
    {
      "type": "section",
      "title": "Chapitre Ier : Principes et définitions",
      "section_id": "LEGISCTA000006095881",
      "depth": 1,
      "articles": 8,
      "in_force": 7
    },
    …
  ],
  "read_with": {
    "tool": "legifrance_get_text",
    "id": "LEGITEXT000006068624",
    "at_date": "2026-11-16",
    "part": "articles"
  },
  …
}
```

| Champ | Ce qu'il contient |
|---|---|
| `id`, `text_cid`, `link` | L'identifiant Légifrance du texte, l'identifiant commun à toutes ses versions, et la page officielle. |
| `title`, `nature`, `legifrance_status`, `nor` | Le titre, la nature, le libellé propre à Légifrance pour l'état juridique du texte (`Vigueur`, `Sans état juridique`…) et le NOR ; chacun `null` quand il n'est pas donné. |
| `published`, `journal`, `signed` | La date de publication, le numéro du Journal officiel et la date de signature ; chacun `null` quand il n'est pas donné. |
| `version` | `consolidated` (la version en vigueur à la date `on`) ou `as_published` (voir plus bas). |
| `on` | La date pour laquelle la version et les statuts sont lus. |
| `section` | La section unique couverte par la réponse (son `path` et son `section_id`) ; `null` pour le texte entier. |
| `part` | `outline` ou `articles`. |
| `article_count`, `in_force_count`, `outside_sections_count` | Le nombre d'articles du texte (ou de `section`), combien d'entre eux sont en vigueur à la date `on` d'après leurs dates, et combien se trouvent hors de toute sous-section. |
| `results`, `page`, `next` | Le nombre d'éléments sur toutes les pages, cette page et le nombre de pages, et la page suivante (`{ "page": 2 }`, ou `null`). |
| `items` | Dans un plan, les sections, les plus larges avant les plus internes. Chacune a son `title`, `section_id`, `depth` (0 pour une section de premier niveau), `articles` et `in_force`. |
| `read_with` | L'appel qui lit les textes des articles de ce plan ; `null` quand vous lisez déjà des articles. |

Avec `section_id`, le plan et les comptes concernent cette section. Les articles qui se trouvent directement dans la section, ou hors de toute section, sont comptés dans `outside_sections_count`.

Pour un texte lu dans sa version publiée, `version` vaut `as_published`, `in_force_count` et le `in_force` de chaque section valent `null`, et aucun article ne porte de `status` :

```
"version": "as_published",
"in_force_count": null,
```

Un avertissement que vous pouvez rencontrer : `Légifrance's in-force search did not return this text; its dates say it is in force on <date>.`

### Les articles

```
{
  "source": "Légifrance",
  "outcome": "found",
  "warnings": [
    "(Text not shown: not in force on 2026-11-16. Read it with an \"at_date\"…"
  ],
  "id": "LEGITEXT000006068624",
  …
  "version": "consolidated",
  "on": "2026-11-16",
  …
  "part": "articles",
  "article_count": 187,
  "in_force_count": 133,
  …
  "results": 187,
  "page": {
    "number": 1,
    "of": 8
  },
  "next": {
    "page": 2
  },
  "items": [
    {
      "type": "article",
      "section": [
        "Titre Ier : Dispositions communes",
        "Chapitre Ier : Principes et définitions"
      ],
      "number": "1",
      "id": "LEGIARTI000037822962",
      "slice": null,
      "status": {
        "state": "in_force",
        "on": "2026-11-16",
        "from": "2019-06-01",
        "until": null,
        "until_undetermined": false
      },
      "legifrance_status": "VIGUEUR",
      "text": "L'informatique doit être au service de chaque citoyen. Son développeme…"
    },
    {
      "type": "article",
      "section": [
        "Titre Ier : Dispositions communes",
        "Chapitre Ier : Principes et définitions"
      ],
      "number": "5-1",
      "id": "LEGIARTI000037088068",
      "slice": null,
      "status": {
        "state": "not_in_force",
        "on": "2026-11-16",
        "from": "2018-05-25",
        "until": "2019-06-01",
        "until_undetermined": false
      },
      "legifrance_status": "ABROGE",
      "text": null
    },
    …
  ],
  …
}
```

Chaque page répète l'identité du texte et ses avertissements. `items` contient les articles dans l'ordre. Chaque article a :

| Champ | Ce qu'il contient |
|---|---|
| `section` | Les titres des sections qui le contiennent, de la plus large à la plus interne (vide s'il est hors de toute section). |
| `number`, `id` | Le numéro de l'article et l'identifiant Légifrance de la version. |
| `status`, `legifrance_status` | Le statut de vigueur à la date `on` (voir [`legifrance_get_article`](legifrance_get_article.md) pour les quatre valeurs de `state`) et le libellé propre à Légifrance. |
| `slice` | `null` quand `text` est l'article entier ; `{ "index": 2, "of": 3 }` quand un article trop long pour une page est découpé et que cet élément contient la partie 2 sur 3. |
| `text` | Le texte officiel de l'article. |

Deux cas particuliers :

- **Un article qui n'est pas en vigueur à cette date.** Son `status.state` le dit, son `text` vaut `null`, et un avertissement dit `(Text not shown: not in force on <date>. Read it with an "at_date" inside its validity, or with legifrance_get_article and its id.)` Le texte n'est pas affiché : il n'est jamais présenté comme le droit de ce jour-là.
- **Un article pour lequel Légifrance ne donne aucune date de vigueur.** `status` vaut `null`, le texte est affiché, et l'article n'est pas compté comme en vigueur.

Pour un texte lu dans sa version publiée, `status` vaut `null` sur chaque article.

Les pages ne dépassent jamais environ 40 000 caractères. Une page au-delà de la dernière répond `no_results`, et `page` indique la page demandée et le nombre de pages.

### Plusieurs textes correspondent (`several_matches`)

`asked` dit ce qui a été recherché (`décret 2000-1`). `candidates` liste les textes : titre, `nature`, `nor`, `published`, `id`, `link`, et `read_with`, l'appel qui lit ce texte. Choisissez-en un et demandez de nouveau avec son `id`. `incomplete` vaut `true` quand Légifrance liste plus de correspondances que celles affichées (précisez avec la nature ou un identifiant Légifrance).

### Pas en vigueur à cette date (`not_in_force`)

Le texte existe, mais ses dates le placent hors vigueur à la date `on`. Il est listé, jamais présenté comme du droit. Chaque candidat a un `verdict` :

| `verdict` | Signification |
|---|---|
| `ended` | Le texte n'est plus en vigueur à la date `on` ; `verdict_date` est le jour où il a cessé d'être en vigueur (`null` quand il est inconnu). |
| `not_yet` | Le texte entre en vigueur plus tard ; `verdict_date` est ce jour (`null` quand il est inconnu). |
| `undetermined` | Légifrance ne donne aucune date exploitable. |
| `no_version` | Légifrance n'a aucune version de ce texte à la date `on`. |

Pour en lire un, passez son `id` avec un `at_date` situé dans sa période de validité.

### Introuvable (`not_found`)

`reason` vaut `no_text` (Légifrance n'a aucun texte qui corresponde à la demande ; `candidates` est vide) ou `other_nature` (aucun texte de cette nature ne porte le numéro, mais des textes d'autres natures le portent ; ils sont dans `candidates` et rien n'est lu à votre place, vous choisissez un identifiant) :

```
{
  "source": "Légifrance",
  "outcome": "not_found",
  "warnings": [
    "No text LEGITEXT999999999999 on Légifrance. Check it, or search with legifrance_search_legislation."
  ],
  "reason": "no_text",
  "asked": "text LEGITEXT999999999999",
  "candidates": [],
  "incomplete": false,
  "request": {
    "tool": "legifrance_get_text",
    "id": "LEGITEXT999999999999",
    "at_date": "2026-11-16",
    "part": "outline",
    "page": 1
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

Un identifiant inconnu est un échec de recherche, non une erreur.

### Erreurs

Une réponse d'erreur est un objet JSON avec `outcome: "error"` et un champ `error` qui contient un `kind` et un `message` (voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas)). Celles qui sont propres à cet outil :

- `Give exactly one target: "id" (LEGITEXT… or JORFTEXT…), "nor", or "nature" with "number" (e.g. nature "loi", number "78-17").`
- `"nature" and "number" go together.` suivi de la ligne ci-dessus.
- `"at_date" does not apply to a JORFTEXT id or a NOR: the text is read as published. Use a LEGITEXT id or nature + number for the version in force on a date.`
- `"<id>" is not a text id: expected LEGITEXT… or JORFTEXT… followed by 12 digits.`
- Un identifiant de convention collective (`KALITEXT…`) est refusé et renvoie vers `legifrance_search_legislation` avec le fonds `kali`.
- `The text has no section "<id>". Omit "section_id" to read the whole text.`

Les autres erreurs sont les mêmes pour tous les outils ; voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md).

## Limites

> **Un texte lu dans sa version publiée n'est pas sa version actuelle.** Par NOR ou par identifiant `JORFTEXT`, vous obtenez le texte initial du Journal officiel, sans les modifications ultérieures. Pour la version en vigueur, utilisez un identifiant `LEGITEXT` ou `nature` avec `number`.

- Les conventions collectives ne peuvent pas être lues en entier ici ; trouvez-les avec [`legifrance_search_legislation`](legifrance_search_legislation.md).
- Les codes ne sont pas lus ici : utilisez [`legifrance_get_article`](legifrance_get_article.md) et [`legifrance_browse_code`](legifrance_browse_code.md).
- Vigueur ne remplace jamais votre demande par une correspondance approchante : quand le numéro est partagé, d'une autre nature, ou hors vigueur, vous obtenez une liste et vous choisissez un identifiant.
- Avec la `nature` `loi_organique`, l'outil trouve les lois organiques bien que Légifrance les classe sous `LOI` ; on les distingue par leur titre.

## Voir aussi

- [`legifrance_search_legislation`](legifrance_search_legislation.md) : trouver d'abord un texte.
- [`legifrance_list_changes`](legifrance_list_changes.md) : ce qui a changé dans un texte sur une période.
- [`legifrance_get_article`](legifrance_get_article.md)
- [Codes, lois et décrets](../20-using/02-legislation.md)
