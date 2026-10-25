import test from 'node:test';
import assert from 'node:assert/strict';
import { bannerTrailPoints, videoTrailFrameCount } from '../banner-trail.js';
test('banner trail contains the previous ten frames and current point with time-based fading',()=>{
 const pose={joints:['golf_club_head'],pred:Array.from({length:15},(_,i)=>[[i+1,20,1]])};
 const points=bannerTrailPoints(pose,12);
 assert.equal(points.length,11);assert.equal(points[0].x,3);assert.equal(points.at(-1).x,13);
 assert.equal(points[0].opacity,.1);assert.equal(points.at(-1).opacity,1);
});
test('trimmed banners retain pre-roll history without changing current-frame indices',()=>{
 const pose={joints:['golf_club_head'],history:[[[1,20,1]],[[2,20,1]]],pred:[[[3,20,1]],[[4,20,1]]]};
 assert.deepEqual(bannerTrailPoints(pose,0).map(p=>p.x),[1,2,3]);
 assert.equal(bannerTrailPoints(pose,1).at(-1).x,4);
});
test('video trails follow the requested joint over twenty previous frames',()=>{
 const pose={joints:['golf_club_head','left_wrist'],pred:Array.from({length:30},(_,i)=>[[i+1,10,1],[100+i,20,1]])};
 const points=bannerTrailPoints(pose,25,20,'left_wrist');
 assert.equal(points.length,21);assert.equal(points[0].x,105);assert.equal(points.at(-1).x,125);
 assert.equal(points[0].opacity,.1);assert.equal(points.at(-1).opacity,1);
});

test('video trail history is thirty percent of its frame count',()=>{
 assert.equal(videoTrailFrameCount(318),95);assert.equal(videoTrailFrameCount(200),60);assert.equal(videoTrailFrameCount(1),1);
});
