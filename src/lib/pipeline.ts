export const examples = ['diffusion models', 'CRISPR', 'retrieval-augmented generation', 'GLP-1 drugs', 'longevity', 'transformers', 'quantum error correction', 'microplastics']
export const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
export interface Paper { id: string; doi: string; title: string; year: number; citations: number; relevance: number; authors: string[]; venue: string; url: string; pdf: string; abstract: string; takeaway: string; theme: string; references: string[]; rank: number }
export interface Dataset { papers: Paper[]; source: 'OpenAlex' | 'Crossref'; fetchedAt: string; total: number }
type Raw = Record<string, any>
const mailto = 'papertube@users.noreply.github.com'
export function clean(s = '') { return s.replace(/<[^>]*>/g, ' ').replace(/&lt;[^&]*&gt;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim() }
export function reconstruct(index?: Record<string, number[]> | null) { const words: string[] = []; Object.entries(index || {}).forEach(([word, positions]) => positions.forEach(i => words[i] = word)); return words.join(' ') }
export function takeaway(abstract: string) {
  const sentences = clean(abstract).match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || []
  const ranked = sentences.map((s, i) => ({ text: s.trim(), score: (/we (show|find|propose|present|demonstrate)|results|demonstrat|outperform|our (method|approach|results)|reveals?|significant/i.test(s) ? 5 : 0) - (/^(background|abstract|introduction)|has become|in recent years|is important/i.test(s.trim()) ? 5 : 0) + Math.min(s.length / 100, 2) - i * .02 })).filter(s => s.text.length > 35).sort((a,b) => b.score-a.score)
  const text = ranked[0]?.text || ''; return text.length > 210 ? text.slice(0, 200).replace(/\s+\S*$/, '') + '…' : text
}
export function cutoff() { const d = new Date(); d.setMonth(d.getMonth()-18); return d.toISOString().slice(0,10) }
function oa(w: Raw): Paper { const abstract = reconstruct(w.abstract_inverted_index); return { id:w.id, doi:w.doi || '', title:clean(w.title), year:w.publication_year || 0, citations:w.cited_by_count || 0, relevance:w.relevance_score || 0, authors:(w.authorships || []).map((a:Raw) => a.author?.display_name).filter(Boolean), venue:w.primary_location?.source?.display_name || '', url:w.doi || w.primary_location?.landing_page_url || w.id, pdf:w.best_oa_location?.pdf_url || '', abstract, takeaway:takeaway(abstract), theme:w.primary_topic?.display_name || 'Other', references:w.referenced_works || [], rank:0 } }
function cross(w: Raw): Paper { const abstract=clean(w.abstract); const doi=w.DOI || ''; return {id:'https://doi.org/'+doi,doi, title:clean(w.title?.[0]), year:(w.published?.['date-parts']?.[0]?.[0]) || 0,citations:w['is-referenced-by-count'] || 0,relevance:w.score || 0,authors:(w.author || []).map((a:Raw) => [a.given,a.family].filter(Boolean).join(' ')),venue:w['container-title']?.[0] || '',url:w.URL || 'https://doi.org/'+doi,pdf:(w.link || []).find((l:Raw)=>l['content-type']==='application/pdf' && l['content-version']==='vor')?.URL || '',abstract,takeaway:takeaway(abstract),theme:'Other',references:[],rank:0} }
const stop = new Set('a an the and or of to in on for with by from using based new study analysis research model models approach via as at is are we this that into its it paper review human'.split(' '))
export function cluster(papers: Paper[], query: string) {
  const ignored=new Set([...stop,...query.toLowerCase().split(/[^a-z]+/)]); const tokens=(p:Paper)=>[...new Set((p.title.toLowerCase().match(/[a-z]{4,}/g)||[]).filter(w=>!ignored.has(w)))]; const freq=new Map<string,number>(); papers.forEach(p=>tokens(p).forEach(w=>freq.set(w,(freq.get(w)||0)+1)))
  const labels=[...freq].filter(([,n])=>n>=3).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([w])=>w)
  papers.forEach(p=>{const words=tokens(p); const label=labels.filter(w=>words.includes(w)).sort((a,b)=>Math.log(papers.length/(freq.get(b)||1))-Math.log(papers.length/(freq.get(a)||1)))[0]; p.theme=label ? label[0].toUpperCase()+label.slice(1) : 'Other'})
}
export function finish(input: Paper[], source: Dataset['source'], query: string, total: number): Dataset {
  const unique=new Map<string,Paper>(); input.filter(p=>p.title && p.year>0 && !/\b(retract(ed|ion)|erratum|corrigendum|correction to|table of contents|front matter|back matter|editorial board)\b/i.test(p.title)).forEach(p=>{const k=(p.doi || p.id).toLowerCase().replace('https://doi.org/',''); if(!unique.has(k))unique.set(k,p)})
  const papers=[...unique.values()]; const maxR=Math.max(1,...papers.map(p=>p.relevance)); const maxC=Math.max(1,...papers.map(p=>Math.log1p(p.citations))); const velocity=(p:Paper)=>Math.log1p(p.citations/Math.max(1,new Date().getFullYear()-p.year+1)); const maxV=Math.max(1,...papers.map(velocity)); papers.forEach(p=>p.rank=.4*p.relevance/maxR+.4*Math.log1p(p.citations)/maxC+.2*velocity(p)/maxV); papers.sort((a,b)=>b.rank-a.rank)
  if(source==='Crossref')cluster(papers,query)
  const counts=new Map<string,number>(); papers.forEach(p=>counts.set(p.theme,(counts.get(p.theme)||0)+1)); const keep=[...counts].filter(([n,c])=>n!=='Other'&&c>=2).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([n])=>n); papers.forEach(p=>{if(!keep.includes(p.theme))p.theme='Other'})
  return {papers,source,total,fetchedAt:new Date().toISOString()}
}
async function json(url: string, retry = true): Promise<any> { const r=await fetch(url,{signal:AbortSignal.timeout(20000)}); if(r.status===429&&retry&&url.startsWith('https://api.crossref.org/')){const delay=Math.min(10,Math.max(2,Number(r.headers.get('retry-after'))||2));await new Promise(resolve=>setTimeout(resolve,delay*1000));return json(url,false)} if(!r.ok)throw new Error(`Index returned ${r.status}`); return r.json() }
export async function discover(query: string, progress: (s:string, partial?:Dataset)=>void=()=>{}, key?:string): Promise<Dataset> {
  progress('Searching OpenAlex…')
  try {
    const select='id,doi,title,publication_year,cited_by_count,relevance_score,authorships,primary_location,best_oa_location,primary_topic,abstract_inverted_index,referenced_works'
    const params = (extra:Record<string,string>) => 'https://api.openalex.org/works?'+new URLSearchParams({search:query,select,mailto,...(key?{api_key:key}:{}),...extra})
    let accumulated:Paper[]=[]; let total=0
    const all=await Promise.allSettled([{ 'per-page':'100' },{'per-page':'50',sort:'cited_by_count:desc'},{'per-page':'25',sort:'cited_by_count:desc',filter:'from_publication_date:'+cutoff()}].map(async extra=>{const d=await json(params(extra as Record<string,string>)); total=Math.max(total,d.meta?.count || 0); accumulated=accumulated.concat(d.results.map(oa)); const partial=finish(accumulated,'OpenAlex',query,total); progress(`Found ${partial.papers.length} papers · Mapping themes…`,partial); return d }))
    if(all.every(r=>r.status==='rejected'))throw new Error('OpenAlex unavailable')
    const result=finish(accumulated,'OpenAlex',query,total); progress(`Mapped ${new Set(result.papers.map(p=>p.theme)).size} themes · Selecting abstract excerpts…`,result); return result
  } catch {
    progress('OpenAlex unavailable · Searching the backup index…')
    const d=await json('https://api.crossref.org/works?'+new URLSearchParams({query,rows:'100',select:'DOI,title,author,published,container-title,is-referenced-by-count,abstract,URL,link,score',mailto})); const result=finish(d.message.items.map(cross),'Crossref',query,d.message['total-results']); progress(`Found ${result.papers.length} papers · Mapping themes…`,result); return result
  }
}
