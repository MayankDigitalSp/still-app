export function localDateKey(d=new Date(),timeZone?:string){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const g=(t:string)=>p.find(x=>x.type===t)?.value??'';
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export function streak(keys:string[],today:string){
  const set=new Set(keys); const parse=(k:string)=>{const [y,m,d]=k.split('-').map(Number);return new Date(Date.UTC(y,m-1,d))};
  let c=parse(today),n=0;if(!set.has(today))c.setUTCDate(c.getUTCDate()-1);
  while(set.has(c.toISOString().slice(0,10))){n++;c.setUTCDate(c.getUTCDate()-1)} return n;
}
export function longestStreak(keys:string[]){
  const a=[...new Set(keys)].sort();if(!a.length)return 0;let best=1,cur=1;
  for(let i=1;i<a.length;i++){const x=new Date(a[i-1]+'T00:00:00Z'),y=new Date(a[i]+'T00:00:00Z');cur=((+y-+x)/86400000===1)?cur+1:1;best=Math.max(best,cur)}return best;
}
