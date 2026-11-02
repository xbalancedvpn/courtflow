export function initEventOperations({db,state,load,notify,dialogs,getEvent,playerName,escapeHTML}){
const root=document.createElement('section');root.id='eventOperations';root.className='card';root.innerHTML='<h2>Event Settings</h2><div id="eoSummary"></div><div class="stack"><button id="eoStart">Start Session</button><button id="eoEnd" class="secondary">End Session</button></div><div class="stack"><button id="eoEdit">Edit event</button><button class="secondary" id="eoArchive">Archive event</button><button class="secondary" id="eoReopen">Reopen / restore</button><button class="secondary" id="eoDelete">Delete empty event</button></div>';
document.getElementById('adminPanel').append(root);
const edit=root.querySelector('#eoEdit'),archive=root.querySelector('#eoArchive'),reopen=root.querySelector('#eoReopen'),del=root.querySelector('#eoDelete');
const current=()=>state.sessions.find(s=>s.id===getEvent());
const start=root.querySelector('#eoStart'),end=root.querySelector('#eoEnd');
start.onclick=async()=>{const s=current();if(!s||!await dialogs.confirm('Start '+s.title+'? Live court matchups will now be visible publicly.','Start Session'))return;const {error}=await db.rpc('cf_event_lifecycle',{p_session_id:s.id,p_action:'start'});if(error)return notify(error.message);await load();notify('Session started')};
let ending=false;
async function finishSession(action,sessionId){
 if(ending)return;ending=true;end.disabled=true;
 try{
  const {data,error}=await db.rpc('cf_event_lifecycle',{p_session_id:sessionId,p_action:action});
  if(error)throw error;
  const {data:verified,error:verificationError}=await db.from('cf_sessions').select('status').eq('id',sessionId).single();
  if(verificationError)throw verificationError;
  if(verified?.status!=='closed')throw Error('Session did not close. Refresh and try again.');
  await load();
  notify('Session ended successfully'+(data?.cancelled_matches?' · '+data.cancelled_matches+' unfinished match(es) cancelled':''));
 }catch(error){notify(error?.message||'End Session failed. Please try again.')}
 finally{ending=false;render()}
}
end.onclick=async()=>{
 const s=current();if(!s||ending)return;
 try{
  const {count,error}=await db.from('cf_matches').select('id',{count:'exact',head:true}).eq('session_id',s.id).eq('status','playing');
  if(error)throw error;
  if(count>0){
   const pending=await dialogs.confirm('There '+(count===1?'is 1 unfinished match':'are '+count+' unfinished matches')+' in '+s.title+'. You can finish and save the scores in Live Courts, or cancel unfinished matches and end the session. Completed games and scores will be kept.','Unfinished Matches',{actionLabel:'Choose End Options'});
   if(!pending)return;
   if(s.mode==='ranked_4')return notify('Finish Ranked matches in Live Courts first to protect fixture and playoff records.');
   const confirmed=await dialogs.confirm('Cancel '+count+' unfinished match(es) and END '+s.title+'? Cancelled games will have no winner and will not count toward wins/losses. Completed results are preserved.','Cancel Unfinished & End Session',{actionLabel:'Cancel Matches & End',danger:true});
   if(!confirmed)return;
   await finishSession('end_cancel',s.id);
  }else{
   if(!await dialogs.confirm('End '+s.title+'? Completed results will be saved and the event will leave active public listings.','End Session',{actionLabel:'End Session'}))return;
   await finishSession('end',s.id);
  }
 }catch(error){notify(error?.message||'Unable to check playing matches')}
};
async function act(action,values={}){const s=current();if(!s)return;const {error}=await db.rpc('cf_event_manage',{p_session_id:s.id,p_action:action,p_title:values.title||null,p_session_date:values.date||null,p_courts:values.courts?Number(values.courts):null,p_confirm_title:values.confirm||null});if(error){notify(error.message);return}if(action==='edit'){const {error:e}=await db.from('cf_sessions').update({location:values.location||'',fee:Number(values.fee||0)}).eq('id',s.id);if(e){notify(e.message);return}}await load();notify('Event '+action+' completed')}
edit.onclick=async()=>{const s=current();if(!s)return;const v=await dialogs.form('Edit event',[{key:'title',label:'Event title',value:s.title,required:true},{key:'location',label:'Location',value:s.location||''},{key:'fee',label:'Event fee (PHP)',type:'number',value:String(s.fee||0)},{key:'courts',label:'Number of courts',type:'number',value:String(s.courts),required:true}]);if(!v)return;const date=await dialogs.date(s.session_date);if(!date)return;await act('edit',{...v,date})};
let archiving=false;
archive.onclick=async()=>{
 const s=current();if(!s||archiving||s.status!=='closed'||s.is_archived)return;
 const count=state.attendance.filter(a=>a.session_id===s.id&&a.checked_in).length;
 if(!await dialogs.confirm('Archive '+s.title+' and automatically check out '+count+' checked-in player(s)? Scores, match history and attendance records will be preserved. The session will be marked Archived.','Archive Session',{actionLabel:'Archive & Check Out'}))return;
 archiving=true;archive.disabled=true;
 try{
  const {data,error}=await db.rpc('cf_event_manage',{p_session_id:s.id,p_action:'archive'});
  if(error)throw error;
  const {data:verified,error:verificationError}=await db.from('cf_sessions').select('status,is_archived').eq('id',s.id).single();
  if(verificationError)throw verificationError;
  const {count:remaining,error:attendanceError}=await db.from('cf_attendance').select('player_id',{count:'exact',head:true}).eq('session_id',s.id).eq('checked_in',true);
  if(attendanceError)throw attendanceError;
  if(!verified?.is_archived||verified?.status!=='closed'||remaining!==0)throw Error('Archive verification failed; refresh event status.');
  await load();
  notify('Session archived · '+(data?.checked_out??count)+' player(s) checked out');
 }catch(e){notify(e.message||'Unable to archive session')}
 finally{archiving=false;render()}
};
reopen.onclick=async()=>{const s=current();if(s&&await dialogs.confirm('Reopen and restore this event?','Reopen event'))await act('reopen')};
del.onclick=async()=>{const s=current();if(!s)return;const v=await dialogs.form('Delete Event',[{key:'confirm',label:'Type DELETE to confirm',placeholder:'DELETE',required:true}],'This permanently deletes only events without match or Ranked history. Otherwise, use Archive.',{submitLabel:'Delete Event',danger:true,requirePhrase:{key:'confirm',value:'DELETE'}});if(!v)return;if(!await dialogs.confirm('Permanently delete this empty event? This cannot be undone.','Final confirmation',{actionLabel:'Delete Event',danger:true}))return;await act('delete',{confirm:s.title})};
function render(){const s=current();root.querySelector('#eoSummary').textContent=s?s.title+' · '+(s.is_archived?'archived':s.status)+' · '+s.session_date+' · '+s.courts+' courts':'';start.disabled=!s||s.status!=='upcoming';end.disabled=!s||s.status!=='active';reopen.disabled=!s||s.status==='active';archive.textContent=s?.is_archived?'Archived':'Archive Session';archive.hidden=!s||s.status!=='closed'||!!s.is_archived;archive.disabled=!s||s.status!=='closed'||!!s.is_archived||archiving;edit.disabled=!s;del.disabled=!s}
return {render};
}