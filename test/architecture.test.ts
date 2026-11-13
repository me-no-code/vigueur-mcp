import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');
const SPECIFIER = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function importsOf(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(SPECIFIER)].map((m) => m[1] as string);
}

function filesIn(layer: string): string[] {
  const files = tsFiles(join(SRC, layer));
  expect(files.length).toBeGreaterThan(0);
  return files;
}

function resolvesOutside(file: string, spec: string, layer: string): boolean {
  if (!spec.startsWith('.')) return false;
  const target = relative(join(SRC, layer), join(file, '..', spec));
  return target.startsWith('..');
}

/** The relative imports of `file` that resolve inside `src/{layer}`. */
function importsInto(file: string, layer: string): string[] {
  return importsOf(file).filter((s) => s.startsWith('.') && !resolvesOutside(file, s, layer));
}

/** Layers each layer must never import (dependency rule: only compose.ts/index.ts wire clients). */
const FORBIDDEN: ReadonlyArray<[layer: string, forbidden: string[]]> = [
  ['services', ['clients', 'tools']],
  ['clients', ['tools']],
  ['tools', ['clients']],
];

describe('architecture', () => {
  for (const layer of ['shared', 'domain', 'services']) {
    it(`src/${layer} does not import @modelcontextprotocol`, () => {
      for (const file of filesIn(layer)) {
        const bad = importsOf(file).filter((s) => s.startsWith('@modelcontextprotocol'));
        expect(bad, relative(SRC, file)).toEqual([]);
      }
    });
  }

  for (const [layer, forbidden] of FORBIDDEN) {
    it(`src/${layer} never imports ${forbidden.map((f) => `src/${f}`).join(' or ')}`, () => {
      for (const file of filesIn(layer)) {
        const bad = forbidden.flatMap((target) => importsInto(file, target));
        expect(bad, relative(SRC, file)).toEqual([]);
      }
    });
  }

  it('resolves import paths: a sibling named like a layer is not that layer', () => {
    const file = join(SRC, 'services', 'legislation', 'get-article.ts');
    expect(resolvesOutside(file, '../../clients/legifrance/client.js', 'clients')).toBe(false);
    expect(resolvesOutside(file, './clients.js', 'clients')).toBe(true);
  });

  it('src/domain imports only from src/domain', () => {
    for (const file of filesIn('domain')) {
      const bad = importsOf(file).filter(
        (s) => !s.startsWith('.') || resolvesOutside(file, s, 'domain'),
      );
      expect(bad, relative(SRC, file)).toEqual([]);
    }
  });
});
