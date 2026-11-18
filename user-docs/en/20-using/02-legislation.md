---
title: Codes, laws and decrees
level: guide
tags: [legislation, codes, articles, history, collective-agreements]
summary: Read an article, a whole text or a code's table of contents, on any date, and find the texts that amended it.
updated: 2026-11-18
---

# Codes, laws and decrees

You can ask Claude to read legislation from Légifrance: articles of the codes, laws, ordinances,
decrees, orders and national collective agreements. This guide covers what to ask and what comes back.
The parameters of each tool are on its own page under [Tools](../30-tools/legifrance_get_article.md).

## Read an article by its citation

Give a code and an article number, in the form people cite them:

> Article L. 1234-1 of the Code du travail. / L'article 1240 du Code civil.

Claude runs [`legifrance_get_article`](../30-tools/legifrance_get_article.md). The code can be a common
abbreviation such as "C. trav.". The article number can be written `L1234-1`, `L. 1234-1` or
`199 undecies B`. A Légifrance id (`LEGIARTI` followed by 12 digits) works too.

The answer gives the article `text`, whether it is in force on the date (`status`, computed from its
validity dates), where it sits in the code (`section`), its note ([*nota*](../00-intro/03-glossary.md#nota)) if any, and
the official `link`. Ask for the
detailed form to also get every version, the amending texts and the number of texts that cite it.

If the number exists in several codes and you named none, the answer lists the candidates and picks
none (`"outcome": "several_matches"`); name the code. If one code holds several versions in force at once, the answer lists their ids:
ask again with the id. For a collective agreement article, give its `KALIARTI` id.

## Read the version that applied on a date

Add a date:

> What did article L1234-1 say on 2019-06-01? / Que disait cet article au 1er juin 2019 ?

The date can be in the past or in the future (a scheduled version), for example the day a contract
was signed or a dispute arose. The default is today.

When no version is in force on that date, the answer does not say "not found". Its `outcome` is
`not_in_force`: the article exists but was not in force that day, and `periods` lists the versions
Légifrance records, each with its status label, dates, id and link. Ask again with a date inside one of those periods.

## See an article's neighbours

> Show me the articles before and after it. / Montre-moi l'article précédent et le suivant.

The answer fills `neighbours` with the previous and next article of the same section, each with its
number, its first words and a link. If a neighbour cannot be read, it is `null` and a warning says so.

## Follow an article's history and its amending texts

> Who amended article L1234-1, and when? / Historique de l'article 1240.

Claude runs [`legifrance_get_article_history`](../30-tools/legifrance_get_article_history.md). The
answer gives:

- the version in force today (`current`), computed from validity dates;
- the list of `versions` with status label, start and end dates;
- the events (`items`), by entry-into-force date: created, amended, repealed, codified or
  transferred, and by which text. A future date has `"scheduled": true`;
- the concordance (see below).

Long histories come in pages of up to 100 events; `next` is `{ "page": 2 }` when
there is more.

## Check whether an article was renumbered

Légifrance records a concordance when the content of an article moved to another number, as with old
article 1382 of the Code civil, now 1240. When you read the old article, the answer says so in a
sentence that attributes it to the source, in `relocation`:

```
"relocation": "Content moved — per Légifrance concordance, the text of art. 1382 as of 2015-01-01 is now at Code civil - art. 1240 (V) (since 2016-10-01)."
```

For a move that has not happened yet, the sentence starts `Content will move`. The history of an
article gives the same links in `concordance`: `moved` says where a version's content went, and
`came_from` lists the articles whose content is now at this number, for example
`"came_from": ["Code civil - art. 1353 (M)"]` in the history of article 1382.

> **When there is no concordance**
> Without a concordance, Vigueur compares the words of the version you read with those of the next
> version, and says only whether they are the same:
> `The next version (in force from 2020-01-01, id LEGIARTI000000000002) has a different wording.`
> or `… has the same wording.` The comparison ignores case, accents and punctuation. It says nothing
> about where the content went. With no next version to compare, `relocation` is `null`.

## Read a whole law, ordinance, decree or order

> Read the loi 78-17. / Lis le décret 2005-1309. / Outline of ordonnance 2016-131.

Claude runs [`legifrance_get_text`](../30-tools/legifrance_get_text.md). You identify a text by its
Légifrance id (`LEGITEXT…` for the consolidated version, `JORFTEXT…` as published), its NOR, or its
nature and number. The natures are *loi*, *loi organique*, *ordonnance*, *décret* and *arrêté*.

There are two parts:

- **outline** (the default): title, Légifrance status, publication, and the sections with their
  article counts and `section_id`;
- **articles**: the article texts, page by page. Ask for one section by its `section_id` to avoid
  reading the whole text.

The consolidated version is the one in force on the date you give (default today). A text read by
`JORFTEXT` id or NOR is shown as published: its initial version, without later amendments, and the
answer says so.

In the articles, each article carries its own `status`. An article not in force on the date is not
shown as the law of that date: its `text` is `null` and the answer says `Text not shown: not in force on …`.

If several texts match a nature and number, the answer (`several_matches`) lists them and asks for
the id. If Légifrance files no text of that nature with that number but other texts carry the number,
the answer (`not_found`, with `reason` `other_nature`) lists those.

Collective agreements are not read this way. Find them with the search (below), then read an article
with its `KALIARTI` id.

## Browse a code's table of contents

> Show me the structure of the Code de la route. / Quels sont les titres du Livre I du Code du travail ?

Claude runs [`legifrance_browse_code`](../30-tools/legifrance_browse_code.md). The first answer is the
top level (books, titles…). Each line carries a `section_id`; ask Claude to open a section to go
deeper, until you reach articles.

Sections not in force on the date (and, today, repealed articles) are hidden, with a count:
`(3 items not in force on … hidden — include_repealed: true to show them)`. Ask to include them and
each section's `status` shows when it ended or starts. On a date other than today, the article
labels are Légifrance's current labels, not the status on that date: read the article with that date
to check.

## Search

> Find texts about "télétravail" in force today. / Cherche la convention collective IDCC 1486.

Claude runs [`legifrance_search_legislation`](../30-tools/legifrance_search_legislation.md), in one of
four collections:

| Collection | What it searches | Dates |
|---|---|---|
| `codes` | Consolidated codes, also by article number | Versions in force on a date (default today) |
| `loda` | Consolidated laws, ordinances, decrees and orders | Versions in force on a date (default today) |
| `jorf` | The Journal officiel as published, by words, NOR or text number | As published; no in-force filter, but you can narrow by publication dates |
| `kali` | National collective agreements, by words or IDCC number | Agreements currently in force, extended or not |

Give at least one of: words, an article number, a text number, a NOR or an IDCC. A code, a nature or
publication dates only narrow a search; they cannot be the only criterion. You can ask for every
version instead of those in force on a date. Each hit shows its title, Légifrance's status label,
validity dates, id and official link. A hit that is a code or collective agreement article can be read in full with its id.

> **Search is not reading**
> A search hit shows an excerpt. Ask Claude to read the article or the text before you quote it.

## Related

- [Reading Vigueur's answers](05-reading-answers.md)
- [The Journal officiel and tracking changes](04-journal-officiel.md)
- [Légifrance](../40-sources/01-legifrance.md)
