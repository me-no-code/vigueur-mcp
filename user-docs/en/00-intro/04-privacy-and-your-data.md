---
title: Privacy and your data
level: guide
tags: [privacy, credentials, logs]
summary: Know what Vigueur stores and where, what leaves your computer, what the logs hold, and what uninstalling removes.
updated: 2026-11-17
---

# Privacy and your data

Vigueur runs on your computer and talks to one place only: PISTE, the French government's API
gateway. It has no server, no account system and no analytics of its own. This page says what is
stored where, and what you can do about it.

> **Tested on macOS only**
> The locations below were checked on macOS. On Windows and Linux, the credential store and the log
> folders are elsewhere.

## What leaves your computer

| Who receives it | What |
|---|---|
| PISTE (piste.gouv.fr) | Your application's client ID and secret, to obtain an access token. Then each request Vigueur makes for Claude: the words, numbers, identifiers and dates it searches or reads |
| Nobody else, from Vigueur | Vigueur sends nothing to any other address |

PISTE sees the requests made with your application, as it would for any developer using its API.
Its own terms and privacy notice apply to that; read them on piste.gouv.fr.

Your conversation with Claude is a separate matter. What you type to Claude, and what Vigueur's tools
return to it, are handled by Claude Code and Anthropic under their own terms, not by Vigueur.

## What Vigueur stores

Vigueur writes nothing to disk: no files, no database, no copy of the law. The access token that
PISTE gives it stays in memory and is gone when the server stops. To avoid asking again, it also
keeps in memory, for a day at most: the list of Légifrance codes, the last two code tables of
contents it browsed, and the filter values Judilibre accepts. All of it is gone when the server
stops.

## Where your credentials are kept

Claude Code asks for three settings when you enable the plugin. See
[Install in Claude Code](../10-setup/02-install-claude-code.md).

| Setting | Where it is stored |
|---|---|
| PISTE client secret | Your system's secure credential store (on macOS, the Keychain) |
| PISTE client ID | Claude Code's user settings, `~/.claude/settings.json` |
| PISTE environment (`production` or `sandbox`) | Claude Code's user settings, `~/.claude/settings.json` |

Vigueur reads them when it starts. It does not write them to its logs.

> **Keep private files out of the folder you install from**
> Claude Code copies the whole folder you install Vigueur from into
> `~/.claude/plugins/cache/vigueur/`. Do not put a `.env` file or any private document in that
> folder.

## Logs

Claude Code keeps a connection log for each project where Vigueur ran. On macOS they are in
`~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-vigueur-vigueur/`. A log records:

- connection events;
- Vigueur's startup line, which states the PISTE environment in use;
- the names of the tools that were called, with their timing;
- error traces.

A log holds no tool arguments, no results and no credentials. It does not hold your questions.

## Your conversation history

Claude Code keeps your conversations, including what Vigueur's tools returned, in
`~/.claude/projects/`, like any conversation. That belongs to Claude Code, and so do the controls
over it. Vigueur does not read or write it.

## What uninstalling removes and leaves

| | Removed | Left behind |
|---|---|---|
| Plugin registration | Yes | |
| Client ID and environment | Yes | |
| Client secret | Yes, removed from the credential store | |
| Plugin copy in `~/.claude/plugins/cache/vigueur/` | | Yes, marked orphaned. Claude Code clears orphaned copies later on its own; you can delete the folder yourself |
| Connection logs | | Yes, one folder per project |
| Conversation history | | Yes, it belongs to Claude Code |
| The folder you cloned | | Yes, delete it yourself |

The steps are in [Uninstall Vigueur](../10-setup/05-uninstalling.md).

## Your PISTE account

Uninstalling Vigueur does not touch your PISTE account or application. You manage them on
piste.gouv.fr, and Vigueur never changes them.
