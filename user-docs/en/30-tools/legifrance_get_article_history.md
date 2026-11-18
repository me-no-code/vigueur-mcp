---
title: legifrance_get_article_history
level: reference
tags: [tool, legifrance, article, history]
summary: List every version of a code article with its dates and the texts that created, amended or repealed it.
updated: 2026-11-18
---

# legifrance_get_article_history

Lists every version of a French code article on Légifrance, with its validity dates and status, the texts that created, amended or repealed it, and where Légifrance records that its content moved when articles were renumbered.

## What you can ask

- "Quelles sont les versions successives de l'article 1382 du Code civil ?" / "List the successive versions of article 1382 of the Code civil."
- "Quels textes ont modifié l'article L1234-1 du Code du travail ?" / "Which texts amended article L1234-1 of the Code du travail?"
- "Que devient l'ancien article 1382 ?" / "Where did the old article 1382 go?"

## What it takes

Give either a code and an article number, or a Légifrance id. A blank value counts as not given.

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `code` | No | The code to look in. | The code's title, such as `Code civil` or `Code du travail`. | Every code |
| `number` | Yes, unless you give `id` | The article number as people cite it. | `1240`, `L1234-1`, `L. 1234-1`. Not together with `id`. | None |
| `id` | Yes, unless you give `number` | The Légifrance id of one version of the article. | `LEGIARTI` (a code or law article) or `KALIARTI` (a collective agreement article), followed by 12 digits. Not together with `number`. | None |
| `page` | No | Which page of the events list to show. The answer says when there is a next page. | A whole number, 1 or more | 1 |
| `response_format` | No | How much to show. | `concise`, or `detailed` (adds the id of each amending article) | `concise` |

The history is always built as of today: there is no date parameter.

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpt here is indented, and `…` marks items left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md).

The `outcome` is `found`, `no_results` (a page past the last one), `several_matches` or `not_found`.

```
{
  "source": "Légifrance",
  "outcome": "found",
  "warnings": [],
  "code": "Code civil",
  "number": "1382",
  "link": "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042379",
  "on": "2026-11-16",
  "current": {
    "id": "LEGIARTI000032042379",
    "version": "2.0",
    "from": "2016-10-01",
    "until": null,
    "until_undetermined": false
  },
  "versions": [
    {
      "id": "LEGIARTI000006438819",
      "version": "1.0",
      "legifrance_status": "MODIFIE",
      "from": "1804-03-21",
      "until": "2016-10-01",
      "until_undetermined": false
    },
    {
      "id": "LEGIARTI000032042379",
      "version": "2.0",
      "legifrance_status": "VIGUEUR",
      "from": "2016-10-01",
      "until": null,
      "until_undetermined": false
    }
  ],
  "results": 3,
  "page": {
    "number": 1,
    "of": 1
  },
  "next": null,
  "items": [
    {
      "date": "1804-03-21",
      "date_undetermined": false,
      "action": "created",
      "by": "Un texte d’une portée générale",
      "by_article_id": null,
      "scheduled": false
    },
    {
      "date": "2016-10-01",
      "date_undetermined": false,
      "action": "amended",
      "by": "Ordonnance n°2016-131 du 10 février 2016 - art. 4",
      "by_article_id": null,
      "scheduled": false
    },
    …
  ],
  "concordance": {
    "moved": [
      {
        "version": "1.0",
        "from": "1804-03-21",
        "until": "2016-10-01",
        "to": [
          "Code civil - art. 1240 (V)"
        ]
      }
    ],
    "came_from": [
      "Code civil - art. 1353 (M)"
    ]
  },
  …
}
```

| Field | What it holds |
|---|---|
| `code`, `number` | The code's title and the article number. |
| `link` | The official page of the version in force today, else of the latest version; `null` when there is no version. |
| `on` | Today: the date `current` and `scheduled` are computed for. |
| `current` | The version whose validity dates cover `on`, computed from the dates. `null` when no version is in force today. |
| `versions` | Every version of the article, oldest start first (versions with no known start last). Each has Légifrance's version number, its own label, and `from`, `until` and `until_undetermined` as in [`legifrance_get_article`](legifrance_get_article.md). |
| `results`, `page`, `next` | The number of events over all pages, this page and the number of pages, and the next page (`{ "page": 2 }`, or `null`). |
| `items` | The events of this page, in date order: the texts that created, amended or repealed the article. |
| `concordance` | Légifrance's records of moved content. |

Details:

- **Events.** `date` is the day the change took effect. `action` is one of `created`, `amended`, `repealed`, `codified`, `transferred` or `linked`. `by` is the title of the amending text. `scheduled` is `true` for an event dated after today. When Légifrance has not determined a date, `date` is `null` and `date_undetermined` is `true`. `by_article_id` is the id of the amending article in a `detailed` answer and `null` in a `concise` one.
- **Concordance.** `moved` says where a version's content went (`to`); `came_from` lists the articles whose content is now at this number. The labels in brackets, such as `(V)`, are Légifrance's own. Concordance is read for the first version and for the current (or latest) one only, so links of intermediate versions are not shown.
- **Long histories.** A page holds at most 100 events, fewer if the lines are long. Every page repeats the identity fields, `versions` and `concordance`. When there is more, `next` is `{ "page": 2 }`. A page past the last one answers `no_results` with no `items`, and `page` says which page you asked for and how many there are.
- **Warnings.** If the concordance cannot be read, the history is still given with the warning `Could not read Légifrance's concordance of <id> (<reason>).`

### Not found, several codes, unknown code

These answers are identical to those of [`legifrance_get_article`](legifrance_get_article.md): `several_matches` lists the codes holding the number, and `not_found` carries the same `reason` (`unknown_id`, `no_article`, `unknown_code`) and `did_you_mean` suggestions.

### A repealed article

An article not in force today still has a history: the answer is built from its latest period, and `current` is `null`. If the number's periods span several codes and you gave no code, you get the list of candidates instead.

### Errors

The same input errors as `legifrance_get_article` apply: a missing number and id, both given, an id with the wrong shape. Other errors are the same for every tool; see [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md).

## Limits

> **Dates are entry-into-force dates.** An event's date is when a change took effect, not when the amending text was published.

- It shows the versions and the amending texts, not the wording of each older version. To read an old version, use [`legifrance_get_article`](legifrance_get_article.md) with `at_date`.
- It cannot be read as of another date than today.
- For all the changes of a whole code or text over a period, use [`legifrance_list_changes`](legifrance_list_changes.md).

## Related

- [`legifrance_get_article`](legifrance_get_article.md): read one version.
- [`legifrance_list_changes`](legifrance_list_changes.md): changes across a code or text.
- [Codes, laws and decrees](../20-using/02-legislation.md)
- [The Journal officiel and tracking changes](../20-using/04-journal-officiel.md)
