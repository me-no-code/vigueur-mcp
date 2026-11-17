# Writing a Vigueur user doc

These pages are for the people who use Vigueur through Claude: they ask Claude a legal question,
and Claude calls Vigueur's tools to read the official sources. Most readers are not developers.
A user doc never needs the reader to know how Vigueur is built; developer material lives in the
repository's [CONTRIBUTING.md](../CONTRIBUTING.md).

## Layout

- `en/` and `fr/` hold the same pages under the same paths and file names. The French page is a
  translation of the English one, not a different page.
- Each section is a folder named `NN-scope` (`00-intro`, `10-setup`, `20-using`, `30-tools`,
  `40-sources`). Pages are numbered inside their folder (`01-welcome.md`, `02-…`), in reading order.
- Tool pages in `30-tools/` carry no number: each is named after its tool
  (`legifrance_get_article.md`), because readers look them up by name.
- Each language has an index, `en/README.md` and `fr/README.md`, with one table per section. Add a
  page to both indexes when you add it.

## Front matter

Every page starts with this block:

```yaml
---
title: Install in Claude Code
level: start            # intro | start | guide | reference
tags: [install, claude-code]
summary: One sentence saying what the reader can do after reading this page.
updated: 2026-11-15
---
```

A page's path is its identity: there is no `id`.

Put a value in double quotes when it contains a colon followed by a space (`: `), as in
`summary: "Read an article: …"`. Without the quotes, YAML reads the rest as a nested field and the
front matter fails to parse. French text, with a space on each side of its colons, needs this often.

## Levels

| Level | Length | Shape |
|---|---|---|
| `intro` | 1 page | Orientation. No procedure, or a very short one. |
| `start` | 1 to 2 pages | One first task, end to end, as numbered steps. Links out for the rest. |
| `guide` | 2 to 5 pages | One subject fully covered: what you can ask, what the answer shows, the limits. |
| `reference` | as needed | One tool or one source: every parameter, every kind of answer, every limit. |

## Tool pages

Every page in `30-tools/` follows the same outline:

1. `# tool_name` and one sentence on what it does.
2. **What you can ask**: two to four requests a user would type, in French and English.
3. **What it takes**: a table of parameters (name, required or not, what it means, accepted
   values, default), in plain words.
4. **What the answer shows**: the parts of the answer, in order, with a short excerpt in a code
   block copied from a real answer (a test fixture or the renderer's fixed wording).
5. **Limits**: what the tool does not do, and what the source does not hold.
6. **Related**: links to the neighbouring tools and guides.

## Voice

- Write to the reader as "you". Short, direct sentences, active voice.
- Lead with what the reader can do, then how. Each heading states the answer, not the topic.
- The reader talks to Claude; Claude calls the tools. Say "ask Claude to…", not "call the tool".
  Tool names appear in backticks, exactly as registered (`legifrance_get_article`), so the reader
  can name one when they want to.
- Keep French legal terms in French (*pourvoi*, *Journal officiel*, *rejet non spécialement
  motivé*) and link them to the [glossary](en/00-intro/03-glossary.md) the first time a page uses
  them.
- Quote Vigueur's fixed wording exactly as the code writes it, in a code block or in backticks.
- Use a table when the reader compares or looks something up. Use a callout (`> **Title**` then
  text) for a rule the reader would otherwise break: what a tool does not do, a trap, a limit of a
  source.
- No marketing tone, no exclamation marks, no emoji.

## Accuracy

Every claim is checked against the code on `main` (`src/`), its tests, or a recorded answer from the
production API. A default, a limit, a parameter, a wording: if you did not see it there, it does not
go in. Facts about a source that come from observation, not from its documentation, say so and give
the month they were observed ("observed in November 2026").

Vigueur reports what the sources say; it gives no legal advice and draws no conclusions. The docs
say the same: describe what a tool returns, never what the reader should conclude from it.

## What never goes in

These pages are published with the repository. Write accordingly.

- Credentials, or any value from a `.env` file.
- HTTP headers of API answers. Some PISTE error answers echo the request's headers, access token
  included.
- Links to, or content quoted from, the private development notes (specs, plans, ledgers, research
  reports), or their internal labels (task numbers, ruling numbers, sample numbers).
- Features that are not released, described as if they were. A planned page appears in the index
  with the status *Planned* and is not written yet.
- Source code paths, class names or endpoints, except a command or a path the reader types or
  opens (an install command, a folder to delete).

## Links

Link other pages by relative path, even when the target is not written yet. The full map is in
[en/README.md](en/README.md).
