---
title: Reading Vigueur's answers
level: guide
tags: [answers, envelope, status, links, pagination, errors]
summary: "Understand the parts every Vigueur answer shares: the envelope fields, the kind of answer, the in-force status, warnings, paging, cached content and errors."
updated: 2026-11-18
---

# Reading Vigueur's answers

Claude usually summarises what Vigueur returns, but Vigueur's answers have a fixed shape, and you can
ask Claude to show one as it came. Every answer is one JSON object: a list of named fields, each
holding one fact. On the wire it is a single line of JSON. The excerpts on this page are indented so
you can read them, and `…` marks fields or text left out. This page explains the parts every kind of
answer shares.

## What every answer contains

Whatever the tool, an answer starts and ends with the same fields. Between them come the fields of
the tool, which its page under [Tools](../30-tools/legifrance_get_article.md) explains:

```
{
  "source": "Légifrance",
  "outcome": "found",
  "warnings": [],
  …
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
| `source` | Where the facts come from: `Légifrance`, `Judilibre`, or `PISTE` for `vigueur_status`. |
| `outcome` | The kind of answer: see the next section. |
| `warnings` | Sentences about the answer that no other field carries. Empty (`[]`) when there is nothing to say. See [Warnings](#warnings). |
| the tool's own fields | The text, the dates, the status, the identifiers, the link, or the list of hits. |
| `request` | The call that was made: the tool name, then each parameter at the value used. A default is shown as the value it took, so a date you did not give appears as today's date. |
| `retrieved` | When Vigueur put the answer together from what the source returned, in UTC, to the second. |
| `cached` | Content that came from Vigueur's memory instead of a fresh request, each with what it is and when it was fetched. Empty (`[]`) when everything was fetched for this call. See [Cached content](#cached-content). |
| `vigueur_version` | The version of Vigueur that answered. |

Every field a tool lists is always present. When the source gives no value, the field is `null` (or
`[]` for a list), never left out: `null` means the source gave nothing. Names are in English and
written in lowercase with underscores; values keep the source's spelling, accents included. Dates are
`YYYY-MM-DD`.

## The outcome says what kind of answer it is

| `outcome` | Meaning | Where |
|---|---|---|
| `found` | The article, text or decision you asked for, in full or in part. | Reading tools |
| `results` | A list: hits, changes, sections, values. | Search, list and browse tools; `vigueur_status` when it checked the sources |
| `no_results` | The search or list ran and came back empty, or you asked for a page past the last one. | Search, list and browse tools; `legifrance_get_text` and `legifrance_get_article_history` for a page past the last one |
| `not_found` | What you asked for does not exist at the source. This is an answer, not an error. | Reading tools |
| `several_matches` | Your citation fits more than one thing; the answer lists them and picks none. | `legifrance_get_article`, `legifrance_get_article_history`, `legifrance_get_text` |
| `not_in_force` | The article or text exists, but nothing applied on the date. The answer lists the versions on record. | `legifrance_get_article`, `legifrance_get_text` |
| `not_configured` | PISTE access is not set up; `config_problems` lists any problem with the settings. | `vigueur_status` |
| `error` | The call failed: see [When something goes wrong](#when-something-goes-wrong). | Any tool |

## "In force on a date" is computed from dates

When you read an article, a text or a section of a code, the answer has a `status` saying whether it
applied on the date you asked (today by default). Vigueur computes it from the version's validity
dates, not from Légifrance's status label:

```
"status": {
  "state": "in_force",
  "on": "2026-11-16",
  "from": "2016-10-01",
  "until": null,
  "until_undetermined": false
}
```

| Field | What it holds |
|---|---|
| `state` | One of the four values below. |
| `on` | The date the state applies to. |
| `from` | The first day of the version; `null` when the source gives none. |
| `until` | The day the version ends, not included: the first day it no longer applies; `null` when the source gives none. |
| `until_undetermined` | `true` when Légifrance records an end (a repeal) but has not set its date. |

| `state` | Meaning |
|---|---|
| `in_force` | The dates cover the day `on`. `until` may hold a scheduled end, or be `null`. |
| `not_in_force` | The version ended before `on`. `from` and `until` give the period it applied. |
| `not_yet_in_force` | The version starts after `on`. `from` is its start; `until` its end, if there is one. |
| `never_applied` | A version that never took effect (a still-born version). |

A version applies from its first day up to, but not including, its end date. Légifrance's own label
is given next to the status, in `legifrance_status` (for example `VIGUEUR` or `MODIFIE`; see the
[glossary](../00-intro/03-glossary.md#status-légifrances-own-word)). A label and the dates can
disagree: the answer then adds a warning rather than choosing. Examples:

- `Légifrance marks this version in force, but also records its abrogation by … (effective 2026-03-01).`
  The same sentence reads `as entering into force` for a version Légifrance marks as deferred
  (*différée*).
- `Repeal scheduled; Légifrance has not set its date.`
- `Légifrance's dated search found no version for D, but this period covers it: …`

Vigueur reports the disagreement and leaves the reading to you.

When the date falls in no period, the outcome is `not_in_force`: the article exists but was not in
force that day, and `periods` lists the versions on record, so you can ask again with a date inside
one of them.

## Warnings

`warnings` is a list of sentences. Each is a fact about the answer that no field carries: a
disagreement in the source's data (see above), an extra check Vigueur could not complete (a
neighbouring article that could not be read, a concordance lookup that failed), a note on what the
source does not hold, or the sentences of a `not_found` or `no_results` answer saying what was looked
up. The rest of the answer stands. The list is empty when there is nothing to say.

Statements that come from Légifrance's concordance say so: `per Légifrance concordance`. A statement
Vigueur derived itself says so: `inferred from text comparison`. See
[Codes, laws and decrees](02-legislation.md).

## Each hit says how to read it in full

A hit in a search carries a `read_with` field naming the call that reads it:

```
"read_with": { "tool": "judilibre_get_decision", "id": "6abcc10bc27382d099087409" }
```

A search shows an excerpt only; the full text takes a second request, which Claude makes for you when
you ask to read it. A hit that no tool reads, such as an article published in the Journal officiel,
has `"read_with": null` and only its `link`. A decision that exists in the other source says so in
`other_source`.

Links (`link`) point to the official page. Vigueur builds them from the source's ids.

## "Not found" is not "did you mean"

Vigueur never substitutes a close match for what you asked. When nothing is found, the outcome is
`not_found` and the warnings say what was looked up.

- **Unknown code.** `reason` is `unknown_code`, and the warning says `Unknown code "C. route": no
  Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.`
  `did_you_mean` may list titles that contain what you typed (`Did you mean: …? (suggestions only —
  call again with the exact code title)`).
- **No article.** `No article 99999 in Code civil on Légifrance.` or `No Légifrance article with id …`
  means Légifrance has none; Vigueur does not guess.
- **A text not in force.** The outcome is `not_in_force`, and each candidate says why it is not in
  force on that date.
- **A decision.** `No Légifrance decision with id "…".` or `No Judilibre decision with id "…".`

A suggestion is only a suggestion. Ask again with the exact name.

## Ambiguous citations list candidates and pick none

When a citation fits more than one thing, the outcome is `several_matches`: the answer lists the
candidates and stops.

```
"outcome": "several_matches",
"warnings": [
  "Article L1234-1 exists in several codes — call again with \"code\"."
],
"candidates": [
  { "id": "LEGIARTI000006901112", "code": "Code du travail", "from": "2008-05-01", … },
  { "id": "LEGIARTI000006686176", "code": "Code de la santé publique", "from": "2004-08-07", … }
],
```

Name the one you mean. The same applies when one code holds several versions of an article in force
at once (the candidates carry their ids), and when several laws or decrees share a number.

## Long answers are cut and paged

An answer holds up to 40,000 characters. What does not fit is not lost; the answer says how to get the
rest, with the fields `page`, `part` and `next`.

| Where | What you see | How to continue |
|---|---|---|
| Lists (search hits, changes, history, outline, Journal officiel) | `page` gives `number` and `of` (the page you have and the number of pages); `next` is `{ "page": 2 }` | Ask for the next page |
| Long text (article, decision) | `part` gives `from`, `to` and `of` (the characters shown and the length of the whole text); `next` is `{ "offset": <number> }` | Ask Claude to continue; it repeats the request with that offset |
| Nothing left | `next` is `null` | |
| A page too long | A warning: `(Only the first 7 of 10 hits of this page fit — use a smaller "page_size".)` | Ask for fewer results per page |

As an illustration of the shape (not a recorded answer), the first page of a list of three pages:

```
"page": { "number": 1, "of": 3 },
"next": { "page": 2 },
```

Every page of an article repeats its identity, `status` and `link`, so the in-force verdict travels
with each part. Asking for a page past the end gives `no_results`, and `page` says which page you
asked for and how many there are. On a decision page, the summary and the lists before the text are
shortened when they would leave too little room for the text; the text itself is paged, never
shortened.

## Cached content

Some content is kept in Vigueur's memory for a short time, such as the list of codes, a code's table
of contents or Judilibre's lists of chambers. When an answer shows content from that memory, `cached`
says what it is and when it was fetched:

```
"cached": [
  { "what": "Code du travail table of contents on 2026-11-16", "retrieved": "2026-11-16T10:42:07Z" }
]
```

When every part of the answer was fetched for this call, `cached` is `[]`. See
[Privacy and your data](../00-intro/04-privacy-and-your-data.md) for what Vigueur keeps.

## The time limit

Each request Claude makes to Vigueur has 45 seconds in all, retries included. If it runs out, the
answer is an error with `kind` `deadline`: `Légifrance did not answer within 45 s. Try again in a
moment.` (or Judilibre). Ask again.

## When something goes wrong

A failed call gives a JSON object with `outcome` set to `error`. It is marked as an error, so Claude
treats it as a failure:

```
{
  "source": "Légifrance",
  "outcome": "error",
  "error": {
    "kind": "forbidden",
    "message": "Légifrance: access refused (HTTP 403)"
  },
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
  "vigueur_version": "0.1.0"
}
```

| Field | What it holds |
|---|---|
| `source` | The source that failed (`PISTE` for `vigueur_status`). |
| `outcome` | `error`. |
| `error.kind` | The family of failure. See the table below. |
| `error.message` | What happened; for some kinds, then when to try again or when to report it. |
| `request` | The call that failed. |
| `retrieved` | Present only when a source answered (for example with an HTTP refusal). |
| `vigueur_version` | The version of Vigueur that answered. |

An error has no `warnings` and no `cached`. The `kind` values:

| `kind` | Situation | What the message tells you |
|---|---|---|
| `credentials_invalid` | Credentials rejected | The message alone, for example `PISTE rejected the credentials (HTTP 401).` |
| `forbidden` | Access refused (HTTP 403) | The message alone: `<source>: access refused (HTTP 403)` |
| `quota_exceeded` | Quota reached | `PISTE quota reached. Retry in about N s.` (or `Wait a moment and try again.`) |
| `upstream_unavailable` | PISTE down or slow | `PISTE is unavailable or timed out. Wait a moment and try again…` |
| `unexpected_response` | Unexpected response | The source returned something Vigueur does not understand, possibly an API change |
| `not_found` | The source answered that the thing asked for does not exist (HTTP 404) | The message alone: `<source>: not found (HTTP 404)` |
| `deadline` | No answer within 45 seconds | `Légifrance did not answer within 45 s. Try again in a moment.` |
| `invalid_input` | A request the tool refuses | The message alone, for example `"date_from" must not be after "date_to".` |
| `cancelled` | The call was stopped | Nothing is wrong |
| `unexpected` | Anything else | `Unexpected error: … Call vigueur_status to check the setup.` |

Ask Claude to run `vigueur_status` first: it checks your settings and both sources. See
[`vigueur_status`](../30-tools/vigueur_status.md), and
[Troubleshooting and FAQ](../00-intro/05-troubleshooting.md) for what to do.

## Related

- [Quickstart: your first questions](01-quickstart.md)
- [Codes, laws and decrees](02-legislation.md)
- [Case law](03-case-law.md)
