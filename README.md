# Vigueur

French law from the official sources, Légifrance and Judilibre, read on your computer with your own
free PISTE credentials.

Every answer names its source and when it was retrieved. Documents and search results link to the
official page. Articles, texts and code sections say whether they are in force on the date asked,
worked out from their validity dates. Vigueur reports what the sources say; it gives no legal
advice.

Vigueur talks to PISTE, the French government's API gateway, and to nothing else: there is no
Vigueur server and no third-party account, and it writes nothing to disk. See
[Privacy and your data](user-docs/en/00-intro/04-privacy-and-your-data.md).

> [!NOTE]
> Early version (0.x), still evolving.

## What you can ask

From an AI assistant, in French or in English, for example:

- "What does article 1240 of the Code civil say, and is it in force?"
- "What did article 1382 of the Code civil say on 1 January 2015?"
- "What changed in the Code du travail since 2026-01-01?"
- "Find the Cour de cassation decision with pourvoi number 23-20.348."

For the second one, the answer gives the article as it stood on that date, with its validity dates
(`"from": "1804-03-21"`, `"until": "2016-10-01"`), and says where Légifrance records that its
content moved:

```
"relocation": "Content moved — per Légifrance concordance, the text of art. 1382 as of 2015-01-01 is now at Code civil - art. 1240 (V) (since 2016-10-01)."
```

More in [Quickstart: your first questions](user-docs/en/20-using/01-quickstart.md).

## What you can read

- **Légifrance**: codes, laws and decrees, the *Journal officiel*, collective agreements, and the
  case law of the Conseil d'État, the Conseil constitutionnel, the financial courts and the CNIL;
- **Judilibre**: decisions of the Cour de cassation and of the lower judicial courts.

Vigueur reads an article as it stood on a given date, lists its versions and what changed in a
code between two dates, browses a code's table of contents, and searches and reads decisions. Each
of its 14 tools is described in the [tool list](user-docs/en/README.md#tools).

## Get started

Vigueur is an MCP server that runs on your computer: the assistant in your app calls its tools to
read the sources.

### 1. Create your PISTE account

Free, in a few minutes: see [Create your PISTE account](user-docs/en/10-setup/01-piste-account.md).
You get a client ID and a client secret.

### 2. Add Vigueur to your app

In any app that can start a local MCP server, desktop or command line, with Node.js 22 or later.
Add Vigueur to the app's MCP configuration, with your PISTE credentials: `npx` downloads it from
npm when the app starts it. Your app may expect another key or format; its documentation says where
the configuration goes.

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

`PISTE_ENV` is `production` for an application you created on PISTE, `sandbox` for the one PISTE
created for you. The full steps, and how to run Vigueur from its source code, are in
[Install Vigueur](user-docs/en/10-setup/02-install.md).

> [!IMPORTANT]
> The client secret sits in that file as plain text. Keep the file private, and never paste the
> secret in a chat with an assistant.

**Claude Code or Claude Desktop?** Each has a package of its own, which asks for your credentials
and keeps them:

- **Claude Code:** run `/plugin marketplace add me-no-code/vigueur-mcp`, then
  `/plugin install vigueur@vigueur`. See
  [Install the Claude Code plugin](user-docs/en/10-setup/03-install-claude-code.md).
- **Claude Desktop:** one file to open, nothing else to install. See
  [Install the Claude Desktop bundle](user-docs/en/10-setup/04-install-claude-desktop.md).

### 3. Check that it works

Restart the app, then ask the assistant to run `vigueur_status`. Both sources should show
`"state": "ok"`. Then try "What does article 1240 of the Code civil say, and is it in force?", and
see [Quickstart: your first questions](user-docs/en/20-using/01-quickstart.md).

<details>
<summary><strong>If you are an agent installing Vigueur for someone</strong></summary>

Follow the steps above, or the page for their app, with these rules:

- **Never ask for the client secret in the chat.** Do not ask for it, and do not write it anywhere
  yourself. In a configuration file, leave the two credentials as empty strings, as in the block
  above. With the Claude Code plugin and the Claude Desktop bundle, the app asks the person for
  them in its own settings.
- **Tell the person where to paste them:** the exact file and the two keys (`PISTE_CLIENT_ID`,
  `PISTE_CLIENT_SECRET`); with the Claude Code plugin, `/plugin configure vigueur@vigueur`; with
  the Claude Desktop bundle, **Settings**, **Extensions**, **Vigueur**. Tell them which environment
  to choose: production for an application they created on PISTE, sandbox for the one PISTE
  created for them.
- **No PISTE account yet?** Send them to
  [Create your PISTE account](user-docs/en/10-setup/01-piste-account.md) (French:
  [Créer votre compte PISTE](user-docs/fr/10-setup/01-piste-account.md)).
- **Finish with `vigueur_status`** once they have entered the credentials and the app has restarted
  Vigueur. Both checks should show `ok`. Another state is explained in
  [Troubleshooting and FAQ](user-docs/en/00-intro/05-troubleshooting.md).

</details>

## Documentation

The user documentation is in English and in French: setup, first questions, a guide per subject, a
page per tool and per source.

**In English** ([index](user-docs/en/README.md))

- **Start:** [Welcome to Vigueur](user-docs/en/00-intro/01-welcome.md),
  [Quickstart: your first questions](user-docs/en/20-using/01-quickstart.md)
- **Guides:** [Codes, laws and decrees](user-docs/en/20-using/02-legislation.md),
  [Case law](user-docs/en/20-using/03-case-law.md),
  [The Journal officiel and tracking changes](user-docs/en/20-using/04-journal-officiel.md),
  [Reading Vigueur's answers](user-docs/en/20-using/05-reading-answers.md)
- **Reference:** [the 14 tools](user-docs/en/README.md#tools),
  [the sources](user-docs/en/README.md#sources)
- **Help:** [Troubleshooting and FAQ](user-docs/en/00-intro/05-troubleshooting.md),
  [Privacy and your data](user-docs/en/00-intro/04-privacy-and-your-data.md),
  [Update Vigueur](user-docs/en/10-setup/05-updating.md),
  [Uninstall Vigueur](user-docs/en/10-setup/06-uninstalling.md)

**En français** ([sommaire](user-docs/fr/README.md))

- **Démarrer :** [Bienvenue dans Vigueur](user-docs/fr/00-intro/01-welcome.md),
  [Prise en main : vos premières questions](user-docs/fr/20-using/01-quickstart.md)
- **Guides :** [Codes, lois et décrets](user-docs/fr/20-using/02-legislation.md),
  [Jurisprudence](user-docs/fr/20-using/03-case-law.md),
  [Le Journal officiel et le suivi des modifications](user-docs/fr/20-using/04-journal-officiel.md),
  [Lire les réponses de Vigueur](user-docs/fr/20-using/05-reading-answers.md)
- **Référence :** [les 14 outils](user-docs/fr/README.md#outils),
  [les sources](user-docs/fr/README.md#sources)
- **Aide :** [Dépannage et FAQ](user-docs/fr/00-intro/05-troubleshooting.md),
  [Confidentialité et données](user-docs/fr/00-intro/04-privacy-and-your-data.md),
  [Mettre à jour Vigueur](user-docs/fr/10-setup/05-updating.md),
  [Désinstaller Vigueur](user-docs/fr/10-setup/06-uninstalling.md)

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[PolyForm Shield 1.0.0](LICENSE): use Vigueur for any purpose, except to provide a product that
competes with it. Third-party data credits are in [NOTICE](NOTICE).
