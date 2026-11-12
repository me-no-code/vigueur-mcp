#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { compose } from './compose.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { VERSION } from './version.js';

// stdout carries JSON-RPC only: every log line goes to stderr.
const config = loadConfig(process.env);
const deps = compose(config);
const handle = serveStdio(() => createServer(deps));

const pisteState = config.piste
  ? `PISTE env: ${config.piste.env}`
  : 'PISTE not configured — call vigueur_status';
console.error(`vigueur ${VERSION}: ready on stdio (${pisteState})`);
for (const problem of config.problems) console.error(`vigueur: ${problem}`);

process.on('SIGINT', () => {
  handle.close().catch((err: unknown) => {
    console.error(`vigueur: error while closing: ${err instanceof Error ? err.message : err}`);
  });
});
