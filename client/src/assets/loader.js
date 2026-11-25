/** Fetch-based, abortable asset pipeline. No DOM/UI dependency. */
export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} while loading ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export function isAbort(error) {
  return error?.name === 'AbortError' || error?.name === 'TimeoutError';
}

function abortReason(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('Operation aborted', 'AbortError');
}

export function delay(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      finish();
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      finish();
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** Retry network failures and HTTP 5xx, never HTTP 4xx or JSON syntax errors. */
export async function withRetry(
  task,
  { signal, attempts = 3, baseDelayMs = 180, random = Math.random } = {},
) {
  if (!Number.isInteger(attempts) || attempts < 1)
    throw new RangeError('attempts must be positive');
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) throw abortReason(signal);
    try {
      return await task(attempt);
    } catch (error) {
      if (signal?.aborted) throw abortReason(signal);
      if (error instanceof HttpError && error.status >= 400 && error.status < 500) throw error;
      if (error instanceof SyntaxError) throw error;
      if (error?.name === 'AbortError' && error?.name !== 'TimeoutError') throw error;
      if (attempt === attempts - 1) throw error;
      const backoff = baseDelayMs * 2 ** attempt;
      await delay(backoff + random() * backoff * 0.35, signal);
    }
  }
  throw new Error('Retry loop exhausted');
}

/** Each attempt has its own timeout; external signal always cancels the whole task. */
export async function fetchResponse(
  url,
  { signal, fetchImpl = fetch, timeoutMs = 5000, attempts = 3, baseDelayMs = 180 } = {},
) {
  return withRetry(
    async () => {
      const perAttempt = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, perAttempt]) : perAttempt;
      const response = await fetchImpl(url, { signal: combined, cache: 'no-store' });
      if (!response.ok) throw new HttpError(response.status, url);
      return response;
    },
    { signal, attempts, baseDelayMs },
  );
}

/** HTTP 200 does not guarantee good JSON: let SyntaxError propagate to the UI. */
export async function fetchJson(url, options = {}) {
  const response = await fetchResponse(url, options);
  return response.json();
}

export async function loadJson(url, options = {}) {
  return fetchJson(url, options);
}

export async function loadImage(url, { decodeImage = defaultImageDecoder, ...options } = {}) {
  const response = await fetchResponse(url, options);
  return decodeImage(await response.blob());
}

async function defaultImageDecoder(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image decode failed'));
    };
    img.src = objectUrl;
  });
}

/** OfflineAudioContext decodes without unlocking audible playback before a gesture. */
export async function loadAudio(url, { decodeAudio = defaultAudioDecoder, ...options } = {}) {
  const response = await fetchResponse(url, options);
  return decodeAudio(await response.arrayBuffer());
}

async function defaultAudioDecoder(arrayBuffer) {
  const offline = new OfflineAudioContext(1, 1, 44100);
  return offline.decodeAudioData(arrayBuffer);
}

/** All files begin concurrently; progress is reported on settlement of EACH file. */
export async function loadAll(manifest, { signal, onProgress = () => {}, ...options } = {}) {
  if (!Array.isArray(manifest?.assets) || !manifest.assets.length) {
    throw new Error('manifest.assets must be a nonempty array');
  }
  const ids = new Set();
  const result = { images: {}, audio: {}, json: {} };
  let completed = 0;
  const total = manifest.assets.length;
  onProgress({ completed, total, fraction: 0, file: 'Starting downloads' });
  await Promise.all(
    manifest.assets.map(async (asset) => {
      if (!asset.id || !asset.url || !['image', 'audio', 'json'].includes(asset.type)) {
        throw new Error('Invalid manifest entry');
      }
      if (ids.has(asset.id)) throw new Error(`Duplicate asset id: ${asset.id}`);
      ids.add(asset.id);
      const resource =
        asset.type === 'image'
          ? await loadImage(asset.url, { signal, ...options })
          : asset.type === 'audio'
            ? await loadAudio(asset.url, { signal, ...options })
            : await loadJson(asset.url, { signal, ...options });
      const bucket = asset.type === 'image' ? 'images' : asset.type === 'audio' ? 'audio' : 'json';
      result[bucket][asset.id] = resource;
      completed++;
      onProgress({ completed, total, fraction: completed / total, file: asset.url });
    }),
  );
  return result;
}

/** Compare sequential and concurrent runs against the same resources/cache policy. */
export async function measureLoading(manifest, options = {}) {
  const startSequential = performance.now();
  for (const asset of manifest.assets) {
    const fn = asset.type === 'image' ? loadImage : asset.type === 'audio' ? loadAudio : loadJson;
    await fn(asset.url, options);
  }
  const sequentialMs = performance.now() - startSequential;
  const startConcurrent = performance.now();
  await loadAll(manifest, options);
  const concurrentMs = performance.now() - startConcurrent;
  return { sequentialMs, concurrentMs, files: manifest.assets.length };
}
