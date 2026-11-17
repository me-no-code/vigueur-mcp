---
title: Uninstall Vigueur
level: guide
tags: [uninstall, claude-code, privacy]
summary: Remove Vigueur and its credentials from Claude Code, and know what is left behind and how to clear it.
updated: 2026-11-15
---

# Uninstall Vigueur

You remove Vigueur with two commands in Claude Code, then delete the folder you cloned. A few things
are left behind; this page lists them.

> **Tested on macOS**
> On other systems, the credential store and the logs are elsewhere.

## Steps

1. In Claude Code, run:

   ```
   /plugin uninstall vigueur@vigueur
   /plugin marketplace remove vigueur
   ```

2. Delete the folder you cloned, for example `vigueur-mcp`.

## What is removed

Claude Code removes the plugin's registration, the client ID and the environment setting, and the
client secret: its value is removed from your system's credential store.

## What is left

| What | Where | What to do |
|---|---|---|
| The plugin copy | `~/.claude/plugins/cache/vigueur/`, marked orphaned | Claude Code clears orphaned copies on its own later. Or delete the folder |
| Connection logs | On macOS, one folder per project where Vigueur ran, in `~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-vigueur-vigueur/` | Delete the folders if you want them gone |
| Conversation history | `~/.claude/projects/` | Belongs to Claude Code. It keeps the tool results like any conversation |
| Your PISTE account and application | piste.gouv.fr | Untouched. Manage them on the PISTE site |

The logs record connection events, Vigueur's startup line, the names of the tools called with their
timing, and error traces. They hold no tool arguments, no results and no credentials. See
[Privacy and your data](../00-intro/04-privacy-and-your-data.md).

## Reinstall later

Follow [Install in Claude Code](02-install-claude-code.md) again. You can reuse the same PISTE
application.

## Related

- [Privacy and your data](../00-intro/04-privacy-and-your-data.md)
- [Update Vigueur](04-updating.md)
