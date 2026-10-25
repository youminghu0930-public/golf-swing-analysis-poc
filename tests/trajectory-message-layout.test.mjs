import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutTrajectoryMessages } from '../trajectory-message-layout.js';
import { segmentsCross, messageOccludes } from '../snapshot-callouts.js';
test('messages can swap sides to avoid crossing their opposite-ordered targets',()=>{
  const result=layoutTrajectoryMessages({width:560,height:440,sizes:[{width:160,height:36},{width:175,height:54}],
    targets:[[{x:330,y:230}],[{x:250,y:180}]],points:[{x:180,y:60},{x:400,y:360}],
    bones:[[{x:180,y:60},{x:330,y:230}],[{x:250,y:180},{x:380,y:360}]],obstacles:[{x:200,y:270,width:110,height:120}]});
  const a=result.routes[0][0].path,b=result.routes[1][0].path;
  assert.equal(segmentsCross(a[0],a[1],b[0],b[1]),false);
  assert.equal(messageOccludes(a[0],a[1],result.boxes[1]),false);
  assert.equal(messageOccludes(b[0],b[1],result.boxes[0]),false);
});
