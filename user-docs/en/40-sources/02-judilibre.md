---
title: Judilibre
level: reference
tags: [sources, judilibre, case-law, cour-de-cassation]
summary: Know what Judilibre holds, how its search and zones behave, which filters work, and the quirks seen at the source.
updated: 2026-11-17
---

# Judilibre

Judilibre is the Cour de cassation's open-data base of court decisions. Vigueur reads it through the PISTE gateway ([PISTE](03-piste.md)) with [`judilibre_search_decisions`](../30-tools/judilibre_search_decisions.md), [`judilibre_get_decision`](../30-tools/judilibre_get_decision.md) and [`judilibre_list_taxonomy`](../30-tools/judilibre_list_taxonomy.md). Observations on this page are dated: they describe the source in November 2026 and can change.

## What Judilibre holds

| Courts | Key | Newest decision seen | Earliest decision seen | Size seen |
|---|---|---|---|---|
| Cour de cassation | `cc` | 12 November 2026 | 1860 | about 570 000 decisions |
| Courts of appeal | `ca` | 3 November 2026 | see note | about 650 000 |
| Tribunaux judiciaires | `tj` | 5 November 2026 | 14 December 2023 | about 780 000 |
| Commercial courts | `tcom` | 4 November 2026 | 31 December 2024 | about 210 000 |
| Labour courts (*conseils de prud'hommes*) | `cph` | 3 November 2026 | 1 October 2026 | about 1 000 |

Note: the source's own statistics give an impossible earliest date for the courts of appeal (the year 201), a data error. Do not read it as coverage.

- Judilibre holds the Cour de cassation and the lower courts of the judicial order only. The Conseil d'État, Conseil constitutionnel, CNIL and financial courts are on Légifrance ([Légifrance](01-legifrance.md)).
- **Fresh.** Observed: a Cour de cassation decision dated 10 November 2026 was already on Judilibre that same day. Légifrance holds the same decisions weeks later, and not all of them.
- **Decision kinds.** Judilibre classifies decisions as [*arrêt*](../00-intro/03-glossary.md), request for an opinion (*avis*), QPC, *ordonnance*, *saisie* or other. Observed: every Cour de cassation decision seen from 2021 on was typed "other", so the kind is not a useful filter and Vigueur does not show or offer it.
- **Unreasoned rejections.** Judilibre holds the Cour de cassation's rejections not specially reasoned and non-admissions, which Légifrance does not. They carry the formation `Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)` and the outcome `Rejet`.
- **Ids.** A Judilibre decision id is 24 hexadecimal characters. An unknown id and a badly formed one are answered the same way by the source; Vigueur checks the shape itself and says so.
- **The same decision in Légifrance.** A Cour de cassation decision held by both carries the same ECLI; the last page of the decision has an `other_source` field with the call that searches Légifrance by that ECLI.

## What a decision looks like

- **Pseudonymised.** The source replaces parties' names and addresses with markers such as `[M]`, `[T]`, `[Adresse 1]`. The names of judges and lawyers appear as in the decision.
- **Header in the text.** A Cour de cassation text opens with its header: the chamber, the number of the *arrêt* and a code such as `F-D` or `FS-B`. That code (formation and publication) is in the text only.
- **Outcome, short and full.** In search results the outcome is Judilibre's category (`Cassation`). The decision page shows the full wording when the source gives it (`Cassation partielle sans renvoi`).
- **Numbers.** Judilibre can repeat a decision's numbers several times over (observed); Vigueur lists each once.
- **Dates.** The decision date is the plain date. The source's time stamp falls on the previous day for some decisions; Vigueur never uses it.
- **Publication.** A Cour de cassation decision without any publication has an empty `publication` list (not published in the Bulletin). The other publications are the Rapport, the Lettres de chambre and the communiqués.
- **Summary, titles, visa, rapprochements.** The Cour de cassation gives a summary (*sommaire*), titles, the texts cited (*visa*) and related decisions (*rapprochements*) for some decisions. Many decisions have none.
- **Attached files.** Some decisions carry preparatory documents (a rapport, an avis). The decision answer lists each file in `files`, with its name, kind and address.
- **Appeal courts and tribunaux.** Their chambers and outcomes are free text, not lists. Court-of-appeal and tribunal judiciaire decisions seen carried no ECLI. A court-of-appeal decision's number is its RG number, such as `22/10744`.

## Zones

For many decisions, Judilibre marks the text in zones: `introduction`, `expose`, `moyens`, `motivations`, `dispositif`, sometimes `annexes`. A zone can come in several pieces; the pieces interleave (the *moyens* and the *motivation* alternate).

**Decisions without zones.** Observed: an unpublished decision of 2025 and an old Bulletin decision (2012) had no zones; Bulletin decisions and appeal-court decisions had them. The appeal-court decision observed had no `moyens` zone. When you ask for a zone that a decision lacks, Vigueur shows the full text and says so.

## Search behaviour

- **Search words are required.** Without them Judilibre answers "no decision", not an error. Vigueur refuses an empty query and says why.
- **All words by default.** Left to itself, Judilibre matches any of the words, which gives huge, noisy results (observed: a two-word query returned tens of thousands of decisions where the exact phrase returned 568). Vigueur asks for all the words by default. The three modes are `all_words`, `any_word` and `exact_phrase`.
- **Number and ECLI.** A *pourvoi* number or an ECLI in `query` finds the decision. Any spelling of a pourvoi number works (`24-16.924`, `2416924`, `24-16924`, `n° 24-16.924`). The source treats the number as a filter, so the hit has no relevance score or highlight.
- **Default court.** Without `jurisdiction`, the search is of the Cour de cassation, numbers and ECLIs included.
- **Loosened searches.** When nothing matches and the source reruns a looser search, Vigueur says that the results match only some of the words (`relaxed` is `true`).
- **Excerpts.** The source marks the matching words; Vigueur shows them between `**`.
- **Order.** `newest` and `oldest` sort by decision date. The source ignores a sort unless it is also told the direction; Vigueur always tells it.
- **Paging.** The source pages through the first 10 000 results only, and refuses beyond. Vigueur checks this before asking, and says to narrow the search. Vigueur shows at most 20 decisions per page; the source accepts more.
- **Dates.** `date_from` and `date_to` filter on the decision date and must be ISO dates; the source refuses `13/11/2026`.

## Filters

| Filter | At the source | What Vigueur does |
|---|---|---|
| `chamber`, `formation`, `publication`, `solution` | Meaningful for the Cour de cassation only | Offered for `cc` only; refused with an explanation for another court |
| `location` | Courts of appeal and tribunaux (36 courts of appeal) | Offered for `ca`, `tj`, `tcom`, `cph`; refused for `cc` |
| `type` | Drops recent Cour de cassation decisions (they are typed "other"): a filter by *arrêt* returned nothing | Not offered |
| `theme` | Returned nothing even for a decision's own theme | Not offered; `search_in` `themes` searches the themes text instead |
| Sort without direction | Silently ignored | Always sent with a direction |
| Attached-file and "particular interest" filters | Accepted, but a test returned nothing | Not offered |

The keys in the source's lists are not always the names the search takes: `judilibre_search_decisions` uses Vigueur's names for chambers and publications. See [`judilibre_list_taxonomy`](../30-tools/judilibre_list_taxonomy.md).

## Quirks

- **Appeal-court numbers match loosely.** With `jurisdiction` `ca`, a number such as `22/10744` returned decisions sharing only part of it: the same sequence number in other years (`21/10744`, `19/10744`, `23/10744`) or the same year with a different sequence. The exact decision was among them. Check the numbers in the answer.
- **Theme spelling.** Themes in search hits are lowercase and without accents, unlike the theme lists.
- **Lists for appeal courts repeat the Cour de cassation's.** Asked for the chambers of the courts of appeal, the source returns the Cour de cassation's list, which cannot describe them. Vigueur says these are free text instead.

## Links

A decision's official page is `courdecassation.fr/decision/` followed by its id. Vigueur builds the link from the id: the site answers automated requests with a script challenge, so it cannot be checked.

## Related

- [Case law](../20-using/03-case-law.md)
- [Légifrance](01-legifrance.md)
- [PISTE](03-piste.md)
