---
title: Uninstall Vigueur
level: guide
tags: [uninstall, cli, claude-desktop, claude-code, privacy]
summary: Remove Vigueur and its credentials from the app that runs it, and know what is left behind and how to clear it.
updated: 2026-11-24
---

# Uninstall Vigueur

You remove Vigueur from the app that runs it. A few things are left behind; this page lists them.

> **Tested on macOS**
> On other systems, the credential store and the logs are elsewhere.

## Default install

If you followed [Install Vigueur](02-install.md):

1. Remove the `vigueur` server from the app's MCP configuration, then restart the app. The client
   secret goes with it: it was in that configuration.
2. If you ran Vigueur from its source code, delete the folder you unzipped or cloned.

| What is left | Where | What to do |
|---|---|---|
| npm's copy of Vigueur | npm's cache, in `~/.npm/_npx/` on macOS and Linux | Harmless. With npm 11 or later, `npm cache npx ls` shows its entry and `npm cache npx rm <entry>` removes it |
| Logs | Where the app keeps the logs of its MCP servers, if it does | See the app's documentation |
| Conversation history | In the app | Belongs to the app. It keeps the tool results like any conversation |
| Your PISTE account and application | piste.gouv.fr | Untouched. Manage them on the PISTE site |

## Claude Code plugin

1. In Claude Code, run:

   ```
   /plugin uninstall vigueur@vigueur
   /plugin marketplace remove vigueur
   ```

Claude Code removes the plugin's registration, the client ID and the environment setting, and the
client secret: its value is removed from your system's credential store.

| What is left | Where | What to do |
|---|---|---|
| The plugin copy | `~/.claude/plugins/cache/vigueur/`, marked orphaned | Claude Code clears orphaned copies on its own later. Or delete the folder |
| npm's copy of Vigueur | npm's cache, in `~/.npm/_npx/` on macOS and Linux | Harmless. With npm 11 or later, `npm cache npx ls` shows its entry and `npm cache npx rm <entry>` removes it |
| Connection logs | On macOS, one folder per project where Vigueur ran, in `~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-vigueur-vigueur/` | Delete the folders if you want them gone |
| Conversation history | `~/.claude/projects/` | Belongs to Claude Code. It keeps the tool results like any conversation |
| Your PISTE account and application | piste.gouv.fr | Untouched. Manage them on the PISTE site |

## Claude Desktop bundle

Open **Settings**, then **Extensions**, then **Vigueur**, and click **Uninstall**.

Claude Desktop removes the extension and its settings, client secret included: after a reinstall,
Vigueur starts with no credentials.

| What is left | Where | What to do |
|---|---|---|
| Logs | `~/Library/Logs/Claude/`: `mcp-server-Vigueur.log`, and Vigueur's lines in `mcp.log` and `main.log` | Delete `mcp-server-Vigueur.log` if you want it gone. `mcp.log` and `main.log` are Claude Desktop's own logs, shared with its other servers |
| Conversation history | Your Claude account | Belongs to Claude. It keeps the tool results like any conversation |
| The bundle file and, if you built it, the folder you unzipped or cloned | Where you put them | Delete them yourself |
| Your PISTE account and application | piste.gouv.fr | Untouched. Manage them on the PISTE site |

## What the logs hold

Vigueur's own messages go to its error output (*stderr*): its startup line, setup problems and
errors. They name a tool in two cases only: an answer over the size cap, and an unexpected error
(its stack trace). The app decides whether to keep them, and adds lines of its own: with the
default install, see the app's documentation.

The Claude Code plugin's and the Claude Desktop bundle's logs record connection events and
Vigueur's startup line. Claude Code's logs also record the names of the tools called with their
timing, and error traces. These logs hold no tool arguments, no results and no credentials. See
also [Privacy and your data](../00-intro/04-privacy-and-your-data.md#logs).

## Reinstall later

Follow [Install Vigueur](02-install.md),
[Install the Claude Code plugin](03-install-claude-code.md) or
[Install the Claude Desktop bundle](04-install-claude-desktop.md) again. You can reuse the same
PISTE application.

## Related

- [Privacy and your data](../00-intro/04-privacy-and-your-data.md)
- [Update Vigueur](05-updating.md)
