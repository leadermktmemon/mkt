// Keo toan bo 2 Base + tong hop theo thang de hieu cau truc & quan he.
import { readFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync(new URL("./lark.config.json", import.meta.url), "utf8"));
const BASE = cfg.domain === "feishu" ? "https://open.feishu.cn" : "https://open.larksuite.com";
const ym = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + "-" + String(d.getUTCMonth()+1).padStart(2,"0"); };

async function token(){const r=await fetch(`${BASE}/open-apis/auth/v3/tenant_access_token/internal`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({app_id:cfg.appId,app_secret:cfg.appSecret})});return (await r.json()).tenant_access_token;}
async function allRecords(tk, appToken, tableId){
  const out=[]; let pageToken=null;
  do{
    const u=new URL(`${BASE}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`);
    u.searchParams.set("page_size","500"); if(pageToken)u.searchParams.set("page_token",pageToken);
    const d=await (await fetch(u,{headers:{Authorization:`Bearer ${tk}`}})).json();
    if(d.code!==0){console.log("LOI",d.code,d.msg);break;}
    out.push(...(d.data?.items||[])); pageToken=d.data?.has_more?d.data.page_token:null;
  }while(pageToken);
  return out;
}
const num=(v)=> typeof v==="number"?v : (v&&v.value!=null?Number(v.value):0);

const tk=await token();

// ---- Sales Online ----
const so=await allRecords(tk,"NimAbYHV3aWjPmsp7I9lugmbgcv","tblLf6OWq6Z9nFQD");
const soM={};
for(const r of so){const f=r.fields; const m=f["Ngày"]?ym(f["Ngày"]):"?";
  soM[m]??={dt100:0,dt70:0,don:0,leadMsg:0,recs:0};
  soM[m].dt100+=num(f["Doanh thu 100%"]); soM[m].dt70+=num(f["Doanh thu 70%"]);
  soM[m].don+=num(f["Số đơn hàng chốt được"]); soM[m].leadMsg+=num(f["Tổng số khách nhắn tin"]); soM[m].recs++;
}
console.log("===== SALES ONLINE — theo tháng =====");
console.log("Tổng record:",so.length);
Object.entries(soM).sort().forEach(([m,v])=>console.log(`  ${m}: DT100 ${Math.round(v.dt100).toLocaleString("vi-VN")} | đơn ${v.don} | khách nhắn ${v.leadMsg} | ${v.recs} dòng`));

// ---- Cua hang ----
const ch=await allRecords(tk,"Sfb9bDqKgakJMSs9xOglyyE5gdg","tblqPCxm7QbDv6Zh");
const chM={};
for(const r of ch){const f=r.fields; const m=f["Ngày"]?ym(f["Ngày"]):"?";
  chM[m]??={tong:0,ch:0,online:0,cuoi:0,recs:0};
  chM[m].tong+=num(f["Doanh thu tổng (CH + Online)"]); chM[m].ch+=num(f["Doanh thu CH"]);
  chM[m].online+=num(f["Doanh thu đơn Online chuyển đơn"]); chM[m].cuoi+=num(f["Doanh thu cuối cùng"]); chM[m].recs++;
}
console.log("\n===== CỬA HÀNG — theo tháng =====");
console.log("Tổng record:",ch.length);
Object.entries(chM).sort().forEach(([m,v])=>console.log(`  ${m}: Tổng ${Math.round(v.tong).toLocaleString("vi-VN")} = CH ${Math.round(v.ch).toLocaleString("vi-VN")} + Online ${Math.round(v.online).toLocaleString("vi-VN")} | ${v.recs} dòng`));

// ---- So sanh Online: Sales Online vs cot Online trong Cua hang ----
console.log("\n===== ĐỐI CHIẾU Online (cùng tháng) =====");
const months=[...new Set([...Object.keys(soM),...Object.keys(chM)])].sort();
months.forEach(m=>{const a=soM[m]?.dt100||0,b=chM[m]?.online||0;console.log(`  ${m}: Sales Online DT100=${Math.round(a).toLocaleString("vi-VN")} | CH cột Online=${Math.round(b).toLocaleString("vi-VN")}`);});
