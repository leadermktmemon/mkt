// Build data.js cho dashboard tu 2 Base Lark (Sales Online + Cua hang) - chinh xac hon nhanh.vn.
//   Online   = Base "Sales Online" cot "Doanh thu 100%" (theo TK sale)
//   Cua hang = Base "Cua hang" cot "Doanh thu CH" (theo cua hang)
//   Tong     = Online + Cua hang
// Output: data.json + data.js (window.DASHBOARD_DATA)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..");
const cfg = JSON.parse(readFileSync(join(root, "lark.config.json"), "utf8"));
const BASE = cfg.domain === "feishu" ? "https://open.feishu.cn" : "https://open.larksuite.com";
const SALES = { appToken: "NimAbYHV3aWjPmsp7I9lugmbgcv", tableId: "tblLf6OWq6Z9nFQD" };
const STORE = { appToken: "Sfb9bDqKgakJMSs9xOglyyE5gdg", tableId: "tblqPCxm7QbDv6Zh" };

async function token(){const r=await fetch(`${BASE}/open-apis/auth/v3/tenant_access_token/internal`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({app_id:cfg.appId,app_secret:cfg.appSecret})});const d=await r.json();if(d.code!==0)throw new Error("Token: "+d.msg);return d.tenant_access_token;}
async function allRecords(tk,t){const out=[];let pt=null;do{const u=new URL(`${BASE}/open-apis/bitable/v1/apps/${t.appToken}/tables/${t.tableId}/records`);u.searchParams.set("page_size","500");if(pt)u.searchParams.set("page_token",pt);const d=await(await fetch(u,{headers:{Authorization:`Bearer ${tk}`}})).json();if(d.code!==0)throw new Error(t.tableId+": "+d.msg);out.push(...(d.data?.items||[]));pt=d.data?.has_more?d.data.page_token:null;}while(pt);return out;}
const num=(v)=>typeof v==="number"?v:(v&&v.value!=null?Number(v.value):0);
const pad=(n)=>String(n).padStart(2,"0");
// Rut gon ten cua hang ve ten ngan (theo danh sach hien tai)
function cleanStore(n){ if(!n)return "(?)";
  if(/outlet/i.test(n)) return "Outlet";
  if(/tây sơn/i.test(n)) return "Tây Sơn";
  return n.replace(/^(Bemori|Ngôi Nhà Gấu Bông|Teddy)\s+/i,"").replace(/^\S+\s+/,"").trim() || n;
}
function dayOf(f){const y=num(f["Năm tương ứng"]),m=num(f["Tháng tương ứng"]),d=num(f["Ngày tương ứng"]);if(y&&m&&d)return `${y}-${pad(m)}-${pad(d)}`;if(f["Ngày"]){const dt=new Date(f["Ngày"]+7*3600*1000);return dt.toISOString().slice(0,10);}return null;}
const round=(n)=>Math.round(n);

const tk=await token();
const sales=await allRecords(tk,SALES);
const store=await allRecords(tk,STORE);
console.log(`Sales Online: ${sales.length} dòng | Cửa hàng: ${store.length} dòng`);

const dayMap={};
function ensure(day){return dayMap[day]??={online:{},onlineRev:0,onlineOrders:0,onlineTarget:0,store:{},storeRev:0,storeOnline:0,storeTarget:0,custIn:0,custBuy:0,memonRev:0};}

// SALES ONLINE -> Online (theo TK sale)
for(const r of sales){const f=r.fields;const day=dayOf(f);if(!day)continue;const D=ensure(day);
  const rev=num(f["Doanh thu 100%"]);const ord=num(f["Số đơn hàng chốt được"]);
  const acc=(f["TK cửa hàng"]&&f["TK cửa hàng"][0]&&f["TK cửa hàng"][0].name)||"Sale Online";
  D.online[acc]??={rev:0,orders:0};D.online[acc].rev+=rev;D.online[acc].orders+=ord;
  D.onlineRev+=rev;D.onlineOrders+=ord;D.onlineTarget+=num(f["Target ngày"]);
}
// CUA HANG (theo thang) -> store + pheu cua hang
for(const r of store){const f=r.fields;const day=dayOf(f);if(!day)continue;const D=ensure(day);
  const ch=num(f["Doanh thu CH"]);const onl=num(f["Doanh thu đơn Online chuyển đơn"]);
  const raw=(f["Tên cửa hàng"]&&f["Tên cửa hàng"][0]&&(f["Tên cửa hàng"][0].name||f["Tên cửa hàng"][0].en_name))||"(?)";
  const name=cleanStore(raw);
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
  return {day,online:roundChan(D.online),onlineRev:round(D.onlineRev),onlineOrders:D.onlineOrders,onlineTarget:round(D.onlineTarget),store:roundObj(D.store),storeRev:round(D.storeRev),storeOnline:round(D.storeOnline),storeTarget:round(D.storeTarget),custIn:round(D.custIn),custBuy:round(D.custBuy),memonRev:0};
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
const l30=daily.slice(-30);let on=0,st=0;l30.forEach(d=>{on+=d.onlineRev;st+=d.storeRev;});
console.log(`30 ngày gần nhất: Online ${round(on).toLocaleString("vi-VN")} + Cửa hàng ${round(st).toLocaleString("vi-VN")} = ${round(on+st).toLocaleString("vi-VN")}`);
console.log("Đã lưu data.json + data.js (nguồn Lark)");
