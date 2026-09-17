import { publish, consoleTopic } from './wsHub.js';

/**
 * Shared per-server console/log buffer. Unlike the process manager's runtime state,
 * this persists across install → start → stop → start cycles, so the console view
 * always has scrollback (including install logs) even when nothing is running.
 */
const LOG_BUFFER_LIMIT = 4000;

const buffers = new Map<string, string[]>();

export type LogStream = 'stdout' | 'stderr' | 'system';

export function appendLine(serverId: string, line: string, stream: LogStream = 'system'): void {
  let buffer = buffers.get(serverId);
  if (!buffer) {
    buffer = [];
    buffers.set(serverId, buffer);
  }
  buffer.push(line);
  if (buffer.length > LOG_BUFFER_LIMIT) buffer.shift();
  publish(consoleTopic(serverId), { type: 'log', stream, line, at: Date.now() });
}

export function getBuffer(serverId: string): string[] {
  return buffers.get(serverId) ?? [];
}

export function clearBuffer(serverId: string): void {
  buffers.delete(serverId);
}
