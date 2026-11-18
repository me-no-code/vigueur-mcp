---
title: Update Vigueur
level: guide
tags: [update, claude-desktop, claude-code]
summary: Update Vigueur to a newer version in Claude Desktop or Claude Code, and check which version is running.
updated: 2026-11-18
---

# Update Vigueur

In Claude Desktop, you open the newer bundle file. In Claude Code, you pull the new code, build it,
and reconnect the server.

## In Claude Desktop

1. Get the newer bundle file, as in
   [Install in Claude Desktop](03-install-claude-desktop.md#1-get-the-bundle-file).
2. Double-click it, then click **Install** in the dialog. Claude Desktop replaces the installed
   version.
3. Ask Claude to run `vigueur_status`, and check that both sources show `ok`.

> **Same version number: uninstall first**
> Claude Desktop replaces Vigueur only with a file whose version is newer. To install a file with
> the same version again (a file you rebuilt, for example), uninstall Vigueur first (see
> [Uninstall Vigueur](05-uninstalling.md#in-claude-desktop)), then open the file and enter your
> settings again.

## In Claude Code

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

Ask Claude to run `vigueur_status`: `vigueur_version` in its answer is the version that answered.
Vigueur's startup line, in the logs, also states its version and the PISTE environment. Where the
logs are is described in [Privacy and your data](../00-intro/04-privacy-and-your-data.md#logs).

## If something breaks after an update

- Run `vigueur_status`. See [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md).
- Look at your credentials: in Claude Desktop, in **Settings**, **Extensions**, **Vigueur**; in
  Claude Code, with `/plugin configure vigueur@vigueur`.

## Related

- [Install in Claude Desktop](03-install-claude-desktop.md)
- [Install in Claude Code](02-install-claude-code.md)
- [Uninstall Vigueur](05-uninstalling.md)
