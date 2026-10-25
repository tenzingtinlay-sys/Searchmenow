(() => {
'use strict';
const $=id=>document.getElementById(id);
const svgNS='http://www.w3.org/2000/svg';
let currentData=null;
function inspect(title,body){$('workflow-inspector-title').textContent=title;$('workflow-inspector-text').textContent=body;}
function svgEl(name,attrs={}){const el=document.createElementNS(svgNS,name);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));return el;}
function addNode(svg,n){
 const g=svgEl('g',{class:'graph-node '+(n.kind||''),tabindex:'0',role:'button','aria-label':n.label});
 const circle=svgEl('circle',{cx:n.x,cy:n.y,r:n.r||16});g.appendChild(circle);
 const text=svgEl('text',{x:n.x,y:n.y+(n.r||16)+13});text.textContent=n.label;g.appendChild(text);
 const open=()=>inspect(n.title||n.label,n.detail||'No additional detail was provided by the source.');
 g.addEventListener('click',open);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
 svg.appendChild(g);
}
function renderGraph(data){
 currentData=data;
 const svg=$('workflow-graph-svg');if(!svg)return;
 svg.replaceChildren();
 const width=760,height=390;svg.setAttribute('viewBox','0 0 '+width+' '+height);
 const query=String(data.query||$('query')?.value||'Search input');
 const results=Array.isArray(data.results)?data.results:[];
 const statuses=Array.isArray(data.sourceStatus)?data.sourceStatus:[];
 if(!results.length&&!statuses.length){
   inspect('Waiting for a real search','Submit a query to populate this graph from the actual /api/public/research response. No sample records or invented relationships are shown.');
   const n={x:width/2,y:height/2,r:28,label:'SEARCH INPUT',kind:'seed',title:'Search input',detail:'The graph populates after a real backend response. Searchmenow currently routes supported public-source connectors through its existing research API.'};
   addNode(svg,n);
   const note=svgEl('text',{x:width/2,y:height/2+55,'text-anchor':'middle',fill:'#819db5','font-size':'11'});note.textContent='Run a query to display source and result relationships';svg.appendChild(note);
   return;
 }
 const root={x:width/2,y:44,r:24,label:'INPUT',kind:'seed',title:'Submitted query',detail:'Original query: '+query+'\nDetected type: '+(data.type||'not reported')+'\nGenerated: '+(data.generatedAt||'not reported')};
 const sourceNodes=statuses.slice(0,8).map((s,i)=>({x:55+i*(650/Math.max(1,Math.min(statuses.length,8)-1)),y:150,r:14,label:String(s.name||s.id||'Source').slice(0,18),kind:s.status==='ok'?'':'unavailable',title:String(s.name||s.id||'Source'),detail:'Status: '+String(s.status||'not reported')+'\nResults returned: '+String(s.count??0)+(s.error?'\nError: '+s.error:'')}));
 const resultNodes=results.slice(0,8).map((r,i)=>({x:55+i*(650/Math.max(1,Math.min(results.length,8)-1)),y:286,r:12,label:String(r.title||r.url||'Result').slice(0,20),kind:'evidence',title:String(r.title||'Untitled result'),detail:'Source(s): '+(Array.isArray(r.sources)?r.sources.join(', '):String(r.source||'Not reported'))+'\nURL: '+String(r.url||'Not provided')+'\nRelevance score: '+String(r.score??'not scored')+'/100\nMatch basis: token/title/snippet relevance and source baseline; not identity probability.\nDuplicate source count: '+String(r.sourceCount??1)+'\nSnippet: '+String(r.snippet||'No snippet provided')}));
 const edges=[];
 sourceNodes.forEach(n=>edges.push([root,n]));
 resultNodes.forEach(n=>{const r=results.find(x=>String(x.title||x.url||'').slice(0,20)===n.label);const sources=Array.isArray(r?.sources)?r.sources:[r?.source].filter(Boolean);const matched=sourceNodes.filter(s=>sources.some(src=>src===s.title));(matched.length?matched:sourceNodes.slice(0,1)).forEach(s=>edges.push([s,n]));});
 edges.forEach(([a,b])=>svg.appendChild(svgEl('line',{x1:a.x,y1:a.y+(a===root?24:14),x2:b.x,y2:b.y-15,class:'graph-edge'})));
 addNode(svg,root);sourceNodes.forEach(n=>addNode(svg,n));resultNodes.forEach(n=>addNode(svg,n));
 if(!sourceNodes.length){const note=svgEl('text',{x:width/2,y:160,'text-anchor':'middle',fill:'#ffaaa7','font-size':'11'});note.textContent='No source status returned by backend';svg.appendChild(note);}
 inspect('Live research graph',results.length+' result records and '+statuses.length+' source statuses received from the backend. Click a node to inspect provenance and the reported match basis. Graph edges represent source attribution, not proof of identity.');
}
function init(){
 const section=$('explainable-workflow');if(!section)return;
 document.addEventListener('searchmenow:research-render',e=>renderGraph(e.detail||{}));
 const steps=[
  ['Normalize input','The backend preserves the submitted query, classifies the input type and rejects sensitive government ID patterns.'],
  ['Route relevant sources','Only allow-listed collectors whose declared input kinds match the query are selected. Email, phone and IP use their dedicated lookup workflows.'],
  ['Collect with provenance','The research engine reports responding sources and isolated upstream failures. Providers can rate-limit or return incomplete data.'],
  ['Correlate and explain','Records are URL-deduplicated and relevance-ranked. Scores are relevance signals, not identity confidence; source references should remain visible.']
 ];
 section.querySelectorAll('[data-workflow-step]').forEach(btn=>btn.addEventListener('click',()=>{
  section.querySelectorAll('[data-workflow-step]').forEach(x=>x.classList.toggle('active',x===btn));
  const step=steps[Number(btn.dataset.workflowStep)];if(step)inspect(step[0],step[1]);
 }));
 const q=new URLSearchParams(location.search);
 if(q.get('q')){const intro=$('workflow-inspector-text');if(intro)intro.textContent='A query is prefilled. The graph will show actual source statuses and records when the research request completes.';}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();