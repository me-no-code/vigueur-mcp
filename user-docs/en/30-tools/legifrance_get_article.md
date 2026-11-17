---
title: legifrance_get_article
level: reference
tags: [tool, legifrance, article, code]
summary: Read one article of a French code on a given date, and see whether it was in force then and where its content moved.
updated: 2026-11-17
---

# legifrance_get_article

Reads one article of a French code (Code civil, Code du travail…) from Légifrance, as it stood on a date you choose. The answer says whether the article was in force on that date, where it sits in the code, and links to the official page.

## What you can ask

- "Donne-moi l'article L1234-1 du Code du travail." / "Show me article 1240 of the Code civil."
- "Quel était le texte de l'article 1382 du Code civil au 1er janvier 2015 ?" / "What did article 1382 of the Code civil say on 2015-01-01?"
- "L'article 1240 était-il en vigueur à la date de signature du contrat, le 12 mars 2012 ?" / "Was article 1240 in force when the contract was signed on 2012-03-12?"
- "Montre-moi l'article 1240 et les articles qui l'entourent." / "Show me article 1240 and its neighbours."

## What it takes

Give either a code and an article number, or a Légifrance id. Everything else is optional. A blank value counts as not given.

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `code` | No | The code to look in. Ignored when you give an `id`. | The code's title, such as `Code civil` or `Code du travail`. Common abbreviations work, for example `C. trav.`, `C. civ.`, `CGI`, `CPC`. | Every code |
| `number` | Yes, unless you give `id` | The article number as people cite it. | `1240`, `L1234-1`, `L. 1234-1`, `199 undecies B`. A leading "article" or "art." is dropped. Not together with `id`. | None |
| `id` | Yes, unless you give `number` | The Légifrance id of one article version. | `LEGIARTI` followed by 12 digits (a code article), or `KALIARTI` followed by 12 digits (a collective agreement article). Not together with `number`. | None |
| `at_date` | No | The date at which to read the article. It can be in the past or in the future. | A real date as `YYYY-MM-DD` | Today (date in Paris) |
| `response_format` | No | How much to show. | `concise` or `detailed` (adds every version, the amending texts and the number of texts citing the article) | `concise` |
| `offset` | No | Continues a long article text from a character position. The answer gives the value to use. | A whole number, 0 or more | 0 |
| `include_neighbours` | No | Also shows the previous and next article of the same section. | `true` or `false` | `false` |

If you give a code that is not a known title, nothing is searched: see "Not found" below.

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpts here are indented so you can read them, and `…` marks fields or text left out. Every field listed for the kind of answer is always there: a field the source gives no value for reads `null` (or `[]` for a list), so a missing value is never hidden. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md).

The `outcome` says which kind of answer you got: `found`, `not_in_force`, `several_matches` or `not_found`.

### An article found (`found`)

```
{
  "source": "Légifrance",
  "outcome": "found",
  "warnings": [],
  "id": "LEGIARTI000032041571",
  "link": "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571",
  "status": {
    "state": "in_force",
    "on": "2026-11-16",
    "from": "2016-10-01",
    "until": null,
    "until_undetermined": false
  },
  "legifrance_status": "VIGUEUR",
  "code": "Code civil",
  …
  "number": "1240",
  "section": [
    "Livre III : Des différentes manières dont on acquiert la propriété",
    "Titre III : Des sources d'obligations",
    …
  ],
  …
  "relocation": null,
  …
  "part": null,
  "next": null,
  "text": "Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige…",
  "request": {
    "tool": "legifrance_get_article",
    "code": "Code civil",
    "number": "1240",
    "at_date": "2026-11-16",
    "response_format": "concise",
    "offset": 0,
    "include_neighbours": false
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

| Field | What it holds |
|---|---|
| `id`, `link` | The Légifrance id of this version of the article, and the official page. Vigueur builds the link from the id. |
| `status` | Whether this version applied on `status.on` (see below). |
| `legifrance_status` | Légifrance's own label (`VIGUEUR`, `MODIFIE`, `ABROGE`…), or `null`. |
| `code`, `code_id`, `number` | The code's title and id, and the article number. |
| `section`, `section_id` | The titles from the code's outermost part down to the section holding the article, and that section's id. |
| `note` | Légifrance's note on the article, or `null`. |
| `relocation` | A sentence saying where the content moved or whether it changed (see below), or `null`. |
| `neighbours` | `null` unless you asked for them: see below. |
| `versions`, `modifications`, `cited_by` | `null` in a `concise` answer; filled in a `detailed` one: see below. |
| `part`, `next` | `null` when the text is whole. See "A long article" below. |
| `text` | The official text of the version. Empty when Légifrance has none. |

`status` is computed from the version's validity dates, not from Légifrance's label:

| `status.state` | Meaning |
|---|---|
| `in_force` | The dates cover the day `on`. |
| `not_in_force` | The version ended before `on`. |
| `not_yet_in_force` | The version starts after `on`. |
| `never_applied` | The version was never in force. |

`from` is the version's first day and `until` the day it ends, not included (the first day it no longer applies), each `null` when Légifrance gives none. `until_undetermined` is `true` when Légifrance records an end (a repeal) whose date it has not set. `on` is the date you asked for, today by default.

When a later version of the article exists, or the version shown has ended, `relocation` says whether its content was amended or moved. When Légifrance records a move, the answer reports it:

```
"relocation": "Content moved — per Légifrance concordance, the text of art. 1382 as of 2015-01-01 is now at Code civil - art. 1240 (V) (since 2016-10-01)."
```

When the move is in the future it reads `Content will move — per Légifrance concordance, … will be at … from <date>.` When Légifrance records no move, Vigueur compares the texts and says so: `The content of this article was amended on 2020-01-01 (inferred from text comparison).` The words after "was" or "will be" are `amended` or `replaced`, and a text that did not change reads `stayed unchanged in the next version` (future: `will stay unchanged`). This sentence is an inference from the two texts, not a fact stated by Légifrance, and the answer says so.

With `include_neighbours`, `neighbours` gives the previous and next article of the section. A neighbour that does not exist, or could not be read, is `null` (a warning then says why):

```
{
  "source": "Légifrance",
  "outcome": "found",
  …
  "number": "1240",
  …
  "neighbours": {
    "previous": null,
    "next": {
      "number": "1241",
      "id": "LEGIARTI000032041565",
      "excerpt": "Chacun est responsable du dommage qu'il a causé non seulement par son fait, mais encore pa…",
      "excerpt_cut": false,
      "link": "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041565"
    }
  },
  …
  "text": "Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute…",
  …
}
```

Each neighbour shows the first 200 characters of its text; `excerpt_cut` is `true` when the text is longer.

With `detailed`, `versions` lists every version of the article (`shown` marks the one in this answer), `modifications` lists the texts that created, amended or repealed it, and `cited_by` counts the texts citing it:

```
{
  "source": "Légifrance",
  "outcome": "found",
  …
  "status": {
    "state": "in_force",
    "on": "2015-01-01",
    "from": "1804-03-21",
    "until": "2016-10-01",
    "until_undetermined": false
  },
  …
  "relocation": "Content moved — per Légifrance concordance, the text of art. 1382 as of 2015-01-01 is now at Code civil - art. 1240 (V)…",
  …
  "versions": [
    {
      "id": "LEGIARTI000006438819",
      "version": "1.0",
      "legifrance_status": "MODIFIE",
      "from": "1804-03-21",
      "until": "2016-10-01",
      "until_undetermined": false,
      "shown": true
    },
    {
      "id": "LEGIARTI000032042379",
      "version": "2.0",
      "legifrance_status": "VIGUEUR",
      "from": "2016-10-01",
      "until": null,
      "until_undetermined": false,
      "shown": false
    }
  ],
  "modifications": [
    {
      "action": "codified",
      "by": "Loi 1804-02-09",
      "effective": null
    },
    {
      "action": "created",
      "by": "Loi 1804-02-09 promulguée le 19 février 1804",
      "effective": null
    }
  ],
  "cited_by": 65,
  …
}
```

Warnings you can meet, each one an entry of `warnings`:

- `Légifrance marks this version in force, but also records its abrogation by <text> (effective <date>).` Légifrance's label and its recorded repeal disagree; the answer shows both and decides nothing.
- `Repeal scheduled; Légifrance has not set its date.`
- `Could not check where this content moved (<reason>).` The article is shown without the move check.
- `Could not read the neighbouring articles (<reason>).`

### A long article, cut into pages

An answer holds at most 40,000 characters. Only the article text is cut: every page repeats the identity, `status`, the note, the warnings and the link. When the text is cut, `part` gives the characters shown (`from`, `to`, and `of`, the length of the whole text) and `next` gives `{ "offset": <number> }`, the position where the rest starts. When nothing is left, `next` is `null`. Ask Claude to continue and it passes that `offset`. An `offset` at or past the end of the text (equal to its length, or more) is an error: `"offset" <n> is past the end of the article text (<length> characters). Call again without "offset".`

For a text of about 64,000 characters, the first page and the last page look like this (the same fields otherwise; the excerpt keeps only the ones that change):

```
{
  …
  "status": {
    "state": "in_force",
    …
  },
  …
  "part": {
    "from": 0,
    "to": 38456,
    "of": 64201
  },
  "next": {
    "offset": 38456
  },
  "text": "I. – Les contribuables domiciliés en France au sens de l'article 4 B p…",
  "request": {
    …
    "offset": 0,
    …
  },
  …
}
```

```
{
  …
  "part": {
    "from": 38456,
    "to": 64201,
    "of": 64201
  },
  "next": null,
  "text": "'équipement portant sur des installations de production d'électricité…",
  "request": {
    …
    "offset": 38456,
    …
  },
  …
}
```

An article that fits one page has `part: null` and `next: null`, as in the first excerpt above.

### The number exists in several codes (`several_matches`)

Nothing is picked for you. `candidates` lists the versions that match, each with the call that reads it in `read_with`:

```
{
  "source": "Légifrance",
  "outcome": "several_matches",
  "warnings": [
    "Article L1234-1 exists in several codes — call again with \"code\"."
  ],
  "number": "L1234-1",
  "code": null,
  "candidates": [
    {
      "id": "LEGIARTI000006901112",
      "code": "Code du travail",
      "code_id": "LEGITEXT000006072050",
      "from": "2008-05-01",
      "legifrance_status": "VIGUEUR",
      "read_with": {
        "tool": "legifrance_get_article",
        "id": "LEGIARTI000006901112"
      }
    },
    {
      "id": "LEGIARTI000006686176",
      "code": "Code de la santé publique",
      "code_id": "LEGITEXT000006072665",
      "from": "2004-08-07",
      "legifrance_status": "VIGUEUR",
      "read_with": {
        "tool": "legifrance_get_article",
        "id": "LEGIARTI000006686176"
      }
    }
  ],
  "incomplete": false,
  "request": {
    "tool": "legifrance_get_article",
    "number": "L1234-1",
    "at_date": "2026-11-16",
    "response_format": "concise",
    "offset": 0,
    "include_neighbours": false
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

`code` is `null` when the candidates span several codes. If one code holds several versions in force, the warning reads `Article <n> has several versions in force in <code> — call again with "id".` and `code` names it. `incomplete` is `true` when the list may be longer than what was read; the warning then adds `(Only the first matches are listed — give the code to narrow it down.)`

### Not in force on that date (`not_in_force`)

The article exists but nothing applied on the day. `periods` lists the versions on record, oldest first, with their dates and links:

```
{
  "source": "Légifrance",
  "outcome": "not_in_force",
  "warnings": [
    "Art. R4217-2 of Code du travail exists but was not in force on 2026-11-16.",
    "Call again with an \"at_date\" inside one of these periods to read that version."
  ],
  "number": "R4217-2",
  "code": "Code du travail",
  "on": "2026-11-16",
  "periods": [
    {
      "id": "LEGIARTI000018532352",
      "code": "Code du travail",
      "legifrance_status": "ABROGE",
      "from": "2008-05-01",
      "until": "2026-10-01",
      "until_undetermined": false,
      "link": "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000018532352"
    }
  ],
  "relocation": null,
  "request": {
    "tool": "legifrance_get_article",
    "code": "Code du travail",
    "number": "R4217-2",
    "at_date": "2026-11-16",
    "response_format": "concise",
    "offset": 0,
    "include_neighbours": false
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

`relocation` may give the move of the content (`Content moved — per Légifrance concordance, the text of art. R4217-2 (version 2008-05-01 → 2026-10-01) is now at …`). When a listed period's dates cover the day although Légifrance's dated search found nothing, the answer does not say "was not in force". It says `Légifrance's dated search found no version in force on <date>. Versions on record.` and adds a warning naming the period.

### Not found (`not_found`)

`reason` says why:

| `reason` | Meaning | Warning wording |
|---|---|---|
| `unknown_id` | The id matches no article. | `No Légifrance article with id <id>.` |
| `no_article` | The number was never on record. | `No article <number> in <code> on Légifrance.` (or `in any code`) |
| `unknown_code` | The code is not a known title, so nothing was searched. | `Unknown code "<code>": no Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.` |

For an unknown code, `did_you_mean` suggests up to five titles that contain what you typed. They are suggestions only: Vigueur never substitutes one. The warning then adds `Did you mean: Code civil? (suggestions only — call again with the exact code title)`.

### Errors

An error answer is a JSON object with `outcome: "error"` and an `error` holding a `kind` and a `message` (see [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong)). Those specific to this tool:

- `Give an article number with its code (e.g. code "Code civil", number "1240") or a Légifrance article id (LEGIARTI…).` Neither a number nor an id was given.
- `Give either an article number or an article id, not both.`
- `"<id>" is not a supported article id. …` The id does not have the `LEGIARTI` or `KALIARTI` shape.
- A date that is not a real date is refused with a message asking for a real date as `YYYY-MM-DD`.

Other errors (missing credentials, quota, source unavailable, no answer within 45 seconds) are the same for every tool; see [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md).

## Limits

> **The verdict comes from dates.** "In force" is computed from the validity dates Légifrance gives for the version. Vigueur reports it and any disagreement with Légifrance's label; it does not say what the article means for your case.

- One article version per answer. To see every version and the texts that amended them, use [`legifrance_get_article_history`](legifrance_get_article_history.md).
- It reads code articles, and collective agreement articles by their id. It does not read whole laws or decrees: use [`legifrance_get_text`](legifrance_get_text.md).
- It finds an article by its number, not by its words: to find articles on a subject, use [`legifrance_search_legislation`](legifrance_search_legislation.md).
- Where content moved, the answer relies on Légifrance's own record of concordances. When there is none, the "inferred from text comparison" sentence is an inference.

## Related

- [`legifrance_get_article_history`](legifrance_get_article_history.md): every version of an article and what amended it.
- [`legifrance_browse_code`](legifrance_browse_code.md): find an article's place in a code.
- [`legifrance_search_legislation`](legifrance_search_legislation.md): search by words.
- [Codes, laws and decrees](../20-using/02-legislation.md)
- [Reading Vigueur's answers](../20-using/05-reading-answers.md)
