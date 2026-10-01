import assert from 'node:assert/strict';
const base=process.env.API_BASE_URL;if(!base)throw Error('Set API_BASE_URL to a local test server.');
async function req(path,method='GET',body){const r=await fetch(new URL(path,base),{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:r.status===204?null:await r.json()};}
let trip;
try{
const t=await req('/api/trips','POST',{title:'Disposable independent note contract',startDate:'2026-10-01',endDate:'2026-10-03',timezone:'Asia/Singapore'});assert.equal(t.status,201);trip=t.body.id;
const create=body=>req('/api/travel-objects','POST',{tripId:trip,type:'activity',title:'Event',date:'2026-10-01',endDate:'2026-10-01',isAllDay:false,...body});
const a=await create({}),b=await create({title:'Second'});assert.equal(a.status,201);assert.equal(b.status,201);
const n=await create({kind:'note',type:'unclassified',title:'Note',noteBody:'',dayOrder:1});assert.equal(n.status,201);assert.equal(n.body.dayOrder,1);assert.equal(n.body.kind,'note');assert.equal(n.body.noteBody,'');
const path=`/api/travel-objects/${n.body.id}`;
assert.equal((await req(path,'PATCH',{title:'Reminder',noteBody:'Bring cash'})).status,200);
for(const patch of [{startTime:'10:00'},{cost:4},{isAllDay:true},{kind:'event'},{endDate:'2026-10-02'}])assert.equal((await req(path,'PATCH',patch)).status,400);
assert.equal((await req(`/api/travel-objects/${a.body.id}`,'DELETE')).status,204);
assert.equal((await req(path)).body.noteBody,'Bring cash');
assert.equal((await req(path,'PATCH',{date:'2026-10-02'})).status,200);assert.equal((await req(path)).body.endDate,'2026-10-02');
assert.equal((await req(path,'DELETE')).status,204);assert.equal((await req(`/api/travel-objects/${b.body.id}`)).status,200);
console.log('PASS: immediate blank creation at gap, inline edits, validation, independent move/delete and parent deletion retention.');
}finally{if(trip)await req(`/api/trips/${trip}`,'DELETE');}
