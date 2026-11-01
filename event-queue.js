export function initEventQueue({db,state,load,notify,escapeHTML,playerName,getEvent,dialogs}){
 const $=id=>document.getElementById(id),name=id=>escapeHTML(playerName(id));
 let items=[],version=0,fixtures=[],sid='',editIndex=-1;
 const panel=document.createElement('section');panel.className='card';panel.id='eventQueuePanel';
 panel.innerHTML='<h2>Next Court · Editable</h2><p class="hint small">Up to three provisional matches. No court is reserved before Start.</p><div id="eqList"></div><div id="eqNew"><label>Scheduled fixture<select id="eqFixture"></select></label><div id="eqTeams" class="grid"></div><button id="eqAdd">Add to queue</button></div><h3>Available courts</h3><div id="eqCourts" class="stack"></div>';
 $('adminPanel').append(panel);
 $('sessions').insertAdjacentHTML('beforeend','<div class="card" id="eqPublic"><h2>Next Court · Provisional</h2><div id="eqPublicList"></div><h3>Waiting players</h3><div id="eqWaiting"></div></div>');
 const slots=['A1','A2','B1','B2'];
 $('eqTeams').innerHTML=slots.map(x=>'<label>'+x+'<select id="eq'+x+'"></select></label>').join('');
 const session=()=>state.sessions.find(s=>s.id===sid);
 const status=()=>new Set(state.matches.filter(m=>m.session_id===sid&&m.status==='playing').flatMap(m=>state.matchplayers.filter(p=>p.match_id===m.id).map(p=>p.player_id)));
 const available=()=>state.attendance.filter(a=>a.session_id===sid&&a.checked_in&&!a.paused).map(a=>state.players.find(p=>p.id===a.player_id)).filter(p=>p?.active&&!status().has(p.id));
 const teams=item=>item.kind==='ranked'?fixtures.find(f=>f.id===item.fixture_id):item;
 function render(){
  const s=session();
  const html=(item,i,admin)=>{const t=teams(item);return '<div class="rank-match"><div class="flex"><strong>Next '+(i+1)+'</strong><span class="pill">Provisional</span></div>'+(t?'<div class="rank-versus">'+t.team_a.map(name).join(' + ')+' <b>VS</b> '+t.team_b.map(name).join(' + ')+'</div>':'<p>Missing fixture</p>')+(admin?'<div class="stack"><button data-up="'+i+'">↑</button><button data-down="'+i+'">↓</button><button data-edit="'+i+'">Edit</button><button data-remove="'+i+'">Remove</button></div>':'')+'</div>'};
  $('eqList').innerHTML=items.map((x,i)=>html(x,i,true)).join('')||'<p class="hint small">No provisional matches.</p>';
  $('eqPublicList').innerHTML=items.map((x,i)=>html(x,i,false)).join('')||'<p class="hint small">No match on queue.</p>';
  for(const dir of ['up','down','remove','edit'])$('eqList').querySelectorAll('[data-'+dir+']').forEach(b=>b.onclick=()=>{const i=Number(b.dataset[dir]),next=[...items];if(dir==='edit'){editIndex=i;const entry=items[i];if(entry.kind==='ranked')$('eqFixture').value=entry.fixture_id;else ['A1','A2','B1','B2'].forEach((x,j)=>{ $('eq'+x).value=j<2?entry.team_a[j]:entry.team_b[j-2]});$('eqAdd').textContent='Save changes to Queue '+(i+1);return}if(dir==='remove')next.splice(i,1);else{const j=i+(dir==='up'?-1:1);if(j<0||j>=next.length)return;[next[i],next[j]]=[next[j],next[i]]}save(next)});
  const staged=new Set(items.flatMap(x=>{const t=teams(x);return t?t.team_a.concat(t.team_b):[]}));
  const waiting=available().filter(p=>!staged.has(p.id)).sort((a,b)=>{
    const joined=id=>new Date(state.attendance.find(x=>x.session_id===sid&&x.player_id===id)?.queue_joined_at||0).getTime();
    return joined(a.id)-joined(b.id)
  });
  $('eqWaiting').innerHTML=waiting.map((p,i)=>'<div class="rank-row">'+(i+1)+'. '+escapeHTML(p.name)+'</div>').join('')||'<p class="hint small">No waiting players.</p>';
  const choices=available().map(p=>'<option value="'+p.id+'">'+escapeHTML(p.name)+'</option>').join('');
  for(const slot of slots){const el=$('eq'+slot),old=el.value;el.innerHTML='<option value="">Select</option>'+choices;el.value=old}
  const schedule=fixtures.filter(f=>f.session_id===sid&&!f.match_id&&!items.some((x,i)=>i!==editIndex&&x.fixture_id===f.id));
  $('eqFixture').innerHTML='<option value="">Select fixture</option>'+schedule.map(f=>'<option value="'+f.id+'">'+f.phase+' R'+f.round_no+' M'+f.seq_no+'</option>').join('');
  $('eqFixture').parentElement.hidden=s?.mode!=='ranked_4';$('eqTeams').hidden=s?.mode==='ranked_4';
  $('eqAdd').disabled=!sid||(items.length>=3&&editIndex<0);
  const occupied=new Set(state.matches.filter(m=>m.session_id===sid&&m.status==='playing').map(m=>m.court_number));
  $('eqCourts').innerHTML=items.length?Array.from({length:s?.courts||0},(_,i)=>i+1).filter(n=>!occupied.has(n)).map(n=>'<button data-court="'+n+'">Start #1 on Court '+n+'</button>').join(''):'<p class="hint small">Add a match first.</p>';
  $('eqCourts').querySelectorAll('[data-court]').forEach(b=>b.onclick=()=>dispatch(Number(b.dataset.court)));
 }
 let busy=false;
 async function save(next){
  if(busy||!sid||!state.admin)return;busy=true;
  try{const {data,error}=await db.rpc('cf_event_queue_set',{p_session_id:sid,p_expected_version:version,p_entries:next});if(error)throw error;items=data.entries;version=Number(data.version);notify('Queue updated')}catch(e){notify(e.message||String(e))}finally{busy=false;await sync()}
 }
 async function dispatch(court){
  if(busy||!sid||!items.length||!state.admin)return;
  if(!await dialogs.confirm('Start first provisional match on Court '+court+'?','Start Next Court'))return;busy=true;
  try{const {error}=await db.rpc('cf_event_queue_dispatch',{p_session_id:sid,p_court_number:court,p_expected_version:version});if(error)throw error;await load();notify('Match started on Court '+court)}catch(e){notify(e.message||String(e))}finally{busy=false;await sync()}
 }
 $('eqAdd').onclick=()=>{if(items.length>=3)return;let entry;if(session()?.mode==='ranked_4'){const fixture_id=$('eqFixture').value;if(!fixture_id)return notify('Select a fixture');entry={kind:'ranked',fixture_id}}else{const arr=slots.map(x=>$('eq'+x).value);if(arr.some(x=>!x)||new Set(arr).size!==4)return notify('Choose four different players');entry={kind:'open',team_a:arr.slice(0,2),team_b:arr.slice(2)}}const next=[...items];if(editIndex>=0)next[editIndex]=entry;else next.push(entry);editIndex=-1;$('eqAdd').textContent='Add to queue';save(next)};
 async function sync(){
  const id=getEvent();if(!id){sid='';items=[];version=0;fixtures=[];editIndex=-1;render();return}
  sid=id;
  const [a,b]=await Promise.all([db.from('cf_event_queues').select('*').eq('session_id',id).maybeSingle(),db.from('cf_ranked_fixtures').select('*').eq('session_id',id)]);
  if(a.error||b.error){notify((a.error||b.error).message);return}
  if(sid!==id)return;items=a.data?.entries||[];version=Number(a.data?.version||0);fixtures=b.data||[];render();
 }
 return {sync,render};
}