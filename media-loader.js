// Decode the selected video automatically, including browsers that stop at metadata.
export function loadVideoFrame(video, url, { signal, onBlob, fallbackDelay = 2000, timeout = 25000, fetchMedia = fetch } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false, fallbackStarted = false;
    const events = ['loadeddata', 'canplay', 'loadedmetadata', 'progress', 'suspend'];
    const cleanup = () => {
      clearTimeout(fallbackTimer); clearTimeout(timeoutTimer);
      events.forEach(event => video.removeEventListener(event, check));
      video.removeEventListener('error', failed); signal?.removeEventListener('abort', aborted);
    };
    const finish = error => {
      if (settled) return;
      settled = true; cleanup(); video.pause();
      if (error) reject(error); else resolve();
    };
    const check = () => { if (video.readyState >= 2) finish(); };
    const aborted = () => finish(new DOMException('Aborted', 'AbortError'));
    const nudge = () => { const playing = video.play(); playing?.then(check).catch(() => { check(); }); };
    const recover = async () => {
      if (settled || fallbackStarted || url.startsWith('blob:')) return;
      fallbackStarted = true;
      try {
        const response = await fetchMedia(url, { signal });
        if (!response.ok) throw new Error(`Video request failed: ${response.status}`);
        const blob = await response.blob();
        if (settled) return;
        const local = URL.createObjectURL(blob); onBlob?.(local);
        video.src = local; video.preload = 'auto'; video.load(); nudge(); check();
      } catch (error) { if (!settled) finish(error); }
    };
    const failed = () => { if (!fallbackStarted && !url.startsWith('blob:')) recover(); else finish(new Error('Video could not load')); };
    const fallbackTimer = setTimeout(recover, fallbackDelay);
    const timeoutTimer = setTimeout(() => finish(new Error('Video loading timed out. Select a swing to retry.')), timeout);
    events.forEach(event => video.addEventListener(event, check));
    video.addEventListener('error', failed); signal?.addEventListener('abort', aborted, {once:true});
    if (signal?.aborted) { aborted(); return; }
    video.preload = 'auto'; video.src = url; video.load(); nudge(); check();
  });
}
