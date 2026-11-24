---
title: judilibre_search_decisions
level: reference
tags: [tool, judilibre, case-law, search]
summary: Search Judilibre for Cour de cassation and lower-court decisions, choose how the words combine, and read what each answer shows.
updated: 2026-11-23
---

# judilibre_search_decisions

Searches Judilibre, the Cour de cassation's open-data base, for decisions of the Cour de cassation and, on request, of courts of appeal, tribunaux judiciaires, commercial courts and labour courts.

## What you can ask

- "Trouve l'arrêt n° 23-20.348 de la Cour de cassation." / "Find Cour de cassation decision 23-20.348."
- "Cherche l'expression exacte « forfait jours » dans les arrêts de la chambre sociale, les plus récents d'abord." / "Search the exact phrase 'forfait jours' in social-chamber decisions, newest first."
- "Cherche les arrêts de la cour d'appel de Paris sur le bail depuis 2024." / "Find Paris court of appeal decisions about leases since 2024."
- "Y a-t-il des arrêts publiés au Bulletin sur ce sujet ?" / "Are there decisions published in the Bulletin on this subject?"

## What it takes

Only `query` is required. Judilibre returns nothing without search words.

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `query` | Yes | Search words, a [*pourvoi*](../00-intro/03-glossary.md) number or an ECLI. A number or ECLI finds that decision. | Free text, up to 512 characters | none |
| `match` | No | How the words combine. | `all_words`, `any_word`, `exact_phrase` (the words in that order) | `all_words` |
| `jurisdiction` | No | Which courts to search. | `cc` Cour de cassation, `ca` courts of appeal, `tj` tribunaux judiciaires, `tcom` commercial courts, `cph` labour courts | `cc` |
| `chamber` | No | Chamber of the Cour de cassation. `cc` only. | `plenary`, `mixed`, `civ1`, `civ2`, `civ3`, `commercial`, `social`, `criminal` | none |
| `formation` | No | Formation of the Cour de cassation. `cc` only. List them with [`judilibre_list_taxonomy`](judilibre_list_taxonomy.md). | `fp`, `fm`, `fs`, `f`, `frh`, `frr` | none |
| `publication` | No | How the Cour de cassation published the decision. `cc` only. | `bulletin`, `report`, `chamber_letter`, `press_release` | none |
| `solution` | No | Outcome key, for example `cassation` or `rejet`. `cc` only. List them with [`judilibre_list_taxonomy`](judilibre_list_taxonomy.md). | A key from the `solution` list | none |
| `location` | No | Court key for `ca`, `tj`, `tcom` and `cph`, for example `ca_paris`. Not with `cc`. | A key from the `location` list of the jurisdiction | none |
| `search_in` | No | Search one part of the decision only. | `text`, `introduction`, `expose`, `moyens`, `motivations`, `dispositif`, `visa`, `summary`, `themes` | the whole decision |
| `date_from` | No | Earliest decision date. A blank value counts as absent. | `YYYY-MM-DD` | none |
| `date_to` | No | Latest decision date. Must not be before `date_from`. | `YYYY-MM-DD` | none |
| `sort` | No | Order of the results. | `relevance`, `newest`, `oldest` | `relevance` |
| `page` | No | Page of results. | Whole number, 1 or more | 1 |
| `page_size` | No | Results per page. | Whole number, 1 to 20 | 10 |

`chamber` and `publication` take Vigueur's own names (`social`, `bulletin`), not the keys of the source's lists (`soc`, `b`). The difference matters only when you read the lists from `judilibre_list_taxonomy`.

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpts here are indented, and `…` marks items left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md).

`outcome` is `results`, or `no_results` when nothing matches or when you ask for a page past the last one.

```
{
  "source": "Judilibre",
  "outcome": "results",
  "warnings": [],
  "results": 568,
  "page": {
    "number": 1,
    "of": 57
  },
  "order": "most_relevant_first",
  "next": {
    "page": 2
  },
  "relaxed": false,
  "items": [
    {
      "title": "Cour de cassation, Chambre sociale — decision of 2026-09-30 — n° 25-14.434 — ECLI:FR:CCASS:2026:SO00…",
      "id": "6abcc10bc27382d099087409",
      "ecli": "ECLI:FR:CCASS:2026:SO00769",
      "link": "https://www.courdecassation.fr/decision/6abcc10bc27382d099087409",
      "jurisdiction": "cc",
      "location": null,
      "chamber": "Chambre sociale",
      "decided": "2026-09-30",
      "numbers": [
        "25-14.434"
      ],
      "formation": "Formation restreinte hors RNSM/NA",
      "publication": [],
      "solution": "Cassation",
      "summary": null,
      "excerpt": "supplémentaires accomplies en 2017 et les congés payés afférents en soutenant que la convention de *…",
      "read_with": {
        "tool": "judilibre_get_decision",
        "id": "6abcc10bc27382d099087409"
      }
    },
    …
  ],
  "request": {
    "tool": "judilibre_search_decisions",
    "query": "forfait jours",
    "match": "all_words",
    "jurisdiction": "cc",
    "sort": "relevance",
    "page": 1,
    "page_size": 10
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

| Field | What it holds |
|---|---|
| `results` | The number of decisions over all pages. |
| `page`, `next` | This page and the number of pages, and the next page (`{ "page": 2 }`, or `null`). |
| `order` | `most_relevant_first`, `newest_first` or `oldest_first`. |
| `relaxed` | `true` when Judilibre found no exact match and loosened the search: the results then match only some of the words, and a warning says so. |
| `items` | The decisions of this page. |

A decision holds:

| Field | What it holds |
|---|---|
| `title` | One line with the court, chamber, decision date, numbers and ECLI, cut at 300 characters. |
| `id`, `ecli`, `link` | The Judilibre id, the ECLI (`null` when there is none) and the official page, built by Vigueur from the id. |
| `jurisdiction`, `location`, `chamber` | Judilibre's key for the jurisdiction (`cc`, `ca`, `tj`, `tcom`, `cph`), the court within it, and the chamber, as Judilibre labels them; `location` and `chamber` are `null` when not given. |
| `decided`, `numbers` | The decision date and the decision numbers. |
| `formation`, `publication`, `solution` | The formation, how the Cour de cassation published the decision, and the outcome. `publication` is a list, empty when the decision is not published in the Bulletin. |
| `summary` | The Cour de cassation's summary, cut at 600 characters; `null` when none. |
| `excerpt` | Up to two matching passages, joined with ` … `, the matched words between `**`, cut at 700 characters; `null` when none. |
| `read_with` | The call that returns the full decision, for [`judilibre_get_decision`](judilibre_get_decision.md). |

An unreasoned rejection keeps the source's wording in `formation` and `solution`: `"formation": "Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)"`, `"solution": "Rejet"`.

Warnings you can meet:

- `Judilibre found no exact match and loosened the search: these results match only some of the words.`
- `Only the first 10 000 are reachable by paging; narrow the search to see the others.` (above 10 000 results)
- `(Only the first {n} of {m} hits of this page fit — use a smaller "page_size".)` (a page too long for one answer shows the first decisions that fit)

**No result.** `items` is empty and `warnings` holds one sentence naming your words and criteria: `No Judilibre decision matches "licenciement" with these criteria: all words, Cour de cassation.` It does not suggest another search.

**Page past the end.** The outcome is `no_results`, `items` is empty and `page` says which page you asked for and how many there are:

```
{
  …
  "outcome": "no_results",
  "warnings": [],
  "results": 1,
  "page": {
    "number": 6,
    "of": 1
  },
  …
  "next": null,
  "relaxed": false,
  "items": [],
  …
}
```

**Input errors.** These are refused with an error and no search is made:

- Blank `query`: `"query" is required: Judilibre finds nothing without search words. To look up a decision, use its pourvoi number or ECLI as the query.`
- Over 512 characters: `"query" is limited to 512 characters.`
- `chamber`, `formation`, `publication` or `solution` with another court than `cc`: `"chamber", "formation", "publication" and "solution" filter Cour de cassation decisions only (jurisdiction "cc"). For other courts, put the chamber or outcome words in "query".`
- `location` with `cc`: `"location" applies to courts of appeal and first-instance courts (jurisdiction ca, tj, tcom or cph).`
- Paging beyond the first 10 000 results: `Judilibre returns at most the first 10 000 results; narrow the search (dates, chamber, more precise words).`
- `date_from` after `date_to`, a date that is not real, or a `page_size` above 20.

**Source errors.** Credentials, quota, availability and the 45-second limit give error answers (`outcome: "error"`, with a `kind` and a `message`; see [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong)).

## Limits

> **Words combine as "all words" unless you say otherwise**
> Left to itself, Judilibre matches any of the words, which returns very large, noisy result sets (observed in November 2026: tens of thousands of decisions for a two-word query). Vigueur asks for all the words by default. Use `exact_phrase` for a fixed expression such as "forfait jours".

- **Number lookups.** A *pourvoi* number works in any spelling (observed in November 2026: `24-16.924`, `2416924`, `24-16924`, `n° 24-16.924`). Number and ECLI searches look in the Cour de cassation unless you set `jurisdiction`.
- **Appeal-court numbers (RG).** Observed in November 2026: with `jurisdiction` `ca`, a number such as `22/10744` also brings decisions that share only part of it (the same sequence number in another year, or the same year with another number). Check the numbers in the answer.
- **Filters that do not work at the source.** The `type` filter drops recent Cour de cassation decisions and the `theme` filter returned nothing even for a decision's own theme (both observed in November 2026), so Vigueur does not offer them. `search_in` `themes` is available. The source ignores a sort order unless told the direction; Vigueur always tells it.
- **Lower courts.** Judilibre does not mark chambers, formations, publications or outcomes of courts of appeal and first-instance courts as lists: they are free text, so those filters are `cc` only. Put the words in `query`. Court-of-appeal and tribunal judiciaire decisions seen in November 2026 carried no ECLI.
- **Reach.** Paging stops at the first 10 000 results, and pages hold at most 20 decisions here although the source accepts more.
- **Not in Judilibre.** Conseil d'État, Conseil constitutionnel, CNIL and the financial courts are in [`legifrance_search_case_law`](legifrance_search_case_law.md).
- Names of natural persons are pseudonymised by the source.
- Vigueur reports what Judilibre holds. It does not say which decision is the leading one.

See [Judilibre](../40-sources/02-judilibre.md) for coverage and behaviour of the source.

## Related

- [`judilibre_get_decision`](judilibre_get_decision.md): read one decision, whole or one part.
- [`judilibre_list_taxonomy`](judilibre_list_taxonomy.md): the keys the filters take.
- [`legifrance_search_case_law`](legifrance_search_case_law.md): the other case-law collections.
- [Case law](../20-using/03-case-law.md)
- [Judilibre](../40-sources/02-judilibre.md)
