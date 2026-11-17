---
title: vigueur_status
level: reference
tags: [tool, status, piste, setup, errors]
summary: Check whether your PISTE credentials work and whether Légifrance and Judilibre answer, and understand the error answers every Vigueur tool can give.
updated: 2026-11-17
---

# vigueur_status

Checks Vigueur's setup: whether PISTE credentials are configured, which PISTE environment they use, and whether each source (Légifrance, Judilibre) answers and is enabled on your PISTE application. It gives step-by-step instructions for anything missing.

## What you can ask

- "Vérifie que Vigueur est bien configuré." / "Check that Vigueur is set up correctly."
- "Pourquoi Vigueur ne répond-il pas ?" / "Why is Vigueur not answering?"
- "Je n'ai pas encore de compte PISTE : que dois-je faire ?" / "I don't have a PISTE account yet: what do I do?"

Claude also runs it by itself when another Vigueur tool reports a credentials, access or availability problem.

## What it takes

Nothing. `vigueur_status` has no parameters.

## What the answer shows

It makes no change to anything: it reads your configuration and sends one small request to each source. The answer is one JSON object; on the wire it is a single line of JSON, and the excerpts here are indented, with `…` marking text left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md). Here `source` is `PISTE`, since the call is about your PISTE access.

`outcome` is `results` (Vigueur is configured and checked the sources) or `not_configured`.

**Not configured.** With no credentials, Vigueur offers only `vigueur_status`: the search and reading tools appear once credentials are set. `setup_guide` holds the steps, as text:

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

The guide reads, in full:

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

**A configuration problem** is listed in `config_problems`, together with the setup guide, because Vigueur treats the setup as not done. The outcome is `not_configured`:

```
"outcome": "not_configured",
"config_problems": [
  "PISTE_ENV must be \"production\" or \"sandbox\" (got \"prod\")"
],
```

One problem is reported at a time. The others are `PISTE_CLIENT_SECRET is missing (PISTE_CLIENT_ID is set)` and `PISTE_CLIENT_ID is missing (PISTE_CLIENT_SECRET is set)`. Vigueur echoes a mistyped environment only when the value is short (20 characters at most) and made of letters or hyphens; otherwise it says `got an unrecognised value`, in case a secret was pasted in the wrong place.

**Configured.** `environment` is the PISTE environment in use (`sandbox` or `production`), `config_problems` is empty, and `checks` has one entry per source:

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

Each check holds the `source` probed, its `state`, a `detail` (the reason the probe gave, or `null`) and `retry_after_seconds` (the delay PISTE asks for, or `null`). A source that does not answer shows a state other than `ok`, and `detail` may say why, for example `service error (HTTP 503)`. When a state calls for it, `warnings` carries the instructions:

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

| State | What it means | What `warnings` adds |
|---|---|---|
| `ok` | The source answered. | Nothing. |
| `not_enabled` | PISTE refused the request (HTTP 403): the API is not subscribed on your application. | The consent and apply steps (steps 3 and 4 above, as a short guide). |
| `credentials_invalid` | PISTE rejected the client ID and secret. | `PISTE rejected the credentials: check PISTE_CLIENT_ID and PISTE_CLIENT_SECRET.`, `Sandbox credentials only work with PISTE_ENV=sandbox, production credentials with PISTE_ENV=production.` and `In Claude Code with the Vigueur plugin, they are the plugin settings: change them with /plugin configure vigueur@vigueur, then reconnect with /mcp. In another MCP client, they are environment variables in its configuration.` |
| `quota_exceeded` | PISTE's rate limit is reached. | Nothing; `retry_after_seconds` gives the delay PISTE gives, when it gives one. |
| `unexpected_response` | PISTE answered, but not as Vigueur expects: an HTTP 400 or 404, or a body Vigueur cannot read. Possibly an API change; `detail` gives the answer. | ``PISTE answered the check in a way Vigueur does not expect (possibly an API change); `detail` gives the answer. Try again later; if it persists, report it.`` |
| `unavailable` | PISTE or the source did not answer in time, could not be reached, or answered with a server error. | `PISTE did not answer; try again in a moment. If it keeps failing, check https://piste.gouv.fr for incidents.` |

How each source is checked: Légifrance by asking for the list of codes (one entry), Judilibre by its health check. Both are checked at the same time. A check waits up to 8 seconds and is not retried. A source that refuses the check is reported as a check, not as an error.

## Error answers every Vigueur tool can give

When a tool fails, the answer is marked as an error and is a JSON object with `outcome` set to `error`:

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

`source` is the source that failed (`PISTE` for `vigueur_status`), `error.kind` names the kind of failure, and `error.message` says what happened (a first sentence about the failure, which varies) and then what to do (a fixed sentence, listed below). `request` repeats the call. `retrieved` appears only when a source answered (for example with an HTTP refusal); `cached` is not part of an error. The messages:

| Situation | `error.kind` | How `error.message` ends |
|---|---|---|
| Credentials rejected (by PISTE's sign-in, or HTTP 401 again after one new token) | `credentials_invalid` | `PISTE rejected the credentials. Check PISTE_CLIENT_ID and PISTE_CLIENT_SECRET, and PISTE_ENV (sandbox credentials only work with PISTE_ENV=sandbox). In Claude Code with the Vigueur plugin, they are the plugin settings: change them with /plugin configure vigueur@vigueur, then reconnect with /mcp. In another MCP client, they are environment variables in its configuration. Call vigueur_status to diagnose.` |
| Access refused (HTTP 403) | `forbidden` | `PISTE refused this request (HTTP 403). Call vigueur_status to check that the API is enabled on your PISTE application.` |
| Quota reached (HTTP 429, after one retry) | `quota_exceeded` | `PISTE quota reached. Retry in about {n} s.` or `PISTE quota reached. Wait a moment and try again.` |
| PISTE or the source unavailable, timed out or unreachable (after one retry; a failed PISTE sign-in is not retried) | `upstream_unavailable` | `PISTE is unavailable or timed out. Wait a moment and try again; if it persists, call vigueur_status.` |
| An answer Vigueur does not understand | `unexpected_response` | `{Source} returned a response Vigueur does not understand (possibly an API change). Try again later; if it persists, report it.` |
| No answer within 45 seconds | `deadline` | The whole message: `{Source} did not answer within 45 s. Try again in a moment.` |
| A request Vigueur or the source finds invalid | `invalid_input` | No added sentence: the message alone, for example `"date_from" must not be after "date_to".` |
| Anything else | `unexpected` | The whole message: `Unexpected error: {message}. Call vigueur_status to check the setup.` |

A decision or text that does not exist is not an error: the tools answer with `outcome: "not_found"` and say how to search. See [PISTE](../40-sources/03-piste.md) for the retry and timeout rules.

## Limits

- `vigueur_status` reports whether sources answer. It does not test your account's quotas beyond the single request it sends, and it cannot tell a wrong environment from wrong credentials: both show as `credentials_invalid`.
- It never shows your client secret.

## Related

- [PISTE](../40-sources/03-piste.md): what PISTE is, sandbox and production, quota.
- [Create your PISTE account](../10-setup/01-piste-account.md)
- [Install in Claude Code](../10-setup/02-install-claude-code.md)
- [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md)
