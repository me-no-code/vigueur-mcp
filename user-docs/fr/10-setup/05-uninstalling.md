---
title: "Désinstaller Vigueur"
level: guide
tags: [uninstall, claude-code, privacy]
summary: "Retirez Vigueur et ses identifiants de Claude Code, et sachez ce qui reste et comment l'effacer."
updated: 2026-11-17
---

# Désinstaller Vigueur

Vous retirez Vigueur avec deux commandes dans Claude Code, puis vous supprimez le dossier que vous
avez cloné. Quelques éléments restent en place ; cette page les liste.

> **Testé sur macOS**
> Sur d'autres systèmes, le coffre d'identifiants et les journaux sont ailleurs.

## Étapes

1. Dans Claude Code, exécutez :

   ```
   /plugin uninstall vigueur@vigueur
   /plugin marketplace remove vigueur
   ```

2. Supprimez le dossier que vous avez cloné, par exemple `vigueur-mcp`.

## Ce qui est supprimé

Claude Code supprime l'enregistrement du plugin, l'identifiant client et le réglage d'environnement,
ainsi que le secret client : sa valeur est retirée du coffre d'identifiants de votre système.

## Ce qui reste

| Quoi | Où | Que faire |
|---|---|---|
| La copie du plugin | `~/.claude/plugins/cache/vigueur/`, marquée orpheline | Claude Code supprime plus tard de lui-même les copies orphelines. Vous pouvez aussi supprimer le dossier |
| Les journaux de connexion | Sur macOS, un dossier par projet où Vigueur a fonctionné, dans `~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-vigueur-vigueur/` | Supprimez les dossiers si vous le souhaitez |
| L'historique des conversations | `~/.claude/projects/` | Relève de Claude Code. Il garde les résultats des outils comme pour toute conversation |
| Votre compte et votre application PISTE | piste.gouv.fr | Intacts. Gérez-les sur le site de PISTE |

Les journaux enregistrent les événements de connexion, la ligne de démarrage de Vigueur, les noms
des outils appelés avec leur durée, et les traces d'erreur. Ils ne contiennent ni arguments d'outil,
ni résultats, ni identifiants. Voir [Confidentialité et données](../00-intro/04-privacy-and-your-data.md).

## Réinstaller plus tard

Suivez de nouveau [Installer dans Claude Code](02-install-claude-code.md). Vous pouvez réutiliser la
même application PISTE.

## Voir aussi

- [Confidentialité et données](../00-intro/04-privacy-and-your-data.md)
- [Mettre à jour Vigueur](04-updating.md)
