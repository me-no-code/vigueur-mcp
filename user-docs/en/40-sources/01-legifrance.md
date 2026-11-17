---
title: Légifrance
level: reference
tags: [sources, legifrance, codes, case-law, journal-officiel]
summary: Know what Légifrance holds, which collection answers which Vigueur tool, how statuses and validity dates work, and where the source has gaps or delays.
updated: 2026-11-17
---

# Légifrance

Légifrance is the French government's legal publication service. Vigueur reads it through the PISTE gateway ([PISTE](03-piste.md)). This page says what Légifrance holds, how Vigueur uses each part, and what has been observed about it. Observations are dated: they describe the source in November 2026 and can change.

## Collections at a glance

| Collection | What it holds | Vigueur tools |
|---|---|---|
| Codes | The consolidated codes (Code civil, Code du travail…): every version of every article, with validity dates | [`legifrance_get_article`](../30-tools/legifrance_get_article.md), [`legifrance_get_article_history`](../30-tools/legifrance_get_article_history.md), [`legifrance_browse_code`](../30-tools/legifrance_browse_code.md), [`legifrance_list_changes`](../30-tools/legifrance_list_changes.md), [`legifrance_search_legislation`](../30-tools/legifrance_search_legislation.md) (`codes`) |
| LODA | Consolidated laws, ordinances, decrees and orders | [`legifrance_get_text`](../30-tools/legifrance_get_text.md), [`legifrance_list_changes`](../30-tools/legifrance_list_changes.md), [`legifrance_search_legislation`](../30-tools/legifrance_search_legislation.md) (`loda`) |
| JORF | The [*Journal officiel*](../00-intro/03-glossary.md) as published: each text in its initial form | [`legifrance_latest_jo`](../30-tools/legifrance_latest_jo.md), [`legifrance_get_text`](../30-tools/legifrance_get_text.md), [`legifrance_search_legislation`](../30-tools/legifrance_search_legislation.md) (`jorf`) |
| KALI | National collective agreements, searched by IDCC | [`legifrance_search_legislation`](../30-tools/legifrance_search_legislation.md) (`kali`) |
| JURI | Judicial case law: Cour de cassation and some courts of appeal | [`legifrance_search_case_law`](../30-tools/legifrance_search_case_law.md) (`judicial`), [`legifrance_get_decision`](../30-tools/legifrance_get_decision.md) |
| CETAT | Administrative case law: Conseil d'État, cours administratives d'appel, tribunaux administratifs | same tools (`administrative`) |
| CONSTIT | Conseil constitutionnel decisions | same tools (`constitutional`) |
| CNIL | CNIL deliberations and decisions | same tools (`cnil`) |
| JUFI | Financial courts: Cour des comptes and the regional and territorial chambers of accounts | same tools (`financial`) |

[`legifrance_list_reference_values`](../30-tools/legifrance_list_reference_values.md) lists the names Légifrance accepts as filters (codes, kinds of Journal officiel text, issuing ministries).

Vigueur does not use the other collections Légifrance offers (circulars, for example).

Size, observed in November 2026: the codes list held 108 codes, 76 in force and 32 repealed; the judicial collection held about 600 000 decisions, the administrative collection about 570 000, the financial collection about 3 500, the CNIL about 27 000 and the Conseil constitutionnel about 7 400.

## Codes: versions, statuses and validity dates

**Every article has versions.** Each version has a start date and an end date. Vigueur judges whether a version applies on a given date from those two dates alone: it applies from its start date up to, but not including, its end date. Légifrance's own status label is shown beside the result, as the source writes it (`VIGUEUR`, `MODIFIE`, `ABROGE`…), but the date decides.

**Sentinel dates.** Légifrance writes "no end" as the year 2999 and "date not determined" (a scheduled repeal with no date yet) as a date in 2222. Vigueur never shows these as real dates: no end reads `"until": null`, and a repeal with no date yet reads `"until_undetermined": true`. A `status` reads, for example, as follows (the answer to a reading of article 1240 of the Code civil, then of article 1382 on a date after 2016, then, for a section of the Code du travail read as of 2005-01-01, a version that starts later):

```
"status": {
  "state": "in_force",
  "on": "2026-11-16",
  "from": "2016-10-01",
  "until": null,
  "until_undetermined": false
}
```

```
"status": {
  "state": "not_in_force",
  "on": "2026-11-16",
  "from": "1804-03-21",
  "until": "2016-10-01",
  "until_undetermined": false
}
```

```
"status": {
  "state": "not_yet_in_force",
  "on": "2005-01-01",
  "from": "2008-05-01",
  "until": null,
  "until_undetermined": false
}
```

The `state` is `in_force`, `not_in_force`, `not_yet_in_force` or `never_applied`. (The wording of `state` is Vigueur's; Légifrance's own label is given beside it in `legifrance_status`.)

**Versions scheduled in the future.** Légifrance lists versions that enter into force later, some years ahead (observed: scheduled changes to the Code civil and to the Code du travail). A scheduled version is shown as not yet in force on today's date, and a scheduled repeal is never hidden behind "in force".

**A status can contradict the repeal links.** Observed in November 2026: some articles of the old legislative part of the Code du travail still carry the label "in force" with no end date while the source also records their repeal. When Vigueur sees both, a warning says so:

```
"Légifrance marks this version in force, but also records its abrogation by {text} (effective {date})."
```

**Renumbering.** When an article has been renumbered, Légifrance records a link from the old number to the new one (for example the old article 1382 of the Code civil, now 1240). Vigueur shows that link when the source gives it.

**Repealed or never existed.** For today's date, a repealed article and a number that never existed look alike in one of Légifrance's lookups. Vigueur then searches every version on record, so that it can tell you an article was repealed rather than that it is missing.

**Change lists.** `legifrance_list_changes` dates changes by their entry-into-force date, not their publication date.

**Tables of contents.** The full table of contents of a large code is very large (observed: about 19 MB for the Code du travail), so `legifrance_browse_code` shows one level at a time. Articles in a table of contents carry only Légifrance's current label: to know what applied on another date, read the article with `at_date`.

## LODA and the Journal officiel

- **Consolidated versus as published.** LODA holds the current, consolidated text of a law or decree. JORF holds the text as it appeared in the *Journal officiel*. JORF has no "in force" filter: a search by words, NOR or text number can be narrowed by publication date instead.
- **Organic laws are filed as laws.** Observed in November 2026: LODA files a *loi organique* under the nature `LOI`, although the Journal officiel lists it as an organic law. Vigueur accepts `loi_organique`, searches LODA as a law and keeps the texts whose title begins with "Loi organique".
- **Emitters change.** The names of ministries and authorities in the Journal officiel change with governments, and the source lists only those present in the matching results. A filter on a stale name returns nothing. Ask for the list of emitters before filtering.
- **Text numbers and NOR.** A text can be found by nature and number ("loi 78-17"), by NOR, or by id.

## Collective agreements (KALI)

Agreements are searched by IDCC or by words, and only through `legifrance_search_legislation`. A search returns the agreements currently in force, extended or not; a date does not apply. Reading an agreement in full with `legifrance_get_text` is not supported.

## Case law

**Titles are the source of most details.** A search hit carries a title string, an excerpt and, in some collections, an outcome, but no structured date, number or chamber. Vigueur reads the date, the numbers, the court and the publication from the title. A title it cannot read is shown as Légifrance wrote it.

**Coverage gaps and delays**, observed in November 2026:

- **Cour de cassation.** The judicial collection holds part of the Cour de cassation's decisions. Its newest Cour de cassation decision was about eight weeks older than the newest in Judilibre. Unreasoned rejections and non-admissions (*formation restreinte RNSM/NA*) are not held. Vigueur adds a note about this (in `warnings`) to every judicial search and to the "not found" answer for a Cour de cassation id.
- **Courts of appeal.** The judicial collection holds appeal-court decisions up to early 2023 only. Recent appeal-court and first-instance decisions are in Judilibre ([Judilibre](02-judilibre.md)).
- **The same decision in both sources.** A Cour de cassation decision held by both carries the same ECLI and the same text, apart from a short opening and closing line that Légifrance adds and a few encoding glitches (a stray character in place of a dash, for example).
- **Appeal-court numbers.** An appeal-court (RG) number tried in a judicial search found nothing in the one case tried.

**Numbers.**

- A *pourvoi* number works in any spelling (`24-16.924` or `2416924`).
- Conseil constitutionnel decisions need the number exactly as filed. **Joined decisions are filed under the full combined number**, such as `2026-1217/1218`. The number of one of the two (`2026-1217`) finds nothing. A trailing nature (`QPC`, `DC`) is dropped by Vigueur. When a search by a number without `/` finds nothing, Vigueur says so and points to the combined form.
- CNIL numbers read like `2026-023`; Cour des comptes numbers like `S-2026-1111`.

**Filters.**

- **Administrative collection.** The source fails (server error) when asked to separate Conseil d'État, cours administratives d'appel and tribunaux administratifs, so Vigueur has no such filter.
- **Sort.** "Newest first" works on every collection. The CNIL needs its own sort name, which Vigueur uses; with the usual name the source answers without sorting and without warning.
- **Dates** filter on the decision date (the deliberation date for the CNIL).

**Publication.** The source's publication marker for the Cour de cassation is the Bulletin. A decision without one is shown as `Inédit` when the title says so, and Vigueur never writes "unpublished" for a decision with no marker (`publication` is `null`).

**Texts.** A decision's text comes with names pseudonymised by the source. Its summary (*sommaire*) exists for some decisions only. The Conseil constitutionnel's decisions also give the Conseil's own page and the *Journal officiel* link (`constitutional_council_link` and `jo_link`). A CNIL deliberation shows its status as Légifrance labels it.

## Links

Légifrance's answers carry no official page address (except the Conseil constitutionnel's). Vigueur builds each link from the id (the `link` fields of its answers). It cannot open the pages to check them: Légifrance's site refused automated requests (observed in November 2026).

## Related

- [Codes, laws and decrees](../20-using/02-legislation.md)
- [Case law](../20-using/03-case-law.md)
- [The Journal officiel and tracking changes](../20-using/04-journal-officiel.md)
- [Judilibre](02-judilibre.md)
- [PISTE](03-piste.md)
