---
title: Glossary
level: reference
tags: [glossary, terms]
summary: Look up the French legal and technical terms that Vigueur's answers use.
updated: 2026-11-16
---

# Glossary

The terms below are the ones Vigueur's answers and setup pages use, in alphabetical order. French
terms stay in French. Each entry is a short explanation of the word, not legal advice.

### Arrêt

A decision of a higher court, such as the Cour de cassation or a *cour d'appel*.

### Attacked decision

The decision that a *pourvoi* challenges (*décision attaquée*). Judilibre and Légifrance decisions
show it in the `attacked` field when the source states it. When Judilibre also holds the
attacked decision, the answer gives the call that reads it, so Claude can read it next.

### Bulletin

See [Publication level](#publication-level).

### Cached

The `cached` field of an answer. It lists content that came from Vigueur's memory instead of a fresh
request, each entry with what it is (`what`) and when it was fetched (`retrieved`). The list is empty
when everything was fetched for this call. See [Reading Vigueur's answers](../20-using/05-reading-answers.md#what-every-answer-contains).

### CETAT

Légifrance's name for its administrative case-law collection: decisions of the Conseil d'État, the
*cours administratives d'appel* and the *tribunaux administratifs*. Ask for it as the
"administrative" collection. See [Collection](#collection).

### Chamber

*Chambre*: a division of the Cour de cassation (for example the *chambre sociale* or the *première
chambre civile*). A decision shows its chamber, and a search can be narrowed to one.

### CNIL

The *Commission nationale de l'informatique et des libertés*. Légifrance holds its deliberations as a
case-law collection called "cnil". See [Collection](#collection).

### Code

A consolidated code such as the *Code civil* or the *Code du travail*. Articles are cited by code
and article number, for example "Code du travail, L1234-1". Give the code's full title; Vigueur
also knows common abbreviations of the main codes, such as "C. trav." or "CGI".

### Collection

A group of documents in one search. Légifrance searches take one collection at a time.

| Search | Collections |
|---|---|
| Legislation | `codes`, `loda`, `jorf`, `kali` |
| Case law | `judicial` (JURI), `administrative` (CETAT), `constitutional` (CONSTIT), `cnil` (CNIL), `financial` (JUFI) |

### Concordance

Légifrance's record of where the content of an article went when articles were renumbered, moved or
replaced. When it exists, an answer about a repealed or moved article says "per Légifrance
concordance" and names the new location. Vigueur reports the concordance; it does not infer one.

### Consolidated text

A law, decree or code as it reads on a given date, with every later amendment worked into it, as
opposed to the text as it was first published. See [JORF](#jorf-journal-officiel) and
[Version](#version).

### CONSTIT

Légifrance's name for the Conseil constitutionnel case-law collection. Ask for it as the
"constitutional" collection. See [Collection](#collection).

### ECLI

European Case Law Identifier: a standard code for one decision, such as
`ECLI:FR:CCASS:2025:SO01200`. Decisions from both sources show it when they have one. You can give
an ECLI to a search to find that decision.

### Envelope

The fields every Vigueur answer has, around the facts of the tool: `source`, `outcome`, `warnings`
first, then the tool's own fields, then `request`, `retrieved`, `cached` and `vigueur_version`.
See [Reading Vigueur's answers](../20-using/05-reading-answers.md#what-every-answer-contains).

### Formation

*Formation*: the bench within a chamber of the Cour de cassation that decided. Judilibre uses these
labels.

| Label shown | Meaning |
|---|---|
| Formation plénière de chambre | The whole chamber |
| Formation mixte | A mixed bench |
| Formation de section | A section of the chamber |
| Formation restreinte | A reduced bench |
| Formation restreinte hors RNSM/NA | A reduced bench, outside the [RNSM/NA](#rnsmna) procedure |
| Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission) | A reduced bench, deciding by [RNSM/NA](#rnsmna) |

### IDCC

The number that identifies a national collective agreement. You can search collective agreements by
IDCC. See [KALI](#kali).

### In force

*En vigueur*. Vigueur computes whether an article or a text applies on a given date from its
validity dates, and states both ends of the period in the `status` field. See
[Validity dates](#validity-dates) and [Status state](#status-state).

```
"status": {
  "state": "in_force",
  "on": "2015-01-01",
  "from": "1804-03-21",
  "until": "2016-10-01",
  "until_undetermined": false
}
```

Légifrance's own label for the version is given beside it, in `legifrance_status`. See
[Status (Légifrance's own word)](#status-légifrances-own-word).

### JORF (Journal officiel)

The *Journal officiel de la République française*, where laws, decrees and orders are published.
"JORF" is the Légifrance collection holding texts as published, without later amendments. A text
id starting with `JORFTEXT` is a text as published. Compare [Consolidated text](#consolidated-text).

### Judilibre

The Cour de cassation's open-data database of court decisions: the Cour de cassation itself and
courts of appeal, *tribunaux judiciaires*, *tribunaux de commerce* and *conseils de prud'hommes*.
Names of natural persons are pseudonymised by the source. See [Judilibre](../40-sources/02-judilibre.md).

### JUFI

Légifrance's name for the financial case-law collection: the *Cour des comptes* and the regional and
territorial *chambres des comptes*. Ask for it as the "financial" collection. See
[Collection](#collection).

### JURI

Légifrance's name for the judicial case-law collection: Cour de cassation decisions and some courts
of appeal. Ask for it as the "judicial" collection. Légifrance does not hold every Cour de cassation
decision; see [RNSM/NA](#rnsmna) and [Légifrance](../40-sources/01-legifrance.md).

### KALI

Légifrance's collection of national collective agreements (*conventions collectives*), searched by
[IDCC](#idcc). A search returns the agreements currently in force, extended or not. Agreements are
found with a legislation search and their articles read as articles; they are not read as texts.

### Légifrance

The French government's official legal publication service: codes, consolidated laws and decrees,
the *Journal officiel*, collective agreements and part of the case law. See
[Légifrance](../40-sources/01-legifrance.md).

### Légifrance id

An identifier that Légifrance gives each document. The prefix tells the kind.

| Prefix | What it identifies |
|---|---|
| `LEGIARTI` | A version of a code article |
| `LEGITEXT` | A consolidated text or code |
| `JORFTEXT` | A text as published in the *Journal officiel* |
| `KALIARTI` | A version of a collective-agreement article |
| `JURITEXT`, `CETATEXT`, `CONSTEXT`, `CNILTEXT`, `JUFITEXT` | A decision in the judicial, administrative, constitutional, CNIL or financial collection |

Answers show these ids so that Claude can read the same document again, and so that you can quote it.

### LODA

*Lois et décrets*: Légifrance's collection of consolidated laws, ordinances, decrees and orders.
Searches in it return the versions in force on a date (today by default). Compare
[JORF](#jorf-journal-officiel).

### Next and part

The paging fields. `next` says where the rest starts: `{ "page": 2 }` for a list, `{ "offset": 38000 }`
for a long text, or `null` when nothing is left. `part` says which characters of a long text the
answer shows: `from`, `to` and `of` (the length of the whole text). See
[Reading Vigueur's answers](../20-using/05-reading-answers.md#long-answers-are-cut-and-paged).

### NOR

The identifier of a text published in the *Journal officiel*. You can read a text by its NOR, and
search the *Journal officiel* by NOR.

### Nota

A note that Légifrance attaches to an article, often about when or how it applies. Answers show it
in the `note` field.

### Outcome

The `outcome` field of an answer: the kind of answer it is, such as `found`, `not_found`,
`several_matches`, `not_in_force`, `results`, `no_results`, `not_configured` or `error`. See
[Reading Vigueur's answers](../20-using/05-reading-answers.md#the-outcome-says-what-kind-of-answer-it-is).

### PISTE

The French government's API gateway, at piste.gouv.fr. Vigueur reaches Légifrance and Judilibre
only through PISTE, with your own application's credentials. See
[Create your PISTE account](../10-setup/01-piste-account.md) and [PISTE](../40-sources/03-piste.md).

### Pourvoi

An appeal to the Cour de cassation. Its number looks like `23-20.348`. A *pourvoi* number can be
given in any spelling, such as `23-20.348` or `2320348`, to find a decision.

### Production

One of the two PISTE environments. A PISTE application you create yourself is a production
application; its credentials only work with the production setting. Compare [Sandbox](#sandbox).

### Publication level

How widely the Cour de cassation published a decision. Judilibre uses these labels.

| Label shown | Meaning |
|---|---|
| Publié au Bulletin | Published in the *Bulletin* of the Cour de cassation |
| Publié au Rapport | Published in the *Rapport* of the Cour de cassation |
| Publié aux Lettres de chambre | Published in the chamber's letters |
| Communiqué | Accompanied by a press release (*communiqué*) |
| Non publié | Not published |

A Cour de cassation decision that carries none of these labels has an empty `publication` list: it
is not published in the Bulletin.

### Rapprochements

A list of related items that Judilibre gives for some Cour de cassation decisions. Vigueur gives it
in the `rapprochements` field when the source has it.

### Request

The `request` field of an answer: the call that was made, with the tool name and each parameter at the
value used, defaults included. See [Reading Vigueur's answers](../20-using/05-reading-answers.md#what-every-answer-contains).

### Retrieved

The `retrieved` field of an answer: when Vigueur put the answer together from what the source
returned, as a date and time in UTC (`2026-11-16T10:42:07Z`).

### RNSM/NA

*Rejet non spécialement motivé* or *non-admission*: a decision of the Cour de cassation that rejects
a *pourvoi* without detailed reasons. Judilibre labels the *formation restreinte* that decides these
"RNSM/NA". Légifrance does not hold these decisions, so use Judilibre to find them.

### Sandbox

One of the two PISTE environments, for testing. PISTE creates one sandbox application for you when
you open an account; its credentials only work with the sandbox setting. Compare
[Production](#production).

### Solution

The outcome of a Cour de cassation decision as Judilibre labels it, for example *Cassation*, *Rejet*,
*Irrecevabilité* or *Avis*. A search can be narrowed to one outcome.

### Sommaire

The summary of a decision's legal point, written by the court for some decisions. Answers give it in the
`summary` field when the source has one.

### Status (Légifrance's own word)

Légifrance records a legal status for each version of an article or text, in French capitals. An
answer gives it in the `legifrance_status` field, next to the in-force `status`. The common ones:

| Word | Reading |
|---|---|
| `VIGUEUR` | In force |
| `VIGUEUR_ETEN`, `VIGUEUR_NON_ETEN` | In force, extended or not extended (collective agreements) |
| `VIGUEUR_DIFF` | Entry into force deferred to a later date |
| `MODIFIE` | Modified: a later version replaced this one |
| `MODIFIE_MORT_NE` | Still-born: replaced before it ever applied |
| `ABROGE` | Repealed |
| `ABROGE_DIFF` | Repeal scheduled for a later date |
| `ANNULE` | Annulled |
| `PERIME` | Expired |
| `TRANSFERE`, `DEPLACE` | Moved elsewhere |
| `SUBSTITUE`, `REMPLACE` | Replaced |

Vigueur works out "in force on this date" from the validity dates, not from this word. When
Légifrance labels a version in force but also records its repeal, the answer warns you.

### Status state

The `state` inside the `status` field of an article, a text or a section: whether that version
applies on the date `on`, computed by Vigueur from its validity dates. One of `in_force`,
`not_in_force`, `not_yet_in_force` and `never_applied`. See
[Reading Vigueur's answers](../20-using/05-reading-answers.md#in-force-on-a-date-is-computed-from-dates).

### Validity dates

For each version of an article or text, the date it starts and the date it ends. A version with no
end date has none recorded (`until` is `null`); a version whose end is recorded but not yet dated has
`until_undetermined` set to `true`. See [In force](#in-force) and [Version](#version).

### Version

Each time an article or text is amended, Légifrance records a new version with its own validity
dates. An article's history lists every version, and the texts that created, amended or repealed it.
Ask for a past date to read the version that applied then.

### Visa

The opening references of a decision (the texts it relies on). Judilibre shows the visa of a Cour de
cassation decision when it has one.

### Warnings

The `warnings` field of an answer: a list of sentences about the answer that no other field carries,
such as a disagreement in the source's data or a check that could not be completed. It is empty when
there is nothing to say. See [Reading Vigueur's answers](../20-using/05-reading-answers.md#warnings).

### Zone

A named part of a decision on Judilibre. Ask Claude for one zone to read only that part.

| Zone | Part of the decision |
|---|---|
| `introduction` | The opening: court, parties, the *pourvoi* |
| `expose` | The facts and the procedure (*exposé du litige*) |
| `moyens` | The grounds a party argues (*moyens*) |
| `motivations` | The court's reasoning (*motivations*) |
| `dispositif` | The operative part, where the court rules (*dispositif*) |
| `annexes` | Annexes, when there are any |

Cour de cassation decisions carry zones when the source marks them; court-of-appeal decisions seen
in November 2026 had them too, without `moyens`. Some decisions carry no zone markup; Vigueur then
shows the full text and says so.
