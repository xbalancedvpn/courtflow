// CourtFlow Ranked Core: randomized no-bye fixtures and supporter balancing.
export const shuffle=(array,random=Math.random)=>{
 const a=[...array];
 for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
 return a;
};
export const pairKey=(a,b)=>[a,b].sort().join('|');
export const teamSets=ids=>[
 [[ids[0],ids[1]],[ids[2],ids[3]]],
 [[ids[0],ids[2]],[ids[1],ids[3]]],
 [[ids[0],ids[3]],[ids[1],ids[2]]]
];
export function makeRegularRound(players,previous=[],random=Math.random){
 if(players.length!==32||new Set(players).size!==32)throw Error('Exactly 32 different players required');
 const partnerHistory=new Map(),opponentHistory=new Map();
 for(const f of previous){
  const [a,b]=[f.team_a,f.team_b];
  for(const t of [a,b]){const k=pairKey(...t);partnerHistory.set(k,(partnerHistory.get(k)||0)+1)}
  for(const p of a)for(const q of b){const k=pairKey(p,q);opponentHistory.set(k,(opponentHistory.get(k)||0)+1)}
 }
 let best=null,bestPenalty=Infinity;
 for(let attempt=0;attempt<850;attempt++){
  const randomPlayers=shuffle(players,random),games=[];let penalty=0;
  for(let i=0;i<32;i+=4){
   const group=randomPlayers.slice(i,i+4);
   const candidates=shuffle(teamSets(group),random).map(teams=>{
    const p=teams.reduce((n,t)=>n+(partnerHistory.get(pairKey(...t))||0)*1000,0);
    const o=teams[0].reduce((n,a)=>n+teams[1].reduce((n,b)=>n+(opponentHistory.get(pairKey(a,b))||0)*10,0),0);
    return {teams,penalty:p+o};
   });
   candidates.sort((a,b)=>a.penalty-b.penalty);
   penalty+=candidates[0].penalty;
   games.push({team_a:candidates[0].teams[0],team_b:candidates[0].teams[1],contenders:group});
  }
  if(penalty<bestPenalty){bestPenalty=penalty;best=games}
  if(penalty===0)break;
 }
 return {matches:best,repeatPenalty:bestPenalty};
}
function skill(id,skills){const n=Number(skills[id]||3);return Number.isFinite(n)?n:3}
function supportPair(a,b,available,skills,prior,previousSupporters,random=Math.random){
 if(available.length<2)throw Error('Two available non-contender supporters required');
 const pairs=[];
 for(let i=0;i<available.length;i++)for(let j=0;j<available.length;j++)if(i!==j){
  const s1=available[i],s2=available[j];
  const gap=Math.abs(skill(a,skills)+skill(s1,skills)-skill(b,skills)-skill(s2,skills));
  const repeats=(prior.some(f=>(f.team_a.includes(s1)&&f.team_a.includes(a))||(f.team_b.includes(s1)&&f.team_b.includes(a)))?1:0)
   +(prior.some(f=>(f.team_a.includes(b)&&f.team_a.includes(s2))||(f.team_b.includes(b)&&f.team_b.includes(s2)))?1:0);
  pairs.push({s1,s2,gap,cost:gap*5+repeats*20+(previousSupporters.has(s1)?500:0)+(previousSupporters.has(s2)?500:0)+random()*.5});
 }
 pairs.sort((x,y)=>x.cost-y.cost);
 return pairs[0];
}
export function createPlayoffFixtures({players,allContenders,volunteers,skills={},prior=[],kind='auto',random=Math.random}){
 const chosen=shuffle(players,random);
 if(!chosen.length||new Set(chosen).size!==chosen.length)throw Error('Invalid contender group');
 const contenderSet=new Set(allContenders);
 const available=shuffle([...new Set(volunteers)].filter(id=>!contenderSet.has(id)),random);
 const previousSupporters=new Set(prior.flatMap(f=>f.team_a.concat(f.team_b).filter(id=>!contenderSet.has(id))));
 const fresh=available.filter(id=>!previousSupporters.has(id));
 const needed=chosen.length===3?1:chosen.length%2===1?chosen.length-2:chosen.length;
 if(available.length<needed)throw Error('Need '+needed+' non-contender volunteers; '+available.length+' available');
 // A new playoff wave must use an entirely fresh supporter set whenever possible.
 let candidates=fresh.length>=needed?shuffle(fresh,random):[...fresh,...available.filter(id=>previousSupporters.has(id))],fixtures=[];
 const triple=chosen.length>=3&&chosen.length%2===1;
 if(triple){
  const t=chosen.slice(0,3);
  const s=candidates.map(id=>({id,cost:Math.abs(skill(t[0],skills)+skill(t[1],skills)-skill(t[2],skills)-skill(id,skills))+(previousSupporters.has(id)?500:0)+random()*.3})).sort((x,y)=>x.cost-y.cost)[0].id;
  fixtures.push({kind:'triple',team_a:[t[0],t[1]],team_b:[t[2],s],contenders:t});
  candidates=candidates.filter(id=>id!==s);
 }
 for(let i=triple?3:0;i<chosen.length;i+=2){
  const a=chosen[i],b=chosen[i+1];
  const selected=supportPair(a,b,candidates,skills,prior.concat(fixtures),previousSupporters,random);
  fixtures.push({kind:kind==='final'?'final':'duel',team_a:[a,selected.s1],team_b:[b,selected.s2],contenders:[a,b]});
  candidates=candidates.filter(id=>id!==selected.s1&&id!==selected.s2);
 }
 if(fixtures.some(f=>new Set(f.team_a.concat(f.team_b)).size!==4))throw Error('Duplicate players in playoff fixture');
 return fixtures;
}
export function groupResults(fixtures,outcome){
 if(fixtures.some(f=>!(f.id in outcome)))throw Error('Complete all fixtures before advancing');
 const winners=[],losers=[];
 for(const f of fixtures){
  const team=outcome[f.id];if(team!==1&&team!==2)throw Error('Invalid winner team');
  const w=team===1?f.team_a:f.team_b;
  for(const c of f.contenders)(w.includes(c)?winners:losers).push(c);
 }
 if(new Set(winners.concat(losers)).size!==winners.length+losers.length)throw Error('A contender appeared twice in the same playoff wave');
 return {winners,losers};
}