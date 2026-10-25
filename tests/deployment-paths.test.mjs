import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryPath, publishedCatalog } from '../scripts/deployment-paths.mjs';
test('all generated media references become visible Pages paths without changing source data', () => {
  const source = {clips:[{video:'materials/data/.generated/videos/clip.mp4',thumbnail:'materials/data/.generated/thumb.jpg',poses:{before:'materials/data/poses/before/a.json'}}],snapshots:[{image:'materials/data/.generated/frame.webp'}],banner:{video:'materials/data/.generated/banner.mp4',pose:'materials/data/.generated/banner.json',poster:'materials/data/.generated/poster.webp'},times:[0,1],optional:null};
  const original = JSON.stringify(source);
  const published = publishedCatalog(source);
  assert.equal(published.clips[0].video,'media/videos/clip.mp4');
  assert.equal(published.clips[0].thumbnail,'media/thumb.jpg');
  assert.equal(published.snapshots[0].image,'media/frame.webp');
  assert.equal(published.banner.pose,'media/banner.json');
  assert.equal(published.banner.poster,'media/poster.webp');
  assert.equal(published.clips[0].poses.before,source.clips[0].poses.before);
  assert.deepEqual(published.times,[0,1]);
  assert.equal(published.optional,null);
  assert.equal(JSON.stringify(source),original);
  assert.equal(deliveryPath('main.js'),'main.js');
});
