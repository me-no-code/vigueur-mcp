---
title: legifrance_list_reference_values
level: reference
tags: [tool, legifrance, reference, codes, natures, emitters]
summary: List the codes, text natures and emitters you can use as filters in the other Légifrance tools.
updated: 2026-11-16
---

# legifrance_list_reference_values

Lists the values the other Légifrance tools accept as filters: every French code with its id, the natures of texts published in the *Journal officiel*, or the ministries and authorities that published there. Check here before filtering, because names change with governments.

## What you can ask

- "Quels codes sont disponibles ?" / "Which codes are available?"
- "Quelles natures de textes paraissent au Journal officiel ?" / "Which kinds of texts does the Journal officiel publish?"
- "Quels ministères ont publié au Journal officiel depuis le 1er janvier 2026 ?" / "Which ministries have published in the Journal officiel since 2026-01-01?"

## What it takes

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `kind` | Yes | Which list. | `codes` (every code with its status and id, for the `code` parameter), `jorf_natures` (kinds of texts published in the Journal officiel, for nature filters), `jorf_emitters` (ministries and authorities that published in the Journal officiel) | None |
| `since` | No | For `jorf_natures` and `jorf_emitters`: start of the publication window. It cannot be after today. | A real date as `YYYY-MM-DD` (publication date) | One year before today |

`since` has no effect on `codes`.

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpts here are indented, and `…` marks items left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md). The `outcome` is always `results`.

| Field | What it holds |
|---|---|
| `kind` | Which list: `codes`, `jorf_natures` or `jorf_emitters`. |
| `since` | The start of the publication window of the counts; `null` for codes. |
| `results` | The number of values in the list. |
| `omitted` | The number of values left out because the answer would be too long (0 when none). |
| `items` | The values. Codes are sorted by title, the Journal officiel values by count, most frequent first. |

Each item holds `value` (spelled as Légifrance spells it), `id` and `status` (for a code; `null` for a Journal officiel value) and `count` (for a Journal officiel value; `null` for a code).

Codes, with Vigueur's status word and the Légifrance id. The list of codes is served from the memory of Vigueur, and `cached` says when it was fetched. Repealed codes are listed with their status (`repealed`):

```
{
  "source": "Légifrance",
  "outcome": "results",
  …
  "kind": "codes",
  "since": null,
  "results": 108,
  "omitted": 0,
  "items": [
    {
      "value": "Code civil",
      "id": "LEGITEXT000006070721",
      "status": "in_force",
      "count": null
    },
    {
      "value": "Code de commerce",
      "id": "LEGITEXT000005634379",
      "status": "in_force",
      "count": null
    },
    {
      "value": "Code de commerce (ancien)",
      "id": "LEGITEXT000006069441",
      "status": "repealed",
      "count": null
    },
    …
  ],
  …
  "cached": [
    {
      "what": "Légifrance code list",
      "retrieved": "2026-11-16T10:42:07Z"
    }
  ],
  …
}
```

Natures, each with the number of texts published in the window. Emitters have the same shape (`"value": "Ministère de la justice"` and its `count`). Counts are of texts in the Journal officiel since `since`, by publication date:

```
{
  …
  "outcome": "results",
  …
  "kind": "jorf_natures",
  "since": "2025-11-16",
  "results": 24,
  "omitted": 0,
  "items": [
    {
      "value": "ARRETE",
      "id": null,
      "status": null,
      "count": 44158
    },
    {
      "value": "DECRET",
      "id": null,
      "status": null,
      "count": 10413
    },
    {
      "value": "AVIS",
      "id": null,
      "status": null,
      "count": 9653
    },
    …
  ],
  …
}
```

### Errors

An error answer is a JSON object with `outcome: "error"` and an `error` holding a `kind` and a `message` (see [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong)). Those specific to this tool:

- `"since" (<date>) is after today (<today>).`
- A `since` that is not a real date, or a `kind` outside the three values, is refused.

Other errors are the same for every tool; see [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md).

## Limits

- The values are those Légifrance and the Journal officiel show: spelling, capitals and wording are theirs. Emitter names differ between governments, so an old ministry name may appear alongside the current one.
- Natures and emitters are those Légifrance reports for texts published since `since`.
- Only the `jorf_*` lists are tied to a date window. The list of codes includes repealed codes.

## Related

- [`legifrance_latest_jo`](legifrance_latest_jo.md): uses the natures and emitters.
- [`legifrance_get_article`](legifrance_get_article.md), [`legifrance_browse_code`](legifrance_browse_code.md): use code titles.
- [`legifrance_search_legislation`](legifrance_search_legislation.md): uses code titles and natures.
- [Codes, laws and decrees](../20-using/02-legislation.md)
