export function deliveryEstimate(start,now=Date.now()){
 const timestamp=Date.parse(start?.endsWith('Z')?start:`${start?.replace(' ','T')}Z`)
 if(!Number.isFinite(timestamp))return null
 const hours=Math.max(0,(now-timestamp)/3600000)
 if(hours>=72)return {stage:3,label:'Estimated delivery window reached',status:'on_the_way'}
 if(hours>=24)return {stage:2,label:'Day 2–3 · Expected on the way',status:'on_the_way'}
 if(hours>=1)return {stage:1,label:'Day 1 · Expected preparation / dispatch',status:'about_to_send'}
 return {stage:0,label:'First hour · Expected preparation',status:'about_to_send'}
}
