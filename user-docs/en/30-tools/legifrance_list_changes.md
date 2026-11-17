---
title: legifrance_list_changes
level: reference
tags: [tool, legifrance, changes, amendments]
summary: List what changed in a code, or in a law or decree, between two dates, grouped by the amending text.
updated: 2026-11-17
---

# legifrance_list_changes

Lists what changed in a French code, or in one law or decree, between two dates on Légifrance: articles created, amended, repealed, codified or transferred, grouped by the text that made the change.

## What you can ask

- "Qu'est-ce qui a changé dans le Code du travail depuis le 1er janvier 2026 ?" / "What changed in the Code du travail since 2026-01-01?"
- "Quelles modifications la loi 78-17 a-t-elle connues en 2025 ?" / "What changes did loi 78-17 go through in 2025?"
- "Quels articles du Code civil vont changer prochainement ?" / "Which Code civil articles are due to change soon?" (entries dated after today are marked as scheduled)

## What it takes

Give exactly one of `code` or `text`, and a start date.

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `code` | One of `code` or `text` | The code to follow. Not together with `text`. | A code title such as `Code du travail` or `Code civil` | None |
| `text` | One of `code` or `text` | The law, ordinance, decree or order to follow. Not together with `code`. | `loi 78-17`, `décret 2019-1088`, a NOR such as `JUSX1234567A`, or a `LEGITEXT…` or `JORFTEXT…` id. Natures: loi, loi organique, ordonnance, décret, arrêté. | None |
| `since` | Yes | Start of the range. It is an entry-into-force date. | A real date as `YYYY-MM-DD` | None |
| `until` | No | End of the range. | A real date as `YYYY-MM-DD`, not before `since` | Today (date in Paris) |
| `page` | No | Which page of the list. At most 100 entries per page, fewer when the entries are long; the answer gives the next page. | A whole number, 1 or more | 1 |

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpt here is indented, and `…` marks items left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md).

`outcome` is `results`, or `no_results` when nothing was recorded in the range, or when you ask for a page past the last one.

```
{
  "source": "Légifrance",
  "outcome": "results",
  "warnings": [],
  "target": "code",
  "title": "Code civil",
  "id": "LEGITEXT000006070721",
  "link": "https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721",
  "since": "2025-01-01",
  "until": "2026-12-31",
  "results": 33,
  "amending_texts": 24,
  "scheduled": 1,
  "undetermined_versions": 0,
  "page": {
    "number": 1,
    "of": 1
  },
  "next": null,
  "items": [
    {
      "amended_by": "LOI n°2025-391 du 30 avril 2025 - art. 16 (V)",
      "entries": [
        {
          "date": "2025-05-03",
          "action": "created",
          "article": "1254",
          "section": "Chapitre V : Sanction civile en cas de faute dolosive ayant causé des dommages sériels",
          "article_id": "LEGIARTI000051541660",
          "amending_article_id": "LEGIARTI000051540827",
          "scheduled": false
        }
      ]
    },
    {
      "amended_by": "LOI n°2025-412 du 12 mai 2025 - art. unique",
      "entries": [
        {
          "date": "2025-05-14",
          "action": "amended",
          "article": "2493",
          "section": "Titre Ier : Dispositions relatives au livre Ier",
          "article_id": "LEGIARTI000051583944",
          "amending_article_id": "LEGIARTI000051583822",
          "scheduled": false
        },
        {
          "date": "2025-05-14",
          "action": "amended",
          "article": "2495",
          "section": "Titre Ier : Dispositions relatives au livre Ier",
          "article_id": "LEGIARTI000051583934",
          "amending_article_id": "LEGIARTI000051583822",
          "scheduled": false
        }
      ]
    },
    …
  ],
  …
}
```

| Field | What it holds |
|---|---|
| `target`, `title`, `id`, `link` | What changed: `code` or `text`, its title, its Légifrance id and its official page. |
| `since`, `until` | The range, as entry-into-force dates. |
| `results`, `amending_texts`, `scheduled` | The number of entries over all pages, the number of amending texts, and how many entries are dated after today (not yet in force). |
| `undetermined_versions` | The number of versions in the range whose entry-into-force date Légifrance leaves undetermined. They are not listed. |
| `page`, `next` | This page and the number of pages, and the next page (`{ "page": 2 }`, or `null`). |
| `items` | One group per amending text. |

Each group in `items` holds `amended_by` (the title of the amending text) and `entries`, the changes that text made. An entry holds:

| Field | What it holds |
|---|---|
| `date` | The entry-into-force date, not the publication date. |
| `action` | `created`, `amended`, `repealed`, `codified`, `transferred` or `linked`. |
| `article`, `section` | The article number and the title of its section, each `null` when not given. |
| `article_id`, `amending_article_id` | The Légifrance ids of the article and of the amending article, each `null` when not given. |
| `scheduled` | `true` when the date is after today. |

Details:

- **Groups.** Groups are ordered by the date of their first entry. The same amending text can appear on several pages when its entries are split.
- **Empty range.** `results` is `0` and `items` is empty.
- **Notes.** When some versions have an entry-into-force date that Légifrance leaves undetermined, `undetermined_versions` counts them and a warning says so (`<n> versions in this range have an entry-into-force date Légifrance leaves undetermined and are not listed.`). When Légifrance has not loaded the version detail for some years, a warning says `Légifrance has not loaded the version detail for <years>: changes of those years may be missing.`
- **Paging.** A page holds at most 100 entries, fewer if the entries are long, and `next` is `{ "page": 2 }` when there is more. A page past the last answers `no_results`, and `page` says which page you asked for and how many there are.

### Errors

An error answer is a JSON object with `outcome: "error"` and an `error` holding a `kind` and a `message` (see [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong)). Those specific to this tool:

- `Give exactly one of "code" (a code title) or "text" (a law or decree).`
- `"until" (<date>) is before "since" (<date>).`
- `Unknown code "<code>". Did you mean: <titles>?` or `Unknown code "<code>". Use the exact title of a code, e.g. "Code du travail". For a law or decree, use "text".`
- `Cannot read "<text>" as a text. Accepted: …` followed by the accepted forms.
- `No text found for "<text>". Check the number, nature or id.`
- When the text is not unique, the error lists the candidates with their ids and asks for the `LEGITEXT` id or the NOR. The same kind of list comes back for a number carried only by texts of another nature (give the `LEGITEXT` id of the one you mean), and for texts not in force today that cannot be told apart (give the `JORFTEXT` id or the NOR).

Other errors are the same for every tool; see [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md).

## Limits

> **Dates are entry-into-force dates, not publication dates.** To list what the Journal officiel published on a date, use [`legifrance_latest_jo`](legifrance_latest_jo.md).

- It lists changes; it does not show the wording before or after. For one article's versions use [`legifrance_get_article_history`](legifrance_get_article_history.md), and to read an article on a date use [`legifrance_get_article`](legifrance_get_article.md).
- Versions whose entry-into-force date Légifrance leaves undetermined are not listed, and the answer says how many.
- Years for which Légifrance has not loaded the version detail may be missing, and the answer names them.
- Collective agreements are not supported.

## Related

- [`legifrance_get_article_history`](legifrance_get_article_history.md)
- [`legifrance_get_text`](legifrance_get_text.md)
- [`legifrance_latest_jo`](legifrance_latest_jo.md)
- [The Journal officiel and tracking changes](../20-using/04-journal-officiel.md)
