---
title: judilibre_get_decision
level: reference
tags: [tool, judilibre, case-law, read]
summary: Read one Judilibre decision, whole or by part (zone), with its summary, visa and attacked decision, page by page.
updated: 2026-11-17
---

# judilibre_get_decision

Reads one decision from Judilibre: its identity, official link, the labels and summary the source records, and the full text word for word. For a Cour de cassation decision, it can return one part of the text only.

## What you can ask

- "Lis l'arrêt trouvé ci-dessus." / "Read the decision found above."
- "Montre-moi seulement le dispositif de cet arrêt." / "Show me only the operative part ([*dispositif*](../00-intro/03-glossary.md)) of this decision."
- "Quelle est la décision attaquée ?" / "What is the attacked decision?"
- "Continue la lecture." / "Continue reading." (Claude asks for the next page.)

You normally get the id from [`judilibre_search_decisions`](judilibre_search_decisions.md), or from the `attacked` field of another decision.

## What it takes

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `id` | Yes | The Judilibre decision id. | 24 hexadecimal characters. Légifrance ids (`JURITEXT…`) belong to [`legifrance_get_decision`](legifrance_get_decision.md). | none |
| `zone` | No | Return only this part of the decision, when the source marks zones. | `introduction`, `expose`, `moyens`, `motivations`, `dispositif`, `annexes` | the full text |
| `offset` | No | Where to continue a long text, in characters. The previous page says which value to use. | Whole number, 0 or more | 0 |

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpts here are indented, and `…` marks text left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md).

`outcome` is `found` or `not_found`.

```
{
  "source": "Judilibre",
  "outcome": "found",
  "warnings": [
    "Same decision on Légifrance (when it holds it, usually weeks later)."
  ],
  "id": "6a0e9ff1cdc6046d47668703",
  "ecli": "ECLI:FR:CCASS:2026:C210500",
  "link": "https://www.courdecassation.fr/decision/6a0e9ff1cdc6046d47668703",
  "title": "Cour de cassation, Deuxième chambre civile — decision of 2026-05-21 — n° 23-20.348 — ECLI:…",
  "jurisdiction": "cc",
  "location": null,
  "chamber": "Deuxième chambre civile",
  "decided": "2026-05-21",
  "numbers": [
    "23-20.348"
  ],
  "formation": "Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)",
  "publication": [],
  "solution": "Rejet non spécialement motivé",
  "source_updated": "2026-05-29",
  "attacked": {
    "title": "Cour d'appel de Paris, B1",
    "number": "22/10744",
    "decided": "2023-06-22",
    "read_with": {
      "tool": "judilibre_get_decision",
      "id": "64953aa7aa086705db6f12ef"
    }
  },
  "summary": null,
  "titles": [],
  "visa": [],
  "rapprochements": [],
  "files": [],
  "zones": [
    "introduction",
    "motivations",
    …
  ],
  "zone": null,
  "part": null,
  "next": null,
  "text": "CIV. 2\n \n MC22\n \n \n \n COUR DE CASSATION\n ______________________\n \n \n Arrêt du 21 mai 2026…",
  "other_source": {
    "tool": "legifrance_search_case_law",
    "collection": "judicial",
    "ecli": "ECLI:FR:CCASS:2026:C210500"
  },
  "request": {
    "tool": "judilibre_get_decision",
    "id": "6a0e9ff1cdc6046d47668703",
    "offset": 0
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

| Field | What it holds |
|---|---|
| `id`, `ecli`, `link` | The Judilibre id, the ECLI (`null` when there is none) and the official page, built by Vigueur from the id. |
| `title` | One line with the court, chamber, decision date, numbers and ECLI. |
| `jurisdiction`, `location`, `chamber` | Judilibre's key for the jurisdiction (`cc`, `ca`, `tj`, `tcom`, `cph`), the court within it, and the chamber; `location` and `chamber` are `null` when not given. |
| `decided`, `numbers`, `source_updated` | The decision date, the decision numbers, and the date Judilibre last updated the decision (`null` when not given). |
| `formation`, `publication`, `solution` | The formation, how the Cour de cassation published the decision (a list, empty when it is not published in the Bulletin) and the outcome. |
| `attacked` | The decision attacked: its `title`, `number`, `decided` date, and `read_with`, the call that reads it when Judilibre holds it (otherwise `null`). `null` when the source does not state it. |
| `summary`, `titles`, `visa`, `rapprochements`, `files` | The summary (*sommaire*), its titles, the *visa*, the *rapprochements* and the attached files (`name`, `type`, `link`). They are given on the first page only: on every later page the summary is `null` and the lists are empty. |
| `zones` | The zones the source marks in the text; empty when none. |
| `zone` | The zone the text shown is limited to; `null` for the whole decision. |
| `part`, `next` | `null` when the text is whole. See "Long texts" below. |
| `text` | The text of the decision, verbatim. Names are pseudonymised by the source. |
| `other_source` | On the last page of a Cour de cassation decision with an ECLI, the call that finds the same decision on Légifrance; otherwise `null`. A warning says the same: `Same decision on Légifrance (when it holds it, usually weeks later).` |

**Zones.** The source marks up the Cour de cassation's decisions in parts: `introduction`, `expose`, `moyens`, `motivations`, `dispositif` and sometimes `annexes`. Ask for one with `zone`; `zone` in the answer then names it and `text` holds that part. When a part appears in several places of the text, the pieces are joined by a line holding `[…]`.

```
{
  …
  "outcome": "found",
  "warnings": [
    "Same decision on Légifrance (when it holds it, usually weeks later)."
  ],
  …
  "zones": [
    "introduction",
    "motivations",
    …
  ],
  "zone": "dispositif",
  "part": null,
  "next": null,
  "text": "PAR CES MOTIFS, la Cour :\n \n REJETTE le pourvoi ;\n \n Condamne La Maison de poésie aux dépe…",
  "other_source": {
    "tool": "legifrance_search_case_law",
    "collection": "judicial",
    "ecli": "ECLI:FR:CCASS:2026:C210500"
  },
  …
}
```

**When the zone you asked for is missing**, the whole text is shown and a warning says why, in one of these ways:

- `This decision has no "motivations" zone; showing the full text.` (the decision has zones, but not that one)
- `This decision has no zone markup, so no "motivations" zone; showing the full text.`

Without `zone`, a decision with no markup says `This decision has no zone markup; showing the full text.`

**Long texts.** A page holds at most 40,000 characters. When the text is cut, `part` gives the characters shown (`from`, `to`, and `of`, the length of the text) and `next` gives `{ "offset": <number> }`, where the rest starts. When nothing is left, `next` is `null`. Ask Claude to continue, and it passes that offset. Paging works inside a zone too. Long lists on the first page (visa, rapprochements, files) show up to 30 items and then a warning such as `Files: (+3 more)`; when the head of the page would crowd out the text, Vigueur shortens the lists and the summary first.

**Not found.** This is a normal answer, not an error. The outcome is `not_found`, `id` repeats the id, and `warnings` says what to do:

```
{
  "source": "Judilibre",
  "outcome": "not_found",
  "warnings": [
    "No Judilibre decision with id \"000000000000000000000000\".",
    "Find decisions with judilibre_search_decisions (a pourvoi number or ECLI works as the query)."
  ],
  "id": "000000000000000000000000",
  …
}
```

**Input errors.**

- An id of the wrong shape: `"…" is not a Judilibre decision id (24 hexadecimal characters). Légifrance ids (JURITEXT…, CETATEXT…) go to legifrance_get_decision.`
- An offset at or beyond the end of the text: `"offset" {offset} is past the end of the text ({length} characters).`

Source errors (credentials, quota, unavailable, no answer within 45 seconds) are error answers (`outcome: "error"`, with a `kind` and a `message`; see [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong)).

## Limits

> **Not every decision has zones**
> Decisions that carry no markup show their full text even when you ask for a zone. In observed answers (November 2026), an unpublished decision and an old Bulletin decision had none, and the court-of-appeal decision observed had zones but no `moyens` zone.

- The official link is built from the id. Vigueur cannot check that the page opens: the Cour de cassation's site refused automated checks (observed in November 2026).
- The text is the source's. Zones mark parts of it; Vigueur does not rewrite or summarise it.
- Vigueur reports what Judilibre records. It does not tell you what a decision means for your case.

## Related

- [`judilibre_search_decisions`](judilibre_search_decisions.md): find the id.
- [`legifrance_get_decision`](legifrance_get_decision.md): the same Cour de cassation decision as Légifrance holds it, and the other courts.
- [Case law](../20-using/03-case-law.md)
- [Judilibre](../40-sources/02-judilibre.md)
