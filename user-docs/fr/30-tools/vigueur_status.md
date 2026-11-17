---
title: "vigueur_status"
level: reference
tags: [tool, status, piste, setup, errors]
summary: "Vérifier que vos identifiants PISTE fonctionnent et que Légifrance et Judilibre répondent, et comprendre les réponses d'erreur que tout outil Vigueur peut donner."
updated: 2026-11-17
---

# vigueur_status

Vérifie la configuration de Vigueur : si des identifiants PISTE sont configurés, quel environnement PISTE ils utilisent, et si chaque source (Légifrance, Judilibre) répond et est activée sur votre application PISTE. Il donne des instructions pas à pas pour tout ce qui manque.

## Ce que vous pouvez demander

- « Vérifie que Vigueur est bien configuré. » / « Check that Vigueur is set up correctly. »
- « Pourquoi Vigueur ne répond-il pas ? » / « Why is Vigueur not answering? »
- « Je n'ai pas encore de compte PISTE : que dois-je faire ? » / « I don't have a PISTE account yet: what do I do? »

Claude le lance aussi de lui-même quand un autre outil Vigueur signale un problème d'identifiants, d'accès ou de disponibilité.

## Ce qu'il faut fournir

Rien. `vigueur_status` n'a aucun paramètre.

## Ce que montre la réponse

Il ne modifie rien : il lit votre configuration et envoie une petite requête à chaque source. La réponse est un objet JSON, transmis sur une seule ligne ; les extraits ci-dessous sont indentés, avec `…` pour marquer le texte omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md). Ici, `source` vaut `PISTE`, puisque l'appel porte sur votre accès PISTE.

Le type de réponse (`outcome`) vaut `results` (Vigueur est configuré et a vérifié les sources) ou `not_configured`.

**Non configuré.** Sans identifiants, Vigueur ne propose que `vigueur_status` : les outils de recherche et de lecture apparaissent une fois les identifiants renseignés. `setup_guide` contient les étapes, sous forme de texte :

```
{
  "source": "PISTE",
  "outcome": "not_configured",
  "warnings": [],
  "config_problems": [],
  "setup_guide": "## Set up PISTE access\n\nVigueur reads French law through PISTE, the French government API portal. Access is free.\n\n1. Create a free account…",
  "request": {
    "tool": "vigueur_status"
  },
  …
}
```

Voici le guide en entier :

```
## Set up PISTE access

Vigueur reads French law through PISTE, the French government API portal. Access is free.

1. Create a free account on https://piste.gouv.fr and confirm your email address.
2. Open the **Applications** tab. A **SANDBOX** application already exists; applications you create yourself ("Créer une application") are **production** applications.
3. Open the consent page ("Cliquez ici pour accéder à la page de consentement"), tick **Légifrance** and **JUDILIBRE**, then click **Validate my ToS choices**.
4. Edit the application, tick **Légifrance** and **JUDILIBRE**, then click **Apply changes** ("Appliquer les modifications"). The boxes turn grey once subscribed; check the **Subscribed APIs** table.
5. Copy the application's OAuth **client ID** and **client secret**.
6. Enter the three values, then restart Vigueur:
   - `PISTE_CLIENT_ID` (plugin setting **PISTE client ID**): the client ID
   - `PISTE_CLIENT_SECRET` (**PISTE client secret**): the client secret
   - `PISTE_ENV` (**PISTE environment**): `sandbox` for the auto-created sandbox application, `production` otherwise

   In Claude Code with the Vigueur plugin, enter them with `/plugin configure vigueur@vigueur`, then run `/mcp`, select **vigueur** and choose **Reconnect**. In another MCP client, set them as environment variables in its configuration, then restart the client.
```

**Un problème de configuration** est listé dans `config_problems`, avec le guide de configuration, parce que Vigueur considère la configuration comme non terminée. Le type de réponse est `not_configured` :

```
"outcome": "not_configured",
"config_problems": [
  "PISTE_ENV must be \"production\" or \"sandbox\" (got \"prod\")"
],
```

Un seul problème est signalé à la fois. Les autres sont `PISTE_CLIENT_SECRET is missing (PISTE_CLIENT_ID is set)` et `PISTE_CLIENT_ID is missing (PISTE_CLIENT_SECRET is set)`. Vigueur ne reprend un environnement mal saisi que si la valeur est courte (20 caractères au plus) et faite de lettres ou de tirets ; sinon il dit `got an unrecognised value`, au cas où un secret aurait été collé au mauvais endroit.

**Configuré.** `environment` est l'environnement PISTE utilisé (`sandbox` ou `production`), `config_problems` est vide, et `checks` contient une entrée par source :

```
{
  "source": "PISTE",
  "outcome": "results",
  "warnings": [],
  "environment": "sandbox",
  "config_problems": [],
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

Chaque vérification contient la `source` sondée, son `state`, un `detail` (la raison donnée par la sonde, ou `null`) et `retry_after_seconds` (le délai que PISTE demande, ou `null`). Une source qui ne répond pas affiche un état autre que `ok`, et `detail` peut en donner la raison, par exemple `service error (HTTP 503)`. Quand un état l'exige, `warnings` porte les instructions :

```
{
  …
  "outcome": "results",
  "warnings": [
    "To enable a missing API on your PISTE application (https://piste.gouv.…"
  ],
  "environment": "sandbox",
  …
  "checks": [
    {
      "source": "Légifrance",
      "state": "not_enabled",
      "detail": null,
      "retry_after_seconds": null
    },
    {
      "source": "Judilibre",
      "state": "not_enabled",
      "detail": null,
      "retry_after_seconds": null
    }
  ],
  …
}
```

| État | Ce qu'il signifie | Ce que `warnings` ajoute |
|---|---|---|
| `ok` | La source a répondu. | Rien. |
| `not_enabled` | PISTE a refusé la requête (HTTP 403) : votre application n'est pas abonnée à l'API. | Les étapes du consentement et de l'application des modifications (étapes 3 et 4 ci-dessus, sous forme de guide court). |
| `credentials_invalid` | PISTE a rejeté l'identifiant client et le secret. | `PISTE rejected the credentials: check PISTE_CLIENT_ID and PISTE_CLIENT_SECRET.`, `Sandbox credentials only work with PISTE_ENV=sandbox, production credentials with PISTE_ENV=production.` et `In Claude Code with the Vigueur plugin, they are the plugin settings: change them with /plugin configure vigueur@vigueur, then reconnect with /mcp. In another MCP client, they are environment variables in its configuration.` |
| `quota_exceeded` | La limite de débit de PISTE est atteinte. | Rien ; `retry_after_seconds` donne le délai indiqué par PISTE, quand il en indique un. |
| `unexpected_response` | PISTE a répondu, mais pas comme Vigueur s'y attend : un HTTP 400 ou 404, ou un corps que Vigueur ne peut pas lire. Peut-être un changement d'API ; `detail` donne la réponse. | ``PISTE answered the check in a way Vigueur does not expect (possibly an API change); `detail` gives the answer. Try again later; if it persists, report it.`` |
| `unavailable` | PISTE ou la source n'a pas répondu à temps, n'a pas pu être jointe, ou a répondu par une erreur serveur. | `PISTE did not answer; try again in a moment. If it keeps failing, check https://piste.gouv.fr for incidents.` |

Comment chaque source est vérifiée : Légifrance en demandant la liste des codes (une entrée), Judilibre par son test de disponibilité. Les deux sont vérifiées en même temps. Une vérification attend jusqu'à 8 secondes et n'est pas retentée. Une source qui refuse la vérification est signalée dans le résultat de la vérification, pas comme une erreur.

## Réponses d'erreur que tout outil Vigueur peut donner

Quand un outil échoue, la réponse est marquée comme une erreur et c'est un objet JSON dont `outcome` vaut `error` :

```
{
  "source": "Légifrance",
  "outcome": "error",
  "error": {
    "kind": "forbidden",
    "message": "Légifrance: access refused (HTTP 403) PISTE refused this request (HTTP 403). Call vigueur_status to check that the API is enabled on your PISTE application."
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

`source` est la source qui a échoué (`PISTE` pour `vigueur_status`), `error.kind` nomme le type d'échec, et `error.message` dit ce qui s'est passé (une première phrase sur l'échec, qui varie) puis ce qu'il faut faire (une phrase fixe, listée ci-dessous). `request` reprend l'appel. `retrieved` n'apparaît que lorsqu'une source a répondu (par exemple par un refus HTTP) ; `cached` ne fait pas partie d'une erreur. Les messages :

| Situation | `error.kind` | Comment `error.message` se termine |
|---|---|---|
| Identifiants rejetés (par la connexion de PISTE, ou par un nouveau HTTP 401 après l'obtention d'un nouveau jeton) | `credentials_invalid` | `PISTE rejected the credentials. Check PISTE_CLIENT_ID and PISTE_CLIENT_SECRET, and PISTE_ENV (sandbox credentials only work with PISTE_ENV=sandbox). In Claude Code with the Vigueur plugin, they are the plugin settings: change them with /plugin configure vigueur@vigueur, then reconnect with /mcp. In another MCP client, they are environment variables in its configuration. Call vigueur_status to diagnose.` |
| Accès refusé (HTTP 403) | `forbidden` | `PISTE refused this request (HTTP 403). Call vigueur_status to check that the API is enabled on your PISTE application.` |
| Quota atteint (HTTP 429, après une nouvelle tentative) | `quota_exceeded` | `PISTE quota reached. Retry in about {n} s.` ou `PISTE quota reached. Wait a moment and try again.` |
| PISTE ou la source indisponible, délai dépassé ou injoignable (après une nouvelle tentative ; une connexion PISTE échouée n'est pas retentée) | `upstream_unavailable` | `PISTE is unavailable or timed out. Wait a moment and try again; if it persists, call vigueur_status.` |
| Une réponse que Vigueur ne comprend pas | `unexpected_response` | `{Source} returned a response Vigueur does not understand (possibly an API change). Try again later; if it persists, report it.` |
| Pas de réponse en 45 secondes | `deadline` | Le message entier : `{Source} did not answer within 45 s. Try again in a moment.` |
| Une requête que Vigueur ou la source juge invalide | `invalid_input` | Aucune phrase ajoutée : le message seul, par exemple `"date_from" must not be after "date_to".` |
| Toute autre situation | `unexpected` | Le message entier : `Unexpected error: {message}. Call vigueur_status to check the setup.` |

Une décision ou un texte qui n'existe pas n'est pas une erreur : les outils répondent avec `outcome: "not_found"` et indiquent comment chercher. Voir [PISTE](../40-sources/03-piste.md) pour les règles de nouvelle tentative et de délai.

## Limites

- `vigueur_status` indique si les sources répondent. Il ne teste pas les quotas de votre compte au-delà de la requête unique qu'il envoie, et il ne sait pas distinguer un mauvais environnement de mauvais identifiants : les deux apparaissent comme `credentials_invalid`.
- Il n'affiche jamais votre secret client.

## Voir aussi

- [PISTE](../40-sources/03-piste.md) : ce qu'est PISTE, bac à sable et production, quota.
- [Créer votre compte PISTE](../10-setup/01-piste-account.md)
- [Installer dans Claude Code](../10-setup/02-install-claude-code.md)
- [Dépannage et FAQ](../00-intro/05-troubleshooting.md)
