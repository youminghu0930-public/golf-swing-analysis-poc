export const videoTrailFrameCount = frameCount => Math.max(1, Math.round(frameCount * .3));

import { overlayTransform } from './pose-geometry.js';
import { trajectoryPoints } from './snapshot-data.js';

// Ten preceding frames plus the currently displayed frame.
export function bannerTrailPoints(pose, frame, historyFrames = 10, joint = 'golf_club_head') {
  const history = pose.history || [];
  const sequence = [...history, ...pose.pred.slice(0, frame + 1)];
  return trajectoryPoints({joints:pose.joints,pred:sequence.slice(-historyFrames-1)},joint);
}
export function createBannerTrail(viewport, width, height, {historyFrames = 10, color = '#a2d8b9', lineScale = .8} = {}) {
  const svg=(tag,attributes={})=>{
    const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
    return node;
  };
  const layer=svg('svg',{class:'pose-overlay banner-club-trail',viewBox:`0 0 ${width} ${height}`,'aria-hidden':'true','data-ready':'true'});
  const geometry=svg('g');layer.append(geometry);viewport.insertBefore(layer,viewport.querySelector('.pose-overlay'));
  const radius=Math.max(width,height)/190;
  return {
    render(pose,frame,joint = 'golf_club_head') {
      geometry.replaceChildren();
      for (const name of Array.isArray(joint) ? joint : [joint]) {
      let previous;
      for(const point of bannerTrailPoints(pose,frame,historyFrames,name)) {
        if(point&&previous) geometry.append(svg('line',{x1:previous.x,y1:previous.y,x2:point.x,y2:point.y,stroke:color,'stroke-width':radius*lineScale,'stroke-linecap':'round',opacity:point.opacity}));
        if(point)geometry.append(svg('circle',{cx:point.x,cy:point.y,r:radius*.65,fill:color,opacity:point.opacity}));
        previous=point;
      }
      }
    },
    clear() { geometry.replaceChildren(); },
    remove() { layer.remove(); },
    setTransform(state) {geometry.setAttribute('transform',overlayTransform(width,height,viewport.clientWidth,viewport.clientHeight,state));}
  };
}
