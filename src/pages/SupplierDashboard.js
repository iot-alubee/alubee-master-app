import React, { useState, useEffect, useCallback } from 'react';
function LastUpdatedBadge({at, by}) {
  if (!at && !by) return null;
  let ts = null;
  try {
    if (at instanceof Date) { ts = at; }
    else if (at && typeof at.toDate === 'function') { ts = at.toDate(); }
    else if (at && at.seconds) { ts = new Date(at.seconds * 1000); }
    else if (at && typeof at === 'string') { ts = new Date(at); }
    else if (at && typeof at === 'number') { ts = new Date(at); }
    if (ts && isNaN(ts.getTime())) ts = null;
  } catch(e) { ts = null; }
  const dateStr  = ts ? ts.toLocaleDateString('en-IN',{year:'numeric',month:'2-digit',day:'2-digit'}).split('/').reverse().join('-') : null;
  const timeStr  = ts ? ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : null;
  return (
    <div style={{fontSize:11,color:'rgba(255,255,255,0.6)',marginTop:2}}>
      Last updated:{dateStr&&<> <span style={{color:'#f97316',fontWeight:700}}>{dateStr}</span></>}{timeStr&&<> at {timeStr}</>}{by&&<> by <strong style={{color:'#fff'}}>{by}</strong></>}
    </div>
  );
}


import { doc, setDoc, getDocs, deleteDoc, query, where, collection } from 'firebase/firestore';
import { createNotification, NOTIF_TYPES } from '../utils/notificationService';
import { db } from '../firebase';

// ─── WORKING DAYS ────────────────────────────────────────────────────────────
function getWorkingDaysInMonth(year, month) {
  let c = 0;
  for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++)
    if (new Date(year, month, d).getDay() !== 0) c++;
  return c;
}
function getWorkingDaysElapsed(year, month, today) {
  let c = 0;
  for (let d = 1; d <= today; d++)
    if (new Date(year, month, d).getDay() !== 0) c++;
  return c;
}
function getNorms(year, month, today, effectiveWD) {
  const total = effectiveWD !== undefined ? effectiveWD : getWorkingDaysInMonth(year, month);
  return total > 0 ? getWorkingDaysElapsed(year, month, today) / total : 0;
}

// ─── MASTER DATA ─────────────────────────────────────────────────────────────
const DEFAULT_SUPPLIERS = [
  { id:'vinayagam', name:'VINAYAGAM INDUSTRIES', order:1, machines:0, manpower:0, shifts:1,
    parts:[{partNo:'PH 691',rate:3.75},{partNo:'PH 147',rate:3.90},{partNo:'PH 525',rate:3.25},
           {partNo:'PEC 528',rate:1.75},{partNo:'PH 095',rate:2.90},{partNo:'PH 880',rate:3.00},
           {partNo:'CES 298',rate:3.70},{partNo:'CES 306',rate:4.20}]},
  { id:'srm', name:'SRM', order:2, machines:0, manpower:0, shifts:1,
    parts:[{partNo:'C6X 601',rate:2.00}]},
  { id:'jayasakthi', name:'JAYASAKTHI', order:3, machines:0, manpower:0, shifts:1,
    parts:[{partNo:'C6X 601',rate:1.90},{partNo:'PH 6784',rate:0},{partNo:'PH 3992',rate:0}]},
  { id:'yokesh', name:'YOKESH', order:4, machines:0, manpower:0, shifts:1,
    parts:[{partNo:'C6X 601',rate:2.10},{partNo:"IMB '020",rate:0}]},
  { id:'vs', name:'V.S', order:5, machines:0, manpower:0, shifts:1,
    parts:[{partNo:'CES 021',rate:4.25},{partNo:'CES 905',rate:4.25},{partNo:'CES 371',rate:4.25},
           {partNo:'IMB 576',rate:2.75},{partNo:'IMB 020',rate:2.20},{partNo:'BANJO 473',rate:4.80}]},
  { id:'rajeswari', name:'RAJESWARI', order:6, machines:0, manpower:0, shifts:1,
    parts:[{partNo:'PH 3992',rate:0},{partNo:'PH 6784',rate:0}]},
];

// ─── FIRESTORE HELPERS ───────────────────────────────────────────────────────
async function loadSupplierMaster(unit) {
  const u = unit||'u1';
  const col = u==='u2' ? 'supplier_master_u2' : 'supplier_master';
  try {
    const snap = await getDocs(collection(db, col));
    if (!snap.empty) {
      const list = []; snap.forEach(d => list.push(d.data()));
      const sorted = list.sort((a,b) => (a.order||0)-(b.order||0));
      if (sorted.length>0) return sorted;
    }
    if (u==='u2') return []; // U2 has own master, don't seed with U1 defaults
    await Promise.all(DEFAULT_SUPPLIERS.map(s => setDoc(doc(db,col,s.id), s)));
    return [...DEFAULT_SUPPLIERS];
  } catch(e) { console.error(e); return u==='u2'?[...DEFAULT_SUPPLIERS]:[];}
}
async function saveSupplierMaster(s, unit) {
  const col = (unit||'u1')==='u2' ? 'supplier_master_u2' : 'supplier_master';
  await setDoc(doc(db,col,s.id), s);
}
async function deleteSupplierMaster(id, unit) {
  const col = (unit||'u1')==='u2' ? 'supplier_master_u2' : 'supplier_master';
  await deleteDoc(doc(db,col,id));
}

async function saveSchedule(year, month, supplierId, partNo, scheduleQty, openingStock, updatedBy, unit) {
  const u=unit||'u1';
  const docId = `${year}_${String(month+1).padStart(2,'0')}_${supplierId}_${partNo.replace(/[\s']/g,'_')}`;
  await setDoc(doc(db,`supplier_schedules${u==='u2'?'_u2':''}`,docId),
    { year, month, supplierId, partNo, scheduleQty: Number(scheduleQty)||0,
      openingStock: Number(openingStock)||0, updatedAt: new Date(), updatedBy: updatedBy||'PPC' }, { merge:true });
}
async function getSchedules(year, month) {
  const q = query(collection(db,'supplier_schedules'), where('year','==',year), where('month','==',month));
  const snap = await getDocs(q); const r = {};
  snap.forEach(d => {
    const { supplierId, partNo, scheduleQty, openingStock } = d.data();
    if (!r[supplierId]) r[supplierId] = {};
    r[supplierId][partNo] = { scheduleQty: scheduleQty||0, openingStock: openingStock||0 };
  });
  return r;
}

async function saveDailyEntry(year, month, day, supplierId, partNo, inward, outward, updatedBy, unit) {
  const u=unit||'u1';
  const docId = `${year}_${String(month+1).padStart(2,'00')}_${supplierId}_${partNo.replace(/[\s']/g,'_')}_${String(day).padStart(2,'0')}`;
  await setDoc(doc(db,`supplier_daily${u==='u2'?'_u2':''}`,docId),
    { year, month, day, supplierId, partNo,
      inward: Number(inward)||0, outward: Number(outward)||0, updatedAt: new Date(), updatedBy: updatedBy||'PPC' }, { merge:true });
}
async function getDailyEntries(year, month) {
  const q = query(collection(db,'supplier_daily'), where('year','==',year), where('month','==',month));
  const snap = await getDocs(q); const r = {};
  snap.forEach(d => {
    const dat = d.data();
    const { supplierId, partNo, day, inward, outward, updatedAt, updatedBy } = dat;
    if (!r[supplierId]) r[supplierId] = {};
    if (!r[supplierId][partNo]) r[supplierId][partNo] = {};
    r[supplierId][partNo][day] = { inward:inward||0, outward:outward||0 };
    if (updatedAt) { if(!r._lastUpd||updatedAt>r._lastUpd.at) r._lastUpd={at:updatedAt,by:updatedBy||'—'}; }
  });
  return r;
}

// RAG status: supplier_rag/{year_month_supplierId_date}
async function saveRAG(year, month, day, supplierId, rag) {
  const docId = `${year}_${String(month+1).padStart(2,'0')}_${supplierId}_${String(day).padStart(2,'0')}`;
  await setDoc(doc(db,'supplier_rag',docId), { year, month, day, supplierId, ...rag, updatedAt: new Date() }, { merge:true });
}
async function getRAGAll(year, month) {
  const q = query(collection(db,'supplier_rag'), where('year','==',year), where('month','==',month));
  const snap = await getDocs(q); const r = {};
  snap.forEach(d => {
    const { supplierId, day, power, load, manpower, machine } = d.data();
    if (!r[supplierId]) r[supplierId] = {};
    r[supplierId][day] = { power, load, manpower, machine };
  });
  return r;
}

// ─── AGGREGATE ───────────────────────────────────────────────────────────────
function aggPart(dailyData, supplierId, partNo) {
  const days = (dailyData[supplierId]||{})[partNo]||{};
  let inw=0, outw=0;
  Object.values(days).forEach(d => { inw+=d.inward; outw+=d.outward; });
  return { inw, outw };
}

// ─── COLOURS ─────────────────────────────────────────────────────────────────
const C = {
  blue:'#1e40af', blueLt:'#dbeafe', green:'#15803d', greenLt:'#dcfce7',
  orange:'#ea580c', orangeLt:'#fff7ed', red:'#dc2626', redLt:'#fee2e2',
  amber:'#b45309', amberLt:'#fef3c7', gray:'#374151', grayLt:'#f3f4f6',
  text:'#111827', subtext:'#4b5563', border:'#d1d5db',
};

const RAG_OPTS = [
  { val:'G', label:'Green',  bg:'#16a34a', text:'#fff' },
  { val:'A', label:'Amber',  bg:'#d97706', text:'#fff' },
  { val:'R', label:'Red',    bg:'#dc2626', text:'#fff' },
];
function ragColor(v) {
  if (v==='G') return { bg:'#16a34a', text:'#fff' };
  if (v==='A') return { bg:'#d97706', text:'#fff' };
  if (v==='R') return { bg:'#dc2626', text:'#fff' };
  return { bg:'#e5e7eb', text:'#6b7280' };
}

// ─── SMALL UI ────────────────────────────────────────────────────────────────
function Badge({ pct, norms }) {
  if (pct >= norms) return <span style={{background:C.greenLt,color:C.green,borderRadius:6,padding:'3px 10px',fontWeight:800,fontSize:11}}>ON TRACK</span>;
  if (pct >= norms*0.85) return <span style={{background:C.amberLt,color:C.amber,borderRadius:6,padding:'3px 10px',fontWeight:800,fontSize:11}}>AT RISK</span>;
  return <span style={{background:C.redLt,color:C.red,borderRadius:6,padding:'3px 10px',fontWeight:800,fontSize:11}}>BACKLOG</span>;
}

function Card({ label, value, sub, color, bg }) {
  return (
    <div style={{background:bg||'#fff',border:`2px solid ${color||C.border}`,borderRadius:10,padding:'10px 14px',flex:1,minWidth:90}}>
      <div style={{fontSize:11,color:C.subtext,fontWeight:700}}>{label}</div>
      <div style={{fontSize:20,fontWeight:900,color:color||C.text,marginTop:2}}>{value}</div>
      {sub && <div style={{fontSize:10,color:C.subtext,marginTop:1}}>{sub}</div>}
    </div>
  );
}

function HBar({ wip, dispatch, norms, label }) {
  const W=300, H=38;
  const max=Math.max(1, norms*1.3, dispatch*1.1, wip*1.1);
  const tx=v=>Math.min(W-2,Math.round((v/max)*W));
  const dc=dispatch>=norms?'#16a34a':dispatch>=norms*0.8?'#d97706':'#dc2626';
  return (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:12,fontWeight:700,color:C.gray,marginBottom:2}}>{label}</div>
      <svg width={W} height={H}>
        <rect x={0} y={4}  width={tx(wip)}      height={14} fill="#f97316" opacity={0.7} rx={3}/>
        <rect x={0} y={22} width={tx(dispatch)}  height={14} fill={dc} rx={3}/>
        <line x1={tx(norms)} y1={0} x2={tx(norms)} y2={H} stroke="#16a34a" strokeWidth={2.5} strokeDasharray="4,3"/>
        {tx(dispatch)>22 && <text x={tx(dispatch)-3} y={33} textAnchor="end" fontSize={10} fill="#fff" fontWeight="800">{Math.round(dispatch*100)}%</text>}
        <text x={tx(norms)+4} y={12} fontSize={10} fill="#15803d" fontWeight="800">{Math.round(norms*100)}%</text>
        {tx(wip)>26 && <text x={tx(wip)-3} y={15} textAnchor="end" fontSize={10} fill="#7c2d12" fontWeight="700">{Math.round(wip*100)}%</text>}
      </svg>
      <div style={{display:'flex',gap:12,fontSize:10,color:C.subtext,marginTop:2}}>
        <span style={{color:'#f97316',fontWeight:700}}>■ WIP%</span>
        <span style={{color:'#16a34a',fontWeight:700}}>■ Dispatch%</span>
        <span style={{color:'#16a34a',fontWeight:700}}>-- Norms%</span>
      </div>
    </div>
  );
}

// ─── MODAL WRAPPER ───────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children, maxWidth=520 }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'#fff',borderRadius:18,width:'100%',maxWidth,padding:24,maxHeight:'92vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18}}>
          <div>
            <div style={{fontWeight:900,fontSize:16,color:C.blue}}>{title}</div>
            {subtitle && <div style={{fontSize:12,color:C.subtext,marginTop:3}}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{background:'#f3f4f6',border:'none',borderRadius:8,fontSize:18,cursor:'pointer',color:C.subtext,width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const btnP = {padding:'11px 0',borderRadius:9,border:'none',background:C.blue,color:'#fff',fontWeight:800,fontSize:14,cursor:'pointer',flex:2};
const btnS = {padding:'11px 0',borderRadius:9,border:`1.5px solid ${C.border}`,background:'#f9fafb',fontWeight:700,fontSize:13,cursor:'pointer',flex:1,color:C.gray};
const btnD = {padding:'11px 0',borderRadius:9,border:'none',background:C.red,color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer',flex:1};

// ─── SCHEDULE MODAL ───────────────────────────────────────────────────────────
function ScheduleModal({ supplier, year, month, schedules, onSave, onClose, userProfile }) {
  const [rows, setRows] = useState(() =>
    supplier.parts.map(p => {
      const ex = (schedules[supplier.id]||{})[p.partNo]||{};
      return { ...p, scheduleQty: ex.scheduleQty||'', openingStock: ex.openingStock||'' };
    })
  );
  const [saving, setSaving] = useState(false);
  const upd = (idx,f,v) => setRows(r=>r.map((x,i)=>i===idx?{...x,[f]:v}:x));

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const r of rows)
        await saveSchedule(year, month, supplier.id, r.partNo, r.scheduleQty, r.openingStock);
      onSave(); onClose();
    } catch(e) { alert('Save failed: '+e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Set Monthly Schedule" subtitle={`${supplier.name} — ${new Date(year,month).toLocaleString('en-IN',{month:'long'})} ${year}`} onClose={onClose} maxWidth={560}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead>
            <tr style={{background:C.grayLt}}>
              <th style={{padding:'9px 10px',textAlign:'left',fontWeight:700,color:C.gray}}>Part No</th>
              <th style={{padding:'9px 10px',textAlign:'right',fontWeight:700,color:C.gray}}>Rate (₹)</th>
              <th style={{padding:'9px 10px',textAlign:'center',fontWeight:700,color:C.orange}}>Opening Stock</th>
              <th style={{padding:'9px 10px',textAlign:'center',fontWeight:700,color:C.blue}}>Schedule Qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,idx) => (
              <tr key={r.partNo} style={{borderBottom:`1px solid ${C.grayLt}`}}>
                <td style={{padding:'8px 10px',fontWeight:700,color:C.gray}}>{r.partNo}</td>
                <td style={{padding:'8px 10px',textAlign:'right',color:C.subtext}}>₹{Number(r.rate).toFixed(2)}</td>
                <td style={{padding:'6px 8px'}}>
                  <input type="number" min={0} value={r.openingStock||''} placeholder="0"
                    onChange={e=>upd(idx,'openingStock',e.target.value)}
                    style={{width:'100%',padding:'8px',borderRadius:7,border:`1.5px solid ${C.orangeLt}`,textAlign:'center',fontSize:14,fontWeight:700,color:C.orange,background:'#fff7ed',boxSizing:'border-box'}}/>
                </td>
                <td style={{padding:'6px 8px'}}>
                  <input type="number" min={0} value={r.scheduleQty||''} placeholder="0"
                    onChange={e=>upd(idx,'scheduleQty',e.target.value)}
                    style={{width:'100%',padding:'8px',borderRadius:7,border:`1.5px solid #bfdbfe`,textAlign:'center',fontSize:14,fontWeight:700,color:C.blue,background:'#eff6ff',boxSizing:'border-box'}}/>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{display:'flex',gap:10,marginTop:18}}>
        <button onClick={onClose} style={btnS}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={btnP}>{saving?'Saving…':'✓ Save Schedule'}</button>
      </div>
    </Modal>
  );
}

// ─── DAILY ENTRY MODAL (any date picker) ─────────────────────────────────────
function DailyEntryModal({ supplier, year, month, defaultDay, dailyData, onSave, onClose, userProfile, activeUnit }) {
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const [day, setDay] = useState(defaultDay);
  const getEntries = useCallback(d =>
    supplier.parts.map(p => {
      const ex = ((dailyData[supplier.id]||{})[p.partNo]||{})[d]||{};
      return { ...p, inward: ex.inward||0, outward: ex.outward||0 };
    }), [supplier, dailyData]);

  const [entries, setEntries] = useState(() => getEntries(defaultDay));
  const upd = (idx,f,v) => setEntries(r=>r.map((x,i)=>i===idx?{...x,[f]:v}:x));
  const [saving, setSaving] = useState(false);

  // When date changes, reload entries for that date
  const handleDayChange = (newDay) => {
    setDay(newDay);
    setEntries(getEntries(newDay));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const e of entries)
        await saveDailyEntry(year, month, day, supplier.id, e.partNo, e.inward, e.outward);
      const totalInward = entries.reduce((a,e)=>a+(Number(e.inward)||0),0);
      const totalOutward = entries.reduce((a,e)=>a+(Number(e.outward)||0),0);
      if (totalInward>0||totalOutward>0) {
        await createNotification(activeUnit||'u1', NOTIF_TYPES.SUPPLIER_INWARD, {
          title: `📦 Supplier Inward — ${supplier.name}`,
          message: `Day ${day}: In=${totalInward} kg | Out=${totalOutward} kg | ${entries.length} material(s)`,
          supplierId: supplier.id, supplierName: supplier.name, day, totalInward, totalOutward,
        });
      }
      onSave(); onClose();
    } catch(e) { alert('Save failed: '+e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={`Daily Entry — ${supplier.name}`} onClose={onClose} maxWidth={540}>
      {/* Date picker row */}
      <div style={{background:C.grayLt,borderRadius:10,padding:'10px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <span style={{fontWeight:700,fontSize:13,color:C.gray}}>Date:</span>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {Array.from({length:daysInMonth},(_,i)=>i+1).map(d=>{
            const isSun = new Date(year,month,d).getDay()===0;
            const hasData = supplier.parts.some(p=>{
              const e=((dailyData[supplier.id]||{})[p.partNo]||{})[d];
              return e&&(e.inward>0||e.outward>0);
            });
            return (
              <button key={d} onClick={()=>handleDayChange(d)}
                style={{width:32,height:32,borderRadius:7,border:'none',cursor:'pointer',fontWeight:700,fontSize:12,
                  background:d===day?C.blue:hasData?C.greenLt:isSun?C.amberLt:'#fff',
                  color:d===day?'#fff':hasData?C.green:isSun?C.amber:C.gray,
                  border:`1.5px solid ${d===day?C.blue:hasData?'#86efac':isSun?'#fde68a':C.border}`}}>
                {d}
              </button>
            );
          })}
        </div>
        <span style={{fontSize:11,color:C.subtext}}>
          {new Date(year,month,day).toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'})}
        </span>
      </div>

      <div style={{background:'#f0fdf4',borderRadius:8,padding:'8px 14px',marginBottom:14,fontSize:12,color:'#166534',fontWeight:600}}>
        <strong>OUTWARD</strong> = Sent FROM Alubee TO supplier &nbsp;|&nbsp; <strong>INWARD</strong> = Received BACK from supplier
      </div>

      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
        <thead>
          <tr style={{background:C.grayLt}}>
            <th style={{padding:'9px 10px',textAlign:'left',fontWeight:700}}>Part No</th>
            <th style={{padding:'9px 10px',textAlign:'center',color:C.orange,fontWeight:700}}>Outward (Sent)</th>
            <th style={{padding:'9px 10px',textAlign:'center',color:C.green,fontWeight:700}}>Inward (Received)</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e,idx)=>(
            <tr key={e.partNo} style={{borderBottom:`1px solid ${C.grayLt}`}}>
              <td style={{padding:'8px 10px',fontWeight:700,color:C.gray}}>{e.partNo}</td>
              <td style={{padding:'6px 8px'}}>
                <input type="number" min={0} value={e.outward||''} placeholder="0"
                  onChange={ev=>upd(idx,'outward',Number(ev.target.value))}
                  style={{width:'100%',padding:'8px',borderRadius:7,border:`1.5px solid #fed7aa`,textAlign:'center',fontSize:15,fontWeight:800,color:C.orange,background:'#fff7ed',boxSizing:'border-box'}}/>
              </td>
              <td style={{padding:'6px 8px'}}>
                <input type="number" min={0} value={e.inward||''} placeholder="0"
                  onChange={ev=>upd(idx,'inward',Number(ev.target.value))}
                  style={{width:'100%',padding:'8px',borderRadius:7,border:`1.5px solid #86efac`,textAlign:'center',fontSize:15,fontWeight:800,color:C.green,background:'#f0fdf4',boxSizing:'border-box'}}/>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{display:'flex',gap:10,marginTop:18}}>
        <button onClick={onClose} style={btnS}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={btnP}>{saving?'Saving…':'✓ Save Entry'}</button>
      </div>
    </Modal>
  );
}

// ─── RAG MODAL ────────────────────────────────────────────────────────────────
function RAGModal({ supplier, year, month, day, ragData, onSave, onClose, activeUnit }) {
  const existing = (ragData[supplier.id]||{})[day]||{};
  const [vals, setVals] = useState({
    power: existing.power||'', load: existing.load||'',
    manpower: existing.manpower||'', machine: existing.machine||''
  });
  const [saving, setSaving] = useState(false);
  const items = [
    {key:'power',   label:'⚡ Power Availability'},
    {key:'load',    label:'📦 Load Availability'},
    {key:'manpower',label:'👷 Manpower Availability'},
    {key:'machine', label:'⚙️ Machine Availability'},
  ];
  const handleSave = async () => {
    setSaving(true);
    try {
      await saveRAG(year, month, day, supplier.id, vals);
      const redItems = Object.entries(vals).filter(([,v])=>v==='red').map(([k])=>k);
      if (redItems.length>0) {
        await createNotification(activeUnit||'u1', NOTIF_TYPES.SUPPLIER_RAG, {
          title: `🚨 Supplier Risk — ${supplier.name}`,
          message: `RED flag on: ${redItems.join(', ')} — Day ${day}`,
          supplierId: supplier.id, supplierName: supplier.name, redItems, day,
        });
      }
      onSave(); onClose();
    } catch(e) { alert('Save failed: '+e.message); }
    finally { setSaving(false); }
  };
  return (
    <Modal title="Daily Status Update" subtitle={`${supplier.name} — ${new Date(year,month,day).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}`} onClose={onClose} maxWidth={400}>
      {items.map(it=>(
        <div key={it.key} style={{marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:13,color:C.gray,marginBottom:8}}>{it.label}</div>
          <div style={{display:'flex',gap:8}}>
            {RAG_OPTS.map(o=>{
              const active = vals[it.key]===o.val;
              return (
                <button key={o.val} onClick={()=>setVals(v=>({...v,[it.key]:o.val}))}
                  style={{flex:1,padding:'10px 0',borderRadius:9,border:`2px solid ${active?o.bg:C.border}`,
                    background:active?o.bg:'#f9fafb',color:active?o.text:C.subtext,
                    fontWeight:800,fontSize:13,cursor:'pointer',transition:'all 0.15s'}}>
                  {o.val === 'G' ? '🟢' : o.val === 'A' ? '🟡' : '🔴'} {o.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{display:'flex',gap:10,marginTop:6}}>
        <button onClick={onClose} style={btnS}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={btnP}>{saving?'Saving…':'✓ Save Status'}</button>
      </div>
    </Modal>
  );
}

// ─── MANAGE SUPPLIER MODAL ────────────────────────────────────────────────────
function ManageModal({ supplier, onSave, onDelete, onClose }) {
  const [name, setName] = useState(supplier.name);
  const [machines, setMachines] = useState(supplier.machines||0);
  const [manpower, setManpower] = useState(supplier.manpower||0);
  const [shifts, setShifts] = useState(supplier.shifts||1);
  const [parts, setParts] = useState(supplier.parts.map(p=>({...p})));
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const addPart = () => setParts(p=>[...p,{partNo:'',rate:0}]);
  const remPart = idx => setParts(p=>p.filter((_,i)=>i!==idx));
  const updPart = (idx,f,v) => setParts(p=>p.map((x,i)=>i===idx?{...x,[f]:v}:x));

  const handleSave = async () => {
    if (!name.trim()) { alert('Supplier name required'); return; }
    const vp = parts.filter(p=>p.partNo.trim());
    if (!vp.length) { alert('Add at least one part'); return; }
    setSaving(true);
    try {
      const updated = { ...supplier, name:name.trim().toUpperCase(),
        machines:Number(machines)||0, manpower:Number(manpower)||0, shifts:Number(shifts)||1,
        parts: vp.map(p=>({ partNo:p.partNo.trim().toUpperCase(), partName:p.partNo.trim().toUpperCase(), rate:Number(p.rate)||0 }))
      };
      await saveSupplierMaster(updated);
      onSave(updated); onClose();
    } catch(e) { alert('Save failed: '+e.message); }
    finally { setSaving(false); }
  };
  const handleDelete = async () => {
    setSaving(true);
    try { await deleteSupplierMaster(supplier.id); onDelete(supplier.id); onClose(); }
    catch(e) { alert('Delete failed: '+e.message); }
    finally { setSaving(false); }
  };

  const numInput = (label, val, set) => (
    <div style={{flex:1}}>
      <div style={{fontSize:11,fontWeight:700,color:C.subtext,marginBottom:4}}>{label}</div>
      <input type="number" min={0} value={val}
        onChange={e=>set(e.target.value)}
        style={{width:'100%',padding:'9px',borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:15,fontWeight:800,textAlign:'center',boxSizing:'border-box'}}/>
    </div>
  );

  return (
    <Modal title="Edit Supplier" subtitle={supplier.name} onClose={onClose} maxWidth={560}>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:C.subtext,marginBottom:4}}>SUPPLIER NAME</div>
        <input value={name} onChange={e=>setName(e.target.value)}
          style={{width:'100%',padding:'10px 12px',borderRadius:9,border:`1.5px solid #bfdbfe`,fontSize:15,fontWeight:800,boxSizing:'border-box'}}/>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:16}}>
        {numInput('MACHINES', machines, setMachines)}
        {numInput('MANPOWER', manpower, setManpower)}
        {numInput('SHIFTS', shifts, setShifts)}
      </div>

      <div style={{fontWeight:700,fontSize:12,color:C.gray,marginBottom:8}}>PARTS & RATES</div>
      <div style={{background:'#f8fafc',borderRadius:10,padding:10,marginBottom:16}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 100px 36px',gap:6,marginBottom:6}}>
          <div style={{fontSize:11,fontWeight:700,color:C.subtext,paddingLeft:8}}>PART NO</div>
          <div style={{fontSize:11,fontWeight:700,color:C.subtext,textAlign:'center'}}>RATE (₹)</div>
          <div/>
        </div>
        {parts.map((p,idx)=>(
          <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 100px 36px',gap:6,marginBottom:6,alignItems:'center'}}>
            <input value={p.partNo} onChange={e=>updPart(idx,'partNo',e.target.value)} placeholder="e.g. PH 691"
              style={{padding:'8px 10px',borderRadius:7,border:`1px solid ${C.border}`,fontSize:13,fontWeight:700,width:'100%',boxSizing:'border-box'}}/>
            <input type="number" min={0} step={0.01} value={p.rate||''} onChange={e=>updPart(idx,'rate',e.target.value)} placeholder="0.00"
              style={{padding:'8px',borderRadius:7,border:`1px solid ${C.border}`,fontSize:13,fontWeight:700,textAlign:'center',width:'100%',boxSizing:'border-box'}}/>
            <button onClick={()=>remPart(idx)}
              style={{background:C.redLt,border:'none',borderRadius:7,color:C.red,fontWeight:800,fontSize:16,cursor:'pointer',width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
          </div>
        ))}
        <button onClick={addPart}
          style={{width:'100%',padding:'9px 0',borderRadius:8,border:`1.5px dashed #93c5fd`,background:'#eff6ff',color:C.blue,fontWeight:700,fontSize:13,cursor:'pointer',marginTop:4}}>
          + Add Part
        </button>
      </div>

      {!confirmDel ? (
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>setConfirmDel(true)} style={btnD}>🗑 Remove</button>
          <button onClick={onClose} style={btnS}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnP}>{saving?'Saving…':'✓ Save'}</button>
        </div>
      ) : (
        <div style={{background:C.redLt,borderRadius:10,padding:14}}>
          <div style={{fontWeight:800,fontSize:13,color:'#991b1b',marginBottom:10}}>⚠ Remove {supplier.name}? Cannot be undone.</div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>setConfirmDel(false)} style={btnS}>Cancel</button>
            <button onClick={handleDelete} disabled={saving} style={{...btnP,background:C.red}}>{saving?'Deleting…':'Yes, Remove'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── ADD SUPPLIER MODAL ───────────────────────────────────────────────────────
function AddModal({ existingCount, onSave, onClose }) {
  const [name, setName] = useState('');
  const [machines, setMachines] = useState(0);
  const [manpower, setManpower] = useState(0);
  const [shifts, setShifts] = useState(1);
  const [parts, setParts] = useState([{partNo:'',rate:0}]);
  const [saving, setSaving] = useState(false);

  const addPart = () => setParts(p=>[...p,{partNo:'',rate:0}]);
  const remPart = idx => setParts(p=>p.filter((_,i)=>i!==idx));
  const updPart = (idx,f,v) => setParts(p=>p.map((x,i)=>i===idx?{...x,[f]:v}:x));

  const handleSave = async () => {
    if (!name.trim()) { alert('Name required'); return; }
    const vp = parts.filter(p=>p.partNo.trim());
    if (!vp.length) { alert('Add at least one part'); return; }
    setSaving(true);
    try {
      const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g,'_').slice(0,20)+'_'+Date.now();
      const s = { id, name:name.trim().toUpperCase(), order:existingCount+1,
        machines:Number(machines)||0, manpower:Number(manpower)||0, shifts:Number(shifts)||1,
        parts: vp.map(p=>({ partNo:p.partNo.trim().toUpperCase(), partName:p.partNo.trim().toUpperCase(), rate:Number(p.rate)||0 }))
      };
      await saveSupplierMaster(s);
      onSave(s); onClose();
    } catch(e) { alert('Save failed: '+e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Add New Supplier" onClose={onClose} maxWidth={500}>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:C.subtext,marginBottom:4}}>SUPPLIER NAME</div>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. MANI INDUSTRIES"
          style={{width:'100%',padding:'10px 12px',borderRadius:9,border:`1.5px solid #bfdbfe`,fontSize:15,fontWeight:800,boxSizing:'border-box'}}/>
      </div>
      <div style={{display:'flex',gap:10,marginBottom:16}}>
        {[['MACHINES',machines,setMachines],['MANPOWER',manpower,setManpower],['SHIFTS',shifts,setShifts]].map(([lbl,val,set])=>(
          <div key={lbl} style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:700,color:C.subtext,marginBottom:4}}>{lbl}</div>
            <input type="number" min={0} value={val} onChange={e=>set(e.target.value)}
              style={{width:'100%',padding:'9px',borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:15,fontWeight:800,textAlign:'center',boxSizing:'border-box'}}/>
          </div>
        ))}
      </div>
      <div style={{fontWeight:700,fontSize:12,color:C.gray,marginBottom:8}}>PARTS & RATES</div>
      <div style={{background:'#f8fafc',borderRadius:10,padding:10,marginBottom:14}}>
        {parts.map((p,idx)=>(
          <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 100px 36px',gap:6,marginBottom:6,alignItems:'center'}}>
            <input value={p.partNo} onChange={e=>updPart(idx,'partNo',e.target.value)} placeholder="Part No"
              style={{padding:'8px 10px',borderRadius:7,border:`1px solid ${C.border}`,fontSize:13,fontWeight:700,width:'100%',boxSizing:'border-box'}}/>
            <input type="number" min={0} step={0.01} value={p.rate||''} onChange={e=>updPart(idx,'rate',e.target.value)} placeholder="Rate ₹"
              style={{padding:'8px',borderRadius:7,border:`1px solid ${C.border}`,fontSize:13,fontWeight:700,textAlign:'center',width:'100%',boxSizing:'border-box'}}/>
            <button onClick={()=>remPart(idx)}
              style={{background:C.redLt,border:'none',borderRadius:7,color:C.red,fontWeight:800,fontSize:16,cursor:'pointer',width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
          </div>
        ))}
        <button onClick={addPart} style={{width:'100%',padding:'9px 0',borderRadius:8,border:`1.5px dashed #93c5fd`,background:'#eff6ff',color:C.blue,fontWeight:700,fontSize:13,cursor:'pointer',marginTop:4}}>+ Add Part</button>
      </div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={onClose} style={btnS}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={btnP}>{saving?'Saving…':'✓ Add Supplier'}</button>
      </div>
    </Modal>
  );
}

// ─── SUPPLIER CARD ────────────────────────────────────────────────────────────
function SupplierCard({ supplier, schedules, dailyData, normsPercent, ragData, isPPC, onEdit, onEntry, onRAG }) {
  let totInw=0, totOutw=0, totSched=0, totVal=0, totDispVal=0, totOpening=0;

  const rows = supplier.parts.map(p => {
    const ex = (schedules[supplier.id]||{})[p.partNo]||{};
    const sched = ex.scheduleQty||0;
    const opening = ex.openingStock||0;
    const {inw,outw} = aggPart(dailyData, supplier.id, p.partNo);
    const wip = Math.max(0, opening + outw - inw);
    const dispPct = sched>0 ? inw/sched : 0;
    const wipPct  = sched>0 ? wip/sched : 0;
    totInw+=inw; totOutw+=outw; totSched+=sched; totOpening+=opening;
    totVal+=sched*p.rate; totDispVal+=inw*p.rate;
    return { ...p, sched, opening, inw, outw, wip, dispPct, wipPct };
  });

  const overallPct = totSched>0 ? totInw/totSched : 0;
  const valL = totVal/100000;

  // Today's RAG
  const todayRag = (ragData[supplier.id]||{})[new Date().getDate()]||{};

  return (
    <div style={{background:'#fff',borderRadius:16,padding:'18px 20px',marginBottom:18,boxShadow:'0 2px 14px rgba(0,0,0,0.09)',border:`1px solid ${C.border}`}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div>
          <div style={{fontWeight:900,fontSize:16,color:C.blue}}>{supplier.name}</div>
          <div style={{display:'flex',gap:10,marginTop:4,flexWrap:'wrap',fontSize:11,color:C.subtext,fontWeight:600}}>
            {supplier.machines>0 && <span>⚙️ {supplier.machines} machines</span>}
            {supplier.manpower>0 && <span>👷 {supplier.manpower} workers</span>}
            {supplier.shifts>0 && <span>🔄 {supplier.shifts} shift{supplier.shifts>1?'s':''}</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <Badge pct={overallPct} norms={normsPercent}/>
          <span style={{background:C.grayLt,borderRadius:8,padding:'4px 12px',fontSize:13,fontWeight:800,color:C.gray}}>
            ₹{valL.toFixed(2)}L
          </span>
          {isPPC && (
            <>
              <button onClick={onRAG}
                style={{padding:'5px 12px',borderRadius:8,border:`1.5px solid #d97706`,background:'#fffbeb',color:'#b45309',fontWeight:800,fontSize:12,cursor:'pointer'}}>
                🚦 Status
              </button>
              <button onClick={onEdit}
                style={{padding:'5px 12px',borderRadius:8,border:`1.5px solid ${C.blue}`,background:'#eff6ff',color:C.blue,fontWeight:800,fontSize:12,cursor:'pointer'}}>
                ✎ Edit
              </button>
            </>
          )}
        </div>
      </div>

      {/* RAG row */}
      {(todayRag.power||todayRag.load||todayRag.manpower||todayRag.machine) && (
        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
          {[['power','⚡ Power'],['load','📦 Load'],['manpower','👷 Manpower'],['machine','⚙️ Machine']].map(([k,lbl])=>{
            const {bg,text} = ragColor(todayRag[k]);
            return (
              <span key={k} style={{background:bg,color:text,borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:800}}>
                {lbl}: {todayRag[k]==='G'?'✓':todayRag[k]==='A'?'!':'✗'}
              </span>
            );
          })}
        </div>
      )}

      {/* Summary cards */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <Card label="SCHEDULE"       value={totSched.toLocaleString('en-IN')}   color={C.blue}   bg='#eff6ff'/>
        <Card label="OPENING STOCK"  value={totOpening.toLocaleString('en-IN')} color={C.orange} bg='#fff7ed'/>
        <Card label="TILL DATE OUT"  value={totOutw.toLocaleString('en-IN')}    color='#f97316'  bg='#fff7ed'/>
        <Card label="TILL DATE IN"   value={totInw.toLocaleString('en-IN')}     color={C.green}  bg='#f0fdf4'/>
        <Card label="WIP AT SUPPLIER" value={Math.max(0,totOpening+totOutw-totInw).toLocaleString('en-IN')} color='#7c3aed' bg='#f5f3ff'/>
        <Card label="BUSINESS VALUE" value={`₹${valL.toFixed(2)}L`}            color='#0f766e'  bg='#f0fdfa'/>
      </div>

      {/* Part table + bars */}
      <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'10px 18px',alignItems:'start',overflowX:'auto'}}>
        <table style={{fontSize:11,borderCollapse:'collapse',whiteSpace:'nowrap'}}>
          <thead>
            <tr style={{background:C.grayLt}}>
              <th style={{padding:'5px 8px',textAlign:'left',fontWeight:800,color:C.gray}}>Part</th>
              <th style={{padding:'5px 8px',textAlign:'right',fontWeight:800,color:C.gray}}>Rate</th>
              <th style={{padding:'5px 8px',textAlign:'right',fontWeight:800,color:C.orange}}>Opening</th>
              <th style={{padding:'5px 8px',textAlign:'right',fontWeight:800,color:C.blue}}>Sched</th>
              <th style={{padding:'5px 8px',textAlign:'right',fontWeight:800,color:'#f97316'}}>Out</th>
              <th style={{padding:'5px 8px',textAlign:'right',fontWeight:800,color:C.green}}>In</th>
              <th style={{padding:'5px 8px',textAlign:'right',fontWeight:800,color:'#7c3aed'}}>WIP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p=>(
              <tr key={p.partNo} style={{borderBottom:`1px solid ${C.grayLt}`}}>
                <td style={{padding:'5px 8px',fontWeight:800,color:C.gray}}>{p.partNo}</td>
                <td style={{padding:'5px 8px',textAlign:'right',color:C.subtext}}>₹{Number(p.rate).toFixed(2)}</td>
                <td style={{padding:'5px 8px',textAlign:'right',color:C.orange,fontWeight:700}}>{p.opening.toLocaleString('en-IN')}</td>
                <td style={{padding:'5px 8px',textAlign:'right',color:C.blue,fontWeight:700}}>{p.sched.toLocaleString('en-IN')}</td>
                <td style={{padding:'5px 8px',textAlign:'right',color:'#f97316',fontWeight:700}}>{p.outw.toLocaleString('en-IN')}</td>
                <td style={{padding:'5px 8px',textAlign:'right',color:C.green,fontWeight:800}}>{p.inw.toLocaleString('en-IN')}</td>
                <td style={{padding:'5px 8px',textAlign:'right',color:'#7c3aed',fontWeight:700}}>{p.wip.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          {rows.map(p=>(
            <HBar key={p.partNo} label={p.partNo} wip={p.wipPct} dispatch={p.dispPct} norms={normsPercent}/>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── OVERALL SUMMARY ──────────────────────────────────────────────────────────
function OverallSummary({ suppliers, schedules, dailyData, normsPercent, year, month }) {
  let totSched=0, totInw=0, totVal=0, totDispVal=0;
  const supplierBreakdown = suppliers.map(s => {
    let sInw=0, sSched=0, sVal=0, sDispVal=0;
    s.parts.forEach(p => {
      const ex=(schedules[s.id]||{})[p.partNo]||{};
      const sched=ex.scheduleQty||0;
      const {inw}=aggPart(dailyData,s.id,p.partNo);
      sInw+=inw; sSched+=sched; sVal+=sched*p.rate; sDispVal+=inw*p.rate;
    });
    totSched+=sSched; totInw+=sInw; totVal+=sVal; totDispVal+=sDispVal;
    return { name:s.name, id:s.id, parts:s.parts.length, sched:sSched, inw:sInw, val:sVal, dispVal:sDispVal };
  });

  const dispPct  = totSched>0 ? totInw/totSched : 0;
  const backlog  = Math.max(0, normsPercent-dispPct);
  const balance  = totSched-totInw;
  const totValL  = totVal/100000;
  const totDispL = totDispVal/100000;

  const qtyBars = [{label:'SCHEDULE',val:totSched,color:'#60a5fa'},{label:'DISPATCHED',val:totInw,color:'#34d399'},{label:'BALANCE',val:balance,color:'#fb923c'}];
  const pctBars = [{label:'DISPATCH %',val:dispPct,color:dispPct>=normsPercent?'#16a34a':'#dc2626'},{label:'NORMS %',val:normsPercent,color:'#16a34a'},{label:'BACKLOG %',val:backlog,color:'#dc2626'}];
  const maxQty  = Math.max(...qtyBars.map(b=>b.val),1);

  // Business % pie data
  const pieData = supplierBreakdown.filter(s=>s.val>0).map(s=>({
    name:s.name, val:s.val, pct:totVal>0?s.val/totVal:0
  }));
  const PIE_COLORS=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];

  return (
    <div style={{background:'#fff',borderRadius:16,padding:'20px 22px',marginBottom:20,boxShadow:'0 2px 14px rgba(0,0,0,0.09)',border:`1px solid ${C.border}`}}>
      <div style={{textAlign:'center',marginBottom:18}}>
        <span style={{background:C.blueLt,color:C.blue,fontWeight:900,fontSize:15,padding:'7px 22px',borderRadius:10,fontStyle:'italic'}}>
          SUPPLIER PERFORMANCE — {new Date(year,month).toLocaleString('en-IN',{month:'long'}).toUpperCase()} {year}
        </span>
      </div>

      {/* 3-panel charts */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16,marginBottom:20}}>
        {/* QTY WISE */}
        <div style={{background:'#f8fafc',borderRadius:12,padding:14}}>
          <div style={{fontWeight:800,textAlign:'center',marginBottom:12,fontSize:13,color:C.gray}}>QTY WISE</div>
          <div style={{display:'flex',gap:8,alignItems:'flex-end',height:110,marginBottom:10}}>
            {qtyBars.map(b=>(
              <div key={b.label} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',height:'100%',justifyContent:'flex-end'}}>
                <div style={{fontSize:9,fontWeight:900,color:C.gray,marginBottom:3,textAlign:'center'}}>{b.val.toLocaleString('en-IN')}</div>
                <div style={{width:'100%',background:b.color,borderRadius:'5px 5px 0 0',height:`${Math.round((b.val/maxQty)*100)}%`,minHeight:3}}/>
              </div>
            ))}
          </div>
          {qtyBars.map(b=><div key={b.label} style={{fontSize:9,textAlign:'center',color:C.subtext,fontWeight:700,marginBottom:2}}>{b.label}</div>)}
        </div>

        {/* QTY WISE % */}
        <div style={{background:'#f8fafc',borderRadius:12,padding:14}}>
          <div style={{fontWeight:800,textAlign:'center',marginBottom:12,fontSize:13,color:C.gray}}>QTY WISE %</div>
          <div style={{display:'flex',gap:8,alignItems:'flex-end',height:110,marginBottom:10}}>
            {pctBars.map(b=>(
              <div key={b.label} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',height:'100%',justifyContent:'flex-end'}}>
                <div style={{fontSize:10,fontWeight:900,color:'#fff',marginBottom:3,background:b.color,borderRadius:5,padding:'2px 5px'}}>{Math.round(b.val*100)}%</div>
                <div style={{width:'100%',background:b.color,borderRadius:'5px 5px 0 0',height:`${Math.round(b.val*100)}%`,minHeight:3}}/>
              </div>
            ))}
          </div>
          {pctBars.map(b=><div key={b.label} style={{fontSize:9,textAlign:'center',color:C.subtext,fontWeight:700,marginBottom:2}}>{b.label}</div>)}
        </div>

        {/* VALUE WISE */}
        <div style={{background:'#f8fafc',borderRadius:12,padding:14}}>
          <div style={{fontWeight:800,textAlign:'center',marginBottom:12,fontSize:13,color:C.gray}}>VALUE WISE</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <div style={{background:'#eff6ff',borderRadius:9,padding:'10px 12px',border:`1.5px solid #bfdbfe`}}>
              <div style={{fontSize:10,color:C.subtext,fontWeight:700}}>ORDER VALUE</div>
              <div style={{fontSize:20,fontWeight:900,color:C.blue}}>₹{totValL.toFixed(2)}L</div>
            </div>
            <div style={{background:'#f0fdf4',borderRadius:9,padding:'10px 12px',border:`1.5px solid #86efac`}}>
              <div style={{fontSize:10,color:C.subtext,fontWeight:700}}>DISPATCHED VALUE</div>
              <div style={{fontSize:20,fontWeight:900,color:C.green}}>₹{totDispL.toFixed(2)}L</div>
            </div>
            <div style={{background:'#fff7ed',borderRadius:9,padding:'10px 12px',border:`1.5px solid #fed7aa`}}>
              <div style={{fontSize:10,color:C.subtext,fontWeight:700}}>BALANCE VALUE</div>
              <div style={{fontSize:20,fontWeight:900,color:C.orange}}>₹{(totValL-totDispL).toFixed(2)}L</div>
            </div>
          </div>
        </div>
      </div>

      {/* Supplier business breakdown table */}
      <div style={{marginBottom:16}}>
        <div style={{fontWeight:800,fontSize:13,color:C.gray,marginBottom:10}}>BUSINESS BREAKDOWN BY SUPPLIER</div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:C.grayLt}}>
                <th style={{padding:'8px 10px',textAlign:'left',fontWeight:800,color:C.gray}}>Supplier</th>
                <th style={{padding:'8px 10px',textAlign:'center',fontWeight:800,color:C.subtext}}>Parts</th>
                <th style={{padding:'8px 10px',textAlign:'right',fontWeight:800,color:C.blue}}>Schedule</th>
                <th style={{padding:'8px 10px',textAlign:'right',fontWeight:800,color:C.green}}>Dispatched</th>
                <th style={{padding:'8px 10px',textAlign:'right',fontWeight:800,color:'#0f766e'}}>Order Value</th>
                <th style={{padding:'8px 10px',textAlign:'right',fontWeight:800,color:C.gray}}>Business %</th>
                <th style={{padding:'8px 10px',textAlign:'left',fontWeight:800,color:C.gray}}>Share</th>
              </tr>
            </thead>
            <tbody>
              {supplierBreakdown.map((s,i)=>{
                const bizPct = totVal>0?s.val/totVal:0;
                const dispPctS = s.sched>0?s.inw/s.sched:0;
                return (
                  <tr key={s.id} style={{borderBottom:`1px solid ${C.grayLt}`,background:i%2?'#fafafa':'#fff'}}>
                    <td style={{padding:'8px 10px',fontWeight:800,color:C.blue}}>{s.name}</td>
                    <td style={{padding:'8px 10px',textAlign:'center',color:C.subtext,fontWeight:600}}>{s.parts}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',color:C.blue,fontWeight:700}}>{s.sched.toLocaleString('en-IN')}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',color:C.green,fontWeight:700}}>{s.inw.toLocaleString('en-IN')}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',color:'#0f766e',fontWeight:800}}>₹{(s.val/100000).toFixed(2)}L</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontWeight:800,color:bizPct>0.2?C.green:C.subtext}}>{Math.round(bizPct*100)}%</td>
                    <td style={{padding:'8px 10px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{flex:1,background:C.grayLt,borderRadius:4,height:8,overflow:'hidden'}}>
                          <div style={{width:`${Math.round(bizPct*100)}%`,background:PIE_COLORS[i%PIE_COLORS.length],height:'100%',borderRadius:4}}/>
                        </div>
                        <span style={{fontSize:10,fontWeight:700,color:C.subtext,minWidth:28}}>{Math.round(dispPctS*100)}%↑</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Variety wise — parts count per supplier */}
      <div>
        <div style={{fontWeight:800,fontSize:13,color:C.gray,marginBottom:10}}>VARIETY WISE (PART COUNT PER SUPPLIER)</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {supplierBreakdown.map((s,i)=>(
            <div key={s.id} style={{background:'#f8fafc',borderRadius:10,padding:'10px 16px',border:`2px solid ${PIE_COLORS[i%PIE_COLORS.length]}`,minWidth:120,flex:1}}>
              <div style={{fontSize:10,fontWeight:700,color:C.subtext,marginBottom:4}}>{s.name}</div>
              <div style={{fontSize:26,fontWeight:900,color:PIE_COLORS[i%PIE_COLORS.length]}}>{s.parts}</div>
              <div style={{fontSize:10,color:C.subtext}}>part{s.parts!==1?'s':''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function SupplierDashboard({ userRole, userDept, onBack, userProfile, unit }) {
  const activeUnit = unit||'u1';
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [today, setToday] = useState(now.getDate());

  const [suppliers, setSuppliers] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [dailyData, setDailyData] = useState({});
  const [ragData,   setRagData]   = useState({});
  const [loading,   setLoading]   = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [lastUpdInfo, setLastUpdInfo] = useState({at:null,by:null});
  const [view,      setView]      = useState('overview');

  const [entryModal,  setEntryModal]  = useState(null);
  const [schedModal,  setSchedModal]  = useState(null);
  const [manageModal, setManageModal] = useState(null);
  const [ragModal,    setRagModal]    = useState(null);
  const [addModal,    setAddModal]    = useState(false);

  const isPPC = userRole==='owner' || userDept==='ppc' || ['owner@alubee.com','md@alubee.com','gopi@alubee.com','udhay@alubee.com'].includes(userProfile?.email);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const lastDayOfMonth = new Date(year, month+1, 0).getDate();
  // Norms based on COMPLETED days only (today is in progress, subtract 1)
  const effectiveDayForNorms = isCurrentMonth ? Math.max(0, today - 1) : lastDayOfMonth;
  const autoWD  = getWorkingDaysInMonth(year, month);

  const [wdOverride, setWdOverride] = useState(null);
  const [wdSaving,   setWdSaving]   = useState(false);

  // Load saved working days for this month from Firestore
  useEffect(()=>{
    const key = `${year}-${String(month+1).padStart(2,'0')}`;
    import('firebase/firestore').then(({doc,getDoc})=>{
      import('../firebase').then(({db})=>{
        getDoc(doc(db,'working_days_config','supplier')).then(snap=>{
          setWdOverride(snap.exists()&&snap.data()[key]!==undefined ? snap.data()[key] : null);
        }).catch(()=>setWdOverride(null));
      });
    });
  },[year,month]);

  async function saveWdOverride(val) {
    const key = `${year}-${String(month+1).padStart(2,'0')}`;
    setWdSaving(true);
    try {
      const {doc,setDoc} = await import('firebase/firestore');
      const {db} = await import('../firebase');
      await setDoc(doc(db,'working_days_config','supplier'),{[key]:val},{merge:true});
      setWdOverride(val);
    } catch(e){ alert('Save failed: '+e.message); }
    finally { setWdSaving(false); }
  }

  async function resetWdOverride() {
    const key = `${year}-${String(month+1).padStart(2,'0')}`;
    setWdSaving(true);
    try {
      const {doc,updateDoc,deleteField} = await import('firebase/firestore');
      const {db} = await import('../firebase');
      await updateDoc(doc(db,'working_days_config','supplier'),{[key]:deleteField()});
      setWdOverride(null);
    } catch(e){ setWdOverride(null); }
    finally { setWdSaving(false); }
  }

  const effectiveWD = isCurrentMonth && wdOverride !== null ? wdOverride : autoWD;
  const totalWD  = effectiveWD;
  const normsPercent = getNorms(year, month, effectiveDayForNorms, effectiveWD);
  const monthLabel = new Date(year,month).toLocaleString('en-IN',{month:'long',year:'numeric'});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sups, sched, daily, rag] = await Promise.all([
        loadSupplierMaster(activeUnit),
        getSchedules(year, month, activeUnit).catch(()=>({})),
        getDailyEntries(year, month, activeUnit).catch(()=>({})),
        getRAGAll(year, month).catch(()=>({})),
      ]);
      setSuppliers(sups&&sups.length>0?sups:(activeUnit==='u2'?[]:DEFAULT_SUPPLIERS));
      setSchedules(sched||{});
      setDailyData(daily||{});
      setRagData(rag||{});
    } catch(e) {
      console.error(e);
      setSuppliers([...DEFAULT_SUPPLIERS]);
    }
    finally {
      setLastSyncTime(new Date());
      // Find most recent update across all supplier daily docs
      try {
        const lu = daily?._lastUpd;
        if (lu) {
          const dt = lu.at instanceof Date ? lu.at : lu.at?.toDate ? lu.at.toDate() : lu.at?.seconds ? new Date(lu.at.seconds*1000) : new Date(lu.at);
          setLastUpdInfo({at:dt,by:lu.by||'—'});
        } else { setLastUpdInfo({at:null,by:null}); }
      } catch(e){}
      setLoading(false);
    }
  }, [year, month]);

  useEffect(()=>{ load(); },[load]);

  const activeSupplier = view!=='overview' ? suppliers.find(s=>s.id===view) : null;

  return (
    <div style={{minHeight:'100vh',background:'#f1f5f9',fontFamily:'Inter,system-ui,sans-serif'}}>

      {/* HEADER */}
      <div style={{background:`linear-gradient(135deg,${C.blue},#1d4ed8)`,color:'#fff',padding:'14px 18px',boxShadow:'0 2px 10px rgba(30,64,175,0.4)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            {onBack && (
              <button onClick={onBack} style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:9,color:'#fff',fontSize:18,cursor:'pointer',padding:'5px 12px'}}>←</button>
            )}
            <div>
              <div style={{fontWeight:900,fontSize:17}}>📦 Supplier Monitoring{activeUnit==='u2'&&<span style={{background:'#7c3aed',color:'#fff',borderRadius:6,padding:'2px 8px',fontSize:11,marginLeft:8,fontWeight:800}}>Unit 2</span>}</div>
              <div style={{fontSize:12,opacity:0.85,marginTop:2}}>
                {monthLabel} &nbsp;·&nbsp; {effectiveWD} working days{isCurrentMonth&&wdOverride!==null?' ✓':''}
                {isCurrentMonth&&<>
                  &nbsp;·&nbsp;
                  <span style={{color:'#fbbf24',fontWeight:700}}>Day {getWorkingDaysElapsed(year,month,today)} of {effectiveWD}</span>
                  &nbsp;·&nbsp;
                  <span style={{color:'rgba(255,255,255,0.7)'}}>{Math.max(0,effectiveWD-getWorkingDaysElapsed(year,month,today))} days left</span>
                </>}
                &nbsp;·&nbsp; Norms: <strong>{Math.round(normsPercent*100)}%</strong>
              </div>
              <LastUpdatedBadge at={lastUpdInfo.at} by={lastUpdInfo.by}/>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <select value={`${year}-${month}`} onChange={e=>{
  const[y,m]=e.target.value.split('-').map(Number);
  setYear(y);setMonth(m);
  const isCurr = y===now.getFullYear()&&m===now.getMonth();
  setToday(isCurr ? now.getDate() : new Date(y,m+1,0).getDate());
}}
              style={{padding:'7px 10px',borderRadius:8,border:'none',fontSize:13,fontWeight:700}}>
              {Array.from({length:12},(_,i)=>{
                const d=new Date(now.getFullYear(),i);
                return <option key={i} value={`${now.getFullYear()}-${i}`}>{d.toLocaleString('en-IN',{month:'short'})} {now.getFullYear()}</option>;
              })}
            </select>
            {isCurrentMonth ? (<>
              <div style={{display:'flex',alignItems:'center',gap:4,background:'rgba(255,255,255,0.15)',borderRadius:8,padding:'4px 8px'}}>
                <span style={{fontSize:11,opacity:0.8}}>Day:</span>
                <input type="number" min={1} max={31} value={today} onChange={e=>setToday(Number(e.target.value))}
                  style={{width:36,padding:'4px',borderRadius:6,border:'none',textAlign:'center',fontWeight:800,fontSize:13,background:'transparent',color:'#fff'}}/>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:5,background:'rgba(255,255,255,0.15)',borderRadius:8,padding:'4px 10px'}}>
                <span style={{fontSize:11,opacity:0.8,whiteSpace:'nowrap'}}>WD:</span>
                <input type="number" min={1} max={31}
                  value={wdOverride!==null?wdOverride:autoWD}
                  onChange={e=>setWdOverride(Number(e.target.value))}
                  style={{width:32,border:'none',background:'transparent',color:'#fff',fontWeight:800,fontSize:13,textAlign:'center',outline:'none',fontFamily:'inherit'}}/>
                <button onClick={()=>saveWdOverride(wdOverride!==null?wdOverride:autoWD)} disabled={wdSaving}
                  style={{background:'rgba(255,255,255,0.25)',border:'none',borderRadius:5,color:'#fff',fontSize:10,fontWeight:800,cursor:'pointer',padding:'2px 7px',fontFamily:'inherit'}}>
                  {wdSaving?'…':'Save'}
                </button>
                {wdOverride!==null&&<button onClick={resetWdOverride} disabled={wdSaving}
                  style={{background:'transparent',border:'none',color:'rgba(255,255,255,0.6)',cursor:'pointer',fontSize:11,padding:'0 2px'}}>↺</button>}
              </div>
            </>) : (
              <div style={{background:'rgba(255,255,255,0.15)',borderRadius:8,padding:'4px 10px',fontSize:11,color:'#fff',opacity:0.85}}>
                Final · {lastDayOfMonth} days{wdOverride!==null?` (${wdOverride} WD saved)`:''}
              </div>
            )}
          </div>
        </div>

        {/* NAV */}
        <div style={{display:'flex',gap:6,marginTop:12,overflowX:'auto',paddingBottom:3,alignItems:'center'}}>
          <button onClick={()=>setView('overview')}
            style={{padding:'7px 16px',borderRadius:20,border:'none',cursor:'pointer',fontWeight:700,fontSize:12,whiteSpace:'nowrap',
              background:view==='overview'?'#fff':'rgba(255,255,255,0.18)',color:view==='overview'?C.blue:'#fff'}}>
            📊 Overall
          </button>
          {suppliers.map(s=>(
            <button key={s.id} onClick={()=>setView(s.id)}
              style={{padding:'7px 16px',borderRadius:20,border:'none',cursor:'pointer',fontWeight:700,fontSize:12,whiteSpace:'nowrap',
                background:view===s.id?'#fff':'rgba(255,255,255,0.18)',color:view===s.id?C.blue:'#fff'}}>
              {s.name.length>13?s.name.slice(0,13)+'…':s.name}
            </button>
          ))}
          {isPPC && (
            <button onClick={()=>setAddModal(true)}
              style={{padding:'7px 14px',borderRadius:20,border:'1.5px dashed rgba(255,255,255,0.6)',background:'transparent',color:'#fff',fontWeight:800,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
              + Supplier
            </button>
          )}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{padding:'16px 14px',maxWidth:960,margin:'0 auto'}}>
        {loading ? (
          <div style={{textAlign:'center',padding:80,color:C.subtext,fontSize:15}}>Loading…</div>
        ) : view==='overview' ? (
          <>
            <OverallSummary suppliers={suppliers} schedules={schedules} dailyData={dailyData} normsPercent={normsPercent} year={year} month={month}/>
            <div style={{fontWeight:800,fontSize:14,color:C.gray,marginBottom:12}}>All Suppliers</div>
            {suppliers.map(s=>(
              <SupplierCard key={s.id} supplier={s} schedules={schedules} dailyData={dailyData}
                normsPercent={normsPercent} ragData={ragData} isPPC={isPPC}
                onEdit={()=>setManageModal(s)}
                onEntry={()=>setEntryModal(s)}
                onRAG={()=>setRagModal(s)}/>
            ))}
          </>
        ) : activeSupplier ? (
          <>
            {isPPC && (
              <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
                <button onClick={()=>setSchedModal(activeSupplier)}
                  style={{padding:'9px 18px',borderRadius:9,border:`1.5px solid ${C.blue}`,background:'#fff',color:C.blue,fontWeight:800,fontSize:12,cursor:'pointer'}}>
                  📋 Set Schedule
                </button>
                <button onClick={()=>setEntryModal(activeSupplier)}
                  style={{padding:'9px 18px',borderRadius:9,border:'none',background:C.green,color:'#fff',fontWeight:800,fontSize:12,cursor:'pointer'}}>
                  + Daily Entry
                </button>
                <button onClick={()=>setRagModal(activeSupplier)}
                  style={{padding:'9px 18px',borderRadius:9,border:`1.5px solid #d97706`,background:'#fffbeb',color:'#b45309',fontWeight:800,fontSize:12,cursor:'pointer'}}>
                  🚦 Daily Status
                </button>
                <button onClick={()=>setManageModal(activeSupplier)}
                  style={{padding:'9px 18px',borderRadius:9,border:`1.5px solid ${C.border}`,background:'#fff',color:C.gray,fontWeight:800,fontSize:12,cursor:'pointer'}}>
                  ✎ Edit Parts & Rates
                </button>
              </div>
            )}
            <SupplierCard supplier={activeSupplier} schedules={schedules} dailyData={dailyData}
              normsPercent={normsPercent} ragData={ragData} isPPC={isPPC}
              onEdit={()=>setManageModal(activeSupplier)}
              onEntry={()=>setEntryModal(activeSupplier)}
              onRAG={()=>setRagModal(activeSupplier)}/>

            {/* DAY-WISE LOG */}
            <div style={{background:'#fff',borderRadius:16,padding:'18px 20px',boxShadow:'0 2px 10px rgba(0,0,0,0.07)',border:`1px solid ${C.border}`}}>
              <div style={{fontWeight:800,fontSize:13,marginBottom:14,color:C.gray}}>Day-wise Entry Log</div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{background:C.grayLt}}>
                      <th style={{padding:'7px 10px',textAlign:'left',fontWeight:800}}>Date</th>
                      {activeSupplier.parts.map(p=>(
                        <React.Fragment key={p.partNo}>
                          <th style={{padding:'7px 8px',textAlign:'center',color:C.orange,fontWeight:700}}>{p.partNo} OUT</th>
                          <th style={{padding:'7px 8px',textAlign:'center',color:C.green,fontWeight:700}}>{p.partNo} IN</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({length:new Date(year,month+1,0).getDate()},(_,i)=>{
                      const d=i+1;
                      const isSun=new Date(year,month,d).getDay()===0;
                      const hasEntry=activeSupplier.parts.some(p=>{
                        const e=((dailyData[activeSupplier.id]||{})[p.partNo]||{})[d];
                        return e&&(e.inward>0||e.outward>0);
                      });
                      if(!hasEntry&&d>today) return null;
                      return (
                        <tr key={d} style={{borderBottom:`1px solid ${C.grayLt}`,background:isSun?C.amberLt:hasEntry?'#f0fdf4':'#fff'}}>
                          <td style={{padding:'6px 10px',fontWeight:700,color:isSun?C.amber:C.gray}}>
                            {String(d).padStart(2,'0')}/{String(month+1).padStart(2,'0')}
                            {isSun&&<span style={{marginLeft:4,fontSize:10}}>(Sun)</span>}
                          </td>
                          {activeSupplier.parts.map(p=>{
                            const e=((dailyData[activeSupplier.id]||{})[p.partNo]||{})[d]||{};
                            return (
                              <React.Fragment key={p.partNo}>
                                <td style={{padding:'6px 8px',textAlign:'center',color:C.orange,fontWeight:800}}>{e.outward>0?e.outward:'—'}</td>
                                <td style={{padding:'6px 8px',textAlign:'center',color:C.green,fontWeight:800}}>{e.inward>0?e.inward:'—'}</td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    }).filter(Boolean)}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* MODALS */}
      {schedModal && <ScheduleModal supplier={schedModal} year={year} month={month} schedules={schedules} onSave={load} onClose={()=>setSchedModal(null)} userProfile={userProfile}/>}
      {entryModal && <DailyEntryModal supplier={entryModal} year={year} month={month} defaultDay={today} dailyData={dailyData} onSave={load} onClose={()=>setEntryModal(null)} userProfile={userProfile} activeUnit={activeUnit}/>}
      {ragModal   && <RAGModal supplier={ragModal} year={year} month={month} day={today} ragData={ragData} onSave={load} onClose={()=>setRagModal(null)}/>}
      {manageModal && <ManageModal supplier={manageModal} onSave={async s=>{await saveSupplierMaster(s,activeUnit);setSuppliers(p=>p.map(x=>x.id===s.id?s:x));setManageModal(null);}} onDelete={async id=>{await deleteSupplierMaster(id,activeUnit);setSuppliers(p=>p.filter(x=>x.id!==id));if(view===id)setView('overview');setManageModal(null);}} onClose={()=>setManageModal(null)}/>}
      {addModal && <AddModal existingCount={suppliers.length} onSave={s=>{setSuppliers(p=>[...p,s]);setAddModal(false);}} onClose={()=>setAddModal(false)}/>}
    </div>
  );
}
