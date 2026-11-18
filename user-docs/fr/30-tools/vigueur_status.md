---
title: "vigueur_status"
level: reference
tags: [tool, status, piste, setup, errors]
summary: "Vérifier que vos identifiants PISTE fonctionnent et que Légifrance et Judilibre répondent, et comprendre les réponses d'erreur que tout outil Vigueur peut donner."
updated: 2026-11-18
---

# vigueur_status

Vérifie la configuration de Vigueur : si des identifiants PISTE sont configurés, quel environnement PISTE ils utilisent, et si chaque source (Légifrance, Judilibre) répond avec eux et est activée sur votre application PISTE. Il indique ce qu'il constate ; les étapes de configuration se trouvent dans [Créer votre compte PISTE](../10-setup/01-piste-account.md) et dans les pages d'installation.

## Ce que vous pouvez demander

- « Vérifie que Vigueur est bien configuré. » / « Check that Vigueur is set up correctly. »
- « Pourquoi Vigueur ne répond-il pas ? » / « Why is Vigueur not answering? »
- « Vigueur utilise-t-il la production ou le bac à sable ? » / « Is Vigueur using production or the sandbox? »

Claude le lance aussi de lui-même quand un autre outil Vigueur signale un problème d'identifiants, d'accès ou de disponibilité.

## Ce qu'il faut fournir

Rien. `vigueur_status` n'a aucun paramètre.

## Ce que montre la réponse

Il ne modifie rien : il lit votre configuration et envoie une petite requête à chaque source. La réponse est un objet JSON, transmis sur une seule ligne ; les extraits ci-dessous sont indentés, avec `…` pour marquer le texte omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md). Ici, `source` vaut `PISTE`, puisque l'appel porte sur votre accès PISTE, et `warnings` est toujours vide : la réponse dit ce que Vigueur a constaté, pas ce qu'il faut faire.

Le type de réponse (`outcome`) vaut `results` (Vigueur est configuré et a vérifié les sources) ou `not_configured`.

**Non configuré.** Sans identifiants, Vigueur ne propose que `vigueur_status` : les outils de recherche et de lecture apparaissent une fois les identifiants renseignés. La réponse :

```
{
  "source": "PISTE",
  "outcome": "not_configured",
  "warnings": [],
  "config_problems": [],
  "request": {
    "tool": "vigueur_status"
  },
  "retrieved": "2026-11-18T08:19:51Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

Pour configurer l'accès, suivez [Créer votre compte PISTE](../10-setup/01-piste-account.md), puis saisissez les valeurs dans votre application : voir [Installer dans Claude Desktop](../10-setup/03-install-claude-desktop.md#3-saisir-vos-identifiants) ou [Installer dans Claude Code](../10-setup/02-install-claude-code.md#3-saisir-vos-identifiants).

**Un problème de configuration** est listé dans `config_problems`. Le type de réponse est alors aussi `not_configured`, parce que Vigueur n'utilise pas des réglages qu'il ne sait pas lire :

```
"outcome": "not_configured",
"warnings": [],
"config_problems": [
  "PISTE_ENV must be \"production\" or \"sandbox\" (got \"prod\")"
],
```

Un seul problème est signalé à la fois. Les messages nomment les variables que l'application transmet à Vigueur : `PISTE_CLIENT_ID` et `PISTE_CLIENT_SECRET` contiennent l'identifiant client et le secret, `PISTE_ENV` est le réglage **PISTE environment** de Claude Code, et `PISTE_PRODUCTION` l'interrupteur **Production application** de Claude Desktop.

| Problème | Ce qu'il signifie |
|---|---|
| `PISTE_CLIENT_SECRET is missing (PISTE_CLIENT_ID is set)` | L'identifiant client est renseigné, pas le secret. |
| `PISTE_CLIENT_ID is missing (PISTE_CLIENT_SECRET is set)` | Le secret est renseigné, pas l'identifiant client. |
| `PISTE_ENV must be "production" or "sandbox" (got …)` | Le réglage d'environnement contient une autre valeur. |
| `PISTE_PRODUCTION must be "true" or "false" (got …)` | Le réglage de production contient une autre valeur. |
| `PISTE_ENV is "…" but PISTE_PRODUCTION is "…": set only one` | Les deux réglages sont donnés et ne concordent pas. |

Vigueur ne répète une valeur erronée que si elle est courte (20 caractères au plus) et composée de lettres ou de tirets ; sinon il écrit `got an unrecognised value`, au cas où un secret aurait été collé au mauvais endroit.

**Configuré.** `environment` est l'environnement PISTE utilisé (`sandbox` ou `production`), et `checks` contient une entrée par source :

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

Chaque vérification contient la `source` sondée, son `state`, un `detail` (la raison donnée par la sonde, ou `null`) et `retry_after_seconds` (le délai que PISTE demande, ou `null`). Une source qui ne répond pas affiche un état autre que `ok`, et `detail` peut en donner la raison, par exemple `service error (HTTP 503)` :

| État | Ce qu'il signifie | Voir |
|---|---|---|
| `ok` | La source a répondu. | |
| `not_enabled` | PISTE a refusé la requête (HTTP 403) : votre application n'est pas abonnée à l'API. | [Créer votre compte PISTE](../10-setup/01-piste-account.md), étapes 3 et 4 |
| `credentials_invalid` | PISTE a rejeté l'identifiant client et le secret. | [PISTE a rejeté mes identifiants](../00-intro/05-troubleshooting.md#piste-a-rejeté-mes-identifiants) |
| `quota_exceeded` | La limite de débit de PISTE est atteinte. `retry_after_seconds` donne le délai indiqué par PISTE, quand il en indique un. | [Quota](../00-intro/05-troubleshooting.md#piste-indique-que-le-quota-est-atteint) |
| `unexpected_response` | PISTE a répondu, mais pas comme Vigueur s'y attend : un HTTP 400 ou 404, ou un corps que Vigueur ne peut pas lire. Peut-être un changement d'API ; `detail` donne la réponse. | [Une source affiche `unexpected_response`](../00-intro/05-troubleshooting.md#une-source-affiche-unexpected_response) |
| `unavailable` | PISTE ou la source n'a pas répondu à temps, n'a pas pu être jointe, ou a répondu par une erreur serveur. | [PISTE est indisponible](../00-intro/05-troubleshooting.md#piste-est-indisponible-ou-a-dépassé-le-délai) |

Comment chaque source est vérifiée : Légifrance en demandant la liste des codes (une entrée), Judilibre par son test de disponibilité. Les deux sont vérifiées en même temps. Une vérification attend jusqu'à 8 secondes et n'est pas retentée. Une source qui refuse la vérification est signalée dans le résultat de la vérification, pas comme une erreur.

## Réponses d'erreur que tout outil Vigueur peut donner

Quand un outil échoue, la réponse est marquée comme une erreur et c'est un objet JSON dont `outcome` vaut `error` :

```
{
  "source": "Légifrance",
  "outcome": "error",
  "error": {
    "kind": "forbidden",
    "message": "Légifrance: access refused (HTTP 403)"
  },
  "request": {
    "tool": "legifrance_get_article",
    "code": "Code civil",
    "number": "1240",
    "at_date": "2026-11-16",
    "response_format": "concise",
    "offset": 0,
    "include_neighbours": false
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "vigueur_version": "0.1.0"
}
```

`source` est la source qui a échoué (`PISTE` pour `vigueur_status`), `error.kind` nomme le type d'échec, et `error.message` dit ce qui s'est passé. Pour certains types, une phrase fixe suit : quand réessayer, ou quand signaler le problème. `request` reprend l'appel. `retrieved` n'apparaît que lorsqu'une source a répondu (par exemple par un refus HTTP) ; `cached` ne fait pas partie d'une erreur. Les messages :

| Situation | `error.kind` | `error.message` |
|---|---|---|
| Identifiants rejetés (par la connexion de PISTE, ou par un nouveau HTTP 401 après l'obtention d'un nouveau jeton) | `credentials_invalid` | Le message seul : `PISTE rejected the credentials (HTTP 400).`, `PISTE rejected the credentials (HTTP 401).` ou `Légifrance: credentials rejected (HTTP 401)` (ou `Judilibre:`) |
| Accès refusé (HTTP 403) | `forbidden` | Le message seul : `Légifrance: access refused (HTTP 403)` (ou `Judilibre:`) |
| Quota atteint (HTTP 429, après une nouvelle tentative) | `quota_exceeded` | Se termine par `PISTE quota reached. Retry in about {n} s.` ou `PISTE quota reached. Wait a moment and try again.` |
| PISTE ou la source indisponible, délai dépassé ou injoignable (après une nouvelle tentative ; une connexion PISTE échouée n'est pas retentée) | `upstream_unavailable` | Se termine par `PISTE is unavailable or timed out. Wait a moment and try again; if it persists, call vigueur_status.` |
| Une réponse que Vigueur ne comprend pas | `unexpected_response` | Se termine par `{Source} returned a response Vigueur does not understand (possibly an API change). Try again later; if it persists, report it.` |
| Pas de réponse en 45 secondes | `deadline` | Le message entier : `{Source} did not answer within 45 s. Try again in a moment.` |
| Une requête que Vigueur ou la source juge invalide | `invalid_input` | Le message seul, par exemple `"date_from" must not be after "date_to".` |
| Toute autre situation | `unexpected` | Le message entier : `Unexpected error: {message}. Call vigueur_status to check the setup.` |

Une décision ou un texte qui n'existe pas n'est pas une erreur : les outils répondent avec `outcome: "not_found"` et indiquent comment chercher. Voir [PISTE](../40-sources/03-piste.md) pour les règles de nouvelle tentative et de délai.

## Limites

- `vigueur_status` indique si les sources répondent. Il ne teste pas les quotas de votre compte au-delà de la requête unique qu'il envoie, et il ne sait pas distinguer un mauvais environnement de mauvais identifiants : les deux apparaissent comme `credentials_invalid`.
- Il ne donne pas d'étapes de configuration : elles sont dans la documentation.
- Il n'affiche jamais votre secret client.

## Voir aussi

- [PISTE](../40-sources/03-piste.md) : ce qu'est PISTE, bac à sable et production, quota.
- [Créer votre compte PISTE](../10-setup/01-piste-account.md)
- [Installer dans Claude Desktop](../10-setup/03-install-claude-desktop.md)
- [Installer dans Claude Code](../10-setup/02-install-claude-code.md)
- [Dépannage et FAQ](../00-intro/05-troubleshooting.md)
