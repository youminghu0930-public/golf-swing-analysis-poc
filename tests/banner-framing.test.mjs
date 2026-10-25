import test from 'node:test';
import assert from 'node:assert/strict';
import { trajectoryBounds } from '../banner-framing.js';
test('banner bounds use the full club trajectory horizontally and preserve the complete skeleton vertically', () => {
  assert.deepEqual(trajectoryBounds({joints:['nose','golf_club_head'],pred:[[[50,10],[-20,100]],[[55,15],[140,180]]]}),{left:-20,right:140,top:10,bottom:180});
});
test('missing and invalid club detections cannot distort banner bounds', () => {
  assert.deepEqual(trajectoryBounds({joints:['nose','golf_club_head'],pred:[[[50,10],[0,0]],[[55,15],[999,999,-1]]]}),{left:50,right:55,top:10,bottom:15});
});
