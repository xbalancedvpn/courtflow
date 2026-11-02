export function initEventWorkspace({state,escapeHTML,onEventChange=()=>{}}){
const $=id=>document.getElementById(id),admin=$('adminPanel'),home=$('home');
let selected='',tab='overview',publicTab='courts',createMode=false,menuOpen=false;
const cats=[['overview','Control Center'],['settings','Event Settings'],['players','Player Directory'],['checkin','Check-in / Out'],['courts','Live Courts'],['queue','Next Court Queue'],['results','Match Results'],['ranked','Rankings'],['finance','Accounting']];
const groups=[['EVENT MANAGEMENT',['overview','settings']],['PLAYER MANAGEMENT',['players','checkin']],['GAME OPERATIONS',['courts','queue','results']],['COMPETITION',['ranked']],['FINANCE',['finance']]];
const descriptions={overview:'Overview, status and session controls',settings:'Edit event, archive and restore',players:'Register, import and edit players',checkin:'Attendance and checkout',courts:'Active matches and scores',queue:'Organize the next three games',results:'Completed matches and corrections',ranked:'Ranked mode and standings',finance:'Event payments and balances'};
const header=document.createElement('div');header.id='ewAdminHeader';header.innerHTML='<div class="ew-identity"><div><span class="ew-context-label">MANAGING EVENT</span><strong id="ewAdminTitle">Event control</strong><span id="ewCurrentSection" class="hint small"></span></div><button id="ewChange" class="secondary">Change event</button></div><div id="ewAdminNav" class="ew-drawer" role="dialog" aria-modal="true" aria-label="Admin navigation" hidden><div class="ew-drawer-head"><div><span class="ew-context-label">COURTFLOW</span><h2>Management menu</h2></div><button id="ewMenuClose" class="secondary" aria-label="Close menu">✕</button></div><div id="ewDrawerGroups"></div><div class="ew-drawer-footer"><button id="ewDrawerEvent" class="secondary">Change event</button><button id="ewDrawerLogout" class="secondary">Sign out</button></div></div>';admin.prepend(header);
const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='ew-menu-backdrop';backdrop.setAttribute('aria-label','Close management menu');backdrop.hidden=true;document.body.append(backdrop);
function closeMenu(){menuOpen=false;backdrop.hidden=true;$('ewAdminNav').hidden=true;document.body.classList.remove('ew-menu-open');$('adminShortcut')?.setAttribute('aria-expanded','false')}
function toggleMenu(){if(location.hash!=='#/admin'||!state.admin)return;menuOpen=!menuOpen;backdrop.hidden=!menuOpen;$('ewAdminNav').hidden=!menuOpen;document.body.classList.toggle('ew-menu-open',menuOpen);$('adminShortcut')?.setAttribute('aria-expanded',String(menuOpen))}
backdrop.onclick=closeMenu;$('ewMenuClose').onclick=closeMenu;
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
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
// Hide the legacy Smart queue & rotation card; it duplicates Next Court and is not the authoritative dispatch queue.
const legacyQueue=$('cfQueue')?.closest('.card');if(legacyQueue){legacyQueue.hidden=true;legacyQueue.dataset.legacyControl='true'}
move($('eventPlayerManager'),'checkin');
move($('eventOperations'),'settings');
const lifecycle=$('eoStart')?.parentElement;if(lifecycle){const panel=document.createElement('section');panel.className='card';panel.id='ewLifecycle';panel.innerHTML='<h3>Session Controls</h3><p class="hint small">Start the event to publish live matchups, and end it after all courts finish.</p>';panel.append(lifecycle);panes.overview.prepend(panel)}
move($('eventFinance'),'finance');
move($('rPanel'),'ranked');
const playerCard=findCard('pname'),setupCard=findCard('sname');
move(playerCard,'players');
if(stage5){move(stage5,'players');for(const id of ['stage5session','stage5checksearch','stage5checklist']){const el=$(id);if(el)el.hidden=true}let h=[...stage5.querySelectorAll('h3')].find(e=>e.textContent.includes('Check-in'));if(h)h.hidden=true}
if(setupCard){const newCard=document.createElement('div');newCard.className='card';newCard.id='ewCreateCard';newCard.append(setupCard);chooser.append(newCard)}
const correction=findCard('cfCorrectMatch');move(correction,'results');
// Later-created extensions are moved into their logical group during refresh.
function arrangeExtensions(){const importer=$('gcImportPanel');if(importer&&importer.parentElement!==panes.players)panes.players.append(importer)}
const older=[...admin.children].filter(x=>![header,chooser,shell].includes(x));for(const el of older){if(!el.querySelector?.('button[onclick="logout()"]')){el.hidden=true;el.dataset.legacyControl='true'}}
const resultTitle=document.createElement('h2');resultTitle.textContent='Finished games · latest first';panes.results.prepend(resultTitle);
const historyBox=document.createElement('div');historyBox.id='ewAdminResults';panes.results.append(historyBox);
const styles=document.createElement('style');styles.textContent=`
#home>.hero,#home>.grid{display:none}
#ewPublicChooser{padding:18px 0}
.ew-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}
.ew-event-card{text-align:left;background:#1a2535;color:#fff;border:1px solid #39485d;padding:18px;border-radius:16px}
.ew-event-card strong{display:block;font-size:17px;margin-bottom:7px}
.ew-identity{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.ew-identity>div{display:flex;flex-direction:column;gap:5px;min-width:0}
.ew-identity strong{font-size:clamp(16px,2vw,21px);overflow-wrap:anywhere}
.ew-context-label{font-size:10px;letter-spacing:.17em;color:#d3b35f;font-weight:800}
#ewCurrentSection{color:#aeb7c5}
#ewAdminHeader{position:relative;z-index:12;background:linear-gradient(140deg,#17212e,#101722);border:1px solid #354455;border-radius:17px;padding:17px;margin:10px 0 16px}
#ewPublicHeader{display:none;margin-bottom:13px}
body.ew-public-selected #ewPublicHeader{display:block}
#ewAdminPanes>div[hidden]{display:none}
#ewAdminChooser[hidden],#ewAdminHeader[hidden]{display:none}
#ewAdminPanes .card{margin-bottom:12px}
#ewCreateCard{margin-top:14px}
#ewAdminResults .rank-row{gap:10px}
#ewAdminPanes .card>.grid{max-width:100%}
.ew-menu-backdrop{position:fixed;inset:0;z-index:99;background:#000a;border:0;border-radius:0;padding:0;cursor:default;backdrop-filter:blur(3px)}
.ew-menu-backdrop[hidden],.ew-drawer[hidden]{display:none!important}
.ew-drawer{position:fixed;top:0;right:0;bottom:0;z-index:100;width:min(390px,100vw);height:100dvh;overflow:auto;background:#0f1721;border-left:1px solid #b9994b63;border-radius:0;padding:25px 18px max(20px,env(safe-area-inset-bottom));box-shadow:-25px 0 65px #000b}
.ew-drawer-head{display:flex;align-items:start;justify-content:space-between;gap:12px;border-bottom:1px solid #34404d;padding-bottom:16px}
.ew-drawer-head h2{margin:7px 0 0;font-size:22px;letter-spacing:-.04em}
#ewMenuClose{flex:none;padding:9px 13px}
.ew-drawer-group{margin:22px 0 0}
.ew-drawer-group>h3{font-size:10px;letter-spacing:.2em;color:#bda462;margin:0 0 9px 9px}
.ew-drawer-item{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;width:100%;padding:13px;border-radius:11px;margin:4px 0;background:transparent;border:1px solid transparent;color:#e9edf1}
.ew-drawer-item strong{display:block;font-size:14px}
.ew-drawer-item small{display:block;color:#92a0af;font-size:11px;font-weight:400;margin-top:3px}
.ew-drawer-item.selected{background:#272b26;border-color:#b39648;color:#f2d073}
.ew-drawer-item:hover{background:#252d38}
.ew-drawer-item>span{font-size:18px;color:#bda462}
.ew-drawer-footer{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:25px;padding-top:16px;border-top:1px solid #33404f}
.ew-drawer-footer button{min-width:0}
body.ew-menu-open{overflow:hidden}
body.ew-menu-open #ewAdminHeader{z-index:110}
body.ew-menu-open #ewAdminNav{z-index:120}
body.ew-menu-open .ew-menu-backdrop{z-index:99}
#ewAdminPanes>div{max-width:1100px;margin:0 auto}
#ewAdminPanes>div>.card{width:100%;max-width:none}
#ewAdminPanes .card h2{letter-spacing:-.035em}
#ewPane-overview #ewLifecycle{border-color:#9a843d}
#ewPane-players #gcImportPanel{margin-top:14px}
body.ew-public-selected #ewPublicNav{display:block}
@media(max-width:780px){#ewAdminHeader{position:static;margin-top:7px;padding:13px}#ewPublicNav .ew-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}#ewPublicNav button{padding:9px 3px;font-size:12px}.ew-drawer{width:min(360px,100vw);padding:19px 14px}}
`;document.head.append(styles);
function choose(id,isAdmin){if(!state.sessions.some(x=>x.id===id))return;closeMenu();selected=id;tab='overview';publicTab='courts';createMode=false;render();onEventChange();if(!isAdmin)location.hash='#/sessions'}
function list(includeArchived=false){const available=state.sessions.filter(s=>includeArchived||(!s.is_archived&&s.status!=='closed'));return available.map(s=>'<button class="ew-event-card" data-id="'+s.id+'"><strong>'+escapeHTML(s.title)+'</strong><span class="hint small">'+escapeHTML(s.session_date)+' · '+s.courts+' courts · '+escapeHTML(s.status)+'</span></button>').join('')||'<p class="hint">No events yet.</p>'}
function navigatePublic(next){publicTab=next;const hash={courts:'sessions',players:'players',results:'history',rankings:'rankings'}[next]||'sessions';location.hash='#/'+hash;render()}
function render(){
 arrangeExtensions();
 if(location.hash!=='#/admin')closeMenu();
 if(selected&&!state.sessions.some(s=>s.id===selected))selected='';
 const s=state.sessions.find(x=>x.id===selected),adminMode=location.hash==='#/admin';
 $('ewAdminCards').innerHTML=list(true);$('ewPublicCards').innerHTML=list();
 for(const [root,isAdmin] of [[$('ewAdminCards'),true],[$('ewPublicCards'),false]])root.querySelectorAll('[data-id]').forEach(btn=>btn.onclick=()=>choose(btn.dataset.id,isAdmin));
 chooser.hidden=!!s&&!createMode;header.hidden=!s||createMode;
 $('ewAdminTitle').textContent=s?s.title+' · '+s.status:'Event control';$('ewCurrentSection').textContent=cats.find(x=>x[0]===tab)?.[1]||'';$('ewPublicName').textContent=s?.title||'';
 for(const [id,pane] of Object.entries(panes))pane.hidden=!s||id!==tab;
 const groupRoot=$('ewDrawerGroups');
 groupRoot.innerHTML=groups.map(([group,ids])=>'<section class="ew-drawer-group"><h3>'+group+'</h3>'+ids.map(id=>'<button class="ew-drawer-item '+(tab===id?'selected':'')+'" data-admin-tab="'+id+'" aria-current="'+(tab===id?'page':'false')+'"><div><strong>'+cats.find(x=>x[0]===id)[1]+'</strong><small>'+descriptions[id]+'</small></div><span aria-hidden="true">›</span></button>').join('')+'</section>').join('');
 groupRoot.querySelectorAll('[data-admin-tab]').forEach(btn=>btn.onclick=()=>{tab=btn.dataset.adminTab;closeMenu();render();window.scrollTo({top:0,behavior:'smooth'})});
 $('ewPublicNav').innerHTML='<div class="ew-nav">'+[['courts','Courts'],['players','Players'],['results','Results'],['rankings','Rankings']].map(([id,title])=>'<button data-public-tab="'+id+'" class="'+(publicTab===id?'selected':'secondary')+'">'+title+'</button>').join('')+'</div>';
 $('ewPublicNav').querySelectorAll('[data-public-tab]').forEach(btn=>btn.onclick=()=>navigatePublic(btn.dataset.publicTab));
 const showing=!!s&&!adminMode&&s.status==='active';document.body.classList.toggle('ew-public-selected',showing);
 const hashes={courts:'sessions',players:'players',results:'history',rankings:'rankings'};
 for(const [id,route] of Object.entries(hashes))$(route).hidden=!showing||publicTab!==id;
 $('sessionsList').hidden=!!s;
 if(s&&!adminMode&&s.status!=='active'){home.hidden=false;for(const id of ['sessions','players','rankings','history'])$(id).hidden=true;pubHead.hidden=true}else{pubHead.hidden=false;if(showing)home.hidden=true;else if(!adminMode)home.hidden=false;}
 for(const id of ['aSession','stage5session','rSession','tcSession','courtBoardSession','courtBoardPublicSession']){const input=$(id);if(s&&input&&[...input.options].some(o=>o.value===s.id)&&input.value!==s.id){input.value=s.id;if(id==='rSession')input.dispatchEvent(new Event('change'))}}
 if(s){const ms=state.matches.filter(m=>m.session_id===s.id&&m.status==='completed').sort((a,b)=>new Date(b.ended_at)-new Date(a.ended_at));historyBox.innerHTML=ms.map(m=>'<div class="rank-row"><span>Court '+m.court_number+' · '+new Date(m.ended_at).toLocaleString()+'</span><strong>'+m.score_a+' – '+m.score_b+'</strong></div>').join('')||'<p class="hint small">No finished games yet.</p>'}
}
$('ewChange').onclick=()=>{closeMenu();selected='';createMode=false;render();onEventChange()};
$('ewPublicBack').onclick=()=>{selected='';location.hash='#/home';render();onEventChange()};
$('ewCreate').onclick=()=>{createMode=true;chooser.hidden=false;header.hidden=true;$('ewCreateCard').hidden=false};
$('ewCreateCard').hidden=true;
$('ewDrawerEvent').onclick=()=>{closeMenu();$('ewChange').click()};
$('ewDrawerLogout').onclick=()=>{closeMenu();window.logout?.()};
return {refresh:render,getEvent:()=>selected,setEvent:id=>choose(id,true),currentTab:()=>tab,openTab:id=>{if(!panes[id])return;tab=id;closeMenu();render();window.scrollTo({top:0,behavior:'smooth'})},toggleMenu,closeMenu};
}