import test from 'node:test';
import assert from 'node:assert/strict';
import { taperedOutline, smoothContour } from '../trajectory-shape.js';
test('ribbons widen from tail to head and split at missing predictions',()=>{
  const points=[{x:10,y:10,opacity:.1},{x:20,y:10,opacity:1}];
  const [shape]=taperedOutline(points,10);
  assert.ok(Math.max(...shape.map(p=>p.y)) > 19);
  assert.ok(Math.min(...shape.map(p=>p.y)) < 1);
  assert.ok(shape.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  assert.equal(taperedOutline([points[0],null,points[1]],10).length,2);
});

test('spotlight corners are rounded without overshooting jumpy input', () => {
  const outline=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
  const result=smoothContour(outline);
  assert.ok(result.length>outline.length);
  assert.ok(result.every(p=>p.x>=0 && p.x<=100 && p.y>=0 && p.y<=100));
  assert.ok(!result.some(p=>p.x===100 && p.y===0));
  assert.deepEqual(outline[1],{x:100,y:0});
});
