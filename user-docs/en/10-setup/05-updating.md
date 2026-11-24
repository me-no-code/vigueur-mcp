---
title: Update Vigueur
level: guide
tags: [update, cli, claude-desktop, claude-code]
summary: Update Vigueur to a newer version, whichever way you installed it, and check which version is running.
updated: 2026-11-24
---

# Update Vigueur

With the default install, Vigueur updates itself when the app starts it. With the Claude Code
plugin, you update the plugin. With the Claude Desktop bundle, you open the newer bundle file. If
you run Vigueur from its source code, you get the new code and build it.

## Default install

If you followed [Install Vigueur](02-install.md):

1. Restart the app, or reload its MCP servers. When the app starts Vigueur, `npx` asks npm whether a
   newer version exists, and downloads it if there is one. If you wrote a version in the arguments
   (`vigueur-mcp@0.1.0`), change it first.

2. From the assistant, ask to run `vigueur_status`, and check that both sources show `ok`.
   `vigueur_version`, in the answer, is the version that runs.

## Claude Code plugin

1. In a terminal, update the marketplace, then the plugin:

   ```
   claude plugin marketplace update vigueur
   claude plugin update vigueur@vigueur
   ```

2. Restart Claude Code: an update applies after a restart.

3. Ask Claude to run `vigueur_status`, and check that both sources show `ok`.

## Claude Desktop bundle

1. Get the newer bundle file, as in
   [Install the Claude Desktop bundle](04-install-claude-desktop.md#1-get-the-bundle-file).
2. Double-click it, then click **Install** in the dialog. Claude Desktop replaces the installed
   version.
3. Ask Claude to run `vigueur_status`, and check that both sources show `ok`.

> **Same version number: uninstall first**
> Claude Desktop replaces Vigueur only with a file whose version is newer. To install a file with
> the same version again (a file you rebuilt, for example), uninstall Vigueur first (see
> [Uninstall Vigueur](06-uninstalling.md#claude-desktop-bundle)), then open the file and enter your
> settings again.

## Running from source code

If you followed [Run Vigueur from its source code](02-install.md#run-vigueur-from-its-source-code),
get the new code the same way you got it:

- **The latest release:** download **Source code (zip)** from
  https://github.com/me-no-code/vigueur-mcp/releases/latest and unzip it.
- **The development version:** in a terminal, in the folder you cloned, run `git pull`.

Then, in a terminal, in that folder, run `npm ci` and `npm run build`, and restart the app.

## Check what is running

Run `vigueur_status`: `vigueur_version` in its answer is the version that answered. Vigueur's
startup line, in the logs, also states its version and the PISTE environment. Where the logs are is
described in [Privacy and your data](../00-intro/04-privacy-and-your-data.md#logs).

## If something breaks after an update

- Run `vigueur_status`. See [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md).
- Look at your credentials: with the default install, in the app's MCP configuration; with the
  Claude Code plugin, through `/plugin configure vigueur@vigueur`; with the Claude Desktop bundle,
  in **Settings**, **Extensions**, **Vigueur**.

## Related

- [Install Vigueur](02-install.md)
- [Install the Claude Code plugin](03-install-claude-code.md)
- [Install the Claude Desktop bundle](04-install-claude-desktop.md)
- [Uninstall Vigueur](06-uninstalling.md)
