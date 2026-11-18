---
title: "Désinstaller Vigueur"
level: guide
tags: [uninstall, claude-desktop, claude-code, privacy]
summary: "Retirez Vigueur et ses identifiants de Claude Desktop ou de Claude Code, et sachez ce qui reste et comment l'effacer."
updated: 2026-11-18
---

# Désinstaller Vigueur

Vous retirez Vigueur de l'application qui l'exécute. Quelques éléments restent en place ; cette page
les liste.

> **Testé sur macOS**
> Sur d'autres systèmes, le coffre d'identifiants et les journaux sont ailleurs.

## Dans Claude Desktop

Ouvrez **Paramètres**, puis **Extensions**, puis **Vigueur**, et cliquez sur **Désinstaller**.

Claude Desktop supprime l'extension et ses réglages, secret client compris : après une
réinstallation, Vigueur démarre sans identifiants.

| Ce qui reste | Où | Que faire |
|---|---|---|
| Les journaux | `~/Library/Logs/Claude/` : `mcp-server-Vigueur.log`, et les lignes de Vigueur dans `mcp.log` et `main.log` | Supprimez `mcp-server-Vigueur.log` si vous le souhaitez. `mcp.log` et `main.log` sont les journaux propres de Claude Desktop, communs à ses autres serveurs |
| L'historique des conversations | Votre compte Claude | Relève de Claude. Il garde les résultats des outils comme pour toute conversation |
| Le fichier groupé et, si vous l'avez compilé, le dossier cloné | Là où vous les avez mis | Supprimez-les vous-même |
| Votre compte et votre application PISTE | piste.gouv.fr | Intacts. Gérez-les sur le site de PISTE |

## Dans Claude Code

1. Dans Claude Code, exécutez :

   ```
   /plugin uninstall vigueur@vigueur
   /plugin marketplace remove vigueur
   ```

2. Supprimez le dossier que vous avez cloné, par exemple `vigueur-mcp`.

Claude Code supprime l'enregistrement du plugin, l'identifiant client et le réglage d'environnement,
ainsi que le secret client : sa valeur est retirée du coffre d'identifiants de votre système.

| Ce qui reste | Où | Que faire |
|---|---|---|
| La copie du plugin | `~/.claude/plugins/cache/vigueur/`, marquée orpheline | Claude Code supprime plus tard de lui-même les copies orphelines. Vous pouvez aussi supprimer le dossier |
| Les journaux de connexion | Sur macOS, un dossier par projet où Vigueur a fonctionné, dans `~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-vigueur-vigueur/` | Supprimez les dossiers si vous le souhaitez |
| L'historique des conversations | `~/.claude/projects/` | Relève de Claude Code. Il garde les résultats des outils comme pour toute conversation |
| Votre compte et votre application PISTE | piste.gouv.fr | Intacts. Gérez-les sur le site de PISTE |

## Ce que contiennent les journaux

Les journaux enregistrent les événements de connexion et la ligne de démarrage de Vigueur. Ceux de
Claude Code enregistrent aussi les noms des outils appelés avec leur durée, et les traces d'erreur.
Les messages de Vigueur lui-même ne nomment un outil que dans deux cas : une réponse qui dépasse la
taille maximale, et une erreur inattendue (sa trace d'erreur). Les journaux ne contiennent ni
arguments d'outil, ni résultats, ni identifiants. Voir
[Confidentialité et données](../00-intro/04-privacy-and-your-data.md#journaux).

## Réinstaller plus tard

Suivez de nouveau [Installer dans Claude Desktop](03-install-claude-desktop.md) ou
[Installer dans Claude Code](02-install-claude-code.md). Vous pouvez réutiliser la même application
PISTE.

## Voir aussi

- [Confidentialité et données](../00-intro/04-privacy-and-your-data.md)
- [Mettre à jour Vigueur](04-updating.md)
