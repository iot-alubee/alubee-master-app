import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, writeBatch, getDocs, limit, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { subscribeNotifications, markAllRead, markOneRead, NOTIF_ICONS, NOTIF_COLORS } from '../utils/notificationService';
import {
  subscribeAppRequests,
  updateAppRequest,
  createAppRequestNotification,
  normalizeAppMobile,
  mobilesMatch,
  markAppRequestNotifRead,
  notifIsForUser,
  getAppRequest,
  markRequestNotifsActioned,
  isRequestPendingForUser,
} from '../utils/requestService';
import ITTicketActions from './ITTicketActions';
import { itTicketStatus } from '../utils/itRequestService';
import { updateTask } from '../utils/taskService';

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
  { id:'all',        label:'All',          icon:'🔔' },
  { id:'approvals',  label:'Approvals',    icon:'⏳' },
  { id:'approved',   label:'Approved',     icon:'✅' },
  { id:'rejected',   label:'Rejected',     icon:'❌' },
  { id:'tasks',      label:'Tasks',        icon:'📋' },
  { id:'security',   label:'Security',     icon:'🔒' },
];

const TAB_TYPES = {
  tasks:      ['task_assigned','task_updated','task_cancelled','task_deleted','task_overdue','task_reopened'],
  security:   ['vehicle','internal','transfer','mobilebox','power','overstay','visitor','permission','dc','tea'],
};

function isRequestNotif(n) {
  return n?.type === 'request' || n?._source === 'app_request';
}

function notifBucket(n) {
  if (!n) return 'other';
  const title = String(n.title || '');
  const msg = String(n.message || '');
  const rejected =
    n.requestRejected || n.rejected || n.visitorRejected || n.permRejected || n.dcRejected || n.denied || n.deleteRejected ||
    /rejected/i.test(title);
  const approved =
    n.requestApproved || n.visitorApproved || n.permApproved || n.dcApproved || n.deleteApproved ||
    /fully approved/i.test(title) ||
    (/✅/.test(title) && !n.pendingApproval);
  // Status lines like "Awaiting JMD 1 approval" are informational — they belong on All,
  // not Approvals. Approvals only shows items this user must act on (PendingRequests).
  const awaitingStatus = /awaiting .+\sapproval/i.test(msg) && !/needs your approval/i.test(msg);
  const stillPending =
    !awaitingStatus &&
    n.pendingApproval &&
    !n.acknowledged &&
    !n.requestActioned &&
    !n.requestApproved &&
    !n.requestRejected &&
    !n.visitorApproved &&
    !n.visitorRejected &&
    !n.permApproved &&
    !n.permRejected &&
    !n.dcApproved &&
    !n.dcRejected &&
    !rejected;
  const actionRequired =
    /needs your approval/i.test(msg) || /action required/i.test(title);
  if (!isRequestNotif(n) && (stillPending || (actionRequired && !n.requestActioned && !rejected && !n.requestApproved))) {
    if (!n.requestActioned && !n.requestApproved && !n.requestRejected) return 'pending';
  }
  if (rejected) return 'rejected';
  if (approved) return 'approved';
  return 'other';
}

function requestTypeLabel(req) {
  if (!req) return 'Request';
  if (req.type === 'leave') return 'Leave';
  if (req.type === 'od') return 'OD';
  if (req.type === 'visitor') return 'Visitor';
  if (req.type === 'it') return 'IT';
  return req.type || 'Request';
}

function requestTypeIcon(t) {
  if (t === 'leave') return '🌴';
  if (t === 'od') return '🚗';
  if (t === 'visitor') return '👤';
  if (t === 'it') return '💻';
  return '📝';
}

function ncRolesMatch(appRole, stepRole) {
  if (!appRole || !stepRole) return false;
  if (appRole === stepRole) return true;
  if (appRole === 'jmd_1' && (stepRole === 'jmd' || stepRole === 'jmd_1')) return true;
  if (appRole === 'jmd_2' && (stepRole === 'jmd' || stepRole === 'jmd_2')) return true;
  if (appRole === 'md' && stepRole === 'md') return true;
  return false;
}

function ncNormalizeFlow(flow) {
  if (!Array.isArray(flow)) return [];
  return flow.map((step) => {
    if (typeof step === 'object' && step?.role) {
      return { role: step.role, mobile: normalizeAppMobile(step.mobile || ''), label: step.label || step.role, name: step.name || '' };
    }
    return { role: String(step), mobile: '', label: String(step), name: '' };
  });
}

function ncNextApprover(flow, approvals) {
  for (const step of flow) {
    if (!approvals?.[step.role]?.status) return step;
  }
  return null;
}

function ncIsUsersTurn(req, userMobile, appRole) {
  if (!req || req.rejected || req.cancelled) return false;
  const flow = ncNormalizeFlow(req.flow);
  if (!flow.length) return mobilesMatch(req.nextApproverMobile, userMobile);
  const next = ncNextApprover(flow, req.approvals);
  if (!next) return false;
  if (mobilesMatch(next.mobile, userMobile) || mobilesMatch(req.nextApproverMobile, userMobile)) return true;
  return ncRolesMatch(appRole, next.role);
}

function ncMyStepLabel(req, userMobile, appRole) {
  const steps = ncNormalizeFlow(req?.flow);
  const step =
    steps.find((s) => mobilesMatch(s.mobile, userMobile)) ||
    steps.find((s) => ncRolesMatch(appRole, s.role));
  return step?.label || appRole || 'Approver';
}

async function applyRequestDecision(req, { userMobile, userAppRole, action, rejectReason, leaveDays }) {
  const flow = ncNormalizeFlow(req.flow);
  const next = ncNextApprover(flow, req.approvals);
  const myStep =
    flow.find((s) => mobilesMatch(s.mobile, userMobile)) ||
    flow.find((s) => ncRolesMatch(userAppRole, s.role)) ||
    next;
  const stepRole = myStep?.role || userAppRole || 'jmd_1';
  const updApprovals = {
    ...(req.approvals || {}),
    [stepRole]: {
      status: action === 'approve' ? 'Approved' : 'Rejected',
      byMobile: normalizeAppMobile(userMobile),
      at: new Date().toISOString(),
      reason: rejectReason || '',
      label: myStep?.label || stepRole,
    },
  };
  let nextMobile = null;
  let nextLabel = null;
  let nextRole = null;
  if (action === 'approve') {
    for (const st of flow) {
      if (!updApprovals[st.role]?.status) {
        nextMobile = normalizeAppMobile(st.mobile);
        nextLabel = st.label || st.role;
        nextRole = st.role || null;
        break;
      }
    }
  }
  const updates = {
    approvals: updApprovals,
    nextApproverMobile: action === 'reject' ? null : nextMobile,
    rejected: action === 'reject',
    rejectionReason: action === 'reject' ? rejectReason : (req.rejectionReason || ''),
  };

  const requestedDays = Number(req.leaveDaysRequested ?? req.originalLeaveDays ?? req.leaveDays ?? 0) || 0;
  const currentLeaveDays = Number(req.leaveDays ?? requestedDays) || 0;
  let leaveDaysNow = currentLeaveDays;
  if (req.type === 'leave' && action === 'approve') {
    const typed = parseFloat(leaveDays);
    if (Number.isNaN(typed) || typed < 1) throw new Error('Leave days must be at least 1');
    if (typed > currentLeaveDays) {
      throw new Error(`Cannot increase days. Maximum allowed now is ${currentLeaveDays}.`);
    }
    const reduced = Math.max(1, Math.min(currentLeaveDays, typed));
    leaveDaysNow = reduced;
    updates.leaveDays = reduced;
    updates.leaveDaysRequested = requestedDays || currentLeaveDays;
    if (reduced < currentLeaveDays) {
      const changes = Array.isArray(req.leaveDayChanges) ? [...req.leaveDayChanges] : [];
      changes.push({
        from: currentLeaveDays,
        to: reduced,
        byMobile: normalizeAppMobile(userMobile),
        byRole: userAppRole || '',
        byLabel: ncMyStepLabel(req, userMobile, userAppRole),
        at: new Date().toISOString(),
      });
      updates.leaveDayChanges = changes;
      updates.daysReduced = true;
    }
    if (!nextMobile) updates.leaveDaysApproved = reduced;
  }

  await updateAppRequest(req.id, updates);
  await markRequestNotifsActioned(req.id, userMobile, { approved: action === 'approve' }).catch(() => {});

  const typeLabel = requestTypeLabel(req);
  const employeeMobile = normalizeAppMobile(req.employeeMobile);
  const leaveReducedNote = req.type === 'leave' && leaveDaysNow < currentLeaveDays
    ? ` Leave reduced from ${currentLeaveDays} to ${leaveDaysNow} day(s).`
    : '';

  if (action === 'reject') {
    await createAppRequestNotification({
      type: 'request',
      title: `❌ ${typeLabel} Rejected`,
      message: `Your ${typeLabel} request was rejected. Reason: ${rejectReason || 'Rejected'}`,
      targetMobile: employeeMobile,
      requestId: req.id,
      pendingApproval: false,
      requestRejected: true,
    });
  } else if (nextMobile) {
    await createAppRequestNotification({
      type: 'request',
      title: `📝 ${typeLabel} — Action Required (${nextLabel || 'Approver'})`,
      message: `${req.employeeName}'s ${typeLabel} was approved${leaveReducedNote ? ' —' + leaveReducedNote : ' and'} needs your approval.`,
      targetMobile: nextMobile,
      targetRole: nextRole || '',
      nextApproverMobile: nextMobile,
      requestId: req.id,
      pendingApproval: true,
    });
  } else {
    await createAppRequestNotification({
      type: 'request',
      title: `✅ ${typeLabel} Fully Approved`,
      message: req.type === 'leave'
        ? `Your Leave request is fully approved for ${leaveDaysNow} day(s)${leaveDaysNow < requestedDays ? ` (requested ${requestedDays})` : ''}.`
        : `Your ${typeLabel} request has been fully approved.`,
      targetMobile: employeeMobile,
      requestId: req.id,
      pendingApproval: false,
      requestApproved: true,
    });
  }
}

function notifTimeMs(n) {
  const c = n?.createdAt;
  if (!c) return 0;
  if (typeof c?.toMillis === 'function') return c.toMillis();
  if (typeof c?.seconds === 'number') return c.seconds * 1000;
  const t = Date.parse(c);
  return Number.isFinite(t) ? t : 0;
}

function formatNotifTime(n) {
  const c = n?.createdAt;
  if (c?.toDate) {
    return c.toDate().toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:true});
  }
  const ms = notifTimeMs(n);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:true});
}

async function markNotifRead(n, unit) {
  if (!n?.id || n.read) return;
  if (n._source === 'app_request') {
    await markAppRequestNotifRead(n.id).catch(() => {});
    return;
  }
  await updateDoc(doc(db, `notifications_${unit === 'u2' ? 'u2' : 'u1'}`, n.id), { read: true }).catch(() => {});
}

// ── NotifCard ──────────────────────────────────────────────────────────────────
function NotifCard({ n, unit, dark, bdr, txt, sub, onOpen, onAck, onDeny, onApproveVisitor, onRejectVisitor, onApprovePerm, onRejectPerm, onApproveDC, onRejectDC }) {
  const icon = NOTIF_ICONS[n.type] || '🔔';
  const color = NOTIF_COLORS[n.type] || '#3b82f6';
  const timeStr = formatNotifTime(n);
  const isPending = n.pendingApproval && !n.acknowledged;

  // Auto-mark as read if already actioned
  React.useEffect(()=>{
    if (!n.read && (n.visitorApproved||n.visitorRejected||n.permApproved||n.permRejected)) {
      markNotifRead(n, unit);
    }
  },[n.id, n.visitorApproved, n.visitorRejected, n.permApproved, n.permRejected]);

  React.useEffect(() => {
    // Mark request notifs read shortly after viewing (employee approve/reject messages)
    if (n._source === 'app_request' && !n.read && !n.pendingApproval) {
      const t = setTimeout(() => markNotifRead(n, unit), 800);
      return () => clearTimeout(t);
    }
  }, [n.id, n.read, n.pendingApproval, n._source]);

  const isDeleteReq = n.type === 'delete_requested';
  const isPermission = n.type === 'permission' && n.permissionId;
  const isDC = n.type === 'dc' && !n.acknowledged;
  const isRequest = n.type === 'request' && !n.acknowledged && !n.requestActioned && n.pendingApproval;
  const isVisitorApproval = n.type === 'visitor' && n.visitorId;

  return (
    <div
      onClick={() => onOpen && onOpen(n)}
      style={{
      padding:'12px 16px',
      borderBottom:`1px solid ${bdr}`,
      background: isPending ? 'rgba(245,158,11,0.06)' : n.read ? 'transparent' : 'rgba(0,212,255,0.03)',
      borderLeft: isPending ? '3px solid var(--amber)' : !n.read ? '3px solid var(--accent)' : '3px solid transparent',
      transition:'background 0.2s',
      cursor:'pointer',
    }}>
      <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
        {/* Icon */}
        <div style={{width:32,height:32,borderRadius:'50%',background:`${color}18`,border:`1px solid ${color}30`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0,marginTop:1}}>{icon}</div>

        {/* Content */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:3}}>
            <span style={{fontSize:12,fontWeight:700,color:txt,lineHeight:1.3}}>{n.title}</span>
            {!n.read && <div style={{width:6,height:6,borderRadius:'50%',background:'var(--accent)',flexShrink:0,marginTop:4}}/>}
          </div>
          <div style={{fontSize:11,color:sub,lineHeight:1.5,marginBottom:4}}>{n.message}</div>
          <div style={{fontSize:9,color:'var(--text-muted)',marginBottom: isPending||isDeleteReq||isVisitorApproval||isPermission||isDC ? 8 : 0}}>{timeStr}</div>

          {/* Task closure — Acknowledge or Deny/Reopen (tasks only) */}
          {isPending && !isDeleteReq && !isVisitorApproval && !isPermission && (n.type==='task_completed'||n.type==='task_updated'||!n.type) && (
            <div style={{display:'flex',gap:6}} onClick={(e)=>e.stopPropagation()}>
              <button onClick={()=>onAck(n)} style={{background:'var(--green)',border:'none',borderRadius:6,padding:'6px 14px',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                ✓ Acknowledge
              </button>
              <button onClick={()=>onDeny(n)} style={{background:'var(--red)',border:'none',borderRadius:6,padding:'6px 14px',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                ↩ Reopen
              </button>
            </div>
          )}

          {/* Delete request */}
          {isDeleteReq && n.taskId && (
            <div style={{display:'flex',gap:6}} onClick={(e)=>e.stopPropagation()}>
              <button onClick={async()=>{
                const {deleteTask}=await import('../utils/taskService');
                await deleteTask(n.taskId, unit, n.taskDesc||'');
                await updateDoc(doc(db,`notifications_${unit==='u2'?'u2':'u1'}`,n.id),{read:true,deleteApproved:true});
              }} style={{background:'var(--red)',border:'none',borderRadius:6,padding:'6px 12px',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✅ Approve Delete</button>
              <button onClick={async()=>{
                await updateDoc(doc(db,`notifications_${unit==='u2'?'u2':'u1'}`,n.id),{read:true,deleteRejected:true});
              }} style={{background:'var(--glass-2)',border:'1px solid var(--border-subtle)',borderRadius:6,padding:'6px 12px',color:'var(--text-secondary)',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>❌ Reject</button>
            </div>
          )}

          {/* Visitor approval inline */}
          {isDC && !n.dcApproved && !n.dcRejected && (
            <div style={{display:'flex',gap:6,marginTop:4}} onClick={(e)=>e.stopPropagation()}>
              <button onClick={()=>onRejectDC&&onRejectDC(n)} style={{background:'var(--red)',border:'none',borderRadius:6,padding:'6px 12px',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>❌ Reject</button>
              <button onClick={()=>onApproveDC&&onApproveDC(n)} style={{flex:1,background:'#15803d',border:'none',borderRadius:6,padding:'6px 12px',color:'#fff',fontSize:11,fontWeight:800,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✅ Approve & Clear to Exit</button>
            </div>
          )}
          {isDC && n.dcApproved && <span style={{fontSize:10,color:'var(--green)',fontWeight:700}}>✅ DC Approved — Person cleared to exit</span>}
          {isDC && n.dcRejected && <span style={{fontSize:10,color:'var(--red)',fontWeight:700}}>❌ DC Rejected</span>}
          {isRequest && (
            <div style={{display:'flex',gap:6,marginTop:4}} onClick={(e)=>e.stopPropagation()}>
              <button onClick={()=>onOpen&&onOpen(n)} style={{flex:1,background:'#7c3aed',border:'none',borderRadius:6,padding:'6px 12px',color:'#fff',fontSize:11,fontWeight:800,cursor:'pointer',fontFamily:'var(--font-sans)'}}>👁 View details</button>
            </div>
          )}
          {n.type==='request' && n.requestActioned && <span style={{fontSize:10,color:n.requestRejected?'var(--red)':'var(--green)',fontWeight:700}}>{n.requestRejected?'❌ Rejected':'✅ Actioned'}</span>}
          {isVisitorApproval && !n.visitorApproved && !n.visitorRejected && (
            <div style={{display:'flex',gap:6}} onClick={(e)=>e.stopPropagation()}>
              <button onClick={async()=>{onApproveVisitor&&onApproveVisitor(n);await updateDoc(doc(db,`notifications_${unit==='u2'?'u2':'u1'}`,n.id),{read:true,pendingApproval:false});}} style={{background:'var(--green)',border:'none',borderRadius:6,padding:'6px 12px',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✅ Approve</button>
              <button onClick={async()=>{onRejectVisitor&&onRejectVisitor(n);await updateDoc(doc(db,`notifications_${unit==='u2'?'u2':'u1'}`,n.id),{read:true,pendingApproval:false});}} style={{background:'var(--red)',border:'none',borderRadius:6,padding:'6px 12px',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>❌ Reject</button>
            </div>
          )}
          {isVisitorApproval && n.visitorApproved && <span style={{fontSize:10,color:'var(--green)',fontWeight:700}}>✅ Approved</span>}
          {isVisitorApproval && n.visitorRejected && <span style={{fontSize:10,color:'var(--red)',fontWeight:700}}>❌ Rejected</span>}

          {/* Permission approval inline */}
          {isPermission && !n.permApproved && !n.permRejected && (
            <div style={{display:'flex',gap:6}} onClick={(e)=>e.stopPropagation()}>
              <button onClick={async()=>{onApprovePerm&&onApprovePerm(n);await updateDoc(doc(db,`notifications_${unit==='u2'?'u2':'u1'}`,n.id),{read:true,pendingApproval:false});}} style={{background:'var(--green)',border:'none',borderRadius:6,padding:'6px 12px',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✅ Approve</button>
              <button onClick={async()=>{onRejectPerm&&onRejectPerm(n);await updateDoc(doc(db,`notifications_${unit==='u2'?'u2':'u1'}`,n.id),{read:true,pendingApproval:false});}} style={{background:'var(--red)',border:'none',borderRadius:6,padding:'6px 12px',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>❌ Reject</button>
            </div>
          )}
          {isPermission && n.permApproved && <span style={{fontSize:10,color:'var(--green)',fontWeight:700}}>✅ Approved</span>}
          {isPermission && n.permRejected && <span style={{fontSize:10,color:'var(--red)',fontWeight:700}}>❌ Rejected</span>}
        </div>
      </div>
    </div>
  );
}

// ── PendingPermissions ─────────────────────────────────────────────────────────
function PendingPermissions({ unit, dark, bdr, txt, sub }) {
  const [perms, setPerms] = useState([]);
  const [saving, setSaving] = useState(null);
  useEffect(() => {
    const col = `security_permission_${unit==='u2'?'u2':'u1'}`;
    try {
      return onSnapshot(query(collection(db, col), where('status','==','Pending')), s => setPerms(s.docs.map(d=>({id:d.id,...d.data()}))));
    } catch(e) {}
  }, [unit]);

  if (!perms.length) return null;

  return (
    <div style={{borderBottom:`2px solid var(--amber)`,marginBottom:8}}>
      <div style={{padding:'8px 16px',fontSize:10,fontWeight:700,color:'var(--amber)',background:'var(--amber-bg)',textTransform:'uppercase',letterSpacing:'0.06em'}}>🔐 Pending Permissions ({perms.length})</div>
      {perms.map(p=>(
        <div key={p.id} style={{padding:'12px 16px',borderBottom:`1px solid ${bdr}`,background:'var(--amber-bg)'}}>
          <div style={{fontWeight:800,color:txt,fontSize:13,marginBottom:2}}>{p.alubean_name||p.employeeName}</div>
          <div style={{fontSize:11,color:sub,marginBottom:8}}>{p.department} · {p.reason} · {p.duration||'—'}</div>
          <div style={{display:'flex',gap:8}}>
            <button disabled={saving===p.id+'A'} onClick={async()=>{
              setSaving(p.id+'A');
              await updateDoc(doc(db,`security_permission_${unit==='u2'?'u2':'u1'}`,p.id),{status:'Approved',approvedAt:serverTimestamp()});
              setSaving(null);
            }} style={{flex:1,background:'var(--green)',border:'none',borderRadius:8,padding:'8px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              {saving===p.id+'A'?'⏳':'✅ Approve'}
            </button>
            <button disabled={saving===p.id+'R'} onClick={async()=>{
              setSaving(p.id+'R');
              await updateDoc(doc(db,`security_permission_${unit==='u2'?'u2':'u1'}`,p.id),{status:'Rejected',rejectedAt:serverTimestamp()});
              setSaving(null);
            }} style={{flex:1,background:'var(--red)',border:'none',borderRadius:8,padding:'8px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              {saving===p.id+'R'?'⏳':'❌ Reject'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, value, full, highlight }) {
  if (value == null || value === '') return null;
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto', background: highlight ? '#eff6ff' : 'var(--glass-1)', borderRadius: 7, padding: '7px 10px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: highlight ? '#1e40af' : 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{String(value)}</div>
    </div>
  );
}

function NotifDetailSheet({ notif, req, loading, userMobile, userAppRole, userProfile, onClose, onDone }) {
  const [newDays, setNewDays] = useState(String(req?.leaveDays ?? req?.days ?? ''));
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    setNewDays(String(req?.leaveDays ?? req?.days ?? ''));
    setRejectReason('');
    setShowReject(false);
  }, [req?.id, req?.leaveDays]);

  const requestedDays = Number(req?.leaveDaysRequested ?? req?.originalLeaveDays ?? req?.leaveDays ?? 0) || 0;
  const currentLeaveDays = Number(req?.leaveDays ?? requestedDays) || 0;
  const myTurn = req ? ncIsUsersTurn(req, userMobile, userAppRole) : false;
  const flow = ncNormalizeFlow(req?.flow);
  const overall = req?.cancelled ? 'Cancelled' : req?.rejected ? 'Rejected' : (ncNextApprover(flow, req?.approvals) ? 'Pending' : 'Approved');

  async function act(action) {
    if (!req) return;
    if (action === 'reject' && !String(rejectReason).trim()) return alert('Please enter a rejection reason');
    setActing(true);
    try {
      await applyRequestDecision(req, {
        userMobile,
        userAppRole,
        action,
        rejectReason,
        leaveDays: newDays,
      });
      onDone && onDone();
    } catch (e) {
      alert(e.message);
    } finally {
      setActing(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2, display: 'flex', alignItems: 'flex-end' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '88%',
          overflowY: 'auto',
          background: 'var(--bg-base)',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderTop: '1px solid var(--border-subtle)',
          padding: '16px 16px 24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
              {req ? `${requestTypeIcon(req.type)} ${requestTypeLabel(req)} — ${req.employeeName}` : (notif?.title || 'Notification')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              {req ? `${req.dept?.toUpperCase() || ''} · ${overall}` : formatNotifTime(notif)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--glass-1)', border: '1px solid var(--border-subtle)', borderRadius: 6, width: 28, height: 28, color: 'var(--text-secondary)', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>

        {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>Loading details…</div>}

        {!req && !loading && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>{notif?.message}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatNotifTime(notif)}{notif?.type ? ` · ${notif.type}` : ''}</div>
          </div>
        )}

        {req && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <Field label="Employee" value={req.employeeName} />
              <Field label="Department" value={req.dept?.toUpperCase()} />
              {req.type === 'leave' && (
                <>
                  <Field label="Leave Type" value={req.leaveType} />
                  <Field label="Days Requested" value={String(req.leaveDaysRequested ?? req.leaveDays ?? '—')} />
                  <Field
                    label={overall === 'Approved' ? 'Days Approved' : 'Days (current)'}
                    value={`${req.leaveDaysApproved ?? req.leaveDays ?? '—'}${req.daysReduced ? ' (reduced)' : ''}`}
                    highlight={!!req.daysReduced}
                  />
                  <Field label="From" value={req.dateFrom || req.date} />
                  <Field label="To" value={req.dateTo || req.date} />
                  <Field label="Description" value={req.reason || req.description} full />
                  {req.leavesThisMonth != null && <Field label="Leaves This Month" value={req.leavesThisMonth} />}
                  {req.leavesLastMonth != null && <Field label="Leaves Prev Month" value={req.leavesLastMonth} />}
                  {Array.isArray(req.leaveDayChanges) && req.leaveDayChanges.length > 0 && (
                    <Field
                      label="Day reductions"
                      full
                      highlight
                      value={req.leaveDayChanges.map((c) => `${c.from} → ${c.to} by ${c.byLabel || 'Approver'}`).join(' · ')}
                    />
                  )}
                </>
              )}
              {req.type === 'od' && (
                <>
                  <Field label="Visiting To" value={req.visitingTo} />
                  <Field label="Purpose" value={req.purpose} />
                  <Field label="Time Required" value={req.timeRequired} />
                  <Field label="Company Vehicle" value={req.companyVehicle ? 'Yes' : 'No'} />
                  {req.companyVehicle && <Field label="Vehicle" value={req.vehicle} full />}
                  <Field label="Date" value={req.date} />
                  <Field label="Details" value={req.details} full />
                  <Field label="Remarks" value={req.remarks} full />
                </>
              )}
              {req.type === 'visitor' && (
                <>
                  <Field label="Visitor Name" value={req.visitorName} />
                  <Field label="Visitor Type" value={req.visitorType} />
                  <Field label="Purpose" value={req.purpose} />
                  <Field label="Coming From" value={req.comingFrom} />
                  <Field label="No. of People" value={req.noOfPeople} />
                  <Field label="Mobile" value={req.mobileNumber} />
                  <Field label="Date" value={req.date} />
                </>
              )}
              {req.type === 'it' && (
                <>
                  <Field label="Category" value={req.category} />
                  <Field label="Issue" value={req.issue || req.description} full />
                  <Field label="Status" value={itTicketStatus(req)} />
                  <Field label="Assigned to" value={req.assignedToName} />
                  {req.resolveNote && <Field label="Resolve note" value={req.resolveNote} full />}
                </>
              )}
              {req.remarks && req.type !== 'od' && <Field label="Remarks" value={req.remarks} full />}
              {req.rejected && <Field label="Rejection reason" value={req.rejectionReason || Object.values(req.approvals || {}).find((a) => a.status === 'Rejected')?.reason} full />}
            </div>

            {req.type !== 'it' && flow.length > 0 && (
              <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {flow.map((st, i) => {
                  const a = req.approvals?.[st.role];
                  const done = a?.status === 'Approved';
                  const rej = a?.status === 'Rejected';
                  const color = rej ? 'var(--red)' : done ? 'var(--green)' : 'var(--amber)';
                  return (
                    <span key={st.role || i} style={{ fontSize: 10, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 20, padding: '3px 8px' }}>
                      {done ? '✓' : rej ? '✕' : '•'} {st.label || st.role}
                    </span>
                  );
                })}
              </div>
            )}

            {req.type === 'leave' && myTurn && overall === 'Pending' && (
              <div style={{ marginBottom: 12, background: '#eff6ff', borderRadius: 8, padding: '10px 12px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', marginBottom: 6 }}>
                  Approve days (can reduce, min 1)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>Requested {requestedDays} · Current {currentLeaveDays} →</span>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, currentLeaveDays)}
                    step={1}
                    value={newDays}
                    onChange={(e) => {
                      const v = e.target.value;
                      const n = parseFloat(v);
                      if (v === '') { setNewDays(v); return; }
                      if (!Number.isNaN(n) && n > currentLeaveDays) {
                        setNewDays(String(currentLeaveDays));
                        return;
                      }
                      setNewDays(v);
                    }}
                    style={{ width: 72, padding: '6px 8px', borderRadius: 7, border: '1.5px solid #bfdbfe', fontSize: 14, fontWeight: 800, textAlign: 'center', color: '#1e40af', background: '#fff' }}
                  />
                  <span style={{ fontSize: 11, color: '#6b7280' }}>day(s)</span>
                </div>
                {Array.isArray(req.leaveDayChanges) && req.leaveDayChanges.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#b45309', fontWeight: 700 }}>
                    Reduced by prior approver: {req.leaveDayChanges.map((c) => `${c.byLabel || 'Approver'} ${c.from}→${c.to}`).join(' · ')}. You may reduce further (not increase).
                  </div>
                )}
              </div>
            )}

            {showReject && (
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason (required)"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #fca5a5', fontSize: 13, boxSizing: 'border-box', background: '#fff', color: '#111', marginBottom: 10 }}
              />
            )}

            {req.type === 'it' && (
              <ITTicketActions
                req={req}
                userProfile={userProfile || { mobile: userMobile, appRole: userAppRole }}
                onDone={onDone}
              />
            )}

            {req.type !== 'it' && myTurn && overall === 'Pending' && (
              <div style={{ display: 'flex', gap: 8 }}>
                {!showReject
                  ? <button onClick={() => setShowReject(true)} disabled={acting} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1.5px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>❌ Reject</button>
                  : <button onClick={() => act('reject')} disabled={acting} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{acting ? '⏳' : 'Confirm Reject'}</button>
                }
                <button onClick={() => act('approve')} disabled={acting} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#15803d', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {acting ? '⏳ Approving…' : '✅ Approve'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── PendingRequests (alubee_app_requests, mobile-based) ───────────────────────
function PendingRequests({ unit, dark, bdr, txt, sub, userMobile, userAppRole, onOpen, onCount, userProfile }) {
  const [reqs, setReqs] = useState([]);
  const [saving, setSaving] = useState(null);
  useEffect(() => {
    if (!userMobile && !userAppRole) return;
    const unsub = subscribeAppRequests((docs) => {
      const mine = docs.filter((r) => isRequestPendingForUser(r, userMobile, userAppRole));
      setReqs(mine);
    }, { pendingOnly: true });
    return () => unsub && unsub();
  }, [userMobile, userAppRole]);

  useEffect(() => {
    if (onCount) onCount(reqs.length);
    return () => { if (onCount) onCount(0); };
  }, [reqs.length, onCount]);

  if (!reqs.length) return null;

  async function approve(req) {
    setSaving(req.id + 'A');
    try {
      await applyRequestDecision(req, {
        userMobile,
        userAppRole,
        action: 'approve',
        leaveDays: req.leaveDays ?? req.days,
      });
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(null);
    }
  }

  async function reject(req) {
    const reason = window.prompt('Rejection reason:');
    if (reason === null) return;
    setSaving(req.id + 'R');
    try {
      await applyRequestDecision(req, {
        userMobile,
        userAppRole,
        action: 'reject',
        rejectReason: reason,
      });
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ borderBottom: '2px solid #7c3aed', marginBottom: 8 }}>
      <div style={{ padding: '8px 16px', fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        📝 Pending Request Approvals ({reqs.length})
      </div>
      {reqs.map((req) => {
        const requestedDays = Number(req.leaveDaysRequested ?? req.originalLeaveDays ?? req.leaveDays ?? 0) || 0;
        const currentDays = Number(req.leaveDays ?? requestedDays) || 0;
        return (
          <div
            key={req.id}
            onClick={() => onOpen && onOpen({ req })}
            style={{ padding: '12px 16px', borderBottom: `1px solid ${bdr}`, background: '#f5f3ff22', cursor: 'pointer' }}
          >
            <div style={{ fontWeight: 800, color: txt, fontSize: 13, marginBottom: 2 }}>
              {requestTypeIcon(req.type)} {requestTypeLabel(req)} — {req.employeeName}
            </div>
            <div style={{ fontSize: 11, color: sub, marginBottom: 2 }}>
              {req.dept?.toUpperCase()} · {req.date}
              {req.type === 'leave' && (
                <> · <strong>{currentDays} day{currentDays !== 1 ? 's' : ''}</strong>{requestedDays && currentDays !== requestedDays ? ` (of ${requestedDays})` : ''} · {req.leaveType} · {req.dateFrom || req.date}{req.dateTo && req.dateTo !== (req.dateFrom || req.date) ? ` → ${req.dateTo}` : ''}</>
              )}
            </div>
            {req.type === 'leave' && (req.reason || req.description) && (
              <div style={{ fontSize: 11, color: sub, marginBottom: 4 }}>{req.reason || req.description}</div>
            )}
            {req.type === 'leave' && Array.isArray(req.leaveDayChanges) && req.leaveDayChanges.length > 0 && (
              <div style={{ fontSize: 10, color: '#b45309', fontWeight: 700, marginBottom: 4 }}>
                Reduced: {req.leaveDayChanges.map((c) => `${c.byLabel || 'Approver'} ${c.from}→${c.to}`).join(' · ')}
              </div>
            )}
            {req.type === 'od' && (
              <div style={{ fontSize: 11, color: sub, marginBottom: 4 }}>
                To: {req.visitingTo} · {req.purpose} · {req.timeRequired}
              </div>
            )}
            {req.type === 'visitor' && (
              <div style={{ fontSize: 11, color: sub, marginBottom: 4 }}>
                {req.visitorName} ({req.visitorType}) · {req.purpose}
              </div>
            )}
            {req.type === 'it' && (
              <div style={{ fontSize: 11, color: sub, marginBottom: 4 }}>
                {req.category} · {req.issue || req.description}
              </div>
            )}
            {req.type === 'it' ? (
              <ITTicketActions req={req} userProfile={userProfile || { mobile: userMobile, appRole: userAppRole }} onDone={() => {}} />
            ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
              <button disabled={!!saving} onClick={() => (req.type === 'leave' ? onOpen({ req }) : reject(req))}
                style={{ flex: 1, background: 'var(--red)', border: 'none', borderRadius: 8, padding: '8px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                {saving === req.id + 'R' ? '⏳' : '❌ Reject'}
              </button>
              <button disabled={!!saving} onClick={() => (req.type === 'leave' ? onOpen({ req }) : approve(req))}
                style={{ flex: 2, background: '#7c3aed', border: 'none', borderRadius: 8, padding: '8px', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                {saving === req.id + 'A' ? '⏳ Approving…' : (req.type === 'leave' ? '👁 Review & Approve' : '✅ Approve')}
              </button>
            </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── PendingDCs ────────────────────────────────────────────────────────────────────
function PendingDCs({ unit, dark, bdr, txt, sub }) {
  const [dcs, setDcs] = useState([]);
  const [saving, setSaving] = useState(null);
  useEffect(() => {
    try {
      return onSnapshot(
        query(collection(db,'dc_approvals'), where('unit','==',unit||'u1'), where('status','==','Pending')),
        s => {
          const docs = s.docs.map(d=>({id:d.id,...d.data()}));
          docs.sort((a,b)=>(b.createdAt?.toMillis?.()??0)-(a.createdAt?.toMillis?.()??0));
          setDcs(docs);
        }
      );
    } catch(e) {}
  }, [unit]);

  if (!dcs.length) return null;

  async function approve(dc) {
    setSaving(dc.id+'A');
    try {
      await updateDoc(doc(db,'dc_approvals',dc.id),{status:'Approved',approvedBy:'Owner',approvedAt:serverTimestamp()});
      // Update movement record to Out
      if(dc.movementId){
        const movCol = `security_internal_${(unit||'u1')==='u2'?'u2':'u1'}`;
        await updateDoc(doc(db,movCol,dc.movementId),{status:'Out',dcApprovedAt:serverTimestamp(),dcApprovedBy:'Owner'});
      }
    } catch(e){alert(e.message);}
    finally{setSaving(null);}
  }
  async function reject(dc) {
    const reason = window.prompt('Rejection reason:');
    if(reason===null) return;
    setSaving(dc.id+'R');
    try {
      await updateDoc(doc(db,'dc_approvals',dc.id),{status:'Rejected',rejectedBy:'Owner',rejectedAt:serverTimestamp(),rejectionReason:reason||'Rejected'});
    } catch(e){alert(e.message);}
    finally{setSaving(null);}
  }

  return (
    <div style={{borderBottom:`2px solid #1e40af`,marginBottom:8}}>
      <div style={{padding:'8px 16px',fontSize:10,fontWeight:700,color:'#1e40af',background:'#eff6ff',textTransform:'uppercase',letterSpacing:'0.06em'}}>📄 Pending DC Approvals ({dcs.length})</div>
      {dcs.map(dc=>(
        <div key={dc.id} style={{padding:'12px 16px',borderBottom:`1px solid ${bdr}`,background:'#eff6ff22'}}>
          <div style={{fontWeight:800,color:txt,fontSize:13,marginBottom:2}}>DC#{dc.dcNumber} — {dc.alubeanName||dc.vehicleNumber}</div>
          <div style={{fontSize:11,color:sub,marginBottom:2}}>{dc.department} · {dc.movementType} → {dc.source||dc.supplier}</div>
          <div style={{fontSize:11,color:sub,marginBottom:2}}>{dc.itemDescription}</div>
          <div style={{display:'flex',gap:12,fontSize:11,marginBottom:8}}>
            <span style={{color:'#15803d',fontWeight:700}}>₹{(dc.budgetaryCost||0).toLocaleString('en-IN',{maximumFractionDigits:2})}</span>
            <span style={{color:'#6b7280'}}>{dc.qty||0} {dc.uom||'Nos'} · {dc.estHrsPerKg||0} hrs/kg</span>
            {dc.repeatJob==='Yes'&&<span style={{color:'#b45309',fontWeight:700}}>Repeat Job</span>}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button disabled={!!saving} onClick={()=>reject(dc)}
              style={{flex:1,background:'var(--red)',border:'none',borderRadius:8,padding:'8px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              {saving===dc.id+'R'?'⏳':'❌ Reject'}
            </button>
            <button disabled={!!saving} onClick={()=>approve(dc)}
              style={{flex:2,background:'#15803d',border:'none',borderRadius:8,padding:'8px',color:'#fff',fontSize:12,fontWeight:800,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              {saving===dc.id+'A'?'⏳ Approving…':'✅ Approve & Clear to Exit'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── PendingVisitors ────────────────────────────────────────────────────────────
function PendingVisitors({ unit, dark, bdr, txt, sub }) {
  const [visitors, setVisitors] = useState([]);
  const [saving, setSaving] = useState(null);
  useEffect(() => {
    const col = `security_visitors_${unit==='u2'?'u2':'u1'}`;
    try {
      return onSnapshot(query(collection(db, col), where('approvalStatus','==','Pending')), s => setVisitors(s.docs.map(d=>({id:d.id,...d.data()}))));
    } catch(e) {}
  }, [unit]);

  if (!visitors.length) return null;

  return (
    <div style={{borderBottom:`2px solid var(--purple)`,marginBottom:8}}>
      <div style={{padding:'8px 16px',fontSize:10,fontWeight:700,color:'#a855f7',background:'var(--purple-bg)',textTransform:'uppercase',letterSpacing:'0.06em'}}>👤 Visitor Approvals ({visitors.length})</div>
      {visitors.map(v=>(
        <div key={v.id} style={{padding:'12px 16px',borderBottom:`1px solid ${bdr}`,background:'var(--purple-bg)'}}>
          <div style={{fontWeight:800,color:txt,fontSize:13,marginBottom:2}}>{v.visitorName}</div>
          <div style={{fontSize:11,color:sub,marginBottom:2}}>{v.company||'—'} → {v.employeeToMeet||v.alubeanToMeet}</div>
          <div style={{fontSize:11,color:sub,marginBottom:8}}>{v.purpose}</div>
          <div style={{display:'flex',gap:8}}>
            <button disabled={saving===v.id+'A'} onClick={async()=>{
              setSaving(v.id+'A');
              await updateDoc(doc(db,`security_visitors_${unit==='u2'?'u2':'u1'}`,v.id),{approvalStatus:'Approved',approvedAt:serverTimestamp(),inTime:serverTimestamp(),inTimeStr:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})});
              setSaving(null);
            }} style={{flex:1,background:'var(--green)',border:'none',borderRadius:8,padding:'8px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              {saving===v.id+'A'?'⏳':'✅ Approve'}
            </button>
            <button disabled={saving===v.id+'R'} onClick={async()=>{
              setSaving(v.id+'R');
              await updateDoc(doc(db,`security_visitors_${unit==='u2'?'u2':'u1'}`,v.id),{approvalStatus:'Rejected',rejectedAt:serverTimestamp()});
              setSaving(null);
            }} style={{flex:1,background:'var(--red)',border:'none',borderRadius:8,padding:'8px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              {saving===v.id+'R'?'⏳':'❌ Reject'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main NotificationCenter ────────────────────────────────────────────────────
export default function NotificationCenter({ unit, dark, onClose, notifs = [], userEmail, userMobile, userAppRole, isolateLegacy = false, initialRequestId, userProfile }) {
  const [tab, setTab] = useState('all');
  const [purging, setPurging] = useState(false);
  const [detail, setDetail] = useState(null); // { notif, req, loading }
  const [pendingReqCount, setPendingReqCount] = useState(0);

  const bdr = 'var(--border-subtle)';
  const txt = 'var(--text-primary)';
  const sub = 'var(--text-secondary)';

  async function openDetail({ notif, req } = {}) {
    const requestId = req?.id || notif?.requestId;
    if (notif) markNotifRead(notif, unit).catch(() => {});
    if (req) {
      setDetail({ notif: notif || null, req, loading: false });
      return;
    }
    if (requestId) {
      setDetail({ notif: notif || null, req: null, loading: true });
      const loaded = await getAppRequest(requestId).catch(() => null);
      setDetail({ notif: notif || null, req: loaded, loading: false });
      return;
    }
    setDetail({ notif: notif || null, req: null, loading: false });
  }

  useEffect(() => {
    if (!initialRequestId) return;
    let cancelled = false;
    (async () => {
      setDetail({ notif: { requestId: initialRequestId }, req: null, loading: true });
      const loaded = await getAppRequest(initialRequestId).catch(() => null);
      if (!cancelled) setDetail({ notif: { requestId: initialRequestId }, req: loaded, loading: false });
    })();
    return () => { cancelled = true; };
  }, [initialRequestId]);

  // Show notifications meant for this user (mobile-first + role backup for request notifs)
  const forMe = notifs.filter((n) => {
    if (n.targetMobile || n.nextApproverMobile || n.targetRole || n._source === 'app_request') {
      return notifIsForUser(n, userMobile, userAppRole);
    }
    if (!n.targetEmail && !n.nextApproverEmail) return true;
    const email = String(userEmail || '').toLowerCase();
    if (!email) return true;
    return (
      String(n.targetEmail || '').toLowerCase() === email ||
      String(n.nextApproverEmail || '').toLowerCase() === email
    );
  });

  // Count per tab
  const unread = forMe.filter(n=>!n.read).length;
  const pendingCount = forMe.filter(n => notifBucket(n) === 'pending' && !isRequestNotif(n)).length;
  const approvedCount = forMe.filter(n => notifBucket(n) === 'approved').length;
  const rejectedCount = forMe.filter(n => notifBucket(n) === 'rejected').length;

  const tabCount = (id) => {
    if (id==='all') return unread;
    if (id==='approvals') return pendingReqCount + pendingCount;
    if (id==='approved') return approvedCount;
    if (id==='rejected') return rejectedCount;
    return forMe.filter(n=>TAB_TYPES[id]?.includes(n.type)&&!n.read).length;
  };

  // Approvals = live pending requests for this user only (PendingRequests), not status notifs
  const shown = tab==='all' ? forMe
    : tab==='approvals' ? forMe.filter(n => notifBucket(n) === 'pending' && !isRequestNotif(n))
    : tab==='approved' ? forMe.filter(n => notifBucket(n) === 'approved')
    : tab==='rejected' ? forMe.filter(n => notifBucket(n) === 'rejected')
    : forMe.filter(n => TAB_TYPES[tab]?.includes(n.type));

  // Sort — unread first, then newest (supports ISO strings + Firestore Timestamp)
  const sorted = [...shown].sort((a,b)=>{
    if(!a.read&&b.read) return -1;
    if(a.read&&!b.read) return 1;
    return notifTimeMs(b) - notifTimeMs(a);
  });

  async function handleMarkAll() {
    if (isolateLegacy) {
      await Promise.all(
        forMe
          .filter((n) => n._source === 'app_request' && !n.read)
          .map((n) => markAppRequestNotifRead(n.id).catch(() => {}))
      );
      return;
    }
    await Promise.all([
      markAllRead(unit).catch(() => {}),
      ...forMe
        .filter((n) => n._source === 'app_request' && !n.read)
        .map((n) => markAppRequestNotifRead(n.id).catch(() => {})),
    ]);
  }

  async function handlePurge() {
    if(!window.confirm('Delete read and already-actioned notifications?')) return;
    setPurging(true);
    try {
      const colName = `notifications_${unit==='u2'?'u2':'u1'}`;
      // Get all notifications (both read and unread)
      const snap = await getDocs(query(collection(db, colName), limit(500)));
      const toDelete = snap.docs.filter(d => {
        const data = d.data();
        // Delete if: read, OR already actioned (visitor/permission approved/rejected), OR acknowledged
        if (data.read) return true;
        if (data.acknowledged) return true;
        if (data.visitorApproved || data.visitorRejected) return true;
        if (data.permApproved || data.permRejected) return true;
        if (data.securityActioned) return true;
        // Keep if still pending approval and not actioned
        return false;
      });
      const batch = writeBatch(db);
      toDelete.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch(e) { alert('Purge failed: '+e.message); }
    setPurging(false);
  }

  async function handleAck(n) {
    const colName = `notifications_${unit==='u2'?'u2':'u1'}`;
    await updateDoc(doc(db, colName, n.id), { pendingApproval:false, acknowledged:true, read:true });
    if (n.taskId) await updateTask(n.taskId, { pendingApproval:false, approvalAcknowledged:true }, unit);
  }

  async function handleDeny(n) {
    const colName = `notifications_${unit==='u2'?'u2':'u1'}`;
    // Reopen the task
    if (n.taskId) {
      await updateTask(n.taskId, { status:'Open', closedAt:null, pendingApproval:false, _taskDesc:n.message||'', lastUpdatedByName:'Owner' }, unit);
    }
    await updateDoc(doc(db, colName, n.id), { pendingApproval:false, denied:true, read:true, title: n.title+' (Reopened)' });
  }

  return (
    <div style={{
      position:'fixed', top:0, right:0, bottom:0,
      width:'min(400px,100vw)',
      background:'var(--bg-base)',
      border:'none',
      borderLeft:'1px solid var(--border-subtle)',
      boxShadow:'var(--shadow-5)',
      display:'flex', flexDirection:'column',
      zIndex:1000,
      fontFamily:'var(--font-sans)',
      animation:'slideIn 0.25s var(--ease-out)',
      overflow:'hidden',
    }}>
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

      {/* Header */}
      <div style={{background:'var(--bg-raised)',borderBottom:'1px solid var(--border-subtle)',padding:'14px 16px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:16}}>🔔</span>
            <span style={{fontSize:14,fontWeight:800,color:txt}}>Notifications</span>
            {unread>0&&<span style={{background:'var(--red)',color:'#fff',fontSize:10,fontWeight:800,padding:'2px 7px',borderRadius:20}}>{unread}</span>}
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button onClick={handleMarkAll} style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:6,padding:'5px 10px',color:'var(--text-secondary)',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✓ Mark All Read</button>
            {!isolateLegacy&&<button onClick={handlePurge} disabled={purging} style={{background:'var(--red-bg)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,padding:'5px 10px',color:'var(--red)',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              {purging?'⏳':'🗑 Purge'}
            </button>}
            <button onClick={onClose} style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:6,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',color:sub,fontSize:16,cursor:'pointer'}}>×</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:4,overflowX:'auto',paddingBottom:2}}>
          {TABS.map(t=>{
            const cnt = tabCount(t.id);
            const active = tab===t.id;
            return (
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                flexShrink:0,
                display:'flex',alignItems:'center',gap:4,
                padding:'5px 10px',
                borderRadius:6,
                border:`1px solid ${active?'var(--accent)':'var(--border-subtle)'}`,
                background:active?'var(--accent-glass)':'var(--glass-1)',
                color:active?'var(--accent)':'var(--text-secondary)',
                fontSize:11,fontWeight:active?700:400,
                cursor:'pointer',fontFamily:'var(--font-sans)',
                transition:'all 0.15s',whiteSpace:'nowrap',
              }}>
                <span>{t.icon}</span>
                <span>{t.label}</span>
                {cnt>0&&<span style={{background:active?'var(--accent)':'var(--red)',color:active?'#000':'#fff',fontSize:9,fontWeight:800,padding:'1px 5px',borderRadius:10}}>{cnt}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:'auto',position:'relative'}}>
        <div style={{ display: tab === 'approvals' ? 'block' : 'none' }}>
          <PendingRequests unit={unit} dark={dark} bdr={bdr} txt={txt} sub={sub} userMobile={userMobile} userAppRole={userAppRole} userProfile={userProfile} onOpen={openDetail} onCount={setPendingReqCount}/>
        </div>
        {tab==='security' && !isolateLegacy && (
          <>
            <PendingDCs unit={unit} dark={dark} bdr={bdr} txt={txt} sub={sub}/>
            <PendingVisitors unit={unit} dark={dark} bdr={bdr} txt={txt} sub={sub}/>
            <PendingPermissions unit={unit} dark={dark} bdr={bdr} txt={txt} sub={sub}/>
          </>
        )}

        {/* Notification list */}
        {sorted.length===0 && !(tab==='approvals' && pendingReqCount>0) && (
          <div style={{textAlign:'center',padding:'48px 20px',color:sub}}>
            <div style={{fontSize:36,marginBottom:8}}>🔔</div>
            <div style={{fontSize:13}}>
              {tab==='approvals' ? 'No pending approvals' : tab==='approved' ? 'No approved notifications' : tab==='rejected' ? 'No rejected notifications' : `No notifications ${tab!=='all'?'in this category':''}`}
            </div>
          </div>
        )}
        {sorted.map(n=>(
          <NotifCard key={n.id} n={n} unit={unit} dark={dark} bdr={bdr} txt={txt} sub={sub}
            onOpen={(item)=>openDetail({ notif: item })}
            onAck={handleAck}
            onDeny={handleDeny}
            onApproveVisitor={async(n2)=>{
              const col=`security_visitors_${unit==='u2'?'u2':'u1'}`;
              if(n2.visitorId) await updateDoc(doc(db,col,n2.visitorId),{approvalStatus:'Approved',approvedAt:serverTimestamp(),inTime:serverTimestamp(),inTimeStr:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})});
              await updateDoc(doc(db,`notifications_${unit==='u2'?'u2':'u1'}`,n2.id),{visitorApproved:true,read:true});
            }}
            onRejectVisitor={async(n2)=>{
              const col=`security_visitors_${unit==='u2'?'u2':'u1'}`;
              if(n2.visitorId) await updateDoc(doc(db,col,n2.visitorId),{approvalStatus:'Rejected',rejectedAt:serverTimestamp()});
              await updateDoc(doc(db,`notifications_${unit==='u2'?'u2':'u1'}`,n2.id),{visitorRejected:true,read:true});
            }}
            onApprovePerm={async(n2)=>{
              const col=`security_permission_${unit==='u2'?'u2':'u1'}`;
              if(n2.permissionId) await updateDoc(doc(db,col,n2.permissionId),{status:'Approved',approvedAt:serverTimestamp()});
              await updateDoc(doc(db,`notifications_${unit==='u2'?'u2':'u1'}`,n2.id),{permApproved:true,read:true});
            }}
            onRejectPerm={async(n2)=>{
              const col=`security_permission_${unit==='u2'?'u2':'u1'}`;
              if(n2.permissionId) await updateDoc(doc(db,col,n2.permissionId),{status:'Rejected',rejectedAt:serverTimestamp()});
              await updateDoc(doc(db,`notifications_${unit==='u2'?'u2':'u1'}`,n2.id),{permRejected:true,read:true});
            }}
            onApproveDC={async(n2)=>{
              if(!n2.dcId) return;
              await updateDoc(doc(db,'dc_approvals',n2.dcId),{status:'Approved',approvedBy:'Owner',approvedAt:serverTimestamp()});
              const dcSnap = await import('firebase/firestore').then(m=>m.getDoc(m.doc(db,'dc_approvals',n2.dcId)));
              const dcData = dcSnap.data();
              if(dcData?.movementId){
                const movCol=`security_internal_${(unit||'u1')==='u2'?'u2':'u1'}`;
                await updateDoc(doc(db,movCol,dcData.movementId),{status:'Out',dcApprovedAt:serverTimestamp(),dcApprovedBy:'Owner'});
              }
              await updateDoc(doc(db,`notifications_${unit==='u2'?'u2':'u1'}`,n2.id),{dcApproved:true,read:true});
            }}
            onRejectDC={async(n2)=>{
              const reason = window.prompt('Rejection reason:');
              if(reason===null) return;
              if(!n2.dcId) return;
              await updateDoc(doc(db,'dc_approvals',n2.dcId),{status:'Rejected',rejectedBy:'Owner',rejectedAt:serverTimestamp(),rejectionReason:reason||'Rejected'});
              await updateDoc(doc(db,`notifications_${unit==='u2'?'u2':'u1'}`,n2.id),{dcRejected:true,read:true});
            }}
          />
        ))}
      </div>
      {detail && (
        <NotifDetailSheet
          notif={detail.notif}
          req={detail.req}
          loading={detail.loading}
          userMobile={userMobile}
          userAppRole={userAppRole}
          userProfile={userProfile}
          onClose={() => setDetail(null)}
          onDone={() => setDetail(null)}
        />
      )}
    </div>
  );
}
