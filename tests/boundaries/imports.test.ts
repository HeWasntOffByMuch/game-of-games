import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MECHANICS_DIR = join(process.cwd(), 'src/mechanics');

function mechanicFolders(): string[] {
  return readdirSync(MECHANICS_DIR).filter((entry) =>
    statSync(join(MECHANICS_DIR, entry)).isDirectory(),
  );
}

function filesIn(dir: string): string[] {
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .flatMap((path) => (statSync(path).isDirectory() ? filesIn(path) : [path]))
    .filter((path) => path.endsWith('.ts'));
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] ?? '');
}

/**
 * The one boundary that matters in this codebase: mechanics compose through
 * declared ports and hooks, never by naming each other. If this test fails,
 * the compositional claim is no longer true.
 */
describe('mechanic boundaries', () => {
  const folders = mechanicFolders();

  it('has mechanics to check', () => {
    expect(folders.length).toBeGreaterThan(0);
  });

  it.each(folders)('%s imports no other mechanic', (folder) => {
    const others = folders.filter((other) => other !== folder);
    for (const file of filesIn(join(MECHANICS_DIR, folder))) {
      for (const specifier of importsOf(file)) {
        for (const other of others) {
          expect(specifier, `${file} imports ${specifier}`).not.toContain(`mechanics/${other}`);
          expect(specifier, `${file} imports ${specifier}`).not.toMatch(
            new RegExp(`(^|/)\\.\\./${other}(/|$)`),
          );
        }
      }
    }
  });

  it.each(folders)('%s reaches the world only through the frame and grammar', (folder) => {
    for (const file of filesIn(join(MECHANICS_DIR, folder))) {
      for (const specifier of importsOf(file)) {
        if (!specifier.startsWith('.')) continue;
        expect(specifier, `${file} imports ${specifier}`).toMatch(
          /^(\.\/|\.\.\/\.\.\/(frame|grammar)\/)/,
        );
      }
    }
  });

  it('keeps the assembler free of mechanic implementations', () => {
    for (const file of filesIn(join(process.cwd(), 'src/assembler'))) {
      for (const specifier of importsOf(file)) {
        expect(specifier, `${file} imports ${specifier}`).not.toContain('mechanics/');
      }
    }
  });
});
