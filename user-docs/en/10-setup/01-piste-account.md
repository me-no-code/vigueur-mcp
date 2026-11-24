---
title: Create your PISTE account
level: start
tags: [setup, piste, credentials]
summary: Create a free PISTE account and application, subscribe it to the Légifrance and Judilibre APIs, and get the client ID and secret Vigueur needs.
updated: 2026-11-24
---

# Create your PISTE account

Vigueur reads Légifrance and Judilibre through [PISTE](../00-intro/03-glossary.md#piste), the French
government's API portal. Access is free. You need your own account and one application. This takes a
few minutes and is done once, whichever app you use Vigueur in.

## Steps

1. Go to <https://piste.gouv.fr>, create a free account and confirm your email address.
2. Open the **Applications** tab. A **SANDBOX** application already exists. Applications you create
   yourself (**Créer une application**) are **production** applications. Choose which one to use;
   see [Sandbox or production](#sandbox-or-production).
3. Open the consent page ("Cliquez ici pour accéder à la page de consentement"), tick **Légifrance**
   and **JUDILIBRE**, then click **Validate my ToS choices**.
4. Edit the application, tick **Légifrance** and **JUDILIBRE**, then click **Apply changes**
   ("Appliquer les modifications"). The boxes turn grey once subscribed; check the **Subscribed
   APIs** table.
5. Copy the application's OAuth **client ID** and **client secret**.

You now have two values and a choice of environment. You enter them when you install Vigueur:
[Install Vigueur](02-install.md), [Install the Claude Code plugin](03-install-claude-code.md) or
[Install the Claude Desktop bundle](04-install-claude-desktop.md).

> **Keep the client secret private**
> The client secret is a password for your application. Do not paste it into a chat with an
> assistant, an email or a document. Enter it only in Vigueur's settings. With the default install,
> that is the app's MCP configuration, where it sits as plain text: keep that file private. The
> Claude Code plugin keeps it in your system's secure credential store, and the Claude Desktop
> bundle stores it encrypted.

## Sandbox or production

PISTE has two environments, and each application belongs to one of them.

| | Sandbox | Production |
|---|---|---|
| Which application | The one PISTE creates for you automatically | One you create yourself |
| With the default install | `PISTE_ENV` `sandbox` (or `PISTE_PRODUCTION` `false`) | `PISTE_ENV` `production` (the default) |
| With the Claude Code plugin | **PISTE environment** `sandbox` | **PISTE environment** `production` (the default) |
| With the Claude Desktop bundle | **Production application** off | **Production application** on (the default) |

The setting must match the application the credentials belong to: sandbox credentials only work as
sandbox, and production credentials only as production. A mismatch shows up as rejected
credentials; see [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md#piste-rejected-my-credentials).

See [Sandbox](../00-intro/03-glossary.md#sandbox) and [Production](../00-intro/03-glossary.md#production)
in the glossary.

## Check that it worked

After installing Vigueur and entering the credentials, ask the assistant to run
`vigueur_status`. Each source should show `ok`. If one shows `not_enabled`, repeat steps 3 and 4
above.

## Related

- [Install Vigueur](02-install.md)
- [Install the Claude Code plugin](03-install-claude-code.md)
- [Install the Claude Desktop bundle](04-install-claude-desktop.md)
- [PISTE](../40-sources/03-piste.md)
- [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md)
