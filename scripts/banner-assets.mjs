import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Decorative playback has its own small, silent asset; comparison sources stay intact.
export function prepareBanner(root, clips, settings) {
  if (!settings?.video || settings.enabled === false) return null;
  const matches = clips.filter(clip => clip.key === settings.video || clip.id === settings.video);
  if (matches.length !== 1) return null;
  const clip = matches[0];
  const startFrame = Math.max(0, Math.min(clip.frameCount-1, Math.floor(Number(settings.startFrame) || 1)-1));
  const source = path.join(root, clip.video);
  const poseSource = path.join(root, clip.poses.after);
  const hash = createHash('sha256').update(fs.readFileSync(source)).update(fs.readFileSync(poseSource))
    .update(`banner-480-crf30-v5-start${startFrame}`).digest('hex').slice(0, 12);
  const base = `materials/data/.generated/banner-${clip.key}-${hash}`;
  const video = `${base}.mp4`, pose = `${base}.json`, poster = `${base}-first.webp`;
  const data = JSON.parse(fs.readFileSync(poseSource, 'utf8'));
  if (!fs.existsSync(path.join(root, poster))) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vf', `select=gte(n\\,${startFrame}),scale=480:-2`,
      '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', path.join(root, poster)]);
  }
  if (!fs.existsSync(path.join(root, video))) {
    const temporary = path.join(root, `${base}.tmp.mp4`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-map', '0:v:0', '-an',
      '-vf', `trim=start_frame=${startFrame},setpts=PTS-STARTPTS,scale=480:-2`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '30',
      '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-enc_time_base:v', '1:1000000', '-movflags', '+faststart', temporary]);
    fs.renameSync(temporary, path.join(root, video));
  }
  if (!fs.existsSync(path.join(root, pose))) {
    fs.writeFileSync(path.join(root, pose), JSON.stringify({ joints: data.joints, pred: data.pred.slice(startFrame, clip.frameCount), history: data.pred.slice(Math.max(0,startFrame-10),startFrame) }));
  }
  return { key: clip.key, video, pose, poster, times: clip.times.slice(startFrame).map(time => time-clip.times[startFrame]), previewTrail: { joints: data.joints, pred: data.pred.slice(Math.max(0,startFrame-10),startFrame+1) }, previewPose: { joints: data.joints, pred: [data.pred[startFrame]] } };
}
