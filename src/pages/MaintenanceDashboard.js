import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, query, orderBy, onSnapshot, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { createNotification, NOTIF_TYPES } from '../utils/notificationService';

const JMD_EMAIL  = 'owner@alubee.com';
const MD_EMAIL   = 'md@alubee.com';
const PPC_EMAILS = ['gopi@alubee.com','udhay@alubee.com'];
const PPC_EMAIL  = 'gopi@alubee.com';

const PDC_MACHINES = [
  '125T-01','125T-02','125T-03','125T-04','125T-05','125T-06','125T-07',
  '250T-01','350T-01','350T-02','350T-03','350T-04',
];
const PDC_ASSIGNEES = [
  {name:'Mahendhiran', email:'mahendhiran@alubee.com'},
  {name:'Kalaivanan',  email:'kalaivanan@alubee.com'},
];
const GEN_ASSIGNEES = [
  {name:'Murugesh', email:'murugesh@alubee.com'},
  {name:'Kandhan',  email:'kandhan@alubee.com'},
];
const MAINT_DEPTS    = ['Fettling','CNC / VMC','Secondary','Assembly','Dispatch','Stores','Toolroom','Shot Blasting','Maintenance','Accounts','HR / Admin','Security','PDC Support','Other'];
const MAINT_PRIORITY = ['Critical — Line down / Safety risk','High — Will stop soon','Normal — Planned fix'];
const PRIORITY_COLOR = p => p?.includes('Critical')?'#dc2626':p?.includes('High')?'#d97706':'#374151';

const STATUS_STYLE = {
  Pending:   { bg:'#fffbeb', color:'#b45309', border:'#fde68a', label:'⏳ Pending'   },
  Approved:  { bg:'#f0fdf4', color:'#15803d', border:'#86efac', label:'✅ Approved'  },
  Rejected:  { bg:'#fef2f2', color:'#dc2626', border:'#fca5a5', label:'❌ Rejected'  },
  InProgress:{ bg:'#eff6ff', color:'#1e40af', border:'#bfdbfe', label:'🔧 In Progress'},
  Done:      { bg:'#f5f3ff', color:'#7c3aed', border:'#c4b5fd', label:'🎉 Done'      },
  Closed:    { bg:'#f9fafb', color:'#374151', border:'#e5e7eb', label:'🔒 Closed'    },
};

function getOverallStatus(req) {
  if (req.rejected)        return 'Rejected';
  if (req.closed)          return 'Closed';
  if (req.completedAt && !req.raisersApproval) return 'Done';
  if (req.raisersApproval === 'approved')      return 'Closed';
  if (req.inProgress)      return 'InProgress';
  const flow = req.flow || ['ppc','jmd','md'];
  for (const r of flow) { if (!req.approvals?.[r]?.status) return 'Pending'; }
  return 'Approved';
}

// ── Reason dropdown hook ──────────────────────────────────────────────────────
const DEFAULT_REASONS = [
  // ── Die Related ──────────────────────────────────────────────────────────────
  {category:'Die Related',        reason:'Die Change — Planned (Schedule)'},
  {category:'Die Related',        reason:'Die Change — Unplanned (Breakdown)'},
  {category:'Die Related',        reason:'Die Repair / Crack Welding'},
  {category:'Die Related',        reason:'Die Cooling Line Choke / Leak'},
  {category:'Die Related',        reason:'Die Cooling Temperature Deviation'},
  {category:'Die Related',        reason:'Die Damage — Flash / Erosion'},
  {category:'Die Related',        reason:'First Off Approval Pending'},
  {category:'Die Related',        reason:'Die Alignment / Mismatch'},
  {category:'Die Related',        reason:'Ejector Pin Broken / Stuck'},
  {category:'Die Related',        reason:'Slide / Core Pull Malfunction'},
  // ── Machine Related ───────────────────────────────────────────────────────────
  {category:'Machine Related',    reason:'Hydraulic Oil Leak'},
  {category:'Machine Related',    reason:'Hydraulic Pump Failure'},
  {category:'Machine Related',    reason:'Hydraulic Pressure Drop'},
  {category:'Machine Related',    reason:'Shot Sleeve / Plunger Tip Wear'},
  {category:'Machine Related',    reason:'Plunger Tip Change (Scheduled)'},
  {category:'Machine Related',    reason:'Plunger Seizure'},
  {category:'Machine Related',    reason:'Toggle / Clamping Unit Failure'},
  {category:'Machine Related',    reason:'Tie Bar Crack / Broken'},
  {category:'Machine Related',    reason:'Intensification Circuit Failure'},
  {category:'Machine Related',    reason:'Shot End Accumulator Issue'},
  {category:'Machine Related',    reason:'Ejection System Failure'},
  {category:'Machine Related',    reason:'Electrical / PLC Fault'},
  {category:'Machine Related',    reason:'Control Panel / HMI Fault'},
  {category:'Machine Related',    reason:'Lubrication System Failure'},
  {category:'Machine Related',    reason:'Cooling Water Circuit Failure'},
  {category:'Machine Related',    reason:'Hydraulic Valve Malfunction'},
  {category:'Machine Related',    reason:'Machine Safety Door / Interlock Fault'},
  // ── Process Related ───────────────────────────────────────────────────────────
  {category:'Process Related',    reason:'Metal Temperature Too Low'},
  {category:'Process Related',    reason:'Die Temperature Too High'},
  {category:'Process Related',    reason:'Die Temperature Too Low'},
  {category:'Process Related',    reason:'Porosity Rejection Loop — Process Adjustment'},
  {category:'Process Related',    reason:'Cold Shut / Misrun — Parameter Reset'},
  {category:'Process Related',    reason:'Flash Excess — Process Reset'},
  {category:'Process Related',    reason:'Biscuit Thickness Deviation'},
  {category:'Process Related',    reason:'Shot Speed / Pressure Deviation'},
  {category:'Process Related',    reason:'Cycle Time Deviation Investigation'},
  {category:'Process Related',    reason:'Shrinkage Defect Investigation'},
  // ── Utility ───────────────────────────────────────────────────────────────────
  {category:'Utility',            reason:'Power Cut / EB Failure'},
  {category:'Utility',            reason:'Generator Startup Delay'},
  {category:'Utility',            reason:'Compressor Failure / Air Pressure Drop'},
  {category:'Utility',            reason:'Furnace Breakdown — Metal Holding'},
  {category:'Utility',            reason:'Furnace Temperature Deviation'},
  {category:'Utility',            reason:'Ladle / Crucible Damage'},
  {category:'Utility',            reason:'Water Supply Failure — Cooling'},
  {category:'Utility',            reason:'Overhead Crane / EOT Failure'},
  {category:'Utility',            reason:'Die Spray System Malfunction'},
  // ── Planned ───────────────────────────────────────────────────────────────────
  {category:'Planned',            reason:'Preventive Maintenance — Scheduled (PM)'},
  {category:'Planned',            reason:'Die Trial — New Die First Run'},
  {category:'Planned',           reason:'PPAP / First Article Inspection Hold'},
  {category:'Planned',            reason:'Shift Changeover / Startup Delay'},
  {category:'Planned',            reason:'Tool Change / Consumable Replacement'},
  {category:'Planned',            reason:'Training / Line Qualification Hold'},
  // ── Material Related ──────────────────────────────────────────────────────────
  {category:'Material Related',   reason:'Liquid Metal / Alloy Shortage'},
  {category:'Material Related',   reason:'Alloy Grade Change — Flush Required'},
  {category:'Material Related',   reason:'Dross / Slag Contamination — Ladle Clean'},
  {category:'Material Related',   reason:'Biscuit / Runner Jam in Cavity'},
  {category:'Material Related',   reason:'Ingot / Sow Charging Delay'},
  // ── Quality Hold ──────────────────────────────────────────────────────────────
  {category:'Quality Hold',       reason:'Customer Complaint — Production Hold'},
  {category:'Quality Hold',       reason:'Internal Rejection Spike — Investigation'},
  {category:'Quality Hold',       reason:'PPAP Documentation Hold'},
  {category:'Quality Hold',       reason:'Dimensional Deviation — Gauge Check Hold'},
  {category:'Quality Hold',       reason:'Surface Defect — Visual Inspection Hold'},
  // ── Electrical ────────────────────────────────────────────────────────────────
  {category:'Electrical',         reason:'Main Power / MCB Trip'},
  {category:'Electrical',         reason:'Motor Burnout / Failure'},
  {category:'Electrical',         reason:'Wiring Short Circuit / Loose Connection'},
  {category:'Electrical',         reason:'Control Panel / MCC Fault'},
  {category:'Electrical',         reason:'UPS / Inverter Failure'},
  {category:'Electrical',         reason:'Lighting Failure — Shop Floor / Office'},
  {category:'Electrical',         reason:'Socket / DB Board Fault'},
  {category:'Electrical',         reason:'Earthing / Grounding Issue'},
  // ── Mechanical ────────────────────────────────────────────────────────────────
  {category:'Mechanical',         reason:'Gearbox Failure'},
  {category:'Mechanical',         reason:'Belt / Chain / Coupling Failure'},
  {category:'Mechanical',         reason:'Bearing Seizure / Failure'},
  {category:'Mechanical',         reason:'Shaft Misalignment'},
  {category:'Mechanical',         reason:'Pump Failure — Water / Oil'},
  {category:'Mechanical',         reason:'Fan / Blower Motor Failure'},
  {category:'Mechanical',         reason:'Pneumatic Cylinder Failure'},
  {category:'Mechanical',         reason:'Valve / Actuator Malfunction'},
  // ── Civil / Building ──────────────────────────────────────────────────────────
  {category:'Civil / Building',   reason:'Roof Leak / Damage'},
  {category:'Civil / Building',   reason:'Floor Crack / Pothole'},
  {category:'Civil / Building',   reason:'Wall / Column Damage'},
  {category:'Civil / Building',   reason:'Drainage Blockage / Flooding'},
  {category:'Civil / Building',   reason:'Factory Door / Shutter Malfunction'},
  {category:'Civil / Building',   reason:'Window / Ventilation Damage'},
  {category:'Civil / Building',   reason:'Toilet / Washroom — Plumbing Fault'},
  {category:'Civil / Building',   reason:'Drainage Overflow'},
  // ── Pneumatic ─────────────────────────────────────────────────────────────────
  {category:'Pneumatic',          reason:'Air Leak — Pipeline / Fitting'},
  {category:'Pneumatic',          reason:'Compressor Trip / Overload'},
  {category:'Pneumatic',          reason:'Air Dryer Failure'},
  {category:'Pneumatic',          reason:'Pressure Regulator Fault'},
  {category:'Pneumatic',          reason:'Pneumatic Line Choke'},
  // ── Equipment / Tools ─────────────────────────────────────────────────────────
  {category:'Equipment / Tools',  reason:'Crane / Hoist Failure'},
  {category:'Equipment / Tools',  reason:'Forklift / Trolley Breakdown'},
  {category:'Equipment / Tools',  reason:'Conveyor / Material Handling Failure'},
  {category:'Equipment / Tools',  reason:'Welding Machine Fault'},
  {category:'Equipment / Tools',  reason:'Grinding Machine Failure'},
  {category:'Equipment / Tools',  reason:'Shot Blast Machine Breakdown'},
  {category:'Equipment / Tools',  reason:'CNC / VMC Machine Fault'},
  {category:'Equipment / Tools',  reason:'Drill / Tap Machine Fault'},
  {category:'Equipment / Tools',  reason:'Deburring Machine Fault'},
  {category:'Equipment / Tools',  reason:'Washing / Cleaning Machine Fault'},
  // ── Safety / Fire ─────────────────────────────────────────────────────────────
  {category:'Safety / Fire',      reason:'Fire Extinguisher — Expired / Faulty'},
  {category:'Safety / Fire',      reason:'Fire Alarm / Smoke Detector Fault'},
  {category:'Safety / Fire',      reason:'Safety Guard / Barrier Damaged'},
  {category:'Safety / Fire',      reason:'Emergency Exit — Blocked / Faulty'},
  {category:'Safety / Fire',      reason:'First Aid Box — Restock Required'},
  {category:'Safety / Fire',      reason:'Spill Containment Failure'},
  // ── Utilities ─────────────────────────────────────────────────────────────────
  {category:'Utilities',          reason:'Water Pump Failure'},
  {category:'Utilities',          reason:'Overhead Tank / Sump Issue'},
  {category:'Utilities',          reason:'Borewell / Water Supply Failure'},
  {category:'Utilities',          reason:'Diesel / Fuel Storage Issue'},
  {category:'Utilities',          reason:'Generator — Fuel / Battery Issue'},
  {category:'Utilities',          reason:'Exhaust / Ventilation Fan Failure'},
  {category:'Utilities',          reason:'Air Conditioner / Cooler Fault — Office / Server Room'},
];

function useReasons() {
  const [reasons, setReasons] = useState([]);
  const [seeded, setSeeded]   = useState(false);

  useEffect(()=>{
    let active = true;
    const unsub = onSnapshot(collection(db,'reason_master_u1'), async snap=>{
      if (!active) return;
      const docs = snap.docs.map(d=>({id:d.id,...d.data()}));
      if (docs.length === 0 && !seeded) {
        // Seed defaults
        setSeeded(true);
        try {
          for (const r of DEFAULT_REASONS) {
            await addDoc(collection(db,'reason_master_u1'), {...r, active:true, createdAt:serverTimestamp()});
          }
        } catch(e) { console.error('Seed failed:',e.message); }
        return;
      }
      const active_reasons = docs.filter(r=>r.active!==false);
      active_reasons.sort((a,b)=>a.category?.localeCompare(b.category)||a.reason?.localeCompare(b.reason));
      setReasons(active_reasons);
    });
    return ()=>{ active=false; unsub(); };
  },[]);

  return reasons;
}

// ── Flow Tracker ─────────────────────────────────────────────────────────────
function FlowTracker({ req }) {
  const flow  = req.flow || ['ppc','jmd','md'];
  const extra = req.assignedTo ? [{role:'assigned', label:req.assignedTo.split('|')[0], email:''}] : [];
  const allSteps = [
    ...flow.map(r=>({ role:r, label: r==='ppc'?'PPC':r==='jmd'?'JMD':r==='md'?'MD':r })),
    ...extra,
    ...(req.completedAt ? [{role:'done',   label:'Completed'}] : []),
    ...(req.raisersApproval ? [{role:'closed', label:'Raiser Conf.'}] : []),
  ];
  return (
    <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:4,marginTop:12}}>
      {allSteps.map((step,i)=>{
        const a = req.approvals?.[step.role];
        const isApproved = a?.status==='Approved' || step.role==='done' || (step.role==='closed'&&req.raisersApproval==='approved');
        const isRejected = a?.status==='Rejected' || (req.rejected && !a?.status);
        const isNext = !isApproved && !isRejected;
        return (
          <React.Fragment key={step.role}>
            {i>0 && <div style={{width:16,height:2,background:isApproved?'#16a34a':'#d1d5db',flexShrink:0}}/>}
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:60,
              background:isApproved?'#f0fdf4':isRejected?'#fef2f2':isNext?'#fffbeb':'#f9fafb',
              border:`1.5px solid ${isApproved?'#86efac':isRejected?'#fca5a5':isNext?'#fde68a':'#e5e7eb'}`,
              borderRadius:8,padding:'6px 8px'}}>
              <span style={{fontSize:16}}>{isApproved?'✅':isRejected?'❌':'⏳'}</span>
              <span style={{fontSize:10,fontWeight:800,color:isApproved?'#15803d':isRejected?'#dc2626':'#b45309',marginTop:2,textAlign:'center'}}>{step.label}</span>
              {a?.at && <span style={{fontSize:8,color:'#9ca3af',marginTop:1}}>{new Date(a.at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Maintenance Request Card ──────────────────────────────────────────────────
function MaintCard({ req, userEmail, userProfile, onRefresh }) {
  const [expanded,    setExpanded]    = useState(false);
  const [assignedTo,  setAssignedTo]  = useState(req.assignedTo || '');
  const [rejectReason,setRejectReason]= useState('');
  const [showReject,  setShowReject]  = useState(false);
  const [acting,      setActing]      = useState(false);
  const [closeNote,   setCloseNote]   = useState('');
  const [raisersNote, setRaisersNote] = useState('');

  const isPDC     = req.type === 'pdc_maintenance';
  const isPPC     = PPC_EMAILS.includes(userEmail);
  const isJMD     = userEmail === JMD_EMAIL;
  const isMD      = userEmail === MD_EMAIL;
  const isRaiser  = userEmail === req.employeeEmail;
  const isAssigned= req.assignedTo?.includes(userEmail);

  const flow = req.flow || ['ppc','jmd','md'];
  const nextRole = flow.find(r => !req.approvals?.[r]?.status);
  const nextEmail = nextRole==='ppc'?PPC_EMAIL:nextRole==='jmd'?JMD_EMAIL:nextRole==='md'?MD_EMAIL:null;
  const isMyApprovalTurn = (
    (isPPC && nextRole==='ppc') ||
    (isJMD && nextRole==='jmd') ||
    (isMD  && nextRole==='md')
  ) && getOverallStatus(req)==='Pending';

  const status = getOverallStatus(req);
  const ss = STATUS_STYLE[status] || STATUS_STYLE.Pending;

  async function approve() {
    if (isPPC && !assignedTo) return alert('Please assign to a maintenance person before approving');
    setActing(true);
    try {
      const role = isPPC?'ppc':isJMD?'jmd':'md';
      const updApprovals = { ...(req.approvals||{}), [role]:{ status:'Approved', by:userEmail, at:new Date().toISOString() }};
      // Find next approver
      const roleToEmail = { jmd:JMD_EMAIL, md:MD_EMAIL, ppc:PPC_EMAIL };
      let nextEm = null;
      for (const r of flow) { if (!updApprovals[r]?.status) { nextEm = roleToEmail[r]; break; } }
      const updates = {
        approvals: updApprovals,
        nextApproverEmail: nextEm,
        ...(isPPC && assignedTo ? { assignedTo } : {}),
        updatedAt: serverTimestamp(),
      };
      // If fully approved, mark inProgress and notify assigned person
      const fullyApproved = flow.every(r => updApprovals[r]?.status === 'Approved');
      if (fullyApproved) {
        updates.inProgress = true;
        const assigneeName = (assignedTo||req.assignedTo||'').split('|')[0];
        const assigneeEmail = (assignedTo||req.assignedTo||'').split('|')[1];
        const assigneeEmailAddr = (assignedTo||req.assignedTo||'').split('|')[1];
        await createNotification('u1', NOTIF_TYPES.MAINTENANCE, {
          title: `🔧 Maintenance Assigned — ${isPDC ? req.machine : req.department}`,
          message: `${assigneeName}: Please attend to ${isPDC?req.machine+' — '+req.problemType:req.department+' — '+req.problemType}. Priority: ${req.priority?.split('—')[0]?.trim()}`,
          nextApproverEmail: assigneeEmailAddr,
          targetEmail: assigneeEmailAddr,
        });
      } else {
        // Notify next approver
        const nextName = nextEm===JMD_EMAIL?'JMD':nextEm===MD_EMAIL?'MD':'PPC';
        const nextApproverEm = nextEm;
        await createNotification('u1', NOTIF_TYPES.MAINTENANCE, {
          title: `🔧 Maintenance Request — Action Required (${nextName})`,
          message: `${req.employeeName}: ${isPDC?req.machine+' — '+req.problemType:req.department+' — '+req.problemType} | ${req.priority?.split('—')[0]?.trim()}`,
          pendingApproval: true,
          nextApproverEmail: nextApproverEm,
        });
      }
      await updateDoc(doc(db,'requests',req.id), updates);
      onRefresh && onRefresh();
    } catch(e) { alert('Failed: '+e.message); }
    finally { setActing(false); }
  }

  async function reject() {
    if (!rejectReason.trim()) return alert('Rejection reason required');
    setActing(true);
    try {
      const role = isPPC?'ppc':isJMD?'jmd':'md';
      await updateDoc(doc(db,'requests',req.id), {
        approvals: { ...(req.approvals||{}), [role]:{ status:'Rejected', by:userEmail, reason:rejectReason, at:new Date().toISOString() }},
        rejected: true, nextApproverEmail: null, updatedAt: serverTimestamp(),
      });
      await createNotification('u1', NOTIF_TYPES.MAINTENANCE, {
        title: `❌ Maintenance Request Rejected`,
        message: `${req.employeeName}'s request for ${isPDC?req.machine:req.department} was rejected: ${rejectReason}`,
      });
      setShowReject(false);
      onRefresh && onRefresh();
    } catch(e) { alert('Failed: '+e.message); }
    finally { setActing(false); }
  }

  async function markComplete() {
    if (!closeNote.trim()) return alert('Please add a completion note');
    setActing(true);
    try {
      await updateDoc(doc(db,'requests',req.id), {
        completedAt: new Date().toISOString(), completionNote: closeNote,
        inProgress: false, updatedAt: serverTimestamp(),
        nextApproverEmail: req.employeeEmail,
      });
      await createNotification('u1', NOTIF_TYPES.MAINTENANCE, {
        title: `✅ Maintenance Done — Awaiting Confirmation`,
        message: `${(req.assignedTo||'').split('|')[0]} completed work on ${isPDC?req.machine:req.department}. ${req.employeeName} please confirm.`,
      });
      setCloseNote('');
      onRefresh && onRefresh();
    } catch(e) { alert('Failed: '+e.message); }
    finally { setActing(false); }
  }

  async function raisersConfirm(decision) {
    if (decision==='approved' && !raisersNote.trim()) return alert('Please add a confirmation note');
    setActing(true);
    try {
      await updateDoc(doc(db,'requests',req.id), {
        raisersApproval: decision, raisersNote, closed: decision==='approved',
        closedAt: decision==='approved' ? new Date().toISOString() : null,
        updatedAt: serverTimestamp(),
      });
      if (decision==='approved') {
        await createNotification('u1', NOTIF_TYPES.MAINTENANCE, {
          title: `🔒 Maintenance Closed — ${isPDC?req.machine:req.department}`,
          message: `${req.employeeName} confirmed completion. ${raisersNote}. Closed by raiser.`,
        });
      } else {
        await createNotification('u1', NOTIF_TYPES.MAINTENANCE, {
          title: `⚠️ Maintenance Reopened — ${isPDC?req.machine:req.department}`,
          message: `${req.employeeName} rejected completion: ${raisersNote}. Please revisit.`,
        });
        // Reopen
        await updateDoc(doc(db,'requests',req.id), { completedAt:null, raisersApproval:null, inProgress:true });
      }
      onRefresh && onRefresh();
    } catch(e) { alert('Failed: '+e.message); }
    finally { setActing(false); }
  }

  const inp = {border:'1px solid #d1d5db',borderRadius:8,padding:'8px 12px',fontSize:13,outline:'none',width:'100%',boxSizing:'border-box',background:'#fff',color:'#111',fontFamily:'inherit'};

  return (
    <div style={{background:'var(--bg-raised)',borderRadius:12,border:`1.5px solid ${isMyApprovalTurn?'#fde68a':ss.border}`,marginBottom:12,overflow:'hidden',
      boxShadow:isMyApprovalTurn?'0 0 0 3px #fde68a44':'0 1px 4px rgba(0,0,0,0.08)'}}>
      {/* Header */}
      <div onClick={()=>setExpanded(e=>!e)} style={{padding:'12px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
            <span style={{fontSize:14}}>{isPDC?'🔧':'🛠'}</span>
            <span style={{fontWeight:800,fontSize:13,color:'var(--text-primary)'}}>{isPDC?'PDC Maintenance':'General Maintenance'} — {req.employeeName}</span>
            {isMyApprovalTurn && <span style={{background:'#fef3c7',color:'#b45309',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:800}}>⚡ Your Action Required</span>}
            {isAssigned && req.inProgress && <span style={{background:'#eff6ff',color:'#1e40af',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:800}}>🔧 Assigned to You</span>}
            {isRaiser && req.completedAt && !req.raisersApproval && <span style={{background:'#f5f3ff',color:'#7c3aed',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:800}}>✅ Please Confirm</span>}
          </div>
          <div style={{fontSize:11,color:'var(--text-secondary)'}}>
            {isPDC ? `${req.machine} · ${req.problemType}` : `${req.department} · ${req.problemType}`}
            {' · '}<span style={{color:PRIORITY_COLOR(req.priority),fontWeight:700}}>{req.priority?.split('—')[0]?.trim()}</span>
            {req.assignedTo && <> · 👷 {req.assignedTo.split('|')[0]}</>}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,flexShrink:0}}>
          <span style={{background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,borderRadius:6,padding:'3px 10px',fontSize:10,fontWeight:800}}>{ss.label}</span>
          <span style={{fontSize:9,color:'var(--text-secondary)'}}>{expanded?'▲':'▼'}</span>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{borderTop:'1px solid var(--border-subtle)',padding:'14px 16px'}}>
          {/* Details */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
            {[
              ['Raised By', req.employeeName],
              ['Department', req.dept||'—'],
              isPDC ? ['Machine', req.machine] : ['Area', req.department],
              ['Problem Type', req.problemType],
              ['Priority', req.priority?.split('—')[0]?.trim()],
              ['Description', req.description],
              req.location && ['Location', req.location],
              req.assignedTo && ['Assigned To', req.assignedTo.split('|')[0]],
              req.completionNote && ['Completion Note', req.completionNote],
              req.remarks && ['Remarks', req.remarks],
            ].filter(Boolean).map(([label,val])=>(
              <div key={label} style={{background:'var(--bg-base)',borderRadius:8,padding:'8px 10px',gridColumn:['Description','Completion Note','Remarks'].includes(label)?'1/-1':'auto'}}>
                <div style={{fontSize:9,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:3}}>{label}</div>
                <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{val||'—'}</div>
              </div>
            ))}
          </div>

          {/* Flow Tracker */}
          <FlowTracker req={req}/>

          {/* PPC: Assign before approve */}
          {isMyApprovalTurn && isPPC && (
            <div style={{marginTop:12,background:'#fffbeb',borderRadius:8,padding:'10px 12px',border:'1px solid #fde68a'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#b45309',textTransform:'uppercase',marginBottom:6}}>Assign to *</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {(isPDC ? PDC_ASSIGNEES : GEN_ASSIGNEES).map(a=>(
                  <label key={a.email} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',
                    background:assignedTo===a.name+'|'+a.email?'#fef3c7':'#fff',
                    border:'1.5px solid '+(assignedTo===a.name+'|'+a.email?'#f59e0b':'#d1d5db'),
                    borderRadius:8,padding:'8px 14px',fontWeight:700,fontSize:13}}>
                    <input type="radio" name={'assignee_'+req.id} checked={assignedTo===a.name+'|'+a.email} onChange={()=>setAssignedTo(a.name+'|'+a.email)} style={{accentColor:'#f59e0b'}}/>
                    {a.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons — PPC/JMD/MD approval */}
          {isMyApprovalTurn && getOverallStatus(req)==='Pending' && (
            <div style={{marginTop:10}}>
              {showReject && (
                <input value={rejectReason} onChange={e=>setRejectReason(e.target.value)}
                  placeholder="Rejection reason (required)"
                  style={{...inp,marginBottom:8,border:'1.5px solid #fca5a5'}}/>
              )}
              <div style={{display:'flex',gap:8}}>
                {!showReject
                  ? <button onClick={()=>setShowReject(true)} disabled={acting}
                      style={{flex:1,padding:'9px',borderRadius:8,border:'1.5px solid #fca5a5',background:'#fef2f2',color:'#dc2626',fontWeight:800,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                      ❌ Reject
                    </button>
                  : <button onClick={reject} disabled={acting}
                      style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'#dc2626',color:'#fff',fontWeight:800,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                      {acting?'…':'Confirm Reject'}
                    </button>
                }
                {showReject && <button onClick={()=>setShowReject(false)} style={{padding:'9px 14px',borderRadius:8,border:'1px solid #d1d5db',background:'#f9fafb',color:'#374151',fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>}
                <button onClick={approve} disabled={acting}
                  style={{flex:2,padding:'9px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#16a34a,#15803d)',color:'#fff',fontWeight:800,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                  {acting?'⏳…':'✅ Approve'}{isPPC?' & Assign':''}
                </button>
              </div>
            </div>
          )}

          {/* Assigned person: Mark complete */}
          {isAssigned && req.inProgress && !req.completedAt && (
            <div style={{marginTop:12,background:'#eff6ff',borderRadius:8,padding:'12px',border:'1px solid #bfdbfe'}}>
              <div style={{fontSize:12,fontWeight:700,color:'#1e40af',marginBottom:8}}>🔧 Mark Work as Complete</div>
              <input value={closeNote} onChange={e=>setCloseNote(e.target.value)}
                placeholder="Describe what was done / parts replaced…"
                style={{...inp,marginBottom:8}}/>
              <button onClick={markComplete} disabled={acting}
                style={{width:'100%',padding:'10px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#7c3aed,#6d28d9)',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
                {acting?'⏳ Saving…':'✅ Mark as Complete'}
              </button>
            </div>
          )}

          {/* Raiser: confirm completion */}
          {isRaiser && req.completedAt && !req.raisersApproval && (
            <div style={{marginTop:12,background:'#f5f3ff',borderRadius:8,padding:'12px',border:'1px solid #c4b5fd'}}>
              <div style={{fontSize:12,fontWeight:700,color:'#7c3aed',marginBottom:4}}>✅ Work marked complete by {(req.assignedTo||'').split('|')[0]}</div>
              <div style={{fontSize:12,color:'#6b7280',marginBottom:8}}>{req.completionNote}</div>
              <input value={raisersNote} onChange={e=>setRaisersNote(e.target.value)}
                placeholder="Your confirmation / feedback…"
                style={{...inp,marginBottom:8}}/>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>raisersConfirm('rejected')} disabled={acting}
                  style={{flex:1,padding:'9px',borderRadius:8,border:'1.5px solid #fca5a5',background:'#fef2f2',color:'#dc2626',fontWeight:800,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                  ❌ Issue Not Resolved
                </button>
                <button onClick={()=>raisersConfirm('approved')} disabled={acting}
                  style={{flex:2,padding:'9px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#16a34a,#15803d)',color:'#fff',fontWeight:800,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                  {acting?'⏳…':'✅ Confirm — Issue Resolved'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PDC Form ─────────────────────────────────────────────────────────────────
function PDCForm({ userProfile, onSubmitted, onCancel, dark }) {
  const reasons = useReasons();
  const [machine,   setMachine]   = useState(PDC_MACHINES[0]);
  const [category,  setCategory]  = useState('');
  const [reason,    setReason]    = useState('');
  const [desc,      setDesc]      = useState('');
  const [priority,  setPriority]  = useState(MAINT_PRIORITY[2]);
  const [remarks,   setRemarks]   = useState('');
  const [saving,    setSaving]    = useState(false);

  const categories = [...new Set(reasons.map(r=>r.category))].sort();
  const filteredReasons = reasons.filter(r=>r.category===category);

  const inp = {border:'1px solid #d1d5db',borderRadius:8,padding:'9px 12px',fontSize:13,outline:'none',width:'100%',boxSizing:'border-box',background:dark?'#1e2235':'#fff',color:dark?'#fff':'#111',fontFamily:'inherit'};

  async function submit() {
    if (!desc.trim()) return alert('Problem description is required');
    if (!reason)      return alert('Please select a reason from the master list');
    setSaving(true);
    try {
      const availSnap = await getDoc(doc(db,'approver_availability','status'));
      const avail = availSnap.exists() ? availSnap.data() : { jmd:'Online', md:'Online' };
      const jmdOn = avail.jmd !== 'Offline';
      const mdOn  = avail.md  !== 'Offline';
      const flow = ['ppc'];
      if (jmdOn) flow.push('jmd');
      if (mdOn)  flow.push('md');
      await addDoc(collection(db,'requests'), {
        type:'pdc_maintenance', employeeEmail:userProfile?.email,
        employeeName:userProfile?.name||userProfile?.email, dept:userProfile?.dept,
        machine, category, reason, description:desc, priority, remarks,
        approvals:{}, rejected:false, inProgress:false, flow,
        nextApproverEmail:PPC_EMAIL, createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
      });
      await createNotification('u1', NOTIF_TYPES.MAINTENANCE, {
        title: `🔧 PDC Maintenance — ${machine} (Action: PPC)`,
        message: `${userProfile?.name}: ${category} — ${reason} · ${priority.split('—')[0].trim()} | ${desc.slice(0,60)}`,
        pendingApproval: true,
        nextApproverEmail: PPC_EMAIL,
        forPPC: true,
      });
      onSubmitted();
    } catch(e) { alert('Submit failed: '+e.message); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{fontWeight:800,fontSize:15,marginBottom:16,color:'var(--text-primary)'}}>🔧 PDC Maintenance Request</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4}}>Machine *</div>
          <select style={{...inp,cursor:'pointer'}} value={machine} onChange={e=>setMachine(e.target.value)}>
            {PDC_MACHINES.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4}}>Category *</div>
          <select style={{...inp,cursor:'pointer'}} value={category} onChange={e=>{setCategory(e.target.value);setReason('');}}>
            <option value="">Select category…</option>
            {categories.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4}}>Reason (from master) *</div>
          <select style={{...inp,cursor:'pointer'}} value={reason} onChange={e=>setReason(e.target.value)} disabled={!category}>
            <option value="">{category?'Select reason…':'Select category first'}</option>
            {filteredReasons.map(r=><option key={r.id}>{r.reason}</option>)}
          </select>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4}}>Problem Description *</div>
          <textarea style={{...inp,height:70,resize:'vertical'}} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Describe the issue clearly…"/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:6}}>Priority</div>
          {MAINT_PRIORITY.map(p=>(
            <label key={p} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,cursor:'pointer'}}>
              <input type="radio" name="pdc_priority" checked={priority===p} onChange={()=>setPriority(p)}/>
              <span style={{fontSize:13,fontWeight:priority===p?700:400,color:PRIORITY_COLOR(p)}}>{p}</span>
            </label>
          ))}
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4}}>Remarks</div>
          <input style={inp} value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Optional — parts needed, previous attempts…"/>
        </div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={onCancel} style={{flex:1,padding:'10px',borderRadius:8,border:'1px solid #d1d5db',background:'#f9fafb',color:'#374151',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{flex:2,padding:'10px',borderRadius:8,border:'none',background:'#dc2626',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
          {saving?'⏳ Submitting…':'🔧 Submit PDC Request'}
        </button>
      </div>
    </div>
  );
}

// ── General Form ──────────────────────────────────────────────────────────────
function GeneralForm({ userProfile, onSubmitted, onCancel, dark }) {
  const reasons = useReasons();
  const [dept,      setDept]      = useState(MAINT_DEPTS[0]);
  const [category,  setCategory]  = useState('');
  const [reason,    setReason]    = useState('');
  const [desc,      setDesc]      = useState('');
  const [priority,  setPriority]  = useState(MAINT_PRIORITY[2]);
  const [location,  setLocation]  = useState('');
  const [remarks,   setRemarks]   = useState('');
  const [saving,    setSaving]    = useState(false);

  const categories = [...new Set(reasons.map(r=>r.category))].sort();
  const filteredReasons = reasons.filter(r=>r.category===category);

  const inp = {border:'1px solid #d1d5db',borderRadius:8,padding:'9px 12px',fontSize:13,outline:'none',width:'100%',boxSizing:'border-box',background:dark?'#1e2235':'#fff',color:dark?'#fff':'#111',fontFamily:'inherit'};

  async function submit() {
    if (!desc.trim()) return alert('Problem description is required');
    if (!reason)      return alert('Please select a reason from the master list');
    setSaving(true);
    try {
      const availSnap = await getDoc(doc(db,'approver_availability','status'));
      const avail = availSnap.exists() ? availSnap.data() : { jmd:'Online', md:'Online' };
      const jmdOn = avail.jmd !== 'Offline';
      const mdOn  = avail.md  !== 'Offline';
      const flow = ['ppc'];
      if (jmdOn) flow.push('jmd');
      if (mdOn)  flow.push('md');
      await addDoc(collection(db,'requests'), {
        type:'general_maintenance', employeeEmail:userProfile?.email,
        employeeName:userProfile?.name||userProfile?.email, dept:userProfile?.dept,
        department:dept, category, reason, description:desc, priority, location, remarks,
        approvals:{}, rejected:false, inProgress:false, flow,
        nextApproverEmail:PPC_EMAIL, createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
      });
      await createNotification('u1', NOTIF_TYPES.MAINTENANCE, {
        title: `🛠 General Maintenance — ${dept} (Action: PPC)`,
        message: `${userProfile?.name}: ${category} — ${reason} · ${priority.split('—')[0].trim()} | ${desc.slice(0,60)}`,
        pendingApproval: true,
        nextApproverEmail: PPC_EMAIL,
        forPPC: true,
      });
      onSubmitted();
    } catch(e) { alert('Submit failed: '+e.message); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{fontWeight:800,fontSize:15,marginBottom:16,color:'var(--text-primary)'}}>🛠 General Maintenance Request</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4}}>Department *</div>
          <select style={{...inp,cursor:'pointer'}} value={dept} onChange={e=>setDept(e.target.value)}>
            {MAINT_DEPTS.map(d=><option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4}}>Category *</div>
          <select style={{...inp,cursor:'pointer'}} value={category} onChange={e=>{setCategory(e.target.value);setReason('');}}>
            <option value="">Select category…</option>
            {categories.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4}}>Reason (from master) *</div>
          <select style={{...inp,cursor:'pointer'}} value={reason} onChange={e=>setReason(e.target.value)} disabled={!category}>
            <option value="">{category?'Select reason…':'Select category first'}</option>
            {filteredReasons.map(r=><option key={r.id}>{r.reason}</option>)}
          </select>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4}}>Problem Description *</div>
          <textarea style={{...inp,height:70,resize:'vertical'}} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Describe the issue clearly…"/>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4}}>Location / Area</div>
          <input style={inp} value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Bay 2, Gate…"/>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4}}>Priority</div>
          <select style={{...inp,cursor:'pointer'}} value={priority} onChange={e=>setPriority(e.target.value)}>
            {MAINT_PRIORITY.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4}}>Remarks</div>
          <input style={inp} value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Optional — parts needed, urgency details…"/>
        </div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={onCancel} style={{flex:1,padding:'10px',borderRadius:8,border:'1px solid #d1d5db',background:'#f9fafb',color:'#374151',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{flex:2,padding:'10px',borderRadius:8,border:'none',background:'#ea580c',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
          {saving?'⏳ Submitting…':'🛠 Submit Maintenance Request'}
        </button>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function MaintenanceDashboard({ userProfile, onBack, dark }) {
  const userEmail = userProfile?.email;
  const isAdmin   = userProfile?.role==='owner' || userEmail===JMD_EMAIL || userEmail===MD_EMAIL;
  const isPPC     = PPC_EMAILS.includes(userEmail);
  const isApprover= isAdmin || isPPC;

  const [view,    setView]    = useState('my');
  const [newType, setNewType] = useState(null);
  const [reqs,    setReqs]    = useState([]);
  const [filter,  setFilter]  = useState('all');

  useEffect(()=>{
    const q = query(collection(db,'requests'), orderBy('createdAt','desc'));
    const unsub = onSnapshot(q, snap=>{
      setReqs(snap.docs
        .map(d=>({id:d.id,...d.data()}))
        .filter(d=>d.type==='pdc_maintenance'||d.type==='general_maintenance'));
    });
    return ()=>unsub();
  },[]);

  const myReqs      = reqs.filter(r=>r.employeeEmail===userEmail);
  const pendingReqs = reqs.filter(r=>r.nextApproverEmail===userEmail||
    (PPC_EMAILS.includes(userEmail)&&r.nextApproverEmail===PPC_EMAIL));
  const assignedReqs= reqs.filter(r=>r.assignedTo?.includes(userEmail));
  const needsConfirm= reqs.filter(r=>r.employeeEmail===userEmail&&r.completedAt&&!r.raisersApproval);

  const displayed = view==='my'    ? myReqs
                  : view==='pending'? pendingReqs
                  : view==='assigned'? assignedReqs
                  : view==='confirm' ? needsConfirm
                  : reqs.filter(r=>filter==='all'||r.type===filter);

  const tabs = [
    { id:'my',      label:`My Requests`,       icon:'📋', show:true },
    { id:'pending', label:`Pending${pendingReqs.length>0?` (${pendingReqs.length})`:''}`, icon:'⏳', show:isApprover },
    { id:'assigned',label:`Assigned to Me${assignedReqs.length>0?` (${assignedReqs.length})`:''}`, icon:'🔧', show:!!assignedReqs.length },
    { id:'confirm', label:`Confirm Done${needsConfirm.length>0?` (${needsConfirm.length})`:''}`,   icon:'✅', show:!!needsConfirm.length },
    { id:'all',     label:'All',               icon:'👁', show:isAdmin },
    { id:'new',     label:'+ New',             icon:'✏️', show:true },
  ].filter(t=>t.show);

  return (
    <div style={{minHeight:'100vh',background:'var(--bg-base)',fontFamily:'Inter,system-ui,sans-serif'}}>
      {/* Header */}
      <div style={{background:'linear-gradient(135deg,#dc2626,#b91c1c)',color:'#fff',padding:'14px 18px',boxShadow:'0 2px 10px rgba(220,38,38,0.4)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
          {onBack && <button onClick={onBack} style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:9,color:'#fff',fontSize:18,cursor:'pointer',padding:'5px 12px'}}>←</button>}
          <div>
            <div style={{fontWeight:900,fontSize:17}}>🔧 Maintenance Requests</div>
            <div style={{fontSize:12,opacity:0.85,marginTop:2}}>PDC · General · Track & Close</div>
          </div>
          {(pendingReqs.length>0||needsConfirm.length>0) && (
            <span style={{marginLeft:'auto',background:'#fef3c7',color:'#b45309',borderRadius:20,padding:'4px 14px',fontWeight:800,fontSize:12}}>
              ⚡ {pendingReqs.length+needsConfirm.length} action(s) needed
            </span>
          )}
        </div>
        <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:2}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>{setView(t.id);if(t.id!=='new')setNewType(null);}}
              style={{padding:'7px 16px',borderRadius:20,border:'none',cursor:'pointer',fontWeight:700,fontSize:12,whiteSpace:'nowrap',flexShrink:0,
                background:view===t.id?'#fff':'rgba(255,255,255,0.18)',
                color:view===t.id?'#dc2626':'#fff'}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:'16px 14px',maxWidth:680,margin:'0 auto'}}>
        {/* New request */}
        {view==='new' && !newType && (
          <div>
            <div style={{fontWeight:800,fontSize:14,color:'var(--text-primary)',marginBottom:14}}>What type of maintenance?</div>
            {[
              {type:'pdc',  icon:'🔧', label:'PDC Maintenance',     desc:'Machine breakdown — 125T, 250T, 350T press issues', color:'#dc2626', bg:'#fef2f2', border:'#fca5a5'},
              {type:'gen',  icon:'🛠', label:'General Maintenance',  desc:'Electrical, civil, mechanical — all other departments', color:'#ea580c', bg:'#fff7ed', border:'#fdba74'},
            ].map(opt=>(
              <div key={opt.type} onClick={()=>setNewType(opt.type)}
                style={{background:opt.bg,border:`2px solid ${opt.border}`,borderRadius:14,padding:'18px 20px',marginBottom:12,cursor:'pointer',display:'flex',alignItems:'center',gap:16}}
                onMouseDown={e=>e.currentTarget.style.transform='scale(0.98)'}
                onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}>
                <div style={{fontSize:32}}>{opt.icon}</div>
                <div>
                  <div style={{fontWeight:800,fontSize:15,color:opt.color}}>{opt.label}</div>
                  <div style={{fontSize:12,color:'#6b7280',marginTop:3}}>{opt.desc}</div>
                </div>
                <div style={{marginLeft:'auto',fontSize:20,color:opt.color}}>→</div>
              </div>
            ))}
          </div>
        )}
        {view==='new' && newType==='pdc' && <PDCForm userProfile={userProfile} dark={dark} onSubmitted={()=>{setView('my');setNewType(null);}} onCancel={()=>setNewType(null)}/>}
        {view==='new' && newType==='gen' && <GeneralForm userProfile={userProfile} dark={dark} onSubmitted={()=>{setView('my');setNewType(null);}} onCancel={()=>setNewType(null)}/>}

        {/* Request list */}
        {view!=='new' && (
          <>
            {view==='all' && (
              <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
                {[{v:'all',l:'All'},{v:'pdc_maintenance',l:'🔧 PDC'},{v:'general_maintenance',l:'🛠 General'}].map(f=>(
                  <button key={f.v} onClick={()=>setFilter(f.v)}
                    style={{padding:'5px 14px',borderRadius:16,border:`1px solid ${filter===f.v?'#dc2626':'#e5e7eb'}`,
                      background:filter===f.v?'#dc2626':'transparent',color:filter===f.v?'#fff':'#6b7280',
                      fontWeight:filter===f.v?700:400,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                    {f.l}
                  </button>
                ))}
                <span style={{marginLeft:'auto',fontSize:12,color:'var(--text-secondary)',alignSelf:'center'}}>{displayed.length} request{displayed.length!==1?'s':''}</span>
              </div>
            )}
            {displayed.length===0
              ? <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-secondary)',fontSize:13}}>No requests found</div>
              : displayed.map(r=><MaintCard key={r.id} req={r} userEmail={userEmail} userProfile={userProfile}/>)
            }
          </>
        )}
      </div>
    </div>
  );
}
