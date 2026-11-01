// CourtFlow GC paste helper: conservative, inspectable parsing. Never writes to the database.
export const GC_SKILLS = Object.freeze([
 {value:1,code:'BEG',label:'Beginner'},
 {value:2,code:'NOV',label:'Novice'},
 {value:3,code:'ILO',label:'Intermediate Low'},
 {value:4,code:'IHI',label:'Intermediate High'},
 {value:5,code:'ADV',label:'Advance'},
 {value:6,code:'PRO',label:'Pro'}
]);
export const normalizePlayerName=name=>String(name||'').replace(/\u00a0/g,' ').replace(/\s+/gu,' ').trim();
export const nameKey=name=>normalizePlayerName(name).toLocaleLowerCase('en');
export const validPlayerName=name=>{
 const s=normalizePlayerName(name);
 return s.length>=2&&s.length<=90&&/[\p{L}]/u.test(s)&&!/[<>{};=/\\]/u.test(s)&&!/\bhttps?:\/\//i.test(s);
};
const SKILL_ALIASES={
 beg:1,beginner:1,nov:2,novice:2,ilo:3,'intermediate low':3,
 ihi:4,'intermediate high':4,adv:5,advance:5,advanced:5,pro:6
};
const HEADERS=/^(?:players?(?:\s+list)?|participants?(?:\s+list)?|list(?:ahan)?(?:\s+ng\s+players)?|name(?:s)?|slot(?:s)?|registration(?:\s+list)?|roster|confirmed(?:\s+players)?|open\s+play(?:\s+list)?|full\s+name|attendance|add\s+your\s+name|mga\s+players)\s*[:：-]?$/i;
const MESSAGES=/^(?:sent|seen|updated|edited|type\s+your\s+name|please\s+register|kindly\s+register|copy\s+paste|cutoff|deadline|thank\s+you|salamat|good\s+(?:morning|evening|afternoon)|pm\s+me)\b/i;
const PAYMENT_TAIL=/(?:\s*(?:[-–—:]\s*|\(\s*|\[\s*)(?:paid|unpaid|partial|pending|confirmed|reserved|gcash|cash|payment done|settled)\s*[\])]?)+\s*$/i;
const SKILL_TAIL=/\s*(?:[-–—]\s*|\(\s*|\[\s*)(beginner|novice|intermediate\s+low|intermediate\s+high|advanced?|BEG|NOV|ILO|IHI|ADV|PRO)\s*[\]) ]*\s*$/i;
function extractLine(raw,defaultSkill){
 let line=normalizePlayerName(raw);
 if(!line||/^https?:\/\//i.test(line)||/^(?:\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?|\d+[\s/]*(?:slots?|players?))$/i.test(line))return null;
 if(HEADERS.test(line)||MESSAGES.test(line)||/^[\p{P}\p{S}\d\s]+$/u.test(line))return null;
 // Messenger list numbers, checkboxes and bullet markers.
 line=line.replace(/^(?:\[\s*(?:x|✓)?\s*\]\s*|(?:\d{1,3})\s*[.)\-:]\s*|[-*•●◦✅✔️☑️]\s*)+/u,'').trim();
 line=line.replace(/^(?:name|player)\s*[:：]\s*/i,'').trim();
 if(HEADERS.test(line)||MESSAGES.test(line))return null;
 let clean=line;
 for(let n=0;n<2;n++)clean=clean.replace(PAYMENT_TAIL,'').trim();
 clean=clean.replace(/[\s✅☑️✔️🏓]+$/gu,'').trim();
 let skill=Number(defaultSkill)||3;
 const skillTag=clean.match(SKILL_TAIL);
 if(skillTag){skill=SKILL_ALIASES[skillTag[1].toLowerCase().replace(/\s+/g,' ')]||skill;clean=clean.slice(0,skillTag.index).trim()}
 const name=normalizePlayerName(clean);
 if(!name||HEADERS.test(name)||MESSAGES.test(name))return null;
 return {name,skill};
}
export function parseGCList(text,{defaultSkill=3,maxNames=100}={}){
 const rows=[],ignored=[],duplicates=[];
 const seen=new Set();
 const lines=String(text||'').split(/\r?\n/u);
 for(let i=0;i<lines.length;i++){
  const textLine=lines[i].trim();if(!textLine)continue;
  const row=extractLine(textLine,defaultSkill);
  if(!row){ignored.push({line:i+1,text:textLine});continue}
  const key=nameKey(row.name);
  if(seen.has(key)){duplicates.push({line:i+1,name:row.name});continue}
  seen.add(key);
  rows.push({...row,sourceLine:i+1,valid:validPlayerName(row.name)});
 }
 return {rows,ignored,duplicates,exceedsLimit:rows.length>maxNames};
}
export function planGCImport(rows,players,attendance,sessionId){
 const directory=new Map(),registered=new Set();
 for(const p of players||[]){
  const k=nameKey(p.name);
  if(!directory.has(k))directory.set(k,[]);
  directory.get(k).push(p);
 }
 for(const a of attendance||[])if(a.session_id===sessionId)registered.add(a.player_id);
 const seen=new Set();
 return rows.map(r=>{
  const name=normalizePlayerName(r.name),key=nameKey(name),matching=directory.get(key)||[];
  let status='new';
  if(!validPlayerName(name))status='invalid';
  else if(seen.has(key))status='duplicate';
  else if(matching.length>1)status='ambiguous';
  else if(matching.length===1&&!matching[0].active)status='inactive';
  else if(matching.length===1&&registered.has(matching[0].id))status='registered';
  else if(matching.length===1)status='existing';
  seen.add(key);
  return {...r,name,status,existingId:matching.length===1?matching[0].id:null};
 });
}
