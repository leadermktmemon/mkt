// Build data.js cho dashboard tu Base Lark.
//   Online   = Base "Sales Online":
//      - 3.1 "DT theo nguon hang ngay" -> doanh thu THEO KENH (FB/IG/Zalo/Web) + ads/organic + so don
//      - 2.2 "Tong hop SO theo ngay"   -> Target ngay (cho %KPI)
//   Cua hang = Base "Cua hang" 2.4 (theo thang) -> Doanh thu CH theo shop + pheu (khach vao/mua, target)
// Output: data.json + data.js

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..");
const cfg = JSON.parse(readFileSync(join(root, "lark.config.json"), "utf8"));
const BASE = cfg.domain === "feishu" ? "https://open.feishu.cn" : "https://open.larksuite.com";
const SO_APP = "NimAbYHV3aWjPmsp7I9lugmbgcv";
const SO_SOURCE = "tbl6xpLNnyuXLydn";   // 3.1 DT theo nguon hang ngay
const SO_TOTAL = "tblLf6OWq6Z9nFQD";    // 2.2 Tong hop SO theo ngay (co Target ngay)
const STORE_APP = "Sfb9bDqKgakJMSs9xOglyyE5gdg";
const STORE_TBL = "tblqPCxm7QbDv6Zh";   // 2.4 Tong hop cua hang theo thang

async function token(){const r=await fetch(`${BASE}/open-apis/auth/v3/tenant_access_token/internal`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({app_id:cfg.appId,app_secret:cfg.appSecret})});const d=await r.json();if(d.code!==0)throw new Error("Token: "+d.msg);return d.tenant_access_token;}
async function allRecords(tk,app,tbl){const out=[];let pt=null;do{const u=new URL(`${BASE}/open-apis/bitable/v1/apps/${app}/tables/${tbl}/records`);u.searchParams.set("page_size","500");if(pt)u.searchParams.set("page_token",pt);const d=await(await fetch(u,{headers:{Authorization:`Bearer ${tk}`}})).json();if(d.code!==0)throw new Error(tbl+": "+d.msg);out.push(...(d.data?.items||[]));pt=d.data?.has_more?d.data.page_token:null;}while(pt);return out;}
const num=(v)=>typeof v==="number"?v:(v&&v.value!=null?Number(v.value):(typeof v==="string"?Number(v)||0:0));
const pad=(n)=>String(n).padStart(2,"0");
function dayOf(f){const y=num(f["Năm tương ứng"]),m=num(f["Tháng tương ứng"]),d=num(f["Ngày tương ứng"]);if(y&&m&&d)return `${y}-${pad(m)}-${pad(d)}`;if(f["Ngày"]){return new Date(f["Ngày"]+7*3600*1000).toISOString().slice(0,10);}return null;}
const round=(n)=>Math.round(n);
function cleanStore(n){if(!n)return "(?)";if(/outlet/i.test(n))return "Outlet";if(/tây sơn/i.test(n))return "Tây Sơn";return n.replace(/^(Bemori|Ngôi Nhà Gấu Bông|Teddy)\s+/i,"").replace(/^\S+\s+/,"").trim()||n;}

// Kenh online: ten hien thi -> {cot doanh thu, cac cot so don}
const CH = {
  "Facebook":  {rev:"Doanh thu Facebook",  ords:["Số đơn hàng Facebook Teddy","Số đơn hàng Facebook Bemori","Số đơn hàng Facebook Bemori Bear","Số đơn hàng Facebook Ngôi nhà Gấu Bông","Số đơn hàng Facebook Memon","Số đơn hàng Facebook GBO"]},
  "Instagram": {rev:"Doanh thu Instagram", ords:["Số đơn hàng IG Teddy","Số đơn hàng IG Bemori","Số đơn hàng IG Ngôi nhà gấu bông"]},
  "Zalo":      {rev:"Doanh thu Zalo",      ords:["Số đơn hàng Zalo Teddy","Số đơn hàng Zalo Bemori"]},
  "Website":   {rev:"Doanh thu Website",   ords:["Số đơn hàng Web Teddy","Số đơn hàng Web Bemori","Số đơn hàng Web GBO","Số đơn hàng Web NNGB"]},
  "Bán lẻ NK": {rev:"Bán lẻ NK",           ords:["Số đơn hàng Bán lẻ NK"]},
};

const tk=await token();
const src=await allRecords(tk,SO_APP,SO_SOURCE);
const tot=await allRecords(tk,SO_APP,SO_TOTAL);
const store=await allRecords(tk,STORE_APP,STORE_TBL);
console.log(`3.1 nguồn: ${src.length} | 2.2 tổng (target): ${tot.length} | Cửa hàng: ${store.length}`);

const dayMap={};
function ensure(day){return dayMap[day]??={online:{},onlineRev:0,onlineOrders:0,onlineTarget:0,fbAds:0,ggAds:0,social:0,store:{},storeRev:0,storeOnline:0,storeTarget:0,custIn:0,custBuy:0,memonRev:0};}

// 3.1 -> Online theo kenh
for(const r of src){const f=r.fields;const day=dayOf(f);if(!day||day<"2025-01-01")continue;const D=ensure(day);
  for(const name in CH){const c=CH[name];const rev=num(f[c.rev]);let ord=0;for(const o of c.ords)ord+=num(f[o]);
    if(rev||ord){D.online[name]??={rev:0,orders:0};D.online[name].rev+=rev;D.online[name].orders+=ord;}}
  D.onlineRev+=num(f["Tổng doanh thu"]);
  D.fbAds+=num(f["Doanh thu FB ADS"]);D.ggAds+=num(f["Doanh thu GG ADS"]);D.social+=num(f["Doanh thu Social tự nhiên"]);
}
// 2.2 -> Target ngay + tong so don (cot "So don hang chot duoc" - day du hon per-source o 3.1)
for(const r of tot){const f=r.fields;const day=dayOf(f);if(!day||day<"2025-01-01")continue;const D=ensure(day);D.onlineTarget+=num(f["Target ngày"]);D.onlineOrders+=num(f["Số đơn hàng chốt được"]);}
// 2.4 -> Cua hang (theo thang)
for(const r of store){const f=r.fields;const day=dayOf(f);if(!day||day<"2025-01-01")continue;const D=ensure(day);
  const ch=num(f["Doanh thu CH"]);const onl=num(f["Doanh thu đơn Online chuyển đơn"]);
  const name=cleanStore((f["Tên cửa hàng"]&&f["Tên cửa hàng"][0]&&(f["Tên cửa hàng"][0].name||f["Tên cửa hàng"][0].en_name))||"(?)");
  D.store[name]=(D.store[name]||0)+ch;D.storeRev+=ch;D.storeOnline+=onl;
  D.storeTarget+=num(f["Target Tháng"]);D.custIn+=num(f["SL Khách vào"]);D.custBuy+=num(f["SL khách mua"]);
}

const days=Object.keys(dayMap).filter(d=>d>="2025-01-01").sort();
const channelTotals={},storeTotals={};
const roundChan=(o)=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,{rev:round(v.rev),orders:v.orders}]));
const roundObj=(o)=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,round(v)]));
const daily=days.map(day=>{const D=dayMap[day];
  for(const k in D.online)channelTotals[k]=(channelTotals[k]||0)+D.online[k].rev;
  for(const k in D.store)storeTotals[k]=(storeTotals[k]||0)+D.store[k];
  return {day,online:roundChan(D.online),onlineRev:round(D.onlineRev),onlineOrders:D.onlineOrders,onlineTarget:round(D.onlineTarget),
    fbAds:round(D.fbAds),ggAds:round(D.ggAds),social:round(D.social),
    store:roundObj(D.store),storeRev:round(D.storeRev),storeOnline:round(D.storeOnline),storeTarget:round(D.storeTarget),custIn:round(D.custIn),custBuy:round(D.custBuy),memonRev:0};
});
const channels=Object.entries(channelTotals).sort((a,b)=>b[1]-a[1]).map(([n])=>n);
const stores=Object.entries(storeTotals).sort((a,b)=>b[1]-a[1]).map(([n])=>n);

function summarize(slice){let on=0,oo=0,st=0;const ch={};for(const d of slice){for(const k in d.online){ch[k]??={revenue:0,orders:0};ch[k].revenue+=d.online[k].rev;ch[k].orders+=d.online[k].orders;}on+=d.onlineRev;oo+=d.onlineOrders;st+=d.storeRev;}
  const chList=Object.entries(ch).sort((a,b)=>b[1].revenue-a[1].revenue).map(([name,v])=>({name,orders:v.orders,revenue:round(v.revenue),aov:v.orders?round(v.revenue/v.orders):0,share:on?round(v.revenue/on*100):0}));
  const total=on+st;return {marketing:{onlineRevenue:round(on),onlineOrders:oo,onlineAov:oo?round(on/oo):0,channels:chList},sales:{totalRevenue:round(total),salesCount:oo,byType:{Online:round(on),"Cửa hàng":round(st)},onlinePct:total?round(on/total*100):0,storePct:total?round(st/total*100):0},brands:{Bemori:round(total),Memon:0}};}
const sum30=summarize(daily.slice(-30));

const data={generatedAt:new Date().toISOString(),source:"lark",period:{days:daily.length,fromDate:days[0],toDate:days[days.length-1]},channels,stores,daily,memonBills:[],marketing:sum30.marketing,sales:sum30.sales,brands:sum30.brands};
writeFileSync(join(__dirname,"data.json"),JSON.stringify(data,null,2),"utf8");
writeFileSync(join(__dirname,"data.js"),`window.DASHBOARD_DATA=${JSON.stringify(data)};`,"utf8");

console.log(`\n${daily.length} ngày (${days[0]} → ${days[days.length-1]})`);
console.log("Kênh Online:",channels.join(", "));
const l30=daily.slice(-30);let on=0;const cc={};l30.forEach(d=>{on+=d.onlineRev;for(const k in d.online)cc[k]=(cc[k]||0)+d.online[k].rev;});
console.log("30 ngày Online theo kênh:");Object.entries(cc).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log("  "+k.padEnd(12)+Math.round(v).toLocaleString("vi-VN")));
console.log("Đã lưu (nguồn Lark, Online theo kênh)");
