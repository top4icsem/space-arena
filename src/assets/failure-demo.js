/** Four reproducible failure-gallery modes, enabled only via ?failure=. */
export function faultOptions(mode, controller) {
  const options = {};
  if (mode === 'timeout' || mode === 'abort') {
    options.fetchImpl = (url, { signal }) => {
      if (String(url).includes('ships.png')) {
        // Never resolves by itself. Timeout and manual abort exercise the same real signal path.
        return new Promise((_resolve, reject) => {
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
      return fetch(url, { signal, cache: 'no-store' });
    };
  }
  if (mode === 'timeout') options.timeoutMs = 350;
  if (mode === 'abort')
    setTimeout(
      () => controller.abort(new DOMException('Demo: cancelled while assets loaded', 'AbortError')),
      280,
    );
  return options;
}

export function faultManifest(original, mode) {
  const manifest = structuredClone(original);
  if (mode === '404')
    manifest.assets.find((a) => a.id === 'ships').url = '/assets/sprites/404-missing.png';
  if (mode === 'json')
    manifest.assets.find((a) => a.id === 'arena-rules').url = '/assets/data/broken.json';
  return manifest;
}
