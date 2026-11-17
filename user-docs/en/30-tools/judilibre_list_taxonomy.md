---
title: judilibre_list_taxonomy
level: reference
tags: [tool, judilibre, taxonomy, filters]
summary: List the values Judilibre uses to classify decisions (chambers, formations, outcomes, courts, themes) so you can filter a search with the right key.
updated: 2026-11-16
---

# judilibre_list_taxonomy

Lists the values Judilibre uses to classify decisions, each with its key and its label. Use it to find the key of a formation, an outcome or a court before filtering a search.

## What you can ask

- "Quelles sont les formations de la Cour de cassation ?" / "What are the Cour de cassation's formations?"
- "Quels types de solutions Judilibre distingue-t-il ?" / "Which outcomes does Judilibre distinguish?"
- "Donne-moi la clé de la cour d'appel de Lyon pour filtrer." / "Give me the key for the Lyon court of appeal so I can filter."
- "Liste les thèmes qui contiennent « bail »." / "List the themes that contain 'bail'."

## What it takes

Only `list` is required.

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `list` | Yes | Which list to show. | `jurisdiction`, `chamber`, `formation`, `publication`, `solution`, `location` (courts of the other jurisdictions), `theme`, `field` | none |
| `jurisdiction` | No | The jurisdiction the list is for. | `cc`, `ca`, `tj`, `tcom`, `cph` | `cc` |
| `contains` | No | Keep only the values whose label contains these words. Case, accents and punctuation are ignored. It also looks at the group heading of a grouped list, not at the key. | Free text | none |
| `page` | No | Page of the list. | Whole number, 1 or more | 1 |

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpts here are indented, and `…` marks items left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md).

`outcome` is `results`, or `no_results` when the list has no value to show (see below).

**A list.**

```
{
  "source": "Judilibre",
  "outcome": "results",
  …
  "list": "chamber",
  "jurisdiction": "cc",
  "contains": null,
  "results": 12,
  "total": 12,
  "free_text": false,
  "page": {
    "number": 1,
    "of": 1
  },
  "next": null,
  "items": [
    {
      "key": "pl",
      "label": "Assemblée plénière",
      "group": null
    },
    {
      "key": "mi",
      "label": "Chambre mixte",
      "group": null
    },
    {
      "key": "civ1",
      "label": "Première chambre civile",
      "group": null
    },
    …
  ],
  …
  "cached": [
    {
      "what": "Judilibre chamber list (cc)",
      "retrieved": "2026-11-16T10:42:07Z"
    }
  ],
  …
}
```

| Field | What it holds |
|---|---|
| `list`, `jurisdiction`, `contains` | The list asked for, the jurisdiction it is for, and the words you filtered by (`null` when none). |
| `results`, `total` | The number of values after the filter, and the number of values in the whole list. |
| `free_text` | `true` when Judilibre records this list as free text for this jurisdiction, so there is no list. |
| `page`, `next` | This page and the number of pages, and the next page (`{ "page": 2 }`, or `null`). A long list is split into pages of up to 200 values. |
| `items` | The values of this page. |

Each value holds `key` (what the filters of `judilibre_search_decisions` take; `null` for a value without a key, such as a theme), `label` (the value as Judilibre labels it) and `group`. A list that Judilibre groups, such as the themes of the courts of appeal, gives the group heading in `group`; it is `null` when there is none. With `contains`, the labels (and the group headings) are filtered by your words. The list comes from the memory of Vigueur, and `cached` says when it was fetched.

**Free text.** For the other courts, chambers, formations, publications and outcomes are not lists. `free_text` is `true`, `items` is empty, the outcome is `no_results`, and a warning says so:

```
{
  …
  "outcome": "no_results",
  "warnings": [
    "For Cour d'appel, Judilibre records chambers as free text, so there is no list to filter on: put the words in…"
  ],
  "list": "chamber",
  "jurisdiction": "ca",
  …
  "results": 0,
  "total": 0,
  "free_text": true,
  …
  "items": [],
  …
}
```

**No value.** When a list has no value, or none matches `contains`, the outcome is `no_results`, with a warning of the form `Judilibre has no {list} value{ matching "…"} for {court} ({total} values in the list).` For example, the `location` list was empty for the Cour de cassation (observed in November 2026). A `page` beyond the list gives `no_results` too, and `page` says which page you asked for and how many there are.

Source errors (credentials, quota, unavailable, no answer within 45 seconds) are error answers (`outcome: "error"`, with a `kind` and a `message`; see [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong)).

## Limits

> **Keys in the lists are not always the names the search takes**
> `judilibre_search_decisions` takes Vigueur's own names for `chamber` (`social`, `civ1`, `commercial`, `criminal`, `plenary`, `mixed`) and `publication` (`bulletin`, `report`, `chamber_letter`, `press_release`), not the keys shown here (`soc`, `comm`, `cr`, `pl`, `mi`; `b`, `r`, `l`, `c`). `formation`, `solution` and `location` take the keys as listed. Claude maps them for you.

- The `chamber`, `formation`, `publication` and `solution` lists exist for the Cour de cassation only. The values for courts of appeal and first-instance courts are free text.
- The `theme` lists are long (observed in November 2026: about 780 entries for the Cour de cassation, about 1 000 in nine groups for the courts of appeal). Use `contains`. Vigueur's search has no `theme` filter, because the source's filter returned nothing; `search_in` `themes` searches the themes text instead.
- Vigueur keeps each list in memory for 24 hours, so a change at the source can take that long to appear.
- The lists are Judilibre's own. Vigueur does not add, rank or interpret values.

## Related

- [`judilibre_search_decisions`](judilibre_search_decisions.md): where the keys are used.
- [`judilibre_get_decision`](judilibre_get_decision.md)
- [Judilibre](../40-sources/02-judilibre.md)
