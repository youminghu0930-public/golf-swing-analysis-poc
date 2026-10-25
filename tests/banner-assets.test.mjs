import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBanner} from '../scripts/banner-assets.mjs';
test('a wrong banner view reports the matching clip rather than silently hiding the banner',()=>{
 assert.throws(()=>prepareBanner('/unused',[{id:'0024',key:'down-the-line-0024'}],{video:'face-on-0024'}),/Available matching clip: down-the-line-0024/);
});
test('ambiguous and missing enabled banner selections fail clearly',()=>{
 assert.throws(()=>prepareBanner('/unused',[{id:'0024',key:'face-on-0024'},{id:'0024',key:'down-the-line-0024'}],{video:'0024'}),/found 2/);
 assert.throws(()=>prepareBanner('/unused',[],{video:'face-on-9999'}),/found 0/);
});
test('disabled banners need no generated assets',()=>{
 assert.equal(prepareBanner('/unused',[],{enabled:false,video:'missing'}),null);
});
