---
title: Install in Claude Desktop
level: start
tags: [install, claude-desktop, setup]
summary: Install Vigueur in Claude Desktop from its bundle file, enter your PISTE credentials and check that Légifrance and Judilibre answer.
updated: 2026-11-18
---

# Install in Claude Desktop

You will get Vigueur as a single file, open it in Claude Desktop, enter your PISTE credentials, and
check that it works. The file holds Vigueur ready to run, and Claude Desktop runs it with the
Node.js it ships with. Allow about five minutes once you have your PISTE account.

> **Tested on macOS**
> These steps were tested with Claude Desktop on macOS. The bundle is also made for Windows, but it
> has not been tried there yet.

## Before you start

- [Claude Desktop](https://claude.com/download), installed and signed in.
- A PISTE account and application, with the client ID and client secret in hand. If you do not have
  them yet, see [Create your PISTE account](01-piste-account.md).

## Steps

### 1. Get the bundle file

The file is named after its version, for example `vigueur-0.1.0.mcpb`. Each release of Vigueur will
publish it on the project's GitHub Releases page. There is no release yet: until then, build the
file yourself. This needs Node.js 20 or later and git. In a terminal:

```
git clone https://github.com/me-no-code/vigueur-mcp.git
cd vigueur-mcp
npm install
npm run bundle
```

The file is in the `build` folder of the clone.

### 2. Open the file

Double-click the file. Claude Desktop opens and shows its install dialog: Vigueur's 14 tools, its
developer (Vigueur contributors), its licence and version, and links to the documentation, support
and privacy policy. It should say **All requirements met**.

The dialog also shows a warning that starts "Installing will grant this extension access to
everything on your computer." Claude Desktop shows it for every extension that Anthropic has not verified, which includes this
bundle. Vigueur writes nothing to disk and sends requests to PISTE only (see
[Privacy and your data](../00-intro/04-privacy-and-your-data.md)). Install only a file you built
yourself or downloaded from the project's GitHub page.

Click **Install**.

### 3. Enter your credentials

Open **Settings**, then **Extensions**, then **Vigueur**. Fill in the three settings:

| Setting | What to enter |
|---|---|
| PISTE client ID | The client ID of your PISTE application |
| PISTE client secret | The client secret of the same application. Claude Desktop stores it encrypted |
| Production application | On (the default) for an application you created on PISTE. Off for the sandbox application PISTE created for you |

Then click **Save**. Claude Desktop restarts Vigueur with the new settings. To change them later,
come back to the same place.

The switch must match the application. See
[Sandbox or production](01-piste-account.md#sandbox-or-production).

> **No PISTE account yet?**
> You can install Vigueur and leave the fields empty. Until you enter credentials, Vigueur offers
> only `vigueur_status`, which answers `"outcome": "not_configured"`. Create your account with
> [Create your PISTE account](01-piste-account.md), then come back to this step.

Under **Tool permissions**, Vigueur's tools start as **Needs approval**: Claude Desktop asks you
before it runs one. You can change that for each tool.

### 4. Check that it works

Ask Claude: "Run `vigueur_status`." Claude Desktop shows Vigueur's answer as a table of fields
(**Environment**, **Check 1 source**, **Check 1 state**, and so on). Behind the table is one JSON
object. You want `production` (or `sandbox` if you turned the switch off) and both sources `ok`:

```
{
  "source": "PISTE",
  "outcome": "results",
  "warnings": [],
  "environment": "production",
  "checks": [
    {
      "source": "Légifrance",
      "state": "ok",
      "detail": null,
      "retry_after_seconds": null
    },
    {
      "source": "Judilibre",
      "state": "ok",
      "detail": null,
      "retry_after_seconds": null
    }
  ],
  "request": {
    "tool": "vigueur_status"
  },
  "retrieved": "2026-11-18T08:15:36Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

If a source shows another state, see [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md).

## Your first question

Try: "What does article 1240 of the Code civil say, and is it in force?" Then see
[Quickstart: your first questions](../20-using/01-quickstart.md).

## Related

- [Create your PISTE account](01-piste-account.md)
- [Install in Claude Code](02-install-claude-code.md)
- [Update Vigueur](04-updating.md)
- [Uninstall Vigueur](05-uninstalling.md)
- [Privacy and your data](../00-intro/04-privacy-and-your-data.md)
