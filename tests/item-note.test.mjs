import assert from "node:assert/strict";
import test from "node:test";
import { eventItems, weekDropPositions } from "../lib/note-domain.ts";
import { readEntryKind, readNoteBody, readNoteTitle, validateNoteInput } from "../lib/note-validation.ts";
import { weekFlexibleDropOrder, sortDayDisplayItems, normalizeAfterScheduleChange } from "../lib/schedule-order.ts";
import { createTripIcs } from "../lib/ics-export.ts";
const date='2026-10-01';
function item(id,dayOrder,kind='event',startTime=null){return {id,tripId:'trip',title:id,noteBody:kind==='note'?'text':null,kind,date,endDate:date,startTime,endTime:startTime?'11:00':null,isAllDay:false,dayOrder,createdAt:'2026-10-01T00:00:00Z'};}
test('notes allow immediate blank creation and bounded inline content',()=>{
 assert.equal(readEntryKind(undefined),'event');assert.equal(readEntryKind('note'),'note');assert.throws(()=>readEntryKind('hotel'));
 assert.equal(readNoteBody(''),'');assert.equal(readNoteTitle(''),'Note');assert.equal(readNoteBody('  text\n'),'  text\n');
 assert.throws(()=>readNoteBody(null));assert.equal(readNoteBody('x'.repeat(500)).length,500);assert.throws(()=>readNoteBody('x'.repeat(501)));
 validateNoteInput({kind:'note',date,noteBody:'',dayOrder:2});
 for(const invalid of [{travelObjectId:'parent'},{startTime:'09:00'},{endTime:'10:00'},{isAllDay:true},{cost:null},{type:'hotel'}])assert.throws(()=>validateNoteInput(invalid));
});
test('Week omits note visibility while drop indices include hidden notes',()=>{
 const entries=[item('first',0),item('note-a',1,'note'),item('note-b',2,'note'),item('second',3),item('fixed',4,'event','10:00')];
 assert.deepEqual(eventItems(entries).map(i=>i.id),['first','second','fixed']);
 assert.equal(weekDropPositions(entries,date).get('second'),3);
 assert.equal(weekFlexibleDropOrder(entries,date,'09:00'),4);
 assert.equal(weekFlexibleDropOrder(entries,date,'12:00'),5);
 assert.deepEqual(sortDayDisplayItems(entries).map(i=>i.id),entries.map(i=>i.id));
 assert.equal(eventItems([item('only-note',0,'note')]).length,0);
});
test('fixed-time changes keep flexible notes in their existing slots',()=>{
 const entries=[item('later',0,'event','10:00'),item('note',1,'note'),item('earlier',2,'event','09:00')];
 assert.deepEqual(normalizeAfterScheduleChange(entries).map(({item:i,dayOrder})=>[i.id,dayOrder]),[['earlier',0],['note',1],['later',2]]);
});
test('notes are omitted from calendar exports',()=>{
 const ics=createTripIcs({id:'trip',title:'Trip',timezone:'Asia/Singapore'},[item('event',0),item('note',1,'note')]);
 assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,1);assert.doesNotMatch(ics,/UID:note@/);
});
