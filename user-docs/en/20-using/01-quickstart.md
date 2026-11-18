---
title: "Quickstart: your first questions"
level: start
tags: [quickstart, legislation, case-law]
summary: "Run a first session end to end: check that Vigueur has access, read an article, see what applied on a past date and find a decision."
updated: 2026-11-18
---

# Quickstart: your first questions

This page walks you through a first session. You type requests to Claude in plain language, in French
or in English. Claude calls Vigueur's tools and shows you what the official sources say. You need
Vigueur installed, [in Claude Desktop](../10-setup/03-install-claude-desktop.md) or
[in Claude Code](../10-setup/02-install-claude-code.md), with your PISTE credentials set.

## 1. Check that Vigueur can reach the sources

Ask:

> Check that Vigueur is set up. / Vérifie que Vigueur est bien configuré.

Claude runs `vigueur_status`. Vigueur's answers are JSON: on the wire, one line of JSON; here it is
indented so you can read it. When everything works, the answer reads:

```
{
  "source": "PISTE",
  "outcome": "results",
  "warnings": [],
  "environment": "sandbox",
  "checks": [
    {
      "source": "Légifrance",
      "state": "ok",
      "detail": null,
      "retry_after_seconds": null
    },
    {
      "source": "Judilibre",
      "state": "ok",
      "detail": null,
      "retry_after_seconds": null
    }
  ],
  "request": {
    "tool": "vigueur_status"
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

A source whose `state` is not `ok` has a problem (for example `not_enabled` or
`credentials_invalid`). With no credentials at all, the answer has `"outcome": "not_configured"`.
See [`vigueur_status`](../30-tools/vigueur_status.md) for what each state means, and
[Troubleshooting and FAQ](../00-intro/05-troubleshooting.md) for what to do.

## 2. Read an article

Ask:

> What does article 1240 of the Code civil say? / Que dit l'article 1240 du Code civil ?

Claude runs `legifrance_get_article`. The answer shows these fields (`…` marks fields and text left
out of the excerpt):

```
{
  …
  "outcome": "found",
  …
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
  "text": "Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duque…",
  …
  "retrieved": "2026-11-16T10:42:07Z",
  …
}
```

- `code` and `number`: the code and the article number;
- `status`: whether the article applied on the date asked (`on`), with its `from` and `until` dates;
  `until` is `null` when no end is recorded;
- `section`: where the article sits in the code;
- `text`: the article text;
- `link` and `id`: the legifrance.gouv.fr link and the Légifrance id.

If you give a number without a code and it exists in several codes (L1234-1 does), the answer lists
the codes and picks none. Name the code and ask again. See
[Codes, laws and decrees](02-legislation.md).

## 3. Ask what applied on a past date

Ask:

> What did article 1382 of the Code civil say on 1 January 2015? / Que disait l'article 1382 du Code civil au 1er janvier 2015 ?

Claude runs `legifrance_get_article` with that date. The answer shows the text as it stood then, and a
`status` with both bounds: `"state": "in_force"`, `"from": "1804-03-21"`, `"until": "2016-10-01"`, and
Légifrance's own label `"legifrance_status": "MODIFIE"`. Article 1382 was renumbered, so the answer
also says, in `relocation`, where Légifrance records that the content moved:

```
"relocation": "Content moved — per Légifrance concordance, the text of art. 1382 as of 2015-01-01 is now at Code civil - art. 1240 (V) (since 2016-10-01)."
```

Ask "and who amended it?" to get the list of versions and the amending texts
(`legifrance_get_article_history`).

## 4. Find a decision

Ask:

> Find the Cour de cassation decision with pourvoi number 23-20.348. / Trouve l'arrêt de la Cour de cassation sur le pourvoi 23-20.348.

Claude searches Judilibre (`judilibre_search_decisions`). This decision is an unreasoned rejection,
which Légifrance does not hold. Each hit shows the court and chamber, the decision date, the numbers,
the ECLI, then the formation, the publication and the outcome, then a summary and an excerpt when
there are any, the official `link` and `read_with`, the call that reads the decision in full:

```
{
  …
  "outcome": "results",
  …
  "results": 1,
  …
  "items": [
    {
      "title": "Cour de cassation, Deuxième chambre civile — decision of 2026-05-21 — n° 23-20.348 — ECLI:FR:CCASS:2…",
      "id": "6a0e9ff1cdc6046d47668703",
      "ecli": "ECLI:FR:CCASS:2026:C210500",
      "link": "https://www.courdecassation.fr/decision/6a0e9ff1cdc6046d47668703",
      "jurisdiction": "cc",
      "location": null,
      "chamber": "Deuxième chambre civile",
      "decided": "2026-05-21",
      "numbers": [
        "23-20.348"
      ],
      "formation": "Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)",
      "publication": [],
      "solution": "Rejet",
      "summary": null,
      "excerpt": null,
      "read_with": {
        "tool": "judilibre_get_decision",
        "id": "6a0e9ff1cdc6046d47668703"
      }
    }
  ],
  …
}
```

Ask Claude to read the decision, or only its reasoning (the
[*motivations* zone](../00-intro/03-glossary.md#zone)). See [Case law](03-case-law.md).

## 5. Check what the answer tells you

Each answer about the law carries its `source` and an official `link`. Read the `status`
before you rely on a text, and open the link if you need the official page. The common parts of an
answer are explained in [Reading Vigueur's answers](05-reading-answers.md).

> **Vigueur reports, it does not advise**
> Vigueur reads what Légifrance and Judilibre say. It draws no conclusion and gives no legal advice.

## Where next

- [Codes, laws and decrees](02-legislation.md)
- [Case law](03-case-law.md)
- [The Journal officiel and tracking changes](04-journal-officiel.md)
