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
  },
}));
