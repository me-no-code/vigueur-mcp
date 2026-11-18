import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';

// Spawns the built entry point: run `npm run build` first (`npm test` does it via pretest).
const ENTRY = fileURLToPath(new URL('../dist/index.js', import.meta.url));

/**
 * A healthy server answers in well under a second. The kill timer is generous because a second
 * `npm test` running at the same time rebuilds `dist/` (its pretest) while this one spawns it.
 */
const KILL_AFTER_MS = 30_000;
/** Each test may wait for the kill timer, plus room to report why. */
const TEST_TIMEOUT_MS = KILL_AFTER_MS + 5_000;

/** The test process environment without any PISTE_* variable. */
function envWithoutPiste(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('PISTE_')) env[key] = value;
  }
  return env;
}

interface InitializeExchange {
  stdoutLines: string[];
  stderr: string;
  response: { id?: unknown; result?: { serverInfo?: { name?: string } } };
  /** How the process ended, and how long after its stdin was closed. */
  exit: { code: number | null; signal: NodeJS.Signals | null; afterStdinEndMs: number };
}

/** Sends one raw `initialize` line, waits for the `id: 1` response, then closes stdin. */
function initializeOverStdio(
  env: Record<string, string>,
  args: string[] = [ENTRY],
): Promise<InitializeExchange> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(process.execPath, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_AFTER_MS);
    let stdout = '';
    let stderr = '';
    let response: InitializeExchange['response'] | undefined;
    let stdinEndedAt = 0;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (response) return;
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as InitializeExchange['response'];
          if (message.id === 1) {
            response = message;
            stdinEndedAt = performance.now();
            child.stdin.end(); // the server exits when its stdin closes
          }
        } catch {
          // incomplete line, or non-JSON output (asserted on below)
        }
      }
    });
    child.on('error', reject);
    // A child that dies early closes its stdin under our write: reported by 'close' below.
    child.stdin.on('error', () => {});
    child.on('close', (code, signal) => {
      clearTimeout(killTimer);
      if (!response) {
        const elapsed = Math.round(performance.now() - started);
        reject(
          new Error(
            `no initialize response after ${elapsed} ms (exit code ${code ?? 'none'}, signal ${signal ?? 'none'}); stdout=${stdout} stderr=${stderr}`,
          ),
        );
        return;
      }
      resolve({
        stdoutLines: stdout.split('\n').filter((l) => l.trim() !== ''),
        stderr,
        response,
        exit: { code, signal, afterStdinEndMs: performance.now() - stdinEndedAt },
      });
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'smoke', version: '0' },
        },
      })}\n`,
    );
  });
}

describe('stdio entry point', () => {
  it(
    'a server that exits without answering is reported with its run time and exit code',
    async () => {
      const error = await initializeOverStdio(envWithoutPiste(), ['-e', 'process.exit(3)']).catch(
        (e: unknown) => e,
      );
      expect(String(error)).toMatch(
        /no initialize response after \d+ ms \(exit code 3, signal none\); stdout= stderr=/,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'unconfigured: answers initialize and writes nothing but JSON-RPC to stdout',
    async () => {
      const { stdoutLines, stderr, response } = await initializeOverStdio(envWithoutPiste());

      for (const line of stdoutLines) expect(() => JSON.parse(line)).not.toThrow();
      expect(response.result?.serverInfo?.name).toBe('vigueur');
      expect(stderr).toContain('ready on stdio');
      expect(stderr).toContain('PISTE not configured');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'exits with code 0, promptly, when its stdin closes',
    async () => {
      const { exit } = await initializeOverStdio(envWithoutPiste());
      expect(exit.code).toBe(0);
      expect(exit.signal).toBeNull();
      expect(exit.afterStdinEndMs).toBeLessThan(5_000);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'configured: never echoes the credentials on stdout or stderr',
    async () => {
      const { stdoutLines, stderr, response } = await initializeOverStdio({
        ...envWithoutPiste(),
        PISTE_CLIENT_ID: 'smoke-id',
        PISTE_CLIENT_SECRET: 'smoke-secret-xyz',
        PISTE_ENV: 'sandbox',
      });

      for (const line of stdoutLines) expect(() => JSON.parse(line)).not.toThrow();
      expect(response.result?.serverInfo?.name).toBe('vigueur');
      const output = `${stdoutLines.join('\n')}\n${stderr}`;
      expect(output).not.toContain('smoke-secret-xyz');
      expect(output).not.toContain('smoke-id');
      expect(stderr).toContain('PISTE env: sandbox');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'serves an SDK stdio client: lists vigueur_status',
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [ENTRY],
        env: envWithoutPiste(),
        stderr: 'pipe',
      });
      const client = new Client({ name: 'stdio-test', version: '1.0.0' });
      await client.connect(transport);
      try {
        const { tools } = await client.listTools();
        expect(tools.map((t) => t.name)).toEqual(['vigueur_status']);
      } finally {
        await client.close();
      }
    },
    TEST_TIMEOUT_MS,
  );
});
