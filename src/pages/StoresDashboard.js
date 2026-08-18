import React, { useState, useEffect } from 'react';
function LastUpdatedBadge({at, by, light}) {
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
  const dateStr = ts ? ts.toLocaleDateString('en-IN',{year:'numeric',month:'2-digit',day:'2-digit'}).split('/').reverse().join('-') : null;
  const timeStr = ts ? ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : null;
  return (
    <div style={{fontSize:11,color:light?'rgba(255,255,255,0.65)':'#94a3b8',marginTop:2}}>
      Last updated:{dateStr&&<> <span style={{color:'#f97316',fontWeight:700}}>{dateStr}</span></>}{timeStr&&<> at {timeStr}</>}{by&&<> by <strong style={{color:light?'#fff':'#1e293b'}}>{by}</strong></>}
    </div>
  );
}


import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createNotification, NOTIF_TYPES } from '../utils/notificationService';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const today = () => new Date().toISOString().slice(0,10);

const DEFAULT_ALLOY_RATE = 364;
export default function StoresDashboard({ dark, onBack, unit }) {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('checklist');
  const [submitMsg, setSubmitMsg] = useState('');

  const bg  = dark?'#0f111a':'#f4f6fb';
  const card= dark?'#1e2235':'#fff';
  const txt = dark?'#e2e8f0':'#1a1a2e';
  const sub = dark?'#94a3b8':'#888';
  const bdr = dark?'#2d3748':'#e8e8e8';
  const inp = {border:`1.5px solid ${bdr}`,borderRadius:8,padding:'9px 12px',fontSize:13,outline:'none',fontFamily:'inherit',background:dark?'#151929':'#fff',color:txt,width:'100%',boxSizing:'border-box'};

  const colChecklist = `stores_checklist_${unit==='u2'?'u2':'u1'}`;
  const colSupplier  = `stores_alloy_supplier_${unit==='u2'?'u2':'u1'}`;

  const tabBtn = (id, label) => (
    <button key={id} onClick={()=>setActiveTab(id)}
      style={{padding:'10px 18px',border:'none',background:'transparent',fontFamily:'inherit',cursor:'pointer',fontSize:13,
        fontWeight:activeTab===id?800:500, color:activeTab===id?'#f97316':sub,
        borderBottom:activeTab===id?'3px solid #f97316':'3px solid transparent'}}>
      {label}
    </button>
  );

  return (
    <div style={{minHeight:'100vh',background:bg,fontFamily:"'DM Sans',sans-serif"}}>
      {/* Header */}
      <div style={{background:dark?'#1e2235':'#fff',borderBottom:`1px solid ${bdr}`,padding:'12px 20px',display:'flex',alignItems:'center',gap:14,position:'sticky',top:0,zIndex:10}}>
        <button onClick={onBack} style={{background:'transparent',border:`1px solid ${bdr}`,borderRadius:8,padding:'7px 14px',color:sub,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>← Back</button>
        <div style={{flex:1}}>
          <h1 style={{margin:0,fontSize:16,fontWeight:800,color:txt}}>🏪 Stores Dashboard</h1>
          <p style={{margin:0,fontSize:11,color:sub}}>ALUBEE DIE CASTERS — HOSUR · Unit {unit==='u2'?'II':'I'}</p>
        </div>
        {submitMsg&&<div style={{background:submitMsg.startsWith('✅')?'#f0fdf4':'#fef2f2',border:`1px solid ${submitMsg.startsWith('✅')?'#bbf7d0':'#fecaca'}`,borderRadius:8,padding:'7px 14px',fontSize:12,color:submitMsg.startsWith('✅')?'#16a34a':'#dc2626',fontWeight:700}}>{submitMsg}</div>}
      </div>

      {/* Tabs */}
      <div style={{background:dark?'#1e2235':'#fff',borderBottom:`1px solid ${bdr}`,display:'flex',padding:'0 20px'}}>
        {tabBtn('checklist',     '📋 Oil & Storage Check')}
        {tabBtn('alloy',         '⚗️ Alloy Supplier PO')}
        {tabBtn('alloy_schedule','📅 Alloy Schedule')}
        {tabBtn('intra_transfer','🔄 Intra Transfer')}
        {tabBtn('history',       '📊 History')}
      </div>

      <div style={{padding:'16px 20px',paddingBottom:60}}>
        {activeTab==='checklist'     && <ChecklistForm inp={inp} txt={txt} sub={sub} bdr={bdr} card={card} dark={dark} unit={unit} colName={colChecklist} userProfile={userProfile} onMsg={setSubmitMsg}/>}
        {activeTab==='alloy'         && <AlloySupplierForm inp={inp} txt={txt} sub={sub} bdr={bdr} card={card} dark={dark} unit={unit} colName={colSupplier} userProfile={userProfile} onMsg={setSubmitMsg}/>}
        {activeTab==='alloy_schedule'&& <AlloyScheduleTab inp={inp} txt={txt} sub={sub} bdr={bdr} card={card} dark={dark} unit={unit} userProfile={userProfile}/>}
        {activeTab==='intra_transfer'&& <IntraTransferTab inp={inp} txt={txt} sub={sub} bdr={bdr} card={card} dark={dark} unit={unit} userProfile={userProfile}/>}
        {activeTab==='history'       && <HistoryView colChecklist={colChecklist} colSupplier={colSupplier} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>}
      </div>
    </div>
  );
}

// ── Checklist Form ─────────────────────────────────────────────────────────────
function ChecklistForm({inp,txt,sub,bdr,card,dark,unit,colName,userProfile,onMsg}) {
  const [items, setItems] = useState([
    {id:1, description:'COOLANT OIL (MOBIL CUT 140)',  unit:'Ltrs', value:'', note:''},
    {id:2, description:'HYDRAULIC OIL (AW 68)',         unit:'Ltrs', value:'', note:''},
    {id:3, description:'LUBE OIL (VESTA 68)',           unit:'Ltrs', value:'', note:''},
    {id:4, description:'RELEASE AGENT (JZ - 500 Y)',    unit:'Ltrs', value:'', note:''},
    {id:5, description:'ALLOY INGOTS — ADC12',          unit:'KG',   value:'', note:''},
    {id:6, description:'ALLOY INGOTS — ADC14',          unit:'KG',   value:'', note:''},
    {id:7, description:'ALLOY SCRAP — OVERFLOW',        unit:'KG',   value:'', note:''},
    {id:8, description:'ALLOY SCRAP — REJ COMPONENTS',  unit:'KG',   value:'', note:''},
    {id:9, description:'DIESEL',                        unit:'Ltrs', value:'', note:''},
    {id:10,description:'PETROL',                        unit:'Ltrs', value:'', note:''},
    {id:11,description:'N2 CYLINDER — FULL',            unit:'Nos',  value:'', note:''},
    {id:12,description:'N2 CYLINDER — LINE',            unit:'Nos',  value:'', note:''},
    {id:13,description:'N2 CYLINDER — EMPTY',           unit:'Nos',  value:'', note:''},
  ]);
  const [saving, setSaving] = useState(false);
  const upd = (id,k,v) => setItems(items.map(x=>x.id===id?{...x,[k]:v}:x));

  const SECTIONS=[
    {title:'OILS',         ids:[1,2,3,4],   color:'#2980B9'},
    {title:'ALLOY INGOTS', ids:[5,6],       color:'#8E44AD'},
    {title:'ALLOY SCRAP',  ids:[7,8],       color:'#E74C3C'},
    {title:'FUEL',         ids:[9,10],      color:'#E67E22'},
    {title:'N2 CYLINDERS', ids:[11,12,13],  color:'#27AE60'},
  ];

  async function save() {
    setSaving(true);
    try {
      await addDoc(collection(db, colName), {items, submittedBy:userProfile?.name, submittedAt:serverTimestamp(), date:today(), unit:unit||'u1'});
      await createNotification(unit||'u1', NOTIF_TYPES.STORES_CHECKLIST, {
        title: '✅ Stores Checklist Submitted',
        message: `${userProfile?.name||'Stores'} submitted today's checklist (${items.length} items)`,
        submittedBy: userProfile?.name,
      });
      onMsg('✅ Saved successfully!');
    } catch(e) { onMsg('❌ ' + e.message); }
    finally { setSaving(false); setTimeout(()=>onMsg(''),4000); }
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div>
          <h2 style={{margin:0,fontSize:15,fontWeight:800,color:txt}}>Oil Storage Check Sheet</h2>
          <div style={{fontSize:11,color:sub,marginTop:2}}>Date: {new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'2-digit'})}</div>
        </div>
        <button onClick={save} disabled={saving} style={{background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:10,padding:'10px 20px',color:'#fff',fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
          {saving?'⏳ Saving':'💾 Submit'}
        </button>
      </div>

      <div style={{background:card,borderRadius:14,overflow:'hidden',border:`1px solid ${bdr}`}}>
        <div style={{background:'#1F3864',padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{color:'#fff',fontWeight:800,fontSize:13}}>OIL STORAGE CHECK SHEET — UNIT {unit==='u2'?'II':'I'}</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'48px 1fr 60px 140px 160px',background:'#2F5496',padding:'7px 16px',gap:8}}>
          {['Sl.No','Description','Unit','Quantity','Notes'].map(h=><div key={h} style={{color:'#fff',fontSize:10,fontWeight:700,textTransform:'uppercase'}}>{h}</div>)}
        </div>
        {SECTIONS.map(sec=>(
          <div key={sec.title}>
            <div style={{background:sec.color+'22',borderLeft:`4px solid ${sec.color}`,padding:'6px 16px',fontSize:12,fontWeight:800,color:sec.color,borderBottom:`1px solid ${bdr}`}}>{sec.title}</div>
            {items.filter(x=>sec.ids.includes(x.id)).map((item,i)=>(
              <div key={item.id} style={{display:'grid',gridTemplateColumns:'48px 1fr 60px 140px 160px',padding:'8px 16px',gap:8,alignItems:'center',background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc'),borderBottom:`1px solid ${bdr}`}}>
                <div style={{fontSize:13,fontWeight:700,color:sub,textAlign:'center'}}>{item.id}</div>
                <div style={{fontSize:13,fontWeight:600,color:txt}}>{item.description}</div>
                <div style={{fontSize:11,color:sub}}>{item.unit}</div>
                <input style={{...inp,padding:'7px 10px',textAlign:'right'}} value={item.value} onChange={e=>upd(item.id,'value',e.target.value)} placeholder="Enter qty..." inputMode="decimal"/>
                <input style={{...inp,padding:'7px 10px'}} value={item.note} onChange={e=>upd(item.id,'note',e.target.value)} placeholder="Notes..."/>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Alloy Supplier PO Form ─────────────────────────────────────────────────────
function AlloySupplierForm({inp,txt,sub,bdr,card,dark,unit,colName,userProfile,onMsg}) {
  const emptySupplier = () => ({ name:'', type:'', totalPO:'', received:'', poPrice:'' });
  const [suppliers, setSuppliers] = useState([
    {name:'BAHETI',      type:'',           totalPO:'40', received:'10', poPrice:''},
    {name:'SAMYAK META', type:'',           totalPO:'40', received:'18', poPrice:''},
    {name:'GTR',         type:'',           totalPO:'50', received:'30', poPrice:''},
    {name:'ALLOY TECH',  type:'Fresh alloy bar', totalPO:'50', received:'0',  poPrice:''},
  ]);
  const [saving,setSaving] = useState(false);
  const upd=(i,k,v)=>setSuppliers(s=>s.map((x,j)=>j===i?{...x,[k]:v}:x));
  const bal = s => Math.max(0, (parseFloat(s.totalPO)||0) - (parseFloat(s.received)||0));

  async function save() {
    setSaving(true);
    try {
      const data = suppliers.filter(s=>s.name).map(s=>({...s, balance: bal(s)}));
      await addDoc(collection(db, colName), {suppliers:data, submittedBy:userProfile?.name, submittedAt:serverTimestamp(), date:today(), unit:unit||'u1'});
      await createNotification(unit||'u1', NOTIF_TYPES.STORES_ALLOY, {
        title: '⚗️ Alloy Inward Updated',
        message: `${userProfile?.name||'Stores'} recorded alloy inward from ${data.length} supplier(s)`,
        submittedBy: userProfile?.name,
      });
      onMsg('✅ Alloy supplier data saved!');
    } catch(e) { onMsg('❌ ' + e.message); }
    finally { setSaving(false); setTimeout(()=>onMsg(''),4000); }
  }

  const hd={background:'#1F3864',color:'#fff',padding:'8px 12px',fontSize:11,fontWeight:700,textAlign:'center',border:'1px solid #2d4a8a',whiteSpace:'nowrap'};

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div>
          <h2 style={{margin:0,fontSize:15,fontWeight:800,color:txt}}>Alloy Supplier — PO Status</h2>
          <div style={{fontSize:11,color:sub,marginTop:2}}>Track pending alloy deliveries · Balance auto-calculated</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setSuppliers(s=>[...s,emptySupplier()])} style={{background:'#3498db',border:'none',borderRadius:8,padding:'7px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Supplier</button>
          <button onClick={save} disabled={saving} style={{background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:8,padding:'9px 18px',color:'#fff',fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
            {saving?'⏳ Saving':'💾 Save'}
          </button>
        </div>
      </div>

      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',fontSize:12,background:card,width:'100%'}}>
          <thead>
            <tr>{['Supplier Name','Alloy Type','Total PO (Tons)','Received (Tons)','Balance (Auto)','PO Price (₹/KG)',''].map(h=><th key={h} style={hd}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {suppliers.map((s,i)=>{
              const b = bal(s);
              const pct = s.totalPO>0 ? Math.round((s.received/s.totalPO)*100) : 0;
              return (
                <tr key={i} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                  <td style={{padding:'4px 6px',border:`1px solid ${bdr}`}}>
                    <input value={s.name} onChange={e=>upd(i,'name',e.target.value)} style={{...inp,padding:'7px 10px',width:130,fontWeight:700}} placeholder="Supplier name"/>
                  </td>
                  <td style={{padding:'4px 6px',border:`1px solid ${bdr}`}}>
                    <input value={s.type} onChange={e=>upd(i,'type',e.target.value)} style={{...inp,padding:'7px 10px',width:120}} placeholder="e.g. Fresh alloy bar"/>
                  </td>
                  <td style={{padding:'4px 6px',border:`1px solid ${bdr}`}}>
                    <input value={s.totalPO} onChange={e=>upd(i,'totalPO',e.target.value)} style={{...inp,padding:'7px 10px',width:90,textAlign:'right'}} type="number" inputMode="decimal" placeholder="0"/>
                  </td>
                  <td style={{padding:'4px 6px',border:`1px solid ${bdr}`}}>
                    <input value={s.received} onChange={e=>upd(i,'received',e.target.value)} style={{...inp,padding:'7px 10px',width:90,textAlign:'right'}} type="number" inputMode="decimal" placeholder="0"/>
                  </td>
                  {/* Balance — auto */}
                  <td style={{padding:'8px 12px',border:`1px solid ${bdr}`,textAlign:'center'}}>
                    <div style={{fontWeight:900,color:b>0?'#ef4444':'#16a34a',fontSize:16}}>{b} T</div>
                    <div style={{fontSize:9,color:sub,marginTop:2}}>{pct}% received</div>
                    <div style={{height:4,background:dark?'#2d3748':'#e8e8e8',borderRadius:4,marginTop:4}}>
                      <div style={{height:'100%',borderRadius:4,background:pct===100?'#16a34a':'#f97316',width:`${pct}%`,transition:'width 0.4s'}}/>
                    </div>
                  </td>
                  <td style={{padding:'4px 6px',border:`1px solid ${bdr}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:4}}>
                      <span style={{color:sub,fontSize:12}}>₹</span>
                      <input value={s.poPrice} onChange={e=>upd(i,'poPrice',e.target.value)} style={{...inp,padding:'7px 8px',width:90,textAlign:'right'}} type="number" inputMode="decimal" placeholder="0.00"/>
                      <span style={{color:sub,fontSize:10,whiteSpace:'nowrap'}}>/KG</span>
                    </div>
                  </td>
                  <td style={{padding:'4px 6px',border:`1px solid ${bdr}`}}>
                    <button onClick={()=>setSuppliers(s=>s.filter((_,j)=>j!==i))} style={{background:'#fef2f2',border:'none',borderRadius:4,padding:'5px 8px',color:'#dc2626',cursor:'pointer',fontSize:11}}>✕</button>
                  </td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr style={{background:dark?'#2d2005':'#fffbeb'}}>
              <td colSpan={2} style={{padding:'10px 12px',fontWeight:800,color:'#d97706',border:`1px solid ${bdr}`}}>TOTALS</td>
              <td style={{padding:'10px 12px',fontWeight:800,color:txt,textAlign:'center',border:`1px solid ${bdr}`}}>{suppliers.reduce((a,s)=>a+(parseFloat(s.totalPO)||0),0)} T</td>
              <td style={{padding:'10px 12px',fontWeight:800,color:'#16a34a',textAlign:'center',border:`1px solid ${bdr}`}}>{suppliers.reduce((a,s)=>a+(parseFloat(s.received)||0),0)} T</td>
              <td style={{padding:'10px 12px',fontWeight:900,color:'#ef4444',textAlign:'center',fontSize:16,border:`1px solid ${bdr}`}}>{suppliers.reduce((a,s)=>a+bal(s),0)} T</td>
              <td colSpan={2} style={{border:`1px solid ${bdr}`}}/>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── History View ──────────────────────────────────────────────────────────────
function HistoryView({colChecklist,colSupplier,dark,card,txt,sub,bdr}) {
  const [checkRecs,setCheckRecs]=useState([]);
  const [suppRecs, setSuppRecs] =useState([]);
  const [tab,setTab]=useState('supplier');
  useEffect(()=>{
    const q1=query(collection(db,colChecklist),orderBy('submittedAt','desc'),limit(7));
    const q2=query(collection(db,colSupplier), orderBy('submittedAt','desc'),limit(7));
    const u1=onSnapshot(q1,s=>setCheckRecs(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u2=onSnapshot(q2,s=>setSuppRecs(s.docs.map(d=>({id:d.id,...d.data()}))));
    return()=>{u1();u2();};
  },[]);

  const [expanded,setExpanded]=useState(null);
  const tabB=(id,l)=><button onClick={()=>setTab(id)} style={{padding:'8px 16px',border:'none',background:'transparent',fontFamily:'inherit',cursor:'pointer',fontSize:12,fontWeight:tab===id?800:400,color:tab===id?'#f97316':sub,borderBottom:tab===id?'2px solid #f97316':'2px solid transparent'}}>{l}</button>;

  return (
    <div>
      <div style={{display:'flex',marginBottom:16,borderBottom:`1px solid ${bdr}`}}>
        {tabB('supplier','⚗️ Alloy Supplier')}
        {tabB('checklist','📋 Oil Checklist')}
      </div>

      {tab==='supplier' && (
        <div>
          <h3 style={{margin:'0 0 12px',fontSize:14,fontWeight:800,color:txt}}>Alloy Supplier PO History</h3>
          {suppRecs.length===0 ? <p style={{color:sub}}>No submissions yet.</p> : suppRecs.map(r=>(
            <div key={r.id} style={{background:card,borderRadius:10,border:`1px solid ${bdr}`,marginBottom:10,overflow:'hidden'}}>
              <div style={{padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',background:dark?'#1e2235':'#f8f9fc'}}>
                <div style={{cursor:'pointer',flex:1,display:'flex',gap:12,alignItems:'center'}} onClick={()=>setExpanded(e=>e===r.id?null:r.id)}>
                  <span style={{fontWeight:800,color:txt}}>{r.date}</span>
                  <LastUpdatedBadge at={r.submittedAt} by={r.submittedBy}/>
                  <span style={{color:sub,fontSize:11}}>{r.suppliers?.length||0} suppliers</span>
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <span style={{color:'#f97316',cursor:'pointer'}} onClick={()=>setExpanded(e=>e===r.id?null:r.id)}>{expanded===r.id?'▲':'▼'}</span>
                  <button onClick={()=>deleteRecord(colSupplier,r.id)} style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:6,padding:'3px 8px',color:'#dc2626',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>🗑</button>
                </div>
              </div>
              {expanded===r.id&&r.suppliers&&(
                <div style={{padding:'0 0 12px'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr',background:'#1F3864',padding:'7px 16px',gap:8}}>
                    {['Supplier','Type','Total PO','Received','Balance','PO Price'].map(h=><span key={h} style={{color:'#fff',fontSize:10,fontWeight:700}}>{h}</span>)}
                  </div>
                  {r.suppliers.map((s,i)=>(
                    <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr',padding:'9px 16px',gap:8,background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc'),borderBottom:`1px solid ${bdr}`}}>
                      <span style={{fontWeight:700,color:txt,fontSize:13}}>{s.name}</span>
                      <span style={{color:sub,fontSize:12}}>{s.type||'—'}</span>
                      <span style={{color:txt,fontWeight:600,textAlign:'right'}}>{s.totalPO} T</span>
                      <span style={{color:'#16a34a',fontWeight:600,textAlign:'right'}}>{s.received} T</span>
                      <span style={{color:s.balance>0?'#ef4444':'#16a34a',fontWeight:800,textAlign:'right'}}>{s.balance} T</span>
                      <span style={{color:'#f97316',fontWeight:700,textAlign:'right'}}>{s.poPrice?`₹${s.poPrice}/KG`:'—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab==='checklist' && (
        <div>
          <h3 style={{margin:'0 0 12px',fontSize:14,fontWeight:800,color:txt}}>Oil Storage Checklist History</h3>
          {checkRecs.length===0 ? <p style={{color:sub}}>No submissions yet.</p> : checkRecs.map(r=>(
            <div key={r.id} style={{background:card,borderRadius:10,border:`1px solid ${bdr}`,marginBottom:10,overflow:'hidden'}}>
              <div style={{padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',background:dark?'#1e2235':'#f8f9fc'}}>
                <div style={{cursor:'pointer',flex:1,display:'flex',gap:12,alignItems:'center'}} onClick={()=>setExpanded(e=>e===r.id?null:r.id)}>
                  <span style={{fontWeight:800,color:txt}}>{r.date}</span>
                  <LastUpdatedBadge at={r.submittedAt} by={r.submittedBy}/>
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <span style={{color:'#f97316',cursor:'pointer'}} onClick={()=>setExpanded(e=>e===r.id?null:r.id)}>{expanded===r.id?'▲':'▼'}</span>
                  <button onClick={()=>deleteRecord(colChecklist,r.id)} style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:6,padding:'3px 8px',color:'#dc2626',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>🗑</button>
                </div>
              </div>
              {expanded===r.id&&r.items&&(
                <div style={{padding:'0 16px 12px'}}>
                  {r.items.filter(x=>x.value).map(item=>(
                    <div key={item.id} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:`1px solid ${bdr}`,fontSize:13}}>
                      <span style={{color:sub}}>{item.description}</span>
                      <span style={{fontWeight:700,color:txt}}>{item.value} {item.unit}{item.note?` (${item.note})`:''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ALLOY SCHEDULE TAB ────────────────────────────────────────────────────────
function AlloyScheduleTab({ inp, txt, sub, bdr, card, dark, unit, userProfile }) {
  const [schedules, setSchedules]       = useState([]);
  const [existingSuppliers, setExistingSuppliers] = useState([]); // from alloy PO records
  const [form, setForm]                 = useState({ supplier:'', grade:'ADC12', ratePerKg:'', totalTons:'', unit:'u1', remarks:'' });
  const [deliveries, setDeliveries]     = useState([{ date:'', tons:'', unit:'u1' }]);
  const [saving, setSaving]             = useState(false);
  const [view, setView]                 = useState('list');
  const [showCompleted, setShowCompleted] = useState(false);
  const [editSchedule, setEditSchedule] = useState(null);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  useEffect(()=>{
    const q = query(collection(db,'alloy_schedule'), orderBy('createdAt','desc'), limit(50));
    return onSnapshot(q, s=>setSchedules(s.docs.map(d=>({id:d.id,...d.data()}))));
  },[]);

  // Load existing supplier names + rates from alloy PO records
  useEffect(()=>{
    const col = `stores_alloy_supplier_${unit==='u2'?'u2':'u1'}`;
    const q = query(collection(db, col), orderBy('submittedAt','desc'), limit(5));
    return onSnapshot(q, s=>{
      const allSuppliers = {};
      s.docs.forEach(d=>{
        const data = d.data();
        (data.suppliers||[]).forEach(sup=>{
          if (sup.name && !allSuppliers[sup.name]) {
            allSuppliers[sup.name] = { name:sup.name, grade:sup.type||'', rate:sup.poPrice||'' };
          }
        });
      });
      setExistingSuppliers(Object.values(allSuppliers));
    });
  },[unit]);

  // When supplier selected from dropdown, auto-fill rate and grade
  function onSupplierSelect(name) {
    if (name === '__custom__') { set('supplier',''); return; }
    const found = existingSuppliers.find(s=>s.name===name);
    if (found) {
      setForm(f=>({...f, supplier:found.name, ratePerKg:found.rate||'', grade:found.grade||f.grade}));
    } else {
      set('supplier', name);
    }
  }

  const GRADES = ['ADC12','ADC14','LM6','LM24','A380','A360','Custom'];

  // Summary
  const totalPO   = schedules.reduce((a,s)=>a+(parseFloat(s.totalPO)||0),0);
  const totalTons = schedules.reduce((a,s)=>a+(parseFloat(s.totalTons)||0),0);
  const u1Tons    = schedules.filter(s=>!s.unit||s.unit==='u1').reduce((a,s)=>a+(parseFloat(s.totalTons)||0),0);
  const u2Tons    = schedules.filter(s=>s.unit==='u2').reduce((a,s)=>a+(parseFloat(s.totalTons)||0),0);

  async function save() {
    if (!form.supplier.trim()) return alert('Supplier required');
    if (!form.totalTons) return alert('Total tons required');
    setSaving(true);
    try {
      await addDoc(collection(db,'alloy_schedule'),{
        ...form,
        ratePerKg: parseFloat(form.ratePerKg)||0,
        totalTons: parseFloat(form.totalTons)||0,
        deliveries: deliveries.filter(d=>d.date&&d.tons).map(d=>({...d, tons:parseFloat(d.tons)||0})),
        submittedBy: userProfile?.name||'Stores',
        createdAt: serverTimestamp(),
      });
      await createNotification(unit||'u1', NOTIF_TYPES.STORES_ALLOY, {
        title: '⚗️ Alloy Schedule Added',
        message: `${form.supplier||'Supplier'} — ${form.totalTons}T ${form.grade} @ ₹${form.ratePerKg}/kg`,
        supplier: form.supplier, grade: form.grade, tons: form.totalTons,
      });
      setForm({ supplier:'', grade:'ADC12', ratePerKg:'', totalTons:'', unit:'u1', remarks:'' });
      setDeliveries([{date:'',tons:'',unit:'u1'}]);
      setView('list');
    } catch(e){ alert(e.message); }
    finally{ setSaving(false); }
  }

  async function deleteSchedule(id) {
    if (!window.confirm('Delete this schedule entry?')) return;
    try { await deleteDoc(doc(db,'alloy_schedule',id)); } catch(e){ alert(e.message); }
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div style={{fontWeight:900,fontSize:16,color:txt}}>📅 Alloy Delivery Schedule</div>
        <div style={{display:'flex',gap:6}}>
          <button onClick={()=>setView('list')} style={{padding:'6px 14px',borderRadius:16,border:`1px solid ${view==='list'?'#f97316':bdr}`,background:view==='list'?'#f97316':'transparent',color:view==='list'?'#fff':sub,fontWeight:view==='list'?700:400,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>📋 List</button>
          <button onClick={()=>setView('add')}  style={{padding:'6px 14px',borderRadius:16,border:`1px solid ${view==='add'?'#f97316':bdr}`,background:view==='add'?'#f97316':'transparent',color:view==='add'?'#fff':sub,fontWeight:view==='add'?700:400,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>+ Add Schedule</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginBottom:16}}>
        {[
          {l:'Total POs',   v:schedules.length,     c:'#1e40af'},
          {l:'Total Tons',  v:`${totalTons.toFixed(1)}T`, c:'#15803d'},
          {l:'U1 Tons',     v:`${u1Tons.toFixed(1)}T`,   c:'#7c3aed'},
          {l:'U2 Tons',     v:`${u2Tons.toFixed(1)}T`,   c:'#ea580c'},
        ].map(k=>(
          <div key={k.l} style={{background:card,borderRadius:10,padding:'10px 12px',border:`1px solid ${bdr}`,textAlign:'center'}}>
            <div style={{fontSize:18,fontWeight:900,color:k.c}}>{k.v}</div>
            <div style={{fontSize:10,color:sub,marginTop:2}}>{k.l}</div>
          </div>
        ))}
      </div>

      {view==='add' && (
        <div style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,padding:18,marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:14,color:txt,marginBottom:14}}>Add Alloy PO / Schedule</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <div style={{gridColumn:'1/-1'}}>
              <label style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',display:'block',marginBottom:4}}>Supplier</label>
              <div style={{display:'flex',gap:8}}>
                <select style={{...inp,cursor:'pointer',flex:1}} onChange={e=>onSupplierSelect(e.target.value)} value="">
                  <option value="">— Select existing supplier —</option>
                  {existingSuppliers.map(s=><option key={s.name} value={s.name}>{s.name}{s.rate?` · ₹${s.rate}/kg`:''}</option>)}
                  <option value="__custom__">+ Type new supplier name</option>
                </select>
                <input style={{...inp,flex:1}} value={form.supplier} onChange={e=>set('supplier',e.target.value)} placeholder="Or type supplier name"/>
              </div>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',display:'block',marginBottom:4}}>Grade / Alloy Type</label>
              <input style={inp} value={form.grade} onChange={e=>set('grade',e.target.value)} placeholder="e.g. ADC12, Fresh alloy bar"/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#15803d',textTransform:'uppercase',display:'block',marginBottom:4}}>Rate / kg (₹) — auto from PO</label>
              <input type="number" step={0.01} style={{...inp,color:'#15803d',fontWeight:700}} value={form.ratePerKg} onChange={e=>set('ratePerKg',e.target.value)} placeholder="₹ per kg"/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',display:'block',marginBottom:4}}>Total Tons (PO Qty)</label>
              <input type="number" step={0.1} style={inp} value={form.totalTons} onChange={e=>set('totalTons',e.target.value)} placeholder="Tons"/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',display:'block',marginBottom:4}}>For Unit</label>
              <select style={{...inp,cursor:'pointer'}} value={form.unit} onChange={e=>set('unit',e.target.value)}>
                <option value="u1">Unit 1</option>
                <option value="u2">Unit 2</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',display:'block',marginBottom:4}}>Remarks</label>
              <input style={inp} value={form.remarks} onChange={e=>set('remarks',e.target.value)} placeholder="Optional"/>
            </div>
          </div>

          {/* Delivery schedule */}
          <div style={{fontWeight:700,fontSize:12,color:txt,marginBottom:8}}>📦 Planned Delivery Dates</div>
          {deliveries.map((d,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:8,marginBottom:6,alignItems:'center'}}>
              <input type="date" style={inp} value={d.date} onChange={e=>setDeliveries(ds=>ds.map((x,j)=>j===i?{...x,date:e.target.value}:x))} />
              <input type="number" step={0.1} style={inp} value={d.tons} onChange={e=>setDeliveries(ds=>ds.map((x,j)=>j===i?{...x,tons:e.target.value}:x))} placeholder="Tons"/>
              <select style={{...inp,cursor:'pointer'}} value={d.unit} onChange={e=>setDeliveries(ds=>ds.map((x,j)=>j===i?{...x,unit:e.target.value}:x))}>
                <option value="u1">Unit 1</option><option value="u2">Unit 2</option>
              </select>
              <button onClick={()=>setDeliveries(ds=>ds.filter((_,j)=>j!==i))} style={{background:'#fef2f2',border:'none',borderRadius:7,color:'#dc2626',fontWeight:800,fontSize:16,cursor:'pointer',width:32,height:36}}>✕</button>
            </div>
          ))}
          <button onClick={()=>setDeliveries(ds=>[...ds,{date:'',tons:'',unit:'u1'}])}
            style={{padding:'7px 14px',borderRadius:8,border:`1.5px dashed #93c5fd`,background:'#eff6ff',color:'#1e40af',fontWeight:700,fontSize:12,cursor:'pointer',marginBottom:14}}>
            + Add Delivery Date
          </button>

          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setView('list')} style={{flex:1,padding:'10px',borderRadius:8,border:`1px solid ${bdr}`,background:'transparent',color:sub,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
            <button onClick={save} disabled={saving} style={{flex:2,padding:'10px',borderRadius:8,border:'none',background:'#15803d',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
              {saving?'⏳ Saving…':'✅ Save Schedule'}
            </button>
          </div>
        </div>
      )}

      {view==='list' && (
        <div>
          {/* Filter toggle */}
          {schedules.length>0 && (
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div style={{fontSize:12,color:sub}}>
                {showCompleted
                  ? `Showing all ${schedules.length} POs (including completed)`
                  : `Showing ${schedules.filter(s=>{const tt=parseFloat(s.totalTons)||parseFloat(s.totalPO)||0;const d=(s.deliveries||[]).reduce((a,x)=>a+(x.tons||0),0);return tt===0||d<tt;}).length} active POs`}
              </div>
              <button onClick={()=>setShowCompleted(v=>!v)}
                style={{padding:'5px 12px',borderRadius:8,border:`1px solid ${bdr}`,background:'transparent',
                  color:showCompleted?'#f97316':sub,fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                {showCompleted?'Hide Completed':'Show Completed'}
              </button>
            </div>
          )}
          {schedules.length===0 && <div style={{textAlign:'center',padding:48,color:sub}}>No alloy schedules yet — add one above</div>}
          {schedules.map(s=>{
            // Support both new format (deliveries[]) and old format (received field)
            const hasDeliveries = Array.isArray(s.deliveries) && s.deliveries.length>0;
            const delivered = hasDeliveries
              ? (s.deliveries).filter(d=>d.date<=new Date().toISOString().slice(0,10)).reduce((a,d)=>a+(parseFloat(d.tons)||0),0)
              : (parseFloat(s.received)||0);
            const totalTons = parseFloat(s.totalTons)||parseFloat(s.totalPO)||0;
            const pct = totalTons>0?Math.round((delivered/totalTons)*100):0;
            // Hide completed POs unless showCompleted is true
            if (!showCompleted && totalTons>0 && delivered>=totalTons) return null;
            return (
              <div key={s.id} style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,padding:'16px 18px',marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10,flexWrap:'wrap',gap:6}}>
                  <div>
                    <div style={{fontWeight:900,fontSize:15,color:txt}}>{s.supplier} — {s.grade}</div>
                    <div style={{fontSize:11,color:sub,marginTop:2}}>Unit {s.unit==='both'?'1 & 2':s.unit==='u2'?'2':'1'}</div>
                    <LastUpdatedBadge at={s.createdAt} by={s.submittedBy}/>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <span style={{background:'#eff6ff',color:'#1e40af',borderRadius:8,padding:'3px 10px',fontWeight:800,fontSize:12}}>₹{s.ratePerKg||s.totalPO||0}/kg</span>
                    <span style={{background:'#f0fdf4',color:'#15803d',borderRadius:8,padding:'3px 10px',fontWeight:800,fontSize:12}}>{totalTons}T</span>
                    <button onClick={()=>setEditSchedule(s)} style={{background:'#eff6ff',border:'none',borderRadius:7,color:'#1e40af',fontWeight:700,fontSize:11,cursor:'pointer',padding:'4px 8px'}}>✎</button>
                    <button onClick={()=>setEditSchedule(s)} style={{background:'#eff6ff',border:'none',borderRadius:7,color:'#1e40af',fontWeight:700,fontSize:11,cursor:'pointer',padding:'4px 8px'}}>✎ Edit</button>
                    <button onClick={()=>deleteSchedule(s.id)} style={{background:'#fef2f2',border:'none',borderRadius:7,color:'#dc2626',fontWeight:700,fontSize:11,cursor:'pointer',padding:'4px 8px'}}>🗑 Delete</button>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:sub,marginBottom:3}}>
                    <span>Delivered: {delivered.toFixed(1)}T / {totalTons}T</span>
                    <span style={{fontWeight:700,color:pct>=100?'#15803d':'#f97316'}}>{pct}%</span>
                  </div>
                  <div style={{background:dark?'#2d3748':'#e5e7eb',borderRadius:5,height:8,overflow:'hidden'}}>
                    <div style={{width:`${Math.min(pct,100)}%`,height:'100%',background:(pct>=100||delivered>=totalTons)?'#16a34a':'#f97316',borderRadius:5,transition:'width 0.3s'}}/>
                  </div>
                </div>

                {/* Delivery schedule */}
                {(s.deliveries||[]).length>0 && (
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {s.deliveries.map((d,i)=>{
                      const isPast = d.date<=new Date().toISOString().slice(0,10);
                      return (
                        <span key={i} style={{background:isPast?'#f0fdf4':'#eff6ff',color:isPast?'#15803d':'#1e40af',borderRadius:6,padding:'3px 8px',fontSize:11,fontWeight:600}}>
                          {isPast?'✅':'📅'} {d.date} · {d.tons}T · U{d.unit==='u2'?'2':'1'}
                        </span>
                      );
                    })}
                  </div>
                )}
                {s.remarks && <div style={{fontSize:11,color:sub,marginTop:6}}>📝 {s.remarks}</div>}
              </div>
            );
          })}
        </div>
      )}
    {editSchedule && <EditScheduleModal s={editSchedule} inp={inp} onClose={()=>setEditSchedule(null)}/>}
    </div>
  );
}

function EditScheduleModal({s, inp, onClose}) {
  const [form, setForm] = useState({
    supplier: s.supplier||'', grade: s.grade||'', ratePerKg: s.ratePerKg||'',
    totalTons: s.totalTons||'', unit: s.unit||'u1', remarks: s.remarks||'',
    deliveries: (s.deliveries||[]).map(d=>({...d})),
  });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  async function save() {
    setSaving(true);
    try {
      await updateDoc(doc(db,'alloy_schedule',s.id), {
        supplier: form.supplier, grade: form.grade,
        ratePerKg: parseFloat(form.ratePerKg)||0,
        totalTons: parseFloat(form.totalTons)||0,
        unit: form.unit, remarks: form.remarks,
        deliveries: form.deliveries.filter(d=>d.date&&d.tons).map(d=>({...d,tons:parseFloat(d.tons)||0})),
        updatedAt: serverTimestamp(),
      });
      onClose();
    } catch(e){alert(e.message);}
    finally{setSaving(false);}
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:520,padding:22,maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:900,fontSize:15,color:'#1e40af'}}>✎ Edit — {s.supplier}</div>
          <button onClick={onClose} style={{background:'#f3f4f6',border:'none',borderRadius:8,width:30,height:30,cursor:'pointer',fontSize:16}}>✕</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
          {[['Supplier','supplier','text'],['Grade','grade','text'],
            ['Rate/kg (₹)','ratePerKg','number'],['Total Tons','totalTons','number']
          ].map(([lbl,key,type])=>(
            <div key={key}>
              <label style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',display:'block',marginBottom:3}}>{lbl}</label>
              <input type={type} style={{...inp,background:'#fff',color:'#111',width:'100%',boxSizing:'border-box'}} value={form[key]} onChange={e=>set(key,e.target.value)}/>
            </div>
          ))}
          <div>
            <label style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',display:'block',marginBottom:3}}>For Unit</label>
            <select style={{...inp,cursor:'pointer',background:'#fff',color:'#111',width:'100%',boxSizing:'border-box'}} value={form.unit} onChange={e=>set('unit',e.target.value)}>
              <option value="u1">Unit 1</option><option value="u2">Unit 2</option><option value="both">Both</option>
            </select>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',display:'block',marginBottom:3}}>Remarks</label>
            <input style={{...inp,background:'#fff',color:'#111',width:'100%',boxSizing:'border-box'}} value={form.remarks} onChange={e=>set('remarks',e.target.value)}/>
          </div>
        </div>
        <div style={{fontWeight:700,fontSize:12,color:'#374151',marginBottom:8}}>Delivery Dates</div>
        {form.deliveries.map((d,i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 80px 70px auto',gap:6,marginBottom:6,alignItems:'center'}}>
            <input type="date" style={{...inp,background:'#fff',color:'#111'}} value={d.date} onChange={e=>setForm(f=>({...f,deliveries:f.deliveries.map((x,j)=>j===i?{...x,date:e.target.value}:x)}))}/>
            <input type="number" step={0.1} style={{...inp,background:'#fff',color:'#111'}} value={d.tons} onChange={e=>setForm(f=>({...f,deliveries:f.deliveries.map((x,j)=>j===i?{...x,tons:e.target.value}:x)}))} placeholder="Tons"/>
            <select style={{...inp,cursor:'pointer',background:'#fff',color:'#111'}} value={d.unit||'u1'} onChange={e=>setForm(f=>({...f,deliveries:f.deliveries.map((x,j)=>j===i?{...x,unit:e.target.value}:x)}))}>
              <option value="u1">U1</option><option value="u2">U2</option>
            </select>
            <button onClick={()=>setForm(f=>({...f,deliveries:f.deliveries.filter((_,j)=>j!==i)}))} style={{background:'#fef2f2',border:'none',borderRadius:6,color:'#dc2626',fontWeight:700,cursor:'pointer',width:30,height:36}}>✕</button>
          </div>
        ))}
        <button onClick={()=>setForm(f=>({...f,deliveries:[...f.deliveries,{date:'',tons:'',unit:'u1'}]}))}
          style={{padding:'7px 14px',borderRadius:8,border:'1.5px dashed #93c5fd',background:'#eff6ff',color:'#1e40af',fontWeight:700,fontSize:12,cursor:'pointer',marginBottom:14}}>
          + Add Date
        </button>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:'10px',borderRadius:8,border:'1px solid #d1d5db',background:'#f9fafb',color:'#374151',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{flex:2,padding:'10px',borderRadius:8,border:'none',background:'#1e40af',color:'#fff',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>
            {saving?'Saving…':'✓ Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── INTRA TRANSFER TAB ────────────────────────────────────────────────────────
function IntraTransferTab({ inp, txt, sub, bdr, card, dark, unit, userProfile }) {
  const [transfers, setTransfers] = useState([]);
  const [form, setForm] = useState({ fromUnit:'u1', toUnit:'u2', grade:'ADC12', tons:'', reason:'', date:new Date().toISOString().slice(0,10), remarks:'' });
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('list');
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const GRADES = ['ADC12','ADC14','LM6','LM24','A380','A360','Mixed'];
  const REASONS = ['Production Requirement','Stock Balancing','Emergency Transfer','Quality Issue','Other'];

  useEffect(()=>{
    const q = query(collection(db,'alloy_intra_transfer'), orderBy('createdAt','desc'), limit(100));
    return onSnapshot(q, s=>setTransfers(s.docs.map(d=>({id:d.id,...d.data()}))));
  },[]);

  const totalU1toU2 = transfers.filter(t=>t.fromUnit==='u1'&&t.toUnit==='u2').reduce((a,t)=>a+(t.tons||0),0);
  const totalU2toU1 = transfers.filter(t=>t.fromUnit==='u2'&&t.toUnit==='u1').reduce((a,t)=>a+(t.tons||0),0);

  async function save() {
    if (!form.tons||parseFloat(form.tons)<=0) return alert('Tons required');
    setSaving(true);
    try {
      await addDoc(collection(db,'alloy_intra_transfer'),{
        ...form,
        tons: parseFloat(form.tons)||0,
        recordedBy: userProfile?.name||'Stores',
        createdAt: serverTimestamp(),
      });
      await createNotification(unit||'u1', NOTIF_TYPES.STORES_TRANSFER, {
        title: '🔄 Alloy Intra Transfer',
        message: `${fromUnit||'U1'} → ${toUnit||'U2'}: ${alloyGrade||''} ${quantity||''}kg — ${reason||''}`,
      });
      setForm({ fromUnit:'u1', toUnit:'u2', grade:'ADC12', tons:'', reason:'', date:new Date().toISOString().slice(0,10), remarks:'' });
      setView('list');
    } catch(e){ alert(e.message); }
    finally{ setSaving(false); }
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div style={{fontWeight:900,fontSize:16,color:txt}}>🔄 Alloy Intra-Unit Transfer</div>
        <div style={{display:'flex',gap:6}}>
          <button onClick={()=>setView('list')} style={{padding:'6px 14px',borderRadius:16,border:`1px solid ${view==='list'?'#f97316':bdr}`,background:view==='list'?'#f97316':'transparent',color:view==='list'?'#fff':sub,fontWeight:view==='list'?700:400,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>📋 Log</button>
          <button onClick={()=>setView('add')}  style={{padding:'6px 14px',borderRadius:16,border:`1px solid ${view==='add'?'#f97316':bdr}`,background:view==='add'?'#f97316':'transparent',color:view==='add'?'#fff':sub,fontWeight:view==='add'?700:400,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>+ Record Transfer</button>
        </div>
      </div>

      {/* Summary */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
        {[
          {l:'Total Transfers', v:transfers.length,          c:'#1e40af'},
          {l:'U1 → U2',        v:`${totalU1toU2.toFixed(1)}T`, c:'#7c3aed'},
          {l:'U2 → U1',        v:`${totalU2toU1.toFixed(1)}T`, c:'#ea580c'},
        ].map(k=>(
          <div key={k.l} style={{background:card,borderRadius:10,padding:'10px 12px',border:`1px solid ${bdr}`,textAlign:'center'}}>
            <div style={{fontSize:18,fontWeight:900,color:k.c}}>{k.v}</div>
            <div style={{fontSize:10,color:sub,marginTop:2}}>{k.l}</div>
          </div>
        ))}
      </div>

      {view==='add' && (
        <div style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,padding:18,marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:14,color:txt,marginBottom:14}}>Record Intra Transfer</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',display:'block',marginBottom:4}}>From Unit</label>
              <select style={{...inp,cursor:'pointer'}} value={form.fromUnit} onChange={e=>set('fromUnit',e.target.value)}>
                <option value="u1">Unit 1</option><option value="u2">Unit 2</option>
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',display:'block',marginBottom:4}}>To Unit</label>
              <select style={{...inp,cursor:'pointer'}} value={form.toUnit} onChange={e=>set('toUnit',e.target.value)}>
                <option value="u2">Unit 2</option><option value="u1">Unit 1</option>
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',display:'block',marginBottom:4}}>Grade</label>
              <select style={{...inp,cursor:'pointer'}} value={form.grade} onChange={e=>set('grade',e.target.value)}>
                {GRADES.map(g=><option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',display:'block',marginBottom:4}}>Tons Transferred</label>
              <input type="number" step={0.1} style={inp} value={form.tons} onChange={e=>set('tons',e.target.value)} placeholder="0.0"/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',display:'block',marginBottom:4}}>Date</label>
              <input type="date" style={inp} value={form.date} onChange={e=>set('date',e.target.value)}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',display:'block',marginBottom:4}}>Reason</label>
              <select style={{...inp,cursor:'pointer'}} value={form.reason} onChange={e=>set('reason',e.target.value)}>
                <option value="">— Select —</option>
                {REASONS.map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
            <div style={{gridColumn:'1/-1'}}>
              <label style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',display:'block',marginBottom:4}}>Remarks</label>
              <input style={inp} value={form.remarks} onChange={e=>set('remarks',e.target.value)} placeholder="Optional"/>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setView('list')} style={{flex:1,padding:'10px',borderRadius:8,border:`1px solid ${bdr}`,background:'transparent',color:sub,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
            <button onClick={save} disabled={saving} style={{flex:2,padding:'10px',borderRadius:8,border:'none',background:'#7c3aed',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
              {saving?'⏳ Saving…':'✅ Record Transfer'}
            </button>
          </div>
        </div>
      )}

      {view==='list' && (
        <div>
          {transfers.length===0 && <div style={{textAlign:'center',padding:48,color:sub}}>No transfers recorded yet</div>}
          {transfers.map(t=>(
            <div key={t.id} style={{background:card,borderRadius:12,border:`1px solid ${bdr}`,padding:'12px 16px',marginBottom:8,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <div style={{fontSize:22}}>🔄</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:13,color:txt}}>
                  U{t.fromUnit==='u2'?'2':'1'} → U{t.toUnit==='u2'?'2':'1'} &nbsp;·&nbsp; <span style={{color:'#7c3aed'}}>{t.tons}T {t.grade}</span>
                </div>
                <div style={{fontSize:11,color:sub,marginTop:2}}>{t.date} · {t.reason||'—'} · {t.recordedBy}</div>
                {t.remarks&&<div style={{fontSize:10,color:sub,marginTop:1}}>📝 {t.remarks}</div>}
              </div>
              <button onClick={async()=>{if(!window.confirm('Delete?'))return;try{await deleteDoc(doc(db,'alloy_intra_transfer',t.id));}catch(e){alert(e.message);}}}
                style={{background:'#fef2f2',border:'none',borderRadius:7,color:'#dc2626',fontWeight:700,fontSize:11,cursor:'pointer',padding:'5px 10px'}}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
