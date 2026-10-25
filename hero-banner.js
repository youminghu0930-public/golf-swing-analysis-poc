import { createBannerTrail } from './banner-trail.js';
import { createPoseOverlay } from './pose-overlay.js';
import { comparisonLabels } from './model-labels.js';
import { readCatalog } from './catalog.js';

export function bannerFrameAt(times, time) {
  let low=0,high=times.length-1;
  while (low<high) { const mid=Math.ceil((low+high)/2); if(times[mid]<=time+.00001) low=mid; else high=mid-1; }
  return low;
}
export function bannerClip(clips, key) {
  const matches=clips.filter(clip=>clip.key===key || clip.id===key);
  return matches.length===1?matches[0]:null;
}
const reveal = node => requestAnimationFrame(() => requestAnimationFrame(() => { node.dataset.ready = 'true'; }));
const make=(tag,className)=>{const node=document.createElement(tag); if(className)node.className=className; return node;};
async function read(url) {
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Banner asset ${response.status}: ${url}`);
  return response.json();
}
export async function mountBanner(root, settings, copy) {
  const catalog=settings.catalog ?? await readCatalog();
  const clip=bannerClip(catalog.clips,settings.video);
  if(!clip) { root.hidden=true; console.warn(`Banner clip not found or ambiguous: ${settings.video}`); return; }
  const asset=catalog.banner?.key===clip.key ? catalog.banner : null;
  copy={...copy,...comparisonLabels(copy,catalog.models)};
  const viewport=make('div','banner-viewport');
  const video=make('video','banner-video');
  video.muted=true; video.defaultMuted=true; video.setAttribute('muted','');
  video.playsInline=true; video.setAttribute('playsinline','');
  video.loop=true; video.preload='auto'; video.poster=asset?.poster??clip.thumbnail;
  video.setAttribute('aria-hidden','true'); video.tabIndex=-1;
  const poster=make('img','banner-poster');
  poster.alt=''; poster.fetchPriority='high'; poster.decoding='async';
  poster.addEventListener('load', async () => {
    try { await poster.decode(); reveal(poster); }
    catch { /* Keep failed previews transparent; video may still load. */ }
  }, { once: true });
  poster.src=video.poster;
  viewport.append(video,poster);
  const overlay=createPoseOverlay(viewport,1,copy,new Set(),()=>{},{interactive:false,fullBody:true});
  const skeleton=viewport.querySelector('.pose-overlay');
  const trail=settings.trails === false ? null : createBannerTrail(viewport,clip.width,clip.height);
  skeleton.classList.add('banner-skeleton');
  const times=asset?.times??clip.times;
  let motionPose;
  const fitOverlay=()=>{
    const contain=Math.min(viewport.clientWidth/clip.width,viewport.clientHeight/clip.height);
    const cover=Math.max(viewport.clientWidth/clip.width,viewport.clientHeight/clip.height);
    if(contain) {
      const state={zoom:root.classList.contains('project-preview')?1:cover/contain,x:0,y:0};
      if(settings.framing) {
        const b=settings.framing,w=viewport.clientWidth,h=viewport.clientHeight;
        const left=Math.max(0,b.left),right=Math.min(clip.width,b.right);
        const scale=w/Math.max(1,right-left);
        state.zoom=scale/contain;
        state.x=(clip.width/2-(left+right)/2)*scale/w;
        state.y=(clip.height/2-(b.top+b.bottom)/2)*scale/h;
        for(const media of [video,poster]) media.style.transform=`translate(${state.x*w}px,${state.y*h}px) scale(${state.zoom})`;
      }
      overlay.setTransform(state);trail?.setTransform(state);
    }
  };
  const resize=new ResizeObserver(fitOverlay);resize.observe(viewport);
  const badge=make('p','banner-badge'); badge.textContent=settings.label;
  root.replaceChildren(viewport,badge);
  if(asset?.previewPose) {
    overlay.setPose(asset.previewPose,clip.width,clip.height); fitOverlay(); overlay.render(0); if(asset.previewTrail)trail?.render(asset.previewTrail,asset.previewTrail.pred.length-1); reveal(skeleton);
  }
  let presentedTime=0;
  let callback, visible=false, loaded=false, wanted=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const draw=time=>{
    const frame=loaded&&poster.hidden?bannerFrameAt(times,time):0;
    if(loaded&&poster.hidden) {
      overlay.render(frame); if(motionPose)trail?.render(motionPose,frame);
    } else if(asset?.previewPose) {
      overlay.setPose(asset.previewPose,clip.width,clip.height);fitOverlay();overlay.render(0);
      if(asset.previewTrail)trail?.render(asset.previewTrail,asset.previewTrail.pred.length-1);
    }
    viewport.dataset.frame=String(frame);
  };
  const cancel=()=>{
    if(callback!==undefined) {
      if(video.requestVideoFrameCallback) video.cancelVideoFrameCallback(callback);
      else cancelAnimationFrame(callback);
      callback=undefined;
    }
  };
  const tick=(now,metadata)=>{
    callback=undefined;
    presentedTime=metadata?.mediaTime??video.currentTime;
    draw(presentedTime);
    if(!video.paused) schedule();
  };
  const schedule=()=>{
    cancel();
    callback=video.requestVideoFrameCallback?video.requestVideoFrameCallback(tick):requestAnimationFrame(tick);
  };
  let playPending;
  const restorePoster=()=>{
    video.dataset.ready='false'; poster.hidden=false; draw(0);
  };
  const sync=()=>{
    if(loaded&&video.readyState>=2&&visible&&!document.hidden&&wanted) {
      if(playPending||!video.paused) return;
      poster.hidden=true; if(motionPose) {overlay.setPose(motionPose,clip.width,clip.height);fitOverlay();} draw(presentedTime); video.dataset.ready='true';
      playPending=video.play().catch(()=>{
        if(video.paused) restorePoster();
      }).finally(()=>{playPending=undefined;});
    } else video.pause();
  };
  const toggle=make('button','banner-toggle');toggle.type='button';
  const updateToggle=()=>{toggle.textContent=wanted?'Ⅱ':'▶';toggle.setAttribute('aria-label',wanted?'Pause preview':'Play preview');};
  toggle.onclick=async()=>{wanted=!wanted;updateToggle();if(wanted&&!video.src){motionPose=await read(asset?.pose??clip.poses.after);video.src=asset?.video??clip.video;overlay.setPose(motionPose,clip.width,clip.height);fitOverlay();loaded=true;video.load();}sync();};
  updateToggle();if(settings.controls !== false) root.append(toggle);
  video.addEventListener('play',schedule);
  // Allow the queued callback to settle the final paused frame before stopping.
  video.addEventListener('seeked',()=>{
    if(!loaded) return;
    if(video.requestVideoFrameCallback) schedule();
    else { presentedTime=video.currentTime; draw(presentedTime); }
  });
  video.addEventListener('loadeddata',()=>{
    presentedTime=video.currentTime;
    if(loaded) draw(presentedTime);
    sync();
  });
  video.addEventListener('error',()=>{cancel(); restorePoster();});
  document.addEventListener('visibilitychange',sync);
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();}); observer.observe(root);
  // Do not download video/poses when opening directly at a lower section.
  await new Promise(resolve=>{
    const visibility=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)) { visibility.disconnect(); resolve(); }
    });
    visibility.observe(root);
  });
  // Preview and skeleton are already present; fetch motion and poses together.
  // Retain that preview on slow networks, autoplay denial, and reduced motion.
  if (!wanted) return;
  const poseReady=read(asset?.pose??clip.poses.after);
  video.src=asset?.video??clip.video; video.load();
  const pose=await poseReady; motionPose=pose;
  overlay.setPose(pose,clip.width,clip.height);fitOverlay(); loaded=true;
  draw(0);reveal(skeleton);sync();
}
