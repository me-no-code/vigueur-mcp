# Vigueur

Vigueur lets Claude read French law straight from the official sources:

- **Légifrance**: codes, laws and decrees, the *Journal officiel*, collective agreements, and the
  case law of the Conseil d'État, the Conseil constitutionnel, the financial courts and the CNIL;
- **Judilibre**: decisions of the Cour de cassation and of the lower judicial courts.

Every answer says where it comes from and links to the official page, and every article or text
comes with its status and validity dates, so you can tell what is in force on a given date.
Vigueur reports what the sources say; it gives no legal advice.

Vigueur is an MCP server that runs on your computer. It works in Claude Desktop, in Claude Code,
and in any app that can start a local MCP server. It uses your own free credentials for PISTE, the
French government's API gateway: no third-party account, and nothing goes anywhere but PISTE.

The documentation, in English and French, is in [user-docs](user-docs/README.md).

Status: early version (0.x), still evolving.

## Install

You need a free PISTE account with an application subscribed to the Légifrance and Judilibre APIs,
and that application's client ID and client secret. See
[Create your PISTE account](user-docs/en/10-setup/01-piste-account.md). The environment setting
must match the application: `production` (the default) for one you created, `sandbox` for the one
PISTE created for you.

Once installed, ask Claude: "Run vigueur_status." Each source should answer `ok`.

### Claude Desktop

Open Vigueur's bundle file, `vigueur-<version>.mcpb`, and confirm the install dialog. Then fill in
the three settings in **Settings**, **Extensions**, **Vigueur**, and click **Save**.

Download the bundle under **Assets** in the
[latest release](https://github.com/me-no-code/vigueur-mcp/releases/latest). To check that the file
was built by this repository's release workflow, run
`gh attestation verify vigueur-<version>.mcpb --repo me-no-code/vigueur-mcp` (GitHub CLI).
To build it yourself instead (Node.js 22 or later, and git): clone the repository, then run
`npm ci` and `npm run bundle`; the file is in `build/`.
Details: [Install in Claude Desktop](user-docs/en/10-setup/03-install-claude-desktop.md).

### Claude Code

1. Clone and build Vigueur (Node.js 22 or later, and git), in a folder of your choice:

   ```sh
   git clone https://github.com/me-no-code/vigueur-mcp.git
   cd vigueur-mcp
   npm ci
   npm run build
   ```

   `npm ci` may warn about `fsevents` install scripts. That package is only used by the
   developer tools; you can ignore the warning.

2. In Claude Code, add the folder as a plugin source and install the plugin (use the folder's
   absolute path):

   ```
   /plugin marketplace add /absolute/path/to/vigueur-mcp
   /plugin install vigueur@vigueur
   ```

3. Enter your PISTE client ID, client secret and environment when Claude Code asks, or later with
   `/plugin configure vigueur@vigueur`. The secret goes to your system's secure credential store.

> **Install from a clean folder**
> Claude Code copies the whole folder into its plugin cache when it installs the plugin. Install
> from a fresh clone, never from a folder holding a `.env` file or other private files.

Details: [Install in Claude Code](user-docs/en/10-setup/02-install-claude-code.md).

### Any other MCP app

Clone and build Vigueur as for Claude Code (step 1). Then add it to the app's MCP configuration as
a local server started with `node`. Many apps take a block of this shape; see your app's
documentation for where it goes:

```json
{
  "mcpServers": {
    "vigueur": {
      "command": "node",
      "args": ["/absolute/path/to/vigueur-mcp/dist/index.js"],
      "env": {
        "PISTE_CLIENT_ID": "",
        "PISTE_CLIENT_SECRET": "",
        "PISTE_ENV": "production"
      }
    }
  }
}
```

Fill in the two credentials, then restart the app. That file then holds your client secret as plain
text: keep it private. `PISTE_ENV` is `production` or `sandbox`. Instead of `PISTE_ENV`, Vigueur
also reads `PISTE_PRODUCTION` (`true` or `false`); set only one of them.

With a credential missing, Vigueur starts with `vigueur_status` as its only tool, and that tool
answers `not_configured`.

### If you are an agent installing Vigueur for someone

Follow the section for their app above, with these rules:

- **Never ask for the client secret in the chat.** Do not ask for it, and do not write it anywhere
  yourself. In a configuration file, leave the two credentials as empty strings, as in the block
  above. In Claude Desktop and Claude Code, the app asks the person for them in its own settings.
- **Tell the person where to paste them:** the exact file and the two keys (`PISTE_CLIENT_ID`,
  `PISTE_CLIENT_SECRET`), or in Claude Desktop **Settings**, **Extensions**, **Vigueur**, or in
  Claude Code `/plugin configure vigueur@vigueur`. Tell them which environment to choose:
  production for an application they created on PISTE, sandbox for the one PISTE created for them.
- **No PISTE account yet?** Send them to
  [Create your PISTE account](user-docs/en/10-setup/01-piste-account.md) (French:
  [Créer votre compte PISTE](user-docs/fr/10-setup/01-piste-account.md)).
- **Finish with `vigueur_status`** once they have entered the credentials and the app has restarted
  Vigueur. Both checks should show `ok`. Another state is explained in
  [Troubleshooting and FAQ](user-docs/en/00-intro/05-troubleshooting.md).

## Uninstall

- **Claude Desktop:** **Settings**, **Extensions**, **Vigueur**, then **Uninstall**.
- **Claude Code:** run `/plugin uninstall vigueur@vigueur` and `/plugin marketplace remove vigueur`,
  then delete the folder you cloned.
- **Another MCP app:** remove the `vigueur` block from its configuration, then delete the folder you
  cloned.

Each app keeps some logs after that; they hold no questions, answers or credentials. See
[Uninstall Vigueur](user-docs/en/10-setup/05-uninstalling.md) for what is left and where.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

Licence: [PolyForm Shield 1.0.0](LICENSE): use Vigueur for any purpose, except to provide a
product that competes with it. Third-party data credits are in [NOTICE](NOTICE).
