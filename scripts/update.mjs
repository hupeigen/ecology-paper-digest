import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadJournals,loadTopics} from '../src/config.mjs';
import {isMonday,isoWeekKey,previousNaturalWeek,recentRange,todayInShanghai,assertDateKey,monthRange,scheduledMonths} from '../src/dates.mjs';
import {readIndex,readReport} from '../src/report.mjs';
import {createBudget} from '../src/research.mjs';
import {generateReport} from '../src/pipeline.mjs';
export function parseArgs(argv){const args={};for(const item of argv){if(!item.startsWith('--'))continue;const[key,...rest]=item.slice(2).split('=');args[key]=rest.length?rest.join('='):true;}return args;}
export function normalizeKind(value,date){const kind=String(value||'auto');if(kind==='auto')return ['daily',...(isMonday(date)?['weekly']:[]),...(scheduledMonths(date).length?['monthly']:[])];if(kind==='both')return['daily','weekly'];if(['daily','weekly','monthly'].includes(kind))return[kind];throw Error('--kind 只能为 auto、daily、weekly、monthly、both');}
export function planReports(date,kind='auto',month){
 assertDateKey(date);if(month&&kind!=='monthly')throw Error('--month 仅用于 monthly');const plans=[];
 for(const k of normalizeKind(kind,date)){
  if(k==='monthly'){for(const m of kind==='auto'?scheduledMonths(date):[month||date.slice(0,7)])plans.push({kind:k,reportId:m,period:monthRange(m,date),status:m===date.slice(0,7)?'provisional':'archived'});}
  else{const period=k==='weekly'?previousNaturalWeek(date):recentRange(date,30);plans.push({kind:k,period,reportId:k==='weekly'?isoWeekKey(period.to):date});}
 }
 return plans;
}
export async function main(argv=process.argv.slice(2)){
 const args=parseArgs(argv),date=String(args.date||todayInShanghai()),kind=String(args.kind||'auto');let plans=planReports(date,kind,args.month?String(args.month):undefined);
 const index=await readIndex();if(kind==='auto'&&!index.monthly.length&&!plans.some(p=>p.kind==='monthly'&&p.reportId===date.slice(0,7)))plans.push(...planReports(date,'monthly'));
 const revise=args.revise===true||args.revise==='true';
 // Validate archive policy before ANY report in the run touches the network.
 const accepted=[];for(const plan of plans){if(plan.kind==='monthly'){let existing;try{existing=await readReport('monthly',plan.reportId);}catch(e){if(e.code!=='ENOENT')throw e;}if(existing?.status==='archived'&&!revise){if(kind==='auto')continue;throw Error('归档月报仅允许通过 --revise 明确修订');}}accepted.push(plan);}plans=accepted;
 const journals=await loadJournals(),topics=await loadTopics(),budget=createBudget(),generated=[],previews=[];
 const options={fixturePath:args.fixture?String(args.fixture):undefined,skipEnrichment:Boolean(args['no-enrichment']),disableLlm:Boolean(args['no-llm']),write:!args['dry-run'],revise,budget,contactEmail:String(process.env.CROSSREF_MAILTO||process.env.CONTACT_EMAIL||'').trim(),llmBaseUrl:process.env.LLM_BASE_URL,llmApiKey:process.env.LLM_API_KEY,llmModel:process.env.LLM_MODEL,maxPages:5,maxEnrichment:32,maxLanding:8,requestOptions:{timeoutMs:12000,retries:1}};
 for(const plan of plans){const report=await generateReport({...plan,date,journals,topics,options:{...options,status:plan.status}});previews.push(report);generated.push({kind:report.kind,reportId:report.reportId,paperCount:report.paperCount,status:report.status,warnings:report.warnings.length});}
 if(args['preview-output'])await writeFile(String(args['preview-output']),JSON.stringify(previews.length===1?previews[0]:previews,null,2)+'\n','utf8');
 console.log(JSON.stringify({date,generated,budget},null,2));return previews;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
