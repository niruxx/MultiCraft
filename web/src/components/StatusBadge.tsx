import { Badge } from './ui.js';
import type { ServerStatus } from '../api/types.js';

const TONE: Record<ServerStatus, 'neutral' | 'green' | 'red' | 'yellow' | 'blue'> = {
  installing: 'blue',
  install_failed: 'red',
  stopped: 'neutral',
  starting: 'yellow',
  running: 'green',
  stopping: 'yellow',
  crashed: 'red',
};

const LABEL: Record<ServerStatus, string> = {
  installing: 'Installing',
  install_failed: 'Install failed',
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  crashed: 'Crashed',
};

export function StatusBadge({ status }: { status: ServerStatus }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}
