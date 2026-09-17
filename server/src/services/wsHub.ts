import type { WebSocket } from 'ws';

type Topic = string; // `console:<serverId>`

const subscribers = new Map<Topic, Set<WebSocket>>();

export function subscribe(topic: Topic, socket: WebSocket) {
  let set = subscribers.get(topic);
  if (!set) {
    set = new Set();
    subscribers.set(topic, set);
  }
  set.add(socket);
  socket.on('close', () => unsubscribe(topic, socket));
}

export function unsubscribe(topic: Topic, socket: WebSocket) {
  subscribers.get(topic)?.delete(socket);
}

export function publish(topic: Topic, data: unknown) {
  const set = subscribers.get(topic);
  if (!set || set.size === 0) return;
  const payload = JSON.stringify(data);
  for (const socket of set) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

export function consoleTopic(serverId: string): Topic {
  return `console:${serverId}`;
}
