"use client";

import {useEffect,useMemo,useState} from "react";
import {createClient} from "../lib/supabase/client";

const keyFor=b=>`${(b.title||'').trim()}|${(b.author||'').trim()}|${b.publicationYear||''}`.toLowerCase();
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[’‘]/g,"'").replace(/[^a-z0-9]+/g,' ').trim();
const normIsbn=s=>String(s||'').replace(/[^0-9Xx]/g,'').toUpperCase();
const coreTitle=s=>norm(String(s||'').replace(/\[[^\]]*\]/g,'').replace(/\s*\([^)]*(?:book|novelization|collection|voyager|enterprise|deep space nine|next generation|new frontier|x-men|day of honor|gateways)[^)]*\)\s*/ig,' '));

function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    }else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);cell='';if(row.some(x=>x!==''))rows.push(row);row=[];
    }else cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  if(!rows.length)return[];
  const headers=rows[0].map(h=>h.trim());
  return rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}

export default function Home(){
  const sb=useMemo(()=>createClient(),[]);
  const [books,setBooks]=useState([]),[session,setSession]=useState(null),[reading,setReading]=useState({});
  const [q,setQ]=useState(''),[series,setSeries]=useState('All'),[author,setAuthor]=useState('All'),[status,setStatus]=useState('All');
  const [sort,setSort]=useState('title'),[asc,setAsc]=useState(true),[email,setEmail]=useState(''),[msg,setMsg]=useState('');
  const [selected,setSelected]=useState(null),[resolving,setResolving]=useState(false),[batching,setBatching]=useState(false);
  const [columnFilters,setColumnFilters]=useState({title:'',author:'',series:'All',year:'',rating:'All',ratings:'',status:'All'});

  useEffect(()=>{
    fetch('/api/catalogue').then(r=>r.json()).then(x=>setBooks(x.books||[]));
    sb.auth.getSession().then(({data})=>setSession(data.session));
    const{data:{subscription}}=sb.auth.onAuthStateChange((_e,s)=>setSession(s));
    return()=>subscription.unsubscribe();
  },[sb]);

  useEffect(()=>{
    if(!session?.user){setReading({});return;}
    sb.from('reading_state').select('book_key,status,personal_rating,notes').eq('user_id',session.user.id).then(({data})=>{
      const m={};for(const r of data||[])m[r.book_key]=r;setReading(m);
    });
  },[session,sb]);

  const merged=useMemo(()=>books.map(b=>{
    const s=reading[keyFor(b)]||{};
    return{...b,status:s.status||'Untracked',personalRating:s.personal_rating??null,notes:s.notes||''};
  }),[books,reading]);

  const seriesList=useMemo(()=>['All',...new Set(merged.map(b=>b.series).filter(Boolean))].sort(),[merged]);
  const authors=useMemo(()=>['All',...new Set(merged.map(b=>b.author).filter(Boolean))].sort(),[merged]);

  const rows=useMemo(()=>merged.filter(b=>{
    const cf=columnFilters;
    const globalOk=!q||`${b.title} ${b.author} ${b.series} ${b.publicationYear||''} ${b.goodreadsRating??''} ${b.goodreadsRatings??''} ${b.status}`.toLowerCase().includes(q.toLowerCase());
    const topOk=(series==='All'||b.series===series)&&(author==='All'||b.author===author)&&(status==='All'||b.status===status);
    const titleOk=!cf.title||norm(b.title).includes(norm(cf.title));
    const authorOk=!cf.author||norm(b.author).includes(norm(cf.author));
    const seriesOk=cf.series==='All'||b.series===cf.series;
    const yearOk=!cf.year||String(b.publicationYear||'').includes(cf.year.trim());
    const ratingOk=cf.rating==='All'||(cf.rating==='Matched'?b.goodreadsRating!=null:b.goodreadsRating==null);
    const ratingsOk=!cf.ratings||String(b.goodreadsRatings??'').replace(/,/g,'').includes(cf.ratings.replace(/,/g,'').trim());
    const statusOk=cf.status==='All'||b.status===cf.status;
    return globalOk&&topOk&&titleOk&&authorOk&&seriesOk&&yearOk&&ratingOk&&ratingsOk&&statusOk;
  }).sort((a,b)=>{
    let x=sort==='rating'?a.goodreadsRating:sort==='ratings'?a.goodreadsRatings:sort==='year'?a.publicationYear:a[sort];
    let y=sort==='rating'?b.goodreadsRating:sort==='ratings'?b.goodreadsRatings:sort==='year'?b.publicationYear:b[sort];
    const xn=x==null||x==='',yn=y==null||y==='';
    if(xn!==yn)return xn?1:-1;
    x=x??'';y=y??'';
    if(typeof x==='string'){x=x.toLowerCase();y=String(y).toLowerCase();}
    return(x===y?0:x>y?1:-1)*(asc?1:-1);
  }),[merged,q,series,author,status,sort,asc,columnFilters]);

  async function login(){
    const{error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin}});
    setMsg(error?error.message:'Check your email for the sign-in link.');
  }

  async function save(b,p){
    if(!session?.user){setMsg('Sign in first to save reading progress.');return;}
    const k=keyFor(b),old=reading[k]||{};
    const row={user_id:session.user.id,book_key:k,status:p.status??old.status??'Untracked',personal_rating:p.personalRating??old.personal_rating??null,notes:p.notes??old.notes??'',updated_at:new Date().toISOString()};
    const{error}=await sb.from('reading_state').upsert(row,{onConflict:'user_id,book_key'});
    if(error)return setMsg(error.message);
    setReading(r=>({...r,[k]:{book_key:k,status:row.status,personal_rating:row.personal_rating,notes:row.notes}}));
    setSelected(s=>s&&keyFor(s)===k?{...s,status:row.status,personalRating:row.personal_rating,notes:row.notes}:s);
    setMsg('Saved.');
  }

  async function resolveGoodreads(b,silent=false){
    if(!session?.user||b.goodreadsRating!=null)return false;
    if(!silent)setResolving(true);
    const{data,error}=await sb.functions.invoke('goodreads-resolve',{body:{title:b.title,author:b.author,publicationYear:b.publicationYear,isbn:b.isbn}});
    if(error){if(!silent)setMsg('Could not check Goodreads for this book.');if(!silent)setResolving(false);return false;}
    if(data?.matched&&data.data){
      const d=data.data,patch={goodreadsUrl:d.goodreads_url,goodreadsRating:d.goodreads_rating==null?null:Number(d.goodreads_rating),goodreadsRatings:d.goodreads_ratings??null,goodreadsFetchedAt:d.fetched_at};
      setBooks(xs=>xs.map(x=>keyFor(x)===keyFor(b)?{...x,...patch}:x));
      setSelected(s=>s&&keyFor(s)===keyFor(b)?{...s,...patch}:s);
      if(!silent)setMsg('Goodreads rating matched and cached.');
      if(!silent)setResolving(false);return true;
    }
    if(!silent)setMsg('No confident Goodreads match found for this book.');
    if(!silent)setResolving(false);return false;
  }

  async function findMoreRatings(){
    if(!session?.user){setMsg('Sign in first to look up more Goodreads ratings.');return;}
    const todo=merged.filter(b=>b.goodreadsRating==null&&b.author).slice(0,25);
    if(!todo.length){setMsg('No unmatched books left in this batch.');return;}
    setBatching(true);let matched=0;
    for(let i=0;i<todo.length;i++){
      setMsg(`Checking Goodreads ${i+1} of ${todo.length}… ${matched} matched so far.`);
      if(await resolveGoodreads(todo[i],true))matched++;
      await new Promise(r=>setTimeout(r,900));
    }
    setBatching(false);setMsg(`Finished Goodreads batch: ${matched} of ${todo.length} matched and cached.`);
  }

  async function importGoodreads(file){
    if(!file)return;
    if(!session?.user){setMsg('Sign in first, then import your Goodreads library export.');return;}
    try{
      const records=parseCsv(await file.text());
      const readRecords=records.filter(r=>{
        const shelf=norm(r['Exclusive Shelf']||'');
        const shelves=norm(r['Bookshelves']||'');
        return shelf==='read'||shelves.split(' ').includes('read')||!!String(r['Date Read']||'').trim();
      });
      const byIsbn=new Map(),byTitle=new Map();
      for(const b of merged){
        const isbn=normIsbn(b.isbn);if(isbn)byIsbn.set(isbn,b);
        const ct=coreTitle(b.title);if(ct){const arr=byTitle.get(ct)||[];arr.push(b);byTitle.set(ct,arr);}
      }
      const matched=new Map();
      for(const r of readRecords){
        const isbn=normIsbn(r['ISBN13']||r['ISBN']||'');
        let b=isbn?byIsbn.get(isbn):null;
        if(!b){
          const ct=coreTitle(r['Title']);
          const candidates=byTitle.get(ct)||[];
          const ra=norm(r['Author']);
          b=candidates.find(x=>!ra||norm(x.author).includes(ra.split(' ')[0])||ra.includes(norm(x.author).split(' ')[0]))||candidates[0]||null;
        }
        if(b)matched.set(keyFor(b),b);
      }
      if(!matched.size){setMsg(`Goodreads import found ${readRecords.length} read books, but none matched this catalogue.`);return;}
      const now=new Date().toISOString();
      const payload=[...matched.values()].map(b=>{
        const old=reading[keyFor(b)]||{};
        return{user_id:session.user.id,book_key:keyFor(b),status:'Read',personal_rating:old.personal_rating??null,notes:old.notes??'',updated_at:now};
      });
      const{error}=await sb.from('reading_state').upsert(payload,{onConflict:'user_id,book_key'});
      if(error)throw error;
      setReading(prev=>{const next={...prev};for(const row of payload)next[row.book_key]={book_key:row.book_key,status:'Read',personal_rating:row.personal_rating,notes:row.notes};return next;});
      setMsg(`Goodreads import complete: ${matched.size} books marked Read from ${readRecords.length} read-shelf entries.`);
    }catch(e){setMsg(`Could not import Goodreads CSV: ${e.message||e}`);}
  }

  function openDetails(b){setSelected(b);if(session?.user&&b.goodreadsRating==null)resolveGoodreads(b);}
  function toggle(k){if(sort===k)setAsc(!asc);else{setSort(k);setAsc(true);}}
  function setCF(k,v){setColumnFilters(f=>({...f,[k]:v}));}

  return <main>
    <header>
      <div><div className="eyebrow">STAR TREK • BOOK DATABASE</div><h1>Star Trek <span>Books</span></h1><p>Browse the bibliography, Goodreads ratings and your synced reading progress.</p></div>
      <div className="authbox">{session?<><span className="signed">{session.user.email}</span><button onClick={()=>sb.auth.signOut({scope:'local'})}>SIGN OUT</button></>:<><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/><button onClick={login}>EMAIL SIGN-IN LINK</button></>}</div>
    </header>
    {msg&&<div className="message">{msg}</div>}

    <section className="filters">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search all columns…"/>
      <select value={series} onChange={e=>setSeries(e.target.value)}>{seriesList.map(x=><option key={x}>{x}</option>)}</select>
      <select value={author} onChange={e=>setAuthor(e.target.value)}>{authors.map(x=><option key={x}>{x}</option>)}</select>
      <select value={status} onChange={e=>setStatus(e.target.value)}><option>All</option><option>Untracked</option><option>Unread</option><option>Reading</option><option>Read</option></select>
      <select value={sort} onChange={e=>setSort(e.target.value)}><option value="title">Sort: Title</option><option value="author">Sort: Author</option><option value="series">Sort: Series</option><option value="year">Sort: Year</option><option value="rating">Sort: Goodreads rating</option><option value="ratings">Sort: Rating count</option><option value="status">Sort: Status</option></select>
      <select value={asc?'asc':'desc'} onChange={e=>setAsc(e.target.value==='asc')}><option value="asc">Ascending ↑</option><option value="desc">Descending ↓</option></select>
    </section>

    <section className="actions">
      <button disabled={!session||batching} onClick={findMoreRatings}>{batching?'CHECKING GOODREADS…':'FIND 25 MORE GOODREADS RATINGS'}</button>
      <label className={!session?'disabled':''}>IMPORT GOODREADS CSV<input type="file" accept=".csv,text/csv" disabled={!session} onChange={e=>importGoodreads(e.target.files?.[0])}/></label>
      <span>Goodreads account API connection is unavailable for new apps; CSV import marks your Goodreads “read” shelf here.</span>
    </section>

    <section className="stats"><div><b>{rows.length}</b><small>BOOKS SHOWN</small></div><div><b>{seriesList.length-1}</b><small>SERIES</small></div><div><b>{merged.filter(b=>b.status==='Read').length}</b><small>READ</small></div><div><b>{merged.filter(b=>b.goodreadsRating!=null).length}</b><small>GOODREADS MATCHED</small></div></section>

    <section className="table"><table><thead>
      <tr>
        {[['title','TITLE'],['author','AUTHOR'],['series','SERIES'],['year','YEAR'],['rating','GOODREADS'],['ratings','RATINGS'],['status','STATUS']].map(([k,l])=><th key={k} onClick={()=>toggle(k)}>{l}{sort===k?(asc?' ↑':' ↓'):''}</th>)}<th></th>
      </tr>
      <tr className="columnfilters">
        <th><input value={columnFilters.title} onChange={e=>setCF('title',e.target.value)} placeholder="Filter title"/></th>
        <th><input value={columnFilters.author} onChange={e=>setCF('author',e.target.value)} placeholder="Filter author"/></th>
        <th><select value={columnFilters.series} onChange={e=>setCF('series',e.target.value)}>{seriesList.map(x=><option key={x}>{x}</option>)}</select></th>
        <th><input value={columnFilters.year} onChange={e=>setCF('year',e.target.value)} placeholder="Year" inputMode="numeric"/></th>
        <th><select value={columnFilters.rating} onChange={e=>setCF('rating',e.target.value)}><option>All</option><option>Matched</option><option>Unmatched</option></select></th>
        <th><input value={columnFilters.ratings} onChange={e=>setCF('ratings',e.target.value)} placeholder="Count" inputMode="numeric"/></th>
        <th><select value={columnFilters.status} onChange={e=>setCF('status',e.target.value)}><option>All</option><option>Untracked</option><option>Unread</option><option>Reading</option><option>Read</option></select></th>
        <th><button className="more" onClick={()=>setColumnFilters({title:'',author:'',series:'All',year:'',rating:'All',ratings:'',status:'All'})}>CLEAR</button></th>
      </tr>
    </thead><tbody>{rows.map((b,i)=><tr key={keyFor(b)+i}>
      <td><strong>{b.title}</strong></td><td>{b.author||'—'}</td><td>{b.series||'—'}</td><td>{b.publicationYear||'—'}</td>
      <td>{b.goodreadsRating!=null?<><span className="stars">★</span><b>{Number(b.goodreadsRating).toFixed(2)}</b></>:<span className="pending">Not matched yet</span>}</td>
      <td>{b.goodreadsRatings==null?'—':Number(b.goodreadsRatings).toLocaleString()}</td>
      <td><select disabled={!session} value={b.status} onChange={e=>save(b,{status:e.target.value})}><option>Untracked</option><option>Unread</option><option>Reading</option><option>Read</option></select></td>
      <td><button className="more" onClick={()=>openDetails(b)}>DETAILS</button></td>
    </tr>)}</tbody></table></section>

    {selected&&<div className="modal"><div className="card"><button className="close" onClick={()=>setSelected(null)}>×</button><div className="eyebrow">BOOK RECORD</div><h2>{selected.title}</h2><p>{selected.author||'Unknown author'} · {selected.series}</p><div className="detailgrid"><span>Published<b>{selected.publicationYear||'—'}</b></span><span>Goodreads<b>{selected.goodreadsRating==null?(resolving?'Checking…':'Not matched'):Number(selected.goodreadsRating).toFixed(2)}</b></span><span>Status<b>{selected.status}</b></span><span>My rating<b>{selected.personalRating??'—'}</b></span></div>{session&&selected.goodreadsRating==null&&!resolving&&<button className="more" onClick={()=>resolveGoodreads(selected)}>CHECK GOODREADS</button>}<label className="field">Status<select disabled={!session} value={selected.status} onChange={e=>save(selected,{status:e.target.value})}><option>Untracked</option><option>Unread</option><option>Reading</option><option>Read</option></select></label><label className="field">Personal rating<select disabled={!session} value={selected.personalRating??''} onChange={e=>save(selected,{personalRating:e.target.value===''?null:Number(e.target.value)})}><option value="">No rating</option>{[.5,1,1.5,2,2.5,3,3.5,4,4.5,5].map(n=><option key={n}>{n}</option>)}</select></label><label className="field">Notes<textarea disabled={!session} value={selected.notes||''} onChange={e=>setSelected({...selected,notes:e.target.value})} onBlur={e=>save(selected,{notes:e.target.value})}/></label>{selected.goodreadsUrl&&<a className="goodreads" href={selected.goodreadsUrl} target="_blank" rel="noreferrer">Open on Goodreads ↗</a>}</div></div>}

    <footer>Catalogue metadata from Wikipedia; Goodreads ratings are cached snapshots and may change.</footer>
  </main>;
}
