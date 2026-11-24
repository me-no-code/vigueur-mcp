---
title: "Confidentialité et données"
level: guide
tags: [privacy, credentials, logs]
summary: "Sachez ce que Vigueur stocke et où, ce qui quitte votre ordinateur, ce que contiennent les journaux et ce que la désinstallation supprime."
updated: 2026-11-24
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
| PISTE (piste.gouv.fr) | L'identifiant client (*client ID*) et le secret client (*client secret*) de votre application, pour obtenir un jeton d'accès. Ensuite, chaque requête que Vigueur fait pour l'assistant : les mots, nombres, identifiants et dates qu'il recherche ou lit |
| npm (registry.npmjs.org), avec `npx` | Quand l'application lance Vigueur par `npx` (installation par défaut et plugin Claude Code) : une demande du paquet de Vigueur, pour le télécharger ou vérifier s'il existe une version plus récente. Rien de vos conversations ni de vos identifiants |
| Personne d'autre, depuis Vigueur | Vigueur n'envoie rien à une autre adresse |

PISTE voit les requêtes faites avec votre application, comme pour tout développeur qui utilise son
API. Ses propres conditions d'utilisation et sa politique de confidentialité s'y appliquent ;
consultez-les sur piste.gouv.fr.

Votre conversation avec l'assistant est un sujet distinct. Ce que vous lui écrivez, et ce que les
outils de Vigueur lui renvoient, sont traités par l'application que vous utilisez et, quand son
assistant fonctionne comme service en ligne, par ce service, selon leurs propres conditions, pas
par Vigueur.

## Ce que Vigueur stocke

Vigueur n'écrit rien sur le disque : ni fichiers, ni base de données, ni copie du droit. Le jeton
d'accès que PISTE lui donne reste en mémoire et disparaît quand le serveur s'arrête. Pour éviter de
redemander les mêmes données, il garde aussi en mémoire, pendant un jour au plus : la liste des codes de Légifrance, les
deux dernières tables des matières de code qu'il a parcourues, et les valeurs de filtre que
Judilibre accepte. Tout disparaît quand le serveur s'arrête.

## Où sont conservés vos identifiants

L'application qui exécute Vigueur demande les réglages et les conserve. Vigueur les lit au
démarrage. Il ne les écrit pas dans ses journaux.

**Avec l'installation par défaut** (voir [Installer Vigueur](../10-setup/02-install.md)), les trois
réglages sont dans la configuration MCP de l'application, en clair, là où vous les avez saisis.
Gardez ce fichier privé.

**Avec le plugin Claude Code** (voir
[Installer le plugin Claude Code](../10-setup/03-install-claude-code.md)) :

| Réglage | Où il est stocké |
|---|---|
| Secret client PISTE (*client secret*) | Le coffre sécurisé d'identifiants de votre système (sur macOS, le Trousseau) |
| Identifiant client PISTE (*client ID*) | Les réglages utilisateur de Claude Code, `~/.claude/settings.json` |
| Environnement PISTE (`production` ou `sandbox`) | Les réglages utilisateur de Claude Code, `~/.claude/settings.json` |

**Avec le fichier groupé pour Claude Desktop** (voir
[Installer le fichier groupé pour Claude Desktop](../10-setup/04-install-claude-desktop.md)), les
trois réglages sont dans un même fichier,
`~/Library/Application Support/Claude/Claude Extensions Settings/local.mcpb.vigueur-contributors.vigueur.json` :

| Réglage | Comment il est stocké |
|---|---|
| Secret client PISTE (*client secret*) | Chiffré par Claude Desktop |
| Identifiant client PISTE (*client ID*) | Tel que saisi |
| Production application | Tel que saisi (activé ou désactivé) |

## Journaux

Vigueur ne tient aucun fichier de journal. Il écrit ses propres messages sur sa sortie d'erreur
(*stderr*), et l'application qui l'exécute décide de les conserver ou non, et où. Quelle que soit
l'application, ces messages sont :

- sa ligne de démarrage, qui indique sa version et l'environnement PISTE utilisé, par exemple
  `vigueur 0.1.0: ready on stdio (PISTE env: production)` ;
- les problèmes de réglages, comme un réglage manquant ;
- les erreurs : PISTE injoignable, une réponse qui dépasse la taille maximale
  (`<tool> answer (<source>, <outcome>) is N characters, over the 40000-character cap.`), ou une
  erreur inattendue, avec sa trace d'erreur.

Ils ne contiennent ni arguments d'outil, ni résultats, ni identifiants, ni questions, et ne nomment
un outil appelé que dans deux cas : une réponse qui dépasse la taille maximale, et une erreur
inattendue.

L'application peut ajouter ses propres lignes à ses journaux, sur la connexion ou les outils
qu'elle a appelés. Avec l'installation par défaut, la documentation de l'application indique où
sont ses journaux et ce qu'ils contiennent. Les deux paquets ci-dessous ont été vérifiés : leurs
journaux ne contiennent pas non plus d'arguments d'outil, de résultats, d'identifiants ni de
questions.

**Avec le plugin Claude Code**, Claude Code tient un journal de connexion pour chaque projet où
Vigueur a fonctionné. Sur macOS, ils se trouvent dans
`~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-vigueur-vigueur/`. Un journal
enregistre :

- les événements de connexion ;
- la ligne de démarrage de Vigueur ;
- les noms des outils appelés, avec leur durée ;
- les traces d'erreur.

**Avec le fichier groupé pour Claude Desktop**, Claude Desktop conserve ses journaux dans
`~/Library/Logs/Claude/` :

- `mcp-server-Vigueur.log` : quand Vigueur démarre et s'arrête, et la liste de ses outils ;
- `mcp.log`, le journal de Claude Desktop pour tous ses serveurs MCP : les mêmes lignes pour
  Vigueur ;
- `main.log`, le journal propre de Claude Desktop : parmi ses autres messages, ceux de Vigueur.

## Votre historique de conversation

L'application que vous utilisez décide de conserver ou non vos conversations, y compris ce que
les outils de Vigueur ont renvoyé, et où, comme pour toute conversation. Cet historique relève de
l'application, tout comme les réglages qui s'y appliquent. Vigueur ne le lit pas et n'y écrit pas.
Claude Code, par exemple, le conserve dans `~/.claude/projects/`, et Claude Desktop dans votre
compte Claude.

## Ce que la désinstallation supprime et laisse

La désinstallation supprime les réglages de Vigueur, secret client compris : avec l'installation
par défaut, quand vous retirez le serveur de la configuration de l'application ; avec le plugin
Claude Code ou le fichier groupé pour Claude Desktop, quand vous le désinstallez. Les journaux et
votre historique de conversation restent, tout comme la copie de Vigueur dans le cache de npm, le
fichier groupé, et le dossier où vous avez compilé Vigueur si vous l'exécutiez depuis son code
source. Claude Code laisse aussi sa copie du plugin dans
`~/.claude/plugins/cache/vigueur/` jusqu'à ce qu'il la supprime de lui-même. Les étapes et la liste
complète sont dans [Désinstaller Vigueur](../10-setup/06-uninstalling.md).

## Votre compte PISTE

Désinstaller Vigueur ne touche ni à votre compte PISTE ni à votre application. Vous les gérez sur
piste.gouv.fr, et Vigueur ne les modifie jamais.
