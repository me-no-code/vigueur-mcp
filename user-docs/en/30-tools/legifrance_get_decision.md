---
title: legifrance_get_decision
level: reference
tags: [tool, legifrance, case-law, read]
summary: Read one decision from Légifrance by its id, with its identity, official link and full text, page by page.
updated: 2026-11-17
---

# legifrance_get_decision

Reads one decision held by Légifrance: its identity, its official link, the labels the source records and the full text, word for word.

## What you can ask

- "Lis la décision JURITEXT000053197030." / "Read decision JURITEXT000053197030."
- "Montre-moi le texte complet de la décision du Conseil constitutionnel trouvée plus haut." / "Show me the full text of the Conseil constitutionnel decision found above."
- "Continue la lecture de cette décision." / "Continue reading that decision." (Claude asks for the next page.)

You normally get the id from [`legifrance_search_case_law`](legifrance_search_case_law.md).

## What it takes

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `id` | Yes | The Légifrance decision id. | `JURITEXT`, `CETATEXT`, `CONSTEXT`, `CNILTEXT` or `JUFITEXT` followed by 12 digits, for example `JURITEXT000053197030`. Judilibre ids (24 hexadecimal characters) belong to [`judilibre_get_decision`](judilibre_get_decision.md). | none |
| `offset` | No | Where to continue a long text, in characters. The previous page says which value to use. | Whole number, 0 or more | 0 |

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpts here are indented, and `…` marks fields or text left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md).

`outcome` is `found` or `not_found`.

```
{
  "source": "Légifrance",
  "outcome": "found",
  "warnings": [
    "Same decision on Judilibre (usually earlier, with zones)."
  ],
  "id": "JURITEXT000053197030",
  "ecli": "ECLI:FR:CCASS:2025:SO01200",
  "link": "https://www.legifrance.gouv.fr/juri/id/JURITEXT000053197030",
  "title": "Cour de cassation, civile, Chambre sociale, 17 décembre 2025, 24-16.924, Inédit",
  "court": "Cour de cassation",
  "chamber": "Chambre sociale",
  "nature": "ARRET",
  "decided": "2025-12-17",
  "numbers": [
    "24-16.924"
  ],
  "publication": "Inédit",
  "solution": "Cassation",
  "legifrance_status": null,
  "published": null,
  "attacked": {
    "court": "Cour d'appel de Bordeaux",
    "decided": "2024-05-29"
  },
  "constitutional_council_link": null,
  "jo_link": null,
  "summary": null,
  "part": null,
  "next": null,
  "text": "LA COUR DE CASSATION, CHAMBRE SOCIALE, a rendu l'arrêt suivant :\nSOC.\nZB1\nCOUR DE CASSATIO…",
  "other_source": {
    "tool": "judilibre_search_decisions",
    "query": "ECLI:FR:CCASS:2025:SO01200"
  },
  "request": {
    "tool": "legifrance_get_decision",
    "id": "JURITEXT000053197030",
    "offset": 0
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

| Field | What it holds |
|---|---|
| `id`, `ecli`, `link` | The Légifrance id, the ECLI (`null` when there is none) and the official page, built by Vigueur from the id. |
| `title` | The title as Légifrance writes it, cut at 300 characters. |
| `court`, `chamber`, `nature` | The court, the chamber or formation and the nature of the decision, as the source states them; each `null` when not given. |
| `decided`, `numbers` | The decision date and the decision numbers. |
| `publication`, `solution` | How the source records the publication and the outcome; `null` when it gives none. |
| `legifrance_status`, `published` | For a CNIL deliberation, Légifrance's status label and the publication date; `null` otherwise. |
| `attacked` | The attacked decision (`court` and `decided` date), when the source states it; `null` otherwise. |
| `constitutional_council_link`, `jo_link` | For a Conseil constitutionnel decision, its page on conseil-constitutionnel.fr and its Journal officiel link; `null` otherwise. |
| `summary` | The summary ([*sommaire*](../00-intro/03-glossary.md)), cut when long; `null` when there is none and on every page after the first. |
| `part`, `next` | `null` when the text is whole. See "Long texts" below. |
| `text` | The text of the decision, verbatim. Names are pseudonymised by the source. |
| `other_source` | On the last page of a judicial decision with an ECLI, the call that finds the same decision on Judilibre; otherwise `null`. A warning says the same: `Same decision on Judilibre (usually earlier, with zones).` |

A Conseil constitutionnel decision fills its own fields:

```
{
  …
  "outcome": "found",
  …
  "id": "CONSTEXT000054952962",
  "ecli": "ECLI:FR:CC:2026:2026.1217.1218.QPC",
  "link": "https://www.legifrance.gouv.fr/cons/id/CONSTEXT000054952962",
  "title": "Décision 2026-1217/1218 QPC - 06 août 2026 - M. Bruno N. et M. Joseph A. [Absence d'indemn…",
  "court": "Conseil constitutionnel",
  …
  "nature": "QPC",
  "decided": "2026-08-06",
  "numbers": [
    "2026-1217/1218"
  ],
  …
  "solution": "Non conformité totale",
  …
  "constitutional_council_link": "https://www.conseil-constitutionnel.fr/decision/2026/20261217_1218QPC.htm",
  "jo_link": "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054633588",
  …
  "text": "LE CONSEIL CONSTITUTIONNEL A ÉTÉ SAISI le 17 juin 2026 par la Cour de cassation (chambre s…",
  …
}
```

**Long texts.** A page holds at most 40,000 characters. When the text is cut, `part` gives the characters shown (`from`, `to`, and `of`, the length of the text) and `next` gives `{ "offset": <number> }`, where the rest starts. When nothing is left, `next` is `null`. Ask Claude to continue, and it passes that offset. The identity fields repeat on every page; the summary appears on the first only.

**Not found.** This is a normal answer, not an error. The outcome is `not_found`, `id` repeats the id, and `warnings` says what to do:

```
{
  "source": "Légifrance",
  "outcome": "not_found",
  "warnings": [
    "No Légifrance decision with id \"JURITEXT000099999999\".",
    "Find decisions with legifrance_search_case_law.",
    …
  ],
  "id": "JURITEXT000099999999",
  …
}
```

The third warning, the coverage note, comes only for a `JURITEXT` id (see Limits).

**Input errors.**

- An id of the wrong shape: `"…" is not a Légifrance decision id (JURITEXT…, CETATEXT…, CONSTEXT…, CNILTEXT…, JUFITEXT… + 12 digits). Judilibre ids (24 hexadecimal characters) go to judilibre_get_decision.`
- An offset at or beyond the end of the text: `"offset" {offset} is past the end of the text ({length} characters).`

Source errors (credentials, quota, unavailable, no answer within 45 seconds) are error answers (`outcome: "error"`, with a `kind` and a `message`; see [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong)).

## Limits

> **The text is the source's, not Vigueur's**
> Légifrance's own text can carry encoding glitches (observed in November 2026: a stray character in place of a dash). Vigueur does not correct it.

- Only the five collections of [`legifrance_search_case_law`](legifrance_search_case_law.md) are read here. A decision absent from Légifrance, for example an unreasoned Cour de cassation rejection, is read on Judilibre.
- The official link is built from the id. Vigueur cannot check that the page opens: Légifrance's site refused automated checks (observed in November 2026).
- A long summary is cut to fit the page; the full summary is not available in pieces.
- Vigueur does not summarise, compare or interpret decisions.

## Related

- [`legifrance_search_case_law`](legifrance_search_case_law.md): find the id.
- [`judilibre_get_decision`](judilibre_get_decision.md): read the same Cour de cassation decision with its zones.
- [Case law](../20-using/03-case-law.md)
- [Légifrance](../40-sources/01-legifrance.md)
