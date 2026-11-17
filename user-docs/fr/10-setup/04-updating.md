---
title: "Mettre à jour Vigueur"
level: guide
tags: [update, claude-code]
summary: "Mettez Vigueur à jour vers une version plus récente et faites en sorte que la session Claude Code ouverte l'utilise."
updated: 2026-11-17
---

# Mettre à jour Vigueur

Vigueur se met à jour depuis le dossier que vous avez cloné. Vous récupérez le nouveau code, vous le
compilez, et vous reconnectez le serveur.

## Étapes

1. Dans un terminal, allez dans le dossier que vous avez cloné :

   ```
   cd /absolute/path/to/vigueur-mcp
   git pull
   npm install
   npm run build
   ```

2. Dans Claude Code, exécutez `/mcp`, sélectionnez **vigueur**, puis choisissez **Reconnect**.

3. Demandez à Claude de lancer `vigueur_status`, et vérifiez que les deux sources affichent `ok`.

> **Une compilation seule ne change rien dans une session ouverte**
> Chaque session Claude Code ouverte continue d'exécuter l'ancien serveur jusqu'à ce que vous le
> reconnectiez avec `/mcp`. `/reload-plugins` seul laisse l'ancien serveur en marche. Une session
> que vous démarrez après la compilation utilise le nouveau.

## Vérifier ce qui s'exécute

La ligne de démarrage de Vigueur, dans le journal de connexion, indique sa version et
l'environnement PISTE. Le journal est décrit dans
[Confidentialité et données](../00-intro/04-privacy-and-your-data.md#journaux).

## En cas de problème après une mise à jour

- Lancez `vigueur_status`. Voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md).
- Exécutez `/plugin configure vigueur@vigueur` pour consulter ou modifier vos identifiants.

## Voir aussi

- [Installer dans Claude Code](02-install-claude-code.md)
- [Désinstaller Vigueur](05-uninstalling.md)
