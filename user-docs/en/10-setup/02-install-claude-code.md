---
title: Install in Claude Code
level: start
tags: [install, claude-code, setup]
summary: Install Vigueur in Claude Code from a local build, enter your PISTE credentials and check that Légifrance and Judilibre answer.
updated: 2026-11-18
---

# Install in Claude Code

You will download Vigueur, build it once, add it to Claude Code as a plugin, enter your PISTE
credentials, and check that it works. Allow about ten minutes once you have your PISTE account.

> **Tested on macOS**
> These steps were tested on macOS. The commands are the same elsewhere, but where Claude Code
> stores the secret and the logs differs.

## Before you start

- [Claude Code](https://claude.com/claude-code), already working.
- Node.js 20 or later, and git.
- A PISTE account and application, with the client ID and client secret in hand. If you do not have
  them yet, see [Create your PISTE account](01-piste-account.md).

## Steps

### 1. Download and build Vigueur

In a terminal, in a folder where you keep projects:

```
git clone https://github.com/me-no-code/vigueur-mcp.git
cd vigueur-mcp
npm install
npm run build
pwd
```

`pwd` prints the absolute path of the folder. Keep it for the next step.

`npm install` may print a warning about `fsevents` and "allow-scripts". It is harmless: that package
is only for developers, and Vigueur does not need it.

> **Keep the folder clean**
> Claude Code copies the whole folder into its plugin cache when you install. Do not put a `.env`
> file or private documents in it.

### 2. Add Vigueur to Claude Code

In Claude Code, run these two commands. Replace the path with the one `pwd` printed.

```
/plugin marketplace add /absolute/path/to/vigueur-mcp
/plugin install vigueur@vigueur
```

### 3. Enter your credentials

Claude Code asks for three settings when the plugin is enabled. To change them later, run
`/plugin configure vigueur@vigueur`.

| Setting | What to enter |
|---|---|
| PISTE client ID | The client ID of your PISTE application |
| PISTE client secret | The client secret of the same application. Claude Code keeps it in your system's secure credential store |
| PISTE environment | `production` (the default) for an application you created, `sandbox` for the one PISTE created for you |

The environment must match the application. See
[Sandbox or production](01-piste-account.md#sandbox-or-production).

> **No PISTE account yet?**
> You can enable the plugin with the credentials left empty. Until you enter credentials, Vigueur
> offers only `vigueur_status`, which answers `"outcome": "not_configured"`. Create your account
> with [Create your PISTE account](01-piste-account.md), then run
> `/plugin configure vigueur@vigueur`.

### 4. Check that it works

Ask Claude: "Run `vigueur_status`." Vigueur answers with one JSON object (one line of JSON on the
wire; it is indented here). You want both sources to show `"state": "ok"`:

```
{
  "source": "PISTE",
  "outcome": "results",
  "warnings": [],
  "environment": "sandbox",
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
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

If a source shows another state, see [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md). If Claude still reports the old state
after you changed the credentials, run `/mcp`, select **vigueur**, then choose **Reconnect**.

## Your first question

Try: "What does article 1240 of the Code civil say, and is it in force?" Then see
[Quickstart: your first questions](../20-using/01-quickstart.md).

## Related

- [Create your PISTE account](01-piste-account.md)
- [Install in Claude Desktop](03-install-claude-desktop.md)
- [Update Vigueur](04-updating.md)
- [Uninstall Vigueur](05-uninstalling.md)
- [Privacy and your data](../00-intro/04-privacy-and-your-data.md)
