// Pure, deterministic playoff state transitions; winners are decided by games only.
// Each group represents players competing for consecutive available placement ranks.
export function newPlacementState(playerIds,rankStart,slots){
  if(!Array.isArray(playerIds)||playerIds.length<2||new Set(playerIds).size!==playerIds.length)throw Error('Need at least two distinct contenders');
  if(!Number.isInteger(rankStart)||!Number.isInteger(slots)||rankStart<1||slots<1||slots>4||slots>playerIds.length||rankStart+slots-1>4)throw Error('Invalid award slots');
  return {version:2,jobs:[{ids:[...playerIds],rankStart,slots}],current:null,awards:[]};
}
const clone=s=>JSON.parse(JSON.stringify(s));
function validateJob(job){
  if(!job||!Array.isArray(job.ids)||!job.ids.length||new Set(job.ids).size!==job.ids.length||job.slots<1||job.slots>job.ids.length)throw Error('Invalid placement job');
}
function collectAutoAwards(state){
  while(state.jobs.length && state.jobs[0].ids.length===1){
    const job=state.jobs.shift();
    if(job.slots!==1)throw Error('Single contender cannot fill multiple placements');
    state.awards.push({placement:job.rankStart,player_id:job.ids[0]});
  }
}
export function preparePlacementWave(oldState,createFixtures){
  const state=clone(oldState);
  if(state.current)throw Error('Complete the active placement wave before drawing another');
  collectAutoAwards(state);
  if(!state.jobs.length)return {state,fixtures:[],completed:true};
  const job=state.jobs.shift();validateJob(job);
  const fixtures=createFixtures(job.ids);
  if(!Array.isArray(fixtures)||!fixtures.length)throw Error('Could not generate no-bye matches');
  const counts=new Map(job.ids.map(id=>[id,0]));
  for(const f of fixtures){
    if(new Set(f.team_a.concat(f.team_b)).size!==4)throw Error('Duplicate participant in a match');
    for(const id of f.contenders){if(!counts.has(id))throw Error('Unexpected contender');counts.set(id,counts.get(id)+1)}
  }
  if([...counts.values()].some(x=>x!==1))throw Error('Every contender must play exactly once per wave; no automatic byes');
  state.current=job;
  return {state,fixtures,completed:false};
}
export function settlePlacementWave(oldState,fixtures,winners){
  const state=clone(oldState),job=state.current;
  if(!job)throw Error('No active playoff wave');
  validateJob(job);
  if(!Array.isArray(fixtures)||!fixtures.length||fixtures.some(f=>!(f.id in winners)))throw Error('All matches in the wave must finish');
  const winning=[],losing=[];
  for(const fixture of fixtures){
    const team=winners[fixture.id];if(team!==1&&team!==2)throw Error('Invalid match outcome');
    const victory=team===1?fixture.team_a:fixture.team_b;
    for(const id of fixture.contenders)(victory.includes(id)?winning:losing).push(id);
  }
  if(new Set([...winning,...losing]).size!==job.ids.length||winning.length+losing.length!==job.ids.length)throw Error('Invalid no-bye wave results');
  const {ids,rankStart,slots}=job;
  if(ids.length===2){
    if(winning.length!==1)throw Error('Duel must produce exactly one winning contender');
    state.awards.push({placement:rankStart,player_id:winning[0]});
    if(slots===2)state.awards.push({placement:rankStart+1,player_id:losing[0]});
  }else if(ids.length===3){
    if(fixtures.length!==1||fixtures[0].kind!=='triple')throw Error('Three contenders require the approved quick triple match');
    const f=fixtures[0],duo=f.team_a.filter(id=>f.contenders.includes(id));
    const solo=f.team_b.find(id=>f.contenders.includes(id));
    if(duo.length!==2||!solo)throw Error('Invalid triple team layout');
    const soloWon=winning.includes(solo);
    if(soloWon){
      state.awards.push({placement:rankStart,player_id:solo});
      if(slots>=2)state.jobs.unshift({ids:duo,rankStart:rankStart+1,slots:Math.min(slots-1,2)});
    }else{
      if(slots===3)state.awards.push({placement:rankStart+2,player_id:solo});
      state.jobs.unshift({ids:duo,rankStart,slots:Math.min(slots,2)});
    }
  }else{
    if(winning.length<1||losing.length<1)throw Error('Invalid qualifying wave');
    if(winning.length>=slots){
      state.jobs.unshift({ids:winning,rankStart,slots});
    }else{
      const upper={ids:winning,rankStart,slots:winning.length};
      const lower={ids:losing,rankStart:rankStart+winning.length,slots:slots-winning.length};
      validateJob(upper);validateJob(lower);
      state.jobs.unshift(upper,lower);
    }
  }
  state.current=null;
  collectAutoAwards(state);
  const placements=state.awards.map(x=>x.placement),players=state.awards.map(x=>x.player_id);
  if(new Set(placements).size!==placements.length||new Set(players).size!==players.length)throw Error('Duplicate placement award');
  return {state,completed:!state.jobs.length};
}