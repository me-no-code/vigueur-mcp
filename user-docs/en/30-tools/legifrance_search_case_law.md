---
title: legifrance_search_case_law
level: reference
tags: [tool, legifrance, case-law, search]
summary: Search the decisions held by Légifrance (judicial, administrative, constitutional, CNIL and financial courts) and know what each answer shows and leaves out.
updated: 2026-11-17
---

# legifrance_search_case_law

Searches the case-law collections of Légifrance by words, decision number or ECLI, and lists the decisions found with their official link and the id to read each one.

## What you can ask

- "Trouve l'arrêt de la Cour de cassation n° 24-16.924." / "Find Cour de cassation decision 24-16.924."
- "Cherche les décisions du Conseil constitutionnel de 2026 sur les congés payés." / "Search Conseil constitutionnel decisions from 2026 about paid leave."
- "Quelles sont les dernières délibérations de la CNIL ?" / "What are the latest CNIL deliberations?"
- "Cherche les décisions publiées de la chambre sociale entre le 1er janvier et le 30 juin 2025." / "Find published social-chamber decisions between 1 January and 30 June 2025."

## What it takes

Only `collection` is required. With no other criterion, the tool lists the newest decisions of that collection.

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `collection` | Yes | Which collection to search. | `judicial` (Cour de cassation and some courts of appeal), `administrative` (Conseil d'État, cours administratives d'appel, tribunaux administratifs), `constitutional` (Conseil constitutionnel), `cnil` (CNIL deliberations), `financial` (Cour des comptes and the regional and territorial chambers of accounts) | none |
| `query` | No | Words to find in the decision. All the words must appear. | Free text | none |
| `number` | No | A decision number. A leading "n°" is dropped and the number is rewritten the way Légifrance holds it. | [Pourvoi](../00-intro/03-glossary.md) `24-16.924` or `2416924`; Conseil d'État `400000`; CNIL `2026-023`; Conseil constitutionnel `2026-1217` (a trailing nature such as `QPC` is dropped; joined decisions need the combined number `2026-1217/1218`); Cour des comptes `S-2026-1111` | none |
| `ecli` | No | A European Case Law Identifier. Judicial and administrative collections only. | For example `ECLI:FR:CCASS:2025:SO01200` | none |
| `date_from` | No | Earliest decision date. A blank value counts as absent. | `YYYY-MM-DD` | none |
| `date_to` | No | Latest decision date. Must not be before `date_from`. | `YYYY-MM-DD` | none |
| `court` | No | Level of court. Judicial collection only. | `cassation`, `appeal`, `first_instance` | none |
| `chamber` | No | Chamber of the Cour de cassation. Judicial collection only, and only with `court` `cassation` or no `court`. | `plenary`, `mixed`, `civ1`, `civ2`, `civ3`, `commercial`, `social`, `criminal` | none |
| `publication` | No | Published or not, as the source records it. Not available for `constitutional` and `cnil`. | `published`, `unpublished` | none |
| `sort` | No | Order of the results. | `relevance`, `newest` | `relevance` when you give `query`, `number` or `ecli`; `newest` otherwise |
| `page` | No | Page of results. | Whole number, 1 or more | 1 |
| `page_size` | No | Results per page. | Whole number, 1 to 20 | 10 |

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpts here are indented, and `…` marks text left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md). It always names its source: every decision carries its Légifrance `link` and the call that reads it in `read_with`, for [`legifrance_get_decision`](legifrance_get_decision.md).

`outcome` is `results`, or `no_results` when nothing matches or when you ask for a page past the last one.

```
{
  "source": "Légifrance",
  "outcome": "results",
  "warnings": [
    "Note: Légifrance does not hold every Cour de cassation decision (in particular not its unreasoned rejections and non-admissions, f…"
  ],
  "collection": "judicial",
  "results": 1,
  "page": {
    "number": 1,
    "of": 1
  },
  "order": "most_relevant_first",
  "next": null,
  "items": [
    {
      "title": "Cour de cassation, civile, Chambre sociale, 17 décembre 2025, 24-16.924, Inédit",
      "id": "JURITEXT000053197030",
      "court": "Cour de cassation",
      "chamber": "Chambre sociale",
      "nature": "arret",
      "decided": "2025-12-17",
      "numbers": [
        "24-16.924"
      ],
      "publication": "Inédit",
      "solution": "Cassation",
      "excerpt": null,
      "link": "https://www.legifrance.gouv.fr/juri/id/JURITEXT000053197030",
      "read_with": {
        "tool": "legifrance_get_decision",
        "id": "JURITEXT000053197030"
      }
    }
  ],
  "request": {
    "tool": "legifrance_search_case_law",
    "collection": "judicial",
    "number": "24-16.924",
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
| `collection` | The collection searched. |
| `results` | The number of decisions over all pages. |
| `page`, `next` | This page and the number of pages, and the next page (`{ "page": 2 }`, or `null`). |
| `order` | `most_relevant_first` or `newest_first`. |
| `items` | The decisions of this page. |

A decision holds:

| Field | What it holds |
|---|---|
| `title` | The title as Légifrance writes it, cut at 300 characters. |
| `id`, `link` | The Légifrance id and the official page, built by Vigueur from the id. |
| `court`, `chamber`, `nature` | The court, the chamber or formation and the nature of the act, as the source states them; each `null` when not given. |
| `decided`, `numbers` | The decision date and the decision numbers (several for joined decisions). |
| `publication`, `solution` | How the source records the publication and the outcome; `null` when it gives none. A decision without publication information shows `null`: Vigueur never writes "unpublished" for it. |
| `excerpt` | The matching passage when Légifrance gives one, cut at 700 characters; otherwise `null`. |
| `read_with` | The call that returns the full decision. |

For the judicial collection, `warnings` carries the coverage note shown above.

- The number you searched is echoed in `request`, after rewriting: a number typed as `2416924` appears as `24-16.924`.
- A page too long for one answer shows the first decisions that fit, and a warning says `(Only the first {n} of {m} hits of this page fit — use a smaller "page_size".)`.

**No result.** `items` is empty and `warnings` names the collection and the criteria. For the judicial collection it repeats the coverage note. For example, `No Conseil constitutionnel (CONSTIT) decision on Légifrance matches these criteria: n° 2026-1217.` followed, for a Conseil constitutionnel number without a `/`, by `Joined decisions carry a combined number such as "2026-1217/1218"; give the full number, or search by words with "query".`

**Page past the end.** The outcome is `no_results` and `page` says which page you asked for and how many there are:

```
{
  …
  "outcome": "no_results",
  "warnings": [
    "Note: Légifrance does not hold every Cour de cassation decision (in pa…"
  ],
  …
  "results": 1,
  "page": {
    "number": 99,
    "of": 1
  },
  …
  "next": null,
  "items": [],
  …
}
```

**Input errors.** Some combinations are refused with an error and no search is made:

- `"ecli" works for the judicial and administrative collections. For the Conseil constitutionnel, use "number" (e.g. "2026-1217/1218").`
- `"court" and "chamber" apply to the judicial collection only.`
- `"chamber" applies to Cour de cassation decisions (court "cassation").`
- `"publication" is not available for the Conseil constitutionnel (CONSTIT) collection.` (same wording for `cnil`)
- `"date_from" must not be after "date_to".`
- A value that is not a real date, or a `page_size` above 20, is refused too.

**Source errors.** When PISTE or Légifrance cannot answer, you get an error answer (`outcome: "error"`, with a `kind` and a `message`; see [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong)): credentials rejected, access refused (HTTP 403, for example when the API is not subscribed on your PISTE application), quota reached, service unavailable, or no answer within 45 seconds. Each says what to do, and most point to [`vigueur_status`](vigueur_status.md).

## Limits

> **Légifrance does not hold every decision**
> Légifrance holds part of the Cour de cassation's decisions. It does not hold unreasoned rejections and non-admissions, it receives the decisions it does hold weeks after Judilibre, and it holds no appeal-court decisions after early 2023. For a recent, unreasoned or appeal-court decision, ask for [`judilibre_search_decisions`](judilibre_search_decisions.md). "Not found here" is not proof that a decision does not exist.

- Words are searched as "all the words". There is no "any word" or "exact phrase" choice here; Judilibre's search has one.
- No filter for Conseil d'État versus cours administratives d'appel versus tribunaux administratifs: the source failed when asked (observed in November 2026), so Vigueur does not offer it.
- `sort` cannot be "oldest first".
- The search lists decisions and excerpts only. Summaries, attacked decisions and the full text come with [`legifrance_get_decision`](legifrance_get_decision.md).
- An answer is capped at 40,000 characters.
- Vigueur reports what Légifrance holds. It does not rank decisions by importance or tell you which one applies.

See [Légifrance](../40-sources/01-legifrance.md) for how each collection behaves.

## Related

- [`legifrance_get_decision`](legifrance_get_decision.md): read one decision found here.
- [`judilibre_search_decisions`](judilibre_search_decisions.md): search the Cour de cassation and lower courts directly.
- [Case law](../20-using/03-case-law.md): the guide to asking about decisions.
- [Légifrance](../40-sources/01-legifrance.md): what the source holds.
