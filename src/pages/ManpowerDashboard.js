import React, { useState, useEffect } from 'react';
import { collection, addDoc, setDoc, query, limit, onSnapshot, serverTimestamp, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const todayStr = () => new Date().toISOString().slice(0,10);

const MP_DEPTS_U1 = [
  {id:'pdc',        label:'PDC'},
  {id:'pdc_maint',  label:'PDC Maintenance'},
  {id:'mould',      label:'Mould'},
  {id:'cnc',        label:'CNC/VMC'},
  {id:'fettling',   label:'Fettling'},
  {id:'shotblast',  label:'Shot Blasting'},
  {id:'final',      label:'Final'},
  {id:'stores',     label:'Stores'},
  {id:'fab',        label:'Fabrication'},
  {id:'secondary',  label:'Secondary'},
  {id:'dispatch',   label:'Dispatch'},
  {id:'assembly',   label:'Assembly'},
  {id:'rework',     label:'Rework'},
  {id:'maintenance',label:'Maintenance'},
];

const SHIFTS = ['Day Shift','Night Shift'];
const emptyRows = () => MP_DEPTS_U1.map(d => ({ dept:d.label, budget:0, todayReq:0, actual:0, newManpower:0 }));

// ── Number input pill ────────────────────────────────────────────────────────
function NumPill({ label, value, onChange, color, bg }) {
  const c = color||'#1e40af'; const b = bg||'#eff6ff';
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
      <div style={{fontSize:9,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
      <input type="number" inputMode="numeric" value={value||''} onChange={e=>onChange(parseInt(e.target.value)||0)}
        style={{width:'100%',height:36,border:'1.5px solid '+c+'55',borderRadius:8,background:b,textAlign:'center',fontSize:15,fontWeight:800,color:c,outline:'none',fontFamily:'inherit',boxSizing:'border-box'}}
        placeholder="0"/>
    </div>
  );
}

// ── Dept entry card ──────────────────────────────────────────────────────────
function DeptCard({ r, onUpd, dark }) {
  const pending = Math.max(0,(r.todayReq||0)-(r.actual||0));
  const newPct  = r.actual>0 ? Math.round(((r.newManpower||0)/r.actual)*100) : 0;
  const card    = dark?'#1e2235':'#fff';
  const bdr     = dark?'#2d3748':'#e8e8e8';

  return (
    <div style={{background:card,border:`1.5px solid ${bdr}`,borderRadius:14,padding:'12px 14px',
      boxShadow:pending>0?'0 0 0 2px #ef444433':'0 1px 4px rgba(0,0,0,0.06)'}}>
      {/* Dept header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontWeight:800,fontSize:14,color:dark?'#e2e8f0':'#1a1a2e'}}>{r.dept}</div>
        <div style={{display:'flex',gap:6}}>
          {pending>0 && <span style={{background:'#fef2f2',color:'#dc2626',borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:800}}>⚠ {pending} short</span>}
          {r.actual>0 && newPct>0 && <span style={{background:'#f5f3ff',color:'#7c3aed',borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:700}}>New {newPct}%</span>}
        </div>
      </div>
      {/* 3 inputs - Budget removed */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
        <NumPill label="Required"  value={r.todayReq}    onChange={v=>onUpd('todayReq',v)}    color='#b45309' bg='#fffbeb'/>
        <NumPill label="Actual"    value={r.actual}      onChange={v=>onUpd('actual',v)}      color='#15803d' bg='#f0fdf4'/>
        <NumPill label="New MP"    value={r.newManpower} onChange={v=>onUpd('newManpower',v)} color='#7c3aed' bg='#f5f3ff'/>
      </div>
    </div>
  );
}

// ── View table row ───────────────────────────────────────────────────────────
function ViewRow({ r, i, dark, bdr, txt, sub }) {
  const newPct = r.actual>0 ? Math.round(((r.newManpower||0)/r.actual)*100) : 0;
  const pending = parseInt(r.pending)||0;
  return (
    <tr style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
      <td style={{padding:'6px 8px',border:`1px solid ${bdr}`,fontSize:11,fontWeight:600,color:txt}}>{r.dept||'—'}</td>
      <td style={{padding:'6px 8px',border:`1px solid ${bdr}`,textAlign:'center',color:sub}}>{parseInt(r.budget)||0}</td>
      <td style={{padding:'6px 8px',border:`1px solid ${bdr}`,textAlign:'center',color:sub}}>{parseInt(r.todayReq)||0}</td>
      <td style={{padding:'6px 8px',border:`1px solid ${bdr}`,textAlign:'center',color:txt,fontWeight:700}}>{parseInt(r.actual)||0}</td>
      <td style={{padding:'6px 8px',border:`1px solid ${bdr}`,textAlign:'center',color:'#7c3aed',fontWeight:700}}>{parseInt(r.newManpower)||0}</td>
      <td style={{padding:'6px 8px',border:`1px solid ${bdr}`,textAlign:'center',fontSize:11,color:newPct>30?'#dc2626':'#6b7280',fontWeight:600}}>{r.actual>0?`${newPct}%`:'—'}</td>
      <td style={{padding:'6px 8px',border:`1px solid ${bdr}`,textAlign:'center',fontWeight:800,
        color:pending>0?'#ef4444':'#16a34a',background:pending>0?(dark?'#2d1515':'#fef2f2'):(dark?'#052d14':'#f0fdf4')}}>
        {pending}
      </td>
    </tr>
  );
}

function TotalRow({ t, label, dark }) {
  const th = {padding:'8px 10px',border:'1px solid #2d4a8a',color:'#fff',fontWeight:800,textAlign:'center'};
  const tot = t||{};
  const newPct = (tot.actual>0) ? Math.round(((tot.newManpower||0)/tot.actual)*100) : 0;
  return (
    <tr style={{background:'#1F3864'}}>
      <td style={{...th,textAlign:'left',paddingLeft:10}}>{label}</td>
      <td style={th}>{parseInt(tot.budget)||0}</td>
      <td style={th}>{parseInt(tot.todayReq)||0}</td>
      <td style={{...th,color:'#4ade80'}}>{parseInt(tot.actual)||0}</td>
      <td style={{...th,color:'#c4b5fd'}}>{parseInt(tot.newManpower)||0}</td>
      <td style={{...th,color:'#fde68a'}}>{tot.actual>0?`${newPct}%`:'—'}</td>
      <td style={{...th,color:'#f87171',fontSize:16}}>{parseInt(tot.pending)||0}</td>
    </tr>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
function generatePDF(record) {
  const rows = record.u1 || [];
  const totals = record.totals?.u1 || {};
  const html = `<!DOCTYPE html><html><head><title>Manpower Report</title>
<style>
body{font-family:Arial,sans-serif;margin:20px;color:#111;}
h1{color:#1e40af;font-size:20px;}
h2{color:#374151;font-size:14px;margin-top:0;}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px;}
th{background:#1e40af;color:#fff;padding:7px 10px;text-align:center;}
td{padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;}
td:first-child{text-align:left;}
tr:nth-child(even){background:#f9fafb;}
.total{background:#1F3864!important;color:#fff;font-weight:bold;}
.pending{color:#dc2626;font-weight:bold;}
.ok{color:#16a34a;font-weight:bold;}
.bar-wrap{background:#e5e7eb;border-radius:4px;height:10px;width:80px;display:inline-block;}
.bar-fill{background:#16a34a;height:10px;border-radius:4px;}
</style></head><body>
<h1>Alubee Die Casters — Manpower Report</h1>
<h2>${record.shift} · ${record.date} · Submitted by ${record.submittedBy||'—'}</h2>
<table>
<tr><th>Department</th><th>Budget</th><th>Required</th><th>Actual</th><th>New MP</th><th>New%</th><th>Pending</th><th>Utilisation</th></tr>
${rows.map(r=>{
  const newPct = r.actual>0?Math.round((r.newManpower/r.actual)*100):0;
  const utilPct = r.budget>0?Math.round((r.actual/r.budget)*100):0;
  const pending = Math.max(0,(r.todayReq||0)-(r.actual||0));
  return `<tr>
  <td>${r.dept}</td><td>${r.budget||0}</td><td>${r.todayReq||0}</td>
  <td><span class="${pending>0?'pending':'ok'}">${r.actual||0}</span></td>
  <td>${r.newManpower||0}</td><td>${newPct}%</td>
  <td class="${pending>0?'pending':'ok'}">${pending}</td>
  <td><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(utilPct,100)}%"></div></div> ${utilPct}%</td>
  </tr>`;
}).join('')}
<tr class="total">
  <td>TOTAL</td><td>${totals.budget||0}</td><td>${totals.todayReq||0}</td>
  <td>${totals.actual||0}</td><td>${totals.newManpower||0}</td>
  <td>${totals.actual>0?Math.round(((totals.newManpower||0)/totals.actual)*100):0}%</td>
  <td>${totals.pending||0}</td><td>—</td>
</tr>
</table>
${record.remarks?`<p style="margin-top:12px;font-size:12px;color:#6b7280;">Remarks: ${record.remarks}</p>`:''}
<p style="margin-top:20px;font-size:10px;color:#9ca3af;">Alubee Tasks · ${new Date().toLocaleDateString('en-IN')} · Internal Use Only</p>
</body></html>`;
  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(),500);
}

function generateManpowerPDF(record) {
  const rows = record.u1 || [];
  const totals = record.totals?.u1 || {};
  const html = `<!DOCTYPE html><html><head><title>Manpower Report</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;color:#111;}
h1{color:#1e40af;font-size:22px;margin-bottom:4px;}
h2{color:#374151;font-size:13px;margin-top:0;margin-bottom:16px;}
table{width:100%;border-collapse:collapse;font-size:11px;}
th{background:#1F3864;color:#fff;padding:8px 10px;text-align:center;}
td{padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;}
td:first-child{text-align:left;font-weight:600;}
tr:nth-child(even){background:#f9fafb;}
.total{background:#1F3864!important;color:#fff!important;font-weight:bold;}
.short{color:#dc2626;font-weight:bold;}
.ok{color:#16a34a;font-weight:bold;}
.bar{background:#e5e7eb;border-radius:4px;height:8px;width:80px;display:inline-block;vertical-align:middle;margin-right:4px;}
.bar-fill{border-radius:4px;height:8px;display:inline-block;}
footer{margin-top:20px;font-size:9px;color:#9ca3af;}
</style></head><body>
<h1>Alubee Die Casters — Manpower Report</h1>
<h2>${record.shift} &nbsp;·&nbsp; ${record.date} &nbsp;·&nbsp; Submitted by ${record.submittedBy||'—'}</h2>
<table>
<thead><tr><th>Department</th><th>Budget</th><th>Required</th><th>Actual</th><th>New MP</th><th>New %</th><th>Pending</th><th>Utilisation</th></tr></thead>
<tbody>
${rows.map(r=>{
  const newPct = r.actual>0?Math.round(((r.newManpower||0)/r.actual)*100):0;
  const utilPct = r.budget>0?Math.round(((r.actual||0)/r.budget)*100):0;
  const pending = Math.max(0,(r.todayReq||0)-(r.actual||0));
  const barColor = pending>0?'#ef4444':'#16a34a';
  return `<tr>
    <td>${r.dept}</td>
    <td>${r.budget||0}</td>
    <td>${r.todayReq||0}</td>
    <td class="${pending>0?'short':'ok'}">${r.actual||0}</td>
    <td>${r.newManpower||0}</td>
    <td>${newPct}%</td>
    <td class="${pending>0?'short':'ok'}">${pending}</td>
    <td><div class="bar"><div class="bar-fill" style="width:${Math.min(utilPct,100)}%;background:${barColor};height:8px;"></div></div>${utilPct}%</td>
  </tr>`;
}).join('')}
<tr class="total">
  <td style="color:#fff">TOTAL</td>
  <td style="color:#fff">${totals.budget||0}</td>
  <td style="color:#fff">${totals.todayReq||0}</td>
  <td style="color:#4ade80">${totals.actual||0}</td>
  <td style="color:#c4b5fd">${totals.newManpower||0}</td>
  <td style="color:#fde68a">${totals.actual>0?Math.round(((totals.newManpower||0)/totals.actual)*100):0}%</td>
  <td style="color:#f87171">${totals.pending||0}</td>
  <td style="color:#fff">—</td>
</tr>
</tbody>
</table>
${record.remarks?`<p style="margin-top:12px;font-size:11px;color:#6b7280;"><strong>Remarks:</strong> ${record.remarks}</p>`:''}
<footer>Alubee Tasks &nbsp;·&nbsp; Generated on ${new Date().toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'long',year:'numeric'})} &nbsp;·&nbsp; Internal Use Only</footer>
</body></html>`;
  const w = window.open('','_blank');
  if (!w) { alert('Please allow pop-ups to download PDF'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); }, 600);
}

export default function ManpowerDashboard({ dark, onBack }) {
  const { userProfile } = useAuth();
  const isOwner = userProfile?.role === 'owner' || ['owner@alubee.com','md@alubee.com','jmd@alubee.com'].includes(userProfile?.email);

  const [shift,     setShift]     = useState('Day Shift');
  const [activeTab, setActiveTab] = useState(isOwner?'view':'entry');
  const [rows,      setRows]      = useState(emptyRows());
  const [remarks,   setRemarks]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [history,   setHistory]   = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [msg,       setMsg]       = useState('');
  const [filterShift, setFilterShift] = useState('All');

  const bg   = dark?'#0f111a':'#f4f6fb';
  const card = dark?'#1e2235':'#fff';
  const txt  = dark?'#e2e8f0':'#1a1a2e';
  const sub  = dark?'#94a3b8':'#888';
  const bdr  = dark?'#2d3748':'#e8e8e8';
  const thStyle = {background:'#1F3864',color:'#fff',padding:'7px 6px',fontSize:10,fontWeight:700,textAlign:'center',border:'1px solid #2d4a8a'};

  const [viewDate, setViewDate] = useState(todayStr());

  useEffect(()=>{
    // orderBy createdAt desc + high limit — gets genuinely latest records
    const q = query(collection(db,'manpower_u1'), orderBy('createdAt','desc'), limit(200));
    const unsub = onSnapshot(q, snap=>{
      const docs = snap.docs.map(d=>{
        const data = d.data();
        return {
          id: d.id,
          shift:       String(data.shift||'Day Shift'),
          date:        String(data.date||todayStr()),
          submittedBy: String(data.submittedBy||'—'),
          remarks:     String(data.remarks||''),
          createdAt:   data.createdAt?.seconds||0,
          u1: Array.isArray(data.u1) ? data.u1.map(r=>({
            dept:        String(r.dept||''),
            budget:      parseInt(r.budget)||0,
            todayReq:    parseInt(r.todayReq)||0,
            actual:      parseInt(r.actual)||0,
            newManpower: parseInt(r.newManpower)||0,
            pending:     parseInt(r.pending)||0,
          })) : [],
          totals: {
            u1: {
              budget:      parseInt(data.totals?.u1?.budget)||0,
              todayReq:    parseInt(data.totals?.u1?.todayReq)||0,
              actual:      parseInt(data.totals?.u1?.actual)||0,
              newManpower: parseInt(data.totals?.u1?.newManpower)||0,
              pending:     parseInt(data.totals?.u1?.pending)||0,
            },
          },
        };
      });
      // Already sorted by createdAt desc from Firestore
      setHistory(docs);
    });
    return unsub;
  },[]);

  // When viewDate changes, auto-select first matching record
  useEffect(()=>{
    if (!history.length) return;
    const match = history.find(h=>h.date===viewDate && (filterShift==='All'||h.shift===filterShift));
    setSelected(match||null);
  },[viewDate, filterShift, history]);

  // Pre-fill from last same-shift entry when shift changes
  useEffect(()=>{
    const last = history.find(h=>h.shift===shift);
    if (last && last.u1.length > 0) {
      setRows(MP_DEPTS_U1.map(d=>{
        const prev = last.u1.find(r=>r.dept===d.label)||{};
        return { dept:d.label, budget:prev.budget||0, todayReq:prev.todayReq||0, actual:0, newManpower:0 };
      }));
    } else {
      setRows(emptyRows());
    }
  },[shift, history.length]);

  const updRow = (idx, k, v) => setRows(r=>r.map((x,i)=>i===idx?{...x,[k]:v}:x));

  const pending1 = rows.map(r=>({...r, pending:Math.max(0,(r.todayReq||0)-(r.actual||0))}));
  const total1 = {
    budget:      rows.reduce((a,r)=>a+(r.budget||0),0),
    todayReq:    rows.reduce((a,r)=>a+(r.todayReq||0),0),
    actual:      rows.reduce((a,r)=>a+(r.actual||0),0),
    newManpower: rows.reduce((a,r)=>a+(r.newManpower||0),0),
    pending:     pending1.reduce((a,r)=>a+r.pending,0),
  };

  async function save() {
    setSaving(true);
    try {
      // If editing existing record, delete it first then re-add
      const existing = history.find(h=>h.shift===shift && h.date===todayStr());
      if (existing) { await deleteDoc(doc(db,'manpower_u1',existing.id)); }
      await addDoc(collection(db,'manpower_u1'),{
        shift, date:todayStr(),
        u1: pending1,
        totals:{ u1: total1 },
        remarks,
        submittedBy: userProfile?.name||'Unknown',
        createdAt: serverTimestamp(),
      });
      const {createNotification, NOTIF_TYPES} = await import('../utils/notificationService');
      await createNotification('u1', NOTIF_TYPES.MANPOWER, {
        title: `👷 Manpower Updated — ${shift}`,
        message: `${userProfile?.name||'Security'} submitted manpower for ${shift} on ${todayStr()}. U1 Actual: ${total1.actual} | Pending: ${total1.pending}`,
        screen: 'security',
      });
      setMsg('✅ Saved!');
    } catch(e) { setMsg('❌ '+e.message); }
    finally { setSaving(false); setTimeout(()=>setMsg(''),4000); }
  }


  return (
    <div style={{minHeight:'100vh',background:bg,fontFamily:"'DM Sans',sans-serif"}}>
      {/* Header */}
      <div style={{background:card,borderBottom:`1px solid ${bdr}`,padding:'12px 20px',display:'flex',alignItems:'center',gap:14,position:'sticky',top:0,zIndex:10}}>
        <button onClick={onBack} style={{background:'transparent',border:`1px solid ${bdr}`,borderRadius:8,padding:'7px 14px',color:sub,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>← Back</button>
        <div style={{flex:1}}>
          <h1 style={{margin:0,fontSize:16,fontWeight:800,color:txt}}>👷 Manpower Dashboard</h1>
          <p style={{margin:0,fontSize:11,color:sub}}>{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
        </div>
        {msg && <div style={{background:msg.startsWith('✅')?'#f0fdf4':'#fef2f2',borderRadius:8,padding:'6px 14px',fontSize:12,color:msg.startsWith('✅')?'#16a34a':'#dc2626',fontWeight:700}}>{msg}</div>}
      </div>

      {/* Tabs + shift selector */}
      <div style={{background:card,borderBottom:`1px solid ${bdr}`,padding:'0 20px',display:'flex',gap:0,alignItems:'center',flexWrap:'wrap'}}>
        {!isOwner && (
          <select value={shift} onChange={e=>setShift(e.target.value)}
            style={{border:`1px solid ${bdr}`,borderRadius:8,padding:'6px 14px',fontSize:13,fontWeight:700,fontFamily:'inherit',background:dark?'#151929':'#fff',color:txt,cursor:'pointer',margin:'8px 10px 8px 0'}}>
            {SHIFTS.map(s=><option key={s}>{s}</option>)}
          </select>
        )}
        <div style={{flex:1}}/>
        {!isOwner && <button onClick={()=>setActiveTab('entry')} style={{padding:'10px 16px',border:'none',background:'transparent',fontFamily:'inherit',cursor:'pointer',fontSize:12,fontWeight:activeTab==='entry'?700:400,color:activeTab==='entry'?'#f97316':sub,borderBottom:activeTab==='entry'?'3px solid #f97316':'3px solid transparent'}}>✏️ Entry</button>}
        <button onClick={()=>setActiveTab('view')} style={{padding:'10px 16px',border:'none',background:'transparent',fontFamily:'inherit',cursor:'pointer',fontSize:12,fontWeight:activeTab==='view'?700:400,color:activeTab==='view'?'#f97316':sub,borderBottom:activeTab==='view'?'3px solid #f97316':'3px solid transparent'}}>📊 View</button>
      </div>

      <div style={{padding:'16px 16px',paddingBottom:60}}>

        {/* ── ENTRY ── */}
        {activeTab==='entry' && !isOwner && (
          <div>
            {/* Summary bar */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:16}}>
              {[
                {l:'Required', v:total1.todayReq,    c:'#b45309'},
                {l:'Actual',   v:total1.actual,      c:'#15803d'},
                {l:'Pending',  v:total1.pending,      c:'#dc2626'},
              ].map(k=>(
                <div key={k.l} style={{background:card,borderRadius:10,padding:'10px 12px',border:`1.5px solid ${bdr}`,textAlign:'center'}}>
                  <div style={{fontSize:22,fontWeight:900,color:k.c}}>{k.v}</div>
                  <div style={{fontSize:10,color:sub,fontWeight:600}}>{k.l}</div>
                </div>
              ))}
            </div>

            {/* Dept cards */}
            <div style={{display:'grid',gridTemplateColumns:'1fr',gap:10,marginBottom:14}}>
              {rows.map((r,i)=>(
                <DeptCard key={r.dept} r={r} onUpd={(k,v)=>updRow(i,k,v)} dark={dark}/>
              ))}
            </div>

            {/* Remarks + Save */}
            <input value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Remarks (optional)…"
              style={{border:`1.5px solid ${bdr}`,borderRadius:8,padding:'10px 14px',fontSize:13,outline:'none',fontFamily:'inherit',background:dark?'#151929':'#fff',color:txt,width:'100%',boxSizing:'border-box',marginBottom:12}}/>

            {(()=>{
              const alreadyDone = history.find(h=>h.shift===shift && h.date===todayStr());
              if (alreadyDone) {
                return (
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    <div style={{background:'#f0fdf4',border:'1.5px solid #16a34a',borderRadius:10,padding:'10px 14px',fontSize:13,fontWeight:700,color:'#15803d',textAlign:'center'}}>
                      ✅ {shift} already submitted by {alreadyDone.submittedBy}
                    </div>
                    <button onClick={()=>{
                      setRows(MP_DEPTS_U1.map(d=>{
                        const prev = (alreadyDone.u1||[]).find(r=>r.dept===d.label)||{};
                        return {dept:d.label,budget:prev.budget||0,todayReq:prev.todayReq||0,actual:prev.actual||0,newManpower:prev.newManpower||0};
                      }));
                      setRemarks(alreadyDone.remarks||'');
                    }}
                      style={{width:'100%',background:'linear-gradient(135deg,#3b82f6,#1d4ed8)',border:'none',borderRadius:12,padding:'12px',color:'#fff',fontSize:14,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>
                      ✏️ Edit & Resubmit
                    </button>
                  </div>
                );
              }
              return (
                <button onClick={save} disabled={saving}
                  style={{width:'100%',background:saving?'#4a5568':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:12,padding:'14px',color:'#fff',fontSize:15,fontWeight:800,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
                  {saving?'⏳ Saving…':`💾 Submit — ${shift}`}
                </button>
              );
            })()}
          </div>
        )}

        {/* ── VIEW ── */}
        {activeTab==='view' && (
          <div>
            {/* PDF button */}
            {selected && (
              <button onClick={()=>generateManpowerPDF(selected)}
                style={{marginBottom:12,padding:'8px 18px',borderRadius:9,border:'none',background:'#dc2626',color:'#fff',fontWeight:800,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                📄 Download PDF Report
              </button>
            )}


            {/* Date picker + shift records for that date */}
            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:14,flexWrap:'wrap'}}>
              <input type="date" value={viewDate} max={todayStr()} onChange={e=>setViewDate(e.target.value)}
                style={{border:`1.5px solid ${bdr}`,borderRadius:8,padding:'7px 12px',fontSize:13,fontWeight:700,
                  background:dark?'#151929':'#fff',color:txt,outline:'none',fontFamily:'inherit',cursor:'pointer'}}/>
              <button onClick={()=>setViewDate(todayStr())}
                style={{padding:'7px 14px',borderRadius:8,border:`1px solid ${bdr}`,background:'transparent',
                  color:sub,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Today</button>
              {/* Records for selected date */}
              {history.filter(h=>h.date===viewDate).map(r=>(
                <div key={r.id} style={{display:'flex',alignItems:'center',gap:2}}>
                  <button onClick={()=>setSelected(r)}
                    style={{background:selected?.id===r.id?'#f97316':dark?'#2d3748':'#f0f0f0',border:'none',
                      borderRadius:20,padding:'5px 14px',fontSize:12,fontWeight:selected?.id===r.id?700:400,
                      color:selected?.id===r.id?'#fff':txt,cursor:'pointer',fontFamily:'inherit'}}>
                    {r.shift==='Night Shift'?'🌙 Night':'☀️ Day'} — {r.submittedBy}
                  </button>
                  {isOwner&&<button onClick={async()=>{
                    if(!window.confirm('Delete this record?'))return;
                    try{ await deleteDoc(doc(db,'manpower_u1',r.id));
                      if(selected?.id===r.id) setSelected(null);
                    }catch(e){alert(e.message);}
                  }} style={{background:'#fef2f2',border:'none',borderRadius:20,padding:'5px 7px',color:'#dc2626',fontSize:10,cursor:'pointer'}}>🗑</button>}
                </div>
              ))}
              {history.filter(h=>h.date===viewDate).length===0 &&
                <span style={{fontSize:12,color:sub}}>No records for this date</span>}
            </div>

            {!selected
              ? <div style={{textAlign:'center',padding:'40px',color:sub}}>No records yet.</div>
              : <div>
                  <div style={{fontWeight:800,color:txt,fontSize:14,marginBottom:12}}>
                    {selected.shift==='Night Shift'?'🌙':'☀️'} {selected.shift} · {selected.date} · By {selected.submittedBy}
                  </div>

                  {/* KPI cards */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
                    {[
                      
                      {l:'Actual',      v:selected.totals?.u1?.actual||0,      c:'#16a34a'},
                      {l:'Pending',     v:selected.totals?.u1?.pending||0,     c:'#ef4444'},
                      {l:'New Manpower',v:selected.totals?.u1?.newManpower||0, c:'#7c3aed'},
                      {l:'Required',    v:selected.totals?.u1?.todayReq||0,    c:'#f97316'},
                      {l:'New %',       v:selected.totals?.u1?.actual>0?Math.round(((selected.totals?.u1?.newManpower||0)/selected.totals?.u1?.actual)*100)+'%':'—', c:'#7c3aed'},
                    ].map(k=>(
                      <div key={k.l} style={{background:card,borderRadius:10,padding:'10px 12px',border:`1px solid ${bdr}`}}>
                        <div style={{fontSize:20,fontWeight:900,color:k.c}}>{k.v}</div>
                        <div style={{fontSize:10,color:sub,marginTop:2}}>{k.l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Visual bar chart */}
                  <div style={{background:card,borderRadius:12,padding:'14px 16px',marginBottom:14,border:`1px solid ${bdr}`}}>
                    <div style={{fontWeight:700,fontSize:12,color:txt,marginBottom:10}}>Actual vs Required — by Department</div>
                    {(selected.u1||[]).filter(r=>r.todayReq>0||r.actual>0).map(r=>{
                      const max = Math.max(r.budget||0, r.todayReq||0, r.actual||0, 1);
                      const reqPct = Math.round((r.todayReq||0)/max*100);
                      const actPct = Math.round((r.actual||0)/max*100);
                      const pending = Math.max(0,(r.todayReq||0)-(r.actual||0));
                      return (
                        <div key={r.dept} style={{marginBottom:8}}>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:10,fontWeight:600,color:sub,marginBottom:2}}>
                            <span>{r.dept}</span>
                            <span style={{color:pending>0?'#dc2626':'#16a34a',fontWeight:700}}>{r.actual||0}/{r.todayReq||0}{pending>0?` (${pending} short)`:' ✓'}</span>
                          </div>
                          <div style={{position:'relative',height:10,background:dark?'#2d3748':'#e5e7eb',borderRadius:5,overflow:'hidden'}}>
                            <div style={{position:'absolute',left:0,top:0,width:`${reqPct}%`,height:'100%',background:'#fed7aa',borderRadius:5}}/>
                            <div style={{position:'absolute',left:0,top:0,width:`${actPct}%`,height:'100%',background:pending>0?'#ef4444':'#16a34a',borderRadius:5}}/>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{display:'flex',gap:12,marginTop:8,fontSize:10,color:sub}}>
                      <span style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:12,height:8,background:'#fed7aa',borderRadius:2}}/> Required</span>
                      <span style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:12,height:8,background:'#16a34a',borderRadius:2}}/> Actual (OK)</span>
                      <span style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:12,height:8,background:'#ef4444',borderRadius:2}}/> Actual (Short)</span>
                    </div>
                  </div>

                  {/* Table */}
                  <div style={{overflowX:'auto'}}>
                    <table style={{borderCollapse:'collapse',width:'100%',fontSize:12}}>
                      <thead><tr>
                        {['Dept','Budget','Required','Actual','New MP','New %','Pending'].map(h=>(
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {(selected.u1||[]).map((r,i)=><ViewRow key={i} r={r} i={i} dark={dark} bdr={bdr} txt={txt} sub={sub}/>)}
                        <TotalRow t={selected.totals?.u1||{}} label="Total" dark={dark}/>
                      </tbody>
                    </table>
                  </div>

                  {selected.remarks && <div style={{marginTop:12,padding:'10px 14px',background:dark?'#2d3748':'#f8f9fc',borderRadius:8,fontSize:13,color:sub}}>📝 {selected.remarks}</div>}
                </div>
            }
          </div>
        )}
      </div>
    </div>
  );
}
