---
title: Troubleshooting and FAQ
level: guide
tags: [troubleshooting, errors, faq, vigueur_status]
summary: Find the message Vigueur gave you, learn what it means and what to do, and check your setup with vigueur_status.
updated: 2026-11-17
---

# Troubleshooting and FAQ

Start here when Claude tells you something is wrong with Vigueur. Most problems come from the
PISTE credentials or from the two APIs not being enabled on your PISTE application. One check finds
both.

## First, check your setup

### How do I check that Vigueur works?

Ask Claude: "Run `vigueur_status`." It checks your credentials and asks PISTE whether Légifrance and
Judilibre answer. The answer is one JSON object (on the wire, a single line of JSON; it is indented
here). A healthy answer looks like this:

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

A problem shows as a `state` other than `ok` in the entry of the source under `checks`, with the
steps to fix it in `warnings`. The states are:

| State | Meaning | Go to |
|---|---|---|
| `ok` | The source answers | |
| `not_enabled` | The API is not enabled on your PISTE application | [Légifrance or Judilibre is not enabled](#a-source-shows-not_enabled) |
| `credentials_invalid` | PISTE rejected your credentials | [PISTE rejected my credentials](#piste-rejected-my-credentials) |
| `quota_exceeded` | PISTE's rate limit is reached | [Quota](#piste-says-the-quota-is-reached) |
| `unexpected_response` | PISTE answered, but not as Vigueur expects | [A source shows `unexpected_response`](#a-source-shows-unexpected_response) |
| `unavailable` | PISTE did not answer in time, could not be reached, or answered with a server error | [PISTE is unavailable](#piste-is-unavailable-or-timed-out) |

The check asks each source once and waits up to 8 seconds for it.

### Claude says it only has `vigueur_status`, or cannot find the other Vigueur tools

Vigueur offers its legal tools only when both a client ID and a client secret are set and the
environment setting is valid. Otherwise the only tool available is `vigueur_status`, and it says
what is missing. Fill in the credentials with `/plugin configure vigueur@vigueur`, then run `/mcp`,
select **vigueur** and choose **Reconnect**. See
[Install in Claude Code](../10-setup/02-install-claude-code.md#3-enter-your-credentials).

## Setup messages

### `PISTE access is not configured yet.`

Vigueur has no usable credentials: none were entered, or one of the problems below stopped it. A
problem, when there is one, is listed in `config_problems`; the setup steps are in `setup_guide`.
Create your account with [Create your PISTE account](../10-setup/01-piste-account.md), then enter
the credentials with `/plugin configure vigueur@vigueur`. The steps in the answer name the settings
by the variables behind them: `PISTE_CLIENT_ID` is the **PISTE client ID** setting,
`PISTE_CLIENT_SECRET` the **PISTE client secret** and `PISTE_ENV` the **PISTE environment**.

### `PISTE_CLIENT_ID is missing (PISTE_CLIENT_SECRET is set)`

You entered the secret but not the client ID. Vigueur gives the matching message
`PISTE_CLIENT_SECRET is missing (PISTE_CLIENT_ID is set)` when the secret is the missing one. Enter
both with `/plugin configure vigueur@vigueur`.

### `PISTE_ENV must be "production" or "sandbox" (got …)`

The **PISTE environment** setting holds something else. Set it to `production` or `sandbox`. See
[sandbox or production](../10-setup/01-piste-account.md#sandbox-or-production). The message repeats
the value only when it is short and made of letters; otherwise it says `an unrecognised value`, in
case a secret was pasted there by mistake.

### PISTE rejected my credentials

Vigueur's message:

```
PISTE rejected the credentials. Check PISTE_CLIENT_ID and PISTE_CLIENT_SECRET, and PISTE_ENV (sandbox credentials only work with PISTE_ENV=sandbox). In Claude Code with the Vigueur plugin, they are the plugin settings: change them with /plugin configure vigueur@vigueur, then reconnect with /mcp. In another MCP client, they are environment variables in its configuration. Call vigueur_status to diagnose.
```

It follows one of `PISTE rejected the credentials (HTTP 400).`, `PISTE rejected the credentials
(HTTP 401).` or `Légifrance: credentials rejected (HTTP 401)` (or `Judilibre:`). They mean the same
thing; `vigueur_status` shows it as `credentials_invalid`. Check, in this order:

1. The client ID and secret were copied whole, with no extra space.
2. The environment setting matches the application: `sandbox` for the application PISTE created
   for you, `production` for one you created yourself.

Then run `/plugin configure vigueur@vigueur`, enter the values again, and restart the server (see
[the server is still the old one](#after-an-update-claude-still-behaves-as-before)).

### A source shows `not_enabled`

Your credentials work, but the application is not subscribed to that API. The status answer gives
the steps; in short, on piste.gouv.fr:

1. Open the consent page ("Cliquez ici pour accéder à la page de consentement"), tick **Légifrance**
   and **JUDILIBRE**, then click **Validate my ToS choices**.
2. Edit the application, tick **Légifrance** and **JUDILIBRE**, then click **Apply changes**
   ("Appliquer les modifications"). The boxes turn grey once subscribed; check the **Subscribed
   APIs** table.

A search or reading that PISTE refuses answers with an error (`"outcome": "error"`, `"kind": "forbidden"`).
Its `message` reads `Légifrance: access refused (HTTP 403) PISTE refused this request (HTTP 403).
Call vigueur_status to check that the API is enabled on your PISTE application.` (or `Judilibre:`
first). The cause is the same.

## Messages while Claude reads the law

When a search or a reading fails, the answer is a JSON object with `"outcome": "error"`. Its
`error` holds a `kind` (the family of failure, such as `quota_exceeded`) and a `message`, the text
quoted in the sections below. A message has two parts: a first sentence about what happened, then a
sentence about what to do. See [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong).

### PISTE says the quota is reached

```
"error": {
  "kind": "quota_exceeded",
  "message": "Légifrance: rate limit reached (HTTP 429) PISTE quota reached. Retry in about 30 s."
}
```

PISTE limits how many requests an application can make. When PISTE says how long to wait, the
message gives it; otherwise it reads `PISTE quota reached. Wait a moment and try again.` Wait, then
ask again. Vigueur has already retried once by itself.

### PISTE is unavailable or timed out

The messages you may see (`kind` `upstream_unavailable`), each followed by
`PISTE is unavailable or timed out. Wait a moment and try again; if it persists, call vigueur_status.`:

- `Légifrance: service error (HTTP 503)` (or another 5xx number, or `Judilibre:` instead)
- `Légifrance: request timed out after 10000 ms`
- `Légifrance: network error while contacting the service`
- `PISTE authentication timed out.` or `PISTE authentication failed: network error.`
- `PISTE authentication is unavailable (HTTP …).` or `PISTE authentication returned an unexpected
  response.`

Vigueur waits up to 10 seconds for each request to PISTE. A request to Légifrance or Judilibre that
fails this way is tried a second time before Vigueur gives up; a failed sign-in to PISTE (the
`PISTE authentication` messages) is not. Check your internet connection, wait a moment, and ask
again. If it keeps failing, check piste.gouv.fr for incidents.

### A source shows `unexpected_response`

PISTE answered the check, but not the way Vigueur expects: an HTTP 400 or 404, or an answer Vigueur
cannot read. `detail` gives what PISTE answered, for example `not found (HTTP 404)`. This usually
means PISTE changed something on its side, not that your setup is wrong. Try again later; if it
keeps happening, report it with the `detail`.

### `Légifrance did not answer within 45 s`

Each question Claude puts to Vigueur has a limit of 45 seconds in all. When the source takes longer,
Vigueur stops and answers with an error of `kind` `deadline`:

```
"error": {
  "kind": "deadline",
  "message": "Légifrance did not answer within 45 s. Try again in a moment."
}
```

The same message exists for Judilibre. Ask again; if it keeps happening, ask for something narrower,
such as a shorter date range.

### `… returned a response Vigueur does not understand`

```
"error": {
  "kind": "unexpected_response",
  "message": "Légifrance: unexpected response (not valid JSON) Légifrance returned a response Vigueur does not understand (possibly an API change). Try again later; if it persists, report it."
}
```

The message starts with the source's own error, such as `Légifrance: unexpected response (not valid
JSON)`. The source answered in a shape Vigueur did not expect. Try again later. If it persists,
report it to the Vigueur project.

### `Unexpected error: …`

Any other failure (`kind` `unexpected`) ends with: "Call vigueur_status to check the setup." Run it first. If the status
is healthy, report the message to the Vigueur project.

### `request cancelled`

You, or Claude, stopped the call (`kind` `cancelled`). Nothing is wrong.

## When nothing is found

Not finding something is not an error. The answer has `"outcome": "not_found"` (a document you asked
for does not exist) or `"outcome": "no_results"` (a search or a list came back empty), and the
sentences quoted below are in its `warnings`.

### `No Légifrance article with id …` or `No article … in … on Légifrance.`

The source holds no such article. Check the code title and the number. Vigueur does not guess: for a
wrong code title it says `Unknown code "…": no Légifrance code has this title` and may add "Did you
mean" suggestions that you must confirm.

When a number exists in several codes and you gave no code, Vigueur lists the candidates and asks
you to choose one.

### `No Légifrance decision with id …` or `No Judilibre decision with id …`

The id is wrong, or the decision is in the other source. The message points you to
`legifrance_search_case_law` or `judilibre_search_decisions`. Légifrance does not hold every Cour de
cassation decision; for a recent one, an appeal-court one or a *rejet non spécialement motivé*, use
Judilibre. See [RNSM/NA](03-glossary.md#rnsmna).

### An empty `items` and `"outcome": "no_results"`

The search ran and found nothing: `items` is empty, and for a case-law search `warnings` has a
sentence starting `No` and naming your criteria. The same `no_results` comes back when you ask for a
page past the last one: `page` then says which page you asked for and how many there are. Try other
words, fewer filters, or the other source.

## Messages about what you asked

These come from the request itself, not from PISTE. Claude usually corrects the request and tries
again by itself. Examples:

- `"offset" … is past the end of the text (… characters).` (an offset equal to the length counts as past the end)
- `No text found for "…". Check the number, nature or id.` (`kind` `invalid_input`: the text asked for in a
  list of changes does not exist as written. Give the nature and number ("loi 78-17"), the NOR, or the
  LEGITEXT or JORFTEXT id.)
- `"until" (…) is before "since" (…).` or `"date_from" must not be after "date_to".`
- `"…" matches several texts: … Use the LEGITEXT id or the NOR.`
- `Légifrance: request rejected (HTTP 400): …` (or another 4xx number), followed by the start of
  the source's own explanation.

## After an update

### After an update, Claude still behaves as before

Each open Claude Code session keeps running the old server until you reconnect it. `/reload-plugins`
alone is not enough. Run `/mcp`, select **vigueur**, then choose **Reconnect**. A new session starts
the new build. See [Update Vigueur](../10-setup/04-updating.md).

## Still stuck

Run `vigueur_status` and keep its answer, with the exact message you saw. Never paste your client
secret anywhere.
