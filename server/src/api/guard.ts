/**
 * The API has no login: it trusts whoever can reach it on loopback. Browsers can still be tricked
 * into calling it (CSRF from another site, DNS rebinding), so only accept requests whose Host is a
 * loopback name and whose Origin, when present, is the app itself or the Vite dev server.
 */

export interface Allowed {
  readonly hosts: ReadonlySet<string>;
  readonly origins: ReadonlySet<string>;
}

const LOOPBACK_NAMES = ['127.0.0.1', 'localhost', '[::1]'];

export function allowedFor({ port, devPort }: { port: number; devPort: number }): Allowed {
  const hosts = [port, devPort].flatMap((p) => LOOPBACK_NAMES.map((name) => `${name}:${p}`));
  return { hosts: new Set(hosts), origins: new Set(hosts.map((host) => `http://${host}`)) };
}

export function isAllowedRequest({ host, origin }: { host?: string; origin?: string }, allowed: Allowed): boolean {
  if (!host || !allowed.hosts.has(host)) return false;
  return origin === undefined || allowed.origins.has(origin);
}
