---
title: legifrance_search_legislation
level: reference
tags: [tool, legifrance, search, codes, loda, jorf, kali]
summary: Search codes, consolidated laws and decrees, the Journal officiel and national collective agreements, and get a list of hits with their links.
updated: 2026-11-17
---

# legifrance_search_legislation

Searches French legislation on Légifrance in one of four collections and lists the hits, each with its official link. Use it to find a text or an article when you do not know its exact reference.

## What you can ask

- "Cherche les articles du Code du travail qui parlent du télétravail." / "Search the Code du travail for articles about remote work."
- "Trouve l'ordonnance n° 2016-131." / "Find ordonnance 2016-131."
- "Retrouve le texte publié au Journal officiel sous le NOR JUSC1522466R." / "Find the text published in the Journal officiel under NOR JUSC1522466R."
- "Quelle est la convention collective IDCC 1486 ?" / "Which collective agreement is IDCC 1486?"

## What it takes

`collection` is the only parameter that is always required. You must also give at least one of `query`, `article_number`, `text_number`, `nor` or `idcc`: `code`, `nature` and the publication dates only narrow a search and cannot stand alone. Blank values count as not given.

| Name | Required | What it means | Accepted values | Default |
|---|---|---|---|---|
| `collection` | Yes | Where to search. | `codes` (consolidated codes), `loda` (consolidated laws, ordinances, decrees and orders), `jorf` (the Journal officiel as published), `kali` (national collective agreements) | None |
| `query` | One of the five search criteria | Words to search for. | Free text | None |
| `code` | No | Narrows a `codes` search to one code. | A code title such as `Code civil` | All codes |
| `article_number` | One of the five | An article number as cited. | `1240`, `L. 1234-1` | None |
| `text_number` | One of the five | The number of a text. | `2016-131` for ordonnance n°2016-131 | None |
| `nor` | One of the five | The NOR identifier of a text published in the Journal officiel. | A NOR such as `JUSC1522466R` | None |
| `nature` | No | Narrows by kind of text. | `LOI`, `ORDONNANCE`, `DECRET`… | Any |
| `idcc` | One of the five | The IDCC number of a collective agreement. | A number such as `1486` | None |
| `at_date` | No | The date the texts must be in force. Only for `codes` and `loda`. | A real date as `YYYY-MM-DD` | Today (date in Paris) |
| `include_historical` | No | `true` returns every version, whatever its dates, and `at_date` is then ignored. | `true` or `false` | `false` |
| `published_from` | No | Earliest publication date. Only for `jorf`. | `YYYY-MM-DD` | None |
| `published_to` | No | Latest publication date. Only for `jorf`. | `YYYY-MM-DD`, not before `published_from` | None |
| `page` | No | Which page of results. | A whole number, 1 or more | 1 |
| `page_size` | No | Hits per page. | A whole number from 1 to 50 | 10 |
| `response_format` | No | How much of each snippet to show. | `concise` (snippets cut at 200 characters) or `detailed` (full snippets) | `concise` |

### Which parameters go with which collection

A parameter that does not belong to the collection is refused with `"<parameter>" does not apply to the <collection> collection.`

| Collection | Search criteria it accepts | Narrowing it accepts |
|---|---|---|
| `codes` | `query`, `article_number` | `code` |
| `loda` | `query`, `article_number`, `text_number`, `nor` | `nature` |
| `jorf` | `query`, `article_number`, `text_number`, `nor` | `nature`, `published_from`, `published_to` |
| `kali` | `query`, `idcc` | none |

### What "in force" means in each collection

| Collection | Which versions you get |
|---|---|
| `codes`, `loda` | The versions in force on `at_date` (today by default), or every version with `include_historical`. |
| `jorf` | Texts as published. There is no in-force filter: use `published_from` and `published_to`. Results are listed newest publication first. |
| `kali` | The agreements currently in force, extended or not. `at_date` does not apply and is refused. With `include_historical`, every version. |

For the other collections, results follow Légifrance's relevance order.

## What the answer shows

The answer is one JSON object. On the wire it is a single line of JSON; the excerpt here is indented. The fields every answer shares (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) are explained in [Reading Vigueur's answers](../20-using/05-reading-answers.md).

`outcome` is `results`, or `no_results` when nothing matches (`items` is then empty; the warning about article numbers below can still appear).

```
{
  "source": "Légifrance",
  "outcome": "results",
  "warnings": [
    "(Counts include texts filtered out by the article number; showing matches only.)"
  ],
  "collection": "codes",
  "scope": "in_force_on",
  "results": 1,
  "page": {
    "number": 1,
    "of": 1
  },
  "next": null,
  "items": [
    {
      "kind": "article",
      "title": "Code civil",
      "number": "1240",
      "id": "LEGIARTI000032041571",
      "text_id": "LEGITEXT000006070721",
      "nature": "code",
      "nor": null,
      "published": null,
      "legifrance_status": "VIGUEUR",
      "from": "2016-10-01",
      "until": null,
      "link": "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571",
      "excerpt": "[...]Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duque…",
      "read_with": {
        "tool": "legifrance_get_article",
        "id": "LEGIARTI000032041571"
      }
    }
  ],
  …
}
```

| Field | What it holds |
|---|---|
| `collection` | The collection searched: `codes`, `loda`, `jorf` or `kali`. |
| `scope` | The scope of the dates, see below. |
| `results` | The number of hits over all pages. |
| `page`, `next` | This page and the number of pages, and the next page (`{ "page": 2 }`, or `null`). |
| `items` | One object per hit. |

The `scope` values:

| `scope` | Meaning |
|---|---|
| `in_force_on` | Versions in force on `request.at_date` (`codes` and `loda`). For `kali`: the agreements currently in force, extended or not, with no date. |
| `all_versions` | Every version, whatever its dates (`include_historical`). |
| `as_published` | Texts as published (`jorf`): there is no in-force filter. |

A hit holds:

| Field | What it holds |
|---|---|
| `kind` | `article` or `text`. |
| `title`, `number` | The title of the text the hit belongs to (or of the text itself), and the article number (`null` for a text). |
| `id`, `text_id` | The Légifrance id of the article version or text, and of the text it belongs to. |
| `nature`, `nor`, `published` | The nature of the text, its NOR and its publication date, each `null` when not given. |
| `legifrance_status`, `from`, `until` | Légifrance's own label and the validity dates, each `null` when not given. |
| `link` | The official page, built by Vigueur from the id. |
| `excerpt` | The matching passage, cut to 200 characters in a `concise` answer (`detailed` gives it in full); `null` when none. The markers `[...]` show where the passage is cut. |
| `read_with` | The call that reads the whole article or text, for example `{ "tool": "legifrance_get_article", "id": "…" }`. `null` when no tool reads it: an article hit from the Journal officiel is not offered to `legifrance_get_article`, it only has its `link`. When `include_historical` is `true` (`scope` is `all_versions`), the `read_with` of a text hit carries `at_date` set to the `from` date of the version listed, so the read gives that version (no `at_date` when Légifrance gives no start date). |

When you gave an `article_number`, Légifrance's total counts texts that the article filter then removes, so `warnings` says: `(Counts include texts filtered out by the article number; showing matches only.)`

A page is capped at about 40,000 characters. If long hits do not all fit, a warning says `(Only the first <n> of <total> hits of this page fit — use a smaller "page_size".)` A page past the last one answers `no_results`, and `page` says which page you asked for and how many there are.

### Errors

An error answer is a JSON object with `outcome: "error"` and an `error` holding a `kind` and a `message` (see [Reading Vigueur's answers](../20-using/05-reading-answers.md#when-something-goes-wrong)). Those specific to this tool:

- `Give at least one of "query", "article_number", "text_number", "nor" or "idcc": "code", "nature" and the publication dates only narrow a search.`
- `"at_date" does not apply to the jorf collection: the Journal officiel is searched as published. Filter by publication date with "published_from" / "published_to".` For `kali` the message points instead to the agreements currently in force, or every version with `include_historical`.
- `"published_to" (<date>) is before "published_from" (<date>).`
- `Unknown code "<code>". Did you mean: <titles>?` or, with no suggestion, `Unknown code "<code>". Use the exact title of a code, e.g. "Code civil".` Suggestions are never substituted.
- A `page_size` outside 1 to 50, a `page` below 1, or a date that is not a real `YYYY-MM-DD` date is refused before anything is searched.

Other errors (missing credentials, quota, source unavailable, no answer within 45 seconds) are the same for every tool; see [Troubleshooting and FAQ](../00-intro/05-troubleshooting.md).

## Limits

> **A search lists hits; it does not read them.** A hit shows a snippet. To read a whole article use [`legifrance_get_article`](legifrance_get_article.md); to read a whole text use [`legifrance_get_text`](legifrance_get_text.md).

- Case law is not searched here: see [`legifrance_search_case_law`](legifrance_search_case_law.md) and [`judilibre_search_decisions`](judilibre_search_decisions.md).
- `jorf` and `kali` have no "in force on a date" filter, as the table above says.
- The `nature` value is passed to Légifrance as you give it. [`legifrance_list_reference_values`](legifrance_list_reference_values.md) lists the natures that appear in the Journal officiel.
- Results are what Légifrance returns for the words you gave; the order and the snippets are Légifrance's.

## Related

- [`legifrance_get_article`](legifrance_get_article.md)
- [`legifrance_get_text`](legifrance_get_text.md)
- [`legifrance_list_reference_values`](legifrance_list_reference_values.md)
- [Codes, laws and decrees](../20-using/02-legislation.md)
