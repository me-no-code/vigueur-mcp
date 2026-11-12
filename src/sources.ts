import type { McpServer } from '@modelcontextprotocol/server';
import type { SourceId } from './shared/source-id.js';

/** A legal source's tools, registered on the server only when PISTE is configured. */
export interface SourceModule {
  id: SourceId;
  register(server: McpServer): void;
}
