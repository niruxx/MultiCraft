import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { EndpointInfo } from '../api/types.js';

/** Where players connect to an instance. Re-fetched when the port (or anything in `deps`) changes. */
export function useEndpoint(serverId: string | undefined, port: number | undefined): EndpointInfo | null {
  const [endpoint, setEndpoint] = useState<EndpointInfo | null>(null);
  useEffect(() => {
    if (!serverId || port === undefined) return;
    let cancelled = false;
    api
      .get<EndpointInfo>(`/servers/${serverId}/endpoint`)
      .then((res) => !cancelled && setEndpoint(res))
      .catch(() => !cancelled && setEndpoint(null));
    return () => {
      cancelled = true;
    };
  }, [serverId, port]);
  return endpoint;
}
