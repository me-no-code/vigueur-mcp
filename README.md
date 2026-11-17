# Vigueur

Vigueur lets Claude read French law straight from the official sources:

- **Légifrance**: codes, laws and decrees, the *Journal officiel*, collective agreements, and the
  case law of the Conseil d'État, the Conseil constitutionnel, the financial courts and the CNIL;
- **Judilibre**: decisions of the Cour de cassation and of the lower judicial courts.

Every answer says where it comes from and links to the official page, and every article or text
comes with its status and validity dates, so you can tell what is in force on a given date.
Vigueur reports what the sources say; it gives no legal advice.

Vigueur runs on your computer as a [Claude Code](https://claude.com/claude-code) plugin. It uses
your own free credentials for PISTE, the French government's API gateway: no third-party account,
and nothing goes anywhere but PISTE.

The documentation, in English and French, is in [user-docs](user-docs/README.md).

Status: work in progress, not released yet.

## Install

You need:

- Claude Code (Claude Desktop is planned);
- Node.js 20 or later, and git;
- a free PISTE account with an application subscribed to the Légifrance and Judilibre APIs. See
  [Create your PISTE account](user-docs/en/10-setup/01-piste-account.md). No account yet? Install
  anyway, then ask Claude to run `vigueur_status`: it lists the setup steps.

1. Clone and build Vigueur, in a folder of your choice:

   ```sh
   git clone https://github.com/me-no-code/vigueur-mcp.git
   cd vigueur-mcp
   npm install
   npm run build
   ```

   `npm install` may warn about `fsevents` install scripts. That package is only used by the
   developer tools; you can ignore the warning.

2. In Claude Code, add the folder as a plugin source and install the plugin (use the folder's
   absolute path):

   ```
   /plugin marketplace add /absolute/path/to/vigueur-mcp
   /plugin install vigueur@vigueur
   ```

3. Enter your PISTE client ID, client secret and environment (`production` or `sandbox`) when
   Claude Code asks, or later with `/plugin configure vigueur@vigueur`. The secret goes to your
   system's secure credential store.

4. Start a new session and ask Claude: "Run vigueur_status." Each source should answer `ok`.

> **Install from a clean folder**
> Claude Code copies the whole folder into its plugin cache when it installs the plugin. Install
> from a fresh clone, never from a folder holding a `.env` file or other private files.

Details, updates and troubleshooting: [Install in Claude Code](user-docs/en/10-setup/02-install-claude-code.md)
and [Update Vigueur](user-docs/en/10-setup/04-updating.md).

## Uninstall

1. In Claude Code:

   ```
   /plugin uninstall vigueur@vigueur
   /plugin marketplace remove vigueur
   ```

   This removes the plugin, its settings and your PISTE credentials, secret included.

2. Delete the folder you cloned.

Claude Code keeps two things after that: its copy of the plugin in `~/.claude/plugins/cache/vigueur/`,
which it clears later on its own (or delete it yourself), and its connection logs, which hold the
names of the tools called but no questions, answers or credentials. See
[Uninstall Vigueur](user-docs/en/10-setup/05-uninstalling.md) for where they are.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

Licence: [PolyForm Shield 1.0.0](LICENSE): use Vigueur for any purpose, except to provide a
product that competes with it.
