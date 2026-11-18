import { defineConfig } from 'vitest/config';

// `--mode live` and `--mode bundle` turn on the suites that talk to PISTE or pack the bundle,
// the same way on every shell (an inline VAR=1 does not work in Windows' cmd.exe).
const OPT_IN: Record<string, Record<string, string>> = {
  live: { VIGUEUR_LIVE: '1' },
  bundle: { VIGUEUR_BUNDLE: '1' },
};

export default defineConfig(({ mode }) => ({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup/no-network.ts'],
    restoreMocks: true,
    testTimeout: 15000,
    env: OPT_IN[mode] ?? {},
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'text'],
      // The measured baseline, floored, minus one point: V8 counts differ a little between Node
      // versions. Raise them when coverage rises; never lower them to let a change in.
      thresholds: { statements: 96, branches: 89, functions: 97, lines: 98 },
    },
  },
}));
