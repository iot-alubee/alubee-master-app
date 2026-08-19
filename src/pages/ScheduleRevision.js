import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, doc,
         setDoc, orderBy, serverTimestamp, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { createNotification, NOTIF_TYPES } from '../utils/notificationService';

const C = {
  bg:'#0F1117', card:'#181C2E', raised:'#1E2340', border:'#252D50',
  text:'#E6EDF3', sub:'#8892B0', green:'#22c55e', red:'#ef4444',
  orange:'#f97316', amber:'#f59e0b', teal:'#2dd4bf', purple:'#a78bfa',
  blue:'#3b82f6',
};

const REVISION_REASONS = [
  'Based on last 6-month average intake',
  'Customer hold instruction',
  'Bin supply issue — bins not returned',
  'MOQ not met — volume too low',
  'Customer PO revised downward',
  'Customer PO revised upward',
  'Volume spike — demand increased',
  'Seasonal demand adjustment',
  'New part replacing old',
  'Other',
];

const HISTORY_MONTHS = 6;

function getMonths() {
  const now = new Date();
  return Array.from({ length: HISTORY_MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (HISTORY_MONTHS - 1 - i), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      label: d.toLocaleString('en-IN',{month:'short',year:'2-digit'}),
    };
  });
}

const inp = {
  border:`1px solid ${C.border}`, borderRadius:8, padding:'7px 10px', fontSize:12,
  outline:'none', background:C.raised, color:C.text, fontFamily:'inherit',
  width:'100%', boxSizing:'border-box',
};
const fmtL = n => `₹${(Math.abs(n)/100000).toFixed(2)}L`;
const fmtK = n => Math.abs(n)>=1000?(Math.abs(n)/1000).toFixed(1)+'K':Math.round(Math.abs(n)).toLocaleString('en-IN');

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function ScheduleRevision({ userProfile, activeUnit, onBack }) {
  const [customers, setCustomers] = useState([]);
  const [schedules, setSchedules] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        const u = activeUnit||'u1';
        const { getDocs, collection, query, where } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        const now2 = new Date();
        // Load customer master
        const [masterSnap, schedSnap] = await Promise.all([
          getDocs(collection(db, u==='u2'?'customer_master_u2':'customer_master')),
          getDocs(query(collection(db, u==='u2'?'customer_schedules_u2':'customer_schedules'), where('year','==',now2.getFullYear()))),
        ]);
        const custs = masterSnap.docs.map(d=>({id:d.id,...d.data()})).filter(c=>c.parts?.length>0);
        const sched = {};
        schedSnap.docs.forEach(d=>{
          const{custId,partNo,scheduleQty}=d.data();
          if(!sched[custId])sched[custId]={};
          sched[custId][partNo]={scheduleQty:scheduleQty||0};
        });
        setCustomers(custs); setSchedules(sched);
      } catch(e) { console.error(e); }
    }
    loadData();
  }, [activeUnit]);
  const [view, setView] = useState('list'); // list | new | detail
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selBatch, setSelBatch] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const isOwner = userProfile?.email === 'owner@alubee.com';
  const isMD    = userProfile?.email === 'md@alubee.com';
  const isPPC   = !isOwner && !isMD;
  const colName = `schedule_revisions_${activeUnit==='u2'?'u2':'u1'}`;
  const now = new Date();

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, colName),
          orderBy('createdAt','desc'), limit(50)
        ));
        setBatches(snap.docs.map(d=>({id:d.id,...d.data()})));
      } catch(e) { setBatches([]); }
      setLoading(false);
    }
    load();
  }, [colName, refreshKey]);

  const statusColor = s => s==='approved'?C.green:s==='rejected'?C.red:s==='pending_md'?C.purple:C.amber;
  const statusBg    = s => s==='approved'?'rgba(34,197,94,0.1)':s==='rejected'?'rgba(239,68,68,0.1)':s==='pending_md'?'rgba(167,139,250,0.1)':'rgba(245,158,11,0.1)';
  const statusLabel = s => s==='approved'?'✅ Approved':s==='rejected'?'❌ Rejected':s==='pending_md'?'⏳ Awaiting MD':'⏳ Awaiting Owner';

  async function approve(batch) {
    try {
      if (isOwner && batch.status==='pending_owner') {
        await updateDoc(doc(db,colName,batch.id), {
          status:'pending_md', ownerApprovedAt:new Date(), ownerApprovedBy:userProfile.name
        });
        await createNotification(activeUnit||'u1', NOTIF_TYPES.CUSTOMER_SCHEDULE, {
          title:`📋 Schedule Revision Batch — Awaiting MD Approval`,
          message:`Batch of ${batch.lines?.length} revision(s) by ${batch.raisedBy}. Net impact: ${batch.netRevImpact>=0?'+':''}${fmtL(batch.netRevImpact)}. Owner approved.`,
          pendingApproval:true,
        });
      } else if (isMD && batch.status==='pending_md') {
        // Apply all schedule changes
        const yr = now.getFullYear(); const mo = now.getMonth();
        for (const line of (batch.lines||[])) {
          const id = `${yr}_${String(mo+1).padStart(2,'0')}_${line.custId}_${line.partNo.replace(/[\s'./]/g,'_')}`;
          await setDoc(doc(db,`customer_schedules${activeUnit==='u2'?'_u2':''}`,id), {
            year:yr, month:mo, custId:line.custId, partNo:line.partNo,
            scheduleQty:line.revisedQty, wipQty:0,
            updatedAt:new Date(), updatedBy:`Revision Batch — MD Approved`,
          }, {merge:true});
        }
        await updateDoc(doc(db,colName,batch.id), {
          status:'approved', mdApprovedAt:new Date(), mdApprovedBy:userProfile.name
        });
        await createNotification(activeUnit||'u1', NOTIF_TYPES.CUSTOMER_SCHEDULE, {
          title:`✅ Schedule Revision Approved — ${batch.lines?.length} changes applied`,
          message:`All schedules updated for ${now.toLocaleString('en-IN',{month:'long',year:'numeric'})}. Net revenue impact: ${fmtL(batch.netRevImpact)}.`,
        });
      }
      setRefreshKey(k=>k+1);
      setSelBatch(null); setView('list');
    } catch(e) { alert('Failed: '+e.message); }
  }

  async function reject(batch) {
    const reason = window.prompt('Rejection reason (required):');
    if (!reason) return;
    await updateDoc(doc(db,colName,batch.id), {
      status:'rejected', rejectedAt:new Date(),
      rejectedBy:userProfile.name, rejectionReason:reason,
    });
    setRefreshKey(k=>k+1);
    setSelBatch(null); setView('list');
  }

  // ── BATCH DETAIL VIEW ──────────────────────────────────────────────────────
  if (view==='detail' && selBatch) {
    const b = selBatch;
    const canAct = (isOwner&&b.status==='pending_owner')||(isMD&&b.status==='pending_md');
    return (
      <div style={{minHeight:'100vh',background:C.bg,fontFamily:'Inter,system-ui,sans-serif',color:C.text}}>
        <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:'14px 20px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:10}}>
          <button onClick={()=>{setView('list');setSelBatch(null);}} style={{background:'rgba(255,255,255,0.08)',border:'none',borderRadius:8,color:C.text,padding:'6px 14px',cursor:'pointer',fontFamily:'inherit',fontSize:13}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:16,color:C.text}}>🔄 Revision Batch Detail</div>
            <div style={{fontSize:11,color:C.sub}}>Raised by {b.raisedBy} · {b.createdAt?.toDate?.()?.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})||'—'}</div>
          </div>
          <span style={{background:statusBg(b.status),color:statusColor(b.status),border:`1px solid ${statusColor(b.status)}44`,borderRadius:20,padding:'4px 14px',fontSize:11,fontWeight:800}}>{statusLabel(b.status)}</span>
        </div>

        <div style={{padding:'16px 20px',maxWidth:1000,margin:'0 auto'}}>
          {/* Net Impact Summary */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
            {[
              {l:'Total Lines',      v:b.lines?.length||0,         c:C.text},
              {l:'Qty Increase',     v:'+'+fmtK(b.lines?.filter(l=>l.qtyChange>0).reduce((a,l)=>a+l.qtyChange,0)||0),  c:C.green},
              {l:'Qty Reduction',    v:'-'+fmtK(Math.abs(b.lines?.filter(l=>l.qtyChange<0).reduce((a,l)=>a+l.qtyChange,0)||0)), c:C.red},
              {l:'Net Revenue Impact',v:(b.netRevImpact>=0?'+':'')+fmtL(b.netRevImpact||0), c:b.netRevImpact>=0?C.green:C.red},
            ].map(k=>(
              <div key={k.l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px',textAlign:'center'}}>
                <div style={{fontSize:20,fontWeight:900,color:k.c}}>{k.v}</div>
                <div style={{fontSize:9,color:C.sub,marginTop:3,textTransform:'uppercase',fontWeight:700}}>{k.l}</div>
              </div>
            ))}
          </div>

          {/* Notes + Reason */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 16px',marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:12,color:C.amber,marginBottom:4}}>Primary Reason</div>
            <div style={{color:C.text,fontSize:13}}>{b.primaryReason}</div>
            {b.notes&&<div style={{fontSize:11,color:C.sub,marginTop:6}}>📝 {b.notes}</div>}
          </div>

          {/* Lines table */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.border}`,fontWeight:800,fontSize:13,color:C.text}}>
              Line Items — {b.lines?.length} change{b.lines?.length!==1?'s':''}
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:700}}>
                <thead>
                  <tr style={{background:C.raised}}>
                    {['Customer','Part','Current Qty','Revised Qty','Qty Change','Rate','Rev Impact','Part Reason'].map(h=>(
                      <th key={h} style={{padding:'8px 10px',color:C.sub,fontWeight:700,textAlign:'left',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(b.lines||[]).map((line,i)=>(
                    <tr key={i} style={{background:i%2===0?'transparent':C.raised}}>
                      <td style={{padding:'8px 10px',fontWeight:700,color:C.text,borderBottom:`1px solid ${C.border}`}}>{line.custName}</td>
                      <td style={{padding:'8px 10px',borderBottom:`1px solid ${C.border}`}}>
                        <div style={{fontWeight:700,color:C.text}}>{line.partName}</div>
                        <div style={{fontSize:9,color:C.sub}}>{line.partNo}</div>
                      </td>
                      <td style={{padding:'8px 10px',color:C.sub,borderBottom:`1px solid ${C.border}`}}>{(line.currentQty||0).toLocaleString('en-IN')}</td>
                      <td style={{padding:'8px 10px',color:C.teal,fontWeight:800,borderBottom:`1px solid ${C.border}`}}>{line.revisedQty.toLocaleString('en-IN')}</td>
                      <td style={{padding:'8px 10px',fontWeight:800,borderBottom:`1px solid ${C.border}`,color:line.qtyChange>0?C.green:line.qtyChange<0?C.red:C.sub}}>
                        {line.qtyChange>0?'+':''}{line.qtyChange.toLocaleString('en-IN')}
                      </td>
                      <td style={{padding:'8px 10px',color:C.sub,borderBottom:`1px solid ${C.border}`}}>₹{line.rate}</td>
                      <td style={{padding:'8px 10px',fontWeight:800,borderBottom:`1px solid ${C.border}`,color:line.revImpact>=0?C.green:C.red}}>
                        {line.revImpact>=0?'+':''}{fmtL(line.revImpact)}
                      </td>
                      <td style={{padding:'8px 10px',color:C.sub,fontSize:10,borderBottom:`1px solid ${C.border}`}}>{line.partReason||b.primaryReason}</td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr style={{background:C.raised,fontWeight:900}}>
                    <td colSpan={3} style={{padding:'9px 10px',color:C.text,fontWeight:900}}>TOTAL</td>
                    <td style={{padding:'9px 10px'}}/>
                    <td style={{padding:'9px 10px',color:C.text,fontWeight:900}}>
                      {(b.lines||[]).reduce((a,l)=>a+l.qtyChange,0)>0?'+':''}{((b.lines||[]).reduce((a,l)=>a+l.qtyChange,0)).toLocaleString('en-IN')}
                    </td>
                    <td style={{padding:'9px 10px'}}/>
                    <td style={{padding:'9px 10px',color:b.netRevImpact>=0?C.green:C.red,fontWeight:900}}>
                      {b.netRevImpact>=0?'+':''}{fmtL(b.netRevImpact)}
                    </td>
                    <td/>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Approval trail */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 16px',marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:12,color:C.sub,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Approval Trail</div>
            {[
              {label:'Raised',    by:b.raisedBy,     at:b.createdAt?.toDate?.(),     done:true},
              {label:'Owner',     by:b.ownerApprovedBy||'Pending', at:b.ownerApprovedAt, done:!!b.ownerApprovedAt},
              {label:'MD',        by:b.mdApprovedBy||'Pending',   at:b.mdApprovedAt,    done:!!b.mdApprovedAt},
            ].map((step,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 0',borderBottom:i<2?`1px solid ${C.border}`:'none'}}>
                <div style={{width:24,height:24,borderRadius:'50%',background:step.done?C.green:'rgba(100,116,139,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0}}>
                  {step.done?'✓':'○'}
                </div>
                <div style={{flex:1}}>
                  <span style={{fontWeight:700,color:step.done?C.text:C.sub,fontSize:12}}>{step.label}</span>
                  {step.by&&<span style={{color:C.sub,fontSize:11}}> · {step.by}</span>}
                </div>
                <div style={{fontSize:10,color:C.sub}}>{step.at?.toLocaleDateString?.('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})||'—'}</div>
              </div>
            ))}
            {b.rejectionReason&&<div style={{marginTop:8,color:C.red,fontSize:11,fontWeight:600}}>❌ Rejection reason: {b.rejectionReason}</div>}
          </div>

          {canAct&&(
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>reject(b)}
                style={{flex:1,padding:'12px',borderRadius:10,border:`1px solid ${C.red}44`,background:'rgba(239,68,68,0.08)',color:C.red,fontWeight:800,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>
                ❌ Reject
              </button>
              <button onClick={()=>approve(b)}
                style={{flex:2,padding:'12px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#22c55e,#16a34a)',color:'#fff',fontWeight:900,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>
                {isMD?'✅ Approve & Apply All Schedules':'✅ Approve — Send to MD'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── NEW BATCH FORM ─────────────────────────────────────────────────────────
  if (view==='new') {
    return <NewBatchForm
      customers={customers} schedules={schedules}
      userProfile={userProfile} activeUnit={activeUnit}
      onBack={()=>setView('list')}
      onSaved={()=>{setView('list');setRefreshKey(k=>k+1);}}
    />;
  }

  // ── BATCH LIST ─────────────────────────────────────────────────────────────
  const pendingForMe = batches.filter(b=>
    (isOwner&&b.status==='pending_owner')||(isMD&&b.status==='pending_md')
  );

  return (
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:'Inter,system-ui,sans-serif',color:C.text}}>
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:'14px 20px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:10}}>
        <button onClick={onBack} style={{background:'rgba(255,255,255,0.08)',border:'none',borderRadius:8,color:C.text,padding:'6px 14px',cursor:'pointer',fontFamily:'inherit',fontSize:13}}>← Back</button>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,fontSize:17,color:C.text}}>🔄 Schedule Revision</div>
          <div style={{fontSize:11,color:C.sub,marginTop:1}}>Mid-month schedule review · One batch per month · Owner → MD approval</div>
        </div>
        {isPPC&&(
          <button onClick={()=>setView('new')}
            style={{padding:'8px 18px',borderRadius:9,border:'none',background:'linear-gradient(135deg,#22c55e,#16a34a)',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
            + New Revision Batch
          </button>
        )}
      </div>

      <div style={{padding:'16px 20px',maxWidth:900,margin:'0 auto'}}>
        {/* Pending actions for owner/MD */}
        {pendingForMe.length>0&&(
          <div style={{background:'rgba(245,158,11,0.08)',border:`1px solid ${C.amber}44`,borderRadius:12,padding:'12px 16px',marginBottom:16}}>
            <div style={{fontWeight:800,color:C.amber,fontSize:13,marginBottom:8}}>⏳ {pendingForMe.length} batch{pendingForMe.length>1?'es':''} awaiting your approval</div>
            {pendingForMe.map(b=>(
              <div key={b.id} onClick={()=>{setSelBatch(b);setView('detail');}}
                style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}>
                <div>
                  <span style={{fontWeight:700,color:C.text,fontSize:12}}>Batch by {b.raisedBy}</span>
                  <span style={{color:C.sub,fontSize:11}}> · {b.lines?.length} change{b.lines?.length!==1?'s':''}</span>
                </div>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <span style={{color:b.netRevImpact>=0?C.green:C.red,fontWeight:800,fontSize:12}}>{b.netRevImpact>=0?'+':''}{fmtL(b.netRevImpact)}</span>
                  <span style={{color:C.amber,fontSize:11}}>→</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading&&<div style={{textAlign:'center',padding:40,color:C.sub}}>Loading…</div>}

        {!loading&&batches.length===0&&(
          <div style={{textAlign:'center',padding:60,color:C.sub}}>
            <div style={{fontSize:40,marginBottom:12}}>🔄</div>
            <div style={{fontWeight:700,fontSize:14}}>No revision batches yet</div>
            {isPPC&&<div style={{fontSize:12,marginTop:4}}>Click "+ New Revision Batch" to raise the first one</div>}
          </div>
        )}

        {batches.map(b=>(
          <div key={b.id} onClick={()=>{setSelBatch(b);setView('detail');}}
            style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 16px',marginBottom:10,cursor:'pointer',transition:'border-color 0.2s'}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.orange}
            onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div>
                <div style={{fontWeight:800,fontSize:13,color:C.text}}>
                  Batch — {b.createdAt?.toDate?.()?.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})||'—'}
                </div>
                <div style={{fontSize:11,color:C.sub,marginTop:2}}>By {b.raisedBy} · {b.lines?.length} line{b.lines?.length!==1?'s':''} · {b.primaryReason}</div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{fontWeight:900,fontSize:14,color:b.netRevImpact>=0?C.green:C.red}}>{b.netRevImpact>=0?'+':''}{fmtL(b.netRevImpact)}</span>
                <span style={{background:statusBg(b.status),color:statusColor(b.status),border:`1px solid ${statusColor(b.status)}44`,borderRadius:20,padding:'2px 10px',fontSize:10,fontWeight:800}}>{statusLabel(b.status)}</span>
              </div>
            </div>
            {/* Mini customer summary */}
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {Object.entries((b.lines||[]).reduce((a,l)=>{if(!a[l.custName])a[l.custName]=0;a[l.custName]++;return a;},{})).map(([cust,cnt])=>(
                <span key={cust} style={{background:C.raised,color:C.sub,borderRadius:6,padding:'2px 8px',fontSize:10}}>{cust} ({cnt})</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── NEW BATCH FORM ─────────────────────────────────────────────────────────────
function NewBatchForm({ customers, schedules, userProfile, activeUnit, onBack, onSaved }) {
  const [primaryReason, setPrimaryReason] = useState(REVISION_REASONS[0]);
  const [notes, setNotes]       = useState('');
  const [lines, setLines]       = useState([]); // selected revision lines
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');

  // Build flat list of all customer+part combos
  const allParts = (customers||[]).flatMap(c =>
    (c.parts||[]).map(p => ({
      custId:c.id, custName:c.name, partNo:p.partNo,
      partName:p.partName||p.partNo, rate:p.rate||0,
      currentQty: (schedules[c.id]||{})[p.partNo]?.scheduleQty||0,
    }))
  ).filter(p => p.currentQty > 0 || true); // show all

  const filtered = search
    ? allParts.filter(p => p.custName.toLowerCase().includes(search.toLowerCase()) ||
                           p.partNo.toLowerCase().includes(search.toLowerCase()) ||
                           p.partName.toLowerCase().includes(search.toLowerCase()))
    : allParts;

  const isSelected = (custId, partNo) => lines.some(l=>l.custId===custId&&l.partNo===partNo);
  const getLine    = (custId, partNo) => lines.find(l=>l.custId===custId&&l.partNo===partNo);

  function toggle(p) {
    if (isSelected(p.custId, p.partNo)) {
      setLines(prev=>prev.filter(l=>!(l.custId===p.custId&&l.partNo===p.partNo)));
    } else {
      setLines(prev=>[...prev, {
        custId:p.custId, custName:p.custName, partNo:p.partNo,
        partName:p.partName, rate:p.rate, currentQty:p.currentQty,
        revisedQty:p.currentQty, partReason:'',
      }]);
    }
  }
  function updateLine(custId, partNo, k, v) {
    setLines(prev=>prev.map(l=>l.custId===custId&&l.partNo===partNo?{...l,[k]:v}:l));
  }

  // Compute impacts
  const enriched = lines.map(l => ({
    ...l,
    revisedQty: parseInt(l.revisedQty)||0,
    qtyChange: (parseInt(l.revisedQty)||0) - (l.currentQty||0),
    revImpact: ((parseInt(l.revisedQty)||0) - (l.currentQty||0)) * (l.rate||0),
  }));
  const netRevImpact = enriched.reduce((a,l)=>a+l.revImpact, 0);
  const netQtyChange = enriched.reduce((a,l)=>a+l.qtyChange, 0);

  async function submit() {
    if (enriched.length===0) return alert('Add at least one revision line');
    if (enriched.some(l=>l.revisedQty<0)) return alert('Revised quantity cannot be negative');
    setSaving(true);
    try {
      const colName = `schedule_revisions_${activeUnit==='u2'?'u2':'u1'}`;
      await addDoc(collection(db, colName), {
        raisedBy: userProfile?.name||'PPC',
        raisedByEmail: userProfile?.email||'',
        primaryReason, notes,
        lines: enriched,
        netRevImpact, netQtyChange,
        status:'pending_owner',
        createdAt: serverTimestamp(),
      });
      await createNotification(activeUnit||'u1', NOTIF_TYPES.CUSTOMER_SCHEDULE, {
        title:`🔄 Schedule Revision Batch — ${enriched.length} change${enriched.length!==1?'s':''}`,
        message:`Raised by ${userProfile?.name}. Reason: ${primaryReason}. Net revenue impact: ${netRevImpact>=0?'+':''}${fmtL(netRevImpact)}. Awaiting your approval.`,
        pendingApproval:true,
      });
      onSaved();
    } catch(e) { alert('Submit failed: '+e.message); }
    setSaving(false);
  }

  return (
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:'Inter,system-ui,sans-serif',color:C.text}}>
      {/* Header */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:'14px 20px',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
          <button onClick={onBack} style={{background:'rgba(255,255,255,0.08)',border:'none',borderRadius:8,color:C.text,padding:'6px 14px',cursor:'pointer',fontFamily:'inherit',fontSize:13}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:16,color:C.text}}>🔄 New Revision Batch</div>
            <div style={{fontSize:11,color:C.sub}}>Select parts across any customer · One submission → Owner → MD</div>
          </div>
        </div>
        {/* Live impact strip */}
        <div style={{display:'flex',gap:10}}>
          {[
            {l:'Parts selected',    v:enriched.length,                          c:C.text},
            {l:'Net qty change',    v:(netQtyChange>=0?'+':'')+fmtK(netQtyChange), c:netQtyChange>=0?C.green:C.red},
            {l:'Revenue impact',   v:(netRevImpact>=0?'+':'')+fmtL(netRevImpact), c:netRevImpact>=0?C.green:C.red},
          ].map(k=>(
            <div key={k.l} style={{background:C.raised,borderRadius:8,padding:'6px 14px',textAlign:'center'}}>
              <div style={{fontWeight:900,fontSize:15,color:k.c}}>{k.v}</div>
              <div style={{fontSize:9,color:C.sub,textTransform:'uppercase',fontWeight:700}}>{k.l}</div>
            </div>
          ))}
          <div style={{flex:1}}/>
          <button onClick={submit} disabled={saving||enriched.length===0}
            style={{padding:'8px 20px',borderRadius:9,border:'none',background:enriched.length===0?'#374151':'linear-gradient(135deg,#22c55e,#16a34a)',color:'#fff',fontWeight:800,fontSize:13,cursor:saving||enriched.length===0?'not-allowed':'pointer',fontFamily:'inherit'}}>
            {saving?'⏳ Submitting…':`🚀 Submit for Approval`}
          </button>
        </div>
      </div>

      <div style={{padding:'16px 20px',maxWidth:1000,margin:'0 auto'}}>
        {/* Reason + Notes */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:C.sub,textTransform:'uppercase',marginBottom:4}}>Primary Reason for Revision</div>
            <select style={{...inp,cursor:'pointer'}} value={primaryReason} onChange={e=>setPrimaryReason(e.target.value)}>
              {REVISION_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:C.sub,textTransform:'uppercase',marginBottom:4}}>Additional Notes (Optional)</div>
            <input style={inp} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any additional context…"/>
          </div>
        </div>

        {/* Selected lines summary */}
        {enriched.length>0&&(
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.border}`,fontWeight:800,fontSize:12,color:C.text}}>
              ✅ Selected — {enriched.length} part{enriched.length!==1?'s':''}
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead><tr style={{background:C.raised}}>
                {['Customer','Part','Current','Revised','Change','Rev Impact','Part Reason',''].map(h=>(
                  <th key={h} style={{padding:'6px 10px',color:C.sub,fontWeight:700,textAlign:'left',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {enriched.map((l,i)=>(
                  <tr key={i}>
                    <td style={{padding:'6px 10px',color:C.text,borderBottom:`1px solid ${C.border}`,fontWeight:600}}>{l.custName}</td>
                    <td style={{padding:'6px 10px',borderBottom:`1px solid ${C.border}`}}>
                      <div style={{fontWeight:700,color:C.text,fontSize:11}}>{l.partName}</div>
                      <div style={{fontSize:9,color:C.sub}}>{l.partNo}</div>
                    </td>
                    <td style={{padding:'6px 10px',color:C.sub,borderBottom:`1px solid ${C.border}`}}>{(l.currentQty||0).toLocaleString('en-IN')}</td>
                    <td style={{padding:'6px 10px',borderBottom:`1px solid ${C.border}`}}>
                      <input type="number" min={0} style={{...inp,width:90,textAlign:'center',color:C.teal,fontWeight:800,padding:'3px 6px'}}
                        value={l.revisedQty} onChange={e=>updateLine(l.custId,l.partNo,'revisedQty',e.target.value)}/>
                    </td>
                    <td style={{padding:'6px 10px',fontWeight:800,borderBottom:`1px solid ${C.border}`,color:l.qtyChange>0?C.green:l.qtyChange<0?C.red:C.sub}}>
                      {l.qtyChange>0?'+':''}{l.qtyChange.toLocaleString('en-IN')}
                    </td>
                    <td style={{padding:'6px 10px',fontWeight:800,borderBottom:`1px solid ${C.border}`,color:l.revImpact>=0?C.green:C.red}}>
                      {l.revImpact>=0?'+':''}{fmtL(l.revImpact)}
                    </td>
                    <td style={{padding:'6px 10px',borderBottom:`1px solid ${C.border}`}}>
                      <input style={{...inp,padding:'3px 6px',width:140,fontSize:10}} value={l.partReason||''} placeholder="Part-specific reason" onChange={e=>updateLine(l.custId,l.partNo,'partReason',e.target.value)}/>
                    </td>
                    <td style={{padding:'6px 10px',borderBottom:`1px solid ${C.border}`}}>
                      <button onClick={()=>toggle(l)} style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:14}}>✕</button>
                    </td>
                  </tr>
                ))}
                <tr style={{background:C.raised}}>
                  <td colSpan={4} style={{padding:'7px 10px',fontWeight:900,color:C.text}}>TOTAL</td>
                  <td style={{padding:'7px 10px',fontWeight:900,color:netQtyChange>=0?C.green:C.red}}>{netQtyChange>=0?'+':''}{netQtyChange.toLocaleString('en-IN')}</td>
                  <td style={{padding:'7px 10px',fontWeight:900,color:netRevImpact>=0?C.green:C.red}}>{netRevImpact>=0?'+':''}{fmtL(netRevImpact)}</td>
                  <td colSpan={2}/>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Search + Part selector */}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:10,fontWeight:700,color:C.sub,textTransform:'uppercase',marginBottom:6}}>Add Parts — Search across all customers</div>
          <input style={{...inp,marginBottom:10}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customer name or part number…"/>
        </div>

        {/* Group by customer */}
        {Object.entries(
          filtered.reduce((a,p)=>{
            if(!a[p.custName])a[p.custName]=[];
            a[p.custName].push(p);
            return a;
          },{})
        ).map(([custName,parts])=>(
          <div key={custName} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden',marginBottom:8}}>
            <div style={{padding:'8px 14px',borderBottom:`1px solid ${C.border}`,fontWeight:800,fontSize:12,color:C.amber}}>{custName}</div>
            {parts.map(p=>{
              const sel = isSelected(p.custId, p.partNo);
              const line = getLine(p.custId, p.partNo);
              return (
                <div key={p.partNo} style={{padding:'8px 14px',borderBottom:`1px solid ${C.border}`,background:sel?'rgba(45,212,191,0.04)':'transparent',display:'flex',alignItems:'center',gap:10}}>
                  <input type="checkbox" checked={sel} onChange={()=>toggle(p)} style={{width:16,height:16,cursor:'pointer',flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,color:C.text,fontSize:12}}>{p.partName}</div>
                    <div style={{fontSize:10,color:C.sub}}>{p.partNo} · Current schedule: {p.currentQty.toLocaleString('en-IN')} · Rate: ₹{p.rate}</div>
                  </div>
                  {sel&&(
                    <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                      <span style={{fontSize:10,color:C.sub}}>Revised:</span>
                      <input type="number" min={0}
                        style={{...inp,width:90,textAlign:'center',color:C.teal,fontWeight:800,padding:'3px 8px'}}
                        value={line?.revisedQty??p.currentQty}
                        onChange={e=>updateLine(p.custId,p.partNo,'revisedQty',e.target.value)}/>
                      <span style={{fontSize:11,fontWeight:800,color:(parseInt(line?.revisedQty||p.currentQty)-p.currentQty)>=0?C.green:C.red,minWidth:60}}>
                        {((parseInt(line?.revisedQty||p.currentQty)-p.currentQty)>=0?'+':'')}{(parseInt(line?.revisedQty||p.currentQty)-p.currentQty).toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HISTORY MIGRATION (global — all customers) ────────────────────────────────
export function GlobalHistoryMigration({ activeUnit, onBack }) {
  const [customers, setCustomers] = useState([]);
  useEffect(() => {
    async function load() {
      try {
        const { getDocs, collection } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        const u = activeUnit||'u1';
        const snap = await getDocs(collection(db, u==='u2'?'customer_master_u2':'customer_master'));
        setCustomers(snap.docs.map(d=>({id:d.id,...d.data()})).filter(c=>c.parts?.length>0));
      } catch(e) {}
    }
    load();
  }, [activeUnit]);
  const months = getMonths();
  const [data, setData] = useState(() => {
    const init = {};
    (customers||[]).forEach(c => {
      (c.parts||[]).forEach(p => {
        const key = `${c.id}__${p.partNo}`;
        init[key] = { custId:c.id, custName:c.name, partNo:p.partNo, partName:p.partName||p.partNo };
        months.forEach(m => { init[key][m.key] = ''; });
      });
    });
    return init;
  });
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [search, setSearch]   = useState('');
  const [custFilter, setCustFilter] = useState('');

  const keys = Object.keys(data).filter(k => {
    const r = data[k];
    if (custFilter && r.custId !== custFilter) return false;
    if (search && !r.partNo.toLowerCase().includes(search.toLowerCase()) &&
        !r.partName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function upd(key, monthKey, val) {
    setData(d => ({ ...d, [key]: { ...d[key], [monthKey]: val } }));
  }

  async function save() {
    setSaving(true);
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      const col = `customer_history_${activeUnit==='u2'?'u2':'u1'}`;
      let count = 0;
      for (const key of Object.keys(data)) {
        const row = data[key];
        const hasData = months.some(m => row[m.key] !== '' && row[m.key] !== null);
        if (!hasData) continue;
        for (const m of months) {
          const qty = parseInt(row[m.key]) || 0;
          const docId = `${row.custId}_${row.partNo.replace(/[^a-zA-Z0-9]/g,'_')}_${m.key}`;
          await setDoc(doc(db, col, docId), {
            custId:row.custId, custName:row.custName,
            partNo:row.partNo, partName:row.partName,
            monthKey:m.key, qty,
            updatedAt: new Date(),
          });
          count++;
        }
      }
      setSaved(true);
      alert(`✅ Saved ${count} history records successfully!`);
    } catch(e) { alert('Save failed: '+e.message); }
    setSaving(false);
  }

  const custList = [...new Set((customers||[]).map(c=>c.id))].map(id=>({id,name:(customers||[]).find(c=>c.id===id)?.name}));
  const inpS = { ...inp, padding:'4px 6px', fontSize:11, textAlign:'center', width:70 };
  const [xlStatus, setXlStatus] = useState('');
  const [xlLoading, setXlLoading] = useState(false);

  async function handleExcelUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setXlLoading(true);
    setXlStatus('Reading Excel…');
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb2 = XLSX.read(buf, {type:'array'});
      let matched = 0, skipped = 0;
      // Read each customer sheet
      wb2.SheetNames.forEach(sheetName => {
        if (sheetName.startsWith('📋') || sheetName.startsWith('📤')) return;
        const ws2 = wb2.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws2, {header:1, defval:''});
        if (rows.length < 5) return;
        // Row 4 (index 3) = headers: Cust ID, Part Number, Part Name, Month1…Month6, Avg
        const hdrs = rows[3];
        // Data rows start at index 4
        for (let ri = 4; ri < rows.length; ri++) {
          const row = rows[ri];
          const custId = String(row[0]||'').trim();
          const partNo  = String(row[1]||'').trim();
          if (!custId || !partNo) continue;
          const key = `${custId}__${partNo}`;
          if (!data[key]) { skipped++; continue; }
          // Month values start at col index 3
          months.forEach((m, mi) => {
            const raw = row[3 + mi];
            const qty = raw !== '' && raw !== null ? parseInt(raw)||0 : '';
            setData(d => ({ ...d, [key]: { ...d[key], [m.key]: qty===0?'':qty } }));
          });
          matched++;
        }
      });
      setXlStatus(`✅ Loaded ${matched} rows. ${skipped} unrecognised rows skipped.`);
    } catch(err) {
      setXlStatus('❌ Failed to read Excel: ' + err.message);
    }
    setXlLoading(false);
    e.target.value = '';
  }

  return (
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:'Inter,system-ui,sans-serif',color:C.text}}>
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:'14px 20px',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
          <button onClick={onBack} style={{background:'rgba(255,255,255,0.08)',border:'none',borderRadius:8,color:C.text,padding:'6px 14px',cursor:'pointer',fontFamily:'inherit',fontSize:13}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:16,color:C.text}}>📥 Migrate Historical Intake — All Customers</div>
            <div style={{fontSize:11,color:C.sub,marginTop:1}}>Upload the filled Excel template — data auto-fills below. Review then save.</div>
          </div>
          <button onClick={save} disabled={saving}
            style={{padding:'8px 20px',borderRadius:9,border:'none',background:saving?'#374151':'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',fontWeight:800,fontSize:13,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
            {saving?'⏳ Saving All…':'💾 Save All to Firestore'}
          </button>
        </div>

        {/* Excel Upload */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,padding:'10px 14px',background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:10}}>
          <div style={{fontSize:24}}>📂</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:12,color:'#a5b4fc'}}>Upload Filled Excel Template</div>
            <div style={{fontSize:10,color:C.sub}}>Upload the Excel file PPC filled. Data will auto-populate the grid below.</div>
          </div>
          <label style={{padding:'8px 18px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#6366f1,#4f46e5)',color:'#fff',fontWeight:800,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
            {xlLoading?'⏳ Reading…':'📂 Choose Excel File'}
            <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} style={{display:'none'}} disabled={xlLoading}/>
          </label>
          {xlStatus&&<div style={{fontSize:11,color:xlStatus.startsWith('✅')?C.green:xlStatus.startsWith('❌')?C.red:'#a5b4fc',fontWeight:600,maxWidth:220}}>{xlStatus}</div>}
        </div>

        {/* Filters */}
        <div style={{display:'flex',gap:8}}>
          <select style={{...inp,width:'auto',cursor:'pointer'}} value={custFilter} onChange={e=>setCustFilter(e.target.value)}>
            <option value=''>All Customers</option>
            {custList.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input style={{...inp,flex:1}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search part number or name…"/>
        </div>
      </div>

      <div style={{padding:'16px 20px',maxWidth:1100,margin:'0 auto',overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:800}}>
          <thead>
            <tr style={{background:C.raised}}>
              <th style={{padding:'8px 10px',textAlign:'left',color:C.sub,fontWeight:700,borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap',minWidth:160}}>Customer</th>
              <th style={{padding:'8px 10px',textAlign:'left',color:C.sub,fontWeight:700,borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap',minWidth:140}}>Part</th>
              {months.map(m=><th key={m.key} style={{padding:'8px 10px',textAlign:'center',color:C.amber,fontWeight:700,borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{m.label}</th>)}
              <th style={{padding:'8px 10px',textAlign:'center',color:C.teal,fontWeight:700,borderBottom:`1px solid ${C.border}`}}>6M Avg</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key,i) => {
              const row = data[key];
              const vals = months.map(m=>parseInt(row[m.key])||0);
              const nonZero = vals.filter(v=>v>0);
              const avg = nonZero.length>0?Math.round(nonZero.reduce((a,v)=>a+v,0)/nonZero.length):0;
              return (
                <tr key={key} style={{background:i%2===0?'transparent':C.raised}}>
                  <td style={{padding:'7px 10px',fontWeight:700,color:C.text,borderBottom:`1px solid ${C.border}`}}>
                    <div style={{fontSize:11}}>{row.custName}</div>
                  </td>
                  <td style={{padding:'7px 10px',borderBottom:`1px solid ${C.border}`}}>
                    <div style={{fontWeight:700,color:C.text,fontSize:11}}>{row.partName}</div>
                    <div style={{fontSize:9,color:C.sub}}>{row.partNo}</div>
                  </td>
                  {months.map(m=>(
                    <td key={m.key} style={{padding:'4px 6px',borderBottom:`1px solid ${C.border}`,textAlign:'center'}}>
                      <input type="number" min={0} style={inpS}
                        value={row[m.key]??''}
                        onChange={e=>upd(key,m.key,e.target.value)}/>
                    </td>
                  ))}
                  <td style={{padding:'7px 10px',textAlign:'center',fontWeight:800,color:C.teal,borderBottom:`1px solid ${C.border}`}}>
                    {avg>0?avg.toLocaleString('en-IN'):'—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
