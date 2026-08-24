'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { hasSupabase, supabase } from '@/lib/supabase';
import { localDateKey, longestStreak, streak } from '@/lib/stats';

type View='home'|'meditate'|'calendar'|'habits'|'partner'|'progress'|'journal'|'profile';
type Habit={id:string;name:string;icon:string;color:string;schedule:number[];target?:string;reminder?:string;archived:boolean;entries:Record<string,number>};
type Session={id:string;endedAt:string;minutes:number;moodBefore?:string;moodAfter?:string;rating?:number;note?:string;sounds:string[]};
type Timer={durationSec:number;prepSec:number;intervalMin:number;phase:'idle'|'prep'|'running'|'paused'|'complete';endAt:number|null;remaining:number};

const TZ=Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
const today=()=>localDateKey(new Date(),TZ);
const PRESETS=[5,10,15,20,30,45,60];
const SOUNDS=[['rain','Rain','🌧️'],['ocean','Ocean waves','🌊'],['forest','Forest','🌿'],['river','Flowing river','💧'],['birds','Birds','🐦'],['fire','Fireplace','🔥'],['wind','Wind','🍃'],['night','Night ambience','🌙'],['bowls','Singing bowls','◉'],['white','White noise','◌']] as const;
const COLORS=['#6f8b75','#7fa2a0','#d0a781','#aaa8b5','#c58c7b','#8e9a78'];
const ICONS=['🌿','🏃','📖','✍️','💧','🌙','☀️','🧘','🍎','🎨'];
const mkDate=(days:number)=>new Date(Date.now()-days*86400000).toISOString();

const demoSessions:Session[]=[
  {id:'s1',endedAt:mkDate(0),minutes:12,moodBefore:'😐',moodAfter:'🙂',rating:5,note:'Felt much quieter after the first few minutes.',sounds:['rain']},
  {id:'s2',endedAt:mkDate(1),minutes:10,moodBefore:'😣',moodAfter:'😌',rating:4,note:'Breath felt steady today.',sounds:['ocean','birds']},
  {id:'s3',endedAt:mkDate(2),minutes:15,rating:5,sounds:['forest']},
  {id:'s4',endedAt:mkDate(3),minutes:8,rating:4,sounds:['night']},
  {id:'s5',endedAt:mkDate(5),minutes:20,rating:5,sounds:['rain','river']},
  {id:'s6',endedAt:mkDate(6),minutes:10,rating:4,sounds:[]},
  {id:'s7',endedAt:mkDate(8),minutes:25,rating:5,sounds:['bowls']}
];

function seedHabit(id:string,name:string,icon:string,color:string,target:string,skip:number[]=[]):Habit{
  const entries:Record<string,number>={};
  for(let i=0;i<12;i++){const d=new Date();d.setDate(d.getDate()-i);if(!skip.includes(i))entries[localDateKey(d,TZ)]=1}
  return{id,name,icon,color,target,schedule:[0,1,2,3,4,5,6],archived:false,entries};
}
const demoHabits=[
  seedHabit('h1','Workout','🏃',COLORS[0],'30 minutes',[4]),
  seedHabit('h2','Read','📖',COLORS[1],'20 pages',[2,8,9]),
  seedHabit('h3','Journal','✍️',COLORS[3],'1 entry',[1,3,5,7]),
  seedHabit('h4','No social media','🌿',COLORS[2],'Daily',[1,6])
];

function fmt(sec:number){sec=Math.max(0,Math.round(sec));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function mapMinutes(s:Session[]){const out:Record<string,number>={};s.forEach(x=>{const k=localDateKey(new Date(x.endedAt),TZ);out[k]=(out[k]||0)+x.minutes});return out}
function bell(){try{const AC=window.AudioContext||(window as any).webkitAudioContext;const c=new AC(),o=c.createOscillator(),g=c.createGain();o.frequency.value=660;g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.17,c.currentTime+.03);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+1.3);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+1.4)}catch{}}

export default function StillApp(){
  const [ready,setReady]=useState(false),[signedIn,setSignedIn]=useState(false),[authMode,setAuthMode]=useState<'login'|'signup'>('login'),[authMsg,setAuthMsg]=useState('');
  const [view,setView]=useState<View>('home'),[dark,setDark]=useState(false),[toast,setToast]=useState('');
  const [sessions,setSessions]=useState<Session[]>(demoSessions),[habits,setHabits]=useState<Habit[]>(demoHabits),[selectedHabit,setSelectedHabit]=useState('h1');
  const [calendarMonth,setCalendarMonth]=useState(new Date()),[calendarMode,setCalendarMode]=useState<'meditation'|'habit'>('meditation'),[selectedDate,setSelectedDate]=useState(today());
  const [targetMin,setTargetMin]=useState(10),[customH,setCustomH]=useState(0),[customM,setCustomM]=useState(10),[prep,setPrep]=useState(10),[interval,setInterval]=useState(0);
  const [timer,setTimer]=useState<Timer>({durationSec:600,prepSec:10,intervalMin:0,phase:'idle',endAt:null,remaining:600});
  const [sounds,setSounds]=useState<string[]>(['rain']),[volume,setVolume]=useState(34),[mixes,setMixes]=useState([{name:'Rainy forest',sounds:['rain','forest']}]);
  const [showHabit,setShowHabit]=useState(false),[editHabit,setEditHabit]=useState<Habit|null>(null),[showReflection,setShowReflection]=useState(false);
  const [moodBefore,setMoodBefore]=useState('😐'),[moodAfter,setMoodAfter]=useState('😌'),[rating,setRating]=useState(5),[note,setNote]=useState('');
  const [privacy,setPrivacy]=useState<any>({streak:true,today:true,weekly:true,sharedHabits:false}),[reaction,setReaction]=useState(''),[challengeDay,setChallengeDay]=useState(5);
  const audio=useRef<{ctx:AudioContext|null,sources:AudioScheduledSourceNode[],nodes:AudioNode[]}>({ctx:null,sources:[],nodes:[]});
  const intervalCount=useRef(0);

  useEffect(()=>{document.documentElement.classList.toggle('dark',dark)},[dark]);
  useEffect(()=>{if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{})},[]);
  useEffect(()=>{try{const s=JSON.parse(localStorage.getItem('still-state')||'{}');if(s.sessions)setSessions(s.sessions);if(s.habits)setHabits(s.habits);if(s.signedIn)setSignedIn(true);const t=JSON.parse(localStorage.getItem('still-timer')||'null');if(t?.endAt&&['running','prep'].includes(t.phase)){const r=Math.max(0,Math.ceil((t.endAt-Date.now())/1000));setTimer({...t,remaining:r,phase:r?t.phase:'complete'})}}catch{}setReady(true)},[]);
  useEffect(()=>{if(ready)localStorage.setItem('still-state',JSON.stringify({sessions,habits,signedIn}))},[sessions,habits,signedIn,ready]);
  useEffect(()=>{if(ready)localStorage.setItem('still-timer',JSON.stringify(timer))},[timer,ready]);
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),2300);return()=>clearTimeout(id)},[toast]);

  useEffect(()=>{
    if(!timer.endAt||!['prep','running'].includes(timer.phase))return;
    const id=window.setInterval(()=>{
      const r=Math.max(0,Math.ceil((timer.endAt!-Date.now())/1000));setTimer(t=>({...t,remaining:r}));
      if(timer.phase==='running'&&timer.intervalMin>0){const elapsed=timer.durationSec-r,every=timer.intervalMin*60;if(elapsed>0&&Math.floor(elapsed/every)>intervalCount.current){intervalCount.current=Math.floor(elapsed/every);bell()}}
      if(r<=0){if(timer.phase==='prep'){bell();setTimer(t=>({...t,phase:'running',remaining:t.durationSec,endAt:Date.now()+t.durationSec*1000}))}else{bell();stopAudio();setTimer(t=>({...t,phase:'complete',remaining:0,endAt:null}));setShowReflection(true)}}
    },250);return()=>clearInterval(id)
  },[timer.endAt,timer.phase,timer.intervalMin,timer.durationSec]);

  const medMap=useMemo(()=>mapMinutes(sessions),[sessions]);
  const medKeys=Object.keys(medMap).filter(k=>medMap[k]>0),currentStreak=streak(medKeys,today()),longest=longestStreak(medKeys);
  const total=sessions.reduce((a,b)=>a+b.minutes,0),avg=sessions.length?Math.round(total/sessions.length):0;
  const week=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return medMap[localDateKey(d,TZ)]||0});
  const month=sessions.filter(s=>{const d=new Date(s.endedAt),n=new Date();return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()}).reduce((a,b)=>a+b.minutes,0);
  const activeHabit=habits.find(h=>h.id===selectedHabit)||habits[0];

  async function authSubmit(e:FormEvent<HTMLFormElement>){e.preventDefault();setAuthMsg('');const fd=new FormData(e.currentTarget),email=String(fd.get('email')||''),password=String(fd.get('password')||'');if(!email.includes('@')||password.length<6){setAuthMsg('Use a valid email and a password of at least 6 characters.');return}if(!supabase){setSignedIn(true);setToast('Demo account opened');return}const r=authMode==='login'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password});if(r.error)setAuthMsg(r.error.message);else setSignedIn(true)}
  async function google(){if(!supabase){setSignedIn(true);setToast('Demo account opened');return}await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin}})}
  async function reset(){if(!supabase){setToast('Demo reset email simulated');return}const email=prompt('Email address');if(email){const r=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});setToast(r.error?r.error.message:'Reset email sent')}}
  async function logout(){if(supabase)await supabase.auth.signOut();localStorage.removeItem('still-state');setSignedIn(false)}

  function setDuration(m:number){if(['running','prep'].includes(timer.phase))return;setTargetMin(m);setCustomH(0);setCustomM(m);setTimer(t=>({...t,durationSec:m*60,remaining:m*60,phase:'idle'}))}
  function applyCustom(){const m=Math.max(1,Math.min(1440,customH*60+customM));setTargetMin(m);setTimer(t=>({...t,durationSec:m*60,remaining:m*60,phase:'idle'}));setToast(`Custom timer: ${m} min`)}
  function start(){bell();intervalCount.current=0;startAudio();if(timer.phase==='paused'){setTimer(t=>({...t,phase:'running',endAt:Date.now()+t.remaining*1000}));return}const phase=prep>0?'prep':'running',r=prep>0?prep:timer.durationSec;setTimer(t=>({...t,prepSec:prep,intervalMin:interval,phase,endAt:Date.now()+r*1000,remaining:r}))}
  function pause(){if(!timer.endAt)return;const r=Math.max(0,Math.ceil((timer.endAt-Date.now())/1000));setTimer(t=>({...t,phase:'paused',endAt:null,remaining:r}));fade(false)}
  function restart(){stopAudio();setTimer(t=>({...t,phase:'idle',endAt:null,remaining:t.durationSec}));setToast('Session restarted')}
  function end(){if(confirm('End this session? It will not be saved unless you confirm completion.')){stopAudio();setTimer(t=>({...t,phase:'idle',endAt:null,remaining:t.durationSec}))}}
  function saveReflection(){const s:Session={id:crypto.randomUUID(),endedAt:new Date().toISOString(),minutes:Math.max(1,Math.round(timer.durationSec/60)),moodBefore,moodAfter,rating,note:note.trim()||undefined,sounds};setSessions(v=>[s,...v]);setTimer(t=>({...t,phase:'idle',remaining:t.durationSec,endAt:null}));setShowReflection(false);setNote('');setToast('Session saved ✦');setView('home')}

  function toggleHabit(h:Habit){const k=today();setHabits(v=>v.map(x=>x.id===h.id?{...x,entries:{...x.entries,[k]:x.entries[k]?0:1}}:x));setToast(h.entries[k]?'Completion removed':'Quiet win recorded ✦')}
  function hstats(h:Habit){const keys=Object.keys(h.entries).filter(k=>h.entries[k]>0);const done7=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return keys.includes(localDateKey(d,TZ))}).filter(Boolean).length;const mon=keys.filter(k=>k.slice(0,7)===today().slice(0,7)).length;return{current:streak(keys,today()),longest:longestStreak(keys),total:keys.length,weekly:Math.round(done7/7*100),monthly:Math.round(mon/new Date().getDate()*100)}}
  function saveHabit(e:FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget),name=String(fd.get('name')||'').trim();if(!name){setToast('Give the habit a name');return}const schedule=[0,1,2,3,4,5,6].filter(d=>fd.get('d'+d));const h:Habit={id:editHabit?.id||crypto.randomUUID(),name,icon:String(fd.get('icon')||'🌿'),color:String(fd.get('color')||COLORS[0]),schedule:schedule.length?schedule:[0,1,2,3,4,5,6],target:String(fd.get('target')||'')||undefined,reminder:String(fd.get('reminder')||'')||undefined,archived:false,entries:editHabit?.entries||{}};setHabits(v=>editHabit?v.map(x=>x.id===h.id?h:x):[...v,h]);setSelectedHabit(h.id);setShowHabit(false);setEditHabit(null);setToast(editHabit?'Habit updated':'Habit created')}
  function archive(h:Habit){setHabits(v=>v.map(x=>x.id===h.id?{...x,archived:!x.archived}:x));setToast(h.archived?'Habit restored':'Habit archived')}
  function del(h:Habit){if(confirm(`Delete “${h.name}”?`)){setHabits(v=>v.filter(x=>x.id!==h.id));setToast('Habit deleted')}}

  function noise(ctx:AudioContext,brown=false){const b=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),a=b.getChannelData(0);let last=0;for(let i=0;i<a.length;i++){const w=Math.random()*2-1;if(brown){last=(last+.02*w)/1.02;a[i]=last*3}else a[i]=w*.4}return b}
  function stopAudio(){audio.current.sources.forEach(s=>{try{s.stop()}catch{}});audio.current.nodes.forEach(n=>{try{n.disconnect()}catch{}});audio.current.sources=[];audio.current.nodes=[]}
  function fade(up:boolean){const c=audio.current.ctx;if(!c)return;(audio.current.nodes.filter((n:any)=>n.gain) as GainNode[]).forEach(g=>{try{g.gain.linearRampToValueAtTime(up?volume/100*.12:.0001,c.currentTime+.7)}catch{}})}
  function startAudio(preview?:string){stopAudio();const ids=preview?[preview]:sounds;if(!ids.length)return;try{const AC=window.AudioContext||(window as any).webkitAudioContext;const c=audio.current.ctx||new AC();audio.current.ctx=c;c.resume();const cfg:any={rain:['highpass',900,.10],ocean:['lowpass',520,.12],forest:['lowpass',1300,.09],river:['bandpass',750,.11],birds:['highpass',1500,.05],fire:['bandpass',500,.09],wind:['lowpass',350,.10],night:['lowpass',700,.08],bowls:['lowpass',1000,.05],white:['allpass',1000,.08]};ids.slice(0,3).forEach((id,idx)=>{const src=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();src.buffer=noise(c,['ocean','river','wind','night','forest'].includes(id));src.loop=true;const [type,freq,base]=cfg[id]||cfg.white;f.type=type;f.frequency.value=freq;g.gain.value=.0001;src.connect(f).connect(g).connect(c.destination);src.start();g.gain.linearRampToValueAtTime(base*(volume/50),c.currentTime+1.0);audio.current.sources.push(src);audio.current.nodes.push(f,g);if(id==='bowls'){const o=c.createOscillator(),og=c.createGain();o.frequency.value=220+idx*110;og.gain.value=.012;o.connect(og).connect(c.destination);o.start();audio.current.sources.push(o);audio.current.nodes.push(og)}})}catch{setToast('Audio unavailable')}
}
  function toggleSound(id:string){setSounds(v=>v.includes(id)?v.filter(x=>x!==id):v.length>=3?(setToast('Mix up to three sounds'),v):[...v,id])}
  function saveMix(){const n=prompt('Name this sound mix');if(n)setMixes(v=>[...v,{name:n,sounds}])}
  async function notifications(){if(!('Notification'in window)){setToast('Notifications not supported');return}const p=await Notification.requestPermission();setToast(p==='granted'?'Reminders enabled':'Permission not granted')}

  if(!ready)return <div className="onboarding"><div className="card">Loading Still…</div></div>;
  if(!signedIn)return <Auth mode={authMode} setMode={setAuthMode} submit={authSubmit} google={google} reset={reset} msg={authMsg}/>;

  const greeting=new Date().getHours()<12?'Good morning':new Date().getHours()<18?'Good afternoon':'Good evening';
  return <div className="app">
    <aside className="sidebar"><div className="brand"><div className="brandMark"/><div><div className="brandName">still</div><div className="tiny">return to yourself</div></div></div><DesktopNav view={view} go={setView}/><div className="sideBottom"><button className="btn" onClick={()=>setDark(v=>!v)}>{dark?'☀️ Light':'🌙 Dark'} theme</button><div className="profileMini"><div className="avatar">M</div><div><strong style={{fontSize:13}}>Mayank</strong><div className="tiny">{TZ}</div></div></div></div></aside>
    <main className="main"><div className="topline"><div className="eyebrow">Still · {view}</div><div className="toolbar"><button className="btn" onClick={()=>setView('journal')}>Journal</button><button className="iconBtn" onClick={()=>setDark(v=>!v)}>{dark?'☀️':'🌙'}</button></div></div>
      {view==='home'&&<Home greeting={greeting} target={targetMin} streak={currentStreak} total={total} habits={habits.filter(h=>!h.archived)} toggle={toggleHabit} week={week} meditate={()=>setView('meditate')} partner={()=>setView('partner')}/>}
      {view==='meditate'&&<Meditate timer={timer} target={targetMin} setDuration={setDuration} customH={customH} customM={customM} setCustomH={setCustomH} setCustomM={setCustomM} applyCustom={applyCustom} prep={prep} setPrep={setPrep} interval={interval} setInterval={setInterval} start={start} pause={pause} restart={restart} end={end} showReflection={()=>setShowReflection(true)} sounds={sounds} toggleSound={toggleSound} preview={startAudio} volume={volume} setVolume={setVolume} mixes={mixes} saveMix={saveMix} setSounds={setSounds}/>}
      {view==='calendar'&&<Calendar month={calendarMonth} setMonth={setCalendarMonth} mode={calendarMode} setMode={setCalendarMode} medMap={medMap} habits={habits.filter(h=>!h.archived)} active={activeHabit} setActive={setSelectedHabit} selectedDate={selectedDate} setSelectedDate={setSelectedDate} sessions={sessions}/>}
      {view==='habits'&&<Habits habits={habits} active={activeHabit} setActive={setSelectedHabit} stats={hstats} toggle={toggleHabit} create={()=>{setEditHabit(null);setShowHabit(true)}} edit={h=>{setEditHabit(h);setShowHabit(true)}} archive={archive} del={del}/>}
      {view==='partner'&&<Partner privacy={privacy} setPrivacy={setPrivacy} reaction={reaction} setReaction={setReaction} challengeDay={challengeDay} setChallengeDay={setChallengeDay}/>}
      {view==='progress'&&<Progress total={total} streakNow={currentStreak} longest={longest} sessions={sessions.length} week={week} month={month} avg={avg}/>}
      {view==='journal'&&<Journal sessions={sessions}/>}
      {view==='profile'&&<Profile dark={dark} setDark={setDark} notify={notifications} logout={logout} privacy={privacy} setPrivacy={setPrivacy}/>}
    </main>
    <div className="mobileNav"><MobileNav view={view} go={setView}/></div>
    {showHabit&&<HabitModal habit={editHabit} save={saveHabit} close={()=>{setShowHabit(false);setEditHabit(null)}}/>}
    {showReflection&&<Reflection moodBefore={moodBefore} setMoodBefore={setMoodBefore} moodAfter={moodAfter} setMoodAfter={setMoodAfter} rating={rating} setRating={setRating} note={note} setNote={setNote} sounds={sounds} save={saveReflection} close={()=>setShowReflection(false)}/>}
    {toast&&<div className="toast" role="status">{toast}</div>}
  </div>
}

function Auth({mode,setMode,submit,google,reset,msg}:any){return <div className="onboarding"><div className="onboardCard"><section className="onboardVisual"><div className="brand" style={{margin:0}}><div className="brandMark"/><div><div className="brandName">still</div><div className="tiny">meditation · habits · reflection</div></div></div><div className="lotus"/><div><div className="eyebrow">A quieter way to grow</div><p className="quote">Build consistency without turning wellbeing into a competition.</p></div></section><section className="onboardForm"><div className="eyebrow">Welcome to Still</div><h1 className="title" style={{fontSize:42}}>{mode==='login'?'Return to your practice.':'Begin gently.'}</h1><p className="muted">Meditation, habits, reflection, and private accountability in one calm space.</p><div className="pills" style={{margin:'16px 0'}}><button className={mode==='login'?'primary':'btn'} onClick={()=>setMode('login')}>Log in</button><button className={mode==='signup'?'primary':'btn'} onClick={()=>setMode('signup')}>Sign up</button></div><form onSubmit={submit} style={{display:'grid',gap:10}}><div className="field"><label>Email</label><input className="input" name="email" type="email" required/></div><div className="field"><label>Password</label><input className="input" name="password" type="password" minLength={6} required/></div>{msg&&<div className="error">{msg}</div>}<button className="primary">{mode==='login'?'Enter Still':'Create account'}</button><button className="btn" type="button" onClick={google}>Continue with Google</button><button className="btn" type="button" onClick={reset}>Forgot password?</button></form><p className="tiny" style={{marginTop:14}}>{hasSupabase?'Supabase authentication enabled.':'Demo mode: any valid email + 6 character password works.'}</p></section></div></div>}

const navItems:[View,string,string][]=[['home','⌂','Home'],['meditate','◉','Meditate'],['calendar','▦','Calendar'],['habits','✓','Habits'],['partner','♡','Partner'],['progress','↗','Progress'],['journal','✎','Journal'],['profile','⚙','Profile']];
function DesktopNav({view,go}:any){return <nav className="nav">{navItems.map(([v,i,l])=><button className={'navBtn '+(view===v?'active':'')} key={v} onClick={()=>go(v)}><span>{i}</span><span>{l}</span></button>)}</nav>}
function MobileNav({view,go}:any){return <>{navItems.filter(x=>['home','meditate','calendar','habits','profile'].includes(x[0])).map(([v,i,l])=><button className={view===v?'active':''} key={v} onClick={()=>go(v)}><div style={{fontSize:19}}>{i}</div>{l}</button>)}</>}

function Home({greeting,target,streak,total,habits,toggle,week,meditate,partner}:any){return <><header style={{marginBottom:24}}><div className="eyebrow">Your daily pause</div><h1 className="title">{greeting}, Mayank.</h1><p className="muted">You do not need a perfect day. You only need a small place to return to.</p></header><div className="grid2"><section className="card hero"><div className="sectionHead"><div><div className="eyebrow">Today’s meditation</div><h2 className="sectionTitle">{target} quiet minutes</h2></div><span style={{fontSize:28}}>🌿</span></div><div className="begin"><div className="beginOrb">◉</div><div><div className="big">{target}<span style={{fontSize:18}}> min</span></div><div className="muted">Gentle breathing · sound optional</div></div></div><button className="primary" style={{alignSelf:'flex-start',minWidth:180}} onClick={meditate}>Begin Meditation</button></section><aside className="card"><div className="sectionHead"><h2 className="sectionTitle">Your rhythm</h2><span>✦</span></div><div className="statGrid" style={{gridTemplateColumns:'1fr 1fr'}}><div className="stat"><strong>{streak}</strong><span>day streak</span></div><div className="stat"><strong>{total}</strong><span>total minutes</span></div></div><p className="quote">“Let the practice be a place you return to, not a score you chase.”</p><div className="tiny">Daily reflection</div></aside></div><div className="grid2" style={{marginTop:20}}><section className="card"><div className="sectionHead"><h2 className="sectionTitle">Today’s habits</h2><span className="tiny">One tap</span></div><div className="list">{habits.slice(0,5).map((h:Habit)=><div className="row" key={h.id}><div className="glyph">{h.icon}</div><div className="rowMeta"><strong>{h.name}</strong><span>{h.target||'Daily practice'}</span></div><button className={'check '+(h.entries[today()]?'done':'')} onClick={()=>toggle(h)}>{h.entries[today()]?'✓':''}</button></div>)}</div></section><aside className="card"><div className="sectionHead"><h2 className="sectionTitle">This week</h2><span className="tiny">Meditation minutes</span></div><Bars values={week}/><button className="btn" style={{width:'100%',marginTop:25}} onClick={partner}>View meditation partner</button></aside></div></>}
function Bars({values}:{values:number[]}){const max=Math.max(1,...values),labels=['M','T','W','T','F','S','S'];return <div className="bars">{values.map((v,i)=><div className="bar" key={i} style={{height:12+(v/max)*58,opacity:v?1:.3}}><span>{labels[i]}</span></div>)}</div>}

function Meditate(p:any){const total=p.timer.phase==='prep'?Math.max(1,p.timer.prepSec):Math.max(1,p.timer.durationSec),pct=Math.max(0,Math.min(1,1-p.timer.remaining/total)),c=2*Math.PI*145;return <><header style={{marginBottom:22}}><div className="eyebrow">Meditation</div><h1 className="title">Make space for stillness.</h1><p className="muted">Set your time, choose a soundscape, and let the timer stay accurate even when the page is hidden.</p></header><div className="timerLayout"><section className="card timerCard"><div className="presets">{PRESETS.map(m=><button key={m} className={'pill '+(p.target===m?'active':'')} onClick={()=>p.setDuration(m)}>{m} min</button>)}</div><div className={'ringWrap '+(['running','prep'].includes(p.timer.phase)?'running':'')}><svg className="ring" viewBox="0 0 320 320"><circle className="ringBg" cx="160" cy="160" r="145"/><circle className="ringProg" cx="160" cy="160" r="145" strokeDasharray={c} strokeDashoffset={c*(1-pct)}/></svg><div className="ringContent"><div><div className="eyebrow">{p.timer.phase==='prep'?'Prepare':p.timer.phase==='running'?'Breathe':p.timer.phase==='paused'?'Paused':p.timer.phase==='complete'?'Complete':'Ready'}</div><div className="ringTime">{fmt(p.timer.remaining)}</div><div className="tiny">soften · breathe · release</div></div></div></div><div className="controls">{p.timer.phase==='idle'&&<button className="primary" onClick={p.start}>Start session</button>}{p.timer.phase==='paused'&&<button className="primary" onClick={p.start}>Resume</button>}{['running','prep'].includes(p.timer.phase)&&<button className="primary" onClick={p.pause}>Pause</button>}<button className="btn" onClick={p.restart}>Restart</button><button className="btn" onClick={p.end}>End</button>{p.timer.phase==='complete'&&<button className="primary" onClick={p.showReflection}>Save session</button>}</div></section><aside style={{display:'grid',gap:20}}><section className="card"><div className="sectionHead"><h2 className="sectionTitle">Session setup</h2><span className="tiny">Custom</span></div><div className="fieldGrid"><div className="field"><label>Hours</label><input className="input" type="number" min="0" max="23" value={p.customH} onChange={e=>p.setCustomH(+e.target.value)}/></div><div className="field"><label>Minutes</label><input className="input" type="number" min="0" max="59" value={p.customM} onChange={e=>p.setCustomM(Math.min(59,Math.max(0,+e.target.value)))}/></div></div><button className="btn" style={{width:'100%',marginTop:10}} onClick={p.applyCustom}>Use custom time</button><div className="fieldGrid" style={{marginTop:12}}><div className="field"><label>Preparation</label><select className="select" value={p.prep} onChange={e=>p.setPrep(+e.target.value)}><option value="0">None</option><option value="5">5 sec</option><option value="10">10 sec</option><option value="20">20 sec</option><option value="30">30 sec</option></select></div><div className="field"><label>Interval bell</label><select className="select" value={p.interval} onChange={e=>p.setInterval(+e.target.value)}><option value="0">Off</option><option value="5">Every 5 min</option><option value="10">Every 10 min</option><option value="15">Every 15 min</option></select></div></div></section><section className="card"><div className="sectionHead"><div><div className="eyebrow">Sound mixer</div><h2 className="sectionTitle">Up to three layers</h2></div><button className="btn" onClick={p.saveMix}>Save mix</button></div><div className="soundGrid">{SOUNDS.map(([id,name,icon])=><button className={'sound '+(p.sounds.includes(id)?'active':'')} key={id} onClick={()=>p.toggleSound(id)}><div className="glyph">{icon}</div><div className="rowMeta"><strong>{name}</strong><span>{p.sounds.includes(id)?'Selected':'Tap to add'}</span></div><span onClick={e=>{e.stopPropagation();p.preview(id)}}>▶</span></button>)}</div><div className="field" style={{marginTop:12}}><label>Volume · {p.volume}%</label><input className="volume" type="range" min="0" max="100" value={p.volume} onChange={e=>p.setVolume(+e.target.value)}/></div><div className="pills" style={{marginTop:12}}>{p.mixes.map((m:any)=><button className="pill" key={m.name} onClick={()=>p.setSounds(m.sounds)}>{m.name}</button>)}<button className="pill" onClick={()=>p.setSounds([])}>No sound</button></div><p className="tiny">This first build generates copyright-safe ambient placeholders locally. Replace with licensed loop files from Supabase Storage for final store release.</p></section></aside></div></>}

function Month({month,data,selected,select}:any){const y=month.getFullYear(),m=month.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),cells:any[]=[];for(let i=0;i<first;i++)cells.push(<div className="day blank" key={'b'+i}/>);for(let d=1;d<=days;d++){const k=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,v=data[k]||0,l=v>=20?'l3':v>=10?'l2':v>0?'l1':'';cells.push(<button key={k} className={`day ${l} ${k===today()?'today':''}`} style={k===selected?{boxShadow:'inset 0 0 0 2px var(--sage)'}:{}} onClick={()=>select(k)}>{d}</button>)}return <div className="calendar">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=><div className="dow" key={x}>{x}</div>)}{cells}</div>}
function Calendar({month,setMonth,mode,setMode,medMap,habits,active,setActive,selectedDate,setSelectedDate,sessions}:any){const data=mode==='meditation'?medMap:(active?.entries||{}),daySessions=sessions.filter((s:Session)=>localDateKey(new Date(s.endedAt),TZ)===selectedDate);return <><header style={{marginBottom:22}}><div className="eyebrow">Calendar</div><h1 className="title">See the rhythm, not the pressure.</h1><p className="muted">Intensity reflects minutes meditated; habits keep their own independent calendars.</p></header><div className="pills" style={{marginBottom:14}}><button className={'pill '+(mode==='meditation'?'active':'')} onClick={()=>setMode('meditation')}>Meditation</button><button className={'pill '+(mode==='habit'?'active':'')} onClick={()=>setMode('habit')}>Habit</button>{mode==='habit'&&habits.map((h:Habit)=><button className={'pill '+(active?.id===h.id?'active':'')} key={h.id} onClick={()=>setActive(h.id)}>{h.icon} {h.name}</button>)}</div><div className="calendarLayout"><section className="card"><div className="sectionHead"><h2 className="sectionTitle">{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><div className="toolbar"><button className="iconBtn" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>←</button><button className="iconBtn" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>→</button></div></div><Month month={month} data={data} selected={selectedDate} select={setSelectedDate}/></section><aside className="card"><div className="eyebrow">Selected day</div><h2 className="sectionTitle" style={{marginTop:6}}>{new Date(selectedDate+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})}</h2>{mode==='meditation'?(daySessions.length?daySessions.map((s:Session)=><div className="row" style={{marginTop:10}} key={s.id}><div className="glyph">🧘</div><div className="rowMeta"><strong>{s.minutes} minute meditation</strong><span>{s.sounds.length?s.sounds.join(' + '):'Silent session'}</span></div><span>✦</span></div>):<p className="muted">No meditation saved on this date.</p>):<><div className="big" style={{marginTop:16}}>{active?.entries[selectedDate]||0}</div><p className="muted">{active?.target||'completion'}</p></>}<p className="tiny" style={{marginTop:18}}>Streaks use your local timezone and only roll over after your local day ends.</p></aside></div></>}

function Habits({habits,active,setActive,stats,toggle,create,edit,archive,del}:any){const visible=habits.filter((h:Habit)=>!h.archived),st=active?stats(active):null;return <><header style={{marginBottom:22}}><div className="eyebrow">Habits</div><h1 className="title">Small promises, kept softly.</h1><p className="muted">Custom schedules, targets, reminders, completion rates, and separate streak calendars.</p></header><div className="habitLayout"><aside className="card"><div className="sectionHead"><h2 className="sectionTitle">Your habits</h2><button className="primary" onClick={create}>+ Add</button></div><div className="list">{visible.map((h:Habit)=><button className={'habitCard '+(active?.id===h.id?'selected':'')} key={h.id} onClick={()=>setActive(h.id)}><div className="row" style={{border:0,padding:0}}><div className="glyph">{h.icon}</div><div className="rowMeta"><strong>{h.name}</strong><span>{h.target||'Simple completion'} · {stats(h).current} day streak</span></div><span>{h.entries[today()]?'✓':'○'}</span></div></button>)}</div></aside>{active&&<section className="card"><div className="sectionHead"><div><div className="eyebrow">Habit details</div><h2 className="sectionTitle">{active.icon} {active.name}</h2></div><button className={'check '+(active.entries[today()]?'done':'')} onClick={()=>toggle(active)}>{active.entries[today()]?'✓':''}</button></div><div className="statGrid"><div className="stat"><strong>{st.current}</strong><span>current streak</span></div><div className="stat"><strong>{st.longest}</strong><span>longest streak</span></div><div className="stat"><strong>{st.total}</strong><span>completions</span></div><div className="stat"><strong>{st.weekly}%</strong><span>this week</span></div></div><div style={{marginTop:20}}><Month month={new Date()} data={active.entries} selected={today()} select={()=>{}}/></div><div className="pills" style={{marginTop:15}}><button className="btn" onClick={()=>edit(active)}>Edit</button><button className="btn" onClick={()=>archive(active)}>Archive</button><button className="danger" onClick={()=>del(active)}>Delete</button></div></section>}</div><section className="card" style={{marginTop:20}}><div className="sectionHead"><h2 className="sectionTitle">Archived</h2><span className="tiny">Kept out of daily view</span></div>{habits.filter((h:Habit)=>h.archived).map((h:Habit)=><div className="row" key={h.id}><div className="glyph">{h.icon}</div><div className="rowMeta"><strong>{h.name}</strong><span>Archived</span></div><button className="btn" onClick={()=>archive(h)}>Restore</button></div>)}</section></>}

function Partner({privacy,setPrivacy,reaction,setReaction,challengeDay,setChallengeDay}:any){return <><header style={{marginBottom:22}}><div className="eyebrow">Meditation partner</div><h1 className="title">Encouragement without surveillance.</h1><p className="muted">Share only the progress you choose. Notes, exact activity times, emails, and unrelated habits stay private.</p></header><div className="partnerLayout"><section className="card" style={{textAlign:'center'}}><div className="partnerAvatar">P</div><h2 className="sectionTitle">Practice Partner</h2><p className="muted">Connected privately · code ST-47LQ</p><div className="statGrid" style={{gridTemplateColumns:'repeat(3,1fr)',marginTop:18}}><div className="stat"><strong>4</strong><span>day streak</span></div><div className="stat"><strong>✓</strong><span>today</span></div><div className="stat"><strong>68</strong><span>weekly min</span></div></div><div className="pills" style={{justifyContent:'center',marginTop:16}}>{['🌿','♡','👏','Keep going'].map(r=><button className="reaction" key={r} onClick={()=>setReaction(r)}>{r}</button>)}</div>{reaction&&<div className="success" style={{marginTop:12}}>Reaction sent: {reaction}</div>}</section><section className="card"><div className="sectionHead"><div><div className="eyebrow">Shared challenge</div><h2 className="sectionTitle">Seven days of stillness</h2></div><span className="tiny">Day {challengeDay}/7</span></div><div className="challenge"><strong>Meditate on seven consecutive days</strong><div style={{height:10,borderRadius:999,background:'var(--panel)',marginTop:10,overflow:'hidden'}}><div style={{height:'100%',width:`${challengeDay/7*100}%`,background:'var(--sage)'}}/></div><button className="btn" style={{marginTop:12}} onClick={()=>setChallengeDay(Math.min(7,challengeDay+1))}>Demo next shared day</button></div><div style={{marginTop:20}}><div className="eyebrow">Shared consistency</div><div className="big">71%</div><p className="muted">Days where both partners completed their chosen practice this week.</p></div></section></div><div className="grid2" style={{marginTop:20}}><section className="card"><h2 className="sectionTitle">Private connection</h2><div className="field" style={{marginTop:12}}><label>Invite code</label><input className="input" value="ST-47LQ" readOnly/></div><div className="pills" style={{marginTop:12}}><button className="btn" onClick={()=>navigator.clipboard?.writeText('ST-47LQ')}>Copy code</button><button className="danger" onClick={()=>confirm('Remove this partner?')}>Remove</button><button className="danger" onClick={()=>confirm('Block this user?')}>Block</button></div></section><section className="card"><h2 className="sectionTitle">Privacy controls</h2>{Object.entries({streak:'Current streak',today:'Today status',weekly:'Weekly minutes',sharedHabits:'Mutually consented habits'}).map(([k,l])=><div className="privacyRow" key={k}><div><strong>{l}</strong><div className="tiny">Visible only if enabled</div></div><button className={'switch '+(privacy[k]?'on':'')} onClick={()=>setPrivacy({...privacy,[k]:!privacy[k]})}><i/></button></div>)}</section></div></>}

function Progress({total,streakNow,longest,sessions,week,month,avg}:any){const milestones=[['100 meditation minutes',Math.min(100,total),total>=100],['7-day streak',Math.min(100,longest/7*100),longest>=7],['30 completed sessions',Math.min(100,sessions/30*100),sessions>=30]];return <><header style={{marginBottom:22}}><div className="eyebrow">Progress</div><h1 className="title">Notice what is changing.</h1><p className="muted">Useful context, without turning your inner life into a leaderboard.</p></header><div className="statGrid"><div className="stat"><strong>{streakNow}</strong><span>current streak</span></div><div className="stat"><strong>{longest}</strong><span>longest streak</span></div><div className="stat"><strong>{total}</strong><span>total minutes</span></div><div className="stat"><strong>{sessions}</strong><span>sessions</span></div></div><div className="grid2" style={{marginTop:20}}><section className="card"><div className="sectionHead"><h2 className="sectionTitle">Weekly meditation</h2><span className="tiny">{week.reduce((a:number,b:number)=>a+b,0)} min</span></div><Bars values={week}/></section><aside className="card"><h2 className="sectionTitle">This month</h2><div className="big" style={{marginTop:12}}>{month}<span style={{fontSize:18}}> min</span></div><p className="muted">Average session: {avg} minutes</p></aside></div><section className="card" style={{marginTop:20}}><div className="sectionHead"><h2 className="sectionTitle">Milestones</h2><span className="tiny">Personal, not competitive</span></div><div className="grid3">{milestones.map(([label,value,done]:any)=><div className="challenge" key={label}><div style={{fontSize:24}}>{done?'✦':'○'}</div><strong>{label}</strong><div style={{height:8,borderRadius:999,background:'var(--panel)',marginTop:10,overflow:'hidden'}}><div style={{height:'100%',width:`${value}%`,background:'var(--sage)'}}/></div></div>)}</div></section></>}

function Journal({sessions}:{sessions:Session[]}){return <><header style={{marginBottom:22}}><div className="eyebrow">Session history & journal</div><h1 className="title">Remember how it felt.</h1><p className="muted">Private reflections never appear in partner sharing.</p></header><section className="card"><div className="history">{sessions.map(s=><article className="historyItem" key={s.id}><div><div style={{fontFamily:'Georgia,serif',fontSize:19}}>{new Date(s.endedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</div><div className="tiny">{s.minutes} min</div></div><div><strong>{s.moodBefore||'○'} → {s.moodAfter||'○'} · {'★'.repeat(s.rating||0)}</strong><p className="muted" style={{fontSize:13}}>{s.note||'No private note added.'}</p><div className="tiny">Sound: {s.sounds.length?s.sounds.join(' + '):'Silent'}</div></div><span className="tiny">Private</span></article>)}</div></section></>}

function Profile({dark,setDark,notify,logout,privacy,setPrivacy}:any){return <><header style={{marginBottom:22}}><div className="eyebrow">Profile & preferences</div><h1 className="title">Make Still yours.</h1><p className="muted">Timezone, reminders, appearance, and privacy stay under your control.</p></header><div className="grid2"><section className="card"><h2 className="sectionTitle">Preferences</h2><div className="privacyRow"><div><strong>Dark calming theme</strong><div className="tiny">Low-light interface</div></div><button className={'switch '+(dark?'on':'')} onClick={()=>setDark(!dark)}><i/></button></div><div className="privacyRow"><div><strong>Timezone</strong><div className="tiny">Used for streak boundaries</div></div><span>{TZ}</span></div><div className="privacyRow"><div><strong>Browser reminders</strong><div className="tiny">Permission requested only when you choose</div></div><button className="btn" onClick={notify}>Enable</button></div></section><section className="card"><h2 className="sectionTitle">Partner privacy</h2>{Object.entries({streak:'Share streak',today:'Share today status',weekly:'Share weekly minutes',sharedHabits:'Share consented habits'}).map(([k,l])=><div className="privacyRow" key={k}><strong>{l}</strong><button className={'switch '+(privacy[k]?'on':'')} onClick={()=>setPrivacy({...privacy,[k]:!privacy[k]})}><i/></button></div>)}</section></div><section className="card" style={{marginTop:20}}><h2 className="sectionTitle">Account</h2><div className="pills" style={{marginTop:12}}><button className="danger" onClick={logout}>Log out</button></div></section></>}

function HabitModal({habit,save,close}:any){return <div className="modalBack"><div className="modal"><div className="sectionHead"><div><div className="eyebrow">{habit?'Edit habit':'New habit'}</div><h2 className="sectionTitle">Design a small promise</h2></div><button className="iconBtn" onClick={close}>×</button></div><form onSubmit={save} style={{display:'grid',gap:13}}><div className="field"><label>Name</label><input className="input" name="name" defaultValue={habit?.name||''} maxLength={40}/></div><div className="field"><label>Icon</label><div className="pills">{ICONS.map(i=><label className="pill" key={i}><input type="radio" name="icon" value={i} defaultChecked={(habit?.icon||'🌿')===i}/> {i}</label>)}</div></div><div className="field"><label>Colour</label><div className="pills">{COLORS.map(c=><label className="pill" key={c}><input type="radio" name="color" value={c} defaultChecked={(habit?.color||COLORS[0])===c}/><span style={{display:'inline-block',width:14,height:14,borderRadius:'50%',background:c}}/></label>)}</div></div><div className="field"><label>Schedule</label><div className="pills">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=><label className="pill" key={d}><input type="checkbox" name={'d'+i} defaultChecked={habit?habit.schedule.includes(i):true}/> {d}</label>)}</div></div><div className="fieldGrid"><div className="field"><label>Optional target</label><input className="input" name="target" defaultValue={habit?.target||''} placeholder="30 min / 8 glasses"/></div><div className="field"><label>Reminder time</label><input className="input" type="time" name="reminder" defaultValue={habit?.reminder||''}/></div></div><div className="controls" style={{justifyContent:'flex-end'}}><button type="button" className="btn" onClick={close}>Cancel</button><button className="primary">{habit?'Save changes':'Create habit'}</button></div></form></div></div>}
function Reflection({
  moodBefore,
  setMoodBefore,
  moodAfter,
  setMoodAfter,
  rating,
  setRating,
  note,
  setNote,
  sounds,
  save,
  close
}: any) {
  const moods = ['😣', '😴', '😐', '🙂', '😌'];

  const soundLabel =
    sounds && sounds.length > 0
      ? sounds.join(' + ')
      : 'Silent meditation';

  return (
    <div className="modalBack">
      <div className="modal">

        <div className="sectionHead">
          <div>
            <div className="eyebrow">Session complete</div>
            <h2 className="sectionTitle">
              How did the practice meet you?
            </h2>
          </div>

          <button
            type="button"
            className="iconBtn"
            onClick={close}
          >
            ×
          </button>
        </div>

        <div className="field">
          <label>Mood before</label>

          <div className="moods">
            {moods.map((m) => (
              <button
                type="button"
                className={
                  'mood ' + (moodBefore === m ? 'active' : '')
                }
                key={m}
                onClick={() => setMoodBefore(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Mood after</label>

          <div className="moods">
            {moods.map((m) => (
              <button
                type="button"
                className={
                  'mood ' + (moodAfter === m ? 'active' : '')
                }
                key={m}
                onClick={() => setMoodAfter(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Session rating</label>

          <div className="stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                className={'star ' + (rating >= n ? 'on' : '')}
                key={n}
                onClick={() => setRating(n)}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Private note</label>

          <textarea
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you notice?"
          />
        </div>

        <div
          className="success"
          style={{ marginTop: 12 }}
        >
          Sound combination: {soundLabel}
        </div>

        <div
          className="controls"
          style={{
            justifyContent: 'flex-end',
            marginTop: 16
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={close}
          >
            Not now
          </button>

          <button
            type="button"
            className="primary"
            onClick={save}
          >
            Save reflection
          </button>
        </div>

      </div>
    </div>
  );
}
