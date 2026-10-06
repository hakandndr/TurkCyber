// One external-navigation definition, shared by trusted producers and adapters.
// Only public origin/path detail is retained. Queries and fragments are omitted.
export function outboundDestination(raw, aliases = []) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (
      !host.includes('.') ||
      aliases.some((alias) => String(alias).toLowerCase().replace(/\.$/, '') === host)
    )
      return null;
    url.hostname = host;
    // Session credentials also occur in path parameters and known auth routes.
    const path = decodeURIComponent(url.pathname);
    if (
      /;(?:[^/]*=)?|\/(?:access[_-]?token|auth(?:orization)?|session(?:[_-]?id)?|reset[_-]?password|password[_-]?reset)(?:\/|=)/i.test(
        path,
      )
    )
      return null;
    url.search = '';
    url.hash = '';
    return { host, url: url.href };
  } catch {
    return null;
  }
}
