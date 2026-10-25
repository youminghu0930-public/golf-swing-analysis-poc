// Round only the spotlight silhouette; prediction dots keep their exact coordinates.
export function smoothContour(contour, passes = 3) {
  let result = contour;
  for (let pass = 0; pass < passes; pass++) {
    result = result.flatMap((a, i) => {
      const b = result[(i + 1) % result.length];
      return [{x: .75*a.x + .25*b.x, y: .75*a.y + .25*b.y},
        {x: .25*a.x + .75*b.x, y: .25*a.y + .75*b.y}];
    });
  }
  return result;
}

// Continuous variable-width ribbons, with round caps and no stacked disc edges.
export function taperedOutline(points, maxRadius) {
  const runs=[];
  let run=[];
  for (const point of [...points,null]) {
    if (point) run.push(point);
    else if (run.length) { runs.push(run);run=[]; }
  }
  return runs.map(run=>{
    const left=[],right=[];
    let tangent={x:1,y:0};
    const tangents=[];
    run.forEach((p,i)=>{
      const a=run[Math.max(0,i-1)],b=run[Math.min(run.length-1,i+1)];
      const length=Math.hypot(b.x-a.x,b.y-a.y);
      if (length) tangent={x:(b.x-a.x)/length,y:(b.y-a.y)/length};
      tangents.push(tangent);
      const radius=maxRadius*p.opacity;
      left.push({x:p.x-tangent.y*radius,y:p.y+tangent.x*radius});
      right.push({x:p.x+tangent.y*radius,y:p.y-tangent.x*radius});
    });
    const cap=(p,t,start)=>Array.from({length:13},(_,i)=>{
      const angle=Math.atan2(t.y,t.x)+(start? -Math.PI/2 : Math.PI/2)-i*Math.PI/12;
      return {x:p.x+Math.cos(angle)*maxRadius*p.opacity,y:p.y+Math.sin(angle)*maxRadius*p.opacity};
    });
    return smoothContour([...left,...cap(run.at(-1),tangents.at(-1),false),...right.reverse(),...cap(run[0],tangents[0],true)]);
  });
}
