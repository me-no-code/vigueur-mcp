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

describe('architecture', () => {
  for (const layer of ['shared', 'domain', 'services']) {
    it(`src/${layer} does not import @modelcontextprotocol`, () => {
      for (const file of filesIn(layer)) {
        const bad = importsOf(file).filter((s) => s.startsWith('@modelcontextprotocol'));
        expect(bad, relative(SRC, file)).toEqual([]);
      }
    });
  }

  it('src/tools never imports clients/', () => {
    for (const file of filesIn('tools')) {
      const bad = importsOf(file).filter((s) => /(^|\/)clients\//.test(s));
      expect(bad, relative(SRC, file)).toEqual([]);
    }
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
