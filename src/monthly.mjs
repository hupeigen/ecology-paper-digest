import {normalizeDoi} from './text.mjs';
export function selectMonthly(candidates,{target=10}={}){
 const seen=new Set(),eligible=candidates.filter(p=>{const d=normalizeDoi(p.doi);if(!d||seen.has(d)||p.isRetracted||p.isEcologyRelevant===false)return false;seen.add(d);return (p.valueScores?.relevance?.score||0)>=20||(p.valueScores?.transferability?.score||0)>=30;});
 const rank=(a,b)=>(b.rankingScore??b.totalScore??0)-(a.rankingScore??a.totalScore??0)||a.doi.localeCompare(b.doi);
 const main=eligible.filter(p=>p.selectionTrack==='mainline').sort(rank),other=eligible.filter(p=>p.selectionTrack!=='mainline').sort(rank);
 const papers=[],counts=new Map();let reviews=0,inspirations=0;
 const take=p=>{const j=p.journalId||p.journal;if(papers.length>=target||(counts.get(j)||0)>=3||(p.articleType==='review'&&reviews>=2)||(p.selectionTrack!=='mainline'&&inspirations>=2))return false;papers.push(p);counts.set(j,(counts.get(j)||0)+1);if(p.articleType==='review')reviews++;if(p.selectionTrack!=='mainline')inspirations++;return true;};
 for(const type of ['research','review'])for(const p of main.filter(p=>p.articleType===type))if(papers.length<8)take(p);
 for(const type of ['research','review'])for(const p of other.filter(p=>p.articleType===type))take(p);
 for(const type of ['research','review'])for(const p of main.filter(p=>p.articleType===type&&!papers.includes(p)))take(p);
 papers.sort(rank);
 const notes=[];if(papers.length<target)notes.push(`仅选入${papers.length}篇符合约束的论文，候选不足不凑数。`);if(papers.filter(p=>p.selectionTrack==='mainline').length<8)notes.push('贴近主线论文少于8篇；保留主线缺口，不用跨方向论文填满。');
 return{papers,notes,diagnostics:{kind:'monthly',target,selectedCount:papers.length,candidateCount:eligible.length,mainlineCount:papers.length-inspirations,inspirationCount:inspirations,reviewCount:reviews,journalCounts:Object.fromEntries(counts),maxPerJournal:3,maxReviews:2}};
}
