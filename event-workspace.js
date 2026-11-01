export function initEventWorkspace({state,db,notify,escapeHTML,playerName,renderBase}){
 const $=id=>document.getElementById(id);
 const esc=escapeHTML;
 let eventId='',adminTab='overview',publicTab='courts';
 const adminRoot=$('adminPanel'),publicHome=$('home');
 const publicSections=['sessions','players','rankings','history'];
 const categories=[['overview','Control Center'],['courts','Courts & Scores'],['queue','Next Court'],['players','Players'],['checkin','Check-in'],['ranked','Ranked'],['settings','Event Setup']];
 const nav=document.createElement('div');nav.id='eventPublicNav';nav.innerHTML='<button class="secondary" id="eventBack">← Back to events</button><strong id="eventPublicTitle"></strong><div id="eventPublicTabs" class="ew-tabs"></div>';document.querySelector('main').insertBefore(nav,$('sessions'));
 const adminNav=document.createElement('div');adminNav.id='eventAdminNav';adminNav.innerHTML='<div class="ew-head"><strong id="eventAdminTitle">Select event</strong><button class="secondary" id="eventAdminBack">Change event</button></div><div id="eventAdminTabs" class="ew-tabs"></div>';adminRoot.insertBefore(adminNav,adminRoot.firstChild);
 const chooser=document.createElement('div');chooser.id='eventAdminChooser';chooser.className='card';chooser.innerHTML='<h2>Select event to manage</h2><div id="eventAdminChoices" class="ew-cards"></div><button class="secondary" id="eventCreate">Create new event</button>';adminRoot.insertBefore(chooser,adminNav);
 $('eventCreate').onclick=()=>{eventId='';const panels=Array.from(adminRoot.children);panels.forEach(el=>el.hidden=true);chooser.hidden=false;adminNav.hidden=true;const setup=panels.find(el=>el.querySelector?.('#sname'));if(setup){setup.hidden=false;setup.scrollIntoView({behavior:'smooth',block:'start'})}};
 const publicChoice=document.createElement('div');publicChoice.id='eventPublicChooser';publicChoice.innerHTML='<h2>Select an event</h2><div id="eventPublicChoices" class="ew-cards"></div>';publicHome.append(publicChoice);
 const style=document.createElement('style');style.textContent='#home>.hero,#home>.grid{display:none}#eventPublicChooser{padding:20px 0}#eventPublicChooser h2{font-size:clamp(24px,5vw,34px)}.ew-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}.ew-event{background:#1b2635;border:1px solid #394557;border-radius:15px;padding:18px;display:block;text-align:left;color:#fff}.ew-event strong{display:block;margin-bottom:8px}.ew-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.ew-tabs button{flex:0 0 auto}.ew-tabs button.on{background:#f3c925;color:#111}.ew-head{display:flex;align-items:center;justify-content:space-between;gap:12px}#eventAdminNav{position:sticky;top:72px;z-index:20;padding:10px;background:#101722;border-radius:12px}#eventPublicNav{display:none;align-items:center;gap:14px;flex-wrap:wrap;padding:12px 0}body.ew-event-mode #eventPublicNav{display:flex}body.ew-event-mode header .nav-tabs{display:none}body.ew-event-mode #eventPublicChooser{display:none}@media(max-width:790px){#eventAdminNav{top:105px}.ew-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.ew-tabs button{font-size:11px;padding:9px 4px}}';document.head.append(style);
 const groups=()=>({
 overview:[$('tournamentCenter')],
 courts:[$('courtBoardAdmin')],
 queue:[$('eventQueuePanel')],
 players:[...adminRoot.querySelectorAll('#stage5tools')].concat([...adminRoot.querySelectorAll('.grid')].filter(el=>el.querySelector('#pname'))),
 checkin:[...adminRoot.querySelectorAll('#stage5tools')].concat([...adminRoot.querySelectorAll('.card')].filter(el=>el.querySelector('#aSession'))),
 ranked:[$('rPanel')],
 settings:[...adminRoot.querySelectorAll('.grid')].filter(el=>el.querySelector('#sname')) 
 });
 function setEvent(id){eventId=state.sessions.some(s=>s.id===id)?id:'';adminTab='overview';publicTab='courts';refresh();}
 function setTab(tab){adminTab=tab;refresh();}
 function publicRoute(tab){publicTab=tab;location.hash='#/'+({courts:'sessions',players:'players',rankings:'rankings',history:'history'}[tab]||'sessions');refresh();}
 $('eventBack').onclick=()=>{eventId='';location.hash='#/home';refresh()};
 $('eventAdminBack').onclick=()=>{eventId='';refresh()};
 function refresh(){
  if(eventId&&!state.sessions.some(s=>s.id===eventId))eventId='';
  const active=state.sessions.find(s=>s.id===eventId);
  document.body.classList.toggle('ew-event-mode',!!active&&location.hash!=='#/admin');
  const choices=state.sessions.map(s=>'<button class="ew-event" data-event="'+s.id+'"><strong>'+esc(s.title)+'</strong><span class="hint small">'+esc(s.session_date)+' · '+esc(s.mode)+' · '+s.courts+' court(s)</span></button>').join('');
  $('eventPublicChoices').innerHTML=choices||'<p class="hint">No events available yet.</p>';
  $('eventAdminChoices').innerHTML=choices||'<p class="hint">Create an event in Event Setup.</p>';
  for(const parent of [$('eventPublicChoices'),$('eventAdminChoices')])parent.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>{setEvent(b.dataset.event);if(parent.id==='eventPublicChoices')location.hash='#/sessions'});
  chooser.hidden=!!active;adminNav.hidden=!active;
  $('eventPublicTitle').textContent=active?.title||'';
  $('eventAdminTitle').textContent=active?.title||'';
  $('eventAdminTabs').innerHTML=categories.map(([id,title])=>'<button class="'+(adminTab===id?'on':'secondary')+'" data-section="'+id+'">'+title+'</button>').join('');
  $('eventAdminTabs').querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>setTab(b.dataset.section));
  $('eventPublicTabs').innerHTML=[['courts','Courts'],['players','Players'],['rankings','Standings'],['history','History']].map(([id,title])=>'<button class="'+(publicTab===id?'on':'secondary')+'" data-public="'+id+'">'+title+'</button>').join('');
  $('eventPublicTabs').querySelectorAll('[data-public]').forEach(b=>b.onclick=()=>publicRoute(b.dataset.public));
  const fixed=new Set([adminNav,chooser]);
  const all=Array.from(adminRoot.children).filter(el=>!fixed.has(el));
  const target=new Set(groups()[adminTab]?.filter(Boolean)||[]);
  all.forEach(el=>{el.hidden=!active||!target.has(el)});const stage5=$('stage5tools');if(stage5&&!stage5.hidden){const check=adminTab==='checkin';for(const el of Array.from(stage5.children)){const isCheck=el.id==='stage5session'||el.id==='stage5checksearch'||el.id==='stage5checklist'||(el.tagName==='H3'&&el.textContent.includes('Check-in'))||el.textContent==='Session';el.hidden=check?!isCheck:isCheck}}
  const selectIds=['aSession','stage5session','rSession','tcSession','courtBoardSession','courtBoardPublicSession'];
  if(active)for(const id of selectIds){const el=$(id);if(el&&[...el.options].some(o=>o.value===eventId)&&el.value!==eventId){el.value=eventId;if(id==='rSession')el.dispatchEvent(new Event('change'))}}
  const show=!!active&&location.hash!=='#/admin';const sessionsList=$('sessionsList');if(sessionsList)sessionsList.hidden=!!active;
  publicSections.forEach(id=>{const el=$(id);if(el)el.hidden=!show||({sessions:'courts',players:'players',rankings:'rankings',history:'history'}[id]!==publicTab)});
  publicHome.hidden=!!active;
 }
 function getEvent(){return eventId}
 return {refresh,getEvent,setEvent};
}