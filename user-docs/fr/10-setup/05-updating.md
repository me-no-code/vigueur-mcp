---
title: "Mettre à jour Vigueur"
level: guide
tags: [update, cli, claude-desktop, claude-code]
summary: "Mettez Vigueur à jour vers une version plus récente, quelle que soit la façon dont vous l'avez installé, et vérifiez quelle version s'exécute."
updated: 2026-11-24
---

# Mettre à jour Vigueur

Avec l'installation par défaut, Vigueur se met à jour de lui-même quand l'application le lance. Avec
le plugin Claude Code, vous mettez à jour le plugin. Avec le fichier groupé pour Claude Desktop,
vous ouvrez le fichier groupé plus récent. Si vous exécutez Vigueur depuis son code source, vous
récupérez le nouveau code et le compilez.

## Installation par défaut

Si vous avez suivi [Installer Vigueur](02-install.md) :

1. Redémarrez l'application, ou rechargez ses serveurs MCP. Quand l'application lance Vigueur,
   `npx` demande à npm s'il existe une version plus récente, et la télécharge le cas échéant. Si
   vous avez indiqué une version dans les arguments (`vigueur-mcp@0.1.0`), changez-la d'abord.

2. Depuis l'assistant, demandez de lancer `vigueur_status`, et vérifiez que les deux sources
   affichent `ok`. `vigueur_version`, dans la réponse, est la version qui s'exécute.

## Plugin Claude Code

1. Dans un terminal, mettez à jour la marketplace, puis le plugin :

   ```
   claude plugin marketplace update vigueur
   claude plugin update vigueur@vigueur
   ```

2. Redémarrez Claude Code : une mise à jour s'applique après un redémarrage.

3. Demandez à Claude de lancer `vigueur_status`, et vérifiez que les deux sources affichent `ok`.

## Fichier groupé pour Claude Desktop

1. Obtenez le fichier groupé plus récent, comme dans
   [Installer le fichier groupé pour Claude Desktop](04-install-claude-desktop.md#1-obtenir-le-fichier-groupé).
2. Double-cliquez sur le fichier, puis cliquez sur **Installer** dans la fenêtre. Claude Desktop
   remplace la version installée.
3. Demandez à Claude de lancer `vigueur_status`, et vérifiez que les deux sources affichent `ok`.

> **Même numéro de version : désinstallez d'abord**
> Claude Desktop ne remplace Vigueur que par un fichier dont la version est plus récente. Pour
> réinstaller un fichier de même version (un fichier que vous avez recompilé, par exemple),
> désinstallez d'abord Vigueur (voir [Désinstaller Vigueur](06-uninstalling.md#fichier-groupé-pour-claude-desktop)),
> puis ouvrez le fichier et saisissez de nouveau vos réglages.

## Exécution depuis le code source

Si vous avez suivi
[Exécuter Vigueur depuis son code source](02-install.md#exécuter-vigueur-depuis-son-code-source),
récupérez le nouveau code de la même façon que vous l'avez obtenu :

- **La dernière version publiée :** téléchargez **Source code (zip)** depuis
  https://github.com/me-no-code/vigueur-mcp/releases/latest et décompressez-le.
- **La version de développement :** dans un terminal, dans le dossier que vous avez cloné, lancez
  `git pull`.

Puis, dans un terminal, dans ce dossier, lancez `npm ci` et `npm run build`, et redémarrez
l'application.

## Vérifier ce qui s'exécute

Lancez `vigueur_status` : `vigueur_version`, dans sa réponse, est la version qui a répondu. La ligne
de démarrage de Vigueur, dans les journaux, indique aussi sa version et l'environnement PISTE.
L'emplacement des journaux est décrit dans
[Confidentialité et données](../00-intro/04-privacy-and-your-data.md#journaux).

## En cas de problème après une mise à jour

- Lancez `vigueur_status`. Voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md).
- Consultez vos identifiants : avec l'installation par défaut, dans la configuration MCP de
  l'application ; avec le plugin Claude Code, par `/plugin configure vigueur@vigueur` ; avec le
  fichier groupé pour Claude Desktop, dans **Paramètres**, **Extensions**, **Vigueur**.

## Voir aussi

- [Installer Vigueur](02-install.md)
- [Installer le plugin Claude Code](03-install-claude-code.md)
- [Installer le fichier groupé pour Claude Desktop](04-install-claude-desktop.md)
- [Désinstaller Vigueur](06-uninstalling.md)
