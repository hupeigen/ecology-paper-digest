export const FEEDBACK_KEY='ecology-radar-feedback-v1';
const LIMIT=5000;
export function normalizeFeedback(value){
 if(!value||value.version!==1||!value.items||Array.isArray(value.items)||typeof value.items!=='object')throw Error('反馈文件格式不正确');
 const entries=Object.entries(value.items);if(entries.length>LIMIT)throw Error('反馈条目过多');
 const items=Object.create(null);
 for(const [key,v] of entries){const doi=String(key).toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'').trim();
  if(!/^10\.\d{4,9}\/\S+$/i.test(doi)||['__proto__','constructor','prototype'].includes(key)||!v||typeof v!=='object'||!['worth-reading','irrelevant'].includes(v.value)||typeof v.reason!=='string'||v.reason.length>300||!Number.isFinite(Date.parse(v.updatedAt))||String(v.doi).toLowerCase()!==doi)throw Error('反馈条目无效，未导入');
  items[doi]={doi,value:v.value,reason:v.reason,updatedAt:v.updatedAt};
 }
 return{version:1,items};
}
export function importFeedback(text){if(new TextEncoder().encode(text).length>1_000_000)throw Error('反馈文件超过1MB');return normalizeFeedback(JSON.parse(text));}
export function mergeFeedback(current,incoming){const a=normalizeFeedback(current),b=normalizeFeedback(incoming),items=Object.assign(Object.create(null),a.items);for(const[d,v]of Object.entries(b.items))if(!items[d]||Date.parse(v.updatedAt)>Date.parse(items[d].updatedAt))items[d]=v;return normalizeFeedback({version:1,items});}
