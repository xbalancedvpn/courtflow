// CourtFlow Stage 10: read-only tournament readiness and result export.
// Rankings are based EXCLUSIVELY on regular-game wins; placement comes from official awards.
const skillLabels=['','Beginner','Novice','Intermediate Low','Intermediate High','Advance','Pro'];
export function summarizeTournament({session,players=[],attendance=[],matches=[],fixtures=[],roster=[],awards=[]}){
 if(!session?.id)return null;
 const sid=session.id,ranked=session.mode==='ranked_4';
 const scoped=matches.filter(m=>m.session_id===sid),byMatch=new Map(scoped.map(m=>[m.id,m]));
 const checked=new Set(attendance.filter(a=>a.session_id===sid&&a.checked_in&&!a.paused).map(a=>a.player_id));
 const registered=roster.filter(r=>r.session_id===sid).map(r=>r.player_id);
 const regular=fixtures.filter(f=>f.session_id===sid&&f.phase==='regular');
 const playoff=fixtures.filter(f=>f.session_id===sid&&f.phase==='playoff');
 const finished=f=>byMatch.get(f.match_id)?.status==='completed';
 const completed=regular.filter(finished).length;
 const playing=scoped.filter(m=>m.status==='playing').length;
 const available=Math.max(0,Number(session.courts||1)-playing);
 const activeRound=Math.max(0,...regular.map(f=>Number(f.round_no)||0));
 const pending=ranked?fixtures.filter(f=>f.session_id===sid&&!f.match_id).length:0;
 const final=awards.filter(a=>a.session_id===sid).sort((a,b)=>a.placement-b.placement);
 const standings=new Map(registered.map(id=>[id,{id,games:0,wins:0,losses:0,placement:null}]));
 for(const f of regular){
  const m=byMatch.get(f.match_id);
  if(!m||m.status!=='completed')continue;
  for(const id of f.contenders||[]){
   const p=standings.get(id);if(!p)continue;
   p.games++;
   if((m.winner_team===1?f.team_a:f.team_b).includes(id))p.wins++;
   else p.losses++;
  }
 }
 for(const a of final){const p=standings.get(a.player_id);if(p)p.placement=a.placement}
 const rows=[...standings.values()].sort((a,b)=>b.wins-a.wins||a.losses-b.losses||String(a.id).localeCompare(String(b.id)));
 const warnings=[];
 if(playing>Number(session.courts))warnings.push('Too many active matches for available courts');
 if(registered.length&&new Set(registered).size!==registered.length)warnings.push('Duplicate roster entries');
 if(rows.some(r=>r.games>4))warnings.push('A player has more than four regular games');
 if(final.length!==new Set(final.map(a=>a.placement)).size)warnings.push('Duplicate placement slots');
 if(final.length!==new Set(final.map(a=>a.player_id)).size)warnings.push('Duplicate award recipients');
 if(regular.length>32)warnings.push('Too many regular fixtures');
 let next='Choose an active session';
 if(session.status!=='active')next='Session is closed; review or export results';
 else if(!ranked)next=playing?'Record a result or continue open play':'Use Live Court Control to start an open-play game';
 else if(final.length===4)next='Top 4 confirmed — export the final standings';
 else if(registered.length===0)next=checked.size===32?'Lock the 32-player roster':'Check in exactly 32 players ('+checked.size+'/32)';
 else if(registered.length!==32)next='Roster must contain exactly 32 players';
 else if(regular.length<32&&regular.length===completed)next='Generate regular round '+(activeRound+1);
 else if(playing)next='Enter final scores for '+playing+' playing match(es)';
 else if(regular.some(f=>!finished(f)))next=available?'Assign waiting fixtures to available courts':'Complete the current matches';
 else if(completed===32)next='Resolve remaining Top 4 awards and tiebreakers';
 else next='Review pending Ranked fixtures';
 return {sid,title:session.title,ranked,checked:checked.size,roster:registered.length,regularTotal:regular.length,regularCompleted:completed,
  playoffCompleted:playoff.filter(finished).length,playing,available,pending,awards:final,round:activeRound,standings:rows,next,warnings,sessionStatus:session.status};
}
export function createStandingsCSV(summary,players=[]){
 if(!summary?.sid)throw Error('Choose a tournament first');
 const people=new Map(players.map(p=>[p.id,p]));
 const protect=value=>{
  let s=String(value??'');
  if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
 };
 const rows=[['Session',summary.title],['Export status',summary.awards.length===4?'FINAL':'DRAFT - not all placements confirmed'],
 ['Regular games completed',summary.regularCompleted],['',''],['Player','Skill level','Regular wins','Regular losses','Games played','Award']];
 const ranks=['','Champion / Player of the Night','1st Runner-Up','2nd Runner-Up','3rd Runner-Up'];
 for(const s of summary.standings){
  const p=people.get(s.id)||{};
  rows.push([p.name||s.id,skillLabels[Number(p.skill)]||'Unrated',s.wins,s.losses,s.games,ranks[s.placement]||'']);
 }
 return rows.map(row=>row.map(protect).join(',')).join('\r\n');
}
