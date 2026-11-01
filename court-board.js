import {buildCourtSnapshot} from './court-board-core.js';
export function initCourtBoard({db,state,load,notify,escapeHTML,playerName,rankedApp,getEvent=()=>null,dialogs}){
 const $=id=>document.getElementById(id),drafts=new Map();
 let fixtures=[],brackets=[],fetching=false,selected='';
 const name=id=>escapeHTML(playerName(id));
 const latest=()=>state.sessions.find(s=>s.id===selected);
 const getSnapshot=()=>{const s=latest();return s?buildCourtSnapshot({session:s,matches:state.matches,matchplayers:state.matchplayers,fixtures,brackets}):null};
 const css=document.createElement('style');css.textContent='.court-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}.court-tile{border:1px solid #354254;background:#161f2d;border-radius:16px;padding:15px;min-width:0}.court-tile.playing{border-color:#a68b25}.court-tile .teams{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;overflow-wrap:anywhere;font-size:13px;padding:12px 0}.court-tile .teams b{color:#f3c925;font-size:11px}.court-status{font-size:12px;color:#f3c925}.court-tile input{min-width:0}.court-actions{display:flex;gap:7px}.court-actions>*{flex:1;min-width:0}.court-status.available{color:#8fd9b2}.court-status.playing{color:#f3c925}.court-summary{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.court-summary .pill{white-space:nowrap}.court-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}';
 document.head.append(css);
 const panel=document.createElement('div');panel.className='card';panel.id='courtBoardAdmin';panel.innerHTML='<h2>Live Court Control</h2><label>Active session<select id="courtBoardSession"></select></label><div id="courtBoardSummary"></div><div id="courtBoardAdminGrid" class="court-grid"></div>';
 $('adminPanel').insertBefore(panel,$('adminPanel').firstChild);
 $('sessions').insertAdjacentHTML('afterbegin','<div class="card"><h2>Live Court Board</h2><label>Session<select id="courtBoardPublicSession"></select></label><div id="courtBoardPublicSummary"></div><div id="courtBoardPublicGrid" class="court-grid"></div></div>');
 const choosePublic=$('courtBoardPublicSession'),chooseAdmin=$('courtBoardSession');const forcedEvent=()=>getEvent();
 const key=(id,side)=>id+':'+side;
 function render(){
  const list=state.sessions,old=selected,forced=getEvent();if(forced&&list.some(s=>s.id===forced))selected=forced;
  if(!list.some(s=>s.id===old))selected=list.find(s=>s.status==='active')?.id||list[0]?.id||'';
  for(const control of [choosePublic,chooseAdmin]){
   const retain=forced||control.value||selected;
   control.innerHTML='<option value="">Choose session</option>'+list.map(s=>'<option value="'+s.id+'">'+escapeHTML(s.title)+'</option>').join('');
   control.value=list.some(s=>s.id===retain)?retain:selected;
  }
  choosePublic.parentElement.hidden=!!getEvent();chooseAdmin.parentElement.hidden=!!getEvent();
  const snap=getSnapshot();
  const summary=snap?'<div class="court-summary"><span class="pill">'+escapeHTML(snap.stageLabel)+'</span><span class="pill">'+snap.playing+' playing</span><span class="pill">'+snap.available+' available</span><span class="pill">'+snap.pending.length+' waiting</span></div>':'<p class="hint small">Choose a session.</p>';
  $('courtBoardSummary').innerHTML=summary;$('courtBoardPublicSummary').innerHTML=summary;
  for(const [root,admin] of [[$('courtBoardAdminGrid'),true],[$('courtBoardPublicGrid'),false]]){
   root.innerHTML=snap?snap.courts.map(c=>{
    const status=c.status==='playing'?'PLAYING':snap.closed?'CLOSED':'AVAILABLE';
    const teams=c.teams||c.lastTeams;
    const lineup=teams?'<div class="teams"><div>'+teams[0].map(name).join('<div>+</div>')+'</div><b>VS</b><div>'+teams[1].map(name).join('<div>+</div>')+'</div></div>':'<p class="hint small">No match assigned.</p>';
    const detail=c.live?lineup:c.last?'<p class="hint small">Last result · '+c.last.score_a+'–'+c.last.score_b+'</p>'+lineup:'<p class="hint small">Ready for the next match.</p>';
    const edit=admin&&c.live&&c.live.mode!=='ranked_4'?'<button class="secondary" data-edit-lineup="'+c.live.id+'" aria-label="Edit playing lineup">✎ Edit Lineup</button>':'';
    const score=admin&&c.live?'<div class="court-actions"><input type="number" min="0" max="99" placeholder="Team A" data-score="'+c.live.id+'" data-side="a" value="'+escapeHTML(drafts.get(key(c.live.id,'a'))??'')+'"><input type="number" min="0" max="99" placeholder="Team B" data-score="'+c.live.id+'" data-side="b" value="'+escapeHTML(drafts.get(key(c.live.id,'b'))??'')+'"></div><button data-finish="'+c.live.id+'">Confirm final score</button>':'';
    const start=admin&&c.canStart?'<button class="secondary" data-start="'+c.number+'">Start next scheduled match</button>':'';
    return '<div class="court-tile '+c.status+'"><div class="court-heading"><strong>Court '+c.number+'</strong><span class="court-status '+c.status+'">'+status+'</span></div>'+detail+edit+score+start+'</div>';
   }).join(''):'<p class="hint small">No courts to show.</p>';
  }

  $('courtBoardAdminGrid').querySelectorAll('[data-edit-lineup]').forEach(b=>b.onclick=()=>editLineup(b.dataset.editLineup));
  $('courtBoardAdminGrid').querySelectorAll('[data-score]').forEach(el=>el.oninput=()=>drafts.set(key(el.dataset.score,el.dataset.side),el.value));
  $('courtBoardAdminGrid').querySelectorAll('[data-finish]').forEach(el=>el.onclick=()=>finish(el.dataset.finish));
  $('courtBoardAdminGrid').querySelectorAll('[data-start]').forEach(el=>el.onclick=()=>start(Number(el.dataset.start)));
 }
 async function editLineup(id){
  const match=state.matches.find(m=>m.id===id);
  if(!match||match.status!=='playing'||match.mode==='ranked_4')return notify('This lineup cannot be edited');
  const slots=state.matchplayers.filter(p=>p.match_id===id).sort((a,b)=>a.team-b.team);
  const options=slots.map(p=>({label:'Team '+p.team+' · '+playerName(p.player_id),value:p.player_id}));
  const current=await dialogs.form('Edit Court '+match.court_number+' lineup',[{key:'old',label:'Select incorrect player',options,required:true}],'Choose the player to replace, then select an available checked-in player.');
  if(!current)return;
  const occupied=new Set(state.matches.filter(m=>m.session_id===match.session_id&&m.status==='playing').flatMap(m=>state.matchplayers.filter(p=>p.match_id===m.id).map(p=>p.player_id)));
  const candidates=state.attendance.filter(a=>a.session_id===match.session_id&&a.checked_in&&!a.paused&&!occupied.has(a.player_id)).map(a=>state.players.find(p=>p.id===a.player_id)).filter(p=>p&&p.active);
  if(!candidates.length)return notify('No available checked-in players');
  const replacement=await dialogs.pick(candidates,'Select replacement player');
  if(!replacement)return;
  const data=await dialogs.form('Confirm lineup correction',[{key:'reason',label:'Correction reason',required:true,placeholder:'Wrong name selected'}],'Players already staged in Next Court can be selected. Their provisional lineup will be removed to prevent double-booking.');
  if(!data)return;
  if(!await dialogs.confirm('Replace '+playerName(current.old)+' with '+playerName(replacement)+' on Court '+match.court_number+'?','Save lineup correction'))return;
  const {data:result,error}=await db.rpc('cf_replace_playing_player',{p_match_id:id,p_old_player_id:current.old,p_new_player_id:replacement,p_reason:data.reason});
  if(error)return notify(error.message);
  await load();await refresh();
  notify('Lineup updated'+(result?.removed_provisional_matches?' · '+result.removed_provisional_matches+' queue entry removed':''));
 }
 async function start(court){
  const snap=getSnapshot();if(!snap||!snap.nextFixture||!state.admin)return notify('No scheduled Ranked match is waiting');
  try{const {error}=await db.rpc('cf_ranked_start_fixture',{p_fixture_id:snap.nextFixture.id,p_court_number:court});if(error)throw error;await load();await refresh();notify('Match assigned to Court '+court)}catch(e){notify(e.message||String(e))}
 }
 async function finish(id){
  if(!state.admin)return notify('Admin access required');
  const m=state.matches.find(x=>x.id===id);if(!m||m.status!=='playing')return notify('Match is no longer active');
  const rawA=drafts.get(key(id,'a')),rawB=drafts.get(key(id,'b'));
  if(rawA===undefined||rawB===undefined||rawA===''||rawB==='')return notify('Enter both final scores');
  const a=Number(rawA),b=Number(rawB);
  if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>99||b>99||a===b)return notify('Scores must be different integers from 0 to 99');
  const winningTeam=a>b?1:2;
  const winner=state.matchplayers.filter(p=>p.match_id===id&&p.team===winningTeam).map(p=>playerName(p.player_id)).join(' + ');
  if(!await dialogs.confirm('Final score '+a+'–'+b+'. Winner: '+winner+'. Save this result?','Confirm court result'))return;
  try{const {error}=await db.rpc('cf_set_match_result',{p_match_id:id,p_score_a:a,p_score_b:b,p_reason:null});if(error)throw error;drafts.delete(key(id,'a'));drafts.delete(key(id,'b'));await load();await refresh();notify('Result saved and court is available')}catch(e){notify(e.message||String(e))}
 }
 async function refresh(){
  if(fetching)return;fetching=true;
  try{const response=await Promise.all(['cf_ranked_fixtures','cf_ranked_brackets'].map(async table=>{const {data,error}=await db.from(table).select('*');if(error)throw error;return data||[]}));
   [fixtures,brackets]=response;render();
  }catch(e){notify(e.message||String(e))}finally{fetching=false}
 }
 choosePublic.onchange=()=>{selected=forcedEvent()||choosePublic.value;chooseAdmin.value=selected;render()};
 chooseAdmin.onchange=()=>{selected=forcedEvent()||chooseAdmin.value;choosePublic.value=selected;render()};
 return {sync:refresh,render};
}