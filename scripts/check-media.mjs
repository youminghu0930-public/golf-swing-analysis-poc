// Exercise actual HTTP delivery, including the byte ranges needed for seeking.
const base = new URL(process.argv[2] || 'http://127.0.0.1:8004/');
const catalogResponse = await fetch(new URL('materials/data/catalog.json', base));
if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`);
const catalog = await catalogResponse.json();
const assets = new Set(catalog.clips.flatMap(clip => [clip.thumbnail,...Object.values(clip.poses)]));
for (const snapshot of catalog.snapshots) assets.add(snapshot.image);
for (const file of assets) {
  const response = await fetch(new URL(file,base),{method:'HEAD'});
  if (!response.ok || Number(response.headers.get('content-length')) <= 0) throw new Error(`Missing or empty asset: ${file}`);
}
for (const clip of catalog.clips) {
  const response = await fetch(new URL(clip.video,base),{headers:{Range:'bytes=0-31'}});
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (response.status !== 206 || !response.headers.get('content-range')?.startsWith('bytes 0-31/') || bytes.length !== 32 || !response.headers.get('content-type')?.includes('video/mp4')) throw new Error(`Video range delivery failed: ${clip.key}`);
}
console.log(`HTTP verified: ${catalog.clips.length} video byte ranges and ${assets.size} pose/preview assets.`);
