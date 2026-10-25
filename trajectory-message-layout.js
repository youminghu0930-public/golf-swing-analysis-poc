import { placeCallout, routeArrows, segmentsCross, messageOccludes } from './snapshot-callouts.js';
const segments = routes => routes.flatMap(route => route.path.slice(1).map((p,i)=>[route.path[i],p]));
const overlap = (a,b) => Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));

// Solve both messages together; model identity does not determine the side.
export function layoutTrajectoryMessages({width,height,sizes,targets,points,bones,obstacles=[]}) {
  const center = axis => targets.flat().reduce((sum,p)=>sum+p[axis],0)/Math.max(1,targets.flat().length);
  const candidates=[];
  for (const axis of ['x','y']) for (const reverse of [false,true]) for (const order of [[0,1],[1,0]]) {
    const boxes=[],placed=[],occupied=[...obstacles],extraBones=[...bones];
    let score=0;
    for (const i of order) {
      const low=Boolean(i)===reverse;
      const size=axis==='x'?'width':'height';
      const filter=rect=>low ? rect[axis]+rect[size]<=center(axis)-8 : rect[axis]>=center(axis)+8;
      const placement=placeCallout(width,height,sizes[i].width,sizes[i].height,targets[i],points,extraBones,occupied,null,filter);
      boxes[i]=placement.box; placed[i]=placement.routes;
      score+=placement.obstruction;
      occupied.push(placement.box);extraBones.push(...segments(placement.routes));
    }
    // Re-evaluate each connector against both final boxes and the other connector.
    for (const i of order) placed[i]=routeArrows(boxes[i],targets[i],[...bones,...segments(placed[1-i])],[...obstacles,boxes[1-i]]);
    const a=segments(placed[0]),b=segments(placed[1]);
    const crossing=a.some(([p,q])=>b.some(([r,s])=>segmentsCross(p,q,r,s)));
    const occlusion=a.some(([p,q])=>messageOccludes(p,q,boxes[1]))||b.some(([p,q])=>messageOccludes(p,q,boxes[0]));
    score+=Number(crossing)*1e9+Number(occlusion)*1e9+overlap(boxes[0],boxes[1])*1e8;
    score+=placed.flat().reduce((sum,route)=>sum+route.score,0);
    candidates.push({boxes,routes:placed,score});
  }
  return candidates.sort((a,b)=>a.score-b.score)[0];
}
