---
title: vigueur_status
level: reference
tags: [tool, status, piste, setup, errors]
summary: Check whether your PISTE credentials work and whether Légifrance and Judilibre answer, and understand the error answers every Vigueur tool can give.
updated: 2026-11-18
---

# vigueur_status

Checks Vigueur's setup: whether PISTE credentials are configured, which PISTE environment they use, and whether each source (Légifrance, Judilibre) answers with them and is enabled on your PISTE application. It reports what it finds; the setup steps are in [Create your PISTE account](../10-setup/01-piste-account.md) and the install pages.

## What you can ask

- "Vérifie que Vigueur est bien configuré." / "Check that Vigueur is set up correctly."
- "Pourquoi Vigueur ne répond-il pas ?" / "Why is Vigueur not answering?"
- "Vigueur utilise-t-il la production ou le bac à sable ?" / "Is Vigueur using production or the sandbox?"

Claude also runs it by itself when another Vigueur tool reports a credentials, access or availability problem.

## What it takes

Nothing. `vigueur_status` has no parameters.

## What the answer shows

It makes no change to anything: it reads your configuration and sends one small request to each source. The answer is one JSON object; on the wire it is a single line of JSON, and the excerpts here are indented, with `…` marking text left out. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md). Here `source` is `PISTE`, since the call is about your PISTE access, and `warnings` is always empty: the answer states what Vigueur found, not what to do about it.

`outcome` is `results` (Vigueur is configured and checked the sources) or `not_configured`.

**Not configured.** With no credentials, Vigueur offers only `vigueur_status`: the search and reading tools appear once credentials are set. The answer:

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

To set up access, follow [Create your PISTE account](../10-setup/01-piste-account.md), then enter the values in your app: see [Install in Claude Desktop](../10-setup/03-install-claude-desktop.md#3-enter-your-credentials) or [Install in Claude Code](../10-setup/02-install-claude-code.md#3-enter-your-credentials).

**A configuration problem** is listed in `config_problems`. The outcome is then `not_configured` too, because Vigueur does not use settings it cannot read:

```
"outcome": "not_configured",
"warnings": [],
"config_problems": [
  "PISTE_ENV must be \"production\" or \"sandbox\" (got \"prod\")"
],
```

One problem is reported at a time. The messages name the variables the app passes to Vigueur: `PISTE_CLIENT_ID` and `PISTE_CLIENT_SECRET` hold the client ID and secret, `PISTE_ENV` is Claude Code's **PISTE environment** setting, and `PISTE_PRODUCTION` is Claude Desktop's **Production application** switch.

| Problem | What it means |
|---|---|
| `PISTE_CLIENT_SECRET is missing (PISTE_CLIENT_ID is set)` | The client ID is set, the secret is not. |
| `PISTE_CLIENT_ID is missing (PISTE_CLIENT_SECRET is set)` | The secret is set, the client ID is not. |
| `PISTE_ENV must be "production" or "sandbox" (got …)` | The environment setting holds another value. |
| `PISTE_PRODUCTION must be "true" or "false" (got …)` | The production setting holds another value. |
| `PISTE_ENV is "…" but PISTE_PRODUCTION is "…": set only one` | Both settings are given and they disagree. |

Vigueur echoes a wrong value only when it is short (20 characters at most) and made of letters or hyphens; otherwise it says `got an unrecognised value`, in case a secret was pasted in the wrong place.

**Configured.** `environment` is the PISTE environment in use (`sandbox` or `production`), and `checks` has one entry per source:

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

Each check holds the `source` probed, its `state`, a `detail` (the reason the probe gave, or `null`) and `retry_after_seconds` (the delay PISTE asks for, or `null`). A source that does not answer shows a state other than `ok`, and `detail` may say why, for example `service error (HTTP 503)`:

| State | What it means | See |
|---|---|---|
| `ok` | The source answered. | |
| `not_enabled` | PISTE refused the request (HTTP 403): the API is not subscribed on your application. | [Create your PISTE account](../10-setup/01-piste-account.md), steps 3 and 4 |
| `credentials_invalid` | PISTE rejected the client ID and secret. | [PISTE rejected my credentials](../00-intro/05-troubleshooting.md#piste-rejected-my-credentials) |
| `quota_exceeded` | PISTE's rate limit is reached. `retry_after_seconds` gives the delay PISTE asks for, when it gives one. | [Quota](../00-intro/05-troubleshooting.md#piste-says-the-quota-is-reached) |
| `unexpected_response` | PISTE answered, but not as Vigueur expects: an HTTP 400 or 404, or a body Vigueur cannot read. Possibly an API change; `detail` gives the answer. | [A source shows `unexpected_response`](../00-intro/05-troubleshooting.md#a-source-shows-unexpected_response) |
| `unavailable` | PISTE or the source did not answer in time, could not be reached, or answered with a server error. | [PISTE is unavailable](../00-intro/05-troubleshooting.md#piste-is-unavailable-or-timed-out) |

How each source is checked: Légifrance by asking for the list of codes (one entry), Judilibre by its health check. Both are checked at the same time. A check waits up to 8 seconds and is not retried. A source that refuses the check is reported as a check, not as an error.

## Error answers every Vigueur tool can give

When a tool fails, the answer is marked as an error and is a JSON object with `outcome` set to `error`:

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

`source` is the source that failed (`PISTE` for `vigueur_status`), `error.kind` names the kind of failure, and `error.message` says what happened. For some kinds, a fixed sentence follows: when to try again, or when to report it. `request` repeats the call. `retrieved` appears only when a source answered (for example with an HTTP refusal); `cached` is not part of an error. The messages:

| Situation | `error.kind` | `error.message` |
|---|---|---|
| Credentials rejected (by PISTE's sign-in, or HTTP 401 again after one new token) | `credentials_invalid` | The message alone: `PISTE rejected the credentials (HTTP 400).`, `PISTE rejected the credentials (HTTP 401).` or `Légifrance: credentials rejected (HTTP 401)` (or `Judilibre:`) |
| Access refused (HTTP 403) | `forbidden` | The message alone: `Légifrance: access refused (HTTP 403)` (or `Judilibre:`) |
| Quota reached (HTTP 429, after one retry) | `quota_exceeded` | Ends with `PISTE quota reached. Retry in about {n} s.` or `PISTE quota reached. Wait a moment and try again.` |
| PISTE or the source unavailable, timed out or unreachable (after one retry; a failed PISTE sign-in is not retried) | `upstream_unavailable` | Ends with `PISTE is unavailable or timed out. Wait a moment and try again; if it persists, call vigueur_status.` |
| An answer Vigueur does not understand | `unexpected_response` | Ends with `{Source} returned a response Vigueur does not understand (possibly an API change). Try again later; if it persists, report it.` |
| No answer within 45 seconds | `deadline` | The whole message: `{Source} did not answer within 45 s. Try again in a moment.` |
| A request Vigueur or the source finds invalid | `invalid_input` | The message alone, for example `"date_from" must not be after "date_to".` |
| Anything else | `unexpected` | The whole message: `Unexpected error: {message}. Call vigueur_status to check the setup.` |

A decision or text that does not exist is not an error: the tools answer with `outcome: "not_found"` and say how to search. See [PISTE](../40-sources/03-piste.md) for the retry and timeout rules.

## Limits

- `vigueur_status` reports whether sources answer. It does not test your account's quotas beyond the single request it sends, and it cannot tell a wrong environment from wrong credentials: both show as `credentials_invalid`.
- It gives no setup steps: those are in the documentation.
- It never shows your client secret.

## Related

- [PISTE](../40-sources/03-piste.md): what PISTE is, sandbox and production, quota.
- [Create your PISTE account](../10-setup/01-piste-account.md)
- [Install in Claude Desktop](../10-setup/03-install-claude-desktop.md)
- [Install in Claude Code](../10-setup/02-install-claude-code.md)
- [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md)
