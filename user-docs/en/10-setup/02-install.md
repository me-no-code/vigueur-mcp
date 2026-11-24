---
title: Install Vigueur
level: start
tags: [install, cli, setup]
summary: Install Vigueur as a local MCP server in any app that can start one, enter your PISTE credentials and check that Légifrance and Judilibre answer.
updated: 2026-11-24
---

# Install Vigueur

Vigueur is an MCP server that runs on your computer. Any app that can start a local MCP server can
use it, a desktop app or a command-line assistant alike. You will add it to the app's MCP
configuration with your PISTE credentials, and check that it works. The app downloads Vigueur from
npm the first time it starts it. Allow about five minutes once you have your PISTE account.

Two apps also have a package of their own, which asks for your credentials and keeps them:
[Install the Claude Code plugin](03-install-claude-code.md) and
[Install the Claude Desktop bundle](04-install-claude-desktop.md).

> **Tested on macOS**
> These steps were tested on macOS. The configuration is the same elsewhere, but where the app
> keeps it differs.

## Before you start

- An app that can start a local MCP server: a server the app launches with a command and talks to
  through its standard input and output (*stdio* in most MCP documentation).
- Node.js 22 or later, which comes with `npx`. To check, run `node --version` in a terminal.
- A PISTE account and application, with the client ID and client secret in hand. If you do not have
  them yet, see [Create your PISTE account](01-piste-account.md).

## Steps

### 1. Add Vigueur to your app

Add a local server to the app's MCP configuration. It starts with the command `npx`, which
downloads Vigueur from npm and runs it, and it reads your credentials from three environment
variables. Here is the server written as a JSON block; your app may expect another key or another
format, and its documentation says where the configuration goes:

```json
{
  "mcpServers": {
    "vigueur": {
      "command": "npx",
      "args": ["-y", "vigueur-mcp"],
      "env": {
        "PISTE_CLIENT_ID": "",
        "PISTE_CLIENT_SECRET": "",
        "PISTE_ENV": "production"
      }
    }
  }
}
```

`-y` lets `npx` download Vigueur without asking. Fill in the variables:

| Variable | What to enter |
|---|---|
| `PISTE_CLIENT_ID` | The client ID of your PISTE application |
| `PISTE_CLIENT_SECRET` | The client secret of the same application |
| `PISTE_ENV` | `production` (the default) for an application you created, `sandbox` for the one PISTE created for you |

The environment must match the application. See
[Sandbox or production](01-piste-account.md#sandbox-or-production). Instead of `PISTE_ENV`, Vigueur
also reads `PISTE_PRODUCTION` (`true` or `false`), for apps whose settings offer a switch. Set only
one of them.

If your app adds a server with a command rather than a file, as some command-line assistants do,
give that command the same things: `npx`, the arguments `-y vigueur-mcp`, and the three variables.
The app's documentation says how.

Then restart the app, or reload its MCP servers, so that it starts Vigueur. The first start takes a
little longer: `npx` downloads Vigueur and the libraries it runs on.

If the app reports that it cannot find `npx`, give it the full path instead: run `which npx` in a
terminal (`where npx` on Windows) and put the path it prints as the command.

> **The client secret is in that file as plain text**
> Keep the configuration file private: do not share it, and do not commit it to a repository. Put
> the client secret only there, never in a chat with an assistant. A command typed in a terminal
> may also stay in the terminal's history.

> **No PISTE account yet?**
> You can leave the two credentials as empty strings. Until you enter credentials, Vigueur offers
> only `vigueur_status`, which answers `"outcome": "not_configured"`. Create your account with
> [Create your PISTE account](01-piste-account.md), then come back to this step.

### 2. Check that it works

From the assistant in your app, ask: "Run `vigueur_status`." Vigueur answers with one JSON object
(one line of JSON on the wire; it is indented here). You want both sources to show
`"state": "ok"`:

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
If the answer still shows the old state after you changed the credentials, restart the app or its
MCP servers: Vigueur reads its settings when it starts.

## Which version runs

Each time the app starts Vigueur, `npx` asks npm whether a newer version exists, and downloads it
if there is one: you run the latest release. To stay on one version, write it in the arguments,
for example `"args": ["-y", "vigueur-mcp@0.1.0"]`, and change it when you want to update.

## Run Vigueur from its source code

To try the changes merged since the latest release, or to run Vigueur without `npx`, build it
yourself. You need git as well as Node.js 22 or later.

1. In a terminal, in a folder where you keep projects, get the code and build it:

   ```
   git clone https://github.com/me-no-code/vigueur-mcp.git
   cd vigueur-mcp
   npm ci
   npm run build
   pwd
   ```

   For the latest release rather than the development version, download **Source code (zip)** from
   https://github.com/me-no-code/vigueur-mcp/releases/latest instead of cloning, unzip it, and run
   the last three commands in that folder.

   `npm ci` may print a warning about `fsevents` and "allow-scripts". It is harmless: that package
   is only for developers, and Vigueur does not need it.

2. In the app's MCP configuration, run the built server with `node` instead of `npx`. `pwd` printed
   the folder's absolute path; the server is the file `dist/index.js` in it:

   ```json
   "command": "node",
   "args": ["/absolute/path/to/vigueur-mcp/dist/index.js"],
   ```

   The `env` block stays the same.

## Your first question

Try: "What does article 1240 of the Code civil say, and is it in force?" Then see
[Quickstart: your first questions](../20-using/01-quickstart.md).

## Related

- [Create your PISTE account](01-piste-account.md)
- [Install the Claude Code plugin](03-install-claude-code.md)
- [Install the Claude Desktop bundle](04-install-claude-desktop.md)
- [Update Vigueur](05-updating.md)
- [Uninstall Vigueur](06-uninstalling.md)
- [Privacy and your data](../00-intro/04-privacy-and-your-data.md)
