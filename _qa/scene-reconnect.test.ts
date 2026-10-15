import assert from 'node:assert/strict';
import {test} from 'node:test';
import {markSceneReconnect,takeSceneReconnect} from '../src/account-link/scene-reconnect';

const id='7bf4cd89-ccdf-4112-ae1b-62aeaf762a82';
const memory=()=>{
 const values=new Map<string,string>();
 return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}};
};

test('a scene reconnect resumes only the same journey once',()=>{
 const storage=memory();
 assert.equal(markSceneReconnect(storage,id,1000),true);
 assert.equal(takeSceneReconnect(storage,1001),id);
 assert.equal(takeSceneReconnect(storage,1002),null);
});

test('stale and malformed reconnect markers cannot auto resume',()=>{
 const storage=memory();
 assert.equal(markSceneReconnect(storage,'other',1000),false);
 assert.equal(takeSceneReconnect(storage,1001),null);
 assert.equal(markSceneReconnect(storage,id,1000),true);
 assert.equal(takeSceneReconnect(storage,61001),null);
 assert.equal(takeSceneReconnect(storage,61002),null);
});
