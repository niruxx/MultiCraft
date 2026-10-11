import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { DockerConfig } from '../api/types.js';

/** A one-click container template (served by GET /api/catalog — the server's list is the source of truth). */
export interface CatalogEntry {
  id: string;
  name: string;
  tagline: string;
  section: 'Platform tools' | 'Web & apps' | 'Databases' | 'Media & files' | 'Games';
  icon: string;
  memoryMb: number;
  config: DockerConfig;
  note?: string;
}

let cache: { entries: CatalogEntry[]; blank: DockerConfig } | null = null;

/** Loads the catalog once per page load. */
export function useCatalog(): { entries: CatalogEntry[]; blank: DockerConfig } | null {
  const [catalog, setCatalog] = useState(cache);
  useEffect(() => {
    if (cache) return;
    api
      .get<{ entries: CatalogEntry[]; blank: DockerConfig }>('/catalog')
      .then((res) => {
        cache = res;
        setCatalog(res);
      })
      .catch(() => setCatalog({ entries: [], blank: EMPTY_CONTAINER }));
  }, []);
  return catalog;
}

export const EMPTY_CONTAINER: DockerConfig = {
  image: '',
  ports: [{ host: 8080, container: 8080, protocol: 'tcp' }],
  env: [],
  dataPath: '/data',
  cpus: null,
  command: '',
  runAsPanelUser: true,
  volumes: [],
  webUi: null,
  mountEngineSocket: false,
  category: 'container',
  icon: null,
  template: null,
};
