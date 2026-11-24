---
title: Troubleshooting and FAQ
level: guide
tags: [troubleshooting, errors, faq, vigueur_status]
summary: Find the message Vigueur gave you, learn what it means and what to do, and check your setup with vigueur_status.
updated: 2026-11-24
---

# Troubleshooting and FAQ

Start here when something goes wrong with Vigueur while you use it from an AI assistant. Most
problems come from the PISTE credentials or from the two APIs not being enabled on your PISTE
application. One check finds both.

## First, check your setup

### How do I check that Vigueur works?

Ask the assistant: "Run `vigueur_status`." This tool checks your credentials and asks PISTE
whether Légifrance and Judilibre answer. The answer is one JSON object (on the wire, a single line
of JSON; it is indented here). A healthy answer looks like this:

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

A problem shows as a `state` other than `ok` in the entry of the source under `checks`. The states
are:

| State | Meaning | Go to |
|---|---|---|
| `ok` | The source answers | |
| `not_enabled` | The API is not enabled on your PISTE application | [Légifrance or Judilibre is not enabled](#a-source-shows-not_enabled) |
| `credentials_invalid` | PISTE rejected your credentials | [PISTE rejected my credentials](#piste-rejected-my-credentials) |
| `quota_exceeded` | PISTE's rate limit is reached | [Quota](#piste-says-the-quota-is-reached) |
| `unexpected_response` | PISTE answered, but not as Vigueur expects | [A source shows `unexpected_response`](#a-source-shows-unexpected_response) |
| `unavailable` | PISTE did not answer in time, could not be reached, or answered with a server error | [PISTE is unavailable](#piste-is-unavailable-or-timed-out) |

When Vigueur holds no valid token, the check first signs in to PISTE (up to 10 seconds). It then
asks each source once and waits up to 8 seconds for it. A source that rejects the token (HTTP 401)
is asked once more with a new token.

### The assistant says it only has `vigueur_status`, or cannot find the other Vigueur tools

Vigueur offers its legal tools only when both a client ID and a client secret are set and the
environment setting is valid. Otherwise the only tool available is `vigueur_status`, and its answer
lists any problem with the settings in `config_problems`. Fill in the credentials:

- with the default install, in the app's MCP configuration, then restart the app. See
  [Install Vigueur](../10-setup/02-install.md#1-add-vigueur-to-your-app);
- with the Claude Code plugin, through `/plugin configure vigueur@vigueur`, then run `/mcp`,
  select **vigueur** and choose **Reconnect**. See
  [Install the Claude Code plugin](../10-setup/03-install-claude-code.md#2-enter-your-credentials);
- with the Claude Desktop bundle, in **Settings**, **Extensions**, **Vigueur**, then click **Save**.
  See
  [Install the Claude Desktop bundle](../10-setup/04-install-claude-desktop.md#3-enter-your-credentials).

## Setup messages

### `"outcome": "not_configured"`

Vigueur has no usable credentials: none were entered, or a setting holds a problem. A problem, when
there is one, is listed in `config_problems`; the messages are below. Create your account with
[Create your PISTE account](../10-setup/01-piste-account.md), then enter the credentials in your
app. The messages name the settings by the variables behind them: `PISTE_CLIENT_ID` is the
**PISTE client ID** setting, `PISTE_CLIENT_SECRET` the **PISTE client secret**, and `PISTE_ENV` or
`PISTE_PRODUCTION` the environment (the Claude Code plugin's **PISTE environment**, the Claude
Desktop bundle's **Production application**).

### `PISTE_CLIENT_ID is missing (PISTE_CLIENT_SECRET is set)`

You entered the secret but not the client ID. Vigueur gives the matching message
`PISTE_CLIENT_SECRET is missing (PISTE_CLIENT_ID is set)` when the secret is the missing one. Enter
both in your app's settings.

### `PISTE_ENV must be "production" or "sandbox" (got …)`

The **PISTE environment** setting holds something else. Set it to `production` or `sandbox`. See
[sandbox or production](../10-setup/01-piste-account.md#sandbox-or-production). The message repeats
the value only when it is short and made of letters; otherwise it says `an unrecognised value`, in
case a secret was pasted there by mistake.

### `PISTE_PRODUCTION must be "true" or "false" (got …)`

Vigueur reads the environment from `PISTE_ENV` (`production` or `sandbox`) or from
`PISTE_PRODUCTION` (`true` for production, `false` for the sandbox). This message, and
`PISTE_ENV is "…" but PISTE_PRODUCTION is "…": set only one`, come from an app configuration that
sets them by hand. Set one of the two, with one of its values.

### PISTE rejected my credentials

Vigueur's message is one of `PISTE rejected the credentials (HTTP 400).`,
`PISTE rejected the credentials (HTTP 401).` or `Légifrance: credentials rejected (HTTP 401)` (or
`Judilibre:`). They mean the same thing; `vigueur_status` shows it as `credentials_invalid`. Check,
in this order:

1. The client ID and secret were copied whole, with no extra space.
2. The environment setting matches the application: sandbox for the application PISTE created
   for you, production for one you created yourself. With the default install, that is
   `PISTE_ENV` (or `PISTE_PRODUCTION`); with the Claude Code plugin, the **PISTE environment**
   setting; with the Claude Desktop bundle, the **Production application** switch.

Then enter the values again. With the default install, in the app's MCP configuration, then
restart the app. With the Claude Code plugin, run `/plugin configure vigueur@vigueur`, then restart
the server (see
[the server is still the old one](#after-an-update-vigueur-still-behaves-as-before)).
With the Claude Desktop bundle, in **Settings**, **Extensions**, **Vigueur**, then click **Save**:
Claude Desktop restarts Vigueur.

### A source shows `not_enabled`

Your credentials work, but the application is not subscribed to that API. On piste.gouv.fr:

1. Open the consent page ("Cliquez ici pour accéder à la page de consentement"), tick **Légifrance**
   and **JUDILIBRE**, then click **Validate my ToS choices**.
2. Edit the application, tick **Légifrance** and **JUDILIBRE**, then click **Apply changes**
   ("Appliquer les modifications"). The boxes turn grey once subscribed; check the **Subscribed
   APIs** table.

A search or reading that PISTE refuses answers with an error (`"outcome": "error"`, `"kind": "forbidden"`).
Its `message` reads `Légifrance: access refused (HTTP 403)` (or `Judilibre:` first). The cause is
the same.

## Messages while the assistant reads the law

When a search or a reading fails, the answer is a JSON object with `"outcome": "error"`. Its
`error` holds a `kind` (the family of failure, such as `quota_exceeded`) and a `message`, the text
quoted in the sections below. A message says what happened; for some kinds, a sentence follows
about when to try again. See [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong).

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
- `Légifrance: request timed out after 10000 ms` (or `30000 ms`)
- `Légifrance: network error while contacting the service`
- `PISTE authentication timed out.` or `PISTE authentication failed: network error.`
- `PISTE authentication is unavailable (HTTP …).` or `PISTE authentication returned an unexpected
  response.`

Vigueur waits up to 10 seconds for each request to PISTE, and up to 30 seconds for a request that
reads a whole text, a code's table of contents or a change log. A request to Légifrance or
Judilibre that fails this way is tried a second time before Vigueur gives up; a failed sign-in to
PISTE (the `PISTE authentication` messages) is not. Check your internet connection, wait a moment,
and ask again. If it keeps failing, check piste.gouv.fr for incidents.

### A source shows `unexpected_response`

PISTE answered the check, but not the way Vigueur expects: an HTTP 4xx other than 401, 403 and 429
(such as 400 or 404), or an answer Vigueur cannot read or that is over 64 MB. `detail` gives what
PISTE answered, for example `not found (HTTP 404)`. This usually means PISTE changed something on
its side, not that your setup is wrong. Try again later; if it keeps happening, report it with the
`detail`.

### `Légifrance did not answer within 45 s`

Each question the assistant puts to Vigueur has a limit of 45 seconds in all. When the source
takes longer, Vigueur stops and answers with an error of `kind` `deadline`:

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
JSON)`. The source answered in a shape Vigueur did not expect. The same error comes when an answer is
over 64 MB, which Vigueur does not read (`Légifrance: response larger than 64 MB, not read.`), and
when Légifrance lists an article or a text but does not return it, gives an article no start date,
or places an article in no text. Try again later. If it persists, report it to the Vigueur project.

### `Unexpected error: …`

Any other failure (`kind` `unexpected`) ends with: "Call vigueur_status to check the setup." Run it first. If the status
is healthy, report the message to the Vigueur project.

### `request cancelled`

You, or the assistant, stopped the call (`kind` `cancelled`). Nothing is wrong.

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

The id is wrong, or the decision is in the other source. The next warning names the search of the
same source: `legifrance_search_case_law` or `judilibre_search_decisions`. Légifrance does not hold
every Cour de cassation decision; for a recent one, an appeal-court one or a *rejet non spécialement
motivé*, use Judilibre. See [RNSM/NA](03-glossary.md#rnsmna).

### An empty `items` and `"outcome": "no_results"`

The search ran and found nothing: `items` is empty, and for a case-law search `warnings` has a
sentence starting `No` and naming your criteria. The same `no_results` comes back when you ask for a
page past the last one: `page` then says which page you asked for and how many there are. Try other
words, fewer filters, or the other source.

## Messages about what you asked

These come from the request itself, not from PISTE. The message says what is wrong, so the
assistant can correct the request and try again. Examples:

- `"offset" … is past the end of the text (… characters).` (an offset equal to the length counts as past the end)
- `No text found for "…". Check the number, nature or id.` (`kind` `invalid_input`: the text asked for in a
  list of changes does not exist as written. Give the nature and number ("loi 78-17"), the NOR, or the
  LEGITEXT or JORFTEXT id.)
- `"until" (…) is before "since" (…).` or `"date_from" must not be after "date_to".`
- `"…" matches several texts: … Use the LEGITEXT id or the NOR.`
- `Légifrance: request rejected (HTTP 400): …` (or another 4xx number), where `…` is the source's
  own message, for example `Légifrance: request rejected (HTTP 400): L'expression à valider est fausse.`
  When the source gives no message, it reads `Légifrance: request rejected (HTTP 400).`

## After an update

### After an update, Vigueur still behaves as before

With the default install, the app keeps running the old server until it starts Vigueur again:
restart the app, or reload its MCP servers.

In Claude Code, each open session keeps running the old server until you reconnect it.
`/reload-plugins` alone is not enough. Run `/mcp`, select **vigueur**, then choose **Reconnect**. A
new session starts the new build.

In Claude Desktop, a bundle file replaces the installed Vigueur only when its version is newer.
`vigueur_version`, in the answer of `vigueur_status`, says which version runs. See
[Update Vigueur](../10-setup/05-updating.md).

## Still stuck

Run `vigueur_status` and keep its answer, with the exact message you saw. If Vigueur does not start
at all, its startup line, or the error that stopped it, is in the app's logs: see
[Logs](04-privacy-and-your-data.md#logs). Never paste your client secret anywhere.
