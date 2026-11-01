import {runRankedDryRun} from './ranked-qa.js';
export function initStage5({db,state,load,notify,escapeHTML,playerName,getEvent=()=>null,dialogs}){
 const $=id=>document.getElementById(id);
 const skills=['','Beginner','Novice','Intermediate Low','Intermediate High','Advance','Pro'];
 let view={fixtures:[],roster:[],awards:[],sessions:[],checkedSession:null};
 const err=e=>notify(e.message||String(e));
 const skill=n=>skills[Number(n)]||'Unrated';
 const say=id=>escapeHTML(playerName(id));
 const markup=document.createElement('section');markup.className='card';markup.id='stage5tools';
 markup.innerHTML='<h2>Player Management</h2><p class="hint small">Search and edit registered players. Bulk add accepts one name per line.</p><input id="stage5search" placeholder="Search players by name or skill level"><div id="stage5playerlist"></div><h3>Bulk Register Players</h3><textarea id="stage5names" rows="4" placeholder="Player One&#10;Player Two" style="width:100%;color:#fff;background:#171d29;border:1px solid #39404f;border-radius:12px;padding:12px"></textarea><label>Skill level for new players<select id="stage5skill">'+skills.slice(1).map((s,i)=>'<option value="'+(i+1)+'" '+(i===2?'selected':'')+'>'+s+'</option>').join('')+'</select></label><button id="stage5bulk">Add players</button><h3>Quick Check-in</h3><label>Session<select id="stage5session"></select></label><input id="stage5checksearch" placeholder="Filter check-in list"><div id="stage5checklist"></div><h3>Safe Internal QA</h3><button class="secondary" id="stage5test">Run 32-player dry-run (10 sessions)</button><p id="stage5testresult" class="hint small" aria-live="polite"></p>';
 $('adminPanel').append(markup);
 const pInput=$('stage5search'),checkInput=$('stage5checksearch'),sessionInput=$('stage5session');
 pInput.oninput=renderPlayers;checkInput.oninput=renderCheckin;sessionInput.onchange=renderCheckin;
 $('stage5bulk').onclick=async()=>{
  const lines=$('stage5names').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const unique=[...new Set(lines.map(x=>x.toLocaleLowerCase()))];
  if(!lines.length||lines.some(x=>x.length<2||x.length>90)||lines.length!==unique.length||lines.length>100)return notify('Enter up to 100 unique valid names (2–90 characters), one per line.');
  const existing=new Set(state.players.map(p=>p.name.toLowerCase()));
  if(lines.some(x=>existing.has(x.toLowerCase())))return notify('Some names already exist. Remove duplicates before adding.');
  if(!await dialogs.confirm('Register '+lines.length+' new players?','Register players'))return;
  try{const {error}=await db.from('cf_players').insert(lines.map(name=>({name,skill:Number($('stage5skill').value)})));if(error)throw error;$('stage5names').value='';await load();notify(lines.length+' players registered')}catch(e){err(e)}
 };
 $('stage5test').onclick=()=>{try{const r=runRankedDryRun(10);$('stage5testresult').textContent='PASS · '+r.trials+' simulated tournaments · '+r.games+' regular games · '+r.playoffMatches+' playoff matches · zero database writes.'}catch(e){$('stage5testresult').textContent='FAILED · '+e.message}};
 function renderPlayers(){
  const q=pInput.value.trim().toLowerCase(),matches=state.players.filter(p=>p.name.toLowerCase().includes(q)||skill(p.skill).toLowerCase().includes(q)).slice(0,50);
  $('stage5playerlist').innerHTML=matches.map(p=>'<div class="rank-row"><strong>'+escapeHTML(p.name)+'</strong><span class="hint small">'+skill(p.skill)+'</span><button class="secondary" data-edit="'+p.id+'">Edit</button></div>').join('')||'<p class="hint small">No matching players.</p>';
  $('stage5playerlist').querySelectorAll('[data-edit]').forEach(el=>el.onclick=async()=>{
   const p=state.players.find(x=>x.id===el.dataset.edit);if(!p)return;
   const change=await dialogs.form('Edit player',[{key:'name',label:'Player name',value:p.name,required:true},{key:'level',label:'Skill level',value:String(p.skill),options:['Beginner','Novice','Intermediate Low','Intermediate High','Advance','Pro'].map((label,i)=>({label,value:String(i+1)}))}]);if(!change)return;const {name,level}=change;
   if(name.trim().length<2||name.trim().length>90||!Number.isInteger(Number(level))||Number(level)<1||Number(level)>6)return notify('Invalid player name or skill level');
   try{const {error}=await db.from('cf_players').update({name:name.trim(),skill:Number(level)}).eq('id',p.id);if(error)throw error;await load();notify('Player updated')}catch(e){err(e)}
  });
 }
 function renderCheckin(){
  const sid=sessionInput.value,q=checkInput.value.toLowerCase();
  const attendance=new Map(state.attendance.filter(a=>a.session_id===sid).map(a=>[a.player_id,a]));
  const players=state.players.filter(p=>p.active&&p.name.toLowerCase().includes(q)).slice(0,80);
  $('stage5checklist').innerHTML='<p class="hint small">'+[...attendance.values()].filter(x=>x.checked_in&&!x.paused).length+' currently checked in</p>'+players.map(p=>'<div class="rank-row"><span>'+escapeHTML(p.name)+' <small class="hint">'+skill(p.skill)+'</small></span><button data-check="'+p.id+'" class="'+(attendance.get(p.id)?.checked_in?'secondary':'')+'">'+(attendance.get(p.id)?.checked_in?'Checked in ✓':'Check in')+'</button></div>').join('');
  $('stage5checklist').querySelectorAll('[data-check]').forEach(el=>el.onclick=async()=>{
   if(!sid)return notify('Choose an active session');
   const id=el.dataset.check,prior=attendance.get(id);if(prior?.checked_in)return;
   try{const {error}=await db.from('cf_attendance').upsert({session_id:sid,player_id:id,checked_in:true,paused:false},{onConflict:'session_id,player_id'});if(error)throw error;await load();notify('Player checked in')}catch(e){err(e)}
  });
 }
 function renderPublic(){
  const root=$('rankedPublic');if(!root)return;
  const ranked=state.sessions.filter(s=>s.mode==='ranked_4'&&(!getEvent()||s.id===getEvent())).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  root.innerHTML=ranked.length?ranked.map(s=>{
   const fixtures=view.fixtures.filter(f=>f.session_id===s.id&&f.phase==='regular');
   const stats=new Map(view.roster.filter(r=>r.session_id===s.id).map(r=>[r.player_id,{id:r.player_id,g:0,w:0}]));
   for(const f of fixtures){const m=state.matches.find(m=>m.id===f.match_id);if(!m||m.status!=='completed')continue;const winning=m.winner_team===1?f.team_a:f.team_b;for(const id of f.contenders){const p=stats.get(id);if(p){p.g++;if(winning.includes(id))p.w++}}}
   const list=[...stats.values()].sort((a,b)=>b.w-a.w||a.g-b.g||String(playerName(a.id)).localeCompare(String(playerName(b.id))));
   const awards=view.awards.filter(a=>a.session_id===s.id).sort((a,b)=>a.placement-b.placement);
   return '<div class="card"><div class="flex"><strong>'+escapeHTML(s.title)+'</strong><span class="pill">'+escapeHTML(s.status)+'</span></div><p class="hint small">'+fixtures.filter(f=>state.matches.some(m=>m.id===f.match_id&&m.status==='completed')).length+'/32 regular matches completed</p>'+awards.map(a=>'<div class="rank-row"><strong>'+(['Player of the Night','1st Runner-Up','2nd Runner-Up','3rd Runner-Up'][a.placement-1])+'</strong><span>'+say(a.player_id)+'</span></div>').join('')+'<h3>Individual W–L Standings</h3>'+list.map(x=>'<div class="rank-row"><span>'+say(x.id)+'</span><span>'+x.w+'–'+(x.g-x.w)+' · '+x.g+'/4 games</span></div>').join('')+(list.length?'':'<p class="hint small">Roster not yet locked.</p>')+'</div>'
  }).join(''):'<div class="empty">No Ranked sessions yet.</div>';
 }
 let syncing=false;
 async function sync(){
  if(syncing)return;syncing=true;
  try{
   const [fixtures,roster,awards]=await Promise.all(['cf_ranked_fixtures','cf_ranked_roster','cf_ranked_awards'].map(async table=>{const {data,error}=await db.from(table).select('*');if(error)throw error;return data||[]}));
   view={fixtures,roster,awards};
   const old=sessionInput.value;
   const choices=state.sessions.filter(s=>s.status==='active');
   sessionInput.innerHTML='<option value="">Choose session</option>'+choices.map(s=>'<option value="'+s.id+'">'+escapeHTML(s.title)+'</option>').join('');
   if(choices.some(s=>s.id===old))sessionInput.value=old;
   else if(choices.length)sessionInput.value=choices[0].id;
   renderPlayers();renderCheckin();renderPublic();
  }catch(e){err(e)}finally{syncing=false}
 }
 renderPublic();return {sync,renderPublic,getTournamentData:()=>({fixtures:view.fixtures||[],roster:view.roster||[],awards:view.awards||[]})};
}
