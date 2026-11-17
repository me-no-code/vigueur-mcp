---
title: "Confidentialité et données"
level: guide
tags: [privacy, credentials, logs]
summary: "Sachez ce que Vigueur stocke et où, ce qui quitte votre ordinateur, ce que contiennent les journaux et ce que la désinstallation supprime."
updated: 2026-11-17
---

# Confidentialité et données

Vigueur fonctionne sur votre ordinateur et ne communique qu'avec un seul service : PISTE, la
passerelle d'API du gouvernement français. Il n'a ni serveur, ni système de comptes, ni outil de mesure d'audience
propre. Cette page indique ce qui est stocké, à quel endroit, et ce que vous pouvez y faire.

> **Testé sur macOS uniquement**
> Les emplacements ci-dessous ont été vérifiés sur macOS. Sous Windows et Linux, le coffre
> d'identifiants et les dossiers de journaux sont ailleurs.

## Ce qui quitte votre ordinateur

| Qui le reçoit | Quoi |
|---|---|
| PISTE (piste.gouv.fr) | L'identifiant client (*client ID*) et le secret client (*client secret*) de votre application, pour obtenir un jeton d'accès. Ensuite, chaque requête que Vigueur fait pour Claude : les mots, nombres, identifiants et dates qu'il recherche ou lit |
| Personne d'autre, depuis Vigueur | Vigueur n'envoie rien à une autre adresse |

PISTE voit les requêtes faites avec votre application, comme pour tout développeur qui utilise son
API. Ses propres conditions d'utilisation et sa politique de confidentialité s'y appliquent ;
consultez-les sur piste.gouv.fr.

Votre conversation avec Claude est un sujet distinct. Ce que vous écrivez à Claude, et ce que
les outils de Vigueur lui renvoient, sont traités par Claude Code et Anthropic selon leurs propres
conditions, pas par Vigueur.

## Ce que Vigueur stocke

Vigueur n'écrit rien sur le disque : ni fichiers, ni base de données, ni copie du droit. Le jeton
d'accès que PISTE lui donne reste en mémoire et disparaît quand le serveur s'arrête. Pour éviter de
redemander les mêmes données, il garde aussi en mémoire, pendant un jour au plus : la liste des codes de Légifrance, les
deux dernières tables des matières de code qu'il a parcourues, et les valeurs de filtre que
Judilibre accepte. Tout disparaît quand le serveur s'arrête.

## Où sont conservés vos identifiants

Claude Code demande trois réglages quand vous activez le plugin. Voir
[Installer dans Claude Code](../10-setup/02-install-claude-code.md).

| Réglage | Où il est stocké |
|---|---|
| Secret client PISTE (*client secret*) | Le coffre sécurisé d'identifiants de votre système (sur macOS, le Trousseau) |
| Identifiant client PISTE (*client ID*) | Les réglages utilisateur de Claude Code, `~/.claude/settings.json` |
| Environnement PISTE (`production` ou `sandbox`) | Les réglages utilisateur de Claude Code, `~/.claude/settings.json` |

Vigueur les lit au démarrage. Il ne les écrit pas dans ses journaux.

> **Gardez les fichiers privés hors du dossier d'où vous installez**
> Claude Code copie tout le dossier d'où vous installez Vigueur dans
> `~/.claude/plugins/cache/vigueur/`. Ne mettez pas de fichier `.env` ni de document privé dans ce
> dossier.

## Journaux

Claude Code tient un journal de connexion pour chaque projet où Vigueur a fonctionné. Sur macOS, ils se
trouvent dans `~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-vigueur-vigueur/`. Un
journal enregistre :

- les événements de connexion ;
- la ligne de démarrage de Vigueur, qui indique l'environnement PISTE utilisé ;
- les noms des outils appelés, avec leur durée ;
- les traces d'erreur.

Un journal ne contient ni arguments d'outil, ni résultats, ni identifiants. Il ne contient pas vos
questions.

## Votre historique de conversation

Claude Code conserve vos conversations, y compris ce que les outils de Vigueur ont renvoyé, dans
`~/.claude/projects/`, comme pour toute conversation. Cet historique relève de Claude Code, tout
comme les réglages qui s'y appliquent. Vigueur ne le lit pas et n'y écrit pas.

## Ce que la désinstallation supprime et laisse

| | Supprimé | Laissé en place |
|---|---|---|
| Enregistrement du plugin | Oui | |
| Identifiant client et environnement | Oui | |
| Secret client | Oui, supprimé du coffre d'identifiants | |
| Copie du plugin dans `~/.claude/plugins/cache/vigueur/` | | Oui, marquée orpheline. Claude Code supprime plus tard de lui-même les copies orphelines ; vous pouvez supprimer le dossier vous-même |
| Journaux de connexion | | Oui, un dossier par projet |
| Historique des conversations | | Oui, il relève de Claude Code |
| Le dossier que vous avez cloné | | Oui, supprimez-le vous-même |

Les étapes sont dans [Désinstaller Vigueur](../10-setup/05-uninstalling.md).

## Votre compte PISTE

Désinstaller Vigueur ne touche ni à votre compte PISTE ni à votre application. Vous les gérez sur
piste.gouv.fr, et Vigueur ne les modifie jamais.
