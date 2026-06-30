// Build data.js cho dashboard tu Base Lark.
//   Online   = Base "Sales Online":
//      - 3.1 "DT theo nguon hang ngay" -> doanh thu THEO KENH (FB/IG/Zalo/Web) + ads/organic + so don
//      - 2.2 "Tong hop SO theo ngay"   -> Target ngay (cho %KPI)
//   Cua hang = Base "Cua hang" 2.4 (theo thang) -> Doanh thu CH theo shop + pheu (khach vao/mua, target)
// Output: data.json + data.js

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..");
const cfg = JSON.parse(readFileSync(join(root, "lark.config.json"), "utf8"));
const BASE = cfg.domain === "feishu" ? "https://open.feishu.cn" : "https://open.larksuite.com";
const SO_APP = "NimAbYHV3aWjPmsp7I9lugmbgcv";
const SO_SOURCE = "tbl6xpLNnyuXLydn";   // 3.1 DT theo nguon hang ngay
const SO_TOTAL = "tblLf6OWq6Z9nFQD";    // 2.2 Tong hop SO theo ngay (co Target ngay)
const SO_LEAD = "tblXZw7l2e5Hk8ZJ";     // Lead theo ngay: "L" (lead tho) + "Tong Lead tiem nang"
const STORE_APP = "Sfb9bDqKgakJMSs9xOglyyE5gdg";
const STORE_TBL = "tblH6XAodJy1WQwy";   // 2.2 Tong hop cua hang theo NGAY (4488 dong, du lieu hang ngay)
const STORE_LOOK = "tbl8zrOpqU22yN4z";  // 5.1 Lookup thong tin cua hang: map TK cua hang -> ten sach

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function fetchJson(url,opts){ // tu thu lai khi mang timeout
  for(let i=0;i<5;i++){
    try{ const r=await fetch(url,opts); return await r.json(); }
    catch(e){ if(i===4) throw e; console.log("  (mạng lỗi, thử lại "+(i+1)+"...)"); await sleep(2000*(i+1)); }
  }
}
async function token(){const d=await fetchJson(`${BASE}/open-apis/auth/v3/tenant_access_token/internal`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({app_id:cfg.appId,app_secret:cfg.appSecret})});if(d.code!==0)throw new Error("Token: "+d.msg);return d.tenant_access_token;}
async function allRecords(tk,app,tbl){const out=[];let pt=null;do{const u=new URL(`${BASE}/open-apis/bitable/v1/apps/${app}/tables/${tbl}/records`);u.searchParams.set("page_size","500");if(pt)u.searchParams.set("page_token",pt);const d=await fetchJson(u,{headers:{Authorization:`Bearer ${tk}`}});if(d.code!==0)throw new Error(tbl+": "+d.msg);out.push(...(d.data?.items||[]));pt=d.data?.has_more?d.data.page_token:null;}while(pt);return out;}
const num=(v)=>typeof v==="number"?v:(v&&v.value!=null?Number(v.value):(typeof v==="string"?Number(v)||0:0));
const pad=(n)=>String(n).padStart(2,"0");
function dayOf(f){const y=num(f["Năm tương ứng"]),m=num(f["Tháng tương ứng"]),d=num(f["Ngày tương ứng"]);if(y&&m&&d)return `${y}-${pad(m)}-${pad(d)}`;if(f["Ngày"]){return new Date(f["Ngày"]+7*3600*1000).toISOString().slice(0,10);}return null;}
const round=(n)=>Math.round(n);
function cleanStore(n){if(!n)return "(?)";const cht=n.match(/CHT\s+(.+)$/i);if(cht)n=cht[1];if(/outlet/i.test(n))return "Outlet";if(/tây sơn/i.test(n))return "Tây Sơn";return n.replace(/^(Bemori|Ngôi Nhà Gấu Bông|Teddy Outlet|Teddy|GBO)\s+/i,"").replace(/^[0-9][0-9A-Za-z\-]*\s+/,"").trim()||n;}

// Kenh online: ten hien thi -> {cot doanh thu, cac cot so don}
const CH = {
  "Facebook":  {rev:"Doanh thu Facebook",  ords:["Số đơn hàng Facebook Teddy","Số đơn hàng Facebook Bemori","Số đơn hàng Facebook Bemori Bear","Số đơn hàng Facebook Ngôi nhà Gấu Bông","Số đơn hàng Facebook Memon","Số đơn hàng Facebook GBO"]},
  "Instagram": {rev:"Doanh thu Instagram", ords:["Số đơn hàng IG Teddy","Số đơn hàng IG Bemori","Số đơn hàng IG Ngôi nhà gấu bông"]},
  "Zalo":      {rev:"Doanh thu Zalo",      ords:["Số đơn hàng Zalo Teddy","Số đơn hàng Zalo Bemori"]},
  "Website":   {rev:"Doanh thu Website",   ords:["Số đơn hàng Web Teddy","Số đơn hàng Web Bemori","Số đơn hàng Web GBO","Số đơn hàng Web NNGB"]},
  "Bán lẻ NK": {rev:"Bán lẻ NK",           ords:["Số đơn hàng Bán lẻ NK"]},
};

// Nhom 2: doanh thu theo THUONG HIEU (cot tong hop chuyen dung trong 3.1 -> tong chinh xac)
const BRANDS = { "Bemori":["Doanh thu Bemori"], "Teddy":["Doanh thu Teddy"], "Khác":["Doanh thu thương hiệu khác"] };
// Nhom 3: ma tran THUONG HIEU x KENH (cot con trong 3.1)
const BC = {
  "Bemori":   {Facebook:["Facebook Bemori","Facebook Bemori Bear"], Instagram:["IG Bemori"], Zalo:["Zalo Bemori"], Website:["Web Bemori"]},
  "Teddy":    {Facebook:["Facebook Kid"], Instagram:["IG Teddy"], Zalo:["Zalo Teddy"], Website:["Web Teddy"]},
  "GBO/NNGB": {Facebook:["Facebook Ngôi nhà Gấu Bông","Facebook GBO"], Instagram:["IG Ngôi nhà gấu bông"], Zalo:[], Website:["Web GBO","Web NNGB"]},
  "Memon":    {Facebook:["Facebook Memon"], Instagram:[], Zalo:[], Website:[]},
};

const tk=await token();
const src=await allRecords(tk,SO_APP,SO_SOURCE);
const tot=await allRecords(tk,SO_APP,SO_TOTAL);
const lead=await allRecords(tk,SO_APP,SO_LEAD);
const store=await allRecords(tk,STORE_APP,STORE_TBL);
const look=await allRecords(tk,STORE_APP,STORE_LOOK);
// Map account (TK cua hang id) -> ten cua hang sach tu bang 5.1
const STORE_MAP={};for(const r of look){const tf=r.fields["TK cửa hàng"]&&r.fields["TK cửa hàng"][0];const nm=r.fields["Cửa hàng"];if(tf&&nm)STORE_MAP[tf.id]=nm;}
console.log(`3.1 nguồn: ${src.length} | 2.2 tổng (target): ${tot.length} | Lead: ${lead.length} | Cửa hàng: ${store.length} | map CH: ${Object.keys(STORE_MAP).length}`);

// Chi phi Meta Ads theo ngay (do meta-fetch.mjs tao truoc, neu co)
const metaPath=join(__dirname,"meta-data.json");
const metaRaw=existsSync(metaPath)?JSON.parse(readFileSync(metaPath,"utf8")):{};
const metaByDay=metaRaw.daily||{};
const metaCampaigns=metaRaw.campaignDays||[];
console.log(`Meta Ads: ${Object.keys(metaByDay).length} ngày dữ liệu${Object.keys(metaByDay).length===0?" (chạy meta-fetch.mjs trước để có dữ liệu)":""}. Campaigns: ${metaCampaigns.length}`);

const dayMap={};
function ensure(day){return dayMap[day]??={online:{},onlineRev:0,online100:0,onlineOrders:0,onlineProducts:0,onlineTarget:0,fbAds:0,ggAds:0,social:0,brands:{},bc:{},store:{},storeRev:0,storeOnline:0,storeTarget:0,custIn:0,custBuy:0,memonRev:0,leadRaw:0,leadQual:0,leadL4:0,leadFB:0,leadL4FB:0,leadFBAds:0,leadL4FBAds:0};}

// 3.1 -> Online theo kenh
for(const r of src){const f=r.fields;const day=dayOf(f);if(!day||day<"2025-01-01")continue;const D=ensure(day);
  for(const name in CH){const c=CH[name];const rev=num(f[c.rev]);let ord=0;for(const o of c.ords)ord+=num(f[o]);
    if(rev||ord){D.online[name]??={rev:0,orders:0};D.online[name].rev+=rev;D.online[name].orders+=ord;}}
  D.onlineRev+=num(f["Tổng doanh thu"]);
  D.fbAds+=num(f["Doanh thu FB ADS"]);D.ggAds+=num(f["Doanh thu GG ADS"]);D.social+=num(f["Doanh thu Social tự nhiên"]);
  for(const b in BRANDS){let v=0;for(const c of BRANDS[b])v+=num(f[c]);if(v)D.brands[b]=(D.brands[b]||0)+v;}
  for(const b in BC){for(const ch in BC[b]){let v=0;for(const c of BC[b][ch])v+=num(f[c]);if(v){(D.bc[b]??={})[ch]=(D.bc[b][ch]||0)+v;}}}
}
// 2.2 -> Target ngay + tong so don + DOANH THU 100% (bang "Ko dc sua", tu tong hop -> chinh xac & ko tre nhu form 3.1)
//   AOV online = Doanh thu 100% / So don chot (dung dinh nghia "Gia tri TB don" cua Base).
for(const r of tot){const f=r.fields;const day=dayOf(f);if(!day||day<"2025-01-01")continue;const D=ensure(day);
  D.onlineTarget+=num(f["Target ngày"]);D.onlineOrders+=num(f["Số đơn hàng chốt được"]);
  D.online100+=num(f["Doanh thu 100%"]);D.onlineProducts+=num(f["Số sản phẩm bán"]);}
// 5.1 Ty le chuyen doi theo ngay:
//   "L" = lead tho (luot khach), "Tong Lead tiem nang" = L4+L5 tat ca nguon
//   Theo nguon: "So L FB"/"So L4 FB" (Facebook chung), "So L FB ADS"/"So L4 FB ADS" (FB ads)
//   % chat luong lead = L4 / L (lead chat luong / lead thu duoc)
for(const r of lead){const f=r.fields;const day=dayOf(f);if(!day||day<"2025-01-01")continue;const D=ensure(day);
  D.leadRaw+=num(f["L"]);D.leadQual+=num(f["Tổng Lead tiềm năng"]);
  // L4 tong (chat luong) = L4 FB + L4 IG + L4 Zalo. FB ADS la tap con cua FB -> khong cong rieng.
  D.leadL4+=num(f["Số L4 FB"])+num(f["Số L4 IG"])+num(f["Số L4 Zalo"]);
  D.leadFB+=num(f["Số L FB"]);D.leadL4FB+=num(f["Số L4 FB"]);
  D.leadFBAds+=num(f["Số L FB ADS"]);D.leadL4FBAds+=num(f["Số L4 FB ADS"]);}
// 2.4 -> Cua hang (theo thang)
for(const r of store){const f=r.fields;const day=dayOf(f);if(!day||day<"2025-01-01")continue;const D=ensure(day);
  const ch=num(f["Doanh thu CH"]);const onl=num(f["Doanh thu đơn Online chuyển đơn"]);
  const tf=f["TK cửa hàng"]&&f["TK cửa hàng"][0];
  const name=(tf&&STORE_MAP[tf.id])||cleanStore(tf&&tf.name)||"(?)";
  if(ch)D.store[name]=(D.store[name]||0)+ch;D.storeRev+=ch;D.storeOnline+=onl;
  D.storeTarget+=num(f["Target ngày"]);D.custIn+=num(f["SL Khách vào"]);D.custBuy+=num(f["SL khách mua"]);
}

const days=Object.keys(dayMap).filter(d=>d>="2025-01-01").sort();
const channelTotals={},storeTotals={};
const roundChan=(o)=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,{rev:round(v.rev),orders:v.orders}]));
const roundObj=(o)=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,round(v)]));
const daily=days.map(day=>{const D=dayMap[day];
  for(const k in D.online)channelTotals[k]=(channelTotals[k]||0)+D.online[k].rev;
  for(const k in D.store)storeTotals[k]=(storeTotals[k]||0)+D.store[k];
  // onlineRev = doanh thu Online CHINH (uu tien 2.2 "Doanh thu 100%"; fallback 3.1 cho ngay 2.2 chua co, vd dau 2025).
  // online[kenh].rev giu nguyen tu 3.1 (chi de tinh TY TRONG kenh); so don theo kenh KHONG co trong Base -> uoc luong khi hien thi.
  const md=metaByDay[day]||{};
  return {day,online:roundChan(D.online),onlineRev:round(D.online100||D.onlineRev),onlineRev31:round(D.onlineRev),onlineOrders:D.onlineOrders,onlineProducts:D.onlineProducts,onlineTarget:round(D.onlineTarget),
    fbAds:round(D.fbAds),ggAds:round(D.ggAds),social:Math.max(0,round(D.social)),
    brands:roundObj(D.brands),bc:Object.fromEntries(Object.entries(D.bc).map(([b,o])=>[b,roundObj(o)])),
    store:roundObj(D.store),storeRev:round(D.storeRev),storeOnline:round(D.storeOnline),storeTarget:round(D.storeTarget),custIn:round(D.custIn),custBuy:round(D.custBuy),memonRev:0,
    leadRaw:round(D.leadRaw),leadQual:round(D.leadQual),leadL4:round(D.leadL4),leadFB:round(D.leadFB),leadL4FB:round(D.leadL4FB),leadFBAds:round(D.leadFBAds),leadL4FBAds:round(D.leadL4FBAds),
    metaFb:md.facebook||0,metaIg:md.instagram||0,metaTotal:md.total||0,metaIgPixelRev:Math.round(md.igPurchaseValue||0)};
});
const channels=Object.entries(channelTotals).sort((a,b)=>b[1]-a[1]).map(([n])=>n);
const stores=Object.entries(storeTotals).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([n])=>n);

function summarize(slice){let on=0,oo=0,st=0,stOnline=0,vin=0,vbuy=0;const chRaw={};for(const d of slice){for(const k in d.online){chRaw[k]=(chRaw[k]||0)+d.online[k].rev;}on+=d.onlineRev;oo+=d.onlineOrders;st+=d.storeRev;stOnline+=d.storeOnline;vin+=d.custIn;vbuy+=d.custBuy;}
  const sumCh=Object.values(chRaw).reduce((a,b)=>a+b,0)||1;
  // So don/AOV theo kenh = UOC LUONG theo ty trong doanh thu (Base khong nhap so don theo kenh).
  const chList=Object.entries(chRaw).sort((a,b)=>b[1]-a[1]).map(([name,raw])=>{const share=raw/sumCh;const revenue=on*share;const orders=Math.round(oo*share);return {name,orders,revenue:round(revenue),aov:orders?round(revenue/orders):0,share:round(share*100),est:true};});
  const aov=oo?round(on/oo):0;
  const mktOrders=aov?Math.round(stOnline/aov):0; // so don Marketing chuyen ve CH = uoc luong (DT chuyen don / AOV online)
  const total=on+st;
  // Gom doanh thu theo thuong hieu tu 3.1 (BRANDS map: Bemori/Teddy/Khác -> cot Base)
  const brandTotals={};for(const d of slice){for(const b in d.brands){brandTotals[b]=(brandTotals[b]||0)+d.brands[b];}}
  // Bemori = Bemori online + cua hang (uoc luong theo ty trong); Memon = B2B/si (chua co Base rieng)
  const bemiShare=(brandTotals["Bemori"]||0)/((Object.values(brandTotals).reduce((a,b)=>a+b,0))||1);
  const brands={Bemori:round((brandTotals["Bemori"]||0)+bemiShare*st),Teddy:round(brandTotals["Teddy"]||0),Memon:0};
  return {marketing:{onlineRevenue:round(on),onlineOrders:oo,onlineAov:aov,channels:chList},
    store:{walkinRevenue:round(st),walkinOrders:vbuy,marketingRevenue:round(stOnline),marketingOrdersEst:mktOrders,custIn:vin,closeRate:vin?round(vbuy/vin*100):0,marketingPct:(st+stOnline)?round(stOnline/(st+stOnline)*100):0},
    sales:{totalRevenue:round(total),salesCount:oo,byType:{Online:round(on),"Cửa hàng":round(st)},onlinePct:total?round(on/total*100):0,storePct:total?round(st/total*100):0},brands};}
const sum30=summarize(daily.slice(-30));

// Tuan nay theo gio VN (UTC+7): Thu 2 -> hom nay
const _vnNow=new Date(Date.now()+7*3600*1000);
const _vnToday=_vnNow.toISOString().slice(0,10);
const _dow=_vnNow.getUTCDay();
const _offMon=_dow===0?6:_dow-1;
const _monDate=new Date(_vnNow.getTime()-_offMon*86400000).toISOString().slice(0,10);
const weekSlice=daily.filter(d=>d.day>=_monDate&&d.day<=_vnToday);
const sumWeek=summarize(weekSlice.length?weekSlice:daily.slice(-7));
const weekPeriod={from:_monDate,to:_vnToday,days:weekSlice.length};

// Tach creative ra creativeMap (tranh luu 438 ban sao trung nhau trong campaignDays)
const creativeMap={};
const campaignDaysClean=metaCampaigns.map(({creative,...rest})=>{
  const hasContent=creative&&(creative.title||creative.body||creative.imageUrl||(creative.images&&creative.images.length>0));
  if(hasContent&&!creativeMap[rest.id])creativeMap[rest.id]=creative;
  return rest;
});
const data={generatedAt:new Date().toISOString(),source:"lark",period:{days:daily.length,fromDate:days[0],toDate:days[days.length-1]},channels,stores,daily,creativeMap,campaignDays:campaignDaysClean,memonBills:[],marketing:sum30.marketing,store:sum30.store,sales:sum30.sales,brands:sum30.brands,weekMarketing:sumWeek.marketing,weekStore:sumWeek.store,weekSales:sumWeek.sales,weekBrands:sumWeek.brands,weekPeriod};
writeFileSync(join(__dirname,"data.json"),JSON.stringify(data,null,2),"utf8");
writeFileSync(join(__dirname,"data.js"),`window.DASHBOARD_DATA=${JSON.stringify(data)};`,"utf8");

console.log(`\n${daily.length} ngày (${days[0]} → ${days[days.length-1]})`);
console.log("Kênh Online:",channels.join(", "));
const l30=daily.slice(-30);let on=0;const cc={};l30.forEach(d=>{on+=d.onlineRev;for(const k in d.online)cc[k]=(cc[k]||0)+d.online[k].rev;});
console.log("30 ngày Online theo kênh:");Object.entries(cc).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log("  "+k.padEnd(12)+Math.round(v).toLocaleString("vi-VN")));
console.log("Đã lưu (nguồn Lark, Online theo kênh)");
