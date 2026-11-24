---
title: "Installer le fichier groupé pour Claude Desktop"
level: start
tags: [install, claude-desktop, setup]
summary: "Installez Vigueur dans Claude Desktop à partir de son fichier groupé, saisissez vos identifiants PISTE et vérifiez que Légifrance et Judilibre répondent."
updated: 2026-11-24
---

# Installer le fichier groupé pour Claude Desktop

Vous allez obtenir Vigueur sous la forme d'un seul fichier, l'ouvrir dans Claude Desktop, saisir vos
identifiants PISTE et vérifier que tout fonctionne. Le fichier contient Vigueur prêt à l'emploi, et
Claude Desktop l'exécute avec le Node.js qu'il fournit. Comptez environ cinq minutes une fois votre
compte PISTE obtenu.

> **Testé sur macOS**
> Ces étapes ont été testées avec Claude Desktop sur macOS. Le fichier est aussi prévu pour Windows,
> mais il n'y a pas encore été essayé.

## Avant de commencer

- [Claude Desktop](https://claude.com/download), installé et connecté à votre compte.
- Un compte et une application PISTE, avec l'identifiant client et le secret client sous la main.
  Si vous ne les avez pas encore, consultez [Créer votre compte PISTE](01-piste-account.md).

## Étapes

### 1. Obtenir le fichier groupé

Le fichier porte le numéro de sa version, par exemple `vigueur-0.1.0.mcpb`. Téléchargez-le depuis la
dernière version publiée, sur la page GitHub Releases du projet, rubrique **Assets** :
https://github.com/me-no-code/vigueur-mcp/releases/latest

Pour vérifier que le fichier a bien été produit par la procédure de publication du projet sur
GitHub, lancez cette commande avec GitHub CLI (`gh`), dans le dossier où se trouve le fichier, avec
le nom de votre fichier :

```
gh attestation verify vigueur-0.1.0.mcpb --repo me-no-code/vigueur-mcp
```

Pour compiler le fichier vous-même à la place, il vous faut Node.js 22 ou plus récent. Récupérez
le code, la dernière version publiée ou la version de développement, comme dans
[Exécuter Vigueur depuis son code source](02-install.md#exécuter-vigueur-depuis-son-code-source).
Puis, dans un terminal, dans ce dossier :

```
npm ci
npm run bundle
```

Le fichier se trouve dans le dossier `build`.

### 2. Ouvrir le fichier

Double-cliquez sur le fichier. Claude Desktop s'ouvre et affiche sa fenêtre d'installation : les 14
outils de Vigueur, son développeur (Vigueur contributors), sa licence et sa version, et des liens
vers la documentation, l'assistance et la politique de confidentialité. Elle doit indiquer
**Toutes les exigences sont satisfaites**.

La fenêtre affiche aussi un avertissement qui commence par « L'installation accordera à cette
extension l'accès à tout ce qui se trouve sur votre ordinateur. » Claude Desktop l'affiche pour toute extension qu'Anthropic n'a pas vérifiée, ce qui est le cas de
ce fichier. Vigueur n'écrit rien sur le disque et n'envoie de requêtes qu'à PISTE (voir
[Confidentialité et données](../00-intro/04-privacy-and-your-data.md)). N'installez qu'un fichier
que vous avez compilé vous-même ou téléchargé depuis la page GitHub du projet.

Cliquez sur **Installer**.

### 3. Saisir vos identifiants

Ouvrez **Paramètres**, puis **Extensions**, puis **Vigueur**. Remplissez les trois réglages :

| Réglage | Ce qu'il faut saisir |
|---|---|
| PISTE client ID | L'identifiant client de votre application PISTE |
| PISTE client secret | Le secret client de la même application. Claude Desktop le stocke chiffré |
| Production application | Activé (valeur par défaut) pour une application que vous avez créée sur PISTE. Désactivé pour l'application de bac à sable que PISTE a créée pour vous |

Cliquez ensuite sur **Enregistrer**. Claude Desktop redémarre Vigueur avec les nouveaux réglages.
Pour les modifier plus tard, revenez au même endroit.

L'interrupteur doit correspondre à l'application. Voir
[Bac à sable ou production](01-piste-account.md#bac-à-sable-ou-production).

> **Pas encore de compte PISTE ?**
> Vous pouvez installer Vigueur en laissant les champs vides. Tant que vous n'avez pas saisi
> d'identifiants, Vigueur ne propose que `vigueur_status`, qui répond `"outcome": "not_configured"`.
> Créez votre compte avec [Créer votre compte PISTE](01-piste-account.md), puis revenez à cette
> étape.

Dans **Autorisations des outils**, les outils de Vigueur sont d'abord sur **Approbation requise** :
Claude Desktop vous demande votre accord avant d'en lancer un. Vous pouvez changer cela pour chaque
outil.

### 4. Vérifier que tout fonctionne

Demandez à Claude : « Lance `vigueur_status`. » Claude Desktop présente la réponse de Vigueur sous
forme de tableau de champs (**Environment**, **Check 1 source**, **Check 1 state**, etc.). Derrière
le tableau se trouve un objet JSON. Vous devez voir `production` (ou `sandbox` si vous avez
désactivé l'interrupteur) et les deux sources à `ok` :

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

Si une source affiche un autre état, voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md).

## Votre première question

Essayez : « Que dit l'article 1240 du Code civil, et est-il en vigueur ? » Voir ensuite
[Prise en main : vos premières questions](../20-using/01-quickstart.md).

## Voir aussi

- [Créer votre compte PISTE](01-piste-account.md)
- [Installer Vigueur](02-install.md)
- [Installer le plugin Claude Code](03-install-claude-code.md)
- [Mettre à jour Vigueur](05-updating.md)
- [Désinstaller Vigueur](06-uninstalling.md)
- [Confidentialité et données](../00-intro/04-privacy-and-your-data.md)
