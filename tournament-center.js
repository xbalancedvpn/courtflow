import {summarizeTournament,createStandingsCSV} from './tournament-center-core.js';
export function initTournamentCenter({state,escapeHTML,playerName,rankedApp,stage5,courtBoard}){
 const $=id=>document.getElementById(id);
 const panel=document.createElement('section');panel.className='card';panel.id='tournamentCenter';
 panel.innerHTML='<h2>Tournament Control Center</h2><p class="hint small">One place to monitor an event. Final scores remain manual.</p><label>Session<select id="tcSession"></select></label><div id="tcMetrics" class="tc-metrics"></div><div id="tcNext" class="tc-next"></div><div class="stack tc-shortcuts"><button class="secondary" id="tcCourts">Live courts</button><button class="secondary" id="tcRanked">Ranked controls</button><button class="secondary" id="tcPlayers">Players & check-in</button><button class="secondary" id="tcExport">Export CSV</button></div><h3>Official Top 4</h3><div id="tcAwards"></div><h3>Individual regular-game standings</h3><div id="tcStandings"></div><div id="tcWarnings"></div>';
 $('adminPanel').insertBefore(panel,$('adminPanel').firstChild);
 const css=document.createElement('style');css.textContent='.tc-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}@media(min-width:700px){.tc-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}}.tc-metric{padding:12px;border-radius:12px;background:#202936;min-width:0}.tc-metric strong{display:block;color:#f3c925;font-size:23px}.tc-metric small{color:#aeb7c5}.tc-next{border-left:3px solid #f3c925;padding:10px 12px;background:#242936;margin:10px 0}.tc-shortcuts{margin:14px 0}.tc-warn{color:#ffb1a9;margin:6px 0}.tc-scroll{max-height:430px;overflow:auto}';document.head.append(css);
 let selected='',summary=null,roster=[],fixtures=[],awards=[],loaded=false;
 function go(id){const el=$(id);if(el){el.scrollIntoView({behavior:'smooth',block:'start'});el.style.scrollMarginTop='125px'}}
 $('tcCourts').onclick=()=>go('courtBoardAdmin');$('tcRanked').onclick=()=>go('rPanel');$('tcPlayers').onclick=()=>go('stage5tools');
 $('tcSession').onchange=()=>{selected=$('tcSession').value;render()};
 $('tcExport').onclick=()=>{
  if(!summary)return;
  const csv=createStandingsCSV(summary,state.players),blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='courtflow-standings-'+new Date().toISOString().slice(0,10)+'.csv';link.click();URL.revokeObjectURL(url);
 };
 function render(){
  const select=$('tcSession');
  const sessions=state.sessions.filter(x=>x.status==='active'||x.mode==='ranked_4');
  if(!sessions.some(s=>s.id===selected))selected=sessions.find(x=>x.status==='active'&&x.mode==='ranked_4')?.id||sessions[0]?.id||'';
  select.innerHTML='<option value="">Choose session</option>'+sessions.map(s=>'<option value="'+s.id+'">'+escapeHTML(s.title)+'</option>').join('');select.value=selected;
  const session=state.sessions.find(s=>s.id===selected);
  summary=session?summarizeTournament({session,players:state.players,attendance:state.attendance,matches:state.matches,fixtures,roster,awards}):null;
  if(!summary){$('tcMetrics').innerHTML='';$('tcNext').textContent='Select a session';$('tcAwards').innerHTML='';$('tcStandings').innerHTML='';$('tcWarnings').innerHTML='';$('tcExport').disabled=true;return}
  const metrics=[['Checked in',summary.checked],['Playing courts',summary.playing],['Available courts',summary.available],['Regular matches',summary.regularCompleted+'/32']];
  $('tcMetrics').innerHTML=metrics.map(([title,value])=>'<div class="tc-metric"><strong>'+escapeHTML(value)+'</strong><small>'+escapeHTML(title)+'</small></div>').join('');
  $('tcNext').innerHTML='<strong>Next action</strong><p class="hint small">'+escapeHTML(summary.next)+'</p>';
  const labels=['Player of the Night','1st Runner-Up','2nd Runner-Up','3rd Runner-Up'];
  $('tcAwards').innerHTML=summary.awards.length?summary.awards.map(a=>'<div class="rank-row"><strong>'+labels[a.placement-1]+'</strong><span>'+escapeHTML(playerName(a.player_id))+'</span></div>').join(''):'<p class="hint small">No final placement awards yet.</p>';
  $('tcStandings').className='tc-scroll';
  $('tcStandings').innerHTML=summary.standings.length?summary.standings.map(p=>'<div class="rank-row"><strong>'+escapeHTML(playerName(p.id))+'</strong><span>'+p.wins+'W · '+p.losses+'L · '+p.games+'/4</span></div>').join(''):'<p class="hint small">No locked ranked roster yet.</p>';
  $('tcWarnings').innerHTML=summary.warnings.map(w=>'<p class="tc-warn">'+escapeHTML(w)+'</p>').join('');
  $('tcExport').disabled=!summary.ranked||!summary.standings.length;
 }
 function sync(data){if(data){fixtures=data.fixtures||[];roster=data.roster||[];awards=data.awards||[];loaded=true}render()}
 return {sync,render};
}