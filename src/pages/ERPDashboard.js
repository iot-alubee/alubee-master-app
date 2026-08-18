import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const today = () => new Date().toISOString().slice(0, 10);
const DEPT_COLORS = { CNC:'#F39C12', Fettling:'#E67E22', PDC:'#E74C3C', Supplier:'#8E44AD', 'Shot Blasting':'#3498DB', 'Final / Hold':'#16A085' };


// ─── REASON MASTER (HPDC Machine Stoppage) ───────────────────────────────────
const DEFAULT_REASONS = [
  // Die Related
  { category:'Die Related',      reason:'Die Change (Planned)' },
  { category:'Die Related',      reason:'Die Change (Breakdown)' },
  { category:'Die Related',      reason:'Die Repair / Welding' },
  { category:'Die Related',      reason:'Die Cooling Issue' },
  { category:'Die Related',      reason:'Die Crack / Damage' },
  { category:'Die Related',      reason:'First Off Approval Pending' },
  // Machine Related
  { category:'Machine Related',  reason:'Hydraulic Failure' },
  { category:'Machine Related',  reason:'Shot End / Plunger Issue' },
  { category:'Machine Related',  reason:'Plunger Tip Change' },
  { category:'Machine Related',  reason:'Toggle / Clamping Failure' },
  { category:'Machine Related',  reason:'Intensification Failure' },
  { category:'Machine Related',  reason:'Ejection System Failure' },
  { category:'Machine Related',  reason:'Electrical / Control Panel Fault' },
  { category:'Machine Related',  reason:'Lubrication System Fault' },
  // Process Related
  { category:'Process Related',  reason:'Metal Temperature Low' },
  { category:'Process Related',  reason:'Die Temperature High' },
  { category:'Process Related',  reason:'Porosity Rejection Loop' },
  { category:'Process Related',  reason:'Cold Shut / Misrun Issue' },
  { category:'Process Related',  reason:'Flash / Overflow Issue' },
  { category:'Process Related',  reason:'Cycle Time Deviation' },
  // Utility
  { category:'Utility',          reason:'Power Cut / EB Failure' },
  { category:'Utility',          reason:'Compressor Failure' },
  { category:'Utility',          reason:'Furnace Breakdown' },
  { category:'Utility',          reason:'Water Supply Issue' },
  { category:'Utility',          reason:'Crane / Overhead Equipment Issue' },
  // Planned
  { category:'Planned',          reason:'Scheduled Preventive Maintenance (PM)' },
  { category:'Planned',          reason:'Die Trial / New Die Setup' },
  { category:'Planned',          reason:'PPAP / First Article Inspection' },
  { category:'Planned',          reason:'Shift Changeover / Startup' },
  { category:'Planned',          reason:'Operator Break / Lunch' },
  // Material
  { category:'Material',         reason:'Metal / Alloy Shortage' },
  { category:'Material',         reason:'Alloy Grade Change' },
  { category:'Material',         reason:'Ladle / Crucible Issue' },
  { category:'Material',         reason:'Biscuit / Runner Jam' },
  // Quality Hold
  { category:'Quality Hold',     reason:'Customer Complaint Hold' },
  { category:'Quality Hold',     reason:'Internal Rejection Spike' },
  { category:'Quality Hold',     reason:'PPAP Hold' },
  { category:'Quality Hold',     reason:'Dimensional Deviation Hold' },
];

export function ReasonMasterAdmin({ dark, card, txt, sub, bdr, userProfile }) {
  const [reasons, setReasons]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [newCat, setNewCat]     = useState('');
  const [newReason, setNewReason] = useState('');
  const [msg, setMsg]           = useState('');

  const inp = { border:`1px solid ${bdr}`, borderRadius:8, padding:'8px 12px', fontSize:13,
    outline:'none', background:dark?'#1e2235':'#fff', color:txt, fontFamily:'inherit' };

  useEffect(()=>{
    import('firebase/firestore').then(({collection,onSnapshot,query})=>{
      import('../firebase').then(({db})=>{
        const q = collection(db,'reason_master_u1');
        return onSnapshot(q, snap=>{
          const docs = snap.docs.map(d=>({id:d.id,...d.data()}));
          if (docs.length === 0) {
            seedDefaults(db);
          } else {
            docs.sort((a,b)=>a.category?.localeCompare(b.category)||a.reason?.localeCompare(b.reason));
            setReasons(docs);
            setLoading(false);
          }
        });
      });
    });
  },[]);

  async function seedDefaults(db_inst) {
    const {collection,addDoc,serverTimestamp} = await import('firebase/firestore');
    for (const r of DEFAULT_REASONS) {
      await addDoc(collection(db_inst,'reason_master_u1'), { ...r, createdAt:serverTimestamp(), active:true });
    }
    setLoading(false);
  }

  async function addReason() {
    if (!newCat.trim() || !newReason.trim()) return alert('Category and reason are required');
    setSaving(true);
    try {
      const {collection,addDoc,serverTimestamp} = await import('firebase/firestore');
      const {db} = await import('../firebase');
      await addDoc(collection(db,'reason_master_u1'), { category:newCat.trim(), reason:newReason.trim(), active:true, createdAt:serverTimestamp() });
      setNewCat(''); setNewReason('');
      setMsg('✅ Added'); setTimeout(()=>setMsg(''),2000);
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function toggleActive(r) {
    const {doc,updateDoc} = await import('firebase/firestore');
    const {db} = await import('../firebase');
    await updateDoc(doc(db,'reason_master_u1',r.id), { active:!r.active });
  }

  async function deleteReason(r) {
    if (!window.confirm(`Delete "${r.reason}"?`)) return;
    const {doc,deleteDoc} = await import('firebase/firestore');
    const {db} = await import('../firebase');
    await deleteDoc(doc(db,'reason_master_u1',r.id));
  }

  const categories = [...new Set(reasons.map(r=>r.category))].sort();

  if (loading) return <div style={{padding:40,textAlign:'center',color:sub}}>Loading reason master...</div>;

  return (
    <div style={{padding:'16px 14px',maxWidth:680,margin:'0 auto'}}>
      <div style={{fontWeight:800,fontSize:16,color:txt,marginBottom:4}}>🗂 Reason Master — HPDC Machine Stoppage</div>
      <div style={{fontSize:12,color:sub,marginBottom:20}}>Manage the dropdown list operators see when logging a machine stoppage. Only you can edit this.</div>

      {/* Add new */}
      <div style={{background:card,border:`1.5px solid ${bdr}`,borderRadius:12,padding:'14px 16px',marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:13,color:txt,marginBottom:10}}>➕ Add New Reason</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',marginBottom:4}}>Category</div>
            <input list="cats" style={{...inp,width:'100%',boxSizing:'border-box'}} value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="e.g. Die Related"/>
            <datalist id="cats">{categories.map(c=><option key={c} value={c}/>)}</datalist>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',marginBottom:4}}>Reason</div>
            <input style={{...inp,width:'100%',boxSizing:'border-box'}} value={newReason} onChange={e=>setNewReason(e.target.value)} placeholder="e.g. Die Crack / Damage"/>
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button onClick={addReason} disabled={saving} style={{padding:'8px 20px',background:'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:8,color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
            {saving?'Adding…':'Add Reason'}
          </button>
          {msg&&<span style={{fontSize:12,color:'#16a34a',fontWeight:700}}>{msg}</span>}
        </div>
      </div>

      {/* Reason list by category */}
      {categories.map(cat=>(
        <div key={cat} style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:800,color:'#f97316',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6,paddingLeft:4}}>{cat}</div>
          {reasons.filter(r=>r.category===cat).map(r=>(
            <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,background:card,border:`1px solid ${bdr}`,borderRadius:8,padding:'8px 12px',marginBottom:4,opacity:r.active?1:0.45}}>
              <span style={{flex:1,fontSize:13,color:txt,fontWeight:r.active?500:400}}>{r.reason}</span>
              <button onClick={()=>toggleActive(r)} style={{padding:'3px 10px',borderRadius:6,border:`1px solid ${r.active?'#16a34a':'#9ca3af'}`,background:'transparent',color:r.active?'#16a34a':'#9ca3af',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                {r.active?'Active':'Inactive'}
              </button>
              <button onClick={()=>deleteReason(r)} style={{padding:'3px 8px',borderRadius:6,border:'1px solid #fca5a5',background:'transparent',color:'#dc2626',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>🗑</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function StoppageReasonForm({ dark, card, txt, sub, bdr, inp, unit, onSubmit }) {
  const [reasons, setReasons]     = useState([]);
  const [machine, setMachine]     = useState('');
  const [category, setCategory]   = useState('');
  const [reason, setReason]       = useState('');
  const [duration, setDuration]   = useState('');
  const [shift, setShift]         = useState('Day');
  const [remarks, setRemarks]     = useState('');
  const [saving, setSaving]       = useState(false);

  useEffect(()=>{
    import('firebase/firestore').then(({collection,query,where,getDocs})=>{
      import('../firebase').then(({db})=>{
        getDocs(query(collection(db,'reason_master_u1'), where('active','==',true))).then(snap=>{
          setReasons(snap.docs.map(d=>({id:d.id,...d.data()})));
        });
      });
    });
  },[]);

  const categories = [...new Set(reasons.map(r=>r.category))].sort();
  const filteredReasons = reasons.filter(r=>r.category===category);

  async function save() {
    if (!machine || !reason) return alert('Machine and reason are required');
    if (!duration) return alert('Duration (minutes) is required');
    setSaving(true);
    try {
      await onSubmit({ machine, category, reason, duration:parseInt(duration), shift, remarks });
      setMachine(''); setCategory(''); setReason(''); setDuration(''); setRemarks('');
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  const PDC_MACHINE_LIST = [
    '125T-01','125T-02','125T-03','125T-04','125T-05','125T-06','125T-07',
    '250T-01','350T-01','350T-02','350T-03','350T-04',
  ];

  return (
    <div style={{padding:'0 0 16px'}}>
      <div style={{fontWeight:800,fontSize:15,color:txt,marginBottom:16}}>🛑 Log Machine Stoppage</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',marginBottom:4}}>Machine *</div>
          <select style={{...inp,width:'100%',cursor:'pointer'}} value={machine} onChange={e=>setMachine(e.target.value)}>
            <option value="">Select machine…</option>
            {PDC_MACHINE_LIST.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',marginBottom:4}}>Shift</div>
          <select style={{...inp,width:'100%',cursor:'pointer'}} value={shift} onChange={e=>setShift(e.target.value)}>
            {['Day','Night'].map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',marginBottom:4}}>Category *</div>
          <select style={{...inp,width:'100%',cursor:'pointer'}} value={category} onChange={e=>{setCategory(e.target.value);setReason('');}}>
            <option value="">Select category…</option>
            {categories.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',marginBottom:4}}>Reason *</div>
          <select style={{...inp,width:'100%',cursor:'pointer'}} value={reason} onChange={e=>setReason(e.target.value)} disabled={!category}>
            <option value="">Select reason…</option>
            {filteredReasons.map(r=><option key={r.id}>{r.reason}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',marginBottom:4}}>Duration (minutes) *</div>
          <input type="number" min={1} style={{...inp,width:'100%',boxSizing:'border-box'}} value={duration} onChange={e=>setDuration(e.target.value)} placeholder="e.g. 45"/>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',marginBottom:4}}>Remarks</div>
          <input style={{...inp,width:'100%',boxSizing:'border-box'}} value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Optional"/>
        </div>
      </div>
      <button onClick={save} disabled={saving} style={{width:'100%',padding:'12px',borderRadius:10,border:'none',background:saving?'#6b7280':'linear-gradient(135deg,#dc2626,#b91c1c)',color:'#fff',fontWeight:800,fontSize:14,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
        {saving?'⏳ Logging…':'🛑 Log Stoppage'}
      </button>
    </div>
  );
}

export default function ERPDashboard({ dark, onBack, unit }) {
  const { userProfile } = useAuth();
  const isOwner = userProfile?.role === 'owner';
  const [activeSection, setActiveSection] = useState(isOwner ? 'hist_pdc_running' : 'pdc_running');
  const [submitMsg, setSubmitMsg] = useState('');
  const [submitOk, setSubmitOk] = useState(true);

  const bg   = dark?'#0f111a':'#f4f6fb';
  const card = dark?'#1e2235':'#fff';
  const txt  = dark?'#e2e8f0':'#1a1a2e';
  const sub  = dark?'#94a3b8':'#888';
  const bdr  = dark?'#2d3748':'#e8e8e8';
  const inp  = { border:`1.5px solid ${bdr}`,borderRadius:8,padding:'9px 12px',fontSize:13,outline:'none',fontFamily:'inherit',background:dark?'#151929':'#fff',color:txt,width:'100%',boxSizing:'border-box' };

  const colName = (type) => `erp_${type}_${unit==='u2'?'u2':'u1'}`;

  async function submitStoppage(data) {
    const {collection,addDoc,serverTimestamp} = await import('firebase/firestore');
    const {db} = await import('../firebase');
    await addDoc(collection(db,`erp_stoppage_${unit==='u2'?'u2':'u1'}`), {
      ...data, submittedBy:userProfile?.name, submittedAt:serverTimestamp(),
      date:new Date().toISOString().slice(0,10), unit:unit||'u1'
    });
    setSubmitMsg('✅ Stoppage logged'); setSubmitOk(true);
    setTimeout(()=>setSubmitMsg(''),3000);
  }

  async function submit(type, data) {
    try {
      await addDoc(collection(db, colName(type)), { ...data, submittedBy:userProfile?.name, submittedAt:serverTimestamp(), date:today(), unit:unit||'u1' });
      setSubmitOk(true);
      setSubmitMsg('✅ Saved!');
      // Notify owner
      const sectionLabel = {pdc_running:'PDC Running',scrap:'Scrap Details',pallets:'Pallet Details',rework:'Rework',alloy_wip:'Alloy WIP',fg_super:'FG Supermarket'}[type]||type;
      const {createNotification,NOTIF_TYPES}=await import('../utils/notificationService');
      await createNotification(unit||'u1', NOTIF_TYPES.ERP, {
        title: `📊 ERP Updated: ${sectionLabel}`,
        message: `${userProfile?.name} updated ${sectionLabel} on ${today()}`,
      });
    } catch(e) {
      setSubmitOk(false);
      setSubmitMsg('❌ ' + e.message);
    }
    setTimeout(()=>setSubmitMsg(''),4000);
  }

  const SECTIONS = [
    {id:'pdc_running',label:'🏭 PDC Running'},
    {id:'scrap',      label:'🗑 Scrap Details'},
    {id:'pallets',    label:'📦 Pallet Details'},
    {id:'rework',     label:'🔧 Rework'},
    {id:'alloy_wip',  label:'⚗️ Alloy WIP'},
    {id:'furnace',     label:'🔥 Furnace Life'},
    {id:'stoppage',     label:'🛑 Stoppage Log'},
  ];

  return (
    <div style={{minHeight:'100vh',background:bg,fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{background:dark?'#1e2235':'#fff',borderBottom:`1px solid ${bdr}`,padding:'12px 20px',display:'flex',alignItems:'center',gap:14,position:'sticky',top:0,zIndex:10}}>
        <button onClick={onBack} style={{background:'transparent',border:`1px solid ${bdr}`,borderRadius:8,padding:'7px 14px',color:sub,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>← Back</button>
        <div style={{flex:1}}>
          <h1 style={{margin:0,fontSize:16,fontWeight:800,color:txt}}>ERP Dashboard — Daily Input</h1>
          <p style={{margin:0,fontSize:11,color:sub}}>Unit {unit==='u2'?'2':'1'} · {new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</p>
        </div>
        {submitMsg&&<div style={{background:submitOk?'#f0fdf4':'#fef2f2',border:`1px solid ${submitOk?'#bbf7d0':'#fecaca'}`,borderRadius:8,padding:'7px 14px',fontSize:12,color:submitOk?'#16a34a':'#dc2626',fontWeight:700,flexShrink:0}}>{submitMsg}</div>}
      </div>

      {/* Tab nav — horizontal scrollable (mobile friendly) */}
      <div style={{overflowX:'auto',display:'flex',background:dark?'#0a0c14':'#1a1a2e',padding:'8px 12px',gap:4,WebkitOverflowScrolling:'touch'}}>
        {SECTIONS.map(s=>(
          <button key={s.id} onClick={()=>setActiveSection(s.id)}
            style={{background:activeSection===s.id?'rgba(249,115,22,0.25)':'transparent',border:activeSection===s.id?'1px solid #f97316':'1px solid transparent',borderRadius:8,padding:'8px 14px',color:activeSection===s.id?'#f97316':'rgba(255,255,255,0.6)',fontSize:12,fontWeight:activeSection===s.id?700:400,cursor:'pointer',whiteSpace:'nowrap',fontFamily:'inherit'}}>
            {s.label}
          </button>
        ))}
        {/* History tabs */}
        <div style={{width:1,background:'rgba(255,255,255,0.1)',margin:'0 4px'}}/>
        {SECTIONS.map(s=>(
          <button key={`h_${s.id}`} onClick={()=>setActiveSection(`hist_${s.id}`)}
            style={{background:activeSection===`hist_${s.id}`?'rgba(59,130,246,0.2)':'transparent',border:activeSection===`hist_${s.id}`?'1px solid #3b82f6':'1px solid transparent',borderRadius:8,padding:'8px 14px',color:activeSection===`hist_${s.id}`?'#60a5fa':'rgba(255,255,255,0.35)',fontSize:11,cursor:'pointer',whiteSpace:'nowrap',fontFamily:'inherit'}}>
            📋 {s.label.split(' ').slice(1).join(' ')}
          </button>
        ))}
      </div>

      <div style={{padding:'16px 20px',paddingBottom:60}}>
        {isOwner&&activeSection.startsWith('hist_')&&<div style={{background:'rgba(249,115,22,0.1)',border:'1px solid #f97316',borderRadius:10,padding:'10px 16px',marginBottom:12,fontSize:12,color:'#f97316',fontWeight:600}}>📊 Viewing submitted data — input available to ERP/Stores users only</div>}
      {!isOwner&&activeSection==='pdc_running' && <PDCRunningForm inp={inp} txt={txt} sub={sub} bdr={bdr} card={card} dark={dark} onSubmit={d=>submit('pdc_running',d)}/>}
        {!isOwner&&activeSection==='scrap'       && <ScrapForm      inp={inp} txt={txt} sub={sub} bdr={bdr} card={card} dark={dark} unit={unit} onSubmit={d=>submit('scrap',d)}/>}
        {!isOwner&&activeSection==='pallets'     && <PalletForm     inp={inp} txt={txt} sub={sub} bdr={bdr} card={card} dark={dark} onSubmit={d=>submit('pallets',d)}/>}
        {activeSection==='rework'      && <ReworkForm     inp={inp} txt={txt} sub={sub} bdr={bdr} card={card} dark={dark} onSubmit={d=>submit('rework',d)}/>}
        {activeSection==='alloy_wip'   && <AlloyWIPForm   inp={inp} txt={txt} sub={sub} bdr={bdr} card={card} dark={dark} onSubmit={d=>submit('alloy_wip',d)}/>}

        {!isOwner&&activeSection==='furnace' && <FurnaceMonitor dark={dark} unit={unit} userProfile={userProfile}/>}
        {isOwner&&activeSection==='furnace' && <FurnaceMonitor dark={dark} unit={unit} userProfile={userProfile}/>}
        {activeSection==='stoppage' && !isOwner && <StoppageReasonForm dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} inp={inp} unit={unit} onSubmit={submitStoppage}/>}
        {activeSection==='stoppage' && isOwner && <ReasonMasterAdmin dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} userProfile={userProfile}/>}
        {activeSection.startsWith('hist_') && <ViewHistory section={activeSection.replace('hist_','')} colName={colName} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>}
      </div>
    </div>
  );
}

// ── PDC Running ────────────────────────────────────────────────────────────────
function PDCRunningForm({inp,txt,sub,bdr,card,dark,onSubmit}) {
  const empty = ()=>({mc:'',part:'',scheQty:'',dispatched:'',perDay:'',wipQty:''});
  const [rows,setRows] = useState([empty()]);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const upd = (i,k,v) => setRows(r=>r.map((x,j)=>j===i?{...x,[k]:v}:x));
  const bal  = r => (parseInt(r.scheQty)||0)-(parseInt(r.dispatched)||0);
  const cov  = r => { const w=parseInt(r.wipQty)||0,p=parseInt(r.perDay)||0; return p>0?(w/p).toFixed(1):'—'; };
  const covColor = v => { const n=parseFloat(v); return isNaN(n)?sub:n<2?'#dc2626':n<3.5?'#d97706':'#16a34a'; };
  async function save() {
    setSaving(true); setError('');
    try { await onSubmit({rows:rows.filter(r=>r.mc||r.part)}); }
    catch(e){setError(e.message);}
    finally{setSaving(false);}
  }
  const hd={background:'#1F3864',color:'#fff',padding:'7px 8px',fontSize:10,fontWeight:700,textAlign:'center',border:'1px solid #2d4a8a',whiteSpace:'nowrap'};
  const td={padding:'2px 3px',border:`1px solid ${bdr}`,textAlign:'center'};
  const autoCell=(v,c)=><td style={{...td,fontWeight:800,color:c,background:dark?'#151929':'#eef2ff',fontSize:12}}>{v}</td>;
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <div><h2 style={{margin:0,fontSize:15,fontWeight:800,color:txt}}>PDC Dept Running Components</h2>
          <div style={{fontSize:10,color:sub,marginTop:2}}>Balance = Sche−Dispatched · Coverage = WIP÷PerDay</div></div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setRows(r=>[...r,empty()])} style={{background:'#3498db',border:'none',borderRadius:8,padding:'7px 12px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Row</button>
          <button onClick={save} disabled={saving} style={{background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:8,padding:'7px 16px',color:'#fff',fontSize:12,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',minWidth:80}}>
            {saving?'⏳':'💾'} {saving?'Saving':'Save'}
          </button>
        </div>
      </div>
      {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'8px 12px',color:'#dc2626',fontSize:12,marginBottom:10}}>{error}</div>}
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',fontSize:11,background:card,width:'100%'}}>
          <thead>
            <tr>{['S.No','M/C No','Running Parts','Sche Qty','Dispatched','Balance','Per Day','WIP Coverage','WIP Qty',''].map(h=><th key={h} style={hd}>{h}</th>)}</tr>
            <tr>{['','','','Input','Input','Auto','Input','Auto(WIP÷Day)','Input',''].map((h,i)=><th key={i} style={{...hd,background:'#2F5496',fontSize:9,padding:'3px 6px'}}>{h}</th>)}</tr>
          </thead>
          <tbody>{rows.map((r,i)=>{
            const b=bal(r),c=cov(r);
            return (
              <tr key={i} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                <td style={{...td,color:sub,width:30}}>{i+1}</td>
                <td style={td}><input value={r.mc} onChange={e=>upd(i,'mc',e.target.value)} style={{...inp,padding:'5px 7px',width:72,textAlign:'center'}}/></td>
                <td style={td}><input value={r.part} onChange={e=>upd(i,'part',e.target.value)} style={{...inp,padding:'5px 7px',width:90}}/></td>
                <td style={td}><input value={r.scheQty} onChange={e=>upd(i,'scheQty',e.target.value)} style={{...inp,padding:'5px 7px',width:68,textAlign:'right'}} type="number"/></td>
                <td style={td}><input value={r.dispatched} onChange={e=>upd(i,'dispatched',e.target.value)} style={{...inp,padding:'5px 7px',width:68,textAlign:'right'}} type="number"/></td>
                {autoCell(b.toLocaleString(),'#f97316')}
                <td style={td}><input value={r.perDay} onChange={e=>upd(i,'perDay',e.target.value)} style={{...inp,padding:'5px 7px',width:60,textAlign:'right'}} type="number"/></td>
                {autoCell(c,covColor(c))}
                <td style={td}><input value={r.wipQty} onChange={e=>upd(i,'wipQty',e.target.value)} style={{...inp,padding:'5px 7px',width:68,textAlign:'right'}} type="number"/></td>
                <td style={td}><button onClick={()=>setRows(r=>r.filter((_,j)=>j!==i))} style={{background:'#fef2f2',border:'none',borderRadius:4,padding:'3px 7px',color:'#dc2626',cursor:'pointer',fontSize:10}}>✕</button></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div style={{fontSize:10,color:sub,marginTop:6}}>🟢 &gt;3.5d · 🟡 2–3.5d · 🔴 &lt;2d</div>
    </div>
  );
}

// ── Scrap — NO live totals re-render, use controlled state ──────────────────────
function ScrapForm({inp,txt,sub,bdr,card,dark,onSubmit,unit}) {
  // FIX: Use a single state object with no computed values in render to prevent keyboard jump
  const [overflow,    setOverflow]    = useState('');
  const [rejComp,     setRejComp]     = useState('');
  const [bigPallet,   setBigPallet]   = useState('');
  const [medPallet,   setMedPallet]   = useState('');
  const [smlPallet,   setSmlPallet]   = useState('');
  const [saving,setSaving]=useState(false);

  const total      = (parseInt(overflow)||0)+(parseInt(rejComp)||0);
  const totalPallet= (parseInt(bigPallet)||0)+(parseInt(medPallet)||0)+(parseInt(smlPallet)||0);

  async function save() {
    setSaving(true);
    try { await onSubmit({overflow,rejComponents:rejComp,bigPallet,mediumPallet:medPallet,smallPallet:smlPallet,total,totalPallet}); }
    catch(e){alert(e.message);}
    finally{setSaving(false);}
  }

  const row=(label,val,setter,highlight)=>(
    <tr style={{background:highlight?(dark?'#2d2005':'#fffbeb'):(dark?'#1e2235':'#fff')}}>
      <td style={{padding:'11px 16px',color:highlight?'#d97706':txt,fontWeight:highlight?800:500,fontSize:14,width:'60%'}}>{label}</td>
      {highlight
        ? <td style={{padding:'11px 16px',fontWeight:900,fontSize:22,color:'#d97706',textAlign:'right'}}>{label.includes('PALLET')?totalPallet:total}</td>
        : <td style={{padding:'8px 12px',textAlign:'right'}}>
            <input
              value={val}
              onChange={e=>setter(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              style={{...inp,width:130,textAlign:'right',fontSize:16}}
              placeholder="0"
            />
          </td>
      }
    </tr>
  );

  return (
    <div style={{maxWidth:460}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <h2 style={{margin:0,fontSize:15,fontWeight:800,color:txt}}>Scrap Details</h2>
        <button onClick={save} disabled={saving} style={{background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:8,padding:'9px 18px',color:'#fff',fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
          {saving?'⏳ Saving':'💾 Save'}
        </button>
      </div>
      <div style={{background:card,borderRadius:12,overflow:'hidden',border:`1px solid ${bdr}`}}>
        <div style={{background:'#1F3864',padding:'10px 16px',color:'#fff',fontSize:12,fontWeight:700}}>SCRAP DETAILS — UNIT {unit==='u2'?'II':'I'}</div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <tbody>
            {row('OVER FLOW (Tons)',    overflow,   setOverflow,   false)}
            {row('REJ COMPONENTS (Tons)', rejComp,  setRejComp,    false)}
            {row('TOTAL',               '',         null,          true)}
            <tr><td colSpan={2} style={{height:6,background:dark?'#2d3748':'#e8e8e8'}}/>
            </tr>
            {row('BIG PALLET',          bigPallet,  setBigPallet,  false)}
            {row('MEDIUM PALLET',       medPallet,  setMedPallet,  false)}
            {row('SMALL PALLET',        smlPallet,  setSmlPallet,  false)}
            {row('TOTAL PALLET',        '',         null,          true)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pallets ────────────────────────────────────────────────────────────────────
function PalletForm({inp,txt,sub,bdr,card,dark,onSubmit}) {
  const empty=()=>({label:'',big:0,medium:0,small:0});
  const [sections,setSections]=useState([{label:'Overall Waiting for VMC',big:0,medium:0,small:0},{label:'CNC Dept held in Rework Area',big:0,medium:0,small:0}]);
  const [saving,setSaving]=useState(false);
  const upd=(i,k,v)=>setSections(s=>s.map((x,j)=>j===i?{...x,[k]:v}:x));
  const tot=s=>(parseInt(s.big)||0)+(parseInt(s.medium)||0)+(parseInt(s.small)||0);
  async function save(){setSaving(true);try{await onSubmit({sections:sections.map(s=>({...s,total:tot(s)}))});}catch(e){alert(e.message);}finally{setSaving(false);}}
  return (
    <div style={{maxWidth:520}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <h2 style={{margin:0,fontSize:15,fontWeight:800,color:txt}}>Pallet Details</h2>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setSections(s=>[...s,empty()])} style={{background:'#3498db',border:'none',borderRadius:8,padding:'7px 12px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Section</button>
          <button onClick={save} disabled={saving} style={{background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:8,padding:'7px 16px',color:'#fff',fontSize:12,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',minWidth:80}}>
            {saving?'⏳ Saving':'💾 Save'}
          </button>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        {sections.map((s,i)=>(
          <div key={i} style={{background:card,borderRadius:12,border:`1px solid ${bdr}`,overflow:'hidden'}}>
            <div style={{background:'#2F5496',padding:'8px 14px'}}>
              <input value={s.label} onChange={e=>upd(i,'label',e.target.value)} style={{background:'transparent',border:'none',outline:'none',color:'#fff',fontSize:13,fontWeight:700,fontFamily:'inherit',width:'100%'}} placeholder="Section name..."/>
            </div>
            <div style={{padding:'12px 14px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
              {['big','medium','small'].map(k=>(
                <div key={k}>
                  <div style={{fontSize:11,color:sub,marginBottom:4,textTransform:'capitalize'}}>{k} Pallets</div>
                  <input style={{...inp,textAlign:'center'}} type="number" inputMode="numeric" value={s[k]||0} onChange={e=>upd(i,k,e.target.value)}/>
                </div>
              ))}
              <div>
                <div style={{fontSize:11,color:sub,marginBottom:4}}>Total</div>
                <div style={{background:dark?'#2d2005':'#fffbeb',borderRadius:8,padding:'9px 12px',fontSize:20,fontWeight:900,color:'#d97706',textAlign:'center'}}>{tot(s)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rework — Part Name removed, only Part No + Qty + Reason ───────────────────
function ReworkForm({inp,txt,sub,bdr,card,dark,onSubmit,unit,todayData}) {
  const DEPTS = ['CNC','Fettling','PDC','Secondary','Supplier','Shot Blasting','Final / Hold'];
  const [entries,setEntries] = useState(()=>{
    // Pre-populate from today's saved data if available
    if(todayData?.departments?.length>0) {
      return DEPTS.map(dept=>{
        const saved = todayData.departments.find(d=>d.dept===dept);
        return saved && saved.rows?.length>0 ? saved : {dept,rows:[{partNo:'',daysHeld:'',qty:'',reason:''}]};
      });
    }
    return DEPTS.map(dept=>({dept,rows:[{partNo:'',daysHeld:'',qty:'',reason:''}]}));
  });
  const [saving,setSaving]=useState(false);
  const upd=(di,ri,k,v)=>setEntries(e=>e.map((d,i)=>i!==di?d:{...d,rows:d.rows.map((r,j)=>j!==ri?r:{...r,[k]:v})}));
  const addRow=di=>setEntries(e=>e.map((d,i)=>i!==di?d:{...d,rows:[...d.rows,{partNo:'',daysHeld:'',qty:'',reason:''}]}));
  const delRow=(di,ri)=>setEntries(e=>e.map((d,i)=>i!==di?d:{...d,rows:d.rows.filter((_,j)=>j!==ri)}));
  async function save(){
    setSaving(true);
    try{await onSubmit({departments:entries.map(d=>({...d,rows:d.rows.filter(r=>r.partNo||r.qty)}))});}
    catch(e){alert(e.message);}
    finally{setSaving(false);}
  }
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <h2 style={{margin:0,fontSize:15,fontWeight:800,color:txt}}>Rework Details — Department Wise</h2>
        <button onClick={save} disabled={saving} style={{background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:8,padding:'9px 18px',color:'#fff',fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
          {saving?'⏳ Saving':'💾 Save All'}
        </button>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        {entries.map((dept,di)=>{
          const color=DEPT_COLORS[dept.dept]||'#666';
          return (
            <div key={di} style={{background:card,borderRadius:12,border:`1px solid ${bdr}`,overflow:'hidden'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:color+'22',borderBottom:`2px solid ${color}`}}>
                <span style={{fontWeight:800,fontSize:13,color}}>{dept.dept} Rework</span>
                <button onClick={()=>addRow(di)} style={{background:color,border:'none',borderRadius:6,padding:'4px 10px',color:'#fff',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>+ Row</button>
              </div>
              <div style={{padding:'10px 14px'}}>
                {/* Header: Part Name | Days Held | Qty | Purpose | delete */}
                <div style={{display:'grid',gridTemplateColumns:'2fr 80px 80px 2fr 28px',gap:8,marginBottom:6,paddingBottom:4,borderBottom:`1px solid ${bdr}`}}>
                  {['Part Name','Days Held','Qty','Purpose',''].map(h=><div key={h} style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',letterSpacing:0.5}}>{h}</div>)}
                </div>
                {dept.rows.map((r,ri)=>(
                  <div key={ri} style={{display:'grid',gridTemplateColumns:'2fr 80px 80px 2fr 28px',gap:8,marginBottom:8,alignItems:'center'}}>
                    <input style={{...inp,padding:'8px 10px'}} value={r.partNo} onChange={e=>upd(di,ri,'partNo',e.target.value)} placeholder="Part name"/>
                    <input style={{...inp,padding:'8px 10px',textAlign:'center'}} type="number" inputMode="numeric" value={r.daysHeld||''} onChange={e=>upd(di,ri,'daysHeld',e.target.value)} placeholder="0"/>
                    <input style={{...inp,padding:'8px 10px',textAlign:'center'}} type="number" inputMode="numeric" value={r.qty||''} onChange={e=>upd(di,ri,'qty',e.target.value)} placeholder="0"/>
                    <input style={{...inp,padding:'8px 10px'}} value={r.reason||''} onChange={e=>upd(di,ri,'reason',e.target.value)} placeholder="Purpose / reason"/>
                    <button onClick={()=>delRow(di,ri)} style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,cursor:'pointer',color:'#dc2626',fontSize:12,height:34,width:28,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Alloy WIP ──────────────────────────────────────────────────────────────────
function AlloyWIPForm({inp,txt,sub,bdr,card,dark,onSubmit}) {
  const ALLOY_RATE_MAY2026 = 364; // ₹/KG — Standard rate May 2026
  const [vals,setVals]=useState({u1AllDept:'',u1Supplier:'',fgw:'',u2AllDept:'',u2Supplier:'',alloyRate:364});
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setVals(d=>({...d,[k]:v}));
  const overall=['u1AllDept','u1Supplier','fgw','u2AllDept','u2Supplier'].reduce((a,k)=>a+(parseFloat(vals[k])||0),0);
  async function save(){setSaving(true);try{await onSubmit({...vals,overall});}catch(e){alert(e.message);}finally{setSaving(false);}}
  const rows=[{l:'U1 ALL DEPT',k:'u1AllDept'},{l:'U1 SUPPLIER',k:'u1Supplier'},{l:'FGW',k:'fgw'},{l:'U2 ALL DEPT',k:'u2AllDept'},{l:'U2 SUPPLIER',k:'u2Supplier'}];
  return (
    <div style={{maxWidth:440}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <h2 style={{margin:0,fontSize:15,fontWeight:800,color:txt}}>Alloy WIP in KG</h2>
        <button onClick={save} disabled={saving} style={{background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:8,padding:'9px 18px',color:'#fff',fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
          {saving?'⏳ Saving':'💾 Save'}
        </button>
      </div>
      <div style={{background:card,borderRadius:12,overflow:'hidden',border:`1px solid ${bdr}`}}>
        <div style={{background:'#1F3864',padding:'10px 16px',color:'#fff',fontSize:12,fontWeight:700,display:'flex',justifyContent:'space-between'}}>
          <span>ALL DEPT WIP IN KG</span><span>{new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'})}</span>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={r.k} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                <td style={{padding:'10px 16px',color:txt,fontWeight:500}}>{r.l}</td>
                <td style={{padding:'8px 12px',textAlign:'right'}}>
                  <input style={{...inp,width:130,textAlign:'right'}} type="number" inputMode="decimal" value={vals[r.k]} onChange={e=>set(r.k,e.target.value)}/>
                </td>
              </tr>
            ))}
            <tr style={{background:dark?'#2d2005':'#fffbeb'}}>
              <td style={{padding:'10px 16px',color:'#d97706',fontWeight:800}}>OVER ALL</td>
              <td style={{padding:'10px 16px',textAlign:'right',color:'#d97706',fontWeight:900,fontSize:20}}>{overall.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── FG Supermarket ─────────────────────────────────────────────────────────────
function FGSuperForm({inp,txt,sub,bdr,card,dark,onSubmit}) {
  const empty=()=>({warehouse:'FGW',itemCode:'',description:'',stock:'',inKg:''});
  const [rows,setRows]=useState([empty()]);
  const [saving,setSaving]=useState(false);
  const upd=(i,k,v)=>setRows(r=>r.map((x,j)=>j===i?{...x,[k]:v}:x));
  const totalKg=rows.reduce((a,r)=>a+(parseFloat(r.inKg)||0),0);
  async function save(){setSaving(true);try{await onSubmit({rows,totalKg});}catch(e){alert(e.message);}finally{setSaving(false);}}
  const hd={background:'#1F3864',color:'#fff',padding:'7px 8px',fontSize:10,fontWeight:700,textAlign:'center',border:'1px solid #2d4a8a'};
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <h2 style={{margin:0,fontSize:15,fontWeight:800,color:txt}}>FG Supermarket Details</h2>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setRows(r=>[...r,empty()])} style={{background:'#3498db',border:'none',borderRadius:8,padding:'7px 12px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Row</button>
          <button onClick={save} disabled={saving} style={{background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:8,padding:'7px 16px',color:'#fff',fontSize:12,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',minWidth:80}}>
            {saving?'⏳ Saving':'💾 Save'}
          </button>
        </div>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',fontSize:12,background:card,width:'100%'}}>
          <thead><tr>{['Warehouse','Item Code','Description','Stock','In KG',''].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                {[['warehouse',70],['itemCode',110],['description',200],['stock',75],['inKg',75]].map(([k,w])=>(
                  <td key={k} style={{padding:'3px 4px',border:`1px solid ${bdr}`}}>
                    <input value={r[k]} onChange={e=>upd(i,k,e.target.value)} style={{...inp,padding:'5px 8px',width:w,textAlign:k==='stock'||k==='inKg'?'right':'left'}}
                      type={k==='stock'||k==='inKg'?'number':'text'} inputMode={k==='stock'||k==='inKg'?'decimal':undefined}/>
                  </td>
                ))}
                <td style={{padding:'3px 4px',border:`1px solid ${bdr}`}}>
                  <button onClick={()=>setRows(r=>r.filter((_,j)=>j!==i))} style={{background:'#fef2f2',border:'none',borderRadius:4,padding:'4px 7px',color:'#dc2626',cursor:'pointer',fontSize:10}}>✕</button>
                </td>
              </tr>
            ))}
            <tr style={{background:dark?'#2d2005':'#fffbeb'}}>
              <td colSpan={4} style={{padding:'9px 12px',fontWeight:800,color:'#d97706',textAlign:'right',border:`1px solid ${bdr}`}}>TOTAL KG</td>
              <td style={{padding:'9px 12px',fontWeight:900,color:'#d97706',fontSize:16,textAlign:'right',border:`1px solid ${bdr}`}}>{totalKg.toFixed(3)}</td>
              <td style={{border:`1px solid ${bdr}`}}/>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── View History — human-readable, not JSON ────────────────────────────────────
function ViewHistory({section,colName,dark,card,txt,sub,bdr}) {
  const [records,setRecords]=useState([]);
  const [expanded,setExpanded]=useState(null);
  const [editRecord,setEditRecord]=useState(null);
  useEffect(()=>{
    const q=query(collection(db,colName(section)),orderBy('submittedAt','desc'),limit(10));
    return onSnapshot(q,snap=>setRecords(snap.docs.map(d=>({id:d.id,...d.data()}))));
  },[section]);

  function renderData(r) {
    switch(section) {
      case 'pdc_running': return <PDCHistory data={r} txt={txt} sub={sub} bdr={bdr} dark={dark}/>;
      case 'scrap':       return <ScrapHistory data={r} txt={txt} sub={sub} bdr={bdr} dark={dark}/>;
      case 'pallets':     return <PalletHistory data={r} txt={txt} sub={sub} bdr={bdr} dark={dark}/>;
      case 'rework':      return <ReworkHistory data={r} txt={txt} sub={sub} bdr={bdr} dark={dark}/>;
      case 'alloy_wip':   return <AlloyHistory data={r} txt={txt} sub={sub} bdr={bdr} dark={dark}/>;
      case 'fg_super':    return <FGHistory data={r} txt={txt} sub={sub} bdr={bdr} dark={dark}/>;
      default:            return null;
    }
  }

  return (
    <div>
      <h2 style={{margin:'0 0 14px',fontSize:15,fontWeight:800,color:txt}}>
        History — {section.replace(/_/g,' ').toUpperCase()}
        <span style={{fontSize:11,color:sub,fontWeight:400,marginLeft:8}}>Last 10 submissions</span>
      </h2>
      {records.length===0
        ? <div style={{padding:'40px',textAlign:'center',color:sub}}>No submissions yet.</div>
        : records.map(r=>(
          <div key={r.id} style={{background:card,borderRadius:10,border:`1px solid ${bdr}`,marginBottom:10,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',background:dark?'#1e2235':'#f8f9fc'}}>
              <div style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',flex:1}} onClick={()=>setExpanded(e=>e===r.id?null:r.id)}>
                <span style={{fontWeight:800,color:txt,fontSize:14}}>{r.date||'—'}</span>
                <span style={{fontSize:12,color:sub}}>By {r.submittedBy}</span>
                {r.date===new Date().toISOString().slice(0,10)&&<span style={{background:'#f0fdf4',color:'#16a34a',fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:20}}>Today</span>}
              </div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <span style={{color:'#f97316',fontSize:14,cursor:'pointer'}} onClick={()=>setExpanded(e=>e===r.id?null:r.id)}>{expanded===r.id?'▲':'▼'}</span>
                <button onClick={()=>setEditRecord(r)}
                  style={{background:'#1e40af',border:'none',borderRadius:6,padding:'6px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                  ✎ Edit
                </button>
                <button onClick={async()=>{
                  if(!window.confirm('Delete this entry? This cannot be undone.')) return;
                  try { await deleteDoc(doc(db,colName(section),r.id)); }
                  catch(e){alert('Delete failed: '+e.message);}
                }} style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:6,padding:'6px 14px',color:'#dc2626',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                  🗑 Delete
                </button>
              </div>
            </div>
            {expanded===r.id&&(
              <div style={{padding:'14px 16px',borderTop:`1px solid ${bdr}`}}>{renderData(r)}</div>
            )}
          </div>
        ))
      }
      {editRecord && <ERPEditModal record={editRecord} section={section} colName={colName} onClose={()=>setEditRecord(null)} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>}
    </div>
  );
}

// History renderers — human readable
function PDCHistory({data,txt,sub,bdr,dark}) {
  if(!data.rows?.length) return <div style={{color:sub,fontSize:12}}>No rows</div>;
  const hd={background:'#1F3864',color:'#fff',padding:'6px 10px',fontSize:10,fontWeight:700,textAlign:'center'};
  return (
    <div style={{overflowX:'auto'}}>
      <table style={{borderCollapse:'collapse',fontSize:12,width:'100%'}}>
        <thead><tr>{['M/C','Part','Sche','Dispatched','Balance','Per Day','WIP Coverage','WIP Qty'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
        <tbody>{data.rows.map((r,i)=>{
          const bal=(parseInt(r.scheQty)||0)-(parseInt(r.dispatched)||0);
          const cov=r.perDay>0?((parseInt(r.wipQty)||0)/parseInt(r.perDay)).toFixed(1):'—';
          const cc=parseFloat(cov)<2?'#dc2626':parseFloat(cov)<3.5?'#d97706':'#16a34a';
          return <tr key={i} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
            {[r.mc,r.part,r.scheQty,r.dispatched,bal,r.perDay].map((v,j)=><td key={j} style={{padding:'7px 10px',textAlign:'center',color:txt,border:`1px solid ${bdr}`}}>{v}</td>)}
            <td style={{padding:'7px 10px',textAlign:'center',fontWeight:800,color:cc,border:`1px solid ${bdr}`}}>{cov}d</td>
            <td style={{padding:'7px 10px',textAlign:'center',color:txt,border:`1px solid ${bdr}`}}>{r.wipQty}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}

function ScrapHistory({data,txt,sub,bdr,dark}) {
  const items=[['OVERFLOW',data.overflow],['REJ COMPONENTS',data.rejComponents],['TOTAL',data.total,true],['BIG PALLET',data.bigPallet],['MEDIUM PALLET',data.mediumPallet],['SMALL PALLET',data.smallPallet],['TOTAL PALLET',data.totalPallet,true]];
  return <table style={{borderCollapse:'collapse',fontSize:13,width:'100%',maxWidth:380}}><tbody>{items.map(([l,v,h])=>(
    <tr key={l} style={{background:h?(dark?'#2d2005':'#fffbeb'):(dark?'#1e2235':'#fff')}}>
      <td style={{padding:'9px 14px',color:h?'#d97706':sub,fontWeight:h?800:500,border:`1px solid ${bdr}`}}>{l}</td>
      <td style={{padding:'9px 14px',fontWeight:h?900:700,color:h?'#d97706':txt,textAlign:'right',fontSize:h?18:14,border:`1px solid ${bdr}`}}>{v||0}</td>
    </tr>
  ))}</tbody></table>;
}

function PalletHistory({data,txt,sub,bdr,dark}) {
  if(!data.sections?.length) return <div style={{color:sub,fontSize:12}}>No data</div>;
  return <div style={{display:'flex',flexDirection:'column',gap:8}}>{data.sections.map((s,i)=>(
    <div key={i} style={{background:dark?'#1a1e30':'#f8f9fc',borderRadius:8,padding:'10px 14px',border:`1px solid ${bdr}`}}>
      <div style={{fontWeight:700,color:txt,marginBottom:6}}>{s.label}</div>
      <div style={{display:'flex',gap:16,fontSize:13}}>
        {['big','medium','small'].map(k=><span key={k} style={{color:sub}}><strong style={{color:txt}}>{s[k]||0}</strong> {k}</span>)}
        <span style={{color:'#d97706',fontWeight:800}}>Total: {s.total||0}</span>
      </div>
    </div>
  ))}</div>;
}

function ReworkHistory({data,txt,sub,bdr,dark}) {
  if(!data.departments?.length) return <div style={{color:sub,fontSize:12}}>No data</div>;
  return <div style={{display:'flex',flexDirection:'column',gap:10}}>{data.departments.filter(d=>d.rows?.some(r=>r.partNo)).map((dept,di)=>{
    const color=DEPT_COLORS[dept.dept]||'#666';
    const total=dept.rows?.reduce((a,r)=>a+(parseInt(r.qty)||0),0)||0;
    return (
      <div key={di} style={{border:`1px solid ${color}44`,borderRadius:8,overflow:'hidden'}}>
        <div style={{background:color+'22',padding:'7px 12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:800,color,fontSize:12}}>{dept.dept}</span>
          <span style={{background:color,color:'#fff',borderRadius:20,padding:'1px 10px',fontSize:11,fontWeight:700}}>{total.toLocaleString()} pcs</span>
        </div>
        <div style={{padding:'8px 12px'}}>
          {dept.rows?.filter(r=>r.partNo).map((r,ri)=>(
            <div key={ri} style={{display:'flex',gap:10,padding:'4px 0',borderBottom:`1px solid ${bdr}`,fontSize:12}}>
              <span style={{fontWeight:700,color,flex:'0 0 100px'}}>{r.partNo}</span>
              <span style={{fontWeight:800,color:txt,flex:'0 0 60px',textAlign:'right'}}>{parseInt(r.qty||0).toLocaleString()}</span>
              <span style={{color:'#ef4444',flex:1}}>{r.reason}</span>
            </div>
          ))}
        </div>
      </div>
    );
  })}</div>;
}

function AlloyHistory({data,txt,sub,bdr,dark}) {
  const rows=[['U1 ALL DEPT','u1AllDept'],['U1 SUPPLIER','u1Supplier'],['FGW','fgw'],['U2 ALL DEPT','u2AllDept'],['U2 SUPPLIER','u2Supplier'],['OVER ALL','overall',true]];
  return <table style={{borderCollapse:'collapse',fontSize:13,width:'100%',maxWidth:380}}><tbody>{rows.map(([l,k,h])=>(
    <tr key={k} style={{background:h?(dark?'#2d2005':'#fffbeb'):(dark?'#1e2235':'#fff')}}>
      <td style={{padding:'9px 14px',color:h?'#d97706':sub,fontWeight:h?800:500,border:`1px solid ${bdr}`}}>{l}</td>
      <td style={{padding:'9px 14px',fontWeight:h?900:700,color:h?'#d97706':txt,textAlign:'right',fontSize:h?18:14,border:`1px solid ${bdr}`}}>{data[k]||0} KG</td>
    </tr>
  ))}</tbody></table>;
}

function FGHistory({data,txt,sub,bdr,dark}) {
  if(!data.rows?.length) return <div style={{color:sub,fontSize:12}}>No data</div>;
  const hd={background:'#1F3864',color:'#fff',padding:'6px 10px',fontSize:10,fontWeight:700};
  return (
    <div style={{overflowX:'auto'}}>
      <table style={{borderCollapse:'collapse',fontSize:12,width:'100%'}}>
        <thead><tr>{['Warehouse','Item Code','Description','Stock','In KG'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
        <tbody>
          {data.rows.map((r,i)=>(
            <tr key={i} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
              <td style={{padding:'7px 10px',color:sub,border:`1px solid ${bdr}`}}>{r.warehouse}</td>
              <td style={{padding:'7px 10px',fontWeight:600,color:txt,border:`1px solid ${bdr}`}}>{r.itemCode}</td>
              <td style={{padding:'7px 10px',color:txt,border:`1px solid ${bdr}`}}>{r.description}</td>
              <td style={{padding:'7px 10px',textAlign:'right',color:txt,border:`1px solid ${bdr}`}}>{parseInt(r.stock||0).toLocaleString()}</td>
              <td style={{padding:'7px 10px',textAlign:'right',fontWeight:700,color:'#16a34a',border:`1px solid ${bdr}`}}>{parseFloat(r.inKg||0).toFixed(3)}</td>
            </tr>
          ))}
          <tr style={{background:dark?'#2d2005':'#fffbeb'}}>
            <td colSpan={4} style={{padding:'9px 12px',fontWeight:800,color:'#d97706',textAlign:'right',border:`1px solid ${bdr}`}}>TOTAL KG</td>
            <td style={{padding:'9px 12px',fontWeight:900,color:'#d97706',fontSize:16,textAlign:'right',border:`1px solid ${bdr}`}}>{parseFloat(data.totalKg||0).toFixed(3)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Furnace Life Monitoring ────────────────────────────────────────────────────
const MACHINES = [
  // 7 × 125 ton
  {id:'M125-01',name:'125-01',tonnage:125},{id:'M125-02',name:'125-02',tonnage:125},
  {id:'M125-03',name:'125-03',tonnage:125},{id:'M125-04',name:'125-04',tonnage:125},
  {id:'M125-05',name:'125-05',tonnage:125},{id:'M125-06',name:'125-06',tonnage:125},
  {id:'M125-07',name:'125-07',tonnage:125},
  // 1 × 250 ton
  {id:'M250-01',name:'250-01',tonnage:250},
  // 4 × 350 ton
  {id:'M350-01',name:'350-01',tonnage:350},{id:'M350-02',name:'350-02',tonnage:350},
  {id:'M350-03',name:'350-03',tonnage:350},{id:'M350-04',name:'350-04',tonnage:350},
];
const LIFE_MONTHS = 6;

function monthsElapsed(installDate) {
  if (!installDate) return null;
  const d = new Date(installDate);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) + (now.getDate() >= d.getDate() ? 0 : -1);
}
function dueDate(installDate) {
  if (!installDate) return null;
  const d = new Date(installDate);
  d.setMonth(d.getMonth() + LIFE_MONTHS);
  return d.toISOString().slice(0,10);
}
function daysUntilDue(installDate) {
  const due = dueDate(installDate);
  if (!due) return null;
  return Math.ceil((new Date(due) - new Date()) / 86400000);
}

export function FurnaceMonitor({ dark, unit, userProfile }) {
  const isOwner = userProfile?.role === 'owner';
  const colName = `furnace_life_${unit==='u2'?'u2':'u1'}`;

  const emptyMachines = () => MACHINES.map(m => ({
    ...m, installDate:'', spareReady:false, spareNotes:'', lastUpdatedBy:''
  }));

  const [machines, setMachines] = useState(emptyMachines());
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const bg   = dark?'#0f111a':'#f4f6fb';
  const card = dark?'#1e2235':'#fff';
  const txt  = dark?'#e2e8f0':'#1a1a2e';
  const sub  = dark?'#94a3b8':'#888';
  const bdr  = dark?'#2d3748':'#e8e8e8';
  const inp  = {border:`1.5px solid ${bdr}`,borderRadius:8,padding:'8px 10px',fontSize:12,outline:'none',fontFamily:'inherit',background:dark?'#151929':'#fff',color:txt,width:'100%',boxSizing:'border-box'};

  useEffect(()=>{
    import('firebase/firestore').then(({collection,query,orderBy,limit,onSnapshot})=>{
      import('../firebase').then(({db})=>{
        const q = query(collection(db,colName),orderBy('submittedAt','desc'),limit(5));
        onSnapshot(q, snap => {
          if(snap.docs.length>0){
            const d=snap.docs[0].data();
            setLastSaved(d.submittedBy+' on '+d.date);
            if(d.machines) setMachines(d.machines);
          }
        });
      });
    });
  },[]);

  const upd=(id,k,v)=>setMachines(m=>m.map(x=>x.id===id?{...x,[k]:v}:x));

  async function save(){
    setSaving(true);
    try{
      const {collection,addDoc,serverTimestamp}=await import('firebase/firestore');
      const {db}=await import('../firebase');
      await addDoc(collection(db,colName),{
        machines:machines.map(m=>({...m,lastUpdatedBy:userProfile?.name})),
        submittedBy:userProfile?.name,
        submittedAt:serverTimestamp(),
        date:new Date().toISOString().slice(0,10)
      });
    }catch(e){alert(e.message);}
    finally{setSaving(false);}
  }

  const statusOf = m => {
    const days = daysUntilDue(m.installDate);
    if (days === null) return {color:'#666', label:'No date set', bg:'#f0f0f0'};
    if (days < 0)      return {color:'#dc2626', label:`⚠️ OVERDUE by ${Math.abs(days)}d`, bg:'#fef2f2'};
    if (days <= 30)    return {color:'#d97706', label:`🟡 Due in ${days}d`, bg:'#fffbeb'};
    return {color:'#16a34a', label:`🟢 ${days}d remaining`, bg:'#f0fdf4'};
  };

  const groups = [
    {label:'125 Ton Machines (×7)', ids:MACHINES.filter(m=>m.tonnage===125).map(m=>m.id)},
    {label:'250 Ton Machine (×1)',  ids:MACHINES.filter(m=>m.tonnage===250).map(m=>m.id)},
    {label:'350 Ton Machines (×4)', ids:MACHINES.filter(m=>m.tonnage===350).map(m=>m.id)},
  ];

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <h2 style={{margin:0,fontSize:15,fontWeight:800,color:txt}}>🔥 Furnace / Crucible Life Monitoring</h2>
          <div style={{fontSize:11,color:sub,marginTop:2}}>Standard life: {LIFE_MONTHS} months · 12 machines · {lastSaved?`Last saved by ${lastSaved}`:''}</div>
        </div>
        {!isOwner&&(
          <button onClick={save} disabled={saving}
            style={{background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:8,padding:'9px 18px',color:'#fff',fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
            {saving?'⏳ Saving':'💾 Save'}
          </button>
        )}
      </div>

      {groups.map(g=>(
        <div key={g.label} style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:800,color:'#f97316',marginBottom:10,borderBottom:`1px solid ${bdr}`,paddingBottom:6}}>{g.label}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
            {machines.filter(m=>g.ids.includes(m.id)).map(m=>{
              const st = statusOf(m);
              const elapsed = monthsElapsed(m.installDate);
              const due = dueDate(m.installDate);
              const pct = elapsed!==null ? Math.min(100,Math.round(elapsed/LIFE_MONTHS*100)) : 0;
              return (
                <div key={m.id} style={{background:card,borderRadius:12,border:`2px solid ${st.color}44`,overflow:'hidden'}}>
                  <div style={{background:st.bg,borderBottom:`2px solid ${st.color}`,padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontWeight:900,color:st.color,fontSize:15}}>{m.name}</span>
                    <span style={{fontSize:11,color:st.color,fontWeight:700}}>{st.label}</span>
                  </div>
                  <div style={{padding:'12px 14px'}}>
                    {/* Installation date */}
                    <div style={{marginBottom:8}}>
                      <div style={{fontSize:10,color:sub,marginBottom:4}}>Crucible Installation Date</div>
                      {isOwner
                        ? <div style={{fontWeight:700,color:txt,fontSize:13}}>{m.installDate||'Not set'}</div>
                        : <input style={inp} type="date" value={m.installDate||''} onChange={e=>upd(m.id,'installDate',e.target.value)}/>
                      }
                    </div>
                    {/* Due date and elapsed */}
                    {m.installDate&&(
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                        <div style={{background:dark?'#151929':'#f8f9fc',borderRadius:8,padding:'7px 10px',textAlign:'center'}}>
                          <div style={{fontSize:16,fontWeight:800,color:elapsed>=6?'#dc2626':txt}}>{elapsed}mo</div>
                          <div style={{fontSize:9,color:sub}}>Months Elapsed</div>
                        </div>
                        <div style={{background:dark?'#151929':'#f8f9fc',borderRadius:8,padding:'7px 10px',textAlign:'center'}}>
                          <div style={{fontSize:12,fontWeight:700,color:st.color}}>{due}</div>
                          <div style={{fontSize:9,color:sub}}>Due Date</div>
                        </div>
                      </div>
                    )}
                    {/* Life bar */}
                    {m.installDate&&(
                      <div style={{marginBottom:10}}>
                        <div style={{height:8,background:dark?'#2d3748':'#e8e8e8',borderRadius:6,overflow:'hidden'}}>
                          <div style={{height:'100%',borderRadius:6,background:pct>=100?'#dc2626':pct>=80?'#f59e0b':'#16a34a',width:`${pct}%`,transition:'width 0.5s'}}/>
                        </div>
                        <div style={{fontSize:10,color:sub,marginTop:3}}>{pct}% of {LIFE_MONTHS}-month life used</div>
                      </div>
                    )}
                    {/* Spare crucible */}
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderTop:`1px solid ${bdr}`}}>
                      <span style={{fontSize:11,color:sub}}>Spare Crucible Ready</span>
                      {isOwner
                        ? <span style={{fontWeight:700,color:m.spareReady?'#16a34a':'#ef4444',fontSize:12}}>{m.spareReady?'✓ Yes':'✗ No'}</span>
                        : <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                            <input type="checkbox" checked={!!m.spareReady} onChange={e=>upd(m.id,'spareReady',e.target.checked)} style={{width:16,height:16,cursor:'pointer'}}/>
                            <span style={{fontSize:12,color:m.spareReady?'#16a34a':'#ef4444',fontWeight:700}}>{m.spareReady?'Yes':'No'}</span>
                          </label>
                      }
                    </div>
                    {!isOwner&&(
                      <input style={{...inp,marginTop:6,fontSize:11}} value={m.spareNotes||''} onChange={e=>upd(m.id,'spareNotes',e.target.value)} placeholder="Spare notes..."/>
                    )}
                    {isOwner&&m.spareNotes&&<div style={{fontSize:11,color:sub,marginTop:4,fontStyle:'italic'}}>📝 {m.spareNotes}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ERP Edit Modal — pre-fills form with existing record data ─────────────────
function ERPEditModal({record, section, colName, onClose, dark, card, txt, sub, bdr}) {
  const [saving, setSaving] = useState(false);

  // PDC Running
  const [pdcRows, setPdcRows] = useState(record.rows||[]);
  const updPdc = (i,k,v) => setPdcRows(r=>r.map((x,j)=>j===i?{...x,[k]:v}:x));
  const bal = r => (parseInt(r.scheQty)||0)-(parseInt(r.dispatched)||0);
  const cov = r => { const w=parseInt(r.wipQty)||0,p=parseInt(r.perDay)||0; return p>0?(w/p).toFixed(1):'—'; };

  // Scrap
  const [scrapVals, setScrapVals] = useState({
    overflow: record.overflow||'', rejComp: record.rejComponents||'',
    bigPallet: record.bigPallet||'', medPallet: record.mediumPallet||'', smlPallet: record.smallPallet||''
  });
  const setSV = (k,v) => setScrapVals(s=>({...s,[k]:v}));

  // Pallets
  const [palletVals, setPalletVals] = useState({
    dayShift: record.dayShift||'', nightShift: record.nightShift||'',
    shop: record.shop||'', supplier: record.supplier||''
  });
  const setPV = (k,v) => setPalletVals(p=>({...p,[k]:v}));

  // Rework
  const [reworkDepts, setReworkDepts] = useState(record.depts||[]);
  const updRework = (di,ri,k,v) => setReworkDepts(d=>d.map((dept,i)=>i===di?{...dept,rows:dept.rows.map((r,j)=>j===ri?{...r,[k]:v}:r)}:dept));

  // Alloy WIP
  const [alloyVals, setAlloyVals] = useState({
    u1AllDept: record.u1AllDept||'', u1Supplier: record.u1Supplier||'',
    fgw: record.fgw||'', u2AllDept: record.u2AllDept||'', u2Supplier: record.u2Supplier||'',
    alloyRate: record.alloyRate||364
  });
  const setAV = (k,v) => setAlloyVals(a=>({...a,[k]:v}));

  // FG Super
  const [fgRows, setFgRows] = useState(record.rows||[]);
  const updFg = (i,k,v) => setFgRows(r=>r.map((x,j)=>j===i?{...x,[k]:v}:x));

  const inp = {border:`1px solid ${dark?'#2d3748':'#d1d5db'}`,borderRadius:7,padding:'7px 10px',fontSize:12,outline:'none',
    fontFamily:'inherit',background:dark?'#1e2235':'#fff',color:dark?'#e2e8f0':'#111'};

  async function save() {
    setSaving(true);
    try {
      let data = {};
      if(section==='pdc_running') {
        data = {rows: pdcRows.filter(r=>r.mc||r.part)};
      } else if(section==='scrap') {
        const total = (parseInt(scrapVals.overflow)||0)+(parseInt(scrapVals.rejComp)||0);
        const totalPallet = (parseInt(scrapVals.bigPallet)||0)+(parseInt(scrapVals.medPallet)||0)+(parseInt(scrapVals.smlPallet)||0);
        data = {overflow:scrapVals.overflow, rejComponents:scrapVals.rejComp, bigPallet:scrapVals.bigPallet,
          mediumPallet:scrapVals.medPallet, smallPallet:scrapVals.smlPallet, total, totalPallet};
      } else if(section==='pallets') {
        const total=(parseInt(palletVals.dayShift)||0)+(parseInt(palletVals.nightShift)||0)+(parseInt(palletVals.shop)||0)+(parseInt(palletVals.supplier)||0);
        data = {...palletVals, total};
      } else if(section==='rework') {
        data = {depts: reworkDepts};
      } else if(section==='alloy_wip') {
        const overall=['u1AllDept','u1Supplier','fgw','u2AllDept','u2Supplier'].reduce((a,k)=>a+(parseFloat(alloyVals[k])||0),0);
        data = {...alloyVals, overall};
      } else if(section==='fg_super') {
        const totalKg=fgRows.reduce((a,r)=>a+(parseFloat(r.inKg)||0),0);
        data = {rows:fgRows, totalKg};
      }
      await updateDoc(doc(db, colName(section), record.id), {
        ...data, editedAt: serverTimestamp(), editedBy: 'Gokila'
      });
      onClose();
    } catch(e){ alert('Save failed: '+e.message); }
    finally { setSaving(false); }
  }

  const hd = {background:'#1F3864',color:'#fff',padding:'7px 8px',fontSize:10,fontWeight:700,textAlign:'center',border:'1px solid #2d4a8a'};
  const td = {padding:'3px 4px',border:`1px solid ${bdr}`,textAlign:'center'};

  const title = {pdc_running:'PDC Running', scrap:'Scrap Details', pallets:'Pallet Details',
    rework:'Rework', alloy_wip:'Alloy WIP', fg_super:'FG Supermarket'}[section]||section;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:12,overflowY:'auto'}}>
      <div style={{background:dark?'#1e2235':'#fff',borderRadius:16,width:'100%',maxWidth:860,maxHeight:'95vh',overflowY:'auto',boxShadow:'0 25px 60px rgba(0,0,0,0.4)'}}>
        {/* Header */}
        <div style={{background:'#1F3864',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:1}}>
          <div style={{color:'#fff',fontWeight:800,fontSize:15}}>✎ Edit — {title} · {record.date}</div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:8,padding:'7px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
            <button onClick={save} disabled={saving} style={{background:'#22c55e',border:'none',borderRadius:8,padding:'7px 18px',color:'#fff',fontSize:12,fontWeight:800,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
              {saving?'⏳ Saving…':'✅ Save Changes'}
            </button>
          </div>
        </div>

        <div style={{padding:20}}>
          {/* PDC Running */}
          {section==='pdc_running' && (
            <div style={{overflowX:'auto'}}>
              <table style={{borderCollapse:'collapse',fontSize:11,width:'100%'}}>
                <thead>
                  <tr>{['S.No','M/C No','Running Parts','Sche Qty','Dispatched','Balance','Per Day','WIP Coverage','WIP Qty',''].map(h=><th key={h} style={hd}>{h}</th>)}</tr>
                </thead>
                <tbody>{pdcRows.map((r,i)=>{
                  const b=bal(r),c=cov(r);
                  return (
                    <tr key={i} style={{background:i%2===0?(dark?'#151929':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                      <td style={{...td,color:sub,width:30}}>{i+1}</td>
                      <td style={td}><input value={r.mc||''} onChange={e=>updPdc(i,'mc',e.target.value)} style={{...inp,padding:'5px 7px',width:72,textAlign:'center'}}/></td>
                      <td style={td}><input value={r.part||''} onChange={e=>updPdc(i,'part',e.target.value)} style={{...inp,padding:'5px 7px',width:90}}/></td>
                      <td style={td}><input value={r.scheQty||''} onChange={e=>updPdc(i,'scheQty',e.target.value)} style={{...inp,padding:'5px 7px',width:68,textAlign:'right'}} type="number"/></td>
                      <td style={td}><input value={r.dispatched||''} onChange={e=>updPdc(i,'dispatched',e.target.value)} style={{...inp,padding:'5px 7px',width:68,textAlign:'right'}} type="number"/></td>
                      <td style={{...td,fontWeight:800,color:'#f97316'}}>{b}</td>
                      <td style={td}><input value={r.perDay||''} onChange={e=>updPdc(i,'perDay',e.target.value)} style={{...inp,padding:'5px 7px',width:60,textAlign:'right'}} type="number"/></td>
                      <td style={{...td,fontWeight:800,color:'#16a34a'}}>{c}</td>
                      <td style={td}><input value={r.wipQty||''} onChange={e=>updPdc(i,'wipQty',e.target.value)} style={{...inp,padding:'5px 7px',width:68,textAlign:'right'}} type="number"/></td>
                      <td style={td}><button onClick={()=>setPdcRows(r=>r.filter((_,j)=>j!==i))} style={{background:'#fef2f2',border:'none',borderRadius:4,padding:'3px 7px',color:'#dc2626',cursor:'pointer'}}>✕</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <button onClick={()=>setPdcRows(r=>[...r,{mc:'',part:'',scheQty:'',dispatched:'',perDay:'',wipQty:''}])}
                style={{marginTop:8,padding:'6px 14px',borderRadius:8,border:'1.5px dashed #93c5fd',background:'#eff6ff',color:'#1e40af',fontWeight:700,fontSize:12,cursor:'pointer'}}>+ Row</button>
            </div>
          )}

          {/* Scrap */}
          {section==='scrap' && (
            <div style={{maxWidth:440}}>
              {[['OVER FLOW (Tons)','overflow'],['REJ COMPONENTS (Tons)','rejComp'],
                ['BIG PALLET (Tons)','bigPallet'],['MEDIUM PALLET (Tons)','medPallet'],['SMALL PALLET (Tons)','smlPallet']].map(([lbl,k])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:`1px solid ${bdr}`}}>
                  <span style={{color:txt,fontWeight:500}}>{lbl}</span>
                  <input type="number" value={scrapVals[k]} onChange={e=>setSV(k,e.target.value)}
                    style={{...inp,width:130,textAlign:'right'}} placeholder="0"/>
                </div>
              ))}
            </div>
          )}

          {/* Pallets */}
          {section==='pallets' && (
            <div style={{maxWidth:440}}>
              {[['Day Shift','dayShift'],['Night Shift','nightShift'],['Shop Floor','shop'],['Supplier','supplier']].map(([lbl,k])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:`1px solid ${bdr}`}}>
                  <span style={{color:txt,fontWeight:500}}>{lbl}</span>
                  <input type="number" value={palletVals[k]} onChange={e=>setPV(k,e.target.value)}
                    style={{...inp,width:130,textAlign:'right'}} placeholder="0"/>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',fontWeight:800,color:'#d97706'}}>
                <span>TOTAL</span>
                <span>{['dayShift','nightShift','shop','supplier'].reduce((a,k)=>a+(parseInt(palletVals[k])||0),0)}</span>
              </div>
            </div>
          )}

          {/* Rework */}
          {section==='rework' && (
            <div>
              {reworkDepts.map((dept,di)=>(
                <div key={di} style={{background:dark?'#151929':'#f9fafb',borderRadius:10,padding:14,marginBottom:12,border:`1px solid ${bdr}`}}>
                  <div style={{fontWeight:800,color:txt,marginBottom:10}}>{dept.name}</div>
                  {dept.rows?.map((r,ri)=>(
                    <div key={ri} style={{display:'grid',gridTemplateColumns:'2fr 80px 80px 2fr',gap:8,marginBottom:6}}>
                      <input style={inp} value={r.partNo||''} onChange={e=>updRework(di,ri,'partNo',e.target.value)} placeholder="Part"/>
                      <input style={{...inp,textAlign:'center'}} type="number" value={r.daysHeld||''} onChange={e=>updRework(di,ri,'daysHeld',e.target.value)} placeholder="Days"/>
                      <input style={{...inp,textAlign:'center'}} type="number" value={r.qty||''} onChange={e=>updRework(di,ri,'qty',e.target.value)} placeholder="Qty"/>
                      <input style={inp} value={r.reason||''} onChange={e=>updRework(di,ri,'reason',e.target.value)} placeholder="Reason"/>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Alloy WIP */}
          {section==='alloy_wip' && (
            <div style={{maxWidth:440}}>
              {[['U1 ALL DEPT','u1AllDept'],['U1 SUPPLIER','u1Supplier'],['FGW','fgw'],
                ['U2 ALL DEPT','u2AllDept'],['U2 SUPPLIER','u2Supplier'],['Alloy Rate (₹/KG)','alloyRate']].map(([lbl,k])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:`1px solid ${bdr}`}}>
                  <span style={{color:txt,fontWeight:500}}>{lbl}</span>
                  <input type="number" value={alloyVals[k]} onChange={e=>setAV(k,e.target.value)}
                    style={{...inp,width:130,textAlign:'right'}} placeholder="0"/>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',fontWeight:800,color:'#d97706'}}>
                <span>OVERALL</span>
                <span>{['u1AllDept','u1Supplier','fgw','u2AllDept','u2Supplier'].reduce((a,k)=>a+(parseFloat(alloyVals[k])||0),0).toFixed(1)}</span>
              </div>
            </div>
          )}

          {/* FG Supermarket */}
          {section==='fg_super' && (
            <div style={{overflowX:'auto'}}>
              <table style={{borderCollapse:'collapse',fontSize:12,width:'100%'}}>
                <thead><tr>{['Warehouse','Item Code','Description','Stock','In KG',''].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
                <tbody>
                  {fgRows.map((r,i)=>(
                    <tr key={i} style={{background:i%2===0?(dark?'#151929':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                      {[['warehouse',70],['itemCode',110],['description',200],['stock',75],['inKg',75]].map(([k,w])=>(
                        <td key={k} style={{padding:'3px 4px',border:`1px solid ${bdr}`}}>
                          <input value={r[k]||''} onChange={e=>updFg(i,k,e.target.value)} style={{...inp,padding:'5px 8px',width:w,textAlign:k==='stock'||k==='inKg'?'right':'left'}}
                            type={k==='stock'||k==='inKg'?'number':'text'}/>
                        </td>
                      ))}
                      <td style={{padding:'3px 4px',border:`1px solid ${bdr}`}}>
                        <button onClick={()=>setFgRows(r=>r.filter((_,j)=>j!==i))} style={{background:'#fef2f2',border:'none',borderRadius:4,padding:'4px 7px',color:'#dc2626',cursor:'pointer',fontSize:10}}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={()=>setFgRows(r=>[...r,{warehouse:'FGW',itemCode:'',description:'',stock:'',inKg:''}])}
                style={{marginTop:8,padding:'6px 14px',borderRadius:8,border:'1.5px dashed #93c5fd',background:'#eff6ff',color:'#1e40af',fontWeight:700,fontSize:12,cursor:'pointer'}}>+ Row</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
