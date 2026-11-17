---
title: How Vigueur works
level: intro
tags: [intro, architecture, privacy]
summary: Understand what runs where when you ask Claude a question, and what the answers do and do not contain.
updated: 2026-11-16
---

# How Vigueur works

Vigueur is a small program that runs on your computer, next to Claude Code. Claude uses it to read
the official sources of French law. This page shows what happens between your question and the
answer.

## Your question goes from Claude to the source and back

```
You  <->  Claude  <->  Vigueur (on your computer)  <->  PISTE  <->  Légifrance / Judilibre
```

1. You ask Claude a question.
2. Claude decides which of Vigueur's tools to use, and with which words, numbers or dates. You do
   not pick the tool yourself, though you can name one if you want Claude to use it. The
   [tool pages](../README.md#tools) list them all.
3. Vigueur sends the request to [PISTE](03-glossary.md#piste), the French government's API
   gateway, using your own credentials.
4. PISTE passes it to [Légifrance](03-glossary.md#légifrance) or [Judilibre](03-glossary.md#judilibre)
   and returns the official data.
5. Vigueur puts the data into a structured answer, one JSON object with named fields, and hands it
   to Claude, which writes its reply to you. The answer is built for Claude to read: its fields keep
   the facts apart (the text, the dates, the status, the link). You can ask Claude to show it as it
   came. See [Reading Vigueur's answers](../20-using/05-reading-answers.md).

Claude may use several tools for one question, for example a search, then a reading of the article
it found, then its history.

## Your own PISTE application

Vigueur has no shared account and no server of its own. You create a free PISTE account and an
application, and Vigueur uses that application's client ID and client secret to ask PISTE for a
short-lived access token. Your questions count against your own application, not anyone else's.
See [Create your PISTE account](../10-setup/01-piste-account.md).

## What an answer contains

Vigueur is built to report, not to interpret. An answer gives, where the source provides them:

- the text or the decision, as the source holds it (in decisions, the source pseudonymises the
  names of the people involved);
- the legal status and, for an article or a text, whether it is in force on the date asked, computed
  from its validity dates;
- the relevant dates: when a version started, when it ended, the date of a decision;
- identifiers such as the Légifrance id, the NOR, the pourvoi number or the ECLI;
- a link to the official page, in the `link` field of the answer or, in a list, of each item.

When a source is silent or incomplete, the answer says so instead of filling the gap: a field the
source gives no value for is `null`, and a sentence in `warnings` says what is missing. A list that
is too long is cut into pages, and the answer says how to ask for the next one.

> **No legal advice**
> Vigueur and the answers it produces state facts from the sources. They do not say what you should
> do, which rule wins, or what a decision means for your case. Claude may add its own explanation
> around the facts; that explanation is Claude's, not the source's. Check the official link.

## What stays on your computer

Vigueur writes nothing to disk: no files and no copy of the law. The access token PISTE gives it,
and the few lists it reuses for a day at most, live in memory only. The only place Vigueur sends
requests to is PISTE. For the details, see [Privacy and your data](04-privacy-and-your-data.md).

## When something is not working

Ask Claude to run `vigueur_status`. It checks your credentials and whether Légifrance and Judilibre
answer. See [Troubleshooting and FAQ](05-troubleshooting.md).
