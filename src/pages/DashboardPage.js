
// ── Soft update check (do NOT reload on every Excel/tab focus) ─────────────────
const APP_VERSION = '117';
let _versionCheckBusy = false;
async function checkVersion() {
  if (_versionCheckBusy) return;
  // Never wipe an in-progress Admin form while the user is copying from Excel
  if (document.body?.dataset?.alubeeAdminBusy === '1') return;
  _versionCheckBusy = true;
  try {
    const res = await fetch('/index.html?v=' + Date.now(), { cache: 'no-store' });
    const text = await res.text();
    const match = text.match(/app-version.*?content="(\d+)"/);
    if (match && match[1] !== APP_VERSION) {
      // Soft prompt only — hard reload was wiping Admin forms on tab focus
      if (!sessionStorage.getItem('alubee_update_prompted_' + match[1])) {
        sessionStorage.setItem('alubee_update_prompted_' + match[1], '1');
        const ok = window.confirm('A new Alubee version is available. Reload now?\n\nUnsaved Admin form data will be lost.');
        if (ok) window.location.reload();
      }
    }
  } catch (e) {
    /* ignore offline / local fetch errors */
  } finally {
    _versionCheckBusy = false;
  }
}
// Occasional check only — NOT on every window focus (that broke Excel copy/paste)
setInterval(checkVersion, 15 * 60 * 1000);

import React, { useEffect, useState, useMemo } from 'react';
import useIsMobile from '../hooks/useIsMobile';
import { useAuth } from '../contexts/AuthContext';
import { DEPARTMENTS, getDeptLabel, getDeptColor, getUsersByUnit } from '../data/orgData';
import { subscribeAllTasks, subscribeDeptTasks, subscribeDeptHeadTasks, subscribeMyTasks, daysOpen, agingBucket, formatDate, updateTask, deleteTask } from '../utils/taskService';
import { subscribeNotifications, NOTIF_ICONS, NOTIF_COLORS, requestDeletion } from '../utils/notificationService';
import { subscribeAppRequestNotifications, subscribeAppRequests, getProfileMobile, isRequestPendingForUser } from '../utils/requestService';
import TaskFormModal from '../components/TaskFormModal';
import NotificationCenter from '../components/NotificationCenter';
import AgeingScreen from './AgeingScreen';
import ERPDashboard from './ERPDashboard';
import StoresDashboard from './StoresDashboard';
import ExecutiveSummary from './ExecutiveSummary';
import ChildPartsDashboard from './ChildPartsDashboard';
import MigrateU2Data from './MigrateU2Data';
import SecurityDashboard from './SecurityDashboard';
import AlubeaAssistant from '../components/AlubeaAssistant';
import RevenueDashboard from './RevenueDashboard';
import SupplierDashboard from './SupplierDashboard';
import RequestsDashboard from './RequestsDashboard';
import MaintenanceDashboard from './MaintenanceDashboard';
import CustomerDashboard from './CustomerDashboard';
import MigrateCustomerData from './MigrateCustomerData';
import AdminPanel from './AdminPanel';
import SettingsPage from './SettingsPage';
import HRDashboard from './HRDashboard';
import ITDashboard from './ITDashboard';
import { canAccessScreen, getRoleLabel, roleHasFullAccess } from '../data/appRoles';
import { canAccessSettings, subscribeNotifPrefs, filterNotifsForUser, isBroadcastNotifRole } from '../utils/settingsService';
import { isAndroidApp } from '../utils/phoneNumbers';
import { consumePendingNotifTap, resolveNotifDestination } from '../utils/mobileApp';
import {
  checkBiometricAvailability,
  biometryLabel,
  isBiometricEnabledLocally,
  enableBiometricLogin,
  disableBiometricLogin,
} from '../utils/biometricAuth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const STATUS_STYLE = {
  'Open':        {bg:'rgba(239,68,68,0.12)',   text:'#f87171', border:'rgba(239,68,68,0.25)'},
  'In Progress': {bg:'rgba(245,158,11,0.12)',  text:'#fbbf24', border:'rgba(245,158,11,0.25)'},
  'On Hold':     {bg:'rgba(249,115,22,0.12)',  text:'#fb923c', border:'rgba(249,115,22,0.25)'},
  'Closed':      {bg:'rgba(34,197,94,0.12)',   text:'#4ade80', border:'rgba(34,197,94,0.25)'},
  'Cancelled':   {bg:'rgba(100,116,139,0.12)', text:'#94a3b8', border:'rgba(100,116,139,0.25)'},
  'Outside Support / Service Required': {bg:'rgba(59,130,246,0.12)', text:'#60a5fa', border:'rgba(59,130,246,0.25)'},
  'Need Clarity from Team Engine (MD)': {bg:'rgba(168,85,247,0.12)', text:'#c084fc', border:'rgba(168,85,247,0.25)'},
};
const PRIORITY_COLOR = {High:'#f87171',Medium:'#fbbf24',Low:'#4ade80',Critical:'#ff4d4f'};
const AGING_COLOR    = {fresh:'#4ade80',watch:'#fbbf24',overdue:'#f87171'};
const FILTER_STATUSES   = ['Active (Default)','All','Open','In Progress','On Hold','Closed','Cancelled'];
const DATE_FILTERS = ['All Time','Today','This Week','This Month'];
const FILTER_PRIORITIES = ['All','High','Medium','Low'];

function normalizeName(n) { if(!n) return n; if(n.toLowerCase()==='prabha') return 'Prabhakaran'; return n; }
function getTaskOwner(t)     { return normalizeName(t.assignedToPersonName || t.raisedByName) || '—'; }
function getTaskOwnerDept(t) { return t.assignedToDept || t.raisedByDept || ''; }

// ── Export ─────────────────────────────────────────────────────────────────────
function tasksToRows(tasks) {
  return tasks.map((t,i) => ({
    'No': i+1, 'Description': t.description||'',
    'Task Owner': getTaskOwner(t), 'Owner Dept': getDeptLabel(getTaskOwnerDept(t)),
    'Raised By': t.raisedByName||'', 'From Dept': getDeptLabel(t.raisedByDept),
    'Priority': t.priority||'', 'Status': t.status||'',
    'Days Open': t.status==='Closed'?0:daysOpen(t),
    'Due Date': t.dueDate||'—', 'Machine No': t.machineNumber||'—',
    'Part/Job Ref': t.partNumber||'—', 'Est Hours': t.estimatedHours||'—',
    'Remarks': t.remarks||'—', 'Created': formatDate(t.createdAt),
    'Closed': t.closedAt?formatDate(t.closedAt):'—',
  }));
}
function exportCSV(tasks, fn) {
  const rows=tasksToRows(tasks); if(!rows.length) return alert('No tasks.');
  const h=Object.keys(rows[0]);
  const csv=[h.join(','),...rows.map(r=>h.map(k=>`"${String(r[k]).replace(/"/g,'""')}"`).join(','))].join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=fn+'.csv'; a.click();
}
function exportExcel(tasks, fn) {
  const rows=tasksToRows(tasks); if(!rows.length) return alert('No tasks.');
  const h=Object.keys(rows[0]);
  const ths=h.map(k=>`<th style="background:#1F3864;color:white;padding:6px 10px;font-weight:bold">${k}</th>`).join('');
  const trs=rows.map((r,i)=>`<tr>${h.map(k=>`<td style="padding:5px 10px;background:${i%2?'#EBF0FA':'#fff'}">${r[k]}</td>`).join('')}</tr>`).join('');
  const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'application/vnd.ms-excel'})); a.download=fn+'.xls'; a.click();
}
async function downloadJsPDF(tasks, filterDesc) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const W = 210, margin = 12, colW = [8,90,30,25,20,25];
  let y = margin;

  // Header
  doc.setFillColor(31,56,100);
  doc.rect(0,0,W,22,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text('ALUBEE DIE CASTERS — TASK REPORT', margin, 10);
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`${filterDesc}  |  ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}  |  ${tasks.length} tasks`, margin, 17);
  y = 28;

  // Column headers
  doc.setFillColor(220,38,38);
  doc.rect(margin,y,W-margin*2,7,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(7.5); doc.setFont('helvetica','bold');
  const headers = ['#','Task','Department','Status','Age','Owner'];
  let x = margin;
  headers.forEach((h,i)=>{ doc.text(h, x+1, y+5); x+=colW[i]; });
  y += 9;

  // Task rows
  const statusColor = { 'Open':[239,68,68], 'In Progress':[249,115,22], 'On Hold':[234,179,8], 'Closed':[34,197,94] };
  tasks.forEach((t, idx) => {
    if(y > 270) { doc.addPage(); y = margin; }
    const isEven = idx%2===0;
    if(isEven){ doc.setFillColor(249,250,251); doc.rect(margin,y,W-margin*2,7,'F'); }
    doc.setTextColor(30,30,30);
    doc.setFontSize(7); doc.setFont('helvetica','normal');
    const sc = statusColor[t.status]||[100,100,100];
    x = margin;
    // #
    doc.text(String(idx+1), x+1, y+5); x+=colW[0];
    // Title — truncate
    const title = (t.title||'').length>48?(t.title||'').slice(0,45)+'…':(t.title||'');
    doc.text(title, x+1, y+5); x+=colW[1];
    // Dept
    const dept = (t.assignedToDept||t.raisedByDept||'').toUpperCase().slice(0,12);
    doc.text(dept, x+1, y+5); x+=colW[2];
    // Status pill
    doc.setFillColor(...sc);
    doc.roundedRect(x+1, y+1.5, colW[3]-4, 4, 1, 1, 'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold');
    doc.text(t.status||'', x+3, y+4.8); x+=colW[3];
    // Age
    doc.setTextColor(30,30,30); doc.setFont('helvetica','normal');
    const age = t.createdAt?.toDate ? Math.floor((Date.now()-t.createdAt.toDate().getTime())/86400000) : '—';
    doc.text(String(age)+'d', x+1, y+5); x+=colW[4];
    // Owner
    const owner = ((t.assignedToPersonName||t.raisedByName)||'').slice(0,14);
    doc.text(owner, x+1, y+5);
    y += 7;
  });

  // Footer
  doc.setFontSize(7); doc.setTextColor(150,150,150);
  doc.text(`Alubee Tasks  ·  Generated ${new Date().toLocaleString('en-IN')}`, margin, 290);
  doc.text(`Page 1`, W-margin-8, 290);

  // Save
  const fileName = `alubee-tasks-${new Date().toISOString().slice(0,10)}.pdf`;
  const isNativeAPK = !!(window.Capacitor?.isNativePlatform?.());
  if(isNativeAPK){
    // On APK — convert to base64 and share via Capacitor Browser
    const pdfBase64 = doc.output('datauristring');
    try {
      const {Browser} = await import('@capacitor/browser');
      await Browser.open({url: pdfBase64, presentationStyle:'fullscreen'});
    } catch(e){
      // Fallback to blob URL
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      window.open(url,'_blank');
    }
  } else {
    doc.save(fileName);
  }
}

async function exportPDF(tasks, fn, filterDesc, setShowPDF, setPDFContent) {
  const rows = tasksToRows(tasks);
  if (!rows.length) return alert('No tasks.');

  // Group tasks by department
  const deptGroups = {};
  rows.forEach(r => {
    const dept = r['Owner Dept'] || 'General';
    if (!deptGroups[dept]) deptGroups[dept] = [];
    deptGroups[dept].push(r);
  });

  // Status colors
  const sc = s => ({'Open':'#fee2e2','In Progress':'#fef9c3','On Hold':'#ffedd5','Closed':'#dcfce7','Cancelled':'#f1f5f9'}[s]||'#fff');
  const stc = s => ({'Open':'#dc2626','In Progress':'#b45309','On Hold':'#c2410c','Closed':'#16a34a','Cancelled':'#6b7280'}[s]||'#333');
  const ac = d => d>=15?'#fee2e2':d>=8?'#fef9c3':'#dcfce7';
  const atc = d => d>=15?'#dc2626':d>=8?'#b45309':'#16a34a';

  // Tasks only — no ERP/Stores data in PDF

  // Build dept sections HTML
  const deptSections = Object.entries(deptGroups).map(([dept, dRows]) => {
    const openCount   = dRows.filter(r=>r.Status==='Open').length;
    const inProgCount = dRows.filter(r=>r.Status==='In Progress').length;
    const closedCount = dRows.filter(r=>r.Status==='Closed').length;
    const total       = dRows.length;

    const taskRows = dRows.map((r,i) => `
      <tr>
        <td style="width:30px;text-align:center;color:#64748b;font-size:10px">${i+1}</td>
        <td style="text-align:left;font-weight:600;color:#0f172a">${r.Description}</td>
        <td style="text-align:center"><span style="background:${sc(r.Status)};color:${stc(r.Status)};padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700;white-space:nowrap">${r.Status}</span></td>
        <td style="text-align:center"><span style="background:${r.Priority==='High'?'#fee2e2':r.Priority==='Medium'?'#fef9c3':'#dcfce7'};color:${r.Priority==='High'?'#dc2626':r.Priority==='Medium'?'#b45309':'#16a34a'};padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700">${r.Priority||'—'}</span></td>
        <td style="text-align:center;color:#64748b;font-size:10px">${r['Task Owner']||'—'}</td>
        <td style="text-align:center"><span style="background:${ac(r['Days Open'])};color:${atc(r['Days Open'])};padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700">${r['Days Open']}d</span></td>
        <td style="text-align:center;color:#64748b;font-size:10px">${r['Due Date']||'—'}</td>
      </tr>`).join('');

    return `
      <div style="margin-bottom:28px;break-inside:avoid">
        <div style="background:linear-gradient(135deg,#1e3a5f,#1F3864);border-radius:10px 10px 0 0;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="color:#fff;font-size:14px;font-weight:800;letter-spacing:-0.3px">📂 ${dept}</div>
            <div style="color:rgba(255,255,255,0.5);font-size:10px;margin-top:2px">${total} task${total!==1?'s':''} total</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            ${openCount?`<span style="background:rgba(239,68,68,0.2);color:#fca5a5;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700">${openCount} Open</span>`:''}
            ${inProgCount?`<span style="background:rgba(245,158,11,0.2);color:#fde68a;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700">${inProgCount} In Progress</span>`:''}
            ${closedCount?`<span style="background:rgba(34,197,94,0.2);color:#86efac;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700">${closedCount} Closed</span>`:''}
            <span style="background:rgba(255,255,255,0.2);color:#fff;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:900">${total}</span>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e2e8f0;border-top:none">
          <thead><tr>
            <th style="padding:7px 8px;background:#f8fafc;color:#475569;font-weight:700;border-bottom:1px solid #e2e8f0;width:30px">#</th>
            <th style="padding:7px 8px;background:#f8fafc;color:#475569;font-weight:700;border-bottom:1px solid #e2e8f0;text-align:left">Task Description</th>
            <th style="padding:7px 8px;background:#f8fafc;color:#475569;font-weight:700;border-bottom:1px solid #e2e8f0">Status</th>
            <th style="padding:7px 8px;background:#f8fafc;color:#475569;font-weight:700;border-bottom:1px solid #e2e8f0">Priority</th>
            <th style="padding:7px 8px;background:#f8fafc;color:#475569;font-weight:700;border-bottom:1px solid #e2e8f0">Owner</th>
            <th style="padding:7px 8px;background:#f8fafc;color:#475569;font-weight:700;border-bottom:1px solid #e2e8f0">Age</th>
            <th style="padding:7px 8px;background:#f8fafc;color:#475569;font-weight:700;border-bottom:1px solid #e2e8f0">Due</th>
          </tr></thead>
          <tbody>${taskRows}</tbody>
        </table>
      </div>`;
  }).join('');

  // Summary stats
  const open = rows.filter(r=>r.Status==='Open').length;
  const inprog = rows.filter(r=>r.Status==='In Progress').length;
  const closed = rows.filter(r=>r.Status==='Closed').length;
  const overdue = rows.filter(r=>r['Days Open']>=15).length;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${fn}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; padding: 20px; color: #0f172a; }
    .page { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #0a1628, #1F3864); padding: 24px 28px; }
    .body { padding: 24px 28px; }
    .stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
    .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
    tr:nth-child(even) td { background: #f8fafc; }
    td { border-bottom: 1px solid #f1f5f9; }
    @media print {
      body { background: #fff; padding: 0; }
      .page { box-shadow: none; border-radius: 0; }
      .noprint { display: none !important; }
    }
  </style></head><body>
  <div class="noprint" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:999">
    <button onclick="window.print()" style="padding:10px 20px;background:#1F3864;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit">🖨 Print / Save PDF</button>
    <button onclick="window.close()" style="padding:10px 16px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit">✕ Close</button>
  </div>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
        <div style="width:44px;height:44px;background:linear-gradient(135deg,#22c55e,#16a34a);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff">A</div>
        <div>
          <div style="color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.5px">ALUBEE DIE CASTERS</div>
          <div style="color:rgba(255,255,255,0.55);font-size:11px;margin-top:2px">Task & Operations Report</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div>
          <div style="color:rgba(255,255,255,0.7);font-size:12px">${filterDesc}</div>
          <div style="color:rgba(255,255,255,0.45);font-size:10px;margin-top:3px">Generated: ${new Date().toLocaleString('en-IN',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <div style="color:rgba(255,255,255,0.6);font-size:11px;text-align:right">${rows.length} tasks · ${Object.keys(deptGroups).length} departments</div>
      </div>
    </div>

    <div class="body">
      <!-- Summary Stats -->
      <div class="stats-grid">
        <div class="stat"><div style="font-size:28px;font-weight:900;color:#dc2626">${open}</div><div style="font-size:11px;color:#64748b;margin-top:4px;font-weight:600">Open</div></div>
        <div class="stat"><div style="font-size:28px;font-weight:900;color:#d97706">${inprog}</div><div style="font-size:11px;color:#64748b;margin-top:4px;font-weight:600">In Progress</div></div>
        <div class="stat"><div style="font-size:28px;font-weight:900;color:#16a34a">${closed}</div><div style="font-size:11px;color:#64748b;margin-top:4px;font-weight:600">Closed</div></div>
        <div class="stat"><div style="font-size:28px;font-weight:900;color:#dc2626">${overdue}</div><div style="font-size:11px;color:#64748b;margin-top:4px;font-weight:600">Overdue (15d+)</div></div>
      </div>

      <!-- Department Sections -->
      ${deptSections}

      <!-- Footer -->
      <div style="border-top:1px solid #e2e8f0;padding-top:14px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:10px;color:#94a3b8">Alubee Task Tracker · Confidential</div>
        <div style="font-size:10px;color:#94a3b8">${new Date().toLocaleDateString('en-IN')}</div>
      </div>
    </div>
  </div>
</body></html>`;

  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (isNative) {
    setPDFContent(html);
    setShowPDF(true);
  } else {
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  }
}

function ExportBar({tasks,filterDesc,dark,setShowPDF,setPDFContent}) {
  if(!tasks.length) return null;
  const fn=`Alubee_Tasks_${new Date().toISOString().slice(0,10)}`;
  const btn=(l,col,f)=>(<button key={l} onClick={f} style={{background:col,border:'none',borderRadius:8,padding:'7px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>{l}</button>);

  function shareWhatsApp() {
    const lines = tasks.map((t,i)=>{
      const days = t.createdAt?.toDate ? Math.floor((Date.now()-t.createdAt.toDate().getTime())/86400000) : 0;
      return `${i+1}. *${t.description?.slice(0,60)}*\nOwner: ${getTaskOwner(t)} | Status: ${t.status} | Age: ${days}d | Due: ${t.dueDate||'—'}`;
    }).join('\n\n');
    const header = `*ALUBEE TASK REPORT*\n${new Date().toLocaleDateString('en-IN')} | ${tasks.length} tasks\nFilters: ${filterDesc}\n\n`;
    const msg = encodeURIComponent(header + lines);
    window.open(`https://wa.me/?text=${msg}`,'_blank');
  }

  return (
    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:14,flexWrap:'wrap'}}>
      <span style={{fontSize:12,color:dark?'#94a3b8':'#888',fontWeight:600}}>Export {tasks.length} tasks:</span>
      {btn('🖨 PDF','#dc2626',()=>{
        window._currentPDFTasks = tasks;
        window._currentPDFFilterDesc = filterDesc;
        exportPDF(tasks,fn,filterDesc,setShowPDF,setPDFContent);
      })}
      {btn('💬 WhatsApp','#25D366',shareWhatsApp)}
    </div>
  );
}

// ── Task Row ────────────────────────────────────────────────────────────────────
function TaskRow({task,onEdit,dark}) {
  const {userProfile}=useAuth();
  const days=daysOpen(task); const bucket=agingBucket(days);
  const ss=STATUS_STYLE[task.status]||STATUS_STYLE['Open'];
  const owner=getTaskOwner(task); const ownerDept=getTaskOwnerDept(task);
  const canEdit=(userProfile?.role!=='viewer')&&(userProfile?.role==='owner'||userProfile?.id===task.raisedById||userProfile?.dept===task.raisedByDept||userProfile?.dept===task.assignedToDept);
  const canDelete=userProfile?.role==='owner'||userProfile?.id===task.raisedById;
  const txt=dark?'#e2e8f0':'#1a1a2e'; const sub=dark?'#94a3b8':'#888'; const bdr=dark?'#2d3748':'#f0f0f0'; const bg=dark?'#1e2235':'#fff';
  return (
    <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',background:'var(--bg-raised)',borderBottom:'1px solid var(--border-subtle)',transition:'background var(--t-fast)'}}>
      <div style={{width:3,height:36,borderRadius:3,background:task.status==='Closed'||task.status==='Cancelled'?'var(--border-strong)':AGING_COLOR[bucket],flexShrink:0,boxShadow:task.status!=='Closed'?`0 0 8px ${AGING_COLOR[bucket]}44`:''}}/>
      <div style={{width:8,height:8,borderRadius:'50%',background:PRIORITY_COLOR[task.priority]||'#ccc',flexShrink:0}}/>
      {task.pendingApproval===true&&task.approvalAcknowledged!==true&&task.status!=='Closed'&&task.status!=='Cancelled'&&<span style={{fontSize:9,background:'#fef3c7',color:'#d97706',fontWeight:800,padding:'1px 6px',borderRadius:4,flexShrink:0}}>PENDING ACK</span>}
      <div style={{flex:'1 1 260px',minWidth:0}}>
        <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',letterSpacing:'-0.01em'}}>{task.description}</div>
        <div style={{fontSize:11,color:sub,marginTop:2}}>
          Owner: <strong style={{color:getDeptColor(ownerDept)}}>{owner}</strong>
          {ownerDept&&` (${getDeptLabel(ownerDept)})`}
          {task.machineNumber?` · ${task.machineNumber}`:''}
          {' '}<span style={{fontSize:10,color:dark?'#64748b':'#aaa'}}>Created by: {task.raisedByName||'—'}</span>
          {(task.relatedDepts||[]).map(d=><span key={d} style={{marginLeft:4,background:'#eff6ff',color:'#1d4ed8',fontWeight:700,padding:'1px 5px',borderRadius:3,fontSize:10}}>🔗 {getDeptLabel(d)}</span>)}
        </div>
      </div>
      <span style={{fontSize:9,fontWeight:700,padding:'2px 9px',borderRadius:'var(--radius-full)',background:ss.bg,color:ss.text,border:`1px solid ${ss.border}`,whiteSpace:'nowrap',flexShrink:0,letterSpacing:'0.05em',textTransform:'uppercase'}}>{task.status}</span>
      {task.status==='Closed'
        ? <span style={{fontSize:10,color:'var(--green)',flexShrink:0,minWidth:110,textAlign:'right',fontWeight:600}}>✓ {task.closedAt?formatDate(task.closedAt):'—'}{task.closedByName?` · ${task.closedByName}`:''}</span>
        : <span style={{fontSize:11,fontWeight:700,color:AGING_COLOR[bucket],flexShrink:0,minWidth:50,textAlign:'right'}}>{days===0?'Today':`${days}d`}</span>
      }
      <span style={{fontSize:11,color:sub,flexShrink:0,minWidth:70,textAlign:'right'}}>{task.dueDate||'—'}</span>
      <div style={{display:'flex',gap:4,flexShrink:0}}>
        {canEdit&&task.status==='Open'&&<button style={ab('#fffbeb','#d97706')} onClick={()=>updateTask(task.id,{status:'In Progress',_taskDesc:task.description,lastUpdatedByName:userProfile?.name,_raisedById:task.raisedById||''},task.unit||unit||'u1')}>▶</button>}
        {canEdit&&task.status==='In Progress'&&<button style={ab('#f0fdf4','#16a34a')} onClick={()=>updateTask(task.id,{status:'Closed',_taskDesc:task.description,closedByName:userProfile?.name,lastUpdatedByName:userProfile?.name,_raisedById:task.raisedById||''},task.unit||unit||'u1')}>✓</button>}
        {canEdit&&<button style={ab('#f0f4ff','#4f46e5')} onClick={()=>onEdit(task)}>✎</button>}
        {userProfile?.role==='owner'
          ? <button style={ab('#fef2f2','#dc2626')} onClick={()=>window.confirm('Delete this task permanently?')&&deleteTask(task.id,task.unit||'u1',task.description)}>🗑</button>
          : canEdit&&<button style={ab('#fff7ed','#ea580c')} title="Request deletion — owner will be notified" onClick={()=>window.confirm('Send a deletion request to the owner?')&&requestDeletion(task.unit||'u1',task.id,task.description,userProfile?.name)}>📤</button>
        }
      </div>
    </div>
  );
}
const ab=(bg,c,label)=>({
  background:bg,
  border:`1px solid ${c}33`,
  borderRadius:'var(--radius-sm)',
  padding:'5px 10px',
  cursor:'pointer',
  fontSize:11,
  fontWeight:700,
  color:c,
  fontFamily:'var(--font-sans)',
  transition:'all var(--t-fast) var(--ease-out)',
  letterSpacing:'0.02em',
});

// ── Task Card ───────────────────────────────────────────────────────────────────
function TaskCard({task,onEdit,dark}) {
  const {userProfile}=useAuth();
  const [expanded,setExpanded]=useState(false);
  const days=daysOpen(task); const bucket=agingBucket(days);
  const ss=STATUS_STYLE[task.status]||STATUS_STYLE['Open'];
  const owner=getTaskOwner(task); const ownerDept=getTaskOwnerDept(task);
  const canEdit=(userProfile?.role!=='viewer')&&(userProfile?.role==='owner'||userProfile?.id===task.raisedById||userProfile?.dept===task.raisedByDept||userProfile?.dept===task.assignedToDept);
  const canDelete=userProfile?.role==='owner'||userProfile?.id===task.raisedById;
  const txt=dark?'#e2e8f0':'#1a1a2e'; const sub=dark?'#94a3b8':'#888'; const bdr=dark?'#2d3748':'#f0f0f0'; const bg=dark?'#1e2235':'#fff';
  const agingCol = task.status==='Closed'||task.status==='Cancelled' ? 'var(--border-subtle)' : AGING_COLOR[bucket];
  return (
    <div id={`task-${task.id}`} style={{
      background:'var(--bg-raised)',
      borderRadius:'var(--radius-lg)',
      border:`1px solid var(--border-subtle)`,
      borderTop:`2px solid ${agingCol}`,
      boxShadow:'var(--shadow-2)',
      overflow:'hidden',
      transition:'all var(--t-base) var(--ease-out)',
    }}>
      <div style={{padding:'14px 15px'}}>
        {/* Header row */}
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:PRIORITY_COLOR[task.priority]||'var(--border-strong)',flexShrink:0,boxShadow:`0 0 6px ${PRIORITY_COLOR[task.priority]||'transparent'}`}}/>
          <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:'var(--radius-full)',background:ss.bg,color:ss.text,border:`1px solid ${ss.border}`,letterSpacing:'0.04em',textTransform:'uppercase'}}>{task.status}</span>
          {task.pendingApproval===true&&task.approvalAcknowledged!==true&&task.status!=='Closed'&&task.status!=='Cancelled'&&(
            <span style={{fontSize:9,background:'rgba(245,158,11,0.15)',color:'#fbbf24',fontWeight:800,padding:'2px 7px',borderRadius:'var(--radius-full)',border:'1px solid rgba(245,158,11,0.3)',letterSpacing:'0.04em'}}>⏳ ACK</span>
          )}
          {task.status!=='Closed'&&task.status!=='Cancelled'&&(
            <span style={{fontSize:11,fontWeight:800,color:agingCol,marginLeft:'auto',fontVariantNumeric:'tabular-nums'}}>{days===0?'Today':`${days}d`}</span>
          )}
          {task.status==='Closed'&&task.closedAt&&(
            <span style={{fontSize:9,color:'var(--green)',marginLeft:'auto',fontWeight:600,textAlign:'right'}}>✓ {formatDate(task.closedAt)}</span>
          )}
        </div>
        {/* Description */}
        <p style={{margin:'0 0 10px',fontSize:13,fontWeight:600,color:'var(--text-primary)',lineHeight:1.5,letterSpacing:'-0.01em'}}>{task.description}</p>
        {/* Owner */}
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
          <div style={{width:20,height:20,borderRadius:'50%',background:`${getDeptColor(ownerDept)}22`,border:`1px solid ${getDeptColor(ownerDept)}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:getDeptColor(ownerDept),flexShrink:0}}>{owner[0]}</div>
          <span style={{fontSize:11,color:'var(--text-secondary)'}}><strong style={{color:getDeptColor(ownerDept)}}>{owner}</strong>{ownerDept&&` · ${getDeptLabel(ownerDept)}`}</span>
        </div>
        {/* Meta chips */}
        <div style={{display:'flex',flexWrap:'wrap',gap:4,fontSize:10,marginBottom:10}}>
          {task.machineNumber&&<span style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',padding:'2px 7px',borderRadius:'var(--radius-full)'}}>🔩 {task.machineNumber}</span>}
          {task.partNumber&&<span style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',padding:'2px 7px',borderRadius:'var(--radius-full)'}}>📦 {task.partNumber}</span>}
          {task.dueDate&&<span style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',padding:'2px 7px',borderRadius:'var(--radius-full)'}}>📅 {task.dueDate}</span>}
          {(task.relatedDepts||[]).map(d=><span key={d} style={{background:'rgba(59,130,246,0.12)',color:'#60a5fa',fontWeight:700,padding:'2px 7px',borderRadius:'var(--radius-full)',border:'1px solid rgba(59,130,246,0.2)',fontSize:9,letterSpacing:'0.04em'}}>🔗 {getDeptLabel(d)}</span>)}
        </div>
        {expanded&&(
          <div style={{background:'var(--bg-inset)',borderRadius:'var(--radius-md)',padding:'10px 12px',marginBottom:10,fontSize:12,color:'var(--text-secondary)',border:'1px solid var(--border-subtle)'}}>
            {task.remarks&&<p style={{margin:'2px 0'}}><b>Remarks:</b> {task.remarks}</p>}
            {task.estimatedHours&&<p style={{margin:'2px 0'}}><b>Est:</b> {task.estimatedHours}h</p>}
            {task.closedByName&&<p style={{margin:'2px 0'}}><b>Closed by:</b> <span style={{color:'#16a34a',fontWeight:700}}>{task.closedByName}</span></p>}
            {task.lastUpdatedByName&&task.status!=='Closed'&&<p style={{margin:'2px 0'}}><b>Updated by:</b> {task.lastUpdatedByName}</p>}
            <p style={{margin:'2px 0'}}><b>Created:</b> {formatDate(task.createdAt)}</p>
            {task.closedAt&&<p style={{margin:'2px 0'}}><b>Closed:</b> {formatDate(task.closedAt)}</p>}
            {(task.taskPhotoURLs?.length>0||task.taskPhotoURL)&&(
              <div style={{marginTop:8}}>
                <p style={{margin:'0 0 6px',fontWeight:700,color:txt,fontSize:12}}>📷 Task Photos:</p>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {(task.taskPhotoURLs||[task.taskPhotoURL]).filter(Boolean).map((url,i)=>(
                    <img key={i} src={url} alt={`Photo ${i+1}`} style={{width:100,height:100,objectFit:'cover',borderRadius:8,border:'1px solid #e8e8e8',cursor:'pointer'}} onClick={()=>window.open(url,'_blank')}/>
                  ))}
                </div>
              </div>
            )}
            {task.closurePhotoURL&&(
              <div style={{marginTop:8}}>
                <p style={{margin:'0 0 4px',fontWeight:700,color:txt}}>✅ Closure Evidence:</p>
                <img src={task.closurePhotoURL} alt="Closure evidence" style={{maxWidth:'100%',borderRadius:8,border:'1px solid #e8e8e8'}}/>
              </div>
            )}
          </div>
        )}
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          <button style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-sm)',padding:'4px 9px',cursor:'pointer',fontSize:10,color:'var(--text-secondary)',fontFamily:'inherit',transition:'all var(--t-fast)'}} onClick={()=>setExpanded(x=>!x)}>{expanded?'▲ Less':'▼ More'}</button>
          {canEdit&&task.status==='Open'&&<button style={ab('#fffbeb','#d97706')} onClick={()=>updateTask(task.id,{status:'In Progress',_taskDesc:task.description,lastUpdatedByName:userProfile?.name,_raisedById:task.raisedById||''},task.unit||unit||'u1')}>▶ Start</button>}
          {canEdit&&task.status==='In Progress'&&<button style={ab('#f0fdf4','#16a34a')} onClick={()=>updateTask(task.id,{status:'Closed',_taskDesc:task.description,closedByName:userProfile?.name,lastUpdatedByName:userProfile?.name,_raisedById:task.raisedById||''},task.unit||unit||'u1')}>✓ Close</button>}
          {canEdit&&<button style={ab('#f0f4ff','#4f46e5')} onClick={()=>onEdit(task)}>✎ Edit</button>}
          {userProfile?.role==='owner'
            ? <button style={ab('#fef2f2','#dc2626')} onClick={()=>window.confirm('Delete this task permanently?')&&deleteTask(task.id,task.unit||'u1',task.description)}>🗑 Delete</button>
            : canEdit&&<button style={ab('#fff7ed','#ea580c')} title="Request deletion — owner will be notified" onClick={()=>window.confirm('Send deletion request to owner?')&&requestDeletion(task.unit||'u1',task.id,task.description,userProfile?.name)}>📤 Request Delete</button>
          }
        </div>
      </div>
    </div>
  );
}

// ── Filter Bar ──────────────────────────────────────────────────────────────────
function FilterBar({search,setSearch,filterStatus,setFilterStatus,filterPriority,setFilterPriority,
  filterDept,setFilterDept,showDeptFilter,filterOwner,setFilterOwner,ownerList,
  filterDate,setFilterDate,filterRaisedBy,setFilterRaisedBy,raisedByList,
  viewMode,setViewMode,dark,count,activeFilters}) {
  const inp={
    border:'1px solid var(--border-default)',
    borderRadius:'var(--radius-md)',
    padding:'8px 12px',
    fontSize:12,
    outline:'none',
    fontFamily:'var(--font-sans)',
    background:'var(--bg-raised)',
    color:'var(--text-primary)',
    appearance:'none',
    cursor:'pointer',
    transition:'border-color var(--t-fast)',
  };
  const tog = a => ({
    background: a ? 'var(--accent)' : 'var(--glass-1)',
    border: `1px solid ${a ? 'var(--accent)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-sm)',
    padding: '6px 10px',
    color: a ? '#000' : 'var(--text-secondary)',
    fontSize: 13, fontWeight: a ? 700 : 400,
    cursor: 'pointer', fontFamily: 'var(--font-sans)',
    transition: 'all var(--t-fast)',
  });
  return (
    <div>
      <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{position:'relative',flex:'1 1 160px',minWidth:120}}>
          <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)',fontSize:13,pointerEvents:'none'}}>🔍</span>
          <input style={{...inp,paddingLeft:30,width:'100%',boxSizing:'border-box',cursor:'text'}} placeholder="Search tasks..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select style={inp} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>{FILTER_STATUSES.map(s=><option key={s}>{s}</option>)}</select>
        <select style={inp} value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}>{FILTER_PRIORITIES.map(p=><option key={p}>{p}</option>)}</select>
        <select style={inp} value={filterDate} onChange={e=>setFilterDate(e.target.value)}>{DATE_FILTERS.map(d=><option key={d}>{d}</option>)}</select>
        <select style={inp} value={filterOwner} onChange={e=>setFilterOwner(e.target.value)}>
          <option value="All">All Owners</option>
          {ownerList.map(n=><option key={n} value={n}>{n}</option>)}
        </select>
        <select style={inp} value={filterRaisedBy} onChange={e=>setFilterRaisedBy(e.target.value)}>
          <option value="All">All Created By</option>
          {(raisedByList||[]).map(n=><option key={n} value={n}>{n}</option>)}
        </select>
        {showDeptFilter&&(<select style={inp} value={filterDept} onChange={e=>setFilterDept(e.target.value)}>
          <option value="All">All Depts</option>
          {DEPARTMENTS.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}
        </select>)}
        <div style={{display:'flex',gap:4,marginLeft:'auto'}}>
          <button style={tog(viewMode==='grid')} onClick={()=>setViewMode('grid')}>⊞ Grid</button>
          <button style={tog(viewMode==='list')} onClick={()=>setViewMode('list')}>☰ List</button>
        </div>
      </div>
      <div style={{fontSize:11,color:dark?'#64748b':'#bbb',marginBottom:6,fontWeight:600}}>
        {count} task{count!==1?'s':''}
        {(activeFilters||[]).map((f,i)=><span key={i} style={{marginLeft:8,color:'#f97316'}}>· {f}</span>)}
      </div>
    </div>
  );
}

// ── Dept Modal ──────────────────────────────────────────────────────────────────
function DeptModal({dept,allTasks,onClose,dark,onEdit}) {
  const [fs,setFs]=useState('Active (Default)'); const [fp,setFp]=useState('All');
  const [fo,setFo]=useState('All'); const [sq,setSq]=useState(''); const [vm,setVm]=useState('list');
  const [fd,setFd]=useState('All Time');
  const [deptShowPDF, setDeptShowPDF] = useState(false);
  const [deptPDFContent, setDeptPDFContent] = useState('');
  const deptTasks=useMemo(()=>allTasks.filter(t=>t.raisedByDept===dept.id||t.assignedToDept===dept.id||(t.relatedDepts||[]).includes(dept.id)),[allTasks,dept.id]);
  const ownerList=useMemo(()=>[...new Set(deptTasks.map(t=>getTaskOwner(t)).filter(x=>x&&x!=='—'))].sort(),[deptTasks]);
  const tasks=useMemo(()=>deptTasks.filter(t=>{
    if(fs==='Active (Default)'&&(t.status==='Closed'||t.status==='Cancelled')) return false;
    if(fs!=='All'&&fs!=='Active (Default)'&&t.status!==fs) return false;
    if(fp!=='All'&&t.priority!==fp) return false;
    if(fo!=='All'&&getTaskOwner(t)!==fo) return false;
    if(sq&&!t.description?.toLowerCase().includes(sq.toLowerCase())) return false;
    return true;
  }),[deptTasks,fs,fp,fo,sq]);
  const stats=useMemo(()=>({open:tasks.filter(t=>t.status==='Open').length,inProg:tasks.filter(t=>t.status==='In Progress').length,onHold:tasks.filter(t=>t.status==='On Hold').length,closed:tasks.filter(t=>t.status==='Closed').length}),[tasks]);
  const bg=dark?'#111827':'#fff'; const hdr=dark?'#1e2235':'#f8f9fc'; const txt=dark?'#e2e8f0':'#1a1a2e'; const sub=dark?'#94a3b8':'#666'; const bdr=dark?'#2d3748':'#f0f0f0';
  const activeFilters=[fs!=='All'&&fs,fp!=='All'&&fp,fo!=='All'&&`Owner: ${fo}`].filter(Boolean);
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(4px)'}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:bg,borderRadius:16,width:'100%',maxWidth:960,maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 25px 60px rgba(0,0,0,0.4)',overflow:'hidden'}}>
        <div style={{background:hdr,padding:'16px 22px',borderBottom:`1px solid ${bdr}`,display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:14,height:14,borderRadius:'50%',background:dept.color}}/>
          <h2 style={{margin:0,fontSize:17,fontWeight:800,color:txt,flex:1}}>{dept.label}</h2>
          {[{l:'Open',v:stats.open,c:'#dc2626'},{l:'Active',v:stats.inProg,c:'#d97706'},{l:'Hold',v:stats.onHold,c:'#ea580c'},{l:'Closed',v:stats.closed,c:'#16a34a'}].map(s=>(
            <div key={s.l} style={{textAlign:'center',padding:'0 10px'}}>
              <div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:10,color:sub}}>{s.l}</div>
            </div>
          ))}
          <button onClick={onClose} style={{background:'rgba(0,0,0,0.1)',border:'none',borderRadius:8,width:28,height:28,cursor:'pointer',fontSize:13,color:sub}}>✕</button>
        </div>
        <div style={{padding:'12px 22px',borderBottom:`1px solid ${bdr}`}}>
          <FilterBar search={sq} setSearch={setSq} filterStatus={fs} setFilterStatus={setFs} filterPriority={fp} setFilterPriority={setFp} filterOwner={fo} setFilterOwner={setFo} ownerList={ownerList} filterDept="All" setFilterDept={()=>{}} showDeptFilter={false} viewMode={vm} setViewMode={setVm} dark={dark} count={tasks.length} activeFilters={activeFilters}/>
          <ExportBar tasks={tasks} filterDesc={`${dept.label} — ${activeFilters.join(', ')||'All'}`} dark={dark} setShowPDF={setDeptShowPDF} setPDFContent={setDeptPDFContent}/>
        </div>
        <div style={{overflowY:'auto',flex:1,padding:vm==='grid'?'14px 22px':0}}>
          {tasks.length===0
            ? <div style={{textAlign:'center',padding:'40px',color:sub}}>No tasks match filters</div>
            : vm==='list'
              ? tasks.map(t=><TaskRow key={t.id} task={t} onEdit={onEdit} dark={dark}/>)
              : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:10}}>{tasks.map(t=><TaskCard key={t.id} task={t} onEdit={onEdit} dark={dark}/>)}</div>
          }
        </div>
      </div>
    </div>
  );
}

// ── Migrate Modal ───────────────────────────────────────────────────────────────
function MigrateModal({onClose,unit,dark}) {
  const bg=dark?'#111827':'#fff'; const txt=dark?'#e2e8f0':'#1a1a2e'; const sub=dark?'#94a3b8':'#666'; const bdr=dark?'#2d3748':'#f0f0f0';
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(4px)'}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:bg,borderRadius:16,width:'100%',maxWidth:560,boxShadow:'0 25px 60px rgba(0,0,0,0.4)',overflow:'hidden'}}>
        <div style={{background:dark?'#1e2235':'#f8f9fc',padding:'16px 22px',borderBottom:`1px solid ${bdr}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:800,color:txt}}>📥 Migrate Tasks — Unit 2</h2>
          <button onClick={onClose} style={{background:'rgba(0,0,0,0.1)',border:'none',borderRadius:8,width:28,height:28,cursor:'pointer',fontSize:13,color:sub}}>✕</button>
        </div>
        <div style={{padding:'20px 22px'}}>
          <p style={{color:sub,fontSize:13,marginBottom:16,lineHeight:1.6}}>Use the <strong style={{color:'#f97316'}}>migrate_to_firebase.html</strong> tool. Change the collection name to <code style={{background:dark?'#2d3748':'#f0f0f0',padding:'1px 6px',borderRadius:4}}>tasks_u2</code> before running.</p>
          <div style={{background:dark?'#0f111a':'#f8f9fc',border:`1px solid ${bdr}`,borderRadius:10,padding:'14px 16px',marginBottom:16,fontSize:12,color:sub,fontFamily:'monospace',lineHeight:1.8}}>
            <div>1. Open <strong>migrate_to_firebase.html</strong></div>
            <div>2. Find: <code>collection(db, 'tasks')</code></div>
            <div>3. Change to: <code>collection(db, '<span style={{color:'#f97316'}}>tasks_u2</span>')</code></div>
            <div>4. Save → Open in Chrome → Click Migrate</div>
            <div>5. Login: <span style={{color:'#4ade80'}}>owner.u2@alubee.com</span></div>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <button onClick={onClose} style={{background:'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:10,padding:'10px 22px',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Got it</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────────

// ── LOGISTICS PANEL (iframe embed) ───────────────────────────────────────────
function LogisticsPanel({ onBack, dark }) {
  const [loaded, setLoaded] = React.useState(false);
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:dark?'#0f111a':'#f4f6fb'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',
        background:'linear-gradient(135deg,#1e40af,#1d4ed8)',color:'#fff',flexShrink:0,
        boxShadow:'0 2px 8px rgba(30,64,175,0.4)'}}>
        <button onClick={onBack} style={{background:'rgba(255,255,255,0.2)',border:'none',
          borderRadius:8,color:'#fff',fontSize:18,cursor:'pointer',padding:'5px 12px',lineHeight:1}}>
          ←
        </button>
        <div>
          <div style={{fontWeight:900,fontSize:16}}>🚛 ADC Logistics</div>
          <div style={{fontSize:11,opacity:0.8}}>adc-logistics-tracker.netlify.app</div>
        </div>
        {!loaded && (
          <div style={{marginLeft:'auto',fontSize:12,opacity:0.8}}>⏳ Loading...</div>
        )}
      </div>
      <iframe
        src="https://adc-logistics-tracker.netlify.app"
        title="ADC Logistics Manager"
        onLoad={()=>setLoaded(true)}
        style={{flex:1,border:'none',width:'100%',display:'block'}}
        allow="geolocation; notifications; camera"
      />
    </div>
  );
}

export default function DashboardPage() {
  const {userProfile,logout,currentUser}=useAuth();
  const [dark,setDark]=useState(true);
  if(!userProfile) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'sans-serif',flexDirection:'column',gap:16,padding:20,textAlign:'center',background:'#0f0c29',color:'#fff'}}>
      <div style={{fontSize:48}}>🔐</div><h2>Account not configured</h2>
      <p style={{color:'#94a3b8',maxWidth:400}}>Email <strong>{currentUser?.email}</strong> is not linked to any department.</p>
      <button onClick={logout} style={{background:'#f97316',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:700}}>Sign Out</button>
    </div>
  );
  return <DashboardInner dark={dark} setDark={setDark}/>;
}

function DashboardInner({dark,setDark}) {
  const {userProfile,logout,login}=useAuth();
  const isOwner=userProfile?.role==='owner';
  const isDeptHead=userProfile?.role==='dept_head';

  // Set default dept filter to own dept for non-owners
  useEffect(()=>{
    if(userProfile && !isOwner && userProfile.dept) {
      setFilterDept(userProfile.dept);
    }
  },[userProfile?.id]);
  const isViewer=userProfile?.role==='viewer';
  const isPPC=userProfile?.dept==='ppc';
  const isSecurity=userProfile?.dept==='security';
  const unit=userProfile?.unit||'u1';

  const [tasks,         setTasks]         = useState([]);
  const [tasksLoading,  setTasksLoading]  = useState(true);
  const [view,          setView]          = useState(isOwner?'all':'dept');
  const [showModal,     setShowModal]     = useState(false);
  const [editTask,      setEditTask]      = useState(null);
  const [filterStatus,  setFilterStatus]  = useState('Active (Default)');
  const [filterPriority,setFilterPriority]= useState('All');
  const [filterDept,    setFilterDept]    = useState('All');
  const [filterOwner,   setFilterOwner]   = useState('All');
  const [filterDate,    setFilterDate]    = useState('All Time');
  const [filterRaisedBy,setFilterRaisedBy]= useState('All');
  const [search,        setSearch]        = useState('');
  const [activeTab,     setActiveTab]     = useState('tasks');
  const [showRequests,  setShowRequests]  = useState(false);
  const [requestView,   setRequestView]   = useState('my');
  const [viewMode,      setViewMode]      = useState('grid');
  const [drillDept,     setDrillDept]     = useState(null);
  const [showMigrate,   setShowMigrate]   = useState(false);
  const [showNotifs,    setShowNotifs]    = useState(false);
  const [openNotifRequestId, setOpenNotifRequestId] = useState(null);
  const [showAgeing,    setShowAgeing]    = useState(false);
  const [showERP,       setShowERP]       = useState(false);
  const [showStores,    setShowStores]    = useState(false);
  const [showExecSummary, setShowExecSummary] = useState(false);
  const [showPDF,       setShowPDF]       = useState(false);
  const [pdfContent,    setPDFContent]    = useState('');
  const [showChildParts, setShowChildParts] = useState(false);
  const [showU2Migrate,  setShowU2Migrate]  = useState(false);
  const [showSecurity,   setShowSecurity]   = useState(false);
  const [showManpower,   setShowManpower]   = useState(false);
  const [showRevenue,    setShowRevenue]    = useState(false);
  const [showSupplier,   setShowSupplier]   = useState(false);
  const [showMaintenance,  setShowMaintenance]  = useState(false);
  const [showLogistics, setShowLogistics] = useState(false);
  const [showHR, setShowHR] = useState(false);
  const [showIT, setShowIT] = useState(false);
  const [showCustomer,  setShowCustomer]  = useState(false);
  const [showAdmin,     setShowAdmin]     = useState(() => {
    try { return sessionStorage.getItem('alubee_show_admin') === '1'; } catch { return false; }
  });
  const [showSettings,  setShowSettings]  = useState(false);
  const [notifPrefs,    setNotifPrefs]    = useState({});
  const [showCustMigrate, setShowCustMigrate] = useState(false);
  const canScreen = (id) => canAccessScreen(userProfile, id);
  const [pendingVisitors, setPendingVisitors] = useState([]);
  const [showVisitorPanel, setShowVisitorPanel] = useState(false);
  const [notifs,        setNotifs]        = useState([]);

  useEffect(() => {
    try {
      if (showAdmin) sessionStorage.setItem('alubee_show_admin', '1');
      else sessionStorage.removeItem('alubee_show_admin');
    } catch (_) {}
    if (showAdmin) document.body.dataset.alubeeAdminBusy = '1';
    else if (document.body.dataset.alubeeAdminBusy === '1') delete document.body.dataset.alubeeAdminBusy;
  }, [showAdmin]);

  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [bioLabel, setBioLabel] = useState('Fingerprint / Face');
  const [showBioSetup, setShowBioSetup] = useState(false);
  const [bioPin, setBioPin] = useState('');
  const [bioMsg, setBioMsg] = useState('');
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    if (!isAndroidApp()) return;
    (async () => {
      const avail = await checkBiometricAvailability();
      setBioAvailable(!!avail.available);
      setBioLabel(biometryLabel(avail.biometryType));
      setBioOn(isBiometricEnabledLocally());
    })();
  }, []);
  const [lastSync, setLastSync] = useState(new Date());
  function doSync() { setSyncing(true); setLastSync(new Date()); setTimeout(()=>setSyncing(false),1200); }

  // Deep link from push notification tap
  // Store pending deep link to handle after security panel mounts
  const [pendingSecurityTab, setPendingSecurityTab] = useState(null);

  useEffect(()=>{
    function resetModules() {
      setShowSecurity(false); setShowExecSummary(false);
      setShowERP(false); setShowStores(false); setShowManpower(false);
      setShowAgeing(false); setShowAdmin(false); setShowSettings(false);
      setShowNotifs(false); setShowIT(false); setShowHR(false);
      setShowRequests(false); setShowMaintenance(false);
      setShowRevenue(false); setShowSupplier(false); setShowCustomer(false);
      setShowLogistics(false); setShowChildParts(false); setShowU2Migrate(false);
    }
    function openFromNotif(raw) {
      const dest = resolveNotifDestination(raw || {});
      const screen = dest.screen || 'dashboard';
      const tab = dest.tab || null;
      resetModules();
      if (screen === 'requests') {
        setOpenNotifRequestId(dest.requestId || null);
        setRequestView(tab === 'all' ? 'all' : tab === 'pending' ? 'pending' : 'my');
        setShowRequests(true);
        return;
      }
      if (screen === 'tasks' || screen === 'dashboard') {
        setActiveTab(screen === 'dashboard' ? 'dashboard' : 'tasks');
        if (dest.taskId) {
          setTimeout(()=>{
            const el = document.getElementById('task-'+dest.taskId);
            if (el) { el.scrollIntoView({behavior:'smooth'}); el.style.outline='3px solid #f97316'; setTimeout(()=>el.style.outline='',3000); }
          }, 600);
        }
        return;
      }
      if (screen === 'security') {
        if (tab) setPendingSecurityTab(tab);
        setTimeout(()=>setShowSecurity(true), 50);
        return;
      }
      if (screen === 'erp') { setTimeout(()=>setShowERP(true), 50); return; }
      if (screen === 'stores') { setTimeout(()=>setShowStores(true), 50); return; }
      if (screen === 'executive') { setTimeout(()=>setShowExecSummary(true), 50); return; }
      if (screen === 'maintenance') { setTimeout(()=>setShowMaintenance(true), 50); return; }
      if (screen === 'revenue') { setTimeout(()=>setShowRevenue(true), 50); return; }
      if (screen === 'supplier') { setTimeout(()=>setShowSupplier(true), 50); return; }
      if (screen === 'hr') { setTimeout(()=>setShowHR(true), 50); return; }
      if (screen === 'it') { setTimeout(()=>setShowIT(true), 50); return; }
      if (screen === 'customers') { setTimeout(()=>setShowCustomer(true), 50); return; }
      setActiveTab('dashboard');
    }
    function handleNotifTap(e) {
      openFromNotif(e.detail || {});
    }
    const pending = consumePendingNotifTap();
    if (pending) openFromNotif(pending);
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('screen') || params.get('requestId') || params.get('taskId')) {
        openFromNotif({
          screen: params.get('screen'),
          tab: params.get('tab'),
          requestId: params.get('requestId'),
          taskId: params.get('taskId'),
          type: params.get('type'),
          pendingApproval: params.get('pendingApproval'),
        });
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (_) {}
    window.addEventListener('alubee_notification_tap', handleNotifTap);
    return () => window.removeEventListener('alubee_notification_tap', handleNotifTap);
  }, []);
  const BG  = dark?'#0f111a':'#f4f6fb';
  const SIDE= dark?'#0a0c14':'#1a1a2e';
  const TEXT= dark?'#e2e8f0':'#1a1a2e'; const SUB=dark?'#94a3b8':'#888';
  const CARD= dark?'#1e2235':'#fff'; const BDR=dark?'#2d3748':'#f0f0f0';

  useEffect(()=>{
    let unsub;
    if(isOwner||isPPC||isViewer||view==='all') unsub=subscribeAllTasks(unit,t=>{setTasks(t);setTasksLoading(false);});
    else if(view==='dept'&&userProfile?.dept) {
      if(isDeptHead && userProfile?.name) {
        unsub=subscribeAllTasks(unit, t=>{setTasks(t);setTasksLoading(false);});
      } else {
        unsub=subscribeDeptTasks(userProfile.dept,unit,t=>{setTasks(t);setTasksLoading(false);});
      }
    }
    else unsub=subscribeMyTasks(userProfile?.name, userProfile?.id, unit, t=>{setTasks(t);setTasksLoading(false);});
    return()=>unsub&&unsub();
  },[view,userProfile,isOwner,unit]);

  // Request notifs (targeted) + module notifs (MD/JMD see all; others only personal)
  useEffect(()=>{
    let legacyNotifs = [];
    let requestNotifs = [];
    const emit = () => setNotifs(filterNotifsForUser([...requestNotifs, ...legacyNotifs], userProfile, notifPrefs));
    const unsubReq = subscribeAppRequestNotifications((list) => {
      requestNotifs = list || [];
      emit();
    });
    const unsubLegacy = subscribeNotifications(unit, (list) => {
      legacyNotifs = list || [];
      emit();
    });
    return () => {
      unsubReq && unsubReq();
      unsubLegacy && unsubLegacy();
    };
  },[unit,notifPrefs,userProfile]);

  const myMobile = getProfileMobile(userProfile);
  const myAppRole = userProfile?.appRole;
  useEffect(() => {
    if (!myMobile) {
      setNotifPrefs({});
      return;
    }
    return subscribeNotifPrefs(myMobile, setNotifPrefs);
  }, [myMobile]);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  useEffect(() => {
    if (!myMobile && !myAppRole) {
      setPendingApprovalCount(0);
      return;
    }
    const unsub = subscribeAppRequests((docs) => {
      const n = (docs || []).filter((r) => isRequestPendingForUser(r, myMobile, myAppRole)).length;
      setPendingApprovalCount(n);
    }, { pendingOnly: true });
    return () => unsub && unsub();
  }, [myMobile, myAppRole]);
  const bellCount = pendingApprovalCount;
  const pendingAckCount = useMemo(
    () => notifs.filter((n) => n.pendingApproval && !n.acknowledged).length,
    [notifs]
  );

  const ownerList=useMemo(()=>[...new Set(tasks.map(t=>getTaskOwner(t)).filter(x=>x&&x!=='—'))].sort(),[tasks]);
  const raisedByList=useMemo(()=>[...new Set(tasks.map(t=>t.raisedByName).filter(Boolean))].sort(),[tasks]);

  const filtered=useMemo(()=>{
    const now=new Date();
    const sod=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const sow=new Date(sod); sow.setDate(sod.getDate()-sod.getDay());
    const som=new Date(now.getFullYear(),now.getMonth(),1);
    const base=tasks.filter(t=>{
      if(filterStatus==='Active (Default)'&&(t.status==='Closed'||t.status==='Cancelled')) return false;
      if(filterStatus!=='All'&&filterStatus!=='Active (Default)'&&t.status!==filterStatus) return false;
      if(filterPriority!=='All'&&t.priority!==filterPriority) return false;
      if(filterDept!=='All'&&t.raisedByDept!==filterDept&&t.assignedToDept!==filterDept&&!(t.relatedDepts||[]).includes(filterDept)) return false;
      if(filterOwner!=='All'&&getTaskOwner(t)!==filterOwner) return false;
      if(filterRaisedBy!=='All'&&t.raisedByName!==filterRaisedBy) return false;
      if(search&&!t.description?.toLowerCase().includes(search.toLowerCase())&&!getTaskOwner(t).toLowerCase().includes(search.toLowerCase())) return false;
      if(filterDate!=='All Time'&&t.createdAt){
        const d=t.createdAt?.toDate?t.createdAt.toDate():new Date(t.createdAt);
        if(filterDate==='Today'&&d<sod) return false;
        if(filterDate==='This Week'&&d<sow) return false;
        if(filterDate==='This Month'&&d<som) return false;
      }
      return true;
    });
    const TE='Need Clarity from Team Engine (MD)';
    // If filtering by Closed — sort by closedAt (latest first)
    if(filterStatus==='Closed') {
      return base.sort((a,b)=>{
        const ta=a.closedAt?.seconds||a.closedAt?.toMillis?.()/1000||0;
        const tb=b.closedAt?.seconds||b.closedAt?.toMillis?.()/1000||0;
        return tb-ta;
      });
    }
    return base.sort((a,b)=>{
      if(a.status===TE&&b.status!==TE) return -1;
      if(a.status!==TE&&b.status===TE) return 1;
      return 0;
    });
  },[tasks,filterStatus,filterPriority,filterDept,filterOwner,filterRaisedBy,search,filterDate]);

  const stats=useMemo(()=>({
    total:filtered.length, open:filtered.filter(t=>t.status==='Open').length,
    inProg:filtered.filter(t=>t.status==='In Progress').length, onHold:filtered.filter(t=>t.status==='On Hold').length,
    closed:filtered.filter(t=>t.status==='Closed').length, overdue:filtered.filter(t=>t.status!=='Closed'&&t.status!=='Cancelled'&&daysOpen(t)>=3).length,
  }),[filtered]);

  const deptBreakdown=useMemo(()=>{
    const map={};
    tasks.forEach(t=>{
      const dept=t.assignedToDept||t.raisedByDept; if(!dept) return;
      if(!map[dept]) map[dept]={open:0,inProg:0,onHold:0,closed:0,overdue:0,total:0};
      map[dept].total++;
      if(t.status==='Open') map[dept].open++;
      else if(t.status==='In Progress') map[dept].inProg++;
      else if(t.status==='On Hold') map[dept].onHold++;
      else if(t.status==='Closed') map[dept].closed++;
      if(t.status!=='Closed'&&t.status!=='Cancelled'&&daysOpen(t)>=3) map[dept].overdue++;
    });
    return Object.entries(map).map(([id,v])=>({id,label:getDeptLabel(id),color:getDeptColor(id),...v})).sort((a,b)=>b.open-a.open);
  },[tasks]);

  const activeFilters=[filterOwner!=='All'&&`Owner: ${filterOwner}`,filterRaisedBy!=='All'&&`Created by: ${filterRaisedBy}`,filterStatus!=='All'&&filterStatus,filterPriority!=='All'&&filterPriority,filterDept!=='All'&&getDeptLabel(filterDept),search&&`"${search}"`,filterDate!=='All Time'&&filterDate].filter(Boolean);
  const filterDesc=activeFilters.join(', ')||'All Tasks';
  const deptName=getDeptLabel(userProfile?.dept);
  const navBtn=a=>({background:a?'var(--accent-glass)':'transparent',border:'none',borderLeft:a?'3px solid var(--accent)':'3px solid transparent',borderRadius:'var(--radius-sm)',padding:'8px 10px',color:a?'var(--accent)':'var(--text-secondary)',fontSize:12,fontWeight:a?700:400,cursor:'pointer',textAlign:'left',fontFamily:'var(--font-sans)',transition:'all var(--t-fast)',width:'100%',display:'block'});

  /** Leave Admin (and keep it mounted only while open) when switching screens — avoids remount/flicker loops. */
  const leaveAdmin = () => { setShowAdmin(false); setShowSettings(false); };
  const closeModuleScreens = () => {
    setShowAgeing(false); setShowERP(false); setShowStores(false);
    setShowExecSummary(false); setShowManpower(false); setShowRevenue(false);
    setShowSupplier(false); setShowRequests(false); setShowMaintenance(false);
    setShowU2Migrate(false); setShowChildParts(false); setShowLogistics(false);
    setShowHR(false); setShowIT(false); setShowCustomer(false); setShowSecurity(false);
  };
  const openScreen = (setter) => {
    setShowAdmin(false);
    setShowSettings(false);
    setter(true);
    setSidebarOpen(false);
  };
  const openSettings = () => {
    closeModuleScreens();
    setShowAdmin(false);
    setShowSettings(true);
    setSidebarOpen(false);
  };
  const openAdmin = () => {
    closeModuleScreens();
    setShowSettings(false);
    setShowAdmin(true);
    setSidebarOpen(false);
  };
  const openRequestFromNotif = (n) => {
    const dest = resolveNotifDestination({
      ...n,
      screen: 'requests',
      type: n?.type || 'request',
      requestId: n?.requestId || n?.id,
      pendingApproval: n?.pendingApproval,
      tab: n?.pendingApproval ? 'pending' : n?.tab,
    });
    closeModuleScreens();
    setShowNotifs(false);
    setOpenNotifRequestId(dest.requestId || n?.requestId || null);
    setRequestView(dest.tab === 'pending' ? 'pending' : dest.tab === 'all' ? 'all' : 'my');
    setShowRequests(true);
  };

  // Show ageing screen full page
  if(showAgeing)  return <AgeingScreen  dark={dark} onBack={()=>setShowAgeing(false)} unit={unit}/> ;
  if(showERP)    return <ERPDashboard   dark={dark} onBack={()=>setShowERP(false)}    unit={unit}/> ;
  if(showStores) return <StoresDashboard dark={dark} onBack={()=>setShowStores(false)} unit={unit}/> ;
  if(showExecSummary)  return <ExecutiveSummary dark={dark} onBack={()=>setShowExecSummary(false)} unit={unit}/>;
  if(showManpower)     return <ManpowerDashboard dark={dark} onBack={()=>setShowManpower(false)}/>;
  if(showRevenue)      return <RevenueDashboard dark={dark} onBack={()=>setShowRevenue(false)} unit={unit}/> ;
  if(showSupplier)     return <SupplierDashboard userRole={userProfile?.role} userDept={userProfile?.dept} userProfile={userProfile} unit={unit} onBack={()=>setShowSupplier(false)}/>;
  if(showRequests)     return (
    <>
      <RequestsDashboard userProfile={userProfile} dark={dark} initialView={requestView} initialRequestId={openNotifRequestId} onBack={()=>{setShowRequests(false);setOpenNotifRequestId(null);}}/>
      {showNotifs&&<NotificationCenter unit={unit} dark={dark} onClose={()=>{setShowNotifs(false);setOpenNotifRequestId(null);}} notifs={notifs} userEmail={userProfile?.email || userProfile?.authEmail || userProfile?.linkedEmail} userMobile={getProfileMobile(userProfile)} userAppRole={userProfile?.appRole} userProfile={userProfile} initialRequestId={openNotifRequestId} onOpenRequest={openRequestFromNotif} isolateLegacy={!isBroadcastNotifRole(userProfile?.appRole)}
        onOpenTask={(taskId)=>{
          setShowNotifs(false);
          setShowRequests(false);
          setActiveTab('tasks');
          setTimeout(()=>{
            const el=document.getElementById(`task-${taskId}`);
            if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.outline='3px solid #f97316';setTimeout(()=>{el.style.outline='';},2500);}
          },300);
        }}
      />}
    </>
  );
  if(showMaintenance)  return <MaintenanceDashboard userProfile={userProfile} dark={dark} onBack={()=>setShowMaintenance(false)}/>;
  if(showU2Migrate)    return <MigrateU2Data onDone={()=>setShowU2Migrate(false)}/>;
  if(showChildParts)   return <ChildPartsDashboard   userProfile={userProfile} dark={dark} onBack={()=>setShowChildParts(false)}/>;
  if(showLogistics)    return <LogisticsPanel onBack={()=>setShowLogistics(false)} dark={dark}/>;
  if(showHR)           return <HRDashboard userProfile={userProfile} dark={dark} onBack={()=>setShowHR(false)}/>;
  if(showIT)           return <ITDashboard userProfile={userProfile} dark={dark} onBack={()=>setShowIT(false)}/>;
  if(showCustomer)     return showCustMigrate
    ? <MigrateCustomerData onDone={()=>setShowCustMigrate(false)}/>
    : <CustomerDashboard dark={dark} onBack={()=>setShowCustomer(false)} userProfile={userProfile} unit={unit}/>;
  if(showSecurity||isSecurity) return <SecurityDashboard dark={dark} onBack={()=>setShowSecurity(false)} unit={unit} onManpower={()=>setShowManpower(true)} initialTab={pendingSecurityTab} onTabConsumed={()=>setPendingSecurityTab(null)} onRequests={()=>setShowRequests(true)} onSignOut={logout}/>;

  return (
    <div style={{display:'flex',minHeight:'100vh',background:'var(--bg-base)',fontFamily:'var(--font-sans)',transition:'background 0.3s'}}>
      {/* SIDEBAR */}
      <aside style={{width:220,flexShrink:0,background:'var(--slate-950)',borderRight:'1px solid var(--border-subtle)',display:'flex',flexDirection:'column',padding:'16px 12px',position:'fixed',top:0,left:0,bottom:0,overflowY:'auto',zIndex:100,transform:isMobile&&!sidebarOpen?'translateX(-100%)':'translateX(0)',transition:'transform 0.3s var(--ease-out)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
          <div style={{width:34,height:34,borderRadius:10,background:'linear-gradient(135deg,var(--green),var(--green-dim))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,fontWeight:900,color:'#fff',flexShrink:0,boxShadow:'var(--shadow-green)'}}>A</div>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:800,color:'var(--text-primary)',letterSpacing:2,fontFamily:'var(--font-sans)'}}>ALUBEE</div><div style={{fontSize:9,color:'var(--text-muted)',letterSpacing:1}}>Unit {unit==='u2'?'2':'1'} · Die Casters</div></div>{isMobile&&<button onClick={()=>setSidebarOpen(false)} style={{background:'transparent',border:'none',color:'rgba(255,255,255,0.5)',fontSize:18,cursor:'pointer',padding:4}}>✕</button>}
        </div>

        <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',padding:10,marginBottom:16}}>
          <div style={{width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,var(--accent),var(--accent-dim))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:800,color:'#000',flexShrink:0,boxShadow:'var(--shadow-accent)'}}>{userProfile?.name?.[0]?.toUpperCase()||'?'}</div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userProfile?.name}</div>
            <div style={{fontSize:10,color:'var(--text-muted)'}}>{userProfile?.appRole?getRoleLabel(userProfile.appRole):(isOwner?'JMD · Admin':isDeptHead?'Dept Head':'Member')}</div>
            {userProfile?.dept&&!isOwner&&<div style={{fontSize:10,color:'var(--green)',fontWeight:600}}>{deptName}</div>}
          </div>
        </div>

        <nav style={{display:'flex',flexDirection:'column',gap:3,marginBottom:14}}>
          {canScreen('tasks')&&<button style={navBtn(activeTab==='tasks'&&!showAdmin&&!showSettings)} onClick={()=>{leaveAdmin();setActiveTab('tasks');if(isMobile)setSidebarOpen(false);}}>📋 Tasks</button>}
          {canScreen('dashboard')&&<button style={navBtn(activeTab==='dashboard'&&!showAdmin&&!showSettings)} onClick={()=>{leaveAdmin();setActiveTab('dashboard');if(isMobile)setSidebarOpen(false);}}>🏠 Dashboard</button>}
          {canScreen('customers')&&<button style={navBtn(showCustomer)} onClick={()=>openScreen(setShowCustomer)}>🚚 Dispatch</button>}
          {roleHasFullAccess(userProfile?.appRole)&&<button style={navBtn(false)} onClick={()=>openScreen(setShowU2Migrate)}>🔄 U2 Setup</button>}
          {canScreen('supplier')&&<button style={navBtn(showSupplier)} onClick={()=>openScreen(setShowSupplier)}>📦 Supplier</button>}
          {canScreen('exec_summary')&&<button style={navBtn(showExecSummary)} onClick={()=>openScreen(setShowExecSummary)}>📊 Operations</button>}
          {canScreen('revenue')&&<button style={navBtn(showRevenue)} onClick={()=>openScreen(setShowRevenue)}>💰 Revenue</button>}
          {canScreen('maintenance')&&<button style={navBtn(showMaintenance)} onClick={()=>openScreen(setShowMaintenance)}>🔧 Maintenance</button>}
          {canScreen('requests')&&<button style={navBtn(showRequests)} onClick={()=>openScreen(setShowRequests)}>📝 Requests</button>}
          {canScreen('child_parts')&&<button style={navBtn(showChildParts)} onClick={()=>openScreen(setShowChildParts)}>🔩 Child Parts</button>}
          {canScreen('ageing')&&<button style={navBtn(showAgeing)} onClick={()=>openScreen(setShowAgeing)}>📅 Ageing</button>}
          {canScreen('security')&&<button style={navBtn(showSecurity)} onClick={()=>openScreen(setShowSecurity)}>🔒 Security</button>}
          {canScreen('logistics')&&<button style={navBtn(showLogistics)} onClick={()=>openScreen(setShowLogistics)}>🚛 Logistics</button>}
          {canScreen('admin')&&<button style={navBtn(showAdmin)} onClick={openAdmin}>⚙️ Admin</button>}
          {canScreen('erp')&&<button style={navBtn(showERP)} onClick={()=>openScreen(setShowERP)}>🗂 ERP Dashboard</button>}
          {canScreen('stores')&&<button style={navBtn(showStores)} onClick={()=>openScreen(setShowStores)}>🏪 Stores Dashboard</button>}
          {canScreen('hr')&&<button style={navBtn(showHR)} onClick={()=>openScreen(setShowHR)}>👔 HR</button>}
          {canScreen('it')&&<button style={navBtn(showIT)} onClick={()=>openScreen(setShowIT)}>💻 IT</button>}
        </nav>

        {!isOwner&&(
          <nav style={{display:'flex',flexDirection:'column',gap:3,marginBottom:14}}>
            <div style={{fontSize:9,color:'rgba(255,255,255,0.3)',letterSpacing:1,textTransform:'uppercase',padding:'4px 8px'}}>View</div>
            <button style={navBtn(view==='dept')} onClick={()=>{setView('dept');if(isMobile)setSidebarOpen(false);}}>🏭 {deptName}</button>
            <button style={navBtn(view==='my')} onClick={()=>{setView('my');if(isMobile)setSidebarOpen(false);}}>👤 My Tasks</button>
          </nav>
        )}

        <div style={{flex:1}}/>
        {isOwner&&unit==='u2'&&<button onClick={()=>setShowMigrate(true)} style={{background:'rgba(249,115,22,0.15)',border:'1px solid rgba(249,115,22,0.3)',borderRadius:8,padding:'9px 10px',color:'#f97316',fontSize:11,cursor:'pointer',textAlign:'left',fontFamily:'inherit',marginBottom:8,fontWeight:700}}>📥 Migrate Tasks</button>}
        {isAndroidApp()&&(
          <button
            onClick={async ()=>{
              if (bioOn) {
                await disableBiometricLogin();
                setBioOn(false);
                return;
              }
              setBioPin(''); setBioMsg(''); setShowBioSetup(true); setSidebarOpen(false);
            }}
            style={{background:'rgba(249,115,22,0.12)',border:'1px solid rgba(249,115,22,0.35)',borderRadius:'var(--radius-sm)',padding:'8px 10px',color:'#fb923c',fontSize:11,cursor:'pointer',textAlign:'left',fontFamily:'var(--font-sans)',marginBottom:6,width:'100%',fontWeight:700}}
          >
            {bioOn ? `🔐 ${bioLabel} on · tap to disable` : `🔐 Enable ${bioLabel}`}
          </button>
        )}
        <button onClick={()=>setDark(d=>!d)} style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-sm)',padding:'8px 10px',color:'var(--text-muted)',fontSize:11,cursor:'pointer',textAlign:'left',fontFamily:'var(--font-sans)',marginBottom:6,width:'100%',transition:'all var(--t-fast)'}}>{dark?'☀ Light':'🌙 Dark'}</button>
        {canAccessSettings(userProfile?.appRole)&&(
          <button onClick={openSettings} style={{...navBtn(showSettings),marginBottom:6}}>⚙ Settings</button>
        )}
        <button onClick={logout} style={{background:'var(--red-bg)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'var(--radius-sm)',padding:'8px 10px',color:'var(--red)',fontSize:11,cursor:'pointer',textAlign:'left',fontFamily:'var(--font-sans)',width:'100%',fontWeight:600,transition:'all var(--t-fast)'}}>← Sign Out</button>
      </aside>

      {/* MOBILE OVERLAY */}
      {isMobile&&sidebarOpen&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:98}} onClick={()=>setSidebarOpen(false)}/>}

      {/* MAIN */}
      <main style={{marginLeft:isMobile?0:220,flex:1,padding:isMobile?'0 0 80px':'24px 28px',minWidth:0,maxWidth:'100%'}}>
        {showSettings ? (
          <SettingsPage dark={dark} userProfile={userProfile} onBack={()=>setShowSettings(false)} />
        ) : showAdmin ? (
          <AdminPanel dark={dark} onBack={()=>setShowAdmin(false)} />
        ) : (
        <>
        {/* MOBILE TOP BAR */}
        {isMobile&&(
          <div style={{position:'sticky',top:0,zIndex:50,background:'var(--slate-950)',borderBottom:'1px solid var(--border-subtle)',padding:'10px 14px',display:'flex',alignItems:'center',gap:10,marginBottom:12,backdropFilter:'blur(12px)'}}>
            <button onClick={()=>setSidebarOpen(true)} style={{background:'var(--accent-glass)',border:'1px solid var(--glass-border-accent)',borderRadius:'var(--radius-sm)',color:'var(--accent)',fontSize:20,cursor:'pointer',padding:'6px 12px',lineHeight:1,fontWeight:900,flexShrink:0}}>☰</button>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:800,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',letterSpacing:'-0.02em'}}>Alubee</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.45)'}}>{isOwner?`${userProfile?.name} · JMD`:(userProfile?.dept?getDeptLabel(userProfile.dept):userProfile?.name)}</div>
            </div>
            <button onClick={doSync} title="Sync" style={{background:'transparent',border:'none',color:'#16a34a',fontSize:14,cursor:'pointer',padding:'2px 4px',lineHeight:1,display:'flex',alignItems:'center',gap:3}}>
              <span style={{animation:syncing?'spin 0.8s linear infinite':'none',display:'inline-block'}}>{syncing?'↻':'●'}</span>
              <span style={{fontSize:9,color:'rgba(255,255,255,0.4)',display:isMobile?'none':'inline'}}>{lastSync.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>
              <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
            </button>
            <button onClick={()=>setShowNotifs(x=>!x)} style={{position:'relative',background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-sm)',color:'var(--text-primary)',fontSize:18,cursor:'pointer',padding:'6px 8px',transition:'all var(--t-fast)'}}>
              🔔
              {bellCount>0&&<span style={{position:'absolute',top:0,right:0,background:'#ef4444',color:'#fff',borderRadius:'50%',width:14,height:14,fontSize:8,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{bellCount>9?'9+':bellCount}</span>}
              {pendingAckCount>0&&<span style={{position:'absolute',bottom:0,right:0,background:'#f59e0b',color:'#fff',borderRadius:'50%',width:12,height:12,fontSize:8,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{pendingAckCount}</span>}
            </button>
            <button style={{background:'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:8,padding:'8px 12px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}} onClick={()=>{setEditTask(null);setShowModal(true);}}>+ Task</button>
          </div>
        )}
        {/* Header — desktop only */}
        {!isMobile&&<div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20,gap:12}}>
          <div>
            <h1 style={{margin:0,fontSize:22,fontWeight:800,color:TEXT}}>Alubee Dashboard</h1>
            <p style={{margin:'4px 0 0',fontSize:12,color:SUB}}>
              {isOwner?`${userProfile?.name} · JMD`:`${deptName}`}
              {' · '}{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
            </p>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center',flexShrink:0}}>
            {/* Sync button */}
            <button onClick={doSync} title="Sync now"
              style={{background:CARD,border:`1px solid ${BDR}`,borderRadius:10,padding:'9px 14px',cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',gap:6,color:SUB,fontFamily:'inherit'}}>
              <span style={{animation:syncing?'spin 0.8s linear infinite':'none',display:'inline-block',color:'#16a34a',fontSize:15}}>{syncing?'↻':'●'}</span>
              <span style={{fontSize:11}}>{syncing?'Syncing...':'Synced '+lastSync.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>
              <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
            </button>
            {/* Notification bell — all roles (JMD / MD / employee) */}
            <button onClick={()=>setShowNotifs(x=>!x)}
              style={{position:'relative',background:showNotifs?'rgba(249,115,22,0.2)':CARD,border:`1px solid ${BDR}`,borderRadius:12,padding:'10px 14px',cursor:'pointer',fontSize:18,lineHeight:1}}>
              🔔
              {bellCount>0&&<span style={{position:'absolute',top:4,right:4,background:'#ef4444',color:'#fff',borderRadius:'50%',width:16,height:16,fontSize:9,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{bellCount>9?'9+':bellCount}</span>}
              {pendingAckCount>0&&<span style={{position:'absolute',bottom:4,right:4,background:'#f59e0b',color:'#fff',borderRadius:'50%',width:12,height:12,fontSize:8,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{pendingAckCount}</span>}
            </button>
            <button style={{background:'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:12,padding:'11px 18px',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 12px rgba(249,115,22,0.35)',whiteSpace:'nowrap'}}
              onClick={()=>{setEditTask(null);setShowModal(true);}}>+ New Task</button>
          </div>
        </div>}

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(3,1fr)':'repeat(auto-fit,minmax(90px,1fr))',gap:8,marginBottom:isMobile?12:24}}>
          {[{label:'Total',value:stats.total,color:'#4f46e5',bg:dark?'#1e1b4b':'#eef2ff',filter:'All'},
            {label:'Open',value:stats.open,color:'#dc2626',bg:dark?'#2d1515':'#fef2f2',filter:'Open'},
            {label:'In Progress',value:stats.inProg,color:'#d97706',bg:dark?'#2d2005':'#fffbeb'},
            {label:'On Hold',value:stats.onHold,color:'#ea580c',bg:dark?'#2d1a05':'#fff7ed'},
            {label:'Closed',value:stats.closed,color:'#16a34a',bg:dark?'#052d14':'#f0fdf4'},
            {label:'Overdue 3d+',value:stats.overdue,color:'#dc2626',bg:dark?'#2d1515':'#fef2f2'},
            ...(pendingAckCount>0?[{label:'Pending Ack',value:pendingAckCount,color:'#d97706',bg:dark?'#2d2005':'#fffbeb'}]:[]),
          ].map(k=>(
            <div key={k.label} style={{borderRadius:10,padding:isMobile?'10px 10px':'14px 16px',background:k.bg}}>
              <div style={{fontSize:isMobile?20:26,fontWeight:800,lineHeight:1,color:k.color}}>{k.value}</div>
              <div style={{fontSize:10,color:SUB,marginTop:4,fontWeight:600,textTransform:'uppercase'}}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* DASHBOARD TAB */}
        {activeTab==='dashboard'&&(
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <h2 style={{fontSize:16,fontWeight:700,color:TEXT,margin:0}}>Department Breakdown — click to drill in</h2>
              <button onClick={()=>setShowAgeing(true)} style={{background:'#f97316',border:'none',borderRadius:8,padding:'7px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>📈 Full Ageing Report</button>
            </div>
            {deptBreakdown.length===0?<p style={{color:SUB}}>No tasks yet.</p>:(
              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'repeat(auto-fill,minmax(200px,1fr))',gap:isMobile?8:12}}>
                {deptBreakdown.map(d=>(
                  <div key={d.id} onClick={()=>setDrillDept(d)}
                    style={{background:CARD,borderRadius:12,overflow:'hidden',boxShadow:`0 2px 8px rgba(0,0,0,${dark?0.3:0.06})`,border:`1px solid ${BDR}`,cursor:'pointer',transition:'transform 0.15s'}}
                    onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';}} onMouseLeave={e=>{e.currentTarget.style.transform='';}}>
                    <div style={{height:4,background:d.color}}/>
                    <div style={{padding:'14px 16px'}}>
                      <div style={{fontSize:13,fontWeight:700,color:TEXT,marginBottom:10}}>{d.label}</div>
                      <div style={{display:'flex',gap:10,marginBottom:8}}>
                        <span style={{fontSize:12,color:SUB}}><span style={{color:'#dc2626',fontWeight:700}}>{d.open}</span> Open</span>
                        <span style={{fontSize:12,color:SUB}}><span style={{color:'#d97706',fontWeight:700}}>{d.inProg}</span> Active</span>
                        <span style={{fontSize:12,color:SUB}}><span style={{color:'#16a34a',fontWeight:700}}>{d.closed}</span> Done</span>
                      </div>
                      {d.overdue>0&&<div style={{background:'#fef2f2',color:'#dc2626',fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:6,marginBottom:8,display:'inline-block'}}>⚠ {d.overdue} overdue</div>}
                      <div style={{height:4,background:dark?'#2d3748':'#f0f0f0',borderRadius:4,marginBottom:4}}>
                        <div style={{height:'100%',borderRadius:4,background:d.color,width:`${d.total?d.closed/d.total*100:0}%`,transition:'width 0.5s'}}/>
                      </div>
                      <div style={{fontSize:10,color:dark?'#64748b':'#bbb'}}>{d.total?Math.round(d.closed/d.total*100):0}% · {d.total} tasks</div>
                      <div style={{fontSize:10,color:'#f97316',marginTop:6,fontWeight:600}}>Click to view →</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TASKS TAB */}
        {activeTab==='tasks'&&(
          <div>
            {/* TE Alert Banner */}
            {(() => { const teTasks = tasks.filter(t=>t.status==='Need Clarity from Team Engine (MD)'); return teTasks.length>0 && (
              <div style={{ background:'linear-gradient(135deg,#4c1d95,#7e22ce)', borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', alignItems:'flex-start', gap:12, boxShadow:'0 4px 20px rgba(126,34,206,0.4)' }}>
                <span style={{ fontSize:24, flexShrink:0 }}>🚨</span>
                <div style={{ flex:1 }}>
                  <div style={{ color:'#fff', fontWeight:800, fontSize:14, marginBottom:4 }}>🚨 FOR MD'S ATTENTION — {teTasks.length} task{teTasks.length>1?'s':''}</div>
                  {teTasks.slice(0,3).map(t=>(
                    <div key={t.id} style={{ color:'rgba(255,255,255,0.8)', fontSize:12, marginTop:3 }}>
                      ▸ {t.description?.slice(0,70)} <span style={{ color:'rgba(255,255,255,0.5)' }}>— {getTaskOwner(t)}</span>
                    </div>
                  ))}
                  {teTasks.length>3 && <div style={{ color:'rgba(255,255,255,0.5)', fontSize:12, marginTop:3 }}>+{teTasks.length-3} more...</div>}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0}}>
                  {filterStatus==='Need Clarity from Team Engine (MD)'
                    ? <button onClick={()=>setFilterStatus('Active (Default)')} style={{background:'#fff',border:'none',borderRadius:8,padding:'7px 14px',color:'#7e22ce',fontSize:12,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>← Back to All</button>
                    : <button onClick={()=>setFilterStatus('Need Clarity from Team Engine (MD)')} style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:8,padding:'7px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>View All</button>
                  }
                </div>
              </div>
            ); })()}

            {/* Outside Support Banner */}
            {(() => { const osTasks = tasks.filter(t=>t.status==='Outside Support / Service Required'); return osTasks.length>0 && (
              <div style={{ background:'linear-gradient(135deg,#1e3a5f,#1d4ed8)', borderRadius:12, padding:'12px 18px', marginBottom:16, display:'flex', alignItems:'center', gap:12, boxShadow:'0 4px 20px rgba(29,78,216,0.3)' }}>
                <span style={{ fontSize:20, flexShrink:0 }}>🔧</span>
                <div style={{ flex:1, color:'#fff', fontSize:13 }}>
                  <strong>{osTasks.length} task{osTasks.length>1?'s':''}</strong> require outside support / external service
                </div>
                {filterStatus==='Outside Support / Service Required'
                  ? <button onClick={()=>setFilterStatus('Active (Default)')} style={{background:'#fff',border:'none',borderRadius:8,padding:'6px 12px',color:'#1d4ed8',fontSize:12,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>← Back</button>
                  : <button onClick={()=>setFilterStatus('Outside Support / Service Required')} style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:8,padding:'6px 12px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>View</button>
                }
              </div>
            ); })()}

            <FilterBar search={search} setSearch={setSearch} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterPriority={filterPriority} setFilterPriority={setFilterPriority} filterDept={filterDept} setFilterDept={setFilterDept} showDeptFilter={true} filterOwner={filterOwner} setFilterOwner={setFilterOwner} ownerList={ownerList} filterDate={filterDate} setFilterDate={setFilterDate} filterRaisedBy={filterRaisedBy} setFilterRaisedBy={setFilterRaisedBy} raisedByList={raisedByList} viewMode={viewMode} setViewMode={setViewMode} dark={dark} count={filtered.length} activeFilters={activeFilters}/>
            <ExportBar tasks={filtered} filterDesc={filterDesc} dark={dark} setShowPDF={setShowPDF} setPDFContent={setPDFContent}/>
            {filtered.length===0?(
              <div style={{textAlign:'center',padding:'60px 20px',color:SUB}}><div style={{fontSize:48,marginBottom:12}}>📭</div><p>No tasks found.</p></div>
            ):viewMode==='list'?(
              <div style={{background:CARD,borderRadius:12,overflow:'hidden',border:`1px solid ${BDR}`}}>
                <div style={{display:'flex',alignItems:'center',gap:12,padding:'8px 16px',background:dark?'#151929':'#f1f5f9',borderBottom:`1px solid ${BDR}`,fontSize:11,fontWeight:700,color:SUB,textTransform:'uppercase',letterSpacing:'0.5px'}}>
                  <div style={{width:3,flexShrink:0}}/><div style={{width:8,flexShrink:0}}/><div style={{flex:'1 1 260px'}}>Task · Owner</div>
                  <div style={{width:90,textAlign:'center'}}>Status</div><div style={{width:50,textAlign:'right'}}>Age</div>
                  <div style={{width:70,textAlign:'right'}}>Due</div><div style={{width:120,textAlign:'right'}}>Actions</div>
                </div>
                {filtered.map(t=><div key={t.id} id={`task-${t.id}`}><TaskRow task={t} onEdit={t=>{setEditTask(t);setShowModal(true);}} dark={dark}/></div>)}
              </div>
            ):(
              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(300px,1fr))',gap:isMobile?8:10}}>
                {filtered.map(t=><div key={t.id} id={`task-${t.id}`}><TaskCard task={t} onEdit={t=>{setEditTask(t);setShowModal(true);}} dark={dark}/></div>)}
              </div>
            )}
          </div>
        )}
        </>
        )}
      </main>

      {/* In-app PDF viewer for APK */}
      {showPDF&&(
        <div style={{position:'fixed',inset:0,zIndex:2000,background:'#fff',display:'flex',flexDirection:'column'}}>
          <div style={{background:'#1F3864',padding:'10px 16px',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            <button onClick={()=>setShowPDF(false)}
              style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:8,padding:'8px 14px',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
              ← Back
            </button>
            <span style={{color:'#fff',fontWeight:700,fontSize:13,flex:1}}>Task Report</span>
            <button onClick={async()=>{
              try {
                // Parse tasks back from HTML content — use currentPDFTasks ref
                if(window._currentPDFTasks && window._currentPDFFilterDesc){
                  await downloadJsPDF(window._currentPDFTasks, window._currentPDFFilterDesc);
                } else {
                  // Fallback to HTML download
                  const blob = new Blob([pdfContent],{type:'text/html'});
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `alubee-tasks-${new Date().toISOString().slice(0,10)}.html`;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                }
              } catch(e){ alert('Download failed: '+e.message); }
            }} style={{background:'#22c55e',border:'none',borderRadius:8,padding:'8px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>
              ⬇ PDF
            </button>
            <button onClick={async()=>{
              try {
                if(navigator.share){
                  const blob = new Blob([pdfContent],{type:'text/html'});
                  const file = new File([blob],`alubee-tasks-${new Date().toISOString().slice(0,10)}.html`,{type:'text/html'});
                  await navigator.share({files:[file],title:'Alubee Task Report'});
                } else {
                  const blob = new Blob([pdfContent],{type:'text/html'});
                  const url  = URL.createObjectURL(blob);
                  window.open(url,'_blank');
                }
              } catch(e){ console.log('share error',e); }
            }} style={{background:'#f97316',border:'none',borderRadius:8,padding:'8px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>
              ↗ Share
            </button>
          </div>
          <iframe srcDoc={pdfContent} style={{flex:1,border:'none',width:'100%'}} title="Task Report"/>
        </div>
      )}

      {showModal&&<TaskFormModal onClose={()=>setShowModal(false)} existingTask={editTask} dark={dark}/>}
      {drillDept&&<DeptModal dept={drillDept} allTasks={tasks} onClose={()=>setDrillDept(null)} dark={dark} onEdit={t=>{setDrillDept(null);setEditTask(t);setShowModal(true);}}/>}
      {showMigrate&&<MigrateModal onClose={()=>setShowMigrate(false)} unit={unit} dark={dark}/>}
      {showBioSetup&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={()=>setShowBioSetup(false)}>
          <div style={{width:'100%',maxWidth:360,background:'#0f172a',border:'1px solid rgba(148,163,184,0.25)',borderRadius:16,padding:18}} onClick={e=>e.stopPropagation()}>
            <div style={{color:'#fff',fontWeight:800,fontSize:16,marginBottom:8}}>Enable {bioLabel}</div>
            <div style={{color:'#94a3b8',fontSize:12,marginBottom:12,lineHeight:1.4}}>
              Confirm your 4-digit PIN, then use the phone fingerprint or face sensor.
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={bioPin}
              onChange={e=>setBioPin(e.target.value.replace(/\D/g,'').slice(0,4))}
              placeholder="••••"
              style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:10,padding:'12px 14px',color:'#fff',letterSpacing:8,textAlign:'center',fontSize:20,marginBottom:10}}
            />
            {bioMsg&&<div style={{color:'#fca5a5',fontSize:12,marginBottom:10}}>{bioMsg}</div>}
            <button
              disabled={bioBusy||bioPin.length!==4}
              onClick={async ()=>{
                setBioBusy(true); setBioMsg('');
                try {
                  await login(userProfile?.mobile, bioPin);
                  await enableBiometricLogin(userProfile?.mobile, bioPin);
                  setBioOn(true);
                  setShowBioSetup(false);
                } catch (err) {
                  setBioMsg(err?.message || 'Could not enable biometric login');
                }
                setBioBusy(false);
              }}
              style={{width:'100%',background:'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:10,padding:12,color:'#fff',fontWeight:700,cursor:'pointer',opacity:bioBusy||bioPin.length!==4?0.6:1}}
            >
              {bioBusy?'Please wait...':'Enable '+bioLabel}
            </button>
            <button onClick={()=>setShowBioSetup(false)} style={{width:'100%',marginTop:8,background:'transparent',border:'1px solid rgba(255,255,255,0.2)',borderRadius:10,padding:10,color:'#94a3b8',cursor:'pointer'}}>Cancel</button>
          </div>
        </div>
      )}
      {/* MOBILE BOTTOM TAB BAR */}
      {isMobile&&(
        <div style={{position:'fixed',bottom:0,left:0,right:0,background:SIDE,borderTop:'1px solid rgba(255,255,255,0.1)',display:'flex',zIndex:60,paddingBottom:'env(safe-area-inset-bottom,0px)'}}>
          {[
            {icon:'📋',label:'Tasks',   action:()=>{leaveAdmin();setActiveTab('tasks');},   active:activeTab==='tasks'&&!showAdmin&&!showSettings},
            {icon:'📊',label:'Dash',    action:()=>{leaveAdmin();setActiveTab('dashboard');},active:activeTab==='dashboard'&&!showAdmin&&!showSettings&&(isOwner||isDeptHead)},
            {icon:'🔔',label:'Alerts',  action:()=>setShowNotifs(x=>!x),    active:showNotifs, badge:bellCount},
            {icon:'➕',label:'New',      action:()=>{setEditTask(null);setShowModal(true);}, active:false, highlight:true},
            {icon:'≡', label:'Menu',    action:()=>setSidebarOpen(true),    active:sidebarOpen, menu:true},
          ].filter(t=>t.icon!=='📊'||(isOwner||isDeptHead)).map(t=>(
            <button key={t.label} onClick={t.action}
              style={{flex:1,background:t.highlight?'linear-gradient(135deg,#f97316,#ea580c)':t.active||t.menu&&sidebarOpen?'rgba(249,115,22,0.15)':'transparent',border:'none',padding:'10px 4px 8px',cursor:'pointer',fontFamily:'inherit',position:'relative',display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
              <span style={{fontSize:t.menu?22:18,color:t.highlight?'#fff':t.active?'#f97316':'rgba(255,255,255,0.85)',fontWeight:t.menu?900:400,lineHeight:1}}>{t.icon}</span>
              <span style={{fontSize:9,color:t.highlight?'#fff':t.active?'#f97316':'rgba(255,255,255,0.55)',fontWeight:t.active?700:400}}>{t.label}</span>
              {t.badge>0&&<span style={{position:'absolute',top:6,right:'50%',transform:'translateX(8px)',background:'#ef4444',color:'#fff',borderRadius:'50%',width:14,height:14,fontSize:8,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{t.badge>9?'9+':t.badge}</span>}
            </button>
          ))}
        </div>
      )}

      {showNotifs&&<NotificationCenter unit={unit} dark={dark} onClose={()=>{setShowNotifs(false);setOpenNotifRequestId(null);}} notifs={notifs} userEmail={userProfile?.email || userProfile?.authEmail || userProfile?.linkedEmail} userMobile={getProfileMobile(userProfile)} userAppRole={userProfile?.appRole} userProfile={userProfile} initialRequestId={openNotifRequestId} onOpenRequest={openRequestFromNotif} isolateLegacy={!isBroadcastNotifRole(userProfile?.appRole)}
        onOpenTask={(taskId)=>{
          setActiveTab('tasks');
          setSearch('');
          setFilterStatus('All');
          setFilterOwner('All');
          setFilterDept('All');
          setShowNotifs(false);
          setTimeout(()=>{
            const el=document.getElementById(`task-${taskId}`);
            if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.outline='3px solid #f97316';setTimeout(()=>{el.style.outline='';},2500);}
          },300);
        }}
      />}
      <AlubeaAssistant unit={unit} dark={dark}/>
    </div>
  );
}
