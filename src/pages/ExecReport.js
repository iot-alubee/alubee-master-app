import React, { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

// ── helpers ───────────────────────────────────────────────────────────────────
function getWorkingDaysInMonth(y,m){let c=0;const d=new Date(y,m+1,0).getDate();for(let i=1;i<=d;i++)if(new Date(y,m,i).getDay()!==0)c++;return c;}
function getWorkingDaysElapsed(y,m,t){let c=0;for(let d=1;d<=Math.min(t,31);d++)if(new Date(y,m,d).getDay()!==0)c++;return c;}
function aggCustPart(dd,custId,partNo){const pd=(dd[custId]||{})[partNo]||{};return Object.values(pd).reduce((a,v)=>a+(v||0),0);}
function aggSuppPart(dd,suppId,partNo){const pd=(dd[suppId]||{})[partNo]||{};return Object.entries(pd).reduce((a,[,v])=>a+(v?.inward||0),0);}
const fmtL=n=>`₹${(n/100000).toFixed(2)}L`;
const fmtK=n=>n>=1000?(n/1000).toFixed(1)+'K':Math.round(n).toLocaleString('en-IN');
const fmtPct=n=>`${Math.round(n)}%`;

export default function ExecReport({ userProfile, onBack }) {
  const now = new Date();
  const [year,setYear]  = useState(now.getFullYear());
  const [month,setMonth]= useState(now.getMonth());
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');

  const today = now.getDate();
  const WORKING_DAYS = getWorkingDaysInMonth(year,month);
  const daysElapsed  = Math.max(getWorkingDaysElapsed(year,month,today-1),1);
  const daysLeft     = Math.max(WORKING_DAYS - getWorkingDaysElapsed(year,month,today),1);
  const normsElapsed = getWorkingDaysElapsed(year,month,today-1)/WORKING_DAYS;
  const monthLabel   = new Date(year,month).toLocaleString('en-IN',{month:'long',year:'numeric'});

  async function generate() {
    setGenerating(true);
    setStatus('Loading customer data…');

    try {
      // ── Load customer data ────────────────────────────────────────────────
      const [custMasterSnap, custSchedSnap, custDailySnap] = await Promise.all([
        getDocs(collection(db,'customer_master')),
        getDocs(query(collection(db,'customer_schedules'),where('year','==',year))),
        getDocs(query(collection(db,'customer_daily'),where('year','==',year))),
      ]);
      const customers = custMasterSnap.docs.map(d=>({id:d.id,...d.data()})).filter(c=>c.parts?.length>0);
      const custSched={};
      custSchedSnap.docs.forEach(d=>{const{custId,partNo,scheduleQty,wipQty}=d.data();if(!custSched[custId])custSched[custId]={};custSched[custId][partNo]={scheduleQty:scheduleQty||0,wipQty:wipQty||0};});
      const custDaily={};
      custDailySnap.docs.forEach(d=>{const{custId,partNo,day,dispatched,month:m}=d.data();if(m!==month)return;if(!custDaily[custId])custDaily[custId]={};if(!custDaily[custId][partNo])custDaily[custId][partNo]={};custDaily[custId][partNo][day]=dispatched||0;});

      // Customer stats
      setStatus('Calculating customer performance…');
      const custStats = customers.map(c=>{
        const parts=(c.parts||[]).map(p=>{
          const ex=(custSched[c.id]||{})[p.partNo]||{};
          const schQ=ex.scheduleQty||0; const disp=aggCustPart(custDaily,c.id,p.partNo);
          return {...p,schQ,disp,ach:disp*p.rate,val:schQ*p.rate,bal:Math.max(0,schQ-disp)};
        });
        const totSch=parts.reduce((a,p)=>a+p.schQ,0);
        const totDisp=parts.reduce((a,p)=>a+p.disp,0);
        const totVal=parts.reduce((a,p)=>a+p.val,0);
        const totAch=parts.reduce((a,p)=>a+p.ach,0);
        const dispPct=totSch>0?totDisp/totSch*100:0;
        const arpu=totSch>0?totVal/totSch:0;
        const currRate=daysElapsed>0?totDisp/daysElapsed:0;
        const projVal=totAch+currRate*daysLeft*arpu;
        const status=dispPct>=normsElapsed*100?'ok':dispPct>=normsElapsed*60?'risk':'crit';
        return {id:c.id,name:c.name,parts,totSch,totDisp,totVal,totAch,dispPct,arpu,currRate,projVal,status,bal:Math.max(0,totSch-totDisp)};
      }).filter(s=>s.totSch>0).sort((a,b)=>b.totVal-a.totVal);

      const cGrand={sch:custStats.reduce((a,s)=>a+s.totSch,0),disp:custStats.reduce((a,s)=>a+s.totDisp,0),val:custStats.reduce((a,s)=>a+s.totVal,0),ach:custStats.reduce((a,s)=>a+s.totAch,0)};
      const cARPU=cGrand.sch>0?cGrand.val/cGrand.sch:0;
      const cAvgDay=cGrand.disp/daysElapsed;
      const cReqDay=Math.max(0,cGrand.sch-cGrand.disp)/daysLeft;
      const cProjVal=cGrand.ach+(cAvgDay*daysLeft*cARPU);
      const cStrike=daysLeft>0?Math.max(0,cGrand.val-cGrand.ach)/daysLeft:0;
      const cDisp=cGrand.sch>0?cGrand.disp/cGrand.sch*100:0;

      // Daily dispatch totals for chart
      const custDailyTotals={};
      Object.values(custDaily).forEach(custParts=>Object.values(custParts).forEach(days=>Object.entries(days).forEach(([d,v])=>{custDailyTotals[d]=(custDailyTotals[d]||0)+(v||0);})));

      // ── Load supplier data ────────────────────────────────────────────────
      setStatus('Loading supplier data…');
      const [suppMasterSnap, suppSchedSnap, suppDailySnap] = await Promise.all([
        getDocs(collection(db,'supplier_master')),
        getDocs(query(collection(db,'supplier_schedules'),where('year','==',year),where('month','==',month))),
        getDocs(query(collection(db,'supplier_daily'),where('year','==',year),where('month','==',month))),
      ]);
      const suppliers = suppMasterSnap.docs.map(d=>({id:d.id,...d.data()})).filter(s=>s.parts?.length>0);
      const suppSched={};
      suppSchedSnap.docs.forEach(d=>{const{supplierId,partNo,scheduleQty,openingStock}=d.data();if(!suppSched[supplierId])suppSched[supplierId]={};suppSched[supplierId][partNo]={scheduleQty:scheduleQty||0,openingStock:openingStock||0};});
      const suppDaily={};
      suppDailySnap.docs.forEach(d=>{const{supplierId,partNo,day,inward,outward}=d.data();if(!suppDaily[supplierId])suppDaily[supplierId]={};if(!suppDaily[supplierId][partNo])suppDaily[supplierId][partNo]={};suppDaily[supplierId][partNo][day]={inward:inward||0,outward:outward||0};});

      const suppStats = suppliers.map(s=>{
        const parts=(s.parts||[]).map(p=>{
          const ex=(suppSched[s.id]||{})[p.partNo]||{};
          const schQ=ex.scheduleQty||0; const opening=ex.openingStock||0;
          const inw=aggSuppPart(suppDaily,s.id,p.partNo);
          const outw=Object.values((suppDaily[s.id]||{})[p.partNo]||{}).reduce((a,v)=>a+(v?.outward||0),0);
          const wip=Math.max(0,opening+outw-inw);
          return {...p,schQ,inw,outw,wip,val:schQ*p.rate,ach:inw*p.rate};
        });
        const totSch=parts.reduce((a,p)=>a+p.schQ,0);
        const totInw=parts.reduce((a,p)=>a+p.inw,0);
        const totVal=parts.reduce((a,p)=>a+p.val,0);
        const totAch=parts.reduce((a,p)=>a+p.ach,0);
        const totWip=parts.reduce((a,p)=>a+p.wip,0);
        const dispPct=totSch>0?totInw/totSch*100:0;
        const currRate=daysElapsed>0?totInw/daysElapsed:0;
        const projVal=totAch+currRate*daysLeft*(totVal/Math.max(totSch,1));
        const status=dispPct>=normsElapsed*100?'ok':dispPct>=normsElapsed*60?'risk':'crit';
        return {id:s.id,name:s.name,totSch,totInw,totVal,totAch,totWip,dispPct,currRate,projVal,status,bal:Math.max(0,totSch-totInw)};
      }).filter(s=>s.totSch>0).sort((a,b)=>b.totVal-a.totVal);

      const sGrand={sch:suppStats.reduce((a,s)=>a+s.totSch,0),inw:suppStats.reduce((a,s)=>a+s.totInw,0),val:suppStats.reduce((a,s)=>a+s.totVal,0),ach:suppStats.reduce((a,s)=>a+s.totAch,0),wip:suppStats.reduce((a,s)=>a+s.totWip,0)};
      const sDisp=sGrand.sch>0?sGrand.inw/sGrand.sch*100:0;
      const sAvgDay=sGrand.inw/daysElapsed;
      const sReqDay=Math.max(0,sGrand.sch-sGrand.inw)/daysLeft;
      const sProjVal=sGrand.ach+(sAvgDay*daysLeft*(sGrand.val/Math.max(sGrand.sch,1)));



      setStatus('Generating report…');
      // ── Build HTML ─────────────────────────────────────────────────────────
      const genDate = new Date().toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true});

      // Status color helpers
      const sc = s => s==='ok'?'#22c55e':s==='risk'?'#f97316':'#ef4444';
      const sb = s => s==='ok'?'#052e16':s==='risk'?'#431407':'#450a0a';
      const sl = s => s==='ok'?'ON TRACK':s==='risk'?'AT RISK':'CRITICAL';
      const pBar = (pct,color,bg='#1e293b') => `<div style="height:6px;background:${bg};border-radius:3px;overflow:hidden"><div style="width:${Math.min(pct,100)}%;height:100%;background:${color};border-radius:3px"></div></div>`;
      const nPct = normsElapsed*100;

      // Overall health score (simple weighted)
      const healthScore = Math.round((cDisp*0.6 + sDisp*0.4));
      const healthColor = healthScore>=nPct?'#22c55e':healthScore>=nPct*0.7?'#f97316':'#ef4444';
      const healthLabel = healthScore>=nPct?'ON TRACK':healthScore>=nPct*0.7?'AT RISK':'CRITICAL';

      const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Alubee Executive Report — ${monthLabel}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0e1a;color:#e2e8f0;margin:0;padding:0}
.page{max-width:1100px;margin:0 auto;padding:24px}
.noprint{position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:999}
@media print{
  body{background:#0a0e1a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .noprint{display:none!important}
  .page{padding:16px}
  .pb{page-break-before:always}
}
</style>
</head><body>

<div class="noprint">
  <button onclick="window.print()" style="padding:10px 20px;background:#22c55e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">🖨 Download PDF</button>
  <button onclick="window.close()" style="padding:10px 16px;background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:8px;cursor:pointer;font-size:13px">✕ Close</button>
</div>

<div class="page">

<!-- ═══ HEADER ══════════════════════════════════════════════════════════════ -->
<div style="background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%);border-radius:16px;padding:32px;margin-bottom:20px;border:1px solid #334155;position:relative;overflow:hidden">
  <div style="position:absolute;top:-40px;right:-40px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,0.15),transparent)"></div>
  <div style="position:absolute;bottom:-60px;left:-30px;width:250px;height:250px;border-radius:50%;background:radial-gradient(circle,rgba(34,197,94,0.08),transparent)"></div>
  <div style="display:flex;align-items:flex-start;justify-content:space-between;position:relative">
    <div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <div style="width:48px;height:48px;background:linear-gradient(135deg,#22c55e,#16a34a);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff">A</div>
        <div>
          <div style="font-size:11px;color:#94a3b8;letter-spacing:0.1em;text-transform:uppercase">Alubee Die Casters Pvt Ltd</div>
          <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px">Executive Performance Report</div>
        </div>
      </div>
      <div style="font-size:28px;font-weight:900;color:#818cf8;margin-top:4px">${monthLabel}</div>
      <div style="font-size:12px;color:#64748b;margin-top:6px">Day ${getWorkingDaysElapsed(year,month,today)} of ${WORKING_DAYS} working days · ${daysLeft} days remaining · Norms: ${fmtPct(nPct)}</div>
    </div>
  </div>
  <!-- Big 3 qty summary -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px">
    ${[
      {l:'Total Schedule',   v:cGrand.sch.toLocaleString('en-IN'), c:'#e2e8f0'},
      {l:'Total Dispatched', v:cGrand.disp.toLocaleString('en-IN'), c:'#22c55e'},
      {l:'Balance',          v:Math.max(0,cGrand.sch-cGrand.disp).toLocaleString('en-IN'), c:'#818cf8'},
    ].map(k=>`
      <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:18px 20px">
        <div style="font-size:28px;font-weight:900;color:${k.c};letter-spacing:-1px">${k.v}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;font-weight:600">${k.l}</div>
      </div>`).join('')}
  </div>
  <div style="display:none">
    <div style="text-align:right">
      <div style="font-size:11px;color:#64748b;margin-bottom:8px">Generated: ${genDate}</div>
      <div style="background:${sb(healthScore>=nPct?'ok':healthScore>=nPct*0.7?'risk':'crit')};border:2px solid ${healthColor};border-radius:12px;padding:16px 24px;text-align:center">
        <div style="font-size:40px;font-weight:900;color:${healthColor}">${fmtPct(healthScore)}</div>
        <div style="font-size:10px;color:${healthColor};font-weight:800;letter-spacing:0.1em;text-transform:uppercase;margin-top:2px">Overall Dispatch</div>
        <div style="font-size:9px;color:${healthColor};opacity:0.8;margin-top:2px">${healthLabel} vs ${fmtPct(nPct)} norms</div>
      </div>
    </div>
  </div>
</div>

<!-- ═══ PERFORMANCE SUMMARY ════════════════════════════════════════════════ -->
<div style="margin-bottom:8px;font-size:10px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:0.1em">⚡ Performance Summary</div>
<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:8px">
${[
  {l:'Overall ARPU',     v:`₹${Math.round(cARPU)}/pc`,        c:'#fbbf24', s:'Order value ÷ schedule qty', i:'💎'},
  {l:'Avg Dispatch/Day', v:fmtK(Math.round(cAvgDay)),         c:'#22d3ee', s:`${daysElapsed} working days elapsed`, i:'📦'},
  {l:'Avg Revenue/Day',  v:fmtL(cGrand.ach/daysElapsed),      c:'#34d399', s:`Achieved ÷ ${daysElapsed} days`, i:'💰'},
  {l:'Strike Rate/Day',  v:fmtL(cStrike),                     c:'#f97316', s:'Revenue/day to hit 100% value', i:'🎯'},
  {l:'Required Qty/Day', v:fmtK(Math.round(cReqDay)),         c:cReqDay>cAvgDay*1.5?'#ef4444':'#f97316', s:'To clear balance', i:'⚡'},
].map(k=>`
  <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid #334155;border-radius:12px;padding:14px;text-align:center">
    <div style="font-size:16px;margin-bottom:3px">${k.i}</div>
    <div style="font-size:17px;font-weight:900;color:${k.c}">${k.v}</div>
    <div style="font-size:9px;color:#94a3b8;margin-top:2px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">${k.l}</div>
    <div style="font-size:8px;color:#475569;margin-top:1px">${k.s}</div>
  </div>`).join('')}
</div>
<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px">
${[
  {l:'Order Value',      v:fmtL(cGrand.val),                  c:'#818cf8', s:'Schedule × rate', i:'📋'},
  {l:'Value Achieved',   v:fmtL(cGrand.ach),                  c:'#22c55e', s:`${(cGrand.ach/Math.max(cGrand.val,1)*100).toFixed(1)}% of order`, i:'✅'},
  {l:'Avg Backlog/Day',  v:fmtL(Math.max(0,cGrand.val*(nPct/100)-cGrand.ach)/daysElapsed), c:'#ef4444', s:'Behind norms · per day', i:'📉'},
  {l:'Value at Risk',    v:fmtL(Math.max(0,cGrand.val-cProjVal)), c:'#f87171', s:'If pace stays same', i:'⚠️'},
  {l:'Days Remaining',   v:`${daysLeft}d`,                    c:daysLeft<=3?'#ef4444':daysLeft<=7?'#f97316':'#3b82f6', s:'Working days left', i:'📅'},
].map(k=>`
  <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid #334155;border-radius:12px;padding:14px;text-align:center">
    <div style="font-size:16px;margin-bottom:3px">${k.i}</div>
    <div style="font-size:17px;font-weight:900;color:${k.c}">${k.v}</div>
    <div style="font-size:9px;color:#94a3b8;margin-top:2px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">${k.l}</div>
    <div style="font-size:8px;color:#475569;margin-top:1px">${k.s}</div>
  </div>`).join('')}
</div>

<!-- ═══ CUSTOMER PERFORMANCE ════════════════════════════════════════════════ -->
<div style="background:linear-gradient(135deg,#0f172a,#1a1040);border:1px solid #4c1d95;border-radius:16px;padding:24px;margin-bottom:20px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div>
      <div style="font-size:16px;font-weight:900;color:#a78bfa">📊 CUSTOMER DISPATCH PERFORMANCE</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">${custStats.length} active customers · Target norms: ${fmtPct(nPct)}</div>
    </div>
    <div style="display:flex;gap:12px">
      ${[
        {l:'Avg Qty/Day',   v:fmtK(Math.round(cAvgDay))},
        {l:'Req Qty/Day',   v:fmtK(Math.round(cReqDay))},
        {l:'Dispatch %',    v:fmtPct(cDisp)},
      ].map(k=>`<div style="text-align:center;background:#1e1b4b;border-radius:8px;padding:8px 14px">
        <div style="font-size:16px;font-weight:900;color:#a78bfa">${k.v}</div>
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;font-weight:700">${k.l}</div>
      </div>`).join('')}
    </div>
  </div>

  <!-- Summary progress -->
  <div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-bottom:4px">
      <span>Overall dispatch vs norms</span><span>${fmtPct(cDisp)} of ${fmtPct(nPct)} target</span>
    </div>
    <div style="height:10px;background:#1e293b;border-radius:5px;overflow:hidden;position:relative">
      <div style="position:absolute;top:0;left:0;width:${Math.min(nPct,100)}%;height:100%;border-right:2px dashed #818cf8"></div>
      <div style="width:${Math.min(cDisp,100)}%;height:100%;background:${cDisp>=nPct?'linear-gradient(90deg,#22c55e,#16a34a)':'linear-gradient(90deg,#ef4444,#f97316)'};border-radius:5px"></div>
    </div>
  </div>

  <!-- Customer table -->
  <table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead>
      <tr style="background:#1e1b4b">
        ${['Customer','Order Qty','Order Value','Dispatched','Balance','Dispatch%','Curr Rate/day','Projected','Status'].map(h=>`<th style="padding:8px 10px;text-align:${h==='Customer'?'left':'center'};color:#a78bfa;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #4c1d95">${h}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
    ${custStats.map((s,i)=>`
      <tr style="background:${i%2===0?'rgba(255,255,255,0.02)':'transparent'}">
        <td style="padding:8px 10px;font-weight:700;color:#e2e8f0;border-bottom:1px solid #1e293b">${s.name}</td>
        <td style="padding:8px 10px;text-align:center;color:#818cf8;font-weight:700;border-bottom:1px solid #1e293b">${fmtK(s.totSch)}</td>
        <td style="padding:8px 10px;text-align:center;color:#94a3b8;border-bottom:1px solid #1e293b">${fmtL(s.totVal)}</td>
        <td style="padding:8px 10px;text-align:center;color:#22c55e;font-weight:700;border-bottom:1px solid #1e293b">${fmtL(s.totAch)}</td>
        <td style="padding:8px 10px;text-align:center;color:#f97316;border-bottom:1px solid #1e293b">${fmtL(Math.max(0,s.totVal-s.totAch))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #1e293b">
          <div style="display:flex;align-items:center;gap:6px">
            ${pBar(s.dispPct,sc(s.status),'#1e293b')}
            <span style="font-weight:700;color:${sc(s.status)};white-space:nowrap;font-size:10px">${fmtPct(s.dispPct)}</span>
          </div>
        </td>
        <td style="padding:8px 10px;text-align:center;color:#94a3b8;border-bottom:1px solid #1e293b">${fmtK(Math.round(s.currRate))}</td>
        <td style="padding:8px 10px;text-align:center;color:${s.projVal>=s.totVal?'#22c55e':'#f97316'};font-weight:700;border-bottom:1px solid #1e293b">${fmtL(s.projVal)}</td>
        <td style="padding:8px 10px;text-align:center;border-bottom:1px solid #1e293b">
          <span style="background:${sb(s.status)};color:${sc(s.status)};border:1px solid ${sc(s.status)}44;border-radius:20px;padding:2px 8px;font-size:9px;font-weight:800">${sl(s.status)}</span>
        </td>
      </tr>`).join('')}
      <tr style="background:#1e1b4b;font-weight:900">
        <td style="padding:9px 10px;color:#fff;font-weight:900">TOTAL</td>
        <td style="padding:9px 10px;text-align:center;color:#818cf8">${fmtK(cGrand.sch)}</td>
        <td style="padding:9px 10px;text-align:center;color:#a78bfa">${fmtL(cGrand.val)}</td>
        <td style="padding:9px 10px;text-align:center;color:#22c55e">${fmtL(cGrand.ach)}</td>
        <td style="padding:9px 10px;text-align:center;color:#f97316">${fmtL(Math.max(0,cGrand.val-cGrand.ach))}</td>
        <td style="padding:9px 10px;text-align:center;color:${cDisp>=nPct?'#22c55e':'#ef4444'};font-weight:900">${fmtPct(cDisp)}</td>
        <td style="padding:9px 10px;text-align:center;color:#94a3b8">${fmtK(Math.round(cAvgDay))}/day</td>
        <td style="padding:9px 10px;text-align:center;color:${cProjVal>=cGrand.val?'#22c55e':'#f97316'}">${fmtL(cProjVal)}</td>
        <td style="padding:9px 10px;text-align:center">
          <span style="background:${sb(cDisp>=nPct?'ok':cDisp>=nPct*0.7?'risk':'crit')};color:${cDisp>=nPct?'#22c55e':cDisp>=nPct*0.7?'#f97316':'#ef4444'};border-radius:20px;padding:3px 10px;font-size:9px;font-weight:900">${cDisp>=nPct?'ON TRACK':cDisp>=nPct*0.7?'AT RISK':'CRITICAL'}</span>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- Daily dispatch mini chart -->
  ${Object.keys(custDailyTotals).length>0?`
  <div style="margin-top:16px">
    <div style="font-size:10px;color:#64748b;margin-bottom:8px;text-transform:uppercase;font-weight:700;letter-spacing:0.06em">Daily Dispatch (Qty)</div>
    <div style="display:flex;align-items:flex-end;gap:4px;height:50px">
      ${Object.entries(custDailyTotals).sort((a,b)=>Number(a[0])-Number(b[0])).map(([d,v])=>{
        const maxV=Math.max(...Object.values(custDailyTotals));
        const h=maxV>0?Math.round((v/maxV)*50):0;
        const norm=Math.round(cAvgDay);
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="font-size:7px;color:#64748b">${fmtK(v)}</div>
          <div style="width:100%;height:${h}px;background:${v>=norm?'#22c55e':'#f97316'};border-radius:2px 2px 0 0;min-height:3px"></div>
          <div style="font-size:7px;color:#64748b">${d}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`:''}
</div>

<!-- ═══ SUPPLIER PERFORMANCE ════════════════════════════════════════════════ -->
<div style="background:linear-gradient(135deg,#0f172a,#0a2010);border:1px solid #166534;border-radius:16px;padding:24px;margin-bottom:20px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div>
      <div style="font-size:16px;font-weight:900;color:#4ade80">📦 SUPPLIER INWARD PERFORMANCE</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">${suppStats.length} active suppliers · WIP at supplier: ${fmtK(sGrand.wip)} pcs</div>
    </div>
    <div style="display:flex;gap:12px">
      ${[
        {l:'Avg Inward/Day', v:fmtK(Math.round(sAvgDay))},
        {l:'Req/Day',        v:fmtK(Math.round(sReqDay))},
        {l:'Inward %',       v:fmtPct(sDisp)},
      ].map(k=>`<div style="text-align:center;background:#0a2010;border-radius:8px;padding:8px 14px">
        <div style="font-size:16px;font-weight:900;color:#4ade80">${k.v}</div>
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;font-weight:700">${k.l}</div>
      </div>`).join('')}
    </div>
  </div>

  <div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-bottom:4px">
      <span>Overall inward vs norms</span><span>${fmtPct(sDisp)} of ${fmtPct(nPct)} target</span>
    </div>
    <div style="height:10px;background:#1e293b;border-radius:5px;overflow:hidden;position:relative">
      <div style="position:absolute;top:0;left:0;width:${Math.min(nPct,100)}%;height:100%;border-right:2px dashed #4ade80"></div>
      <div style="width:${Math.min(sDisp,100)}%;height:100%;background:${sDisp>=nPct?'linear-gradient(90deg,#22c55e,#16a34a)':'linear-gradient(90deg,#ef4444,#f97316)'};border-radius:5px"></div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead>
      <tr style="background:#0a2010">
        ${['Supplier','Order Qty','Order Value','Inward','Balance','Inward %','WIP','Projected','Status'].map(h=>`<th style="padding:8px 10px;text-align:${h==='Supplier'?'left':'center'};color:#4ade80;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #166534">${h}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
    ${suppStats.map((s,i)=>`
      <tr style="background:${i%2===0?'rgba(255,255,255,0.02)':'transparent'}">
        <td style="padding:8px 10px;font-weight:700;color:#e2e8f0;border-bottom:1px solid #1e293b">${s.name}</td>
        <td style="padding:8px 10px;text-align:center;color:#4ade80;font-weight:700;border-bottom:1px solid #1e293b">${fmtK(s.totSch)}</td>
        <td style="padding:8px 10px;text-align:center;color:#94a3b8;border-bottom:1px solid #1e293b">${fmtL(s.totVal)}</td>
        <td style="padding:8px 10px;text-align:center;color:#4ade80;font-weight:700;border-bottom:1px solid #1e293b">${fmtL(s.totAch)}</td>
        <td style="padding:8px 10px;text-align:center;color:#f97316;border-bottom:1px solid #1e293b">${fmtL(s.bal*s.totVal/Math.max(s.totSch,1))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #1e293b">
          <div style="display:flex;align-items:center;gap:6px">
            ${pBar(s.dispPct,sc(s.status),'#1e293b')}
            <span style="font-weight:700;color:${sc(s.status)};white-space:nowrap;font-size:10px">${fmtPct(s.dispPct)}</span>
          </div>
        </td>
        <td style="padding:8px 10px;text-align:center;color:#818cf8;border-bottom:1px solid #1e293b">${fmtK(s.totWip)}</td>
        <td style="padding:8px 10px;text-align:center;color:${s.projVal>=s.totVal?'#4ade80':'#f97316'};font-weight:700;border-bottom:1px solid #1e293b">${fmtL(s.projVal)}</td>
        <td style="padding:8px 10px;text-align:center;border-bottom:1px solid #1e293b">
          <span style="background:${sb(s.status)};color:${sc(s.status)};border:1px solid ${sc(s.status)}44;border-radius:20px;padding:2px 8px;font-size:9px;font-weight:800">${sl(s.status)}</span>
        </td>
      </tr>`).join('')}
      <tr style="background:#0a2010;font-weight:900">
        <td style="padding:9px 10px;color:#fff;font-weight:900">TOTAL</td>
        <td style="padding:9px 10px;text-align:center;color:#4ade80">${fmtK(sGrand.sch)}</td>
        <td style="padding:9px 10px;text-align:center;color:#4ade80">${fmtL(sGrand.val)}</td>
        <td style="padding:9px 10px;text-align:center;color:#22c55e">${fmtL(sGrand.ach)}</td>
        <td style="padding:9px 10px;text-align:center;color:#f97316">${fmtL(Math.max(0,sGrand.val-sGrand.ach))}</td>
        <td style="padding:9px 10px;text-align:center;color:${sDisp>=nPct?'#22c55e':'#ef4444'};font-weight:900">${fmtPct(sDisp)}</td>
        <td style="padding:9px 10px;text-align:center;color:#818cf8">${fmtK(sGrand.wip)}</td>
        <td style="padding:9px 10px;text-align:center;color:${sProjVal>=sGrand.val?'#22c55e':'#f97316'}">${fmtL(sProjVal)}</td>
        <td style="padding:9px 10px;text-align:center">
          <span style="background:${sb(sDisp>=nPct?'ok':sDisp>=nPct*0.7?'risk':'crit')};color:${sDisp>=nPct?'#22c55e':sDisp>=nPct*0.7?'#f97316':'#ef4444'};border-radius:20px;padding:3px 10px;font-size:9px;font-weight:900">${sDisp>=nPct?'ON TRACK':sDisp>=nPct*0.7?'AT RISK':'CRITICAL'}</span>
        </td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ═══ MONTH-END PROJECTION ═══════════════════════════════════════════════ -->
<div style="margin-bottom:20px">

  <!-- Month-end projection (now full width) -->
  <div style="background:linear-gradient(135deg,#0f172a,#1c0a00);border:1px solid #c2410c;border-radius:16px;padding:24px">
    <div style="font-size:14px;font-weight:900;color:#fb923c;margin-bottom:14px">📈 MONTH-END PROJECTION</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      ${[
        {l:'Order Value',      v:fmtL(cGrand.val),    c:'#94a3b8'},
        {l:'Achieved So Far',  v:fmtL(cGrand.ach),    c:'#22c55e'},
        {l:'Projected End',    v:fmtL(cProjVal),      c:cProjVal>=cGrand.val?'#22c55e':'#fb923c'},
        {l:'Projected Gap',    v:cProjVal>=cGrand.val?'✅ Surplus':fmtL(cGrand.val-cProjVal)+' short', c:cProjVal>=cGrand.val?'#22c55e':'#ef4444'},
      ].map(k=>`<div style="background:#1c0a00;border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:16px;font-weight:900;color:${k.c}">${k.v}</div>
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;font-weight:700;margin-top:2px">${k.l}</div>
      </div>`).join('')}
    </div>
    <!-- Combined projection bar -->
    <div style="margin-top:8px">
      <div style="font-size:9px;color:#64748b;margin-bottom:5px;text-transform:uppercase;font-weight:700">Projection vs Target</div>
      <div style="height:14px;background:#1e293b;border-radius:7px;overflow:hidden;position:relative">
        <div style="position:absolute;top:0;left:0;width:${Math.min(cGrand.ach/cGrand.val*100,100)}%;height:100%;background:#22c55e;border-radius:7px 0 0 7px"></div>
        <div style="position:absolute;top:0;left:${Math.min(cGrand.ach/cGrand.val*100,100)}%;width:${Math.max(0,Math.min((cProjVal-cGrand.ach)/cGrand.val*100,100-cGrand.ach/cGrand.val*100))}%;height:100%;background:#f97316;opacity:0.7"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:#64748b;margin-top:4px">
        <span style="color:#22c55e">Achieved: ${fmtPct(cGrand.ach/cGrand.val*100)}</span>
        <span style="color:#f97316">Projected: ${fmtPct(Math.min(cProjVal/cGrand.val*100,100))}</span>
        <span>Target: 100%</span>
      </div>
    </div>
    <!-- Customer-wise short list -->
    ${custStats.filter(s=>s.projVal<s.totVal).length>0?`
    <div style="margin-top:14px">
      <div style="font-size:9px;color:#ef4444;font-weight:700;margin-bottom:6px;text-transform:uppercase">⚠ Customers likely to fall short:</div>
      ${custStats.filter(s=>s.projVal<s.totVal).map(s=>`
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1e293b;font-size:10px">
          <span style="color:#fca5a5">${s.name}</span>
          <span style="color:#f97316">Short ${fmtL(s.totVal-s.projVal)}</span>
        </div>`).join('')}
    </div>`:
    `<div style="margin-top:14px;text-align:center;color:#22c55e;font-size:12px;font-weight:700">✅ All customers projected on track</div>`}
  </div>
</div>

<!-- ═══ FOOTER ═══════════════════════════════════════════════════════════════ -->
<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center">
  <div style="font-size:10px;color:#475569">Alubee Die Casters Pvt Ltd · Executive Report · Strictly Confidential</div>
  <div style="font-size:10px;color:#475569">${monthLabel} · Generated ${genDate}</div>
  <div style="font-size:10px;color:#475569">For MD review only</div>
</div>

</div><!-- /page -->
</body></html>`;

      setStatus('Opening report…');
      const isNative = !!(window.Capacitor?.isNativePlatform?.());
      if (isNative) {
        const blob = new Blob([html],{type:'text/html'});
        const url = URL.createObjectURL(blob);
        window.open(url,'_blank');
      } else {
        const win = window.open('','_blank');
        if(win) { win.document.write(html); win.document.close(); }
      }
      setStatus('');
    } catch(e) {
      setStatus('❌ Error: '+e.message);
    }
    setGenerating(false);
  }

  const C = {bg:'#0F1117',card:'#181C2E',raised:'#1E2340',border:'#252D50',text:'#E6EDF3',sub:'#8892B0'};

  return (
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:'Inter,system-ui,sans-serif',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:'40px 48px',maxWidth:500,width:'100%',textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:16}}>📊</div>
        <div style={{fontWeight:900,fontSize:22,color:C.text,marginBottom:4}}>Executive Performance Report</div>
        <div style={{fontSize:12,color:C.sub,marginBottom:24}}>One click · Full picture · Customer + Supplier + Revenue</div>

        {/* Month selector */}
        <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:24}}>
          <select value={`${year}-${month}`} onChange={e=>{const[y,m]=e.target.value.split('-').map(Number);setYear(y);setMonth(m);}}
            style={{padding:'8px 14px',borderRadius:8,border:`1px solid ${C.border}`,background:C.raised,color:C.text,fontFamily:'inherit',fontSize:13,cursor:'pointer'}}>
            {Array.from({length:12},(_,i)=>{
              const d=new Date(now.getFullYear(),i);
              return <option key={i} value={`${now.getFullYear()}-${i}`}>{d.toLocaleString('en-IN',{month:'long',year:'numeric'})}</option>;
            })}
          </select>
        </div>

        {status&&<div style={{fontSize:12,color:'#818cf8',marginBottom:12,fontWeight:600}}>{status}</div>}

        <button onClick={generate} disabled={generating}
          style={{width:'100%',padding:'16px',borderRadius:12,border:'none',
            background:generating?'#374151':'linear-gradient(135deg,#6366f1,#8b5cf6)',
            color:'#fff',fontWeight:900,fontSize:16,cursor:generating?'not-allowed':'pointer',
            fontFamily:'inherit',letterSpacing:'0.02em',
            boxShadow:generating?'none':'0 4px 24px rgba(99,102,241,0.4)'}}>
          {generating?'⏳ Generating…':'🚀 Generate Executive Report'}
        </button>

        <div style={{marginTop:16,fontSize:11,color:C.sub}}>
          Includes: Customer dispatch · Supplier inward · Revenue MTD · Month-end projections · Status alerts
        </div>

        {onBack&&<button onClick={onBack} style={{marginTop:16,background:'transparent',border:'none',color:C.sub,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>← Back to Dashboard</button>}
      </div>
    </div>
  );
}
