---
title: legifrance_get_text
level: reference
tags: [tool, legifrance, law, decree, text]
summary: Read a law, ordinance, decree or order, as its outline or article by article, in the version in force on a date or as published.
updated: 2026-11-16
---

# legifrance_get_text

Reads a French law, ordinance, decree or order from Légifrance. You get either its outline (title, status, publication, sections with article counts) or the texts of its articles, page by page.

## What you can ask

- "Montre-moi le plan de la loi du 6 janvier 1978 (loi Informatique et libertés)." / "Show me the outline of loi 78-17."
- "Donne-moi les articles du chapitre Ier de la loi 78-17." / "Give me the articles of chapter I of loi 78-17."
- "Quel est le texte de l'ordonnance 2016-131 telle que publiée au Journal officiel ?" / "What is ordonnance 2016-131 as published in the Journal officiel?"
- "Le décret 2005-1309 dans sa version du 1er janvier 2015." / "Décret 2005-1309 as it stood on 2015-01-01."

## What it takes

Give exactly one target: an `id`, a `nor`, or a `nature` together with a `number`. Blank values count as not given.

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `id` | One target is required | The Légifrance id of the text. | `LEGITEXT` plus 12 digits (the consolidated version) or `JORFTEXT` plus 12 digits (as published in the Journal officiel) | None |
| `nor` | One target is required | The NOR of the text. It is read as published in the Journal officiel. | A NOR such as `JUSC1522466R` | None |
| `nature` | With `number` | The kind of text. | `loi`, `loi_organique`, `ordonnance`, `decret`, `arrete` | None |
| `number` | With `nature` | The number of the text. A leading "n°" is not part of it. | `78-17`, `2016-131`, `n° 78-17` | None |
| `at_date` | No | Reads the consolidated version in force on this date. Not for a `JORFTEXT` id or a NOR. | A real date as `YYYY-MM-DD` | Today (date in Paris) |
| `section_id` | No | Restricts the answer to one section: its outline, or its articles. | A `section_id` taken from an earlier outline | Whole text |
| `part` | No | What to show. | `outline` (title, status, publication, sections with article counts) or `articles` (the article texts, page by page) | `outline` |
| `page` | No | Which page of the outline or of the articles. | A whole number, 1 or more | 1 |

Two ways to read a text:

- **Consolidated** (a `LEGITEXT` id, or `nature` with `number`): the version in force on `at_date`, with each article's status on that date.
- **As published** (a `JORFTEXT` id or a NOR): the initial text as published in the Journal officiel. Later amendments are not included, and the answer makes no in-force claim. `at_date` is refused here.

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpts here are indented, and `…` marks fields or items left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md).

`outcome` is one of `found`, `no_results` (a page past the last one), `several_matches`, `not_in_force` or `not_found`. `part` in the answer (`outline` or `articles`) says which of the two views you got.

### The outline

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

| Field | What it holds |
|---|---|
| `id`, `text_cid`, `link` | The Légifrance id of the text, the id shared by all its versions, and the official page. |
| `title`, `nature`, `legifrance_status`, `nor` | The title, the nature, Légifrance's own label for the legal state of the text (`Vigueur`, `Sans état juridique`…) and the NOR; each `null` when not given. |
| `published`, `journal`, `signed` | The publication date, the Journal officiel issue and the signature date; each `null` when not given. |
| `version` | `consolidated` (the version in force on `on`) or `as_published` (see below). |
| `on` | The date the version and the statuses are read for. |
| `section` | The one section the answer covers (its `path` and `section_id`); `null` for the whole text. |
| `part` | `outline` or `articles`. |
| `article_count`, `in_force_count`, `outside_sections_count` | The articles of the text (or of `section`), how many of them are in force on `on` by their dates, and how many sit outside any sub-section. |
| `results`, `page`, `next` | The number of items over all pages, this page and the number of pages, and the next page (`{ "page": 2 }`, or `null`). |
| `items` | In an outline, the sections, outer before inner. Each has its `title`, `section_id`, `depth` (0 for a top-level section), `articles` and `in_force`. |
| `read_with` | The call that reads the article texts of this outline; `null` when you are already reading articles. |

With `section_id`, the outline and the counts concern that section. Articles that sit directly in the section, or outside any section, are counted in `outside_sections_count`.

For a text read as published, `version` is `as_published`, `in_force_count` and every section's `in_force` are `null`, and no article carries a `status`:

```
"version": "as_published",
"in_force_count": null,
```

A warning you can meet: `Légifrance's in-force search did not return this text; its dates say it is in force on <date>.`

### The articles

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

Each page repeats the identity of the text and its warnings. `items` holds the articles in order. Each article has:

| Field | What it holds |
|---|---|
| `section` | The titles of the sections holding it, outermost first (empty outside any). |
| `number`, `id` | The article number and the Légifrance id of the version. |
| `status`, `legifrance_status` | The in-force status on `on` (see [`legifrance_get_article`](legifrance_get_article.md) for the four `state` values) and Légifrance's own label. |
| `slice` | `null` when `text` is the whole article; `{ "index": 2, "of": 3 }` when an article too long for a page is split and this item holds part 2 of 3. |
| `text` | The official text of the article. |

Two special cases:

- **An article not in force on the date.** Its `status.state` says so, its `text` is `null`, and a warning says `(Text not shown: not in force on <date>. Read it with an "at_date" inside its validity, or with legifrance_get_article and its id.)` The text is withheld, never shown as the law of that day.
- **An article for which Légifrance gives no in-force dates.** `status` is `null`, the text is shown, and the article is not counted as in force.

For a text read as published, `status` is `null` on every article.

Pages never exceed about 40,000 characters. A page past the last answers `no_results`, and `page` says which page you asked for and how many there are.

### Several texts match (`several_matches`)

`asked` says what was looked up (`décret 2000-1`). `candidates` lists the texts: title, `nature`, `nor`, `published`, `id`, `link`, and `read_with`, the call that reads that text. Choose one and ask again with its `id`. `incomplete` is `true` when Légifrance lists more matches than shown (refine with the nature or a Légifrance id).

### Not in force on that date (`not_in_force`)

The text exists, but its dates put it out of force on `on`. It is listed, never shown as law. Each candidate has a `verdict`:

| `verdict` | Meaning |
|---|---|
| `ended` | The text is no longer in force on `on`; `verdict_date` is the day it ceased (`null` when unknown). |
| `not_yet` | The text enters into force later; `verdict_date` is that day (`null` when unknown). |
| `undetermined` | Légifrance gives no usable dates. |
| `no_version` | Légifrance has no version of this text on `on`. |

To read one, pass its `id` with an `at_date` inside its validity.

### Not found (`not_found`)

`reason` is `no_text` (Légifrance has no text matching what was asked; `candidates` is empty) or `other_nature` (no text of that nature carries the number, but texts of other natures do; they are in `candidates` and nothing is read for you, you choose an id):

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

An unknown id is a miss, not an error.

### Errors

An error answer is a JSON object with `outcome: "error"` and an `error` holding a `kind` and a `message` (see [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong)). Those specific to this tool:

- `Give exactly one target: "id" (LEGITEXT… or JORFTEXT…), "nor", or "nature" with "number" (e.g. nature "loi", number "78-17").`
- `"nature" and "number" go together.` followed by the line above.
- `"at_date" does not apply to a JORFTEXT id or a NOR: the text is read as published. Use a LEGITEXT id or nature + number for the version in force on a date.`
- `"<id>" is not a text id: expected LEGITEXT… or JORFTEXT… followed by 12 digits.`
- A collective agreement id (`KALITEXT…`) is refused and points to `legifrance_search_legislation` with the `kali` collection.
- `The text has no section "<id>". Omit "section_id" to read the whole text.`

Other errors are the same for every tool; see [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md).

## Limits

> **A text read as published is not its current version.** By NOR or by `JORFTEXT` id you get the initial Journal officiel text, without later amendments. For the version in force, use a `LEGITEXT` id or `nature` with `number`.

- Collective agreements cannot be read whole here; find them with [`legifrance_search_legislation`](legifrance_search_legislation.md).
- Codes are not read here: use [`legifrance_get_article`](legifrance_get_article.md) and [`legifrance_browse_code`](legifrance_browse_code.md).
- A close match is never substituted: when the number is shared, in another nature, or out of force, you get a list and choose an id.
- A `nature` of `loi_organique` finds organic laws even though Légifrance files them under `LOI`; they are told apart by their title.

## Related

- [`legifrance_search_legislation`](legifrance_search_legislation.md): find a text first.
- [`legifrance_list_changes`](legifrance_list_changes.md): what changed in a text over a period.
- [`legifrance_get_article`](legifrance_get_article.md)
- [Codes, laws and decrees](../20-using/02-legislation.md)
