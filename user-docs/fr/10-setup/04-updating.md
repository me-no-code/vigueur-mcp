---
title: "Mettre à jour Vigueur"
level: guide
tags: [update, claude-desktop, claude-code]
summary: "Mettez Vigueur à jour vers une version plus récente dans Claude Desktop ou Claude Code, et vérifiez quelle version s'exécute."
updated: 2026-11-18
---

# Mettre à jour Vigueur

Dans Claude Desktop, vous ouvrez le fichier groupé plus récent. Dans Claude Code, vous récupérez le
nouveau code, vous le compilez, et vous reconnectez le serveur.

## Dans Claude Desktop

1. Obtenez le fichier groupé plus récent, comme dans
   [Installer dans Claude Desktop](03-install-claude-desktop.md#1-obtenir-le-fichier-groupé).
2. Double-cliquez sur le fichier, puis cliquez sur **Installer** dans la fenêtre. Claude Desktop
   remplace la version installée.
3. Demandez à Claude de lancer `vigueur_status`, et vérifiez que les deux sources affichent `ok`.

> **Même numéro de version : désinstallez d'abord**
> Claude Desktop ne remplace Vigueur que par un fichier dont la version est plus récente. Pour
> réinstaller un fichier de même version (un fichier que vous avez recompilé, par exemple),
> désinstallez d'abord Vigueur (voir [Désinstaller Vigueur](05-uninstalling.md#dans-claude-desktop)),
> puis ouvrez le fichier et saisissez de nouveau vos réglages.

## Dans Claude Code

1. Dans un terminal, allez dans le dossier que vous avez cloné :

   ```
   cd /absolute/path/to/vigueur-mcp
   git pull
   npm ci
   npm run build
   ```

2. Dans Claude Code, exécutez `/mcp`, sélectionnez **vigueur**, puis choisissez **Reconnect**.

3. Demandez à Claude de lancer `vigueur_status`, et vérifiez que les deux sources affichent `ok`.

> **Une compilation seule ne change rien dans une session ouverte**
> Chaque session Claude Code ouverte continue d'exécuter l'ancien serveur jusqu'à ce que vous le
> reconnectiez avec `/mcp`. `/reload-plugins` seul laisse l'ancien serveur en marche. Une session
> que vous démarrez après la compilation utilise le nouveau.

## Vérifier ce qui s'exécute

Demandez à Claude de lancer `vigueur_status` : `vigueur_version`, dans sa réponse, est la version
qui a répondu. La ligne de démarrage de Vigueur, dans les journaux, indique aussi sa version et
l'environnement PISTE. L'emplacement des journaux est décrit dans
[Confidentialité et données](../00-intro/04-privacy-and-your-data.md#journaux).

## En cas de problème après une mise à jour

- Lancez `vigueur_status`. Voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md).
- Consultez vos identifiants : dans Claude Desktop, dans **Paramètres**, **Extensions**,
  **Vigueur** ; dans Claude Code, avec `/plugin configure vigueur@vigueur`.

## Voir aussi

- [Installer dans Claude Desktop](03-install-claude-desktop.md)
- [Installer dans Claude Code](02-install-claude-code.md)
- [Désinstaller Vigueur](05-uninstalling.md)
