// Generate metadata and small previews from data, never duplicate videos or poses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { snapshotItems } from '../snapshot-data.js';
import { prepareBanner } from './banner-assets.mjs';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const directories = directory => fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort() : [];

export function discoverPoseModels(root) {
  return { before: 'before', after: 'after' };
}

export function prepareData(root = projectRoot, { probe = probeVideo, preview = makePreview, warn = console.warn } = {}) {
  const options = read(fileURLToPath(new URL('./media-options.json', import.meta.url)));
  const models = discoverPoseModels(root);
  if (!Number.isInteger(options.snapshotWebpQuality) || options.snapshotWebpQuality < 0 || options.snapshotWebpQuality > 100) throw new Error('Snapshot WebP quality must be an integer from 0 to 100');
  for (const command of [probe === probeVideo && 'ffprobe', preview === makePreview && 'ffmpeg'].filter(Boolean)) {
    try { execFileSync(command, ['-version'], { stdio: 'ignore' }); }
    catch { throw new Error(`Install FFmpeg (including ${command}) before preparing data.`); }
  }
  const generated = path.join(root, 'materials/data/.generated');
  fs.mkdirSync(generated, { recursive: true });
  const cacheFile = path.join(generated, 'probe-cache.json');
  let oldCache = {};
  try { oldCache = read(cacheFile); } catch { /* Fresh checkout or invalid disposable cache. */ }
  const cache = {};
  const ensurePreview = (source, destination, frame) => {
    if (!fs.existsSync(destination) || fs.statSync(destination).mtimeMs < fs.statSync(source).mtimeMs) preview(source, destination, frame);
  };
  const clips = [];
  for (const view of directories(path.join(root, 'materials/data/vidoes'))) {
    const folder = path.join(root, 'materials/data/vidoes', view);
    for (const filename of fs.readdirSync(folder).filter(name => /\.mp4$/i.test(name)).sort()) {
      const id = path.parse(filename).name, key = `${view}-${id}`;
      const video = `materials/data/vidoes/${view}/${filename}`;
      const singlePose = `materials/data/poses/${view}/${id}.json`;
      const poses = fs.existsSync(path.join(root,singlePose)) ? {after:singlePose} : Object.fromEntries(['before', 'after'].map(side => [side, `materials/data/poses/${models[side]}/${view}/${id}.json`]));
      if (!models.before || !models.after || Object.values(poses).some(file => !fs.existsSync(path.join(root, file)))) {
        warn(`Skipping ${key}: missing before or after poses.`); continue;
      }
      try {
        const counts = Object.values(poses).map(file => {
          const pose = read(path.join(root, file));
          if (!Array.isArray(pose.joints) || !Array.isArray(pose.pred)) throw new Error(`Invalid pose file: ${file}`);
          return pose.pred.length;
        });
        const source = path.join(root, video), stat = fs.statSync(source);
        const signature = `${stat.size}:${stat.mtimeMs}`;
        const metadata = oldCache[video]?.signature === signature ? oldCache[video].metadata : probe(source);
        const hash = oldCache[video]?.signature === signature && oldCache[video].hash
          ? oldCache[video].hash : createHash('sha256').update(fs.readFileSync(source)).digest('hex').slice(0, 12);
        cache[video] = { signature, metadata, hash };
        const frameCount = Math.min(metadata.times.length, ...counts);
        if (!frameCount) throw new Error('No shared frames');
        const thumbnail = `materials/data/.generated/${key}-thumbnail.jpg`;
        ensurePreview(source, path.join(root, thumbnail), null);
        clips.push({ id, key, view, video, poses, thumbnail, frameCount, videoFrameCount: metadata.times.length,
          poseFrameCounts: counts, width: metadata.width, height: metadata.height, times: metadata.times.slice(0, frameCount) });
      } catch (error) { warn(`Skipping ${key}: ${error.message}`); }
    }
  }
  const snapshots = [];
  const snapshotPoses = new Map();
  const configFile = path.join(root, 'materials/data/snapshot.json');
  if (fs.existsSync(configFile)) {
    try {
      for (const { clip, frame, range, joints } of snapshotItems(read(configFile), clips, { onWarning: warn })) {
        const folder = `materials/data/snapshots/${clip.view}/${clip.id}`;
        fs.mkdirSync(path.join(root,folder),{recursive:true});
        const existing = ['jpg','jpeg','png','webp'].map(extension=>`${folder}/${frame}.${extension}`).find(file=>fs.existsSync(path.join(root,file)));
        const image = existing || `${folder}/${frame}.jpg`;
        try {
          ensurePreview(path.join(root,clip.video),path.join(root,image),frame);
          const snapshot = { key: `${clip.key}-${frame}`, image, range, selectedJoints: joints };
          for (const side of Object.keys(clip.poses)) {
            const file = clip.poses[side];
            if (!snapshotPoses.has(file)) snapshotPoses.set(file, read(path.join(root, file)));
            const pose = snapshotPoses.get(file);
            // Only the displayed frame is sent to snapshot visitors, not the entire video prediction.
            snapshot.occlusionPoses ??= {};
            snapshot.occlusionPoses[side] = { joints: pose.joints, pred: [pose.pred[frame].slice(0, pose.joints.length)] };
            const selected = range ? joints : pose.joints;
            snapshot[side] = { joints: selected, pred: [selected.map(name => pose.pred[frame][pose.joints.indexOf(name)])] };
            if (range) {
              snapshot.trajectories ??= {};
              snapshot.trajectories[side] = { joints: selected, pred: pose.pred.slice(range[0], range[1] + 1).map(row => selected.map(name => row[pose.joints.indexOf(name)])) };
            }
          }
          snapshots.push(snapshot);
        } catch (error) { warn(`Snapshot preview ${clip.key}/${frame}: ${error.message}`); }
      }
    } catch (error) { warn(`Snapshot configuration: ${error.message}`); }
  }
  const catalog = { models, clips, snapshots };
  try {
    const contentFile = path.join(root, 'materials/content.json');
    if (fs.existsSync(contentFile)) catalog.banner = prepareBanner(root, clips, read(contentFile).page?.banner);
  } catch (error) { warn(`Banner preview unavailable: ${error.message}`); }
  const snapshotCatalog = { models, clips: clips.map(({id,key,view,width,height,frameCount})=>({id,key,view,width,height,frameCount})), snapshots };
  fs.writeFileSync(path.join(root,'materials/data/snapshot-catalog.json'),JSON.stringify(snapshotCatalog));
  fs.writeFileSync(path.join(root, 'materials/data/catalog.json'), JSON.stringify(catalog));
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  return catalog;
}

function probeVideo(file) {
  const result = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_frames', '-show_streams', '-show_entries', 'stream=width,height:frame=best_effort_timestamp_time', '-of', 'json', file], { maxBuffer: 32 * 1024 * 1024 }));
  const origin = Number(result.frames[0]?.best_effort_timestamp_time);
  const times = result.frames.map(frame => Number((Number(frame.best_effort_timestamp_time) - origin).toFixed(6)));
  if (!times.length || !times.every(Number.isFinite)) throw new Error('Invalid video frame times');
  return { times, width: result.streams[0].width, height: result.streams[0].height };
}

function makePreview(source, destination, frame, quality = 82) {
  const filter = frame === null ? 'scale=192:192:force_original_aspect_ratio=decrease' : `select=eq(n\\,${frame})`;
  const codec = frame === null || /\.jpe?g$/i.test(destination) ? ['-q:v', frame===null?'5':'2'] : /\.png$/i.test(destination) ? ['-c:v','png'] : ['-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6'];
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vf', filter, '-frames:v', '1', ...codec, destination]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = prepareData();
  console.log(`Indexed ${catalog.clips.length} videos and ${catalog.snapshots.length} snapshots directly from materials/data/.`);
}
