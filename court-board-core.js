// CourtFlow Stage 8: pure, side-effect-free court status derivation.
// A scheduled Ranked fixture is NOT assigned to a court until cf_ranked_start_fixture runs.
export function buildCourtSnapshot({session,matches=[],matchplayers=[],fixtures=[],brackets=[]}){
 if(!session||!session.id)throw Error('Choose a session');
 const courtCount=Number(session.courts);
 if(!Number.isInteger(courtCount)||courtCount<1||courtCount>10)throw Error('Invalid court count');
 const scoped=matches.filter(m=>m.session_id===session.id);
 const byId=new Map(scoped.map(m=>[m.id,m]));
 const forCourt=n=>scoped.filter(m=>Number(m.court_number)===n);
 const playedAt=m=>new Date(m?.ended_at||m?.started_at||0).getTime()||0;
 const allFixtures=fixtures.filter(f=>f.session_id===session.id);
 const activeBracket=brackets.find(b=>b.session_id===session.id&&b.status==='active');
 let stage='open_play',stageLabel='Open Play',stageFixtures=[];
 if(session.mode==='ranked_4'){
  if(activeBracket){
   stage='playoff';stageLabel='Ranked Playoff · Stage '+activeBracket.round_no;
   stageFixtures=allFixtures.filter(f=>f.phase==='playoff'&&f.bracket_id===activeBracket.id&&f.round_no===activeBracket.round_no);
  }else{
   const regular=allFixtures.filter(f=>f.phase==='regular');
   const unfinished=regular.filter(f=>byId.get(f.match_id)?.status!=='completed');
   if(unfinished.length){
    const round=Math.min(...unfinished.map(f=>Number(f.round_no)));
    stage='regular';stageLabel='Ranked · Round '+round+'/4';
    stageFixtures=unfinished.filter(f=>Number(f.round_no)===round);
   }else{
    stage=regular.length?'awaiting_playoffs':'awaiting_roster';
    stageLabel=regular.length?'Regular games complete · awaiting next playoff step':'Ranked · waiting for fixtures';
   }
  }
 }
 stageFixtures=[...stageFixtures].sort((a,b)=>Number(a.seq_no)-Number(b.seq_no));
 const pending=stageFixtures.filter(f=>!f.match_id);
 const queue=stageFixtures.filter(f=>f.match_id&&byId.get(f.match_id)?.status==='playing');
 const courts=[];
 for(let n=1;n<=courtCount;n++){
  const played=forCourt(n);
  const live=played.filter(m=>m.status==='playing').sort((a,b)=>playedAt(b)-playedAt(a))[0]||null;
  const last=played.filter(m=>m.status==='completed').sort((a,b)=>playedAt(b)-playedAt(a))[0]||null;
  const teams=live?[1,2].map(team=>matchplayers.filter(x=>x.match_id===live.id&&Number(x.team)===team).map(x=>x.player_id)):null;
  const lastTeams=last?[1,2].map(team=>matchplayers.filter(x=>x.match_id===last.id&&Number(x.team)===team).map(x=>x.player_id)):null;
  courts.push({number:n,status:live?'playing':'available',live,teams,last,lastTeams,canStart:!live&&pending.length>0&&session.status==='active'});
 }
 return {
  sessionId:session.id,stage,stageLabel,courts,
  playing:courts.filter(c=>c.status==='playing').length,
  available:courts.filter(c=>c.status==='available').length,
  pending,queued:queue.length,nextFixture:pending[0]||null,
  closed:session.status!=='active'
 };
}
