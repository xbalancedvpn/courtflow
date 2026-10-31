import {makeRegularRound,createPlayoffFixtures} from './ranked-core.js';
import {newPlacementState,preparePlacementWave,settlePlacementWave} from './ranked-playoff-engine.js';

const assert=(v,m)=>{if(!v)throw Error(m)};
const prng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
export function runRankedDryRun(trials=10){
 if(!Number.isInteger(trials)||trials<1||trials>100)throw Error('Invalid simulation count');
 let games=0,playoffMatches=0,noRepeatPartner=0,tripleCases=0;
 for(let t=0;t<trials;t++){
  const random=prng(t+50207),ids=Array.from({length:32},(_,i)=>'P'+i);
  const played=[],count=new Map(ids.map(id=>[id,{w:0,g:0}]));
  for(let round=1;round<=4;round++){
   const fixtures=makeRegularRound(ids,played,random).matches;
   assert(fixtures.length===8,'Round must have 8 matches');
   const wave=fixtures.flatMap(f=>f.team_a.concat(f.team_b));
   assert(wave.length===32&&new Set(wave).size===32,'Player appears twice in one round');
   for(const f of fixtures){
    const pkey=x=>x.slice().sort().join(',');
    if(played.some(old=>[pkey(old.team_a),pkey(old.team_b)].includes(pkey(f.team_a))||[pkey(old.team_a),pkey(old.team_b)].includes(pkey(f.team_b))))noRepeatPartner++;
    const winners=random()<.5?f.team_a:f.team_b;
    f.contenders.forEach(id=>count.get(id).g++);
    winners.forEach(id=>count.get(id).w++);
    played.push(f);games++;
   }
  }
  assert([...count.values()].every(x=>x.g===4),'Not every player played 4 regular matches');
  assert([...count.values()].reduce((n,x)=>n+x.w,0)===64,'Win totals must equal 64');
  let awards=[];
  const skills=Object.fromEntries(ids.map(id=>[id,1+Math.floor(random()*6)]));
  for(let wins=4;wins>=0&&awards.length<4;wins--){
   const tied=ids.filter(id=>count.get(id).w===wins);
   if(!tied.length)continue;
   if(tied.length===1){awards.push({placement:awards.length+1,player_id:tied[0],tier:wins});continue}
   const slots=Math.min(tied.length,4-awards.length);
   let engine=newPlacementState(tied,awards.length+1,slots),prior=[];
   for(let stage=0;stage<30;stage++){
    const planned=preparePlacementWave(engine,group=>createPlayoffFixtures({
     players:group,allContenders:tied,volunteers:ids.filter(id=>!tied.includes(id)),skills,prior,random
    }));
    engine=planned.state;
    if(planned.completed)break;
    const fixtures=planned.fixtures.map((f,i)=>({...f,id:'T'+t+'-'+stage+'-'+i}));
    const sameCourt=fixtures.flatMap(f=>f.team_a.concat(f.team_b));
    assert(sameCourt.length===new Set(sameCourt).size,'A player appears twice in one playoff wave');
    tripleCases+=fixtures.filter(f=>f.kind==='triple').length;
    const winners=Object.fromEntries(fixtures.map(f=>[f.id,random()<.5?1:2]));
    const result=settlePlacementWave(engine,fixtures,winners);
    prior.push(...fixtures);playoffMatches+=fixtures.length;
    engine=result.state;
    if(result.completed)break;
    assert(stage<29,'Bracket is stuck');
   }
   assert(engine.awards.length===slots,'Unfilled award slots');
   awards.push(...engine.awards.map(a=>({...a,tier:wins})));
  }
  const sorted=[...awards].sort((a,b)=>a.placement-b.placement);
  assert(sorted.length===4,'Tournament did not award 4 places');
  assert(sorted.map(x=>x.placement).join(',')==='1,2,3,4','Wrong placements');
  assert(new Set(sorted.map(x=>x.player_id)).size===4,'Duplicate award recipient');
  assert(sorted.every((x,i)=>i===0||sorted[i-1].tier>=x.tier),'A player with fewer regular wins placed above higher-win tier');
 }
 return {passed:true,trials,games,playoffMatches,tripleCases,repeatPartnerConflicts:noRepeatPartner,mutatedDatabase:false};
}
