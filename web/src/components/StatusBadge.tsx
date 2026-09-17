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
  updating: 'blue',
};

const LABEL: Record<ServerStatus, string> = {
  installing: 'Installing',
  install_failed: 'Install failed',
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  crashed: 'Crashed',
  updating: 'Updating',
};

const PULSE: Record<ServerStatus, boolean> = {
  installing: true,
  install_failed: false,
  stopped: false,
  starting: true,
  running: true,
  stopping: true,
  crashed: false,
  updating: true,
};

export function StatusBadge({ status }: { status: ServerStatus }) {
  return (
    <Badge tone={TONE[status]} pulse={PULSE[status]}>
      {LABEL[status]}
    </Badge>
  );
}
