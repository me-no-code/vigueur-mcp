---
title: "Installer le plugin Claude Code"
level: start
tags: [install, cli, claude-code, setup]
summary: "Installez Vigueur dans Claude Code sous forme de plugin, saisissez vos identifiants PISTE et vérifiez que Légifrance et Judilibre répondent."
updated: 2026-11-24
---

# Installer le plugin Claude Code

Vigueur existe sous forme de plugin pour Claude Code : Claude Code demande vos identifiants et
conserve le secret client dans le coffre sécurisé d'identifiants de votre système. Cette page
installe ce plugin. Claude Code peut aussi exécuter Vigueur comme toute autre application MCP, avec
[Installer Vigueur](02-install.md).

Vous allez ajouter le plugin à Claude Code, saisir vos identifiants PISTE et vérifier que tout
fonctionne. Le plugin télécharge Vigueur depuis npm. Comptez environ cinq minutes une fois votre
compte PISTE obtenu.

> **Testé sur macOS**
> Ces étapes ont été testées sur macOS. Les commandes sont les mêmes ailleurs, mais l'endroit où
> Claude Code stocke le secret client et les journaux diffère.

## Avant de commencer

- [Claude Code](https://claude.com/claude-code), qui fonctionne déjà.
- Node.js 22 ou plus récent, qui fournit `npx` : le plugin lance Vigueur avec. Pour le vérifier,
  lancez `node --version` dans un terminal.
- Un compte et une application PISTE, avec l'identifiant client et le secret client sous la main.
  Si vous ne les avez pas encore, consultez [Créer votre compte PISTE](01-piste-account.md).

## Étapes

### 1. Ajouter Vigueur à Claude Code

Dans Claude Code, exécutez ces deux commandes :

```
/plugin marketplace add me-no-code/vigueur-mcp
/plugin install vigueur@vigueur
```

La première ajoute le dépôt GitHub du projet comme marketplace de plugins, nommée `vigueur` ; la
seconde installe le plugin depuis cette marketplace. Au premier lancement, Vigueur met un peu plus
de temps à démarrer : `npx` le télécharge depuis npm.

### 2. Saisir vos identifiants

Claude Code demande trois réglages quand le plugin est activé. Pour les modifier plus tard,
exécutez `/plugin configure vigueur@vigueur`.

| Réglage | Ce qu'il faut saisir |
|---|---|
| PISTE client ID | L'identifiant client de votre application PISTE |
| PISTE client secret | Le secret client de la même application. Claude Code le conserve dans le coffre sécurisé d'identifiants de votre système |
| PISTE environment | `production` (valeur par défaut) pour une application que vous avez créée, `sandbox` pour celle que PISTE a créée pour vous |

L'environnement doit correspondre à l'application. Voir
[Bac à sable ou production](01-piste-account.md#bac-à-sable-ou-production).

> **Pas encore de compte PISTE ?**
> Vous pouvez activer le plugin en laissant les identifiants vides. Tant que vous n'avez pas saisi
> d'identifiants, Vigueur ne propose que `vigueur_status`, qui répond `"outcome": "not_configured"`.
> Créez votre compte avec [Créer votre compte PISTE](01-piste-account.md), puis exécutez
> `/plugin configure vigueur@vigueur`.

### 3. Vérifier que tout fonctionne

Demandez à Claude : « Lance `vigueur_status`. » Vigueur répond avec un objet JSON (transmis sur une
seule ligne de JSON ; indenté ici). Les deux sources doivent afficher `"state": "ok"` :

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

Si une source affiche un autre état, voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md). Si Claude signale encore l'ancien état après
que vous avez changé les identifiants, exécutez `/mcp`, sélectionnez **vigueur**, puis choisissez
**Reconnect**.

## Votre première question

Essayez : « Que dit l'article 1240 du Code civil, et est-il en vigueur ? » Voir ensuite
[Prise en main : vos premières questions](../20-using/01-quickstart.md).

## Voir aussi

- [Créer votre compte PISTE](01-piste-account.md)
- [Installer Vigueur](02-install.md)
- [Installer le fichier groupé pour Claude Desktop](04-install-claude-desktop.md)
- [Mettre à jour Vigueur](05-updating.md)
- [Désinstaller Vigueur](06-uninstalling.md)
- [Confidentialité et données](../00-intro/04-privacy-and-your-data.md)
