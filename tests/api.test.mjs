import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi } from './route-harness.mjs';
import { ownerCookie, volunteerCookie } from './auth-helper.mjs';
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys = ON');applyMigrations(sql);
const api=await loadApi(sql);
// Học viên dùng header danh tính nền tảng; quản trị viên và tình nguyện viên dùng cookie phiên thật (FR-AUTH).
function request(path,id,email,body,origin='https://site.test',cookie){const headers={};if(id){headers['oai-authenticated-user-id']=id;headers['oai-authenticated-user-email']=email}if(cookie)headers.cookie=cookie;if(body!==undefined){headers.origin=origin;headers['Content-Type']='application/json'}return new Request('https://site.test/api/'+path,{method:body===undefined?'GET':'POST',headers,...(body!==undefined?{body:JSON.stringify(body)}:{})})}
const get=(p,id,email,cookie)=>api.GET(request(p,id,email,undefined,undefined,cookie));const post=(p,id,email,b,o,cookie)=>api.POST(request(p,id,email,b,o,cookie));
const OWNER=await ownerCookie(api);const V=await volunteerCookie(api,'v@test.test');
assert.equal((await get('dashboard')).status,403);assert.equal((await get('me')).status,200);assert.equal((await post('progress',null,null,{})).status,401);assert.equal((await post('progress','a','a@test',{},'https://evil.test')).status,403);
const a=await (await get('me','a','a@test')).json(),b=await(await get('me','b','b@test')).json();assert.notEqual(a.code,b.code);
assert.equal((await post('progress','a','a@test',{code:a.code,read:[0],done:[0],scores:{0:1}})).status,200);
await post('progress','a','a@test',{code:a.code,read:[1],done:[],scores:{}});
assert.equal((await post('progress','b','b@test',{code:a.code,read:[0],done:[],scores:{}})).status,409);
let data=await(await get('me','a','a@test')).json();assert.equal(data.progress.length,2);assert.equal(data.progress.find(p=>p.lesson===0).done,1);assert.equal((await(await get('me','b','b@test')).json()).progress.length,0);
assert.equal((await post('progress','a','a@test',{read:[20],done:[],scores:{}})).status,400);
assert.equal((await post('staff','a','a@test',{email:'v@test.test'})).status,403);
assert.equal((await post('staff',null,null,{email:'v@test.test'},undefined,OWNER)).status,200);
assert.equal((await get('dashboard',null,null,V)).status,403);
assert.equal((await post('assessment',null,null,{client_id:'api-test-0001',code:a.code,phase:'Trước học',scores:[0,1,2,3,null],observed:true},undefined,V)).status,200);
assert.equal((await post('assessment','b','b@test',{client_id:'api-test-0002',code:a.code,phase:'Sau học',scores:[3,3,3,3,3],observed:true})).status,403);
assert.equal((await post('assessment',null,null,{client_id:'api-test-0003',code:a.code,phase:'Sau học',scores:[4,3,3,3,3],observed:true},undefined,V)).status,400);
const dash=await(await get('dashboard',null,null,OWNER)).json();assert.equal(dash.assessments.length,1);assert.equal(dash.assessments[0].code,a.code);assert.equal((await get('videos')).status,200);assert.equal((await get('video/1')).status,404);assert.equal((await post('upload-video',null,null,{},undefined,V)).status,403);
await post('staff',null,null,{email:'v@test.test',remove:true},undefined,OWNER);assert.equal((await post('assessment',null,null,{client_id:'api-test-0004',code:a.code,phase:'Trước học',scores:[0,0,0,0,0],observed:true},undefined,V)).status,403);
console.log('PASS: anonymous access, authentication, CSRF, account isolation, cross-device progress merge, validation, staff grant/revoke, observation permissions and dashboard');
