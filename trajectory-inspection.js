import { layoutTrajectoryMessages } from './trajectory-message-layout.js';
import { spotlightPoints } from './snapshot-data.js';
import { fullPoseConnections } from './pose-overlay.js';
import { clippedBone } from './pose-geometry.js';
import { trajectoryPoints } from './snapshot-data.js';
import { projectSnapshotPoint } from './snapshot-callouts.js';

// The two predictions share one frame selection and one inspection tooltip.
export function createTrajectoryInspection(viewport, panel, entry, copy, overlays) {
  const sides = ['before', 'after'];
  const points = sides.map(side => trajectoryPoints(entry.trajectories[side], entry.joints[0]));
  const messageTargets = new Set([(entry.highlight_index ?? entry.range[1]) - entry.range[0]]);
  const selected = new Set();
  let layoutKey, messageLayout;
  let hover = null, pinned = false, state = {zoom:1,x:0,y:0};
  const name = copy.jointNames[entry.joints[0]] || entry.joints[0].replaceAll('_', ' ');
  const tooltip = document.createElement('div');
  tooltip.className = 'pose-tooltip trajectory-tooltip'; tooltip.hidden = true;
  tooltip.setAttribute('role', 'status'); viewport.append(tooltip);
  const ns = 'http://www.w3.org/2000/svg';
  const pairLayer = document.createElementNS(ns, 'svg');
  pairLayer.classList.add('trajectory-pair-layer'); pairLayer.setAttribute('aria-hidden', 'true');
  viewport.append(pairLayer);

  const layers = sides.map(side => {
    const arrows = document.createElementNS(ns, 'svg');
    arrows.classList.add('snapshot-callout-arrows', `callouts-${side}`); arrows.setAttribute('aria-hidden', 'true');
    viewport.append(arrows);
    const rail = document.createElement('div');
    rail.className = `snapshot-callout-rail callouts-${side}`;
    const box = document.createElement('p'); box.className = 'snapshot-callout trajectory-message';
    box.textContent = entry.explanations?.[entry.joints[0]]?.[side === 'before' ? 'general' : 'specialized'] || copy[side];
    rail.append(box); panel.append(rail);
    return {arrows,rail,box};
  });
  const active = () => new Set([...messageTargets, ...selected, ...(hover === null ? [] : [hover])]);
  const project = point => projectSnapshotPoint([point.x,point.y], entry.width,entry.height,viewport.clientWidth,viewport.clientHeight,state);
  const visible = i => panel.dataset[i ? 'hideAfter' : 'hideBefore'] !== 'true';
  function update(next = state) {
    state = next;
    const width = viewport.clientWidth, height = viewport.clientHeight;
    const indices = active();
    const inspected = new Set([...selected, ...(hover === null ? [] : [hover])]);
    overlays.forEach(overlay => overlay.highlight?.(indices, inspected));
    pairLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    pairLayer.replaceChildren();
    const links = document.createElementNS(ns, 'g'), ends = document.createElementNS(ns, 'g');
    const scale = Math.min(width/entry.width,height/entry.height)*state.zoom;
    if (visible(0) && visible(1)) for (const index of indices) {
      if (!points[0][index] || !points[1][index]) continue;
      const pair = points.map(set=>project(set[index]));
      const markers = sides.map((side,i)=>viewport.querySelector(`.pose-overlay-${i} .trajectory-dot[data-frame="${entry.range[0]+index}"]`));
      if (markers.some(marker=>!marker)) continue;
      const radius = (Number(markers[0].getAttribute('r'))+Number(markers[0].getAttribute('stroke-width'))/2)*scale;
      const segment = clippedBone([pair[0].x,pair[0].y],[pair[1].x,pair[1].y],radius);
      if (segment) {
        const line = document.createElementNS(ns,'line');
        for (const [key,value] of Object.entries({x1:segment[0][0],y1:segment[0][1],x2:segment[1][0],y2:segment[1][1]})) line.setAttribute(key,value);
        links.append(line);
      }
      markers.forEach((marker,i)=>{
        const end = marker.cloneNode(false);
        end.removeAttribute('class'); end.removeAttribute('data-frame');
        end.setAttribute('cx',pair[i].x);end.setAttribute('cy',pair[i].y);
        end.setAttribute('r',Number(marker.getAttribute('r'))*scale);
        end.setAttribute('stroke-width',Number(marker.getAttribute('stroke-width'))*scale);
        ends.append(end);
      });
    }
    // Every connector is beneath both endpoints, above all trajectory graphics.
    pairLayer.append(links,ends);

    const all = points.flat().filter(Boolean).map(project);
    if (!all.length) return;
    const key=JSON.stringify([state,width,height]);
    const recalculate=key!==layoutKey;
    const bones=points.flatMap(set=>set.flatMap((p,i)=>p&&set[i-1]?[[project(set[i-1]),project(p)]]:[]));
    const bodyPoints=[], bodyBones=[], bodyAreas=[];
    for (const pose of Object.values(entry.occlusionPoses || {})) {
      bodyPoints.push(...spotlightPoints(pose,pose.joints.filter(name=>!name.startsWith('golf_club_'))).map(p=>project({x:p[0],y:p[1]})));
      for (const connection of fullPoseConnections()) {
        const ends=spotlightPoints(pose,connection);
        if (ends.length===2) bodyBones.push(ends.map(p=>project({x:p[0],y:p[1]})));
      }
      for (const names of [['left_shoulder','right_shoulder','left_hip','right_hip'],['nose','top_head','left_ear','right_ear']]) {
        const area=spotlightPoints(pose,names).map(p=>project({x:p[0],y:p[1]}));
        if (area.length<2) continue;
        const x=Math.min(...area.map(p=>p.x))-10,y=Math.min(...area.map(p=>p.y))-10;
        bodyAreas.push({x,y,width:Math.max(...area.map(p=>p.x))-x+10,height:Math.max(...area.map(p=>p.y))-y+10});
      }
    }
    const sizes=layers.map(({rail,box})=>{
      rail.style.top=`${viewport.offsetTop}px`;
      box.style.width='max-content';
      box.style.maxWidth=`${Math.min(175,Math.max(85,width*(width < 400 ? .43 : .31)))}px`;
      return {width:box.offsetWidth,height:box.offsetHeight};
    });
    const targets=points.map(set=>[...messageTargets].map(index=>set[index]).filter(Boolean).map(project));
    if (recalculate || !messageLayout) messageLayout=layoutTrajectoryMessages({width,height,sizes,targets,
      points:[...all,...bodyPoints],bones:[...bones,...bodyBones],obstacles:bodyAreas});
    layers.forEach(({arrows,box},i)=>{
      const position=messageLayout.boxes[i];
      box.style.left=`${position.x}px`;box.style.top=`${position.y}px`;
      arrows.setAttribute('viewBox',`0 0 ${width} ${height}`);arrows.replaceChildren();
      for (const route of messageLayout.routes[i]) {
        const line=document.createElementNS(ns,'path');
        line.setAttribute('d',route.path.map((p,j)=>`${j?'L':'M'}${p.x} ${p.y}`).join(' '));
        line.classList.add('trajectory-connector');arrows.append(line);
      }
    });
    layoutKey=key;
    const index=hover ?? (pinned ? [...selected].at(-1) : null);
    const pair=index===null ? [] : points.flatMap((set,i)=>visible(i)&&set[index]?[project(set[index])]:[]);
    tooltip.hidden=!pair.length;
    if (pair.length) {
      tooltip.textContent=`${name} - Frame ${entry.range[0]+index+1}`;
      const x=pair.reduce((sum,p)=>sum+p.x,0)/pair.length;
      tooltip.style.left=`${Math.max(tooltip.offsetWidth/2+8,Math.min(width-tooltip.offsetWidth/2-8,x))}px`;
      tooltip.style.top=`${Math.max(8,Math.min(height-tooltip.offsetHeight-8,Math.min(...pair.map(p=>p.y))-tooltip.offsetHeight-16))}px`;
    }
  }
  function hit(event) {
    const rect=viewport.getBoundingClientRect();
    const x=event.clientX-rect.left,y=event.clientY-rect.top;
    let nearest=null,distance=18;
    points.forEach((set,i)=>{
      if (!visible(i)) return;
      set.forEach((point,index)=>{
        if (!point) return;
        const p=project(point),d=Math.hypot(p.x-x,p.y-y);
        if (d<distance) {nearest=index;distance=d;}
      });
    });
    return nearest;
  }
  viewport.addEventListener('pointermove',event=>{
    if (event.buttons || viewport.dataset.dragging==='true' || event.pointerType==='touch') return;
    hover=hit(event);viewport.style.cursor=hover===null?'':'pointer';update();
  });
  viewport.addEventListener('pointerleave',()=>{hover=null;update();});
  viewport.addEventListener('click',event=>{
    if (viewport.dataset.dragging==='true') return;
    const index=hit(event);
    if (index===null) {selected.clear();pinned=false;hover=null;update();return;}
    const remove = selected.has(index) && (event.shiftKey || selected.size === 1);
    if (!event.shiftKey) selected.clear();
    if (remove) selected.delete(index); else selected.add(index);
    pinned=selected.size>0;hover=null;update();
  });
  return update;
}
