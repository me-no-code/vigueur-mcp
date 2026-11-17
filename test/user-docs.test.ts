import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The user docs exist in English and French under the same paths. A change to a page goes to its
 * twin too, and both carry the same `updated` date: the date says when the pair was last checked.
 * The pre-commit hook in .githooks refuses a commit that stages one twin without the other.
 */

const DOCS = 'user-docs';

function pages(lang: 'en' | 'fr'): string[] {
  const root = join(DOCS, lang);
  return (readdirSync(root, { recursive: true, withFileTypes: true }) as Dirent[])
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => relative(root, join(e.parentPath, e.name)))
    .sort();
}

/** The `updated` value of a page's front matter; null for a page without one (the indexes). */
function updated(lang: 'en' | 'fr', page: string): string | null {
  const text = readFileSync(join(DOCS, lang, page), 'utf8');
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
  return front === undefined ? null : (/^updated:\s*(\S+)\s*$/m.exec(front)?.[1] ?? null);
}

describe('user docs: English and French twins', () => {
  it('every page exists in both languages, under the same path', () => {
    expect(pages('fr')).toEqual(pages('en'));
  });

  it('twins carry the same updated date', () => {
    const french = new Set(pages('fr'));
    const apart = pages('en')
      .filter((page) => french.has(page) && updated('en', page) !== updated('fr', page))
      .map((page) => `${page}: en ${updated('en', page)}, fr ${updated('fr', page)}`);
    expect(apart).toEqual([]);
  });
});
