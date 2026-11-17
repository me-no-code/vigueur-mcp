---
title: legifrance_latest_jo
level: reference
tags: [tool, legifrance, journal-officiel, jorf]
summary: Read the latest issues of the Journal officiel, or the issues of one publication date, with the table of contents of each.
updated: 2026-11-16
---

# legifrance_latest_jo

Reads the latest issues of the *Journal officiel* ([glossary](../00-intro/03-glossary.md)) from Légifrance, or the issues published on one date. Each issue comes with its table of contents: every published text with its nature (loi, décret, arrêté…), its ministry or authority and a link. You can keep only one nature or one emitter.

## What you can ask

- "Qu'a publié le Journal officiel aujourd'hui ?" / "What did the Journal officiel publish today?"
- "Montre-moi les décrets du dernier Journal officiel." / "Show me the décrets of the latest Journal officiel."
- "Quels arrêtés du ministère du travail ont paru le 11 novembre 2026 ?" / "Which arrêtés of the ministry of labour were published on 2026-11-11?"
- "Liste les trois derniers numéros du Journal officiel." / "List the last three issues of the Journal officiel."

## What it takes

All parameters are optional. A blank value counts as not given.

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `count` | No | How many of the latest issues to read. Ignored when you give `date`. | A whole number from 1 to 10 | 1 |
| `date` | No | Reads the issue or issues published on this date. At most 3 issues of that date are read. | A real date as `YYYY-MM-DD` (publication date) | The latest issues |
| `nature` | No | Keeps only texts of this nature. Case and accents do not matter, but the value must be the whole nature. | `decret`, `arrete`, `loi`… The natures that occur are listed by [`legifrance_list_reference_values`](legifrance_list_reference_values.md). | All natures |
| `emitter` | No | Keeps only texts of this ministry or authority. A partial name is enough, matched ignoring case and accents against both the ministry and the emitter. | For example `travail` | All emitters |
| `page` | No | Which page of the table of contents. | A whole number, 1 or more | 1 |

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpts here are indented, and `…` marks fields, items or text left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md).

`outcome` is `results`, or `no_results` when nothing matches your filters, when the issue lists no text, or when you ask for a page past the last one.

```
{
  "source": "Légifrance",
  "outcome": "results",
  "warnings": [],
  "issue_count": 3,
  "results": 208,
  "page": {
    "number": 1,
    "of": 3
  },
  "next": {
    "page": 2
  },
  "filter": {
    "nature": null,
    "emitter": null,
    "matched_emitters": []
  },
  "items": [
    {
      "id": "JORFCONT000055078255",
      "number": "0264",
      "title": "JORF n°0264 du 11 novembre 2026",
      "published": "2026-11-11",
      "link": "https://www.legifrance.gouv.fr/eli/jo/2026/11/11/0264",
      "toc_available": true,
      "groups": [
        {
          "path": [
            "Journal officiel \"Lois et Décrets\"",
            "Présidence de la République",
            "Promotion des militaires n'appartenant pas à l'armée active",
            "Ordre national de la Légion d’honneur"
          ],
          "texts": [
            {
              "id": "JORFTEXT000055078260",
              "title": "Décret du 10 novembre 2026 portant élévation dans l'ordre national de…",
              "nature": "DECRET",
              "emitter": "Présidence de la République",
              "link": "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000055078260"
            },
            …
          ]
        },
        …
      ]
    },
    …
  ],
  …
}
```

| Field | What it holds |
|---|---|
| `issue_count` | The number of issues selected. |
| `results` | The number of texts left after filtering, over all pages and issues. |
| `page`, `next` | This page and the number of pages, and the next page (`{ "page": 2 }`, or `null`). |
| `filter` | The filters applied: `nature` and `emitter` (`null` when not used), and `matched_emitters`, the spellings the `emitter` filter matched (ministries' names change with governments, so several spellings can match). |
| `items` | The issues of this page, in the order Légifrance gives them. |

An issue holds its `id`, `number`, `title`, `published` (its publication date, not an entry-into-force date), its official `link`, and `toc_available`, which is `false` when Légifrance gives no table of contents for it (`groups` is then empty). `groups` lists its texts grouped by their place in the table of contents: the `path` of titles from the outermost down, and the `texts`. A text holds its `id` (`JORFTEXT…`), `title`, `nature`, `emitter` (the ministry, else the emitter; each `null` when not given) and `link`.

### When nothing matches (`no_results`)

The issues stay listed, with no text under them, and the answer adds what is available so you can correct the filter. `available` lists the natures and the emitters of the selected issues before filtering, most frequent first, at most 10 of each. The same two lists are given as sentences in `warnings`, ending with `; … (<n> more)` when the list was cut:

```
{
  …
  "outcome": "no_results",
  "warnings": [
    "No text matches these filters in the selected issue(s).",
    "Natures available in these issues: ARRETE; DECRET; AVIS; INF…",
    "Emitters available in these issues: Ministère de l'agricultu…"
  ],
  "issue_count": 3,
  "results": 0,
  …
  "filter": {
    "nature": "zzz",
    "emitter": null,
    "matched_emitters": []
  },
  "items": [
    {
      "id": "JORFCONT000055078255",
      "number": "0264",
      "title": "JORF n°0264 du 11 novembre 2026",
      "published": "2026-11-11",
      "link": "https://www.legifrance.gouv.fr/eli/jo/2026/11/11/0264",
      "toc_available": true,
      "groups": []
    },
    …
  ],
  "available": {
    "natures": [
      "ARRETE",
      "DECRET",
      "AVIS",
      …
    ],
    "emitters": [
      "Ministère de l'agriculture, de l'agro-alimentaire et de la s…",
      "Ministère de la santé, des familles, de l'autonomie et des p…",
      "Ministère de la justice",
      …
    ]
  },
  …
}
```

Other cases: `No text is listed in the selected issue(s).` (no filter, empty issue) and `No Journal officiel issue found.` (no issue on that date).

### Long issues

A page holds at most 1,000 lines and about 40,000 characters. A page that starts inside an issue repeats the issue's header and the group path. When there is more, `next` is `{ "page": 2 }`. A page past the last answers `no_results`, and `page` says which page you asked for and how many there are (for example `"page": { "number": 99, "of": 3 }`).

### Errors

An error answer is a JSON object with `outcome: "error"` and an `error` holding a `kind` and a `message` (see [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong)). Those specific to this tool:

- A `count` outside 1 to 10 is refused.
- `"emitter" has no letters or digits: "<emitter>".`
- A `date` that is not a real date is refused.

Other errors are the same for every tool; see [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md).

## Limits

> **Dates here are publication dates.** They are not the dates texts enter into force. For entry-into-force dates use [`legifrance_list_changes`](legifrance_list_changes.md).

- It lists what was published, with links. To read a text, use [`legifrance_get_text`](legifrance_get_text.md) with its `JORFTEXT` id (read as published).
- With `date`, at most 3 issues of that date are read.
- Names of emitters change from one government to the next. Check the spelling with [`legifrance_list_reference_values`](legifrance_list_reference_values.md) (`jorf_emitters`) or rely on a partial name.

## Related

- [`legifrance_list_reference_values`](legifrance_list_reference_values.md): the natures and emitters to filter on.
- [`legifrance_get_text`](legifrance_get_text.md)
- [`legifrance_search_legislation`](legifrance_search_legislation.md): search the Journal officiel by words, NOR or text number, narrowed by publication dates.
- [The Journal officiel and tracking changes](../20-using/04-journal-officiel.md)
