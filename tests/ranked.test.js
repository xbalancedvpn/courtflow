import test from 'node:test';
import assert from 'node:assert/strict';
import {runRankedDryRun} from '../ranked-qa.js';
import {createPlayoffFixtures} from '../ranked-core.js';
import {newPlacementState,preparePlacementWave,settlePlacementWave} from '../ranked-playoff-engine.js';
import {summarizeTournament} from '../tournament-center-core.js';

test('100 full 32-player tournaments produce exactly four awards',()=>{
 const r=runRankedDryRun(100);
 assert.equal(r.passed,true);assert.equal(r.games,3200);
 assert.equal(r.repeatPartnerConflicts,0);
 assert.equal(r.mutatedDatabase,false);
});
test('zero non-contender supporters reports a safe, explicit failure',()=>{
 const ids=Array.from({length:32},(_,i)=>'p'+i);
 assert.throws(()=>createPlayoffFixtures({players:ids,allContenders:ids,volunteers:[]}),/non-contender volunteers/);
});
test('three-way tiebreaker keeps approved two-game decision structure',()=>{
 const players=['a','b','c'],supporters=['s1','s2','s3','s4'];
 let state=newPlacementState(players,2,3);
 const first=preparePlacementWave(state,ids=>createPlayoffFixtures({players:ids,allContenders:players,volunteers:supporters}));
 assert.equal(first.fixtures.length,1);
 const f={...first.fixtures[0],id:'t1'};
 assert.equal(f.kind,'triple');
 for(const winner of [1,2]){
  const after=settlePlacementWave(first.state,[f],{t1:winner});
  assert.equal(after.state.awards.length,1);
  assert.equal(after.state.jobs.length,1);
  const second=preparePlacementWave(after.state,ids=>createPlayoffFixtures({players:ids,allContenders:players,volunteers:supporters}));
  assert.equal(second.fixtures.length,1);
  const d={...second.fixtures[0],id:'t2'};
  const settled=settlePlacementWave(second.state,[d],{t2:1});
  assert.equal(settled.state.awards.length,3);
  assert.deepEqual(settled.state.awards.map(x=>x.placement).sort(),[2,3,4]);
 }
});
test('standings exclude playoff wins from regular totals',()=>{
 const session={id:'q',title:'QA',courts:2,mode:'ranked_4',status:'active'};
 const fixtures=[{session_id:'q',phase:'regular',contenders:['a','b','c','d'],team_a:['a','b'],team_b:['c','d'],match_id:'m1'},
 {session_id:'q',phase:'playoff',contenders:['a','c'],team_a:['a','b'],team_b:['c','d'],match_id:'m2'}];
 const matches=[{id:'m1',session_id:'q',status:'completed',winner_team:1},{id:'m2',session_id:'q',status:'completed',winner_team:2}];
 const roster=['a','b','c','d'].map(player_id=>({session_id:'q',player_id}));
 const stats=summarizeTournament({session,fixtures,matches,roster});
 assert.equal(stats.standings.find(x=>x.id==='a').wins,1);
 assert.equal(stats.standings.find(x=>x.id==='c').wins,0);
});
