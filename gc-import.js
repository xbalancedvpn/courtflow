import {GC_SKILLS,parseGCList,planGCImport,normalizePlayerName,nameKey} from './gc-import-core.js';
export function initGCImport({db,state,load,notify,dialogs,getEvent,escapeHTML}){
 const el=document.createElement('section');el.id='gcImportPanel';el.className='card';el.innerHTML='<h2>Import Players from GC</h2><p class="hint small">Paste a numbered Messenger/group-chat list. Preview and edit names before registering them to the selected event. Registered ≠ Checked In.</p><label>Paste player list<textarea id="gcPaste" rows="7" placeholder="1. Juan Dela Cruz&#10;2. Maria Santos - ADV&#10;3. Pedro Reyes"></textarea></label><div class="stack"><label>Default skill<select id="gcDefault">'+GC_SKILLS.map(s=>'<option value="'+s.value+'" '+(s.value===3?'selected':'')+'>'+s.code+' · '+s.label+'</option>').join('')+'</select></label><button id="gcPreview">Preview Names</button></div><p id="gcNotice" class="hint small"></p><div id="gcPreviewRows"></div><div class="stack"><label><input type="checkbox" id="gcCheckin"> Also check in imported players now (default OFF)</label><button id="gcCommit" hidden>Import to selected event</button></div>';
 document.getElementById('ewPane-players')?.append(el);
 const $=id=>el.querySelector('#'+id);let rows=[];
 function event(){return state.sessions.find(s=>s.id===getEvent())}
 function preview(){
  const s=event();if(!s){notify('Select an event first');return}
  const parsed=parseGCList($('gcPaste').value,{defaultSkill:Number($('gcDefault').value)});
  rows=planGCImport(parsed.rows,state.players,state.attendance,s.id);
  const warnings=[];
  if(parsed.ignored.length)warnings.push(parsed.ignored.length+' non-name lines skipped');
  if(parsed.duplicates.length)warnings.push(parsed.duplicates.length+' duplicate pasted names skipped');
  if(parsed.exceedsLimit)warnings.push('Maximum 100 names per import');
  $('gcNotice').textContent=rows.length+' unique names · '+warnings.join(' · ');
  $('gcPreviewRows').innerHTML=rows.map((r,i)=>'<div class="rank-row" data-row="'+i+'"><input class="gc-name" aria-label="Player name" value="'+escapeHTML(r.name)+'"><select class="gc-skill" aria-label="Skill">'+GC_SKILLS.map(x=>'<option value="'+x.value+'" '+(x.value===r.skill?'selected':'')+'>'+x.code+'</option>').join('')+'</select><span class="gc-status hint small">'+r.status.toUpperCase()+'</span><button class="secondary gc-remove" title="Remove row">✕</button></div>').join('');
  $('gcPreviewRows').querySelectorAll('.gc-name,.gc-skill').forEach(e=>e.oninput=update);
  $('gcPreviewRows').querySelectorAll('.gc-remove').forEach(b=>b.onclick=()=>{const i=Number(b.closest('[data-row]').dataset.row);rows.splice(i,1);drawRows()});
  $('gcCommit').hidden=!rows.length;
  if(parsed.exceedsLimit)$('gcCommit').disabled=true;else $('gcCommit').disabled=false;
 }
 function update(){
  const s=event();if(!s)return;
  const nodes=[...$('gcPreviewRows').querySelectorAll('[data-row]')];
  rows=planGCImport(nodes.map((node,i)=>({...rows[i],name:node.querySelector('.gc-name').value,skill:Number(node.querySelector('.gc-skill').value)})),state.players,state.attendance,s.id);
  nodes.forEach((node,i)=>node.querySelector('.gc-status').textContent=rows[i].status.toUpperCase());
 }
 function drawRows(){
  const raw=rows.map(r=>r.name).join('\n');$('gcPaste').value=raw;preview();
 }
 $('gcPreview').onclick=preview;
 $('gcCommit').onclick=async()=>{
  if(!rows.length)return;
  update();
  const blocked=rows.filter(r=>['invalid','duplicate','ambiguous','inactive'].includes(r.status));
  if(blocked.length)return notify('Resolve '+blocked.length+' invalid, duplicate, ambiguous or inactive player(s) before import');
  if(rows.length>100)return notify('Limit: 100 names per import');
  const sid=getEvent();if(!sid||!event())return notify('Select an event first');
  const todo=rows.filter(r=>r.status!=='registered');
  if(!todo.length)return notify('All players are already registered for this event');
  const checkin=$('gcCheckin').checked;
  if(!await dialogs.confirm('Register '+todo.length+' player(s) to '+event().title+'? '+(checkin?'They will also be checked in.':'They will NOT be checked in yet.'),'Confirm GC Import'))return;
  $('gcCommit').disabled=true;
  try{
   const {data,error}=await db.rpc('cf_gc_register_players',{p_session_id:sid,p_rows:rows.map(r=>({name:normalizePlayerName(r.name),skill:Number(r.skill)})),p_checkin:checkin});
   if(error)throw error;
   await load();rows=[];$('gcPaste').value='';$('gcPreviewRows').innerHTML='';$('gcCommit').hidden=true;
   const result=data||{};notify('Imported: '+(result.registered||0)+' registrations · '+(result.created||0)+' new players'+(checkin?' · checked in':''));
  }catch(e){notify(e.message||String(e))}finally{$('gcCommit').disabled=false}
 };
 return {render:()=>{el.hidden=!getEvent()}};
}