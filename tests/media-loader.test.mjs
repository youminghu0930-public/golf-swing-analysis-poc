import test from 'node:test';
import assert from 'node:assert/strict';
import {loadVideoFrame} from '../media-loader.js';
class Video extends EventTarget {
 readyState=0; src=''; pauses=0; loads=0;
 pause(){this.pauses++;}
 play(){return Promise.reject(new Error('Autoplay blocked'));}
 load(){this.readyState=0;this.loads++;if(this.src.startsWith('blob:'))queueMicrotask(()=>{this.readyState=2;this.dispatchEvent(new Event('canplay'));});}
}
test('canplay completes automatic loading even when loadeddata is absent and autoplay is blocked',async()=>{
 const video=new Video();const done=loadVideoFrame(video,'swing.mp4');
 video.readyState=2;video.dispatchEvent(new Event('canplay'));await done;
 assert.equal(video.preload,'auto');assert.equal(video.pauses,1);
});
test('stalled metadata automatically recovers through a fetched video without a tap',async()=>{
 const video=new Video();let local;
 await loadVideoFrame(video,'swing.mp4',{fallbackDelay:0,onBlob:url=>{local=url;},fetchMedia:async()=>({ok:true,blob:async()=>new Blob(['video'])})});
 assert.equal(video.loads,2);assert.ok(local.startsWith('blob:'));URL.revokeObjectURL(local);
});
test('switching clips aborts pending automatic loading',async()=>{
 const video=new Video(),controller=new AbortController();
 const done=loadVideoFrame(video,'swing.mp4',{signal:controller.signal});controller.abort();
 await assert.rejects(done,{name:'AbortError'});assert.equal(video.pauses,1);
});
