function splitHash(): { path: string; query: string } {
  const hash = location.hash.replace(/^#\/?/, '');
  const index = hash.indexOf('?');
  if (index === -1) return { path: hash, query: '' };
  return { path: hash.slice(0, index), query: hash.slice(index + 1) };
}

export function hashPath(): string {
  return splitHash().path;
}

export function readQuery(): URLSearchParams {
  return new URLSearchParams(splitHash().query);
}

export function replaceQuery(values: Record<string, string>): void {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== '') params.set(key, value);
  }
  const query = params.toString();
  const path = splitHash().path;
  history.replaceState(null, '', query === '' ? `#/${path}` : `#/${path}?${query}`);
}

export function onHashChange(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}
