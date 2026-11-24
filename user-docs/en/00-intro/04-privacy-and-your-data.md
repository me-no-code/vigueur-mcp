---
title: Privacy and your data
level: guide
tags: [privacy, credentials, logs]
summary: Know what Vigueur stores and where, what leaves your computer, what the logs hold, and what uninstalling removes.
updated: 2026-11-24
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
| PISTE (piste.gouv.fr) | Your application's client ID and secret, to obtain an access token. Then each request Vigueur makes for the assistant: the words, numbers, identifiers and dates it searches or reads |
| npm (registry.npmjs.org), with `npx` | When the app starts Vigueur through `npx` (the default install and the Claude Code plugin): a request for Vigueur's package, to download it or check for a newer version. Nothing from your conversations or your credentials |
| Nobody else, from Vigueur | Vigueur sends nothing to any other address |

PISTE sees the requests made with your application, as it would for any developer using its API.
Its own terms and privacy notice apply to that; read them on piste.gouv.fr.

Your conversation with the assistant is a separate matter. What you type to it, and what Vigueur's
tools return to it, are handled by the app you use and, when its assistant runs as an online
service, by that service, under their own terms, not by Vigueur.

## What Vigueur stores

Vigueur writes nothing to disk: no files, no database, no copy of the law. The access token that
PISTE gives it stays in memory and is gone when the server stops. To avoid asking again, it also
keeps in memory, for a day at most: the list of Légifrance codes, the last two code tables of
contents it browsed, and the filter values Judilibre accepts. All of it is gone when the server
stops.

## Where your credentials are kept

The app that runs Vigueur asks for the settings and keeps them. Vigueur reads them when it starts.
It does not write them to its logs.

**With the default install** (see [Install Vigueur](../10-setup/02-install.md)), all three are in
the app's MCP configuration, as plain text, where you typed them. Keep that file private.

**With the Claude Code plugin** (see
[Install the Claude Code plugin](../10-setup/03-install-claude-code.md)):

| Setting | Where it is stored |
|---|---|
| PISTE client secret | Your system's secure credential store (on macOS, the Keychain) |
| PISTE client ID | Claude Code's user settings, `~/.claude/settings.json` |
| PISTE environment (`production` or `sandbox`) | Claude Code's user settings, `~/.claude/settings.json` |

**With the Claude Desktop bundle** (see
[Install the Claude Desktop bundle](../10-setup/04-install-claude-desktop.md)), all three are in one
settings file,
`~/Library/Application Support/Claude/Claude Extensions Settings/local.mcpb.vigueur-contributors.vigueur.json`:

| Setting | How it is stored |
|---|---|
| PISTE client secret | Encrypted by Claude Desktop |
| PISTE client ID | As typed |
| Production application | As typed (on or off) |

## Logs

Vigueur keeps no log file. It writes its own messages to its error output (*stderr*), and the app
that runs it decides whether to keep them, and where. Whatever the app, these messages are:

- its startup line, which states its version and the PISTE environment in use, for example
  `vigueur 0.1.0: ready on stdio (PISTE env: production)`;
- setup problems, such as a missing setting;
- errors: PISTE out of reach, an answer over the size cap
  (`<tool> answer (<source>, <outcome>) is N characters, over the 40000-character cap.`), or an
  unexpected error, with its stack trace.

They hold no tool arguments, results, credentials or questions, and they name a tool that was
called in two cases only: an answer over the size cap, and an unexpected error.

The app may add lines of its own to its logs, about the connection or the tools it called. With
the default install, the app's documentation says where its logs are and what they hold. The two
packages below were checked: their logs hold no tool arguments, results, credentials or questions
either.

**With the Claude Code plugin**, Claude Code keeps a connection log for each project where Vigueur
ran. On macOS they are in
`~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-vigueur-vigueur/`. A log records:

- connection events;
- Vigueur's startup line;
- the names of the tools that were called, with their timing;
- error traces.

**With the Claude Desktop bundle**, Claude Desktop keeps its logs in `~/Library/Logs/Claude/`:

- `mcp-server-Vigueur.log`: when Vigueur starts and stops, and the list of its tools;
- `mcp.log`, Claude Desktop's log for all its MCP servers: the same lines for Vigueur;
- `main.log`, Claude Desktop's own log: among its other messages, Vigueur's own.

## Your conversation history

The app you use decides whether to keep your conversations, including what Vigueur's tools
returned, and where, as for any conversation. That history belongs to the app, and so do the
controls over it. Vigueur does not read or write it. Claude Code, for example, keeps it in
`~/.claude/projects/`, and Claude Desktop in your Claude account.

## What uninstalling removes and leaves

Uninstalling removes Vigueur's settings, the client secret included: with the default install, when
you remove the server from the app's configuration; with the Claude Code plugin or the Claude
Desktop bundle, when you uninstall it. The logs and your conversation history stay, and so do npm's
copy of Vigueur in its cache, the bundle file, and the folder you built Vigueur in if you ran it
from its source code. Claude Code also leaves its copy of the plugin in
`~/.claude/plugins/cache/vigueur/` until it clears it later on its own. The steps and the full list
are in [Uninstall Vigueur](../10-setup/06-uninstalling.md).

## Your PISTE account

Uninstalling Vigueur does not touch your PISTE account or application. You manage them on
piste.gouv.fr, and Vigueur never changes them.
