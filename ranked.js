// CourtFlow Ranked Four Games v1 - no points-based ranking
export function initRanked({db,state,load,notify,escapeHTML,playerName}){
 const $=id=>document.getElementById(id);
 const rand=arr=>{const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
 const cache={roster:[],fixtures:[],brackets:[],awards:[],support:[]};
 const name=id=>escapeHTML(playerName(id));
 const pairs=(a,b)=>a.slice().sort().join('|')===b.slice().sort().join('|');
 const matches=()=>new Map(state.matches.map(m=>[m.id,m]));
 const won=(fixture)=>{const m=matches().get(fixture.match_id);if(!m||m.status!=='completed')return null;return m.winner_team===1?fixture.team_a:fixture.team_b};
 const contenderWon=f=>{const x=won(f);return x?f.contenders.filter(c=>x.includes(c)):null};
 const session=()=>state.sessions.find(s=>s.id===$('rSession')?.value);
 const sel=()=>session()?.id;
 const regular=()=>cache.fixtures.filter(f=>f.phase==='regular').sort((a,b)=>a.round_no-b.round_no||a.seq_no-b.seq_no);
 const playoffs=()=>cache.fixtures.filter(f=>f.phase==='playoff').sort((a,b)=>a.round_no-b.round_no||a.seq_no-b.seq_no);
 const done=f=>matches().get(f.match_id)?.status==='completed';
 const stats=()=>{const map=new Map(cache.roster.map(r=>[r.player_id,{id:r.player_id,w:0,l:0,g:0}]));for(const f of regular()){if(!done(f))continue;const winning=won(f);for(const id of f.contenders){const x=map.get(id);if(!x)continue;x.g++;if(winning.includes(id))x.w++;else x.l++}}return [...map.values()].sort((a,b)=>b.w-a.w||name(a.id).localeCompare(name(b.id)))};
 const h=(tag,content)=>'<'+tag+'>'+content+'</'+tag+'>';
 const msg=e=>notify(typeof e==='string'?e:e?.message||'Unexpected error');
 async function fetchAll(){const sid=sel();if(!sid){for(const k in cache)cache[k]=[];render();return}const tabs={roster:'cf_ranked_roster',fixtures:'cf_ranked_fixtures',brackets:'cf_ranked_brackets',awards:'cf_ranked_awards',support:'cf_ranked_supporters'};try{const results=await Promise.all(Object.entries(tabs).map(async ([k,t])=>{let {data,error}=await db.from(t).select('*').eq('session_id',sid);if(error)throw error;return [k,data||[]]}));for(const [k,v] of results)cache[k]=v;render()}catch(e){msg(e)}}
 function lineup(ids){const skill=id=>state.players.find(x=>x.id===id)?.skill||3;const teamSets=[[[ids[0],ids[1]],[ids[2],ids[3]]],[[ids[0],ids[2]],[ids[1],ids[3]]],[[ids[0],ids[3]],[ids[1],ids[2]]]];return rand(teamSets).sort((a,b)=>Math.abs(a[0].reduce((s,i)=>s+skill(i),0)-a[1].reduce((s,i)=>s+skill(i),0))-Math.abs(b[0].reduce((s,i)=>s+skill(i),0)-b[1].reduce((s,i)=>s+skill(i),0)))[0]}
 function scheduleRound(round,history){let ids=rand(cache.roster.map(r=>r.player_id));const playedPairs=new Set(history.flatMap(f=>[[f.team_a[0],f.team_a[1]],[f.team_b[0],f.team_b[1]]].map(a=>a.slice().sort().join('|'))));let best=[],bestCost=1e9;
 for(let trial=0;trial<400;trial++){const source=rand(ids);const plan=[],usedPairs=new Set();let cost=0;for(let i=0;i<source.length;i+=4){const four=source.slice(i,i+4),groups=lineup(four);for(const team of groups){const key=team.slice().sort().join('|');if(playedPairs.has(key))cost+=100;if(usedPairs.has(key))cost+=100;usedPairs.add(key)}plan.push({session_id:sel(),phase:'regular',round_no:round,seq_no:i/4+1,kind:'regular',team_a:groups[0],team_b:groups[1],contenders:four})}if(cost<bestCost){bestCost=cost;best=plan}if(cost===0)break}return best}
 async function insertFixtures(items){if(!items.length)return;const {error}=await db.from('cf_ranked_fixtures').insert(items);if(error)throw error;await load();await fetchAll()}
 async function lockRoster(){try{const {error}=await db.rpc('cf_ranked_lock_roster',{p_session_id:sel()});if(error)throw error;await fetchAll();msg('32-player ranked roster locked')}catch(e){msg(e)}}
 async function nextRound(){try{if(!cache.roster.length)throw Error('Lock 32-player roster first');let all=regular(),last=Math.max(0,...all.map(f=>f.round_no));if(all.some(f=>!done(f)))throw Error('Finish all matches of current round');if(last>=4)throw Error('Four regular rounds completed. Generate playoffs.');await insertFixtures(scheduleRound(last+1,all));msg('Round '+(last+1)+' ready. Eight matches.')}catch(e){msg(e)}}
 async function startFixture(id){try{const f=cache.fixtures.find(x=>x.id===id);if(!f||f.match_id)throw Error('Fixture already started');const court=Number($('rCourt').value);if(!Number.isInteger(court)||court<1||court>session().courts)throw Error('Choose a valid court');const {error}=await db.rpc('cf_ranked_start_fixture',{p_fixture_id:id,p_court_number:court});if(error)throw error;await load();await fetchAll();msg('Ranked match started')}catch(e){msg(e)}}
 async function finishFixture(id){try{const f=cache.fixtures.find(x=>x.id===id),m=matches().get(f?.match_id);if(!m||m.status!=='playing')throw Error('Match is not running');const a=Number($('ra_'+id).value),b=Number($('rb_'+id).value);if(!Number.isInteger(a)||!Number.isInteger(b)||a===b||a<0||b<0||a>99||b>99)throw Error('Enter different valid scores');const {error}=await db.rpc('cf_set_match_result',{p_match_id:m.id,p_score_a:a,p_score_b:b,p_reason:null});if(error)throw error;await load();await fetchAll();msg('Ranked result saved')}catch(e){msg(e)}}
 async function supporterToggle(id,checked){try{const q=checked?db.from('cf_ranked_supporters').upsert({session_id:sel(),player_id:id,volunteer:true}):db.from('cf_ranked_supporters').delete().eq('session_id',sel()).eq('player_id',id);const {error}=await q;if(error)throw error;await fetchAll()}catch(e){msg(e)}}
 const eligibleSupport=exclude=>cache.support.filter(s=>s.volunteer&&!exclude.includes(s.player_id)).map(x=>x.player_id);
 function pickSupport(contenders){const available=eligibleSupport(contenders);if(available.length<2)throw Error('Need volunteer non-contender supporters.');return available}
 function drawDuel(a,b,used=[]){const candidates=rand(eligibleSupport([a,b,...used]));if(candidates.length<2)throw Error('Need two eligible support players');let best=null,bestCost=Infinity;const skill=id=>state.players.find(p=>p.id===id)?.skill||3;for(let i=0;i<candidates.length;i++)for(let j=0;j<candidates.length;j++){if(i===j)continue;const x=candidates[i],y=candidates[j],cost=Math.abs(skill(a)+skill(x)-skill(b)-skill(y));if(cost<bestCost){bestCost=cost;best={team_a:[a,x],team_b:[b,y],contenders:[a,b]}}}return best}
 async function createBracket({contenders,tier,start,slots}){const {data,error}=await db.from('cf_ranked_brackets').insert({session_id:sel(),win_tier:tier,rank_start:start,slots,contenders:contenders.map(x=>x.id),meta:{live:contenders.map(x=>x.id),results:[],placements:[]}}).select('*').single();if(error)throw error;return data}
 async function award(placement,player_id){const {error}=await db.from('cf_ranked_awards').upsert({session_id:sel(),placement,player_id},{onConflict:'session_id,placement'});if(error)throw error}
 async function patchBracket(b,values){const {error}=await db.from('cf_ranked_brackets').update(values).eq('id',b.id);if(error)throw error}
 async function newPlayoffs(){try{if(cache.roster.length!==32||regular().length!==32||regular().some(f=>!done(f)))throw Error('Complete all 32 ranked regular matches first.');if(cache.brackets.some(b=>b.status==='active'))throw Error('Playoff already active.');let existing=cache.awards.length;let pos=existing+1;const ranked=stats();while(pos<=4){const excluded=new Set(cache.awards.map(a=>a.player_id));const unranked=ranked.filter(x=>!excluded.has(x.id));if(!unranked.length)throw Error('No eligible players');const tier=unranked[0].w,group=unranked.filter(x=>x.w===tier),slots=Math.min(group.length,5-pos);
 if(group.length<=slots){for(let i=0;i<group.length;i++)await award(pos+i,group[i].id);pos+=group.length;await fetchAll();continue;}
 const b=await createBracket({contenders:group,tier,start:pos,slots});await fetchAll();msg('Tiebreaker created: '+group.length+' contenders for '+slots+' placements');return}
 msg('Top 4 ranking finalized')}catch(e){msg(e)}}
 const fixturesFor=b=>playoffs().filter(f=>f.bracket_id===b.id);
 async function createDuelFixtures(b,playerIds,round){const shuffled=rand(playerIds);const items=[];for(let i=0;i<shuffled.length;i+=2){const item=drawDuel(shuffled[i],shuffled[i+1]);items.push({...item,session_id:sel(),phase:'playoff',round_no:round,bracket_id:b.id,seq_no:items.length+1,kind:'duel'})}await insertFixtures(items)}
 async function advance(){try{let b=cache.brackets.find(x=>x.status==='active');if(!b)throw Error('No active bracket.');let meta=b.meta||{},live=meta.live||b.contenders,round=Number(b.round_no||1),stage=fixturesFor(b).filter(f=>f.round_no===round);
 if(stage.length&&stage.some(f=>!done(f)))throw Error('Finish all playoff matches first.');
 if(stage.length){const survivors=stage.flatMap(f=>contenderWon(f)||[]);if(stage.length===1&&stage[0].kind==='triple'&&b.slots>=3){
 const triple=stage[0],pair=triple.contenders.filter(id=>!triple.team_a.includes(id)||triple.team_a.includes(id));const two=triple.team_a.filter(id=>triple.contenders.includes(id));
 const solo=triple.contenders.find(id=>!two.includes(id));const soloWon=contenderWon(triple).includes(solo);const placementTop=b.rank_start;
 await award(soloWon?placementTop:placementTop+2,solo);
 const duel=drawDuel(two[0],two[1],triple.team_a.concat(triple.team_b));
 await insertFixtures([{...duel,session_id:sel(),phase:'playoff',round_no:round+1,bracket_id:b.id,seq_no:1,kind:'final'}]);
 await patchBracket(b,{round_no:round+1,meta:{...meta,finalTwo:two,soloWon,live:two}});await fetchAll();msg('Final deciding match ready');return}
 if(stage.some(f=>f.kind==='bronze')){
 const final=stage.find(f=>f.kind==='final'),bronze=stage.find(f=>f.kind==='bronze');
 if(!final||!bronze)throw Error('Final and placement fixtures required');
 const fw=contenderWon(final)[0],fl=final.contenders.find(x=>x!==fw),bw=contenderWon(bronze)[0];
 await award(b.rank_start,fw);await award(b.rank_start+1,fl);
 if(b.slots>=3)await award(b.rank_start+2,bw);
 await patchBracket(b,{status:'completed',state:'finished',meta:{...meta,live:[]}});
 await fetchAll();msg('Final and bronze placements completed');return;
 }
 if(stage.some(f=>f.kind==='final')){
 const f=stage[0],win=contenderWon(f)[0],lose=f.contenders.find(x=>x!==win);
 const top=meta.soloWon?b.rank_start+1:b.rank_start;await award(top,win);await award(top+1,lose);
 await patchBracket(b,{status:'completed',state:'finished',meta:{...meta,live:[]}});await fetchAll();msg('3-way placement resolved');return}
 const winIds=survivors.filter(id=>stage.some(f=>f.contenders.includes(id)));const losers=stage.flatMap(f=>f.contenders.filter(id=>!contenderWon(f).includes(id)));
 if(winIds.length===2&&losers.length===2&&b.slots>=3){
 const final=drawDuel(winIds[0],winIds[1]);
 const bronze=drawDuel(losers[0],losers[1]);
 await insertFixtures([{...final,session_id:sel(),phase:'playoff',round_no:round+1,bracket_id:b.id,seq_no:1,kind:'final'},
 {...bronze,session_id:sel(),phase:'playoff',round_no:round+1,bracket_id:b.id,seq_no:2,kind:'bronze'}]);
 await patchBracket(b,{round_no:round+1,meta:{...meta,live:winIds,bronze:losers}});
 await fetchAll();msg('Final and 3rd-place match ready');return;
 }
 
 meta={...meta,live:winIds,losers:[...(meta.losers||[]),...losers]};live=winIds;round++;
 }
 if(live.length===3&&b.slots>=3){const three=rand(live);const support=rand(eligibleSupport(three));if(support.length<1)throw Error('Need an available volunteer support player for triple match');
 const fixture={session_id:sel(),phase:'playoff',round_no:round,bracket_id:b.id,seq_no:1,kind:'triple',team_a:[three[0],three[1]],team_b:[three[2],support[0]],contenders:three};
 await insertFixtures([fixture]);await patchBracket(b,{round_no:round,meta:{...meta,live}});await fetchAll();msg('Quick 3-way tiebreaker created');return}
 if(live.length===2&&b.slots>=2){const pair=drawDuel(live[0],live[1]);await insertFixtures([{...pair,session_id:sel(),phase:'playoff',round_no:round,bracket_id:b.id,seq_no:1,kind:'final'}]);await patchBracket(b,{round_no:round,meta:{...meta,live,soloWon:false}});await fetchAll();return}
 if(live.length===1&&b.slots===1){await award(b.rank_start,live[0]);await patchBracket(b,{status:'completed',state:'finished',meta:{...meta,live:[]}});await fetchAll();msg('Placement finalized');return}
 if(live.length>=4&&live.length%2===0){await createDuelFixtures(b,live,round);await patchBracket(b,{round_no:round,meta:{...meta,live}});await fetchAll();msg('Playoff round prepared');return}
 if(live.length===7&&b.slots===3){
 const group=rand(live),trio=group.slice(0,3),remaining=group.slice(3),support=rand(eligibleSupport(group));
 if(!support.length)throw Error('Need at least one volunteer support player');
 const t={session_id:sel(),phase:'playoff',round_no:round,bracket_id:b.id,seq_no:1,kind:'triple',team_a:[trio[0],trio[1]],team_b:[trio[2],support[0]],contenders:trio};
 const d1=drawDuel(remaining[0],remaining[1],t.team_a.concat(t.team_b)),d2=drawDuel(remaining[2],remaining[3],t.team_a.concat(t.team_b).concat(d1.team_a,d1.team_b));
 await insertFixtures([t,{...d1,session_id:sel(),phase:'playoff',round_no:round,bracket_id:b.id,seq_no:2,kind:'duel'},{...d2,session_id:sel(),phase:'playoff',round_no:round,bracket_id:b.id,seq_no:3,kind:'duel'}]);
 await patchBracket(b,{round_no:round,meta:{...meta,live}});
 await fetchAll();msg('Seven-way no-bye qualification ready (3 matches)');return;
 }
 if(live.length>=5&&live.length%2===1){throw Error('Odd contender count '+live.length+': this bracket requires an additional fairness format; no automatic byes were assigned.');}
 if(live.length<b.slots){throw Error('Remaining bracket needs consolation placement games; no auto rank was assigned.');}
 throw Error('This playoff stage requires organizer review. No byes or placements have been assigned.');
 }catch(e){msg(e)}}
 function render(){
 const sid=sel(),s=session();$('rActions').hidden=!s;
 if(!s){$('rSummary').innerHTML='<div class="empty">Choose a Ranked session above.</div>';return}
 const rs=regular(),st=stats(),cur=Math.max(0,...rs.map(f=>f.round_no)),completed=rs.filter(done).length,br=cache.brackets.find(x=>x.status==='active');
 $('rSummary').innerHTML='<div class="rank-pills"><span class="pill">'+cache.roster.length+'/32 roster</span><span class="pill">'+completed+'/32 matches</span><span class="pill">Round '+cur+'/4</span></div>';
 $('rLock').disabled=cache.roster.length>0;$('rNext').disabled=cache.roster.length!==32||cur>=4||rs.some(f=>!done(f));
 $('rPlayoffs').disabled=cache.roster.length!==32||completed!==32||!!br||cache.awards.length===4;
 $('rAdvance').disabled=!br;
 $('rStandings').innerHTML=st.length?'<div class="rank-table">'+st.map(x=>'<div class="rank-row"><strong>'+name(x.id)+'</strong><span>'+x.w+'W · '+x.l+'L · '+x.g+'/4</span></div>').join('')+'</div>':'<p class="hint small">Ranked roster is not locked yet.</p>';
 $('rAwards').innerHTML=cache.awards.length?cache.awards.sort((a,b)=>a.placement-b.placement).map(a=>'<div class="rank-row"><strong>'+(['Player of the Night','1st Runner-Up','2nd Runner-Up','3rd Runner-Up'][a.placement-1])+'</strong><span>'+name(a.player_id)+'</span></div>').join(''):'<p class="hint small">Top 4 will appear after ranked playoffs.</p>';
 $('rSupport').innerHTML=state.players.filter(p=>p.active&&(cache.roster.some(r=>r.player_id===p.id))).map(p=>'<label class="rank-row"><span>'+name(p.id)+' <small>Skill '+p.skill+'</small></span><input class="rank-check" type="checkbox" data-support="'+p.id+'" '+(cache.support.some(x=>x.player_id===p.id&&x.volunteer)?'checked':'')+'></label>').join('')||'<p class="hint small">Lock roster first.</p>';
 $('rSupport').querySelectorAll('[data-support]').forEach(x=>x.onchange=()=>supporterToggle(x.dataset.support,x.checked));
 const all=rs.concat(playoffs()),visible=all.filter(f=>!done(f)||f.phase==='playoff').sort((a,b)=>a.phase.localeCompare(b.phase)||a.round_no-b.round_no||a.seq_no-b.seq_no);
 $('rFixtures').innerHTML=visible.map(f=>{const m=matches().get(f.match_id);const status=m?.status||'Ready';const names=t=>t.map(name).join(' + ');return '<div class="rank-match"><div class="flex"><span class="pill">'+(f.phase==='regular'?'Regular':'Playoff')+' · Round '+f.round_no+' · Match '+f.seq_no+'</span><span class="hint small">'+status+'</span></div><div class="rank-versus"><div>'+names(f.team_a)+'</div><b>VS</b><div>'+names(f.team_b)+'</div></div>'+(m?.status==='playing'?'<div class="rank-controls"><input id="ra_'+f.id+'" type="number" value="11" min="0" max="99"><input id="rb_'+f.id+'" type="number" value="8" min="0" max="99"><button data-finish="'+f.id+'">Save result</button></div>':!f.match_id?'<button class="secondary" data-start="'+f.id+'">Start on selected court</button>':'<p class="hint small">Result: '+m.score_a+'–'+m.score_b+'</p>')+'</div>'}).join('')||'<p class="hint small">No ranked fixtures yet.</p>';
 $('rFixtures').querySelectorAll('[data-start]').forEach(x=>x.onclick=()=>startFixture(x.dataset.start));
 $('rFixtures').querySelectorAll('[data-finish]').forEach(x=>x.onclick=()=>finishFixture(x.dataset.finish));
 }
 const css=document.createElement('style');css.textContent='.rank-pills,.rank-controls{display:flex;gap:8px;flex-wrap:wrap}.rank-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px;border-bottom:1px solid #343c4a}.rank-match{padding:14px;border:1px solid #374252;border-radius:12px;margin:10px 0;background:#1c2531}.rank-versus{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:12px 0;font-size:13px}.rank-versus>b{color:#f3c925;font-size:11px}.rank-controls>*{flex:1 1 90px;min-width:0}.rank-check{width:auto!important}.rank-scroll{max-height:700px;overflow:auto}.rank-section{scroll-margin-top:130px}';document.head.append(css);
 $('adminPanel').insertAdjacentHTML('beforeend','<div class="card rank-section" id="rPanel"><h2>🏆 Ranked · 4 Games</h2><p class="hint small">32 locked players · random rotating partners · wins-only standings · no automatic byes · support-player playoffs. Tiebreakers never alter original 4-game records.</p><label>Ranked session<select id="rSession"></select></label><div id="rSummary"></div><div id="rActions"><div class="stack"><button id="rLock">Lock 32-player roster</button><button id="rNext">Generate next round</button></div><div class="stack"><button class="secondary" id="rPlayoffs">Determine Top 4 / Start playoffs</button><button class="secondary" id="rAdvance">Generate next playoff stage</button></div><label>Start match on court<input id="rCourt" type="number" min="1" max="10" value="1"></label><h3>Ranked Standings</h3><div id="rStandings"></div><h3>Top 4 Awards</h3><div id="rAwards"></div><h3>Support Player Volunteers</h3><p class="hint small">Players may opt in even if already Champion or eliminated. Support games do not change their record. Choose supporters of similar skill.</p><div id="rSupport" class="rank-scroll"></div><h3>Fixtures & Scores</h3><div id="rFixtures"></div></div></div>');
 $('rSession').onchange=fetchAll;$('rLock').onclick=lockRoster;$('rNext').onclick=nextRound;$('rPlayoffs').onclick=newPlayoffs;$('rAdvance').onclick=advance;
 function refreshOptions(){const s=sel();const choices=state.sessions.filter(x=>x.mode==='ranked_4');$('rSession').innerHTML='<option value="">Choose ranked session</option>'+choices.map(x=>'<option value="'+x.id+'">'+escapeHTML(x.title)+'</option>').join('');if(choices.some(x=>x.id===s))$('rSession').value=s}
 const setState=()=>{const sid=sel();refreshOptions();if(sel()!==sid){fetchAll();return}render()};
 // Host application calls this after its normal load() finished.
 return {sync:async()=>{const selected=sel();refreshOptions();if(sel()!==selected||!cache.fixtures.length&&selected)await fetchAll();else render()},fetch:fetchAll,render};
}
