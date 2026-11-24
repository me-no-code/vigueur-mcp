---
title: Welcome to Vigueur
level: intro
tags: [intro, overview]
summary: Know what Vigueur lets you do with French law from an AI assistant, what it does not do, and which page to read next.
updated: 2026-11-24
---

# Welcome to Vigueur

Vigueur lets you read French law in its official sources, from an AI assistant. You ask a
question in plain language, in French or in English. The assistant looks the text or the decision
up on Légifrance or Judilibre, and gets back what the source says: the text, whether it is in
force, the dates, and a link to the official page.

Vigueur runs on your computer and uses your own free account on the French government's API
portal. Nothing goes through a Vigueur server: there is none.

## What you can ask the assistant

- "What does article 1240 of the Code civil say?" The assistant reads the article, and the answer
  says whether it is in force today.
- "What did article L1234-1 of the Code du travail say on 1 January 2015?" The assistant reads the
  version that applied on that date.
- "What changed in the Code de la consommation since 1 January 2026?" The answer lists the changes.
- "Find Cour de cassation decisions on the pourvoi 23-20.348." The assistant finds the decision
  and can read all of it, or one part of it.
- "What was published in the latest Journal officiel?" The answer lists the latest issues.

Answers carry their source, the legal status where the source gives one, the relevant dates and
the official links. See [Reading Vigueur's answers](../20-using/05-reading-answers.md).

## What Vigueur does not do

> **Facts, not advice**
> Vigueur reports what the official sources say. It gives no legal advice, does not tell you which
> rule applies to your situation, and does not rank decisions by how useful they are to you. Check
> the official link before you rely on a text, and ask a legal professional about your own case.

- It reads only. It never changes anything at the sources.
- It does not hold a copy of the law. Each answer is fetched from the source when you ask.
- It covers Légifrance and Judilibre only. Other sources, such as European law, are not covered.
- It cannot read what the sources do not hold. For example, Légifrance does not hold every Cour de
  cassation decision; see [Légifrance](../40-sources/01-legifrance.md).

## Sources covered

| Source | What it holds | Page |
|---|---|---|
| [Légifrance](03-glossary.md#légifrance) | Codes, laws and decrees, the Journal officiel, collective agreements, and case law: judicial, administrative and financial courts, the Conseil constitutionnel and the CNIL | [Légifrance](../40-sources/01-legifrance.md) |
| [Judilibre](03-glossary.md#judilibre) | Decisions of the Cour de cassation and of the lower courts | [Judilibre](../40-sources/02-judilibre.md) |

Both are reached through [PISTE](03-glossary.md#piste), the government's API gateway. See
[PISTE](../40-sources/03-piste.md).

## Where to go next

1. [How Vigueur works](02-how-it-works.md): a short picture of what happens when you ask.
2. [Create your PISTE account](../10-setup/01-piste-account.md): free, a few minutes.
3. [Install Vigueur](../10-setup/02-install.md): the install steps for any app, with the
   [Claude Code plugin](../10-setup/03-install-claude-code.md) and the
   [Claude Desktop bundle](../10-setup/04-install-claude-desktop.md) as ready-made packages for
   those two apps.
4. [Quickstart: your first questions](../20-using/01-quickstart.md): what to type first.

Words you do not know are in the [glossary](03-glossary.md). If something goes wrong, see
[Troubleshooting and FAQ](05-troubleshooting.md).
