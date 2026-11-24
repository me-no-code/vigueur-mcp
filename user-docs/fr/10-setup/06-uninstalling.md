---
title: "Désinstaller Vigueur"
level: guide
tags: [uninstall, cli, claude-desktop, claude-code, privacy]
summary: "Retirez Vigueur et ses identifiants de l'application qui l'exécute, et sachez ce qui reste et comment l'effacer."
updated: 2026-11-24
---

# Désinstaller Vigueur

Vous retirez Vigueur de l'application qui l'exécute. Quelques éléments restent en place ; cette page
les liste.

> **Testé sur macOS**
> Sur d'autres systèmes, le coffre d'identifiants et les journaux sont ailleurs.

## Installation par défaut

Si vous avez suivi [Installer Vigueur](02-install.md) :

1. Retirez le serveur `vigueur` de la configuration MCP de l'application, puis redémarrez
   l'application. Le secret client part avec lui : il se trouvait dans cette configuration.
2. Si vous exécutiez Vigueur depuis son code source, supprimez le dossier que vous avez
   décompressé ou cloné.

| Ce qui reste | Où | Que faire |
|---|---|---|
| La copie de Vigueur gardée par npm | Le cache de npm, dans `~/.npm/_npx/` sur macOS et Linux | Sans conséquence. Avec npm 11 ou plus récent, `npm cache npx ls` affiche son entrée et `npm cache npx rm <entry>` la supprime |
| Les journaux | Là où l'application conserve les journaux de ses serveurs MCP, si elle le fait | Consultez la documentation de l'application |
| L'historique des conversations | Dans l'application | Relève de l'application. Elle garde les résultats des outils comme pour toute conversation |
| Votre compte et votre application PISTE | piste.gouv.fr | Intacts. Gérez-les sur le site de PISTE |

## Plugin Claude Code

1. Dans Claude Code, exécutez :

   ```
   /plugin uninstall vigueur@vigueur
   /plugin marketplace remove vigueur
   ```

Claude Code supprime l'enregistrement du plugin, l'identifiant client et le réglage d'environnement,
ainsi que le secret client : sa valeur est retirée du coffre d'identifiants de votre système.

| Ce qui reste | Où | Que faire |
|---|---|---|
| La copie du plugin | `~/.claude/plugins/cache/vigueur/`, marquée orpheline | Claude Code supprime plus tard de lui-même les copies orphelines. Vous pouvez aussi supprimer le dossier |
| La copie de Vigueur gardée par npm | Le cache de npm, dans `~/.npm/_npx/` sur macOS et Linux | Sans conséquence. Avec npm 11 ou plus récent, `npm cache npx ls` affiche son entrée et `npm cache npx rm <entry>` la supprime |
| Les journaux de connexion | Sur macOS, un dossier par projet où Vigueur a fonctionné, dans `~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-vigueur-vigueur/` | Supprimez les dossiers si vous le souhaitez |
| L'historique des conversations | `~/.claude/projects/` | Relève de Claude Code. Il garde les résultats des outils comme pour toute conversation |
| Votre compte et votre application PISTE | piste.gouv.fr | Intacts. Gérez-les sur le site de PISTE |

## Fichier groupé pour Claude Desktop

Ouvrez **Paramètres**, puis **Extensions**, puis **Vigueur**, et cliquez sur **Désinstaller**.

Claude Desktop supprime l'extension et ses réglages, secret client compris : après une
réinstallation, Vigueur démarre sans identifiants.

| Ce qui reste | Où | Que faire |
|---|---|---|
| Les journaux | `~/Library/Logs/Claude/` : `mcp-server-Vigueur.log`, et les lignes de Vigueur dans `mcp.log` et `main.log` | Supprimez `mcp-server-Vigueur.log` si vous le souhaitez. `mcp.log` et `main.log` sont les journaux propres de Claude Desktop, communs à ses autres serveurs |
| L'historique des conversations | Votre compte Claude | Relève de Claude. Il garde les résultats des outils comme pour toute conversation |
| Le fichier groupé et, si vous l'avez compilé, le dossier décompressé ou cloné | Là où vous les avez mis | Supprimez-les vous-même |
| Votre compte et votre application PISTE | piste.gouv.fr | Intacts. Gérez-les sur le site de PISTE |

## Ce que contiennent les journaux

Les propres messages de Vigueur vont sur sa sortie d'erreur (*stderr*) : sa ligne de démarrage, les
problèmes de réglages et les erreurs. Ils ne nomment un outil que dans deux cas : une réponse qui
dépasse la taille maximale, et une erreur inattendue (sa trace d'erreur). L'application décide de
les conserver ou non, et y ajoute ses propres lignes : avec l'installation par défaut, consultez la
documentation de l'application.

Les journaux du plugin Claude Code et du fichier groupé pour Claude Desktop enregistrent les
événements de connexion et la ligne de démarrage de Vigueur. Ceux de Claude Code enregistrent aussi
les noms des outils appelés avec leur durée, et les traces d'erreur. Ces journaux ne contiennent ni
arguments d'outil, ni résultats, ni identifiants. Voir aussi
[Confidentialité et données](../00-intro/04-privacy-and-your-data.md#journaux).

## Réinstaller plus tard

Suivez de nouveau [Installer Vigueur](02-install.md),
[Installer le plugin Claude Code](03-install-claude-code.md) ou
[Installer le fichier groupé pour Claude Desktop](04-install-claude-desktop.md). Vous pouvez
réutiliser la même application PISTE.

## Voir aussi

- [Confidentialité et données](../00-intro/04-privacy-and-your-data.md)
- [Mettre à jour Vigueur](05-updating.md)
