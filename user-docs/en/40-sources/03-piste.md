---
title: PISTE
level: reference
tags: [sources, piste, quota, sandbox, production]
summary: Understand what PISTE is, how sandbox and production differ, why one application serves both sources, how the shared quota behaves, and how Vigueur retries and times out.
updated: 2026-11-18
---

# PISTE

PISTE is the French government's API gateway, at piste.gouv.fr. Légifrance and Judilibre are both published through it. Vigueur sends every request to PISTE and nowhere else, using your own free PISTE account. See [Create your PISTE account](../10-setup/01-piste-account.md) to get one.

## How access works

1. You create an **application** on PISTE. It has a **client ID** and a **client secret**.
2. You subscribe the application to the two APIs, **Légifrance** and **JUDILIBRE**: you accept their terms on the consent page, then apply the change to the application.
3. Vigueur exchanges the client ID and secret for a temporary access token (the standard "client credentials" exchange), and sends it with each request. The token lives in memory only. Vigueur renews it a minute before it expires, and once more if PISTE rejects it mid-use.

**One application serves both sources.** Both APIs sit behind the same PISTE application and the same token. If only one API is subscribed, the other answers "access refused" and [`vigueur_status`](../30-tools/vigueur_status.md) reports it as `not_enabled`.

## Sandbox and production

PISTE has two environments, each with its own addresses and its own applications.

| | Sandbox | Production |
|---|---|---|
| Application | PISTE creates one for you automatically (named SANDBOX) | Every application you create yourself |
| Vigueur's setting | Claude Desktop: **Production application** off. Claude Code: **PISTE environment** `sandbox` | Claude Desktop: **Production application** on. Claude Code: **PISTE environment** `production`. Both are the default |

> **The environment must match the credentials**
> Sandbox credentials work only with the sandbox setting, production credentials only with production. A mismatch is reported as rejected credentials, the same as a wrong secret, and `vigueur_status` cannot tell the two apart. Vigueur's start-up line, in its logs, names the environment in use.

## The shared quota

PISTE limits how many requests an application can make. Observed in November 2026: the quota counter went down across Légifrance and Judilibre calls alike, which points to one quota for the application, not one per API. Vigueur does not know the exact limits.

- A request over the limit is answered with HTTP 429. Vigueur calls this `quota_exceeded` and tells you how long to wait when PISTE says.
- During about a hundred calls at roughly two requests a second (November 2026), no 429 was seen. Ordinary use is unlikely to reach the limit; a long series of reads, such as paging through many decisions, uses it faster.
- `vigueur_status` shows `quota_exceeded` and the delay for a source that is rate-limited.

## What Vigueur does when PISTE fails

| Situation | Vigueur's behaviour |
|---|---|
| HTTP 429 (quota) | Waits and retries once. The wait is the delay PISTE gives, up to 10 seconds; without one, half a second. If it fails again, you get the quota answer. |
| HTTP 5xx, network error or timeout | Retries once after half a second. If it fails again, you get `PISTE is unavailable or timed out`. |
| PISTE sign-in (getting a token) fails | No retry. A refused sign-in is reported as rejected credentials; a sign-in that times out or fails otherwise as `PISTE is unavailable or timed out`. |
| HTTP 401 (token rejected) | Discards the token, gets a new one and retries once. If rejected again, you get the rejected-credentials answer. |
| HTTP 403 | No retry. Reported as access refused: check that the API is subscribed. |
| HTTP 404 | No retry. Reported as not found. |
| Other client errors | No retry. Reported as a request rejected. |
| Answer that is not valid JSON, or has an unexpected shape | No retry. Reported as a response Vigueur does not understand. |

**Timeouts.** One request to PISTE waits up to 10 seconds. A whole tool call, retry included, gives up after 45 seconds and says the source "did not answer within 45 s". Getting a token also waits up to 10 seconds. The checks of `vigueur_status` wait up to 8 seconds each and are not retried.

**Speed.** Observed in November 2026: Judilibre usually answered in about a tenth of a second and Légifrance in under a second; reading a large code's table of contents took a few seconds.

You can cancel a call from Claude at any time; Vigueur stops waiting and does not retry.

## What is sent where

Vigueur sends your client ID and secret to PISTE's token service, and your search words, ids and dates to the Légifrance and Judilibre APIs. Nothing goes to any other service. Vigueur writes nothing to disk. See [Privacy and your data](../00-intro/04-privacy-and-your-data.md).

## Related

- [`vigueur_status`](../30-tools/vigueur_status.md): check credentials and which sources answer.
- [Create your PISTE account](../10-setup/01-piste-account.md)
- [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md)
- [Légifrance](01-legifrance.md)
- [Judilibre](02-judilibre.md)
