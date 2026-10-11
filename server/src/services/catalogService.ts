import type { DockerConfig } from './containerService.js';

/**
 * One-click container templates — games and general software — served to the UI from
 * GET /api/catalog. The server also uses this list to enforce "catalog apps only" access: users with
 * that permission can only create containers whose image matches one of these templates.
 */
export interface CatalogEntry {
  id: string;
  name: string;
  /** Short line under the name. */
  tagline: string;
  section: 'Platform tools' | 'Web & apps' | 'Databases' | 'Media & files' | 'Games';
  /** Emblem: an APP_ICONS key or a game kind. */
  icon: string;
  memoryMb: number;
  config: DockerConfig;
  /** Shown before creating (e.g. what to change, what the template needs). */
  note?: string;
}

const base = (overrides: Partial<DockerConfig> & Pick<DockerConfig, 'image' | 'ports'>): DockerConfig => ({
  env: [],
  dataPath: '/data',
  cpus: null,
  command: '',
  runAsPanelUser: false,
  volumes: [],
  webUi: null,
  mountEngineSocket: false,
  category: 'app',
  icon: null,
  template: null,
  ...overrides,
});

export const CATALOG: CatalogEntry[] = [
  // ---------------------------------------------------------------- platform tools
  {
    id: 'portainer',
    name: 'Portainer',
    tagline: 'Web UI for managing containers, images, volumes and stacks',
    section: 'Platform tools',
    icon: 'manager',
    memoryMb: 512,
    note: 'Portainer manages the container engine itself, so it gets the engine socket mounted — it can control every container on this host. Open it, create its admin account within 5 minutes, and choose the local environment.',
    config: base({
      image: 'docker.io/portainer/portainer-ce:lts',
      ports: [
        { host: 9443, container: 9443, protocol: 'tcp' },
        { host: 8000, container: 8000, protocol: 'tcp' },
      ],
      dataPath: '/data',
      webUi: { port: 9443, scheme: 'https', path: '/' },
      mountEngineSocket: true,
      icon: 'manager',
      template: 'portainer',
    }),
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    tagline: 'Monitor websites, ports and services with status pages',
    section: 'Platform tools',
    icon: 'monitor',
    memoryMb: 512,
    config: base({
      image: 'docker.io/louislam/uptime-kuma:1',
      ports: [{ host: 3001, container: 3001, protocol: 'tcp' }],
      dataPath: '/app/data',
      webUi: { port: 3001, scheme: 'http', path: '/' },
      icon: 'monitor',
      template: 'uptime-kuma',
    }),
  },
  // ---------------------------------------------------------------- web & apps
  {
    id: 'nginx',
    name: 'Nginx',
    tagline: 'Static website — put your files in the instance’s html folder',
    section: 'Web & apps',
    icon: 'web',
    memoryMb: 256,
    config: base({
      image: 'docker.io/library/nginx:stable',
      ports: [{ host: 8080, container: 80, protocol: 'tcp' }],
      dataPath: '/srv/instance',
      volumes: [{ subdir: 'html', containerPath: '/usr/share/nginx/html' }],
      webUi: { port: 8080, scheme: 'http', path: '/' },
      icon: 'web',
      template: 'nginx',
    }),
  },
  {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    tagline: 'Self-hosted, Bitwarden-compatible password manager',
    section: 'Web & apps',
    icon: 'vault',
    memoryMb: 256,
    note: 'Browsers only allow the Bitwarden web vault over HTTPS — put it behind a reverse proxy with a certificate before real use.',
    config: base({
      image: 'docker.io/vaultwarden/server:latest',
      ports: [{ host: 8081, container: 80, protocol: 'tcp' }],
      dataPath: '/data',
      webUi: { port: 8081, scheme: 'http', path: '/' },
      icon: 'vault',
      template: 'vaultwarden',
    }),
  },
  // ---------------------------------------------------------------- databases
  {
    id: 'postgres',
    name: 'PostgreSQL',
    tagline: 'Relational database',
    section: 'Databases',
    icon: 'database',
    memoryMb: 1024,
    note: 'Change POSTGRES_PASSWORD before creating.',
    config: base({
      image: 'docker.io/library/postgres:16',
      ports: [{ host: 5432, container: 5432, protocol: 'tcp' }],
      env: [
        { key: 'POSTGRES_PASSWORD', value: 'change-me' },
        { key: 'POSTGRES_DB', value: 'app' },
        { key: 'PGDATA', value: '/var/lib/postgresql/data/pgdata' },
      ],
      dataPath: '/var/lib/postgresql/data',
      icon: 'database',
      template: 'postgres',
    }),
  },
  {
    id: 'mariadb',
    name: 'MariaDB',
    tagline: 'MySQL-compatible database',
    section: 'Databases',
    icon: 'database',
    memoryMb: 1024,
    note: 'Change MARIADB_ROOT_PASSWORD before creating.',
    config: base({
      image: 'docker.io/library/mariadb:11',
      ports: [{ host: 3306, container: 3306, protocol: 'tcp' }],
      env: [
        { key: 'MARIADB_ROOT_PASSWORD', value: 'change-me' },
        { key: 'MARIADB_DATABASE', value: 'app' },
      ],
      dataPath: '/var/lib/mysql',
      icon: 'database',
      template: 'mariadb',
    }),
  },
  {
    id: 'redis',
    name: 'Redis',
    tagline: 'In-memory cache and key-value store',
    section: 'Databases',
    icon: 'cache',
    memoryMb: 512,
    config: base({
      image: 'docker.io/library/redis:7',
      ports: [{ host: 6379, container: 6379, protocol: 'tcp' }],
      dataPath: '/data',
      command: 'redis-server --appendonly yes',
      icon: 'cache',
      template: 'redis',
    }),
  },
  // ---------------------------------------------------------------- media & files
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    tagline: 'Stream your movies, shows and music',
    section: 'Media & files',
    icon: 'media',
    memoryMb: 2048,
    note: 'Put your media in the instance’s media folder (File Management), then add /media as a library.',
    config: base({
      image: 'docker.io/jellyfin/jellyfin:latest',
      ports: [{ host: 8096, container: 8096, protocol: 'tcp' }],
      dataPath: '/config',
      volumes: [
        { subdir: 'cache', containerPath: '/cache' },
        { subdir: 'media', containerPath: '/media' },
      ],
      webUi: { port: 8096, scheme: 'http', path: '/' },
      icon: 'media',
      template: 'jellyfin',
    }),
  },
  {
    id: 'filebrowser',
    name: 'File Browser',
    tagline: 'Share and manage files from the browser',
    section: 'Media & files',
    icon: 'cloud',
    memoryMb: 256,
    note: 'The first login is admin with a random password printed in the console.',
    config: base({
      image: 'docker.io/filebrowser/filebrowser:latest',
      ports: [{ host: 8082, container: 80, protocol: 'tcp' }],
      dataPath: '/srv',
      volumes: [{ subdir: '.filebrowser', containerPath: '/database' }],
      webUi: { port: 8082, scheme: 'http', path: '/' },
      icon: 'cloud',
      template: 'filebrowser',
    }),
  },
  // ---------------------------------------------------------------- games (container images)
  {
    id: 'mc-java',
    name: 'Minecraft: Java',
    tagline: 'itzg/minecraft-server — Paper, Fabric, Forge… via TYPE',
    section: 'Games',
    icon: 'minecraft-java',
    memoryMb: 3072,
    config: base({
      image: 'docker.io/itzg/minecraft-server',
      ports: [{ host: 25565, container: 25565, protocol: 'tcp' }],
      env: [
        { key: 'EULA', value: 'TRUE' },
        { key: 'TYPE', value: 'PAPER' },
        { key: 'VERSION', value: 'LATEST' },
        { key: 'MEMORY', value: '{{MIN_MEMORY}}M' },
      ],
      runAsPanelUser: true,
      category: 'game',
      icon: 'minecraft-java',
      template: 'mc-java',
    }),
  },
  {
    id: 'mc-bedrock',
    name: 'Minecraft: Bedrock',
    tagline: 'itzg/minecraft-bedrock-server',
    section: 'Games',
    icon: 'minecraft-bedrock',
    memoryMb: 2048,
    config: base({
      image: 'docker.io/itzg/minecraft-bedrock-server',
      ports: [{ host: 19132, container: 19132, protocol: 'udp' }],
      env: [
        { key: 'EULA', value: 'TRUE' },
        { key: 'VERSION', value: 'LATEST' },
      ],
      runAsPanelUser: true,
      category: 'game',
      icon: 'minecraft-bedrock',
      template: 'mc-bedrock',
    }),
  },
  {
    id: 'valheim',
    name: 'Valheim',
    tagline: 'lloesche/valheim-server',
    section: 'Games',
    icon: 'valheim',
    memoryMb: 4096,
    note: 'Change SERVER_PASS (at least 5 characters) before creating.',
    config: base({
      image: 'docker.io/lloesche/valheim-server',
      ports: [
        { host: 2456, container: 2456, protocol: 'udp' },
        { host: 2457, container: 2457, protocol: 'udp' },
      ],
      env: [
        { key: 'SERVER_NAME', value: '{{NAME}}' },
        { key: 'WORLD_NAME', value: 'Dedicated' },
        { key: 'SERVER_PASS', value: 'change-me' },
      ],
      dataPath: '/config',
      category: 'game',
      icon: 'valheim',
      template: 'valheim',
    }),
  },
  {
    id: 'palworld',
    name: 'Palworld',
    tagline: 'thijsvanloef/palworld-server-docker',
    section: 'Games',
    icon: 'palworld',
    memoryMb: 16384,
    config: base({
      image: 'docker.io/thijsvanloef/palworld-server-docker',
      ports: [
        { host: 8211, container: 8211, protocol: 'udp' },
        { host: 27015, container: 27015, protocol: 'udp' },
      ],
      env: [
        { key: 'PORT', value: '8211' },
        { key: 'PLAYERS', value: '16' },
        { key: 'SERVER_NAME', value: '{{NAME}}' },
      ],
      dataPath: '/palworld',
      category: 'game',
      icon: 'palworld',
      template: 'palworld',
    }),
  },
  {
    id: 'cs2',
    name: 'Counter-Strike 2',
    tagline: 'joedwards32/cs2',
    section: 'Games',
    icon: 'steam:730',
    memoryMb: 4096,
    config: base({
      image: 'docker.io/joedwards32/cs2',
      ports: [
        { host: 27015, container: 27015, protocol: 'tcp' },
        { host: 27015, container: 27015, protocol: 'udp' },
      ],
      env: [{ key: 'CS2_SERVERNAME', value: '{{NAME}}' }],
      dataPath: '/home/steam/cs2-dedicated',
      category: 'game',
      icon: null, // CS2's crosshair emblem comes from the image name
      template: 'cs2',
    }),
  },
];

/** A blank container definition for "any image". */
export const BLANK_CONTAINER: DockerConfig = base({ image: '', ports: [{ host: 8080, container: 8080, protocol: 'tcp' }], runAsPanelUser: true, category: 'container' });

export function findTemplate(id: string | null | undefined): CatalogEntry | undefined {
  return id ? CATALOG.find((e) => e.id === id) : undefined;
}
