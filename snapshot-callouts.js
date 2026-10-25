import { spotlightPoints } from './snapshot-data.js';
import { poseConnections } from './pose-overlay.js';

export function projectSnapshotPoint(point, sourceWidth, sourceHeight, width, height, state) {
  const fit = Math.min(width/sourceWidth, height/sourceHeight);
  return { x: width/2+(point[0]-sourceWidth/2)*fit*state.zoom+state.x*width,
    y: height/2+(point[1]-sourceHeight/2)*fit*state.zoom+state.y*height };
}
const inside = (point, box, padding = 0) => point.x >= box.x-padding && point.x <= box.x+box.width+padding && point.y >= box.y-padding && point.y <= box.y+box.height+padding;
export function segmentsCross(a, b, c, d) {
  const orient = (p, q, r) => (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  return orient(a,b,c)*orient(a,b,d) < 0 && orient(c,d,a)*orient(c,d,b) < 0;
}
const edges = box => {
  const a = { x:box.x,y:box.y }, b={x:box.x+box.width,y:box.y}, c={x:b.x,y:box.y+box.height}, d={x:a.x,y:c.y};
  return [[a,b],[b,c],[c,d],[d,a]];
};
const overlaps = (a,b) => Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
export function messageOccludes(start, end, box) {
  // Test the open interior, so merely attaching to an edge does not count.
  let near=0, far=1;
  for (const [axis,size] of [['x','width'],['y','height']]) {
    const low=box[axis]+.01, high=box[axis]+box[size]-.01, delta=end[axis]-start[axis];
    if (Math.abs(delta)<1e-9) { if (start[axis]<=low || start[axis]>=high) return false; }
    else {
      const a=(low-start[axis])/delta,b=(high-start[axis])/delta;
      near=Math.max(near,Math.min(a,b)); far=Math.min(far,Math.max(a,b));
      if (far<=near) return false;
    }
  }
  return far-near>1e-8;
}
export function routeArrow(box, target, bones, obstacles = []) {
  return routeArrows(box,[target],bones,obstacles)[0];
}
export function routeArrows(box, targets, bones, obstacles = []) {
  const starts = [{x:box.x+box.width/2,y:box.y},{x:box.x+box.width/2,y:box.y+box.height},{x:box.x,y:box.y+box.height/2},{x:box.x+box.width,y:box.y+box.height/2}];
  return starts.map(start=>{
    const routes=targets.map(target=>{
      const occluded=[box,...obstacles].some(rect=>messageOccludes(start,target,rect));
      const distance=Math.hypot(target.x-start.x,target.y-start.y);
      const crossings=bones.filter(([a,b])=>segmentsCross(start,target,a,b)).length;
      return {path:[start,target],occluded,crossings,distance,score:Number(occluded)*1000000+crossings*50000+distance};
    });
    return {routes,occluded:routes.filter(route=>route.occluded).length,crossings:routes.reduce((sum,route)=>sum+route.crossings,0),distance:routes.reduce((sum,route)=>sum+route.distance,0)};
  }).sort((a,b)=>a.occluded-b.occluded || a.crossings-b.crossings || a.distance-b.distance)[0].routes;
}
export function placeCallout(width, height, boxWidth, boxHeight, targets, points, bones, occupied = [], spotlightRadius = null, candidateFilter = null) {
  const w = Math.min(boxWidth,width-16), h = Math.min(boxHeight,height-16);
  const candidates = [];
  const add = (x,y) => candidates.push({ x: Math.max(8,Math.min(width-w-8,x)), y: Math.max(8,Math.min(height-h-8,y)), width:w,height:h });
  if (spotlightRadius !== null) {
    // Keep the box center exactly on a target's spotlight circumference.
    for (const target of targets) for (let step=0;step<360;step++) {
      const angle=step*Math.PI/180;
      const x=target.x+Math.cos(angle)*spotlightRadius-w/2;
      const y=target.y+Math.sin(angle)*spotlightRadius-h/2;
      if (x>=8 && y>=8 && x+w<=width-8 && y+h<=height-8) candidates.push({x,y,width:w,height:h});
    }
  }
  // Offscreen targets or oversized boxes may leave no visible circle position.
  if (!candidates.length) {
  // Search close to each target first, then across the viewport for clear space.
  for (const target of targets) {
    for (const gap of [14,24,40,64]) {
      for (const x of [target.x-w-gap,target.x-w/2,target.x+gap]) {
        for (const y of [target.y-h-gap,target.y-h/2,target.y+gap]) add(x,y);
      }
    }
  }
  for (let x=8;x<=width-w-8;x+=12) for (let y=8;y<=height-h-8;y+=12) add(x,y);
  add(width-w-8,height-h-8);
  }
  const filtered = candidateFilter ? candidates.filter(candidateFilter) : candidates;
  return (filtered.length ? filtered : candidates).map(box => {
    const padded = { x:box.x-10,y:box.y-10,width:box.width+20,height:box.height+20 };
    const routes = routeArrows(box,targets,bones,occupied);
    const obstruction = points.filter(point=>inside(point,box,12)).length*100000
      + bones.filter(([a,b])=>inside(a,padded)||inside(b,padded)||messageOccludes(a,b,padded)).length*100000
      + occupied.reduce((sum,other)=>sum+overlaps(padded,other)*10000,0);
    const arrowScore = routes.reduce((sum,route)=>sum+route.score,0);
    return {box,routes,obstruction,arrowScore,score:obstruction+arrowScore};
  }).sort((a,b)=>a.obstruction-b.obstruction || a.arrowScore-b.arrowScore)[0];
}

export function createSnapshotCallouts(viewport, panel, entry, side, sharedOccupied = null) {
  const occupied = sharedOccupied || [];
  const pose = entry[side], key = side === 'before' ? 'general' : 'specialized';
  const groups = new Map();
  for (const name of entry.joints) {
    const text = entry.explanations?.[name]?.[key]?.trim();
    if (!text || !spotlightPoints(pose,[name]).length) continue;
    if (!groups.has(text)) groups.set(text,[]);
    groups.get(text).push(name);
  }
  if (!groups.size) return () => { if (side === 'before' || !sharedOccupied) occupied.length = 0; };
  const ns = 'http://www.w3.org/2000/svg';
  const arrows = document.createElementNS(ns,'svg'); arrows.classList.add('snapshot-callout-arrows', `callouts-${side}`); arrows.setAttribute('aria-hidden','true');
  viewport.append(arrows);
  const rail = document.createElement('div'); rail.className=`snapshot-callout-rail callouts-${side}`; panel.append(rail);
  const items = [...groups].map(([text,names])=>{
    const box = document.createElement('p'); box.className='snapshot-callout'; box.textContent=text; rail.append(box);
    return {box,names};
  });
  return state => {
    const width=viewport.clientWidth,height=viewport.clientHeight;
    const project = point=>projectSnapshotPoint(point,entry.width,entry.height,width,height,state);
    const points=['before','after'].flatMap(model => entry[model] ? spotlightPoints(entry[model],entry[model].joints.filter(name => name.startsWith('golf_club_'))) : []).map(project);
    const bones=['before','after'].flatMap(model => {
      const modelPose=entry[model];
      return modelPose ? poseConnections(model==='before'?0:1).flatMap(names=>{
        const ends=spotlightPoints(modelPose,names); return ends.length===2?[[project(ends[0]),project(ends[1])]]:[];
      }) : [];
    });
    // Below-image notes are the fallback when there is too little room to avoid the golfer.
    const external=width<250;
    rail.classList.toggle('is-external',external);
    rail.style.top=external?'':`${viewport.offsetTop}px`;
    arrows.setAttribute('viewBox',`0 0 ${width} ${height}`); arrows.replaceChildren();
    if (side === 'before' || !sharedOccupied) occupied.length = 0;
    items.forEach(({box,names},index)=>{
      const targets=spotlightPoints(pose,names).map(project);
      box.style.width=external?'100%':'max-content';
      box.style.maxWidth=`${external?width:Math.min(200,width*.45)}px`;
      box.style.padding='5px 8px';
      const measured={width:box.offsetWidth,height:box.offsetHeight};
      let placement;
      if (external) {
        box.style.left='';box.style.top='';
        const anchor={x:width*(index+1)/(items.length+1),y:height-2};
        placement={routes:targets.map(target=>({path:[anchor,target]}))};
      } else {
        placement=placeCallout(width,height,measured.width,measured.height,targets,points,bones,occupied, Math.max(entry.width,entry.height)/16 * Math.min(width/entry.width,height/entry.height) * state.zoom);
        occupied.push(placement.box); box.style.left=`${placement.box.x}px`;box.style.top=`${placement.box.y}px`;
      }
      for (const {path} of placement.routes) {
        const line=document.createElementNS(ns,'path'); line.setAttribute('d',path.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '));arrows.append(line);
        const end=path.at(-1),previous=path.at(-2),angle=Math.atan2(end.y-previous.y,end.x-previous.x);
        const head=document.createElementNS(ns,'path');
        head.setAttribute('d',`M${end.x-8*Math.cos(angle-.45)} ${end.y-8*Math.sin(angle-.45)} L${end.x} ${end.y} L${end.x-8*Math.cos(angle+.45)} ${end.y-8*Math.sin(angle+.45)}`);arrows.append(head);
      }
    });
  };
}
