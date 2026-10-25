'use strict';
const crypto = require('crypto');
const net = require('net');
const UA = 'Searchmenow-Research/1.0 (+https://searchmenow.vercel.app)';
const LIMIT = 8, TIMEOUT = 9000;
const SOURCES = [
 {id:'wikipedia',name:'Wikipedia',kinds:['name','keyword','company','education','domain'],weight:.95},
 {id:'wikidata',name:'Wikidata',kinds:['name','keyword','company','education'],weight:.95},
 {id:'github',name:'GitHub',kinds:['username','name','keyword','company','domain'],weight:.90},
 {id:'gitlab',name:'GitLab',kinds:['username','name','company'],weight:.75},
 {id:'orcid',name:'ORCID',kinds:['name','education','keyword'],weight:.92},
 {id:'openalex',name:'OpenAlex',kinds:['name','education','keyword'],weight:.90},
 {id:'bluesky',name:'Bluesky',kinds:['username','name','keyword'],weight:.72},
 {id:'mastodon',name:'Mastodon',kinds:['username','name','keyword'],weight:.70},
 {id:'hackernews',name:'Hacker News',kinds:['name','keyword','company'],weight:.65},
 {id:'crossref',name:'Crossref',kinds:['name','education','keyword','company'],weight:.86},
 {id:'openlibrary',name:'Open Library',kinds:['name','education','keyword'],weight:.72},
 {id:'internetarchive',name:'Internet Archive',kinds:['name','keyword','company','education','domain'],weight:.68},
 {id:'npm',name:'npm Registry',kinds:['username','keyword','company','domain'],weight:.70},
 {id:'crtsh',name:'Certificate Transparency (crt.sh)',kinds:['domain'],weight:.82}
];
const clean = (s,n=180)=>String(s||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
const strip = s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
const tokens = s=>clean(s,300).toLowerCase().split(/[^\p{L}\p{N}@._-]+/u).filter(x=>x.length>1);
const hash = s=>crypto.createHash('sha256').update(String(s).toLowerCase()).digest('hex').slice(0,20);
async function get(url,headers={}) { const r=await fetch(url,{headers:{'User-Agent':UA,Accept:'application/json',...headers},redirect:'follow',signal:AbortSignal.timeout(TIMEOUT)}); if(!r.ok) throw Error('upstream_'+r.status); return r.json(); }
const row=(source,title,url,snippet,extra={})=>({source,title:clean(title),url,snippet:clean(strip(snippet),420),...extra});
function classify(q,t) {
 if(t&&['username','name','company','education','keyword','domain','email','phone','ip'].includes(t)) return t;
 if(net.isIP(q))return 'ip'; if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q))return 'email';
 if(/^\+?[\d\s().-]{7,20}$/.test(q))return 'phone';
 if(/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(q))return 'domain';
 if(!/\s/.test(q)&&/^[A-Za-z0-9._-]{2,40}$/.test(q))return 'username'; return 'name';
}
const collectors={
 wikipedia:async q=>{const d=await get('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(q)+'&format=json&srlimit='+LIMIT);return(d.query?.search||[]).map(x=>row('Wikipedia',x.title,'https://en.wikipedia.org/wiki/'+encodeURIComponent(x.title.replace(/ /g,'_')),x.snippet,{category:'encyclopedia'}));},
 wikidata:async q=>{const d=await get('https://www.wikidata.org/w/api.php?action=wbsearchentities&search='+encodeURIComponent(q)+'&language=en&uselang=en&format=json&limit='+LIMIT);return(d.search||[]).map(x=>row('Wikidata',x.label||x.id,'https://www.wikidata.org/wiki/'+encodeURIComponent(x.id),x.description,{category:'knowledge-graph'}));},
 github:async(q,k)=>{const type=k==='username'?'users':'repositories';const d=await get('https://api.github.com/search/'+type+'?q='+encodeURIComponent(q)+'&per_page='+LIMIT,process.env.GITHUB_SEARCH_TOKEN?{Authorization:'Bearer '+process.env.GITHUB_SEARCH_TOKEN}:{});return(d.items||[]).map(x=>row('GitHub',k==='username'?(x.name||x.login):(x.full_name||x.name),x.html_url,x.description||x.bio||'',{stars:x.stargazers_count,updatedAt:x.updated_at||x.created_at,category:k==='username'?'profile':'repository'}));},
 gitlab:async q=>{const d=await get('https://gitlab.com/api/v4/users?search='+encodeURIComponent(q)+'&per_page='+LIMIT);return(Array.isArray(d)?d:[]).map(x=>row('GitLab',x.name||x.username,x.web_url,x.bio||'',{category:'profile'}));},
 orcid:async q=>{const d=await get('https://pub.orcid.org/v3.0/expanded-search/?q='+encodeURIComponent(q)+'&rows='+LIMIT,{Accept:'application/json'});return(d['expanded-result']||[]).map(x=>row('ORCID',[x['given-names'],x['family-names']].filter(Boolean).join(' '),'https://orcid.org/'+encodeURIComponent(x['orcid-id']),(x['institution-name']||[]).join(', ')||'Researcher identifier',{category:'researcher'}));},
 openalex:async q=>{const d=await get('https://api.openalex.org/authors?search='+encodeURIComponent(q)+'&per-page='+LIMIT);return(d.results||[]).map(x=>row('OpenAlex',x.display_name,x.id,(x.last_known_institutions||[]).map(i=>i.display_name).join(', '),{category:'researcher',worksCount:x.works_count,citedByCount:x.cited_by_count}));},
 bluesky:async q=>{const d=await get('https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q='+encodeURIComponent(q)+'&limit='+LIMIT);return(d.actors||[]).map(x=>row('Bluesky',(x.displayName||x.handle)+' (@'+x.handle+')','https://bsky.app/profile/'+x.handle,x.description||'',{category:'social-profile'}));},
 mastodon:async q=>{const d=await get('https://mastodon.social/api/v2/search?q='+encodeURIComponent(q)+'&type=accounts&limit='+LIMIT);return(d.accounts||[]).map(x=>row('Mastodon',(x.display_name||x.username)+' (@'+x.acct+')',x.url,x.note||'',{category:'social-profile'}));},
 hackernews:async q=>{const d=await get('https://hn.algolia.com/api/v1/search?query='+encodeURIComponent(q)+'&hitsPerPage='+LIMIT);return(d.hits||[]).map(x=>row('Hacker News',x.title||x.story_title||'Discussion',x.url||'https://news.ycombinator.com/item?id='+x.objectID,x.story_text||x.comment_text||'',{category:'discussion',updatedAt:x.created_at}));},
 crossref:async q=>{const d=await get('https://api.crossref.org/works?query='+encodeURIComponent(q)+'&rows='+LIMIT+'&select=DOI,title,author,published,container-title,type');return(d.message?.items||[]).map(x=>{const title=Array.isArray(x.title)?x.title[0]||'Untitled work':'Untitled work';const authors=(x.author||[]).slice(0,3).map(a=>[a.given,a.family].filter(Boolean).join(' ')).filter(Boolean).join(', ');const date=x.published?.['date-parts']?.[0]?.join('-')||'';return row('Crossref',title,x.DOI?'https://doi.org/'+encodeURIComponent(x.DOI):'https://search.crossref.org/',[authors,x['container-title']?.[0],x.type].filter(Boolean).join(' · '),{category:'publication',updatedAt:date||undefined});});},
 openlibrary:async q=>{const d=await get('https://openlibrary.org/search.json?q='+encodeURIComponent(q)+'&limit='+LIMIT+'&fields=key,title,author_name,first_publish_year');return(d.docs||[]).map(x=>row('Open Library',x.title||'Untitled book','https://openlibrary.org'+(x.key||''),(x.author_name||[]).slice(0,3).join(', ')+(x.first_publish_year?' · First published '+x.first_publish_year:''),{category:'book',updatedAt:x.first_publish_year?String(x.first_publish_year):undefined}));},
 internetarchive:async q=>{const d=await get('https://archive.org/advancedsearch.php?q='+encodeURIComponent(q)+'&fl[]=identifier&fl[]=title&fl[]=description&rows='+LIMIT+'&page=1&output=json');return(d.response?.docs||[]).filter(x=>x.identifier).map(x=>row('Internet Archive',x.title||x.identifier,'https://archive.org/details/'+encodeURIComponent(x.identifier),Array.isArray(x.description)?x.description.join(' '):(x.description||''),{category:'archive'}));},
 npm:async q=>{const d=await get('https://registry.npmjs.org/-/v1/search?text='+encodeURIComponent(q)+'&size='+LIMIT);return(d.objects||[]).map(x=>{const p=x.package||{};return row('npm Registry',p.name||'Package','https://www.npmjs.com/package/'+encodeURIComponent(p.name||''),p.description||'',{category:'package',updatedAt:p.date||undefined,version:p.version||undefined});});},
 crtsh:async q=>{const host=String(q).replace(/^https?:\/\//i,'').split(/[/?#]/)[0].replace(/^\*\./,'').toLowerCase();if(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host))return[];const d=await get('https://crt.sh/?q='+encodeURIComponent('%.'+host)+'&output=json&limit='+LIMIT);const seen=new Set();return(Array.isArray(d)?d:[]).filter(x=>{const key=String(x.id||x.name_value);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,LIMIT).map(x=>row('Certificate Transparency (crt.sh)',x.common_name||String(x.name_value||host).split(/[\n,]/)[0],'https://crt.sh/?id='+encodeURIComponent(x.id||''),['Issuer: '+(x.issuer_name||'Unknown'),x.not_before?'Valid from '+x.not_before:'',x.not_after?'to '+x.not_after:''].filter(Boolean).join(' · '),{category:'certificate',updatedAt:x.not_before||undefined}));}
};
function score(x,q,sources=1) {
 const qt=tokens(q), tt=tokens(x.title), body=tokens(x.title+' '+x.snippet);
 const overlap=(a,b)=>a.length?a.filter(t=>b.includes(t)).length/a.length:0;
 const exact=String(x.title).toLowerCase()===q.toLowerCase()?1:0;
 const sw=SOURCES.find(s=>s.name===x.source)?.weight||.6;
 const complete=Math.min(1,(x.title && x.title.length ? 0.35 : 0)+(x.url && x.url.length ? 0.25 : 0)+(x.snippet && x.snippet.length ? 0.25 : 0)+(x.updatedAt && x.updatedAt.length ? 0.15 : 0));
 return Math.max(0,Math.min(100,Math.round(100*(.34*overlap(qt,tt)+.24*overlap(qt,body)+.18*exact+.14*sw+.06*complete+.04*Math.min(1,sources/3)))));
}
function dedupe(items,q) {
 const m=new Map(); for(const x of items){if(!x.url||!/^https:\/\//i.test(x.url))continue;const k=hash(x.url.replace(/\/+$/,'').replace(/^https:\/\/www\./,'https://'));if(!m.has(k))m.set(k,{...x,sources:[x.source],sourceCount:1});else{const o=m.get(k);if(!o.sources.includes(x.source))o.sources.push(x.source);o.sourceCount=o.sources.length;if(!o.snippet&&x.snippet)o.snippet=x.snippet;}}
 return [...m.values()].map(x=>({...x,score:score(x,q,x.sourceCount)})).sort((a,b)=>b.score-a.score||b.sourceCount-a.sourceCount).slice(0,60);
}
async function runResearch(input,opts={}) {
 const q=clean(input,180); if(q.length<2)throw Object.assign(Error('Enter at least 2 characters.'),{statusCode:400});
 if(/^\d{12}$/.test(q.replace(/[\s-]/g,''))||/^[A-Z]{5}\d{4}[A-Z]$/i.test(q)||/\b(aadhaar|aadhar|pan card|passport number|government id)\b/i.test(q))throw Object.assign(Error('Government ID numbers are not supported. Do not submit Aadhaar, PAN, passport or other sensitive ID numbers.'),{statusCode:400});
 const kind=classify(q,opts.type); const context=clean(opts.context,100); const sourceQuery=context ? q+' '+context : q;
 if(['email','phone','ip'].includes(kind))return{query:q,context:context||undefined,type:kind,generatedAt:new Date().toISOString(),total:0,results:[],sourceStatus:[],notice:'Use the dedicated email, phone or IP lookup tool. This research endpoint does not fan personal identifiers out across unrelated sources.'};
 const chosen=SOURCES.filter(s=>s.kinds.includes(kind)&&(!opts.sources||opts.sources.includes(s.id)));
 const settled=await Promise.all(chosen.map(async s=>{const start=Date.now();try{const rows=await collectors[s.id](sourceQuery,kind);return{id:s.id,name:s.name,status:'ok',count:rows.length,durationMs:Date.now()-start,rows};}catch(e){return{id:s.id,name:s.name,status:'unavailable',count:0,durationMs:Date.now()-start,error:String(e.message||'Source unavailable').slice(0,80),rows:[]};}}));
 const results=dedupe(settled.flatMap(s=>s.rows),sourceQuery);
 return{query:q,type:kind,generatedAt:new Date().toISOString(),total:results.length,results,sourceStatus:settled.map(({rows,...s})=>s),ranking:{version:'SGRE-1.0',method:'Title match 34%, body match 24%, exact title 18%, source baseline 14%, completeness 6%, corroboration 4%',warning:'Scores rank search relevance and record completeness. They are not identity probabilities or proof of a match.'}};
}
module.exports={runResearch,classify,score,dedupe,SOURCES};