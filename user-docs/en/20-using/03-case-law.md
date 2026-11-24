---
title: Case law
level: guide
tags: [case-law, judilibre, legifrance, decisions]
summary: Choose between Légifrance and Judilibre, find a decision by number, ECLI or words, and read it whole or by zone.
updated: 2026-11-23
---

# Case law

Vigueur reads case law from two sources. They overlap for the Cour de cassation, but neither holds
everything the other does. This guide tells you which to ask, how to find a decision and how to read
one. You do not have to choose: say what you want and the assistant picks. Knowing the difference helps you
read the answer.

## The two sources

| | Légifrance | Judilibre |
|---|---|---|
| Tool to find | [`legifrance_search_case_law`](../30-tools/legifrance_search_case_law.md) | [`judilibre_search_decisions`](../30-tools/judilibre_search_decisions.md) |
| Tool to read | [`legifrance_get_decision`](../30-tools/legifrance_get_decision.md) | [`judilibre_get_decision`](../30-tools/judilibre_get_decision.md) |
| Cour de cassation | Part of its decisions | Its decisions |
| Courts of appeal and first-instance courts | Some courts of appeal | Courts of appeal, tribunaux judiciaires, commercial courts, labour courts |
| Conseil d'État and administrative courts | Yes | No |
| Conseil constitutionnel, CNIL, financial courts | Yes | No |
| Decision [zones](../00-intro/03-glossary.md#zone) (introduction, *moyens*, *motivations*, *dispositif*…) | No | Yes, when the source marks them |
| Sort by oldest first | No | Yes |

### What Légifrance lacks

Vigueur states this each time it searches the judicial collection on Légifrance, as a sentence in `warnings`:

```
"Note: Légifrance does not hold every Cour de cassation decision (in particular not its unreasoned rejections and non-admissions, formation restreinte RNSM/NA), receives the ones it holds weeks after Judilibre, and holds no appeal-court decisions after early 2023. Judilibre (judilibre_search_decisions) holds those decisions."
```

In plain words: for a recent decision, an unreasoned one
([*rejet non spécialement motivé*, *non-admission*](../00-intro/03-glossary.md#rnsmna)) or an
appeal-court decision, Judilibre is the source to ask.

> **A missing decision is not a missing ruling**
> If Légifrance returns nothing for a Cour de cassation or appeal-court decision, ask the assistant to try
> Judilibre before you conclude anything.

### What Judilibre lacks

Judilibre holds the Cour de cassation and the lower judicial courts only. The Conseil d'État, the
Conseil constitutionnel, the CNIL and the financial courts are on Légifrance. Judilibre needs search
words, a number or an ECLI: it cannot list decisions with no query.

Légifrance's collections, when you ask for one: *judicial* (Cour de cassation and some courts of
appeal), *administrative* (Conseil d'État, cours administratives d'appel, tribunaux administratifs),
*constitutional*, *cnil* and *financial* (Cour des comptes and the regional and territorial chambers
of accounts).

## Find a decision

You can search three ways.

**By number.** A [*pourvoi*](../00-intro/03-glossary.md#pourvoi) number works in any spelling
(`24-16.924`, `2416924`):

> Find pourvoi 24-16.924. / Décision du Conseil constitutionnel 2026-1217 QPC.

On Judilibre, give the number as the search words. On Légifrance, the number has its own field and
also accepts Conseil d'État, CNIL, Conseil constitutionnel and Cour des comptes numbers. A
Conseil constitutionnel decision on joined cases carries a combined number such as `2026-1217/1218`; if you
give only one of the two numbers and nothing matches, the answer reminds you of the combined form.

**By ECLI.**

> Find ECLI:FR:CCASS:2025:SO01200.

**By words.**

> Cour de cassation decisions about "clause de non-concurrence" since 2024.

On Judilibre you choose how the words combine: all of them (the default), any of them, or an exact
phrase. When Judilibre finds no exact match it can loosen the search: the answer then has `"relaxed": true`
and a warning, `Judilibre found no exact match and loosened the search: these results match only some of the words.` On Légifrance
all the words must appear.

You can narrow a search by decision dates, court level, Cour de cassation chamber and publication
on both sources. On Judilibre you can also filter by formation, outcome and court location, and
search one part of the decision only: the *moyens*, the *motivation*, the summary and so on. Ask
the assistant for the values a filter accepts:
[`judilibre_list_taxonomy`](../30-tools/judilibre_list_taxonomy.md) lists Judilibre's.

Results come in pages of 10 by default (up to 20). The answer says how many decisions match (`results`), which
page you are on (`page`) and the sort order (`order`). On Légifrance you can sort by relevance or newest first; on
Judilibre also oldest first. Judilibre pages through its first 10,000 results only; a warning says
so when a search is larger, and narrowing it shows the others.

When nothing matches, the answer has `"outcome": "no_results"` and its warnings repeat your
criteria. On Légifrance's judicial collection they also repeat the coverage note above. To widen a
search, you can ask the assistant for any word instead of all (on Judilibre), fewer filters, another
jurisdiction, or the other source.

## Read a decision

Each hit carries a `read_with` field telling the assistant how to read it:

```
"read_with": { "tool": "judilibre_get_decision", "id": "6abcc10bc27382d099087409" }
"read_with": { "tool": "legifrance_get_decision", "id": "JURITEXT000053197030" }
```

Ask the assistant to "read it". The ids differ by source: Judilibre ids have 24 hexadecimal characters;
Légifrance ids are `JURITEXT`, `CETATEXT`, `CONSTEXT`, `CNILTEXT` or `JUFITEXT` followed by 12 digits.

The text is verbatim from the source. Names of natural persons are pseudonymised by the source.

### One zone of a decision

On Judilibre, a decision is divided into zones when the source marks them: *introduction*,
*expose*, *moyens*, *motivations*, *dispositif* and *annexes*. Cour de cassation decisions carry
them; court-of-appeal decisions seen in November 2026 did too, without *moyens*.

> Show me only the motivations of that decision. / Donne-moi seulement le dispositif.

Not every decision carries the markup. When the zone you ask for is missing, Vigueur says so in a
warning and shows the full text: `This decision has no "moyens" zone; showing the full text.` or, for a decision
with no markup at all, `This decision has no zone markup, so no "motivations" zone; showing the full
text.`

### What a decision record shows

Besides the `text`, the answer gives what the source records about the decision, each in its own field:

| Field | Meaning |
|---|---|
| `title`, `court`, `chamber`, `decided`, `numbers`, `ecli` | Court, chamber, decision date, numbers, ECLI |
| `formation`, `publication`, `solution`, `nature` | On Judilibre: formation, publication (a list, empty for a Cour de cassation decision not published in the Bulletin) and outcome (*Rejet*, *Cassation partielle sans renvoi*…). On Légifrance: nature, publication and outcome as Légifrance labels them (`ARRET`, `Inédit`, `Cassation`) |
| `attacked` | The decision the *pourvoi* challenges: its court and date, and on Judilibre its number and, when Judilibre holds it, the call that reads it |
| `summary` ([*sommaire*](../00-intro/03-glossary.md#sommaire)) | The court's summary, when there is one |
| `titles`, `visa`, `rapprochements`, `files` | Judilibre only, when the decision has them |
| `zones`, `zone` | Judilibre only: the zones the decision carries, and the one the text is limited to |
| `constitutional_council_link`, `jo_link` | For Conseil constitutionnel decisions on Légifrance |
| `legifrance_status` | For CNIL deliberations, the status as Légifrance labels it |

A field with nothing to show is `null` (or an empty list). Long decisions are paged: `part` says which
characters are shown and `next` gives the `offset` to continue from: ask the assistant to continue. See [Reading Vigueur's answers](05-reading-answers.md).

### Cross-checking the other source

A Cour de cassation decision with an ECLI has, on its last page, an `other_source` field holding the
call that searches the other source for that ECLI: on Légifrance, a Judilibre search (Légifrance
gives it for any judicial decision with an ECLI); on Judilibre, a Légifrance search. The search may
find nothing. Judilibre usually has the decision earlier, with zones; Légifrance, when it holds it,
weeks later.

## Related

- [Reading Vigueur's answers](05-reading-answers.md)
- [Judilibre](../40-sources/02-judilibre.md) and [Légifrance](../40-sources/01-legifrance.md)
- [Glossary](../00-intro/03-glossary.md) for *pourvoi*, *formation*, *moyens*, *dispositif*
