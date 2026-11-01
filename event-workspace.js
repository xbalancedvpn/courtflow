export function initEventWorkspace({state,escapeHTML,onEventChange=()=>{}}){
const $=id=>document.getElementById(id),admin=$('adminPanel'),home=$('home');
let selected='',tab='overview',publicTab='courts',createMode=false;
const cats=[['overview','Overview'],['courts','Courts'],['queue','Next Court'],['players','Players'],['checkin','Check-in'],['results','Results'],['ranked','Ranked'],['settings','Settings']];
const header=document.createElement('div');header.id='ewAdminHeader';header.innerHTML='<div class="ew-identity"><strong id="ewAdminTitle">Event control</strong><button id="ewChange" class="secondary">Change event</button></div><div id="ewAdminNav"></div>';admin.prepend(header);
const chooser=document.createElement('section');chooser.id='ewAdminChooser';chooser.className='card';chooser.innerHTML='<h2>Choose event to manage</h2><div id="ewAdminCards" class="ew-cards"></div><button id="ewCreate" class="secondary">+ Create Event</button>';header.before(chooser);
const publicChooser=document.createElement('div');publicChooser.id='ewPublicChooser';publicChooser.innerHTML='<h1>Select an event</h1><p class="hint">Choose an open play to view its live courts and updates.</p><div id="ewPublicCards" class="ew-cards"></div>';home.append(publicChooser);
const pubHead=document.createElement('div');pubHead.id='ewPublicHeader';pubHead.innerHTML='<div class="ew-identity"><button id="ewPublicBack" class="secondary">← Events</button><strong id="ewPublicName"></strong></div><div id="ewPublicNav"></div>';document.querySelector('main').insertBefore(pubHead,$('sessions'));
const shell=document.createElement('div');shell.id='ewAdminPanes';admin.append(shell);
const panes={};for(const [id] of cats){let p=document.createElement('div');p.id='ewPane-'+id;shell.append(p);panes[id]=p}
const findCard=id=>$(id)?.closest('.card');
const stage5=$('stage5tools'),stage5Check=stage5?.querySelector('#stage5checklist');
function move(el,to){if(el)panes[to].append(el)}
move($('tournamentCenter'),'overview');
move($('courtBoardAdmin'),'courts');
move($('eventQueuePanel'),'queue');
move($('eventPlayerManager'),'checkin');
move($('eventOperations'),'settings');
move($('rPanel'),'ranked');
const playerCard=findCard('pname'),setupCard=findCard('sname');
move(playerCard,'players');
if(stage5){move(stage5,'players');for(const id of ['stage5session','stage5checksearch','stage5checklist']){const el=$(id);if(el)el.hidden=true}let h=[...stage5.querySelectorAll('h3')].find(e=>e.textContent.includes('Check-in'));if(h)h.hidden=true}
if(setupCard){const newCard=document.createElement('div');newCard.className='card';newCard.id='ewCreateCard';newCard.append(setupCard);chooser.append(newCard)}
const correction=findCard('cfCorrectMatch');move(correction,'results');
const older=[...admin.children].filter(x=>![header,chooser,shell].includes(x));for(const el of older){if(!el.querySelector?.('button[onclick="logout()"]')){el.hidden=true;el.dataset.legacyControl='true'}}
const resultTitle=document.createElement('h2');resultTitle.textContent='Finished games · latest first';panes.results.prepend(resultTitle);
const historyBox=document.createElement('div');historyBox.id='ewAdminResults';panes.results.append(historyBox);
const styles=document.createElement('style');styles.textContent='#home>.hero,#home>.grid{display:none}#ewPublicChooser{padding:18px 0}.ew-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}.ew-event-card{text-align:left;background:#1a2535;color:#fff;border:1px solid #39485d;padding:18px;border-radius:16px}.ew-event-card strong{display:block;font-size:17px;margin-bottom:7px}.ew-identity{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.ew-identity strong{font-size:18px}.ew-nav{display:flex;gap:7px;margin:12px 0;flex-wrap:wrap}.ew-nav button{flex:0 0 auto}.ew-nav button.selected{background:#f3c925;color:#12171e}#ewAdminHeader{position:sticky;top:70px;z-index:20;background:#111a27;border:1px solid #344459;border-radius:17px;padding:12px;margin:10px 0 16px}#ewPublicHeader{display:none;margin-bottom:13px}body.ew-public-selected #ewPublicHeader{display:block}body.ew-public-selected header .nav-tabs{display:none}#ewAdminPanes>div[hidden]{display:none}#ewAdminChooser[hidden],#ewAdminHeader[hidden]{display:none}#ewAdminPanes .card{margin-bottom:12px}#ewCreateCard{margin-top:14px}#ewAdminResults .rank-row{gap:10px}#ewAdminPanes .card>.grid{max-width:100%}@media(max-width:780px){#ewAdminHeader{position:static}#ewAdminNav{position:fixed;bottom:0;left:0;right:0;background:#101824;border-top:1px solid #39475a;z-index:90;padding:7px max(6px,env(safe-area-inset-left)) calc(7px + env(safe-area-inset-bottom))}#ewAdminNav .ew-nav{margin:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}#ewAdminNav button{min-width:0;padding:8px 3px;font-size:11px}body:has(#ewAdminHeader:not([hidden])) main{padding-bottom:125px}#ewPublicNav .ew-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}#ewPublicNav button{padding:9px 3px;font-size:12px}}';document.head.append(styles);
function choose(id,isAdmin){if(!state.sessions.some(x=>x.id===id))return;selected=id;tab='overview';publicTab='courts';createMode=false;render();onEventChange();if(!isAdmin)location.hash='#/sessions'}
function list(){const available=state.sessions.filter(s=>!s.is_archived);return available.map(s=>'<button class="ew-event-card" data-id="'+s.id+'"><strong>'+escapeHTML(s.title)+'</strong><span class="hint small">'+escapeHTML(s.session_date)+' · '+s.courts+' courts · '+escapeHTML(s.status)+'</span></button>').join('')||'<p class="hint">No events yet.</p>'}
function navigatePublic(next){publicTab=next;const hash={courts:'sessions',players:'players',results:'history',rankings:'rankings'}[next]||'sessions';location.hash='#/'+hash;render()}
function render(){
 if(selected&&!state.sessions.some(s=>s.id===selected))selected='';
 const s=state.sessions.find(x=>x.id===selected),adminMode=location.hash==='#/admin';
 $('ewAdminCards').innerHTML=list();$('ewPublicCards').innerHTML=list();
 for(const [root,isAdmin] of [[$('ewAdminCards'),true],[$('ewPublicCards'),false]])root.querySelectorAll('[data-id]').forEach(btn=>btn.onclick=()=>choose(btn.dataset.id,isAdmin));
 chooser.hidden=!!s&&!createMode;header.hidden=!s||createMode;
 $('ewAdminTitle').textContent=s?s.title+' · '+s.status:'Event control';$('ewPublicName').textContent=s?.title||'';
 for(const [id,pane] of Object.entries(panes))pane.hidden=!s||id!==tab;
 const nav=$('ewAdminNav');nav.innerHTML='<div class="ew-nav">'+cats.map(([id,title])=>'<button data-admin-tab="'+id+'" class="'+(tab===id?'selected':'secondary')+'">'+title+'</button>').join('')+'</div>';
 nav.querySelectorAll('[data-admin-tab]').forEach(btn=>btn.onclick=()=>{tab=btn.dataset.adminTab;render()});
 $('ewPublicNav').innerHTML='<div class="ew-nav">'+[['courts','Courts'],['players','Players'],['results','Results'],['rankings','Rankings']].map(([id,title])=>'<button data-public-tab="'+id+'" class="'+(publicTab===id?'selected':'secondary')+'">'+title+'</button>').join('')+'</div>';
 $('ewPublicNav').querySelectorAll('[data-public-tab]').forEach(btn=>btn.onclick=()=>navigatePublic(btn.dataset.publicTab));
 const showing=!!s&&!adminMode;document.body.classList.toggle('ew-public-selected',showing);
 const hashes={courts:'sessions',players:'players',results:'history',rankings:'rankings'};
 for(const [id,route] of Object.entries(hashes))$(route).hidden=!showing||publicTab!==id;
 $('sessionsList').hidden=!!s;
 if(showing)home.hidden=true;else if(!adminMode)home.hidden=false;
 for(const id of ['aSession','stage5session','rSession','tcSession','courtBoardSession','courtBoardPublicSession']){const input=$(id);if(s&&input&&[...input.options].some(o=>o.value===s.id)&&input.value!==s.id){input.value=s.id;if(id==='rSession')input.dispatchEvent(new Event('change'))}}
 if(s){const ms=state.matches.filter(m=>m.session_id===s.id&&m.status==='completed').sort((a,b)=>new Date(b.ended_at)-new Date(a.ended_at));historyBox.innerHTML=ms.map(m=>'<div class="rank-row"><span>Court '+m.court_number+' · '+new Date(m.ended_at).toLocaleString()+'</span><strong>'+m.score_a+' – '+m.score_b+'</strong></div>').join('')||'<p class="hint small">No finished games yet.</p>'}
}
$('ewChange').onclick=()=>{selected='';createMode=false;render();onEventChange()};
$('ewPublicBack').onclick=()=>{selected='';location.hash='#/home';render();onEventChange()};
$('ewCreate').onclick=()=>{createMode=true;chooser.hidden=false;header.hidden=true;$('ewCreateCard').hidden=false};
$('ewCreateCard').hidden=true;
return {refresh:render,getEvent:()=>selected,setEvent:id=>choose(id,true),currentTab:()=>tab};
}