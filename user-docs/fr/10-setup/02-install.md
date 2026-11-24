---
title: "Installer Vigueur"
level: start
tags: [install, cli, setup]
summary: "Installez Vigueur comme serveur MCP local dans toute application capable d'en lancer un, saisissez vos identifiants PISTE et vérifiez que Légifrance et Judilibre répondent."
updated: 2026-11-24
---

# Installer Vigueur

Vigueur est un serveur MCP qui s'exécute sur votre ordinateur. Toute application capable de lancer
un serveur MCP local peut l'utiliser, qu'il s'agisse d'une application de bureau ou d'un assistant
en ligne de commande. Vous allez l'ajouter à la configuration MCP de l'application avec vos
identifiants PISTE et vérifier que tout fonctionne. L'application télécharge Vigueur depuis npm la
première fois qu'elle le lance. Comptez environ cinq minutes une fois votre compte PISTE obtenu.

Deux applications disposent aussi d'un paquet qui leur est propre, qui demande vos identifiants et
les conserve : [Installer le plugin Claude Code](03-install-claude-code.md) et
[Installer le fichier groupé pour Claude Desktop](04-install-claude-desktop.md).

> **Testé sur macOS**
> Ces étapes ont été testées sur macOS. La configuration est la même ailleurs, mais l'endroit où
> l'application la conserve diffère.

## Avant de commencer

- Une application capable de lancer un serveur MCP local : un serveur que l'application démarre
  par une commande et avec lequel elle communique par son entrée et sa sortie standard (*stdio*
  dans la plupart des documentations MCP).
- Node.js 22 ou plus récent, qui fournit `npx`. Pour le vérifier, lancez `node --version` dans un
  terminal.
- Un compte et une application PISTE, avec l'identifiant client et le secret client sous la main.
  Si vous ne les avez pas encore, consultez [Créer votre compte PISTE](01-piste-account.md).

## Étapes

### 1. Ajouter Vigueur à votre application

Ajoutez un serveur local à la configuration MCP de l'application. Il se lance avec la commande
`npx`, qui télécharge Vigueur depuis npm et l'exécute, et il lit vos identifiants dans trois
variables d'environnement. Le voici écrit sous forme de bloc JSON ; votre application peut attendre
une autre clé ou un autre format, et sa documentation indique où placer la configuration :

```json
{
  "mcpServers": {
    "vigueur": {
      "command": "npx",
      "args": ["-y", "vigueur-mcp"],
      "env": {
        "PISTE_CLIENT_ID": "",
        "PISTE_CLIENT_SECRET": "",
        "PISTE_ENV": "production"
      }
    }
  }
}
```

`-y` permet à `npx` de télécharger Vigueur sans demander de confirmation. Renseignez les
variables :

| Variable | Ce qu'il faut saisir |
|---|---|
| `PISTE_CLIENT_ID` | L'identifiant client de votre application PISTE |
| `PISTE_CLIENT_SECRET` | Le secret client de la même application |
| `PISTE_ENV` | `production` (valeur par défaut) pour une application que vous avez créée, `sandbox` pour celle que PISTE a créée pour vous |

L'environnement doit correspondre à l'application. Voir
[Bac à sable ou production](01-piste-account.md#bac-à-sable-ou-production). À la place de
`PISTE_ENV`, Vigueur lit aussi `PISTE_PRODUCTION` (`true` ou `false`), pour les applications dont
les réglages proposent un interrupteur. N'en renseignez qu'une des deux.

Si votre application ajoute un serveur par une commande plutôt que par un fichier, comme le font
certains assistants en ligne de commande, donnez à cette commande les mêmes éléments : `npx`, les
arguments `-y vigueur-mcp` et les trois variables. La documentation de l'application indique
comment.

Redémarrez ensuite l'application, ou rechargez ses serveurs MCP, pour qu'elle lance Vigueur. Le
premier démarrage prend un peu plus de temps : `npx` télécharge Vigueur et les bibliothèques dont
il a besoin.

Si l'application indique qu'elle ne trouve pas `npx`, donnez-lui le chemin complet : lancez
`which npx` dans un terminal (`where npx` sous Windows) et mettez le chemin affiché comme commande.

> **Le secret client est en clair dans ce fichier**
> Gardez le fichier de configuration privé : ne le partagez pas, et ne le versez pas dans un dépôt.
> Ne mettez le secret client que là, jamais dans une conversation avec un assistant. Une commande
> tapée dans un terminal peut aussi rester dans l'historique du terminal.

> **Pas encore de compte PISTE ?**
> Vous pouvez laisser les deux identifiants vides (`""`). Tant que vous n'avez pas saisi
> d'identifiants, Vigueur ne propose que `vigueur_status`, qui répond `"outcome": "not_configured"`.
> Créez votre compte avec [Créer votre compte PISTE](01-piste-account.md), puis revenez à cette
> étape.

### 2. Vérifier que tout fonctionne

Depuis l'assistant de votre application, demandez : « Lance `vigueur_status`. » Vigueur répond avec
un objet JSON (transmis sur une seule ligne de JSON ; indenté ici). Les deux sources doivent
afficher `"state": "ok"` :

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

Si une source affiche un autre état, voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md). Si
la réponse indique encore l'ancien état après que vous avez changé les identifiants, redémarrez
l'application ou ses serveurs MCP : Vigueur lit ses réglages à son démarrage.

## Quelle version s'exécute

Chaque fois que l'application lance Vigueur, `npx` demande à npm s'il existe une version plus
récente, et la télécharge le cas échéant : vous exécutez la dernière version publiée. Pour rester
sur une version, indiquez-la dans les arguments, par exemple `"args": ["-y", "vigueur-mcp@0.1.0"]`,
et changez-la quand vous voulez mettre à jour.

## Exécuter Vigueur depuis son code source

Pour essayer les changements intégrés depuis la dernière version publiée, ou pour exécuter Vigueur
sans `npx`, compilez-le vous-même. Il vous faut git en plus de Node.js 22 ou plus récent.

1. Dans un terminal, dans un dossier où vous rangez vos projets, récupérez le code et compilez-le :

   ```
   git clone https://github.com/me-no-code/vigueur-mcp.git
   cd vigueur-mcp
   npm ci
   npm run build
   pwd
   ```

   Pour la dernière version publiée plutôt que la version de développement, téléchargez
   **Source code (zip)** depuis https://github.com/me-no-code/vigueur-mcp/releases/latest au lieu
   de cloner, décompressez-le, et lancez les trois dernières commandes dans ce dossier.

   `npm ci` peut afficher un avertissement sur `fsevents` et « allow-scripts ». Il est sans
   conséquence : ce paquet ne sert qu'aux développeurs, et Vigueur n'en a pas besoin.

2. Dans la configuration MCP de l'application, lancez le serveur compilé avec `node` au lieu de
   `npx`. `pwd` a affiché le chemin absolu du dossier ; le serveur est le fichier `dist/index.js` de
   ce dossier :

   ```json
   "command": "node",
   "args": ["/absolute/path/to/vigueur-mcp/dist/index.js"],
   ```

   Le bloc `env` reste le même.

## Votre première question

Essayez : « Que dit l'article 1240 du Code civil, et est-il en vigueur ? » Voir ensuite
[Prise en main : vos premières questions](../20-using/01-quickstart.md).

## Voir aussi

- [Créer votre compte PISTE](01-piste-account.md)
- [Installer le plugin Claude Code](03-install-claude-code.md)
- [Installer le fichier groupé pour Claude Desktop](04-install-claude-desktop.md)
- [Mettre à jour Vigueur](05-updating.md)
- [Désinstaller Vigueur](06-uninstalling.md)
- [Confidentialité et données](../00-intro/04-privacy-and-your-data.md)
