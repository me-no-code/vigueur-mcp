---
title: Update Vigueur
level: guide
tags: [update, claude-code]
summary: Update Vigueur to a newer version and make the open Claude Code session use it.
updated: 2026-11-15
---

# Update Vigueur

Vigueur is updated from the folder you cloned. You pull the new code, build it, and reconnect the
server.

## Steps

1. In a terminal, go to the folder you cloned:

   ```
   cd /absolute/path/to/vigueur-mcp
   git pull
   npm install
   npm run build
   ```

2. In Claude Code, run `/mcp`, select **vigueur**, then choose **Reconnect**.

3. Ask Claude to run `vigueur_status`, and check that both sources show `ok`.

> **A build alone changes nothing in an open session**
> Each open Claude Code session keeps running the old server until you reconnect it with `/mcp`.
> `/reload-plugins` alone keeps the old server running. A session you start after the build uses
> the new one.

## Check what is running

Vigueur's startup line, in the connection log, states its version and the PISTE environment. The log
is described in [Privacy and your data](../00-intro/04-privacy-and-your-data.md#logs).

## If something breaks after an update

- Run `vigueur_status`. See [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md).
- Run `/plugin configure vigueur@vigueur` to look at or change your credentials.

## Related

- [Install in Claude Code](02-install-claude-code.md)
- [Uninstall Vigueur](05-uninstalling.md)
