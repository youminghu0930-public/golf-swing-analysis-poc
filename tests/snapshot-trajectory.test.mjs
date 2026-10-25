import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotItems, trajectoryPoints } from '../snapshot-data.js';
const clips = [{ id: '0000', key: 'face-on-0000', frameCount: 30 }];
test('range snapshots use the inclusive end index and exactly the selected joint', () => {
  const [entry] = snapshotItems({'0000': [{range:[10,20],joint:'golf_club_head',message_box:{before:'Before message',after:'After message'}}]},clips);
  assert.equal(entry.frame,20);
  assert.deepEqual(entry.range,[10,20]);
  assert.deepEqual(entry.joints,['golf_club_head']);
  assert.equal(entry.explanations.golf_club_head.specialized,'After message');
  for (const range of [[20,10],[-1,4],[0,30],[1.5,5]]) assert.throws(()=>snapshotItems({'0000':[{range,joint:'golf_club_head'}]},clips));
});
test('trajectory opacity follows time and missing predictions preserve gaps', () => {
  const pose={joints:['golf_club_head'],pred:[[[1,2,1]],[[0,0,0]],[[5,6,1]]]};
  const points=trajectoryPoints(pose,'golf_club_head');
  assert.equal(points[0].opacity,.1);
  assert.equal(points[1],null);
  assert.equal(points[2].opacity,1);
  assert.deepEqual(trajectoryPoints(pose,'missing'),[null,null,null]);
  assert.equal(trajectoryPoints({joints:pose.joints,pred:[[[3,4,1]]]},'golf_club_head')[0].opacity,1);
});
test('a single zero-based highlight controls the message target', () => {
  const sample={range:[10,20],joint:'golf_club_head',highlight_index:14};
  const entry=snapshotItems({'0000':[sample]},clips)[0];
  assert.equal(entry.highlight_index,14);
  assert.equal(entry.frame,14);
  assert.deepEqual(entry.range,[10,20]);
  assert.equal(snapshotItems({'0000':[{range:[10,20],joint:'golf_club_head'}]},clips)[0].highlight_index,20);
  for (const value of [[14],9,21,14.5]) assert.throws(()=>snapshotItems({'0000':[{...sample,highlight_index:value}]},clips));
});
