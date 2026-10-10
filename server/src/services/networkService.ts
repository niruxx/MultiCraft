import dgram from 'node:dgram';
import os from 'node:os';

export interface HostAddress {
  address: string;
  interface: string;
  family: 'IPv4' | 'IPv6';
}

// Bridges/virtual NICs created by container and VM tooling — never what players connect to.
const VIRTUAL_IFACE_RE = /^(docker|br-|veth|virbr|vmnet|vboxnet|cni|flannel|podman|lxc|lxd)/i;

/** Every non-loopback address on this host, IPv4 first, physical-looking interfaces first. */
export function listHostAddresses(): HostAddress[] {
  const out: HostAddress[] = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      if (entry.family === 'IPv6' && entry.address.toLowerCase().startsWith('fe80')) continue; // link-local
      out.push({ address: entry.address, interface: name, family: entry.family === 'IPv6' ? 'IPv6' : 'IPv4' });
    }
  }
  const rank = (a: HostAddress) => (a.family === 'IPv4' ? 0 : 2) + (VIRTUAL_IFACE_RE.test(a.interface) ? 1 : 0);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** Asks the kernel which local address it would use to reach the internet. connect() on a UDP
 *  socket only selects a route — no packet is ever sent, so this works offline-safe and silently. */
function addressOfDefaultRoute(): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // already closed
      }
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 1000);
    socket.on('error', () => done(null));
    socket.connect(53, '1.1.1.1', () => {
      try {
        const { address } = socket.address();
        done(address && address !== '0.0.0.0' ? address : null);
      } catch {
        done(null);
      }
    });
  });
}

let cachedPrimary: { address: string | null; at: number } | null = null;
const PRIMARY_CACHE_MS = 60_000;

/** The host's primary LAN address — the one players on the network would connect to. */
export async function getPrimaryAddress(): Promise<string | null> {
  if (cachedPrimary && Date.now() - cachedPrimary.at < PRIMARY_CACHE_MS) return cachedPrimary.address;
  const viaRoute = await addressOfDefaultRoute();
  const fallback = listHostAddresses().find((a) => a.family === 'IPv4' && !VIRTUAL_IFACE_RE.test(a.interface));
  const address = viaRoute ?? fallback?.address ?? null;
  cachedPrimary = { address, at: Date.now() };
  return address;
}
