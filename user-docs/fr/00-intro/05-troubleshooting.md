---
title: "Dépannage et FAQ"
level: guide
tags: [troubleshooting, errors, faq, vigueur_status]
summary: "Retrouvez le message que Vigueur vous a donné, comprenez ce qu'il signifie et que faire, et vérifiez votre installation avec vigueur_status."
updated: 2026-11-24
---

# Dépannage et FAQ

Commencez ici quand quelque chose ne va pas avec Vigueur pendant que vous l'utilisez depuis un
assistant IA. La plupart des problèmes viennent des identifiants PISTE, ou des deux API qui ne sont
pas activées sur votre application PISTE. Une seule vérification repère l'un comme l'autre.

## D'abord, vérifiez votre installation

### Comment vérifier que Vigueur fonctionne ?

Demandez à l'assistant : « Lance `vigueur_status`. » Cet outil vérifie vos identifiants et
demande à PISTE si Légifrance et Judilibre répondent. La réponse est un objet JSON (transmis sur
une seule ligne de JSON ; indenté ici). Quand tout va bien, la réponse ressemble à ceci :

```
{
  "source": "PISTE",
  "outcome": "results",
  "warnings": [],
  "environment": "sandbox",
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
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

Un problème apparaît comme un `state` autre que `ok` dans l'entrée de la source sous `checks`. Les
états sont :

| État | Sens | Aller à |
|---|---|---|
| `ok` | La source répond | |
| `not_enabled` | L'API n'est pas activée sur votre application PISTE | [Légifrance ou Judilibre n'est pas activé](#une-source-affiche-not_enabled) |
| `credentials_invalid` | PISTE a rejeté vos identifiants | [PISTE a rejeté mes identifiants](#piste-a-rejeté-mes-identifiants) |
| `quota_exceeded` | La limite de débit de PISTE est atteinte | [Quota](#piste-indique-que-le-quota-est-atteint) |
| `unexpected_response` | PISTE a répondu, mais pas comme Vigueur s'y attend | [Une source affiche `unexpected_response`](#une-source-affiche-unexpected_response) |
| `unavailable` | PISTE n'a pas répondu à temps, n'a pas pu être joint, ou a répondu par une erreur de serveur | [PISTE est indisponible](#piste-est-indisponible-ou-a-dépassé-le-délai) |

Quand Vigueur n'a pas de jeton valide, la vérification se connecte d'abord à PISTE (jusqu'à
10 secondes). Elle interroge ensuite chaque source une fois et attend sa réponse jusqu'à 8 secondes.
Une source qui rejette le jeton (HTTP 401) est interrogée une seconde fois avec un nouveau jeton.

### L'assistant dit n'avoir que `vigueur_status`, ou ne trouve pas les autres outils de Vigueur

Vigueur ne propose ses outils juridiques que si l'identifiant client et le secret client sont
tous deux renseignés et que le réglage d'environnement est valide. Sinon, le seul outil disponible
est `vigueur_status`, et sa réponse indique dans `config_problems` tout problème de réglage.
Renseignez les identifiants :

- avec l'installation par défaut, dans la configuration MCP de l'application, puis redémarrez
  l'application. Voir
  [Installer Vigueur](../10-setup/02-install.md#1-ajouter-vigueur-à-votre-application) ;
- avec le plugin Claude Code, par `/plugin configure vigueur@vigueur`, puis exécutez `/mcp`,
  sélectionnez **vigueur** et choisissez **Reconnect**. Voir
  [Installer le plugin Claude Code](../10-setup/03-install-claude-code.md#2-saisir-vos-identifiants) ;
- avec le fichier groupé pour Claude Desktop, dans **Paramètres**, **Extensions**, **Vigueur**, puis
  cliquez sur **Enregistrer**. Voir
  [Installer le fichier groupé pour Claude Desktop](../10-setup/04-install-claude-desktop.md#3-saisir-vos-identifiants).

## Messages d'installation

### `"outcome": "not_configured"`

Vigueur n'a pas d'identifiants utilisables : aucun n'a été saisi, ou un réglage pose problème. Le
cas échéant, le problème est indiqué dans `config_problems` ; les messages sont ci-dessous. Créez
votre compte en suivant [Créer votre compte PISTE](../10-setup/01-piste-account.md), puis saisissez
les identifiants dans votre application. Les messages nomment les réglages par les variables qui
leur correspondent : `PISTE_CLIENT_ID` est le réglage **PISTE client ID**, `PISTE_CLIENT_SECRET` le
réglage **PISTE client secret**, et `PISTE_ENV` ou `PISTE_PRODUCTION` l'environnement (le réglage
**PISTE environment** du plugin Claude Code, le réglage **Production application** du fichier
groupé pour Claude Desktop).

### `PISTE_CLIENT_ID is missing (PISTE_CLIENT_SECRET is set)`

Vous avez saisi le secret client mais pas l'identifiant client. Vigueur donne le message correspondant
`PISTE_CLIENT_SECRET is missing (PISTE_CLIENT_ID is set)` quand c'est le secret qui manque.
Saisissez les deux dans les réglages de votre application.

### `PISTE_ENV must be "production" or "sandbox" (got …)`

Le réglage **PISTE environment** contient autre chose. Mettez-y `production` ou `sandbox`. Voir
[bac à sable ou production](../10-setup/01-piste-account.md#bac-à-sable-ou-production). Le message ne
répète la valeur que si elle est courte et composée de lettres ; sinon il dit `an unrecognised value`,
au cas où un secret aurait été collé là par erreur.

### `PISTE_PRODUCTION must be "true" or "false" (got …)`

Vigueur lit l'environnement dans `PISTE_ENV` (`production` ou `sandbox`) ou dans
`PISTE_PRODUCTION` (`true` pour la production, `false` pour le bac à sable). Ce message, et
`PISTE_ENV is "…" but PISTE_PRODUCTION is "…": set only one`, viennent d'une configuration
d'application qui définit ces variables à la main. Définissez l'une des deux, avec l'une de ses
valeurs.

### PISTE a rejeté mes identifiants

Le message de Vigueur est l'un de ceux-ci : `PISTE rejected the credentials (HTTP 400).`,
`PISTE rejected the credentials (HTTP 401).` ou `Légifrance: credentials rejected (HTTP 401)` (ou
`Judilibre:`). Ils signifient la même chose ; `vigueur_status` l'indique par `credentials_invalid`.
Vérifiez, dans cet ordre :

1. L'identifiant client et le secret client ont été copiés en entier, sans espace en trop.
2. Le réglage d'environnement correspond à l'application : bac à sable pour l'application que PISTE
   a créée pour vous, production pour celle que vous avez créée vous-même. Avec l'installation par
   défaut, c'est `PISTE_ENV` (ou `PISTE_PRODUCTION`) ; avec le plugin Claude Code, le réglage
   **PISTE environment** ; avec le fichier groupé pour Claude Desktop, l'interrupteur
   **Production application**.

Saisissez ensuite à nouveau les valeurs. Avec l'installation par défaut, dans la configuration MCP
de l'application, puis redémarrez l'application. Avec le plugin Claude Code, exécutez
`/plugin configure vigueur@vigueur`, puis redémarrez le serveur (voir
[le serveur est toujours l'ancien](#après-une-mise-à-jour-vigueur-se-comporte-toujours-comme-avant)).
Avec le fichier groupé pour Claude Desktop, dans **Paramètres**, **Extensions**, **Vigueur**, puis
cliquez sur **Enregistrer** : Claude Desktop redémarre Vigueur.

### Une source affiche `not_enabled`

Vos identifiants fonctionnent, mais l'application n'est pas abonnée à cette API. Sur piste.gouv.fr :

1. Ouvrez la page de consentement (« Cliquez ici pour accéder à la page de consentement »), cochez
   **Légifrance** et **JUDILIBRE**, puis cliquez sur **Validate my ToS choices**.
2. Modifiez l'application, cochez **Légifrance** et **JUDILIBRE**, puis cliquez sur **Apply
   changes** (« Appliquer les modifications »). Les cases deviennent grises une fois l'abonnement
   effectif ; vérifiez le tableau **Subscribed APIs**.

Quand PISTE refuse une recherche ou une lecture, la réponse est une erreur (`"outcome": "error"`, `"kind": "forbidden"`).
Son `message` est `Légifrance: access refused (HTTP 403)` (ou commence par `Judilibre:`). La cause
est la même.

## Messages pendant que l'assistant lit le droit

Quand une recherche ou une lecture échoue, la réponse est un objet JSON avec `"outcome": "error"`.
Son `error` contient un `kind` (la famille d'échec, comme `quota_exceeded`) et un `message`, le
texte cité dans les sections ci-dessous. Un message dit ce qui s'est passé ; pour certains types,
une phrase suit pour dire quand réessayer. Voir
[Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas).

### PISTE indique que le quota est atteint

```
"error": {
  "kind": "quota_exceeded",
  "message": "Légifrance: rate limit reached (HTTP 429) PISTE quota reached. Retry in about 30 s."
}
```

PISTE limite le nombre de requêtes qu'une application peut envoyer. Quand PISTE dit combien de temps
attendre, le message l'indique ; sinon il dit
`PISTE quota reached. Wait a moment and try again.` Attendez, puis reposez la question. Vigueur a déjà réessayé une fois de lui-même.

### PISTE est indisponible ou a dépassé le délai

Les messages que vous pouvez voir (`kind` `upstream_unavailable`), chacun suivi de
`PISTE is unavailable or timed out. Wait a moment and try again; if it persists, call vigueur_status.` :

- `Légifrance: service error (HTTP 503)` (ou un autre numéro 5xx, ou `Judilibre:` à la place)
- `Légifrance: request timed out after 10000 ms` (ou `30000 ms`)
- `Légifrance: network error while contacting the service`
- `PISTE authentication timed out.` ou `PISTE authentication failed: network error.`
- `PISTE authentication is unavailable (HTTP …).` ou `PISTE authentication returned an unexpected
  response.`

Vigueur attend jusqu'à 10 secondes la réponse à chaque requête envoyée à PISTE, et jusqu'à
30 secondes pour une requête qui lit un texte entier, la table des matières d'un code ou un journal
des modifications. Une requête vers Légifrance ou Judilibre qui échoue ainsi est tentée une seconde
fois avant que Vigueur abandonne ; une connexion à PISTE qui échoue (les messages
`PISTE authentication`) ne l'est pas. Vérifiez votre connexion internet, attendez un moment et
reposez la question. Si l'échec persiste, vérifiez sur piste.gouv.fr s'il y a un incident en cours.

### Une source affiche `unexpected_response`

PISTE a répondu à la vérification, mais pas comme Vigueur s'y attend : un HTTP 4xx autre que 401,
403 et 429 (comme 400 ou 404), ou une réponse que Vigueur ne peut pas lire ou qui dépasse 64 Mo.
`detail` donne ce que PISTE a répondu, par exemple `not found (HTTP 404)`. Cela signifie en général
que PISTE a changé quelque chose de son côté, pas que votre installation est en cause. Réessayez
plus tard ; si cela persiste, signalez-le avec le `detail`.

### `Légifrance did not answer within 45 s`

Chaque question que l'assistant pose à Vigueur dispose de 45 secondes au total. Quand la source met
plus longtemps, Vigueur s'arrête et répond par une erreur de `kind` `deadline` :

```
"error": {
  "kind": "deadline",
  "message": "Légifrance did not answer within 45 s. Try again in a moment."
}
```

Le même message existe pour Judilibre. Reposez la question ; si cela persiste, formulez une demande plus
restreinte, par exemple sur une période plus courte.

### `… returned a response Vigueur does not understand`

```
"error": {
  "kind": "unexpected_response",
  "message": "Légifrance: unexpected response (not valid JSON) Légifrance returned a response Vigueur does not understand (possibly an API change). Try again later; if it persists, report it."
}
```

Le message commence par l'erreur propre à la source, comme `Légifrance: unexpected response (not valid
JSON)`. La source a répondu sous une forme que Vigueur n'attendait pas. La même erreur survient
quand une réponse dépasse 64 Mo, que Vigueur ne lit pas (`Légifrance: response larger than 64 MB, not read.`),
et quand Légifrance liste un article ou un texte sans le renvoyer, ne donne pas de date de début à un
article, ou ne rattache un article à aucun texte. Réessayez plus tard. Si cela persiste, signalez-le
au projet Vigueur.

### `Unexpected error: …`

Pour tout autre échec (`kind` `unexpected`), le message se termine par : « Call vigueur_status to
check the setup. » Lancez d'abord cette vérification. Si elle ne signale aucun problème, signalez le
message au projet Vigueur.

### `request cancelled`

Vous, ou l'assistant, avez arrêté l'appel (`kind` `cancelled`). Il n'y a pas de problème.

## Quand rien n'est trouvé

Ne rien trouver n'est pas une erreur. La réponse contient `"outcome": "not_found"` (un document demandé
n'existe pas) ou `"outcome": "no_results"` (une recherche ou une liste est revenue vide), et les
phrases citées ci-dessous sont dans ses `warnings`.

### `No Légifrance article with id …` ou `No article … in … on Légifrance.`

La source ne détient pas cet article. Vérifiez l'intitulé du code et le numéro. Vigueur ne
devine pas : pour un intitulé de code erroné, il dit `Unknown code "…": no Légifrance code has this title` et peut ajouter des suggestions « Did you mean » que vous devez confirmer.

Quand un numéro existe dans plusieurs codes et que vous n'avez donné aucun code, Vigueur liste les
candidats et vous demande d'en choisir un.

### `No Légifrance decision with id …` ou `No Judilibre decision with id …`

L'identifiant est erroné, ou la décision est dans l'autre source. L'avertissement suivant nomme la
recherche de la même source : `legifrance_search_case_law` ou `judilibre_search_decisions`. Légifrance ne détient pas toutes les
décisions de la Cour de cassation ; pour une décision récente, une décision de cour d'appel ou un
rejet non spécialement motivé, utilisez Judilibre. Voir [RNSM/NA](03-glossary.md#rnsmna).

### Un `items` vide et `"outcome": "no_results"`

La recherche a bien eu lieu mais n'a rien trouvé : `items` est vide, et pour une recherche de
jurisprudence `warnings` contient une phrase commençant par `No` et nommant vos critères. Le même
`no_results` revient quand vous demandez une page au-delà de la dernière : `page` dit alors quelle
page vous avez demandée et combien il y en a. Essayez d'autres mots, moins de filtres, ou l'autre
source.

## Messages sur ce que vous avez demandé

Ces messages viennent de la requête elle-même, pas de PISTE. Le message dit ce qui ne va pas, ce
qui permet à l'assistant de corriger la requête et de réessayer. Exemples :

- `"offset" … is past the end of the text (… characters).` (un décalage égal à la longueur compte comme au-delà de la fin)
- `No text found for "…". Check the number, nature or id.` (`kind` `invalid_input` : le texte demandé pour une
  liste de modifications n'existe pas sous la forme indiquée. Donnez la nature et le numéro (« loi 78-17 »), le NOR, ou
  l'identifiant LEGITEXT ou JORFTEXT.)
- `"until" (…) is before "since" (…).` ou `"date_from" must not be after "date_to".`
- `"…" matches several texts: … Use the LEGITEXT id or the NOR.`
- `Légifrance: request rejected (HTTP 400): …` (ou un autre numéro 4xx), où `…` est le message
  propre à la source, par exemple `Légifrance: request rejected (HTTP 400): L'expression à valider est fausse.`
  Quand la source ne donne pas de message, il se lit `Légifrance: request rejected (HTTP 400).`

## Après une mise à jour

### Après une mise à jour, Vigueur se comporte toujours comme avant

Avec l'installation par défaut, l'application continue d'exécuter l'ancien serveur jusqu'à ce
qu'elle relance Vigueur : redémarrez l'application, ou rechargez ses serveurs MCP.

Dans Claude Code, chaque session ouverte continue d'exécuter l'ancien serveur jusqu'à ce que vous
le reconnectiez. `/reload-plugins` seul ne suffit pas. Exécutez `/mcp`, sélectionnez **vigueur**,
puis choisissez **Reconnect**. Une nouvelle session démarre la nouvelle version.

Dans Claude Desktop, un fichier groupé ne remplace le Vigueur installé que si sa version est plus
récente. `vigueur_version`, dans la réponse de `vigueur_status`, indique la version qui s'exécute.
Voir [Mettre à jour Vigueur](../10-setup/05-updating.md).

## Si le problème persiste

Lancez `vigueur_status` et conservez sa réponse, ainsi que le message exact que vous avez vu. Si
Vigueur ne démarre pas du tout, sa ligne de démarrage, ou l'erreur qui l'a arrêté, se trouve dans
les journaux de l'application : voir [Journaux](04-privacy-and-your-data.md#journaux). Ne collez
jamais votre secret client nulle part.
