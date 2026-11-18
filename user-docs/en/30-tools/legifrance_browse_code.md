---
title: legifrance_browse_code
level: reference
tags: [tool, legifrance, code, table-of-contents]
summary: Walk a code's table of contents one level at a time, as it stood on a date.
updated: 2026-11-18
---

# legifrance_browse_code

Shows one level of a French code's table of contents on Légifrance (parts, books, titles, chapters, sections and articles), as it stood on a date. You start at the top and go deeper by passing a section id taken from the previous answer.

## What you can ask

- "Montre-moi le plan du Code du travail." / "Show me the table of contents of the Code du travail."
- "Quels articles contient le chapitre sur le règlement intérieur ?" / "Which articles does the chapter on internal rules contain?"
- "Quel était le plan du Code du travail au 1er janvier 2005 ?" / "What did the table of contents of the Code du travail look like on 2005-01-01?"

## What it takes

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `code` | Yes | The code to browse. | The code's title, such as `Code civil` or `Code du travail`. Common abbreviations work, for example `C. trav.`. | None |
| `section_id` | No | The section to open: the answer lists what it contains. | A `section_id` from an earlier answer | The top level of the code |
| `at_date` | No | The table of contents in force on this date. | A real date as `YYYY-MM-DD` | Today (date in Paris) |
| `include_repealed` | No | `true` also lists sections not in force on the date, each with when it ended or starts, and, today, the repealed articles. | `true` or `false` | `false` |
| `page` | No | Which page of a long list. | A whole number, 1 or more | 1 |

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpts here are indented, and `…` marks fields or items left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md).

`outcome` is `results`, or `no_results` when nothing at that level is in force on the date, or when you ask for a page past the last one.

The excerpts on this page come from a shortened recording of the Code du travail's table of contents, which keeps a single path through the code. Above the chapter shown, a live answer lists more items at each level, and its counts are larger.

The top level lists the code's parts. The `cached` field says the table of contents came from the memory of Vigueur, and when it was fetched:

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

A chapter lists its articles with Légifrance's label and the id to read each one:

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

| Field | What it holds |
|---|---|
| `code`, `code_id`, `on` | The code's title and id, and the date the table of contents is read for. |
| `link` | The official page of the code, or of the section when you gave a `section_id`. |
| `section` | The section whose contents are listed: its `path` from the code and its `section_id`. `null` at the top level. |
| `section_count`, `article_count`, `results` | The sections and the articles of this level, and their total, over all pages. |
| `hidden_not_in_force` | The number of sections and articles of this level left out as not in force on `on`. |
| `page`, `next` | This page and the number of pages, and the next page (`{ "page": 2 }`, or `null`). |
| `items` | The sections first, then the articles, in official order. Only one level is shown. |

A section item holds its `title`, its `section_id` and a `status` (the same fields as in [`legifrance_get_article`](legifrance_get_article.md): `state`, `on`, `from`, `until`, `until_undetermined`), computed from the section's own dates. An article item holds its `number`, its `id` and `legifrance_status_today`, Légifrance's own label as of today. The `warnings` carry the hint `Pass a section_id to list what it contains; read an article with legifrance_get_article and its id.`

### What is hidden, and when

- **Sections** are judged by their own validity dates on the day you asked. One that is not in force that day is hidden unless `include_repealed` is `true`. With it, each such section carries its `status`: `not_in_force` (it ended), `not_yet_in_force` or `never_applied`.
- **Articles.** The table of contents gives articles no dates, only Légifrance's current label. Today, repealed articles are hidden unless `include_repealed` is `true`. On any other date, every article is listed, and each carries today's label in `legifrance_status_today`, not its status on that date. A warning says so: `Article labels are Légifrance's current ones; open an article with legifrance_get_article and at_date to check it on <date>.`
- **The count.** What was hidden is counted in `hidden_not_in_force` and in a warning: `(<n> items not in force on <date> hidden — include_repealed: true to show them)`, or `(1 item not in force on <date> hidden — …)` for one.
- **Nothing to list.** When nothing at that level is in force on the date, the outcome is `no_results` and a warning says `Nothing in force here on <date>.`

For example, on 2005-01-01 the Code du travail's current legislative part was not yet in force: in the shortened recording, it is hidden and counted (`no_results`, `"hidden_not_in_force": 1`), and with `include_repealed` it appears as an item whose `status` says it starts later:

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

A long list is paged: every page repeats the code and the section, and `next` is `{ "page": 2 }` when there is more. A page past the last answers `no_results`, and `page` says which page you asked for and how many there are.

### Errors

An error answer is a JSON object with `outcome: "error"` and an `error` holding a `kind` and a `message` (see [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong)). Those specific to this tool:

- `No code is titled "<code>".` followed by `Did you mean: <titles>?` when titles contain what you typed. Suggestions are never substituted.
- `"<section_id>" is not a section of <code> on <date>. Browse the code without a section to list its top-level parts.`

Other errors are the same for every tool; see [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md).

## Limits

- One level per answer: to go deeper, pass a `section_id` from the answer.
- The table of contents does not say what an article is about. To read one, use [`legifrance_get_article`](legifrance_get_article.md) with its id.
- On a past date, article labels are today's. Check an article on a given date with `legifrance_get_article` and `at_date`.
- A section is shown or hidden by its own dates, not by its label.

## Related

- [`legifrance_get_article`](legifrance_get_article.md)
- [`legifrance_search_legislation`](legifrance_search_legislation.md)
- [`legifrance_list_changes`](legifrance_list_changes.md)
- [Codes, laws and decrees](../20-using/02-legislation.md)
