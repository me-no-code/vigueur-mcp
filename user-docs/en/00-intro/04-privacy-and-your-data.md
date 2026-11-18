---
title: Privacy and your data
level: guide
tags: [privacy, credentials, logs]
summary: Know what Vigueur stores and where, what leaves your computer, what the logs hold, and what uninstalling removes.
updated: 2026-11-18
---

# Privacy and your data

Vigueur runs on your computer and talks to one place only: PISTE, the French government's API
gateway. It has no server, no account system and no analytics of its own. This page says what is
stored where, and what you can do about it.

> **Tested on macOS only**
> The locations below were checked on macOS, in November 2026. On Windows and Linux, the credential
> store and the log folders are elsewhere.

## What leaves your computer

| Who receives it | What |
|---|---|
| PISTE (piste.gouv.fr) | Your application's client ID and secret, to obtain an access token. Then each request Vigueur makes for Claude: the words, numbers, identifiers and dates it searches or reads |
| Nobody else, from Vigueur | Vigueur sends nothing to any other address |

PISTE sees the requests made with your application, as it would for any developer using its API.
Its own terms and privacy notice apply to that; read them on piste.gouv.fr.

Your conversation with Claude is a separate matter. What you type to Claude, and what Vigueur's tools
return to it, are handled by the Claude app you use and by Anthropic under their own terms, not by
Vigueur.

## What Vigueur stores

Vigueur writes nothing to disk: no files, no database, no copy of the law. The access token that
PISTE gives it stays in memory and is gone when the server stops. To avoid asking again, it also
keeps in memory, for a day at most: the list of Légifrance codes, the last two code tables of
contents it browsed, and the filter values Judilibre accepts. All of it is gone when the server
stops.

## Where your credentials are kept

The app that runs Vigueur asks for the settings and keeps them. Vigueur reads them when it starts.
It does not write them to its logs.

**In Claude Desktop** (see [Install in Claude Desktop](../10-setup/03-install-claude-desktop.md)),
all three are in one settings file,
`~/Library/Application Support/Claude/Claude Extensions Settings/local.mcpb.vigueur-contributors.vigueur.json`:

| Setting | How it is stored |
|---|---|
| PISTE client secret | Encrypted by Claude Desktop |
| PISTE client ID | As typed |
| Production application | As typed (on or off) |

**In Claude Code** (see [Install in Claude Code](../10-setup/02-install-claude-code.md)):

| Setting | Where it is stored |
|---|---|
| PISTE client secret | Your system's secure credential store (on macOS, the Keychain) |
| PISTE client ID | Claude Code's user settings, `~/.claude/settings.json` |
| PISTE environment (`production` or `sandbox`) | Claude Code's user settings, `~/.claude/settings.json` |

> **Keep private files out of the folder you install from**
> Claude Code copies the whole folder you install Vigueur from into
> `~/.claude/plugins/cache/vigueur/`. Do not put a `.env` file or any private document in that
> folder. The Claude Desktop bundle holds only Vigueur and the libraries it runs on.

## Logs

Neither app's logs hold tool arguments, results, credentials or your questions.

**Claude Desktop** keeps its logs in `~/Library/Logs/Claude/`:

- `mcp-server-Vigueur.log`: when Vigueur starts and stops, and the list of its tools;
- `mcp.log`, Claude Desktop's log for all its MCP servers: the same lines for Vigueur;
- `main.log`, Claude Desktop's own log: among its other messages, Vigueur's startup line, which
  states its version and the PISTE environment in use.

They name a tool Claude called in two cases only, both in Vigueur's own messages in `main.log`:
an answer over the size cap (`<tool> answer (<source>, <outcome>) is N characters, over the 40000-character cap.`)
and an unexpected error (its stack trace).

**Claude Code** keeps a connection log for each project where Vigueur ran. On macOS they are in
`~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-vigueur-vigueur/`. A log records:

- connection events;
- Vigueur's startup line, which states the PISTE environment in use;
- the names of the tools that were called, with their timing;
- error traces.

## Your conversation history

The Claude app keeps your conversations, including what Vigueur's tools returned, like any
conversation: Claude Desktop in your Claude account, Claude Code in `~/.claude/projects/`. That
belongs to the app, and so do the controls over it. Vigueur does not read or write it.

## What uninstalling removes and leaves

Uninstalling removes Vigueur's settings, the client secret included, in both apps. The logs and your
conversation history stay; Claude Code also leaves its copy of the plugin in
`~/.claude/plugins/cache/vigueur/` until it clears it later on its own. The folder you cloned and
the bundle file stay where you put them. The steps and the full list are in
[Uninstall Vigueur](../10-setup/05-uninstalling.md).

## Your PISTE account

Uninstalling Vigueur does not touch your PISTE account or application. You manage them on
piste.gouv.fr, and Vigueur never changes them.
