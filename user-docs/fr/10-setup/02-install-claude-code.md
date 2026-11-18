---
title: "Installer dans Claude Code"
level: start
tags: [install, claude-code, setup]
summary: "Installez Vigueur dans Claude Code à partir d'une compilation locale, saisissez vos identifiants PISTE et vérifiez que Légifrance et Judilibre répondent."
updated: 2026-11-18
---

# Installer dans Claude Code

Vous allez télécharger Vigueur, le compiler une fois, l'ajouter à Claude Code comme plugin, saisir
vos identifiants PISTE et vérifier que tout fonctionne. Comptez environ dix minutes une fois votre
compte PISTE obtenu.

> **Testé sur macOS**
> Ces étapes ont été testées sur macOS. Les commandes sont les mêmes ailleurs, mais l'endroit où
> Claude Code stocke le secret client et les journaux diffère.

## Avant de commencer

- [Claude Code](https://claude.com/claude-code), qui fonctionne déjà.
- Node.js 20 ou plus récent, et git.
- Un compte et une application PISTE, avec l'identifiant client et le secret client sous la main.
  Si vous ne les avez pas encore, consultez [Créer votre compte PISTE](01-piste-account.md).

## Étapes

### 1. Télécharger et compiler Vigueur

Dans un terminal, dans un dossier où vous rangez vos projets :

```
git clone https://github.com/me-no-code/vigueur-mcp.git
cd vigueur-mcp
npm install
npm run build
pwd
```

`pwd` affiche le chemin absolu du dossier. Notez-le pour l'étape suivante.

`npm install` peut afficher un avertissement sur `fsevents` et « allow-scripts ». Il est sans
conséquence : ce paquet ne sert qu'aux développeurs, et Vigueur n'en a pas besoin.

> **Gardez le dossier propre**
> Claude Code copie tout le dossier dans son cache de plugins lors de l'installation. N'y mettez ni
> fichier `.env` ni document privé.

### 2. Ajouter Vigueur à Claude Code

Dans Claude Code, exécutez ces deux commandes. Remplacez le chemin par celui qu'a affiché `pwd`.

```
/plugin marketplace add /absolute/path/to/vigueur-mcp
/plugin install vigueur@vigueur
```

### 3. Saisir vos identifiants

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

### 4. Vérifier que tout fonctionne

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
- [Installer dans Claude Desktop](03-install-claude-desktop.md)
- [Mettre à jour Vigueur](04-updating.md)
- [Désinstaller Vigueur](05-uninstalling.md)
- [Confidentialité et données](../00-intro/04-privacy-and-your-data.md)
