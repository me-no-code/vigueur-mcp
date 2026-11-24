---
title: The Journal officiel and tracking changes
level: guide
tags: [journal-officiel, changes, tracking]
summary: Read the latest Journal officiel, filter it, see what changed in a code or a law since a date and keep track of new texts.
updated: 2026-11-23
---

# The Journal officiel and tracking changes

Use this guide to see what France has just published, and what changed in a code or a law over a
period. The [*Journal officiel*](../00-intro/03-glossary.md#jorf-journal-officiel) (JO) is the
official gazette; Légifrance publishes it as JORF.

## Read the latest Journal officiel

> What is in today's Journal officiel? / Montre-moi les derniers JO.

The assistant runs [`legifrance_latest_jo`](../30-tools/legifrance_latest_jo.md). By default you get the
latest issue; you can ask for up to 10 issues, or for the issue published on a date. Dates are
publication dates. For a date, Vigueur reads at most three issues published that day.

For each issue the answer gives the title, the publication date and a link, then the table of
contents: each text with its title, nature (*loi*, *décret*, *arrêté*…), ministry or emitter and a
link. Texts are grouped under the headings of the issue's table of contents (`groups`). When an issue
has no table of contents, `toc_available` is `false` and its `groups` are empty.

Long issues come in pages; the answer then gives `"next": { "page": 2 }`.

## Filter by nature or ministry

> Only the décrets. / Only texts from the ministry of labour. / Seulement les arrêtés du ministère de la Santé.

You can filter by nature, by emitter (a ministry or an authority) or both. A partial emitter name is
enough, and the answer lists the emitters it matched in `filter`. As an illustration of the shape (not a recorded answer):

```
"filter": {
  "nature": "decret",
  "emitter": "travail",
  "matched_emitters": [ … ]
}
```

Ministry names change with governments. If you are not sure of a name, ask the assistant to list the natures
and emitters that published since a date
([`legifrance_list_reference_values`](../30-tools/legifrance_list_reference_values.md)). When a filter
matches nothing, the answer has `"outcome": "no_results"`, says `No text matches these filters in the selected issue(s).` and lists
the natures and emitters available in those issues (`available`).

## See what changed in a code since a date

> What changed in the Code du travail since 2026-01-01? / Qu'est-ce qui a changé dans le Code civil depuis le 1er septembre ?

The assistant runs [`legifrance_list_changes`](../30-tools/legifrance_list_changes.md) with a start date and,
if you give one, an end date (default today). The answer lists the articles created, amended,
repealed, codified, transferred or linked, grouped by the amending text, each with its date, its
number, its section and its id (`items`, one group per amending text).

The dates are **entry-into-force dates, not publication dates**. A change that enters into force in
the future has `"scheduled": true`, and the `scheduled` field counts them.

Lists come in pages of up to 100 entries; `next` gives the next page, which the assistant can ask for.

> **Gaps the answer reports**
> Some versions have an entry-into-force date that Légifrance leaves undetermined; they are not
> listed, and the answer says how many (`undetermined_versions`). When Légifrance has not loaded the version detail for a year,
> the answer names the year: changes of that year may be missing.

## See the change log of a law

> What changed in the loi 78-17 since 2024? / Les modifications du décret 2019-1088.

Give a law, ordinance, decree or order ("loi 78-17", "décret 2019-1088"), a NOR or a Légifrance id,
instead of a code. The answer has the same form, with the link to the text.

## Track new texts

Vigueur answers when you ask; it does not watch or notify. To keep up, ask again at the interval you
want. Some requests that work:

- "What was published in the Journal officiel since Monday?" (the latest issues, up to 10, or the
  issues of one date, with `legifrance_latest_jo`).
- "What changed in the Code du travail since 2026-10-01?" Use the date of your last check.
- "Search the Journal officiel for texts published between 2026-11-01 and 2026-11-15 about …"
  ([`legifrance_search_legislation`](../30-tools/legifrance_search_legislation.md), collection
  `jorf`, with `published_from` and `published_to`). The search needs words, a NOR, a text
  number or an article number: publication dates alone are refused.

## Related

- [Codes, laws and decrees](02-legislation.md)
- [Reading Vigueur's answers](05-reading-answers.md)
