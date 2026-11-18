---
title: Uninstall Vigueur
level: guide
tags: [uninstall, claude-desktop, claude-code, privacy]
summary: Remove Vigueur and its credentials from Claude Desktop or Claude Code, and know what is left behind and how to clear it.
updated: 2026-11-18
---

# Uninstall Vigueur

You remove Vigueur from the app that runs it. A few things are left behind; this page lists them.

> **Tested on macOS**
> On other systems, the credential store and the logs are elsewhere.

## In Claude Desktop

Open **Settings**, then **Extensions**, then **Vigueur**, and click **Uninstall**.

Claude Desktop removes the extension and its settings, client secret included: after a reinstall,
Vigueur starts with no credentials.

| What is left | Where | What to do |
|---|---|---|
| Logs | `~/Library/Logs/Claude/`: `mcp-server-Vigueur.log`, and Vigueur's lines in `mcp.log` and `main.log` | Delete `mcp-server-Vigueur.log` if you want it gone. `mcp.log` and `main.log` are Claude Desktop's own logs, shared with its other servers |
| Conversation history | Your Claude account | Belongs to Claude. It keeps the tool results like any conversation |
| The bundle file and, if you built it, the folder you cloned | Where you put them | Delete them yourself |
| Your PISTE account and application | piste.gouv.fr | Untouched. Manage them on the PISTE site |

## In Claude Code

1. In Claude Code, run:

   ```
   /plugin uninstall vigueur@vigueur
   /plugin marketplace remove vigueur
   ```

2. Delete the folder you cloned, for example `vigueur-mcp`.

Claude Code removes the plugin's registration, the client ID and the environment setting, and the
client secret: its value is removed from your system's credential store.

| What is left | Where | What to do |
|---|---|---|
| The plugin copy | `~/.claude/plugins/cache/vigueur/`, marked orphaned | Claude Code clears orphaned copies on its own later. Or delete the folder |
| Connection logs | On macOS, one folder per project where Vigueur ran, in `~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-vigueur-vigueur/` | Delete the folders if you want them gone |
| Conversation history | `~/.claude/projects/` | Belongs to Claude Code. It keeps the tool results like any conversation |
| Your PISTE account and application | piste.gouv.fr | Untouched. Manage them on the PISTE site |

## What the logs hold

The logs record connection events and Vigueur's startup line. Claude Code's logs also record the
names of the tools called with their timing, and error traces. They hold no tool arguments, no
results and no credentials. See [Privacy and your data](../00-intro/04-privacy-and-your-data.md#logs).

## Reinstall later

Follow [Install in Claude Desktop](03-install-claude-desktop.md) or
[Install in Claude Code](02-install-claude-code.md) again. You can reuse the same PISTE
application.

## Related

- [Privacy and your data](../00-intro/04-privacy-and-your-data.md)
- [Update Vigueur](04-updating.md)
