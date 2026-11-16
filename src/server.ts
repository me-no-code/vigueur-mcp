import { McpServer } from '@modelcontextprotocol/server';
import type { Config } from './config.js';
import type { StatusContext, StatusReport } from './services/status.js';
import type { SourceModule } from './sources.js';
import { type ToolContext, toolContext } from './tools/envelope.js';
import { registerStatusTool } from './tools/status.js';
import { VERSION } from './version.js';

export interface ServerDeps {
  config: Config;
  getStatus: (ctx?: StatusContext) => Promise<StatusReport>;
  sources: SourceModule[];
  /** The tools' clock, today's date and deadline (default: `toolContext()`). */
  tools?: ToolContext;
}

/** Builds the MCP server. No network at startup: PISTE problems surface through vigueur_status. */
export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: 'vigueur', version: VERSION });
  registerStatusTool(server, deps.getStatus, deps.tools ?? toolContext());
  if (deps.config.piste !== null) {
    for (const source of deps.sources) source.register(server);
  }
  return server;
}
