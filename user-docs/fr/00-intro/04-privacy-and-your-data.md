---
title: "Confidentialité et données"
level: guide
tags: [privacy, credentials, logs]
summary: "Sachez ce que Vigueur stocke et où, ce qui quitte votre ordinateur, ce que contiennent les journaux et ce que la désinstallation supprime."
updated: 2026-11-18
---

# Confidentialité et données

Vigueur fonctionne sur votre ordinateur et ne communique qu'avec un seul service : PISTE, la
passerelle d'API du gouvernement français. Il n'a ni serveur, ni système de comptes, ni outil de mesure d'audience
propre. Cette page indique ce qui est stocké, à quel endroit, et ce que vous pouvez y faire.

> **Testé sur macOS uniquement**
> Les emplacements ci-dessous ont été vérifiés sur macOS, en novembre 2026. Sous Windows et Linux,
> le coffre d'identifiants et les dossiers de journaux sont ailleurs.

## Ce qui quitte votre ordinateur

| Qui le reçoit | Quoi |
|---|---|
| PISTE (piste.gouv.fr) | L'identifiant client (*client ID*) et le secret client (*client secret*) de votre application, pour obtenir un jeton d'accès. Ensuite, chaque requête que Vigueur fait pour Claude : les mots, nombres, identifiants et dates qu'il recherche ou lit |
| Personne d'autre, depuis Vigueur | Vigueur n'envoie rien à une autre adresse |

PISTE voit les requêtes faites avec votre application, comme pour tout développeur qui utilise son
API. Ses propres conditions d'utilisation et sa politique de confidentialité s'y appliquent ;
consultez-les sur piste.gouv.fr.

Votre conversation avec Claude est un sujet distinct. Ce que vous écrivez à Claude, et ce que
les outils de Vigueur lui renvoient, sont traités par l'application Claude que vous utilisez et par
Anthropic selon leurs propres conditions, pas par Vigueur.

## Ce que Vigueur stocke

Vigueur n'écrit rien sur le disque : ni fichiers, ni base de données, ni copie du droit. Le jeton
d'accès que PISTE lui donne reste en mémoire et disparaît quand le serveur s'arrête. Pour éviter de
redemander les mêmes données, il garde aussi en mémoire, pendant un jour au plus : la liste des codes de Légifrance, les
deux dernières tables des matières de code qu'il a parcourues, et les valeurs de filtre que
Judilibre accepte. Tout disparaît quand le serveur s'arrête.

## Où sont conservés vos identifiants

L'application qui exécute Vigueur demande les réglages et les conserve. Vigueur les lit au
démarrage. Il ne les écrit pas dans ses journaux.

**Dans Claude Desktop** (voir [Installer dans Claude Desktop](../10-setup/03-install-claude-desktop.md)),
les trois réglages sont dans un même fichier,
`~/Library/Application Support/Claude/Claude Extensions Settings/local.mcpb.vigueur-contributors.vigueur.json` :

| Réglage | Comment il est stocké |
|---|---|
| Secret client PISTE (*client secret*) | Chiffré par Claude Desktop |
| Identifiant client PISTE (*client ID*) | Tel que saisi |
| Production application | Tel que saisi (activé ou désactivé) |

**Dans Claude Code** (voir [Installer dans Claude Code](../10-setup/02-install-claude-code.md)) :

| Réglage | Où il est stocké |
|---|---|
| Secret client PISTE (*client secret*) | Le coffre sécurisé d'identifiants de votre système (sur macOS, le Trousseau) |
| Identifiant client PISTE (*client ID*) | Les réglages utilisateur de Claude Code, `~/.claude/settings.json` |
| Environnement PISTE (`production` ou `sandbox`) | Les réglages utilisateur de Claude Code, `~/.claude/settings.json` |

> **Gardez les fichiers privés hors du dossier d'où vous installez**
> Claude Code copie tout le dossier d'où vous installez Vigueur dans
> `~/.claude/plugins/cache/vigueur/`. Ne mettez pas de fichier `.env` ni de document privé dans ce
> dossier. Le fichier groupé de Claude Desktop ne contient que Vigueur et les bibliothèques dont il
> a besoin.

## Journaux

Les journaux des deux applications ne contiennent ni arguments d'outil, ni résultats, ni
identifiants, ni vos questions.

**Claude Desktop** conserve ses journaux dans `~/Library/Logs/Claude/` :

- `mcp-server-Vigueur.log` : quand Vigueur démarre et s'arrête, et la liste de ses outils ;
- `mcp.log`, le journal de Claude Desktop pour tous ses serveurs MCP : les mêmes lignes pour
  Vigueur ;
- `main.log`, le journal propre de Claude Desktop : parmi ses autres messages, la ligne de
  démarrage de Vigueur, qui indique sa version et l'environnement PISTE utilisé.

Ils ne nomment un outil appelé par Claude que dans deux cas, par des messages de Vigueur lui-même
écrits dans `main.log` : une réponse qui dépasse la taille maximale
(`<tool> answer (<source>, <outcome>) is N characters, over the 40000-character cap.`) et une
erreur inattendue (sa trace d'erreur).

**Claude Code** tient un journal de connexion pour chaque projet où Vigueur a fonctionné. Sur macOS,
ils se trouvent dans `~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-vigueur-vigueur/`.
Un journal enregistre :

- les événements de connexion ;
- la ligne de démarrage de Vigueur, qui indique l'environnement PISTE utilisé ;
- les noms des outils appelés, avec leur durée ;
- les traces d'erreur.

## Votre historique de conversation

L'application Claude conserve vos conversations, y compris ce que les outils de Vigueur ont renvoyé,
comme pour toute conversation : Claude Desktop dans votre compte Claude, Claude Code dans
`~/.claude/projects/`. Cet historique relève de l'application, tout comme les réglages qui s'y
appliquent. Vigueur ne le lit pas et n'y écrit pas.

## Ce que la désinstallation supprime et laisse

La désinstallation supprime les réglages de Vigueur, secret client compris, dans les deux
applications. Les journaux et votre historique de conversation restent ; Claude Code laisse aussi sa
copie du plugin dans `~/.claude/plugins/cache/vigueur/` jusqu'à ce qu'il la supprime de lui-même. Le
dossier que vous avez cloné et le fichier groupé restent là où vous les avez mis. Les étapes et la
liste complète sont dans [Désinstaller Vigueur](../10-setup/05-uninstalling.md).

## Votre compte PISTE

Désinstaller Vigueur ne touche ni à votre compte PISTE ni à votre application. Vous les gérez sur
piste.gouv.fr, et Vigueur ne les modifie jamais.
