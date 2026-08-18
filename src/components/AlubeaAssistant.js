import React, { useState, useRef, useEffect } from 'react';
import { collection, query, where, limit, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const todayStr = () => new Date().toISOString().slice(0, 10);

// ── Fetch relevant Firestore data based on the question ──────────────
async function fetchContext(question, unit) {
  const u = unit === 'u2' ? 'u2' : 'u1';
  const ctx = {};
  const today = todayStr();

  const get = async (colName, buildQ) => {
    try {
      const snap = await getDocs(buildQ ? buildQ(collection(db, colName)) : collection(db, colName));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { console.log('fetch err', colName, e.message); return []; }
  };

  const bySubmitted = arr => [...arr].sort((a,b)=>(b.submittedAt?.seconds||b.createdAt?.seconds||0)-(a.submittedAt?.seconds||a.createdAt?.seconds||0));
  const byDate      = arr => [...arr].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const byTime      = arr => [...arr].sort((a,b)=>(b.createdAt?.seconds||b.outTime?.seconds||b.arrivedAt?.seconds||0)-(a.createdAt?.seconds||a.outTime?.seconds||a.arrivedAt?.seconds||0));

  // Security
  ctx.movements   = byTime(      await get(`security_internal_${u}`,   c => query(c, limit(150))));
  ctx.vehicles    = byTime(      await get(`security_vehicles_${u}`,   c => query(c, limit(100))));
  ctx.visitors    = byTime(      await get(`security_visitors_${u}`,   c => query(c, where('date','==',today), limit(30))));
  ctx.permissions = byDate(      await get(`security_permission_${u}`, c => query(c, limit(50))));
  ctx.mobileBox   = byTime(      await get(`security_mobilebox_${u}`,  c => query(c, where('date','==',today), limit(10))));
  ctx.tea         = byTime(      await get(`security_tea_${u}`,        c => query(c, where('date','==',today), limit(10))));
  ctx.power       = byTime(      await get(`security_power_${u}`,      c => query(c, limit(10))));
  ctx.shiftLog    = byTime(      await get(`security_shiftlog_${u}`,   c => query(c, limit(5))));
  ctx.transfers   = byTime(      await get('security_transfer_u2_u1',  c => query(c, where('date','==',today), limit(30))));

  // Stores
  ctx.storesChecklist = bySubmitted(await get(`stores_checklist_${u}`,         c => query(c, limit(10))));
  ctx.storesAlloy     = bySubmitted(await get(`stores_alloy_supplier_${u}`,    c => query(c, limit(10))));

  // ERP
  ctx.erpRework   = bySubmitted(await get(`erp_rework_${u}`,          c => query(c, limit(5))));
  ctx.erpPDC      = bySubmitted(await get(`erp_pdc_running_${u}`,     c => query(c, limit(5))));
  ctx.erpScrap    = bySubmitted(await get(`erp_scrap_${u}`,           c => query(c, limit(5))));
  ctx.erpPallets  = bySubmitted(await get(`erp_pallets_${u}`,         c => query(c, limit(5))));
  ctx.erpAlloyWIP = bySubmitted(await get(`erp_alloy_wip_${u}`,       c => query(c, limit(5))));
  ctx.erpFGSuper  = bySubmitted(await get(`erp_fg_supermarket_${u}`,  c => query(c, limit(5))));

  // Tasks
  const taskCol = u === 'u2' ? 'tasks_u2' : 'tasks';
  ctx.tasks = byTime(await get(taskCol, c => query(c, limit(200))));

  // Manpower
  ctx.manpower = byDate(await get('manpower_u1', c => query(c, limit(10))));

  // Revenue
  ctx.revenue = byDate(await get('revenue_daily', c => query(c, limit(30))));

  return ctx;
}

// ── Build system prompt with live data ────────────────────────────────
function buildPrompt(ctx, unit) {
  const today = todayStr();
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

  let prompt = `You are Alubee Assistant — the intelligent factory operations AI for Alubee Die Casters (Unit ${unit === 'u2' ? '2' : '1'}).
Current date/time: ${now} IST.

Answer questions using ONLY the live data below. Be direct and conversational.
If data is empty for a section, say so. Use exact names from the data.

=== LIVE FACTORY DATA ===\n\n`;

  // Movements
  if (ctx.movements?.length) {
    const todayMov = ctx.movements.filter(m=>m.date===today);
    const recentMov = ctx.movements.slice(0,100);
    prompt += `STAFF MOVEMENTS (${todayMov.length} today, ${recentMov.length} recent):\n`;
    recentMov.forEach(m => {
      const tag = m.date === today ? 'TODAY' : m.date||'?';
      const status = m.inTime ? `Returned ${m.inTimeStr||fmtTS(m.inTime)}` : `OUT since ${m.outTimeStr||'?'}`;
      prompt += `- [${tag}] ${m.alubean_name||m.employeeName||'?'} | ${m.department} | ${m.movementType} | Dest: ${m.destination||'—'} | ${status}\n`;
    });
    prompt += '\n';
  } else {
    prompt += `STAFF MOVEMENTS: No records yet.\n\n`;
  }

  // Vehicles
  if (ctx.vehicles?.length) {
    const todayVehicles = ctx.vehicles.filter(v=>v.date===today);
    const recentVehicles = ctx.vehicles.slice(0,50);
    prompt += `VEHICLES (${todayVehicles.length} today, ${recentVehicles.length} recent total):\n`;
    recentVehicles.forEach(v => {
      const entryTime = v.inTimeStr || fmtTS(v.inTime);
      const exitTime = v.outTime ? (v.outTimeStr||fmtTS(v.outTime)) : 'Still inside';
      const tag = v.date === today ? 'TODAY' : v.date||'?';
      prompt += `- [${tag}] ${v.vehicleNumber} | ${v.driverName} | From: ${v.comingFrom||'—'} | Purpose: ${v.purpose||'—'} | In: ${entryTime} | Out: ${exitTime}\n`;
    });
    prompt += '\n';
  } else {
    prompt += `VEHICLES: None recorded.\n\n`;
  }

  // Visitors
  if (ctx.visitors?.length) {
    prompt += `VISITORS TODAY (${ctx.visitors.length}):\n`;
    ctx.visitors.forEach(v => {
      const status = v.outTime ? `Exited` : v.approvalStatus==='Approved' ? `Inside` : v.approvalStatus;
      prompt += `- ${v.visitorName} | ${v.company||'—'} | Meeting: ${v.employeeToMeet||v.alubeanToMeet||'—'} | ${status}\n`;
    });
    prompt += '\n';
  } else {
    prompt += `VISITORS TODAY: None.\n\n`;
  }

  // Permissions
  if (ctx.permissions?.length) {
    const todayPerms = ctx.permissions.filter(p => p.requestedDate === todayStr() || p.date === todayStr());
    prompt += `PERMISSIONS TODAY (${todayPerms.length}):\n`;
    todayPerms.forEach(p => {
      const returned = p.returnedAt ? `Returned at ${p.returnedTimeStr||'?'}` : p.status==='Approved' ? 'Out on permission' : p.status;
      prompt += `- ${p.alubean_name||p.employeeName} | ${p.department} | ${p.reason} | ${p.duration||'—'} | ${returned}\n`;
    });
    prompt += '\n';
  }

  // Transfers
  if (ctx.transfers?.length) {
    prompt += `U2→U1 TRANSFERS TODAY:\n`;
    ctx.transfers.forEach(t => {
      prompt += `- ${t.alubean_name} | ${t.department} | ${t.reason} | Arrived: ${t.arrivedTimeStr||'—'} | ${t.returnedAt?'Returned at '+t.returnedTimeStr:'Still in U1'}\n`;
    });
    prompt += '\n';
  }

  // Tasks
  if (ctx.tasks?.length) {
    prompt += `TASKS (${ctx.tasks.length} total):\n`;
    // Group by status
    const open = ctx.tasks.filter(t=>t.status==='Open');
    const inprog = ctx.tasks.filter(t=>t.status==='In Progress');
    const closed = ctx.tasks.filter(t=>t.status==='Closed').slice(0,10);
    [...open, ...inprog, ...closed].forEach(t => {
      prompt += `- [${t.status}] ${t.description} | Dept: ${t.assignedToDept||'—'} | Person: ${t.assignedToPersonName||'—'} | Priority: ${t.priority||'—'} | Due: ${t.dueDate||'—'} | By: ${t.raisedByName||'—'}\n`;
    });
    prompt += '\n';
  } else {
    prompt += `TASKS: None loaded.\n\n`;
  }

  // ERP
  const latestERP = (arr) => arr?.[0];
  const erp = latestERP(ctx.erpRework);
  if (erp?.departments) {
    prompt += `ERP REWORK (as of ${erp.date||'?'}, by ${erp.submittedBy||'?'} · Last updated: ${erp.updatedAt||erp.date||'?'}):\n`;
    erp.departments.forEach(d => {
      const rows = d.rows?.filter(r=>r.partNo||r.qty||r.partName);
      if (rows?.length) {
        rows.forEach(r => {
          prompt += `- Dept: ${d.dept} | Part: ${r.partNo||r.partName||'—'} | Qty: ${r.qty||0} pcs | Days held: ${r.daysHeld||0} | Reason: ${r.reason||'—'}\n`;
        });
      }
    });
    if (ctx.erpRework.length > 1) {
      prompt += `Previous rework entries: ${ctx.erpRework.slice(1).map(e=>e.date+'('+e.submittedBy+')').join(', ')}\n`;
    }
    prompt += '\n';
  }

  const pdcLatest = latestERP(ctx.erpPDC);
  if (pdcLatest?.rows) {
    prompt += `ERP PDC RUNNING (${pdcLatest.date||'?'} · by ${pdcLatest.submittedBy||'?'}):\n`;
    pdcLatest.rows.filter(r=>r.mc||r.part||r.partNo).forEach(r => {
      prompt += `- MC: ${r.mc||'—'} | Part: ${r.part||r.partNo||'—'} | Budget: ${r.budget||0} | Actual: ${r.actual||0} | Pending: ${r.pending||0} | Shots: ${r.shots||r.shotsMade||'—'}\n`;
    });
    // Also show previous entries dates
    if (ctx.erpPDC.length > 1) {
      prompt += `Previous PDC entries: ${ctx.erpPDC.slice(1).map(e=>e.date).join(', ')}\n`;
    }
    prompt += '\n';
  }

  const scrapLatest = latestERP(ctx.erpScrap);
  if (scrapLatest?.rows) {
    prompt += `ERP SCRAP (${scrapLatest.date||'?'}):\n`;
    scrapLatest.rows.filter(r=>r.dept||r.qty).forEach(r => {
      prompt += `- ${r.dept||'—'} | Qty: ${r.qty||0} | Reason: ${r.reason||'—'}\n`;
    });
    prompt += '\n';
  }

  // Stores
  if (ctx.storesChecklist?.length) {
    const s = ctx.storesChecklist[0];
    prompt += `STORES CHECKLIST (${s.date||'?'}):\n`;
    (s.items||[]).forEach(i => {
      prompt += `- ${i.description}: ${i.value} ${i.unit||''}\n`;
    });
    prompt += '\n';
  }

  if (ctx.storesAlloy?.length) {
    const a = ctx.storesAlloy[0];
    prompt += `STORES ALLOY (${a.date||'?'}):\n`;
    (a.rows||[]).filter(r=>r.supplier||r.qty).forEach(r => {
      prompt += `- ${r.supplier||'—'} | Qty: ${r.qty||0} kg | Rate: ₹${r.rate||0} | Amount: ₹${r.amount||0}\n`;
    });
    prompt += '\n';
  }

  // Manpower
  if (ctx.manpower?.length) {
    const m = ctx.manpower.sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
    if (m) {
      prompt += `MANPOWER (${m.date||'?'} · ${m.shift||'?'} · by ${m.submittedBy||'?'}):\n`;
      prompt += `U1 Total: Budget=${m.totals?.u1?.budget||0} | Required=${m.totals?.u1?.todayReq||0} | Actual=${m.totals?.u1?.actual||0} | Pending=${m.totals?.u1?.pending||0}\n`;
      prompt += `U2 Total: Budget=${m.totals?.u2?.budget||0} | Required=${m.totals?.u2?.todayReq||0} | Actual=${m.totals?.u2?.actual||0} | Pending=${m.totals?.u2?.pending||0}\n`;
      (m.u1||[]).forEach(r => {
        if(r.actual||r.pending) prompt += `  ${r.dept}: actual=${r.actual} pending=${r.pending}\n`;
      });
      prompt += '\n';
    }
  }

  // Mobile Box
  if (ctx.mobileBox?.length) {
    prompt += `MOBILE BOX TODAY:\n`;
    ctx.mobileBox.forEach(mb => {
      prompt += `- ${mb.department} | ${mb.mobileCount} mobiles | ${mb.timeStr||'?'} | ${mb.isLate?'LATE':'On time'}\n`;
    });
    prompt += '\n';
  }

  // Tea
  if (ctx.tea?.length) {
    prompt += `TEA TODAY:\n`;
    ctx.tea.forEach(t => {
      prompt += `- ${t.session}: ${t.totalTeas||0} teas\n`;
    });
    prompt += '\n';
  }

  // Revenue
  if (ctx.revenue?.length) {
    const rev = ctx.revenue.sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
    if (rev) {
      prompt += `REVENUE (${rev.date||'?'} · by ${rev.submittedBy||'?'}):\n`;
      prompt += `- Sales Norm: ₹${rev.salesNorm}L | Achieved: ₹${rev.achieved}L | Deficit: ₹${rev.deficitAsOnToday}L\n`;
      prompt += `- Sale Lapse/Day: ₹${rev.strikeRate}L | Plan Today: ₹${rev.salePlanToday}L | Yesterday: ₹${rev.yesterdaySales}L\n\n`;
    }
  }

  // Power / Diesel
  if (ctx.power?.length) {
    const latest = ctx.power[0];
    prompt += `POWER STATUS (latest):\n`;
    prompt += `- Status: ${latest.status||latest.powerStatus||'—'} | Diesel: ${latest.dieselLevel||latest.diesel||'—'} litres | Updated: ${latest.date||'?'} ${latest.timeStr||''} | By: ${latest.recordedBy||'?'}\n\n`;
  }

  // Mobile Box
  if (ctx.mobileBox?.length) {
    prompt += `MOBILE BOX TODAY:\n`;
    ctx.mobileBox.forEach(mb => {
      prompt += `- ${mb.department}: ${mb.mobileCount} mobiles | ${mb.timeStr||'?'} | ${mb.isLate?'⚠️ LATE':'On time'}\n`;
    });
    prompt += '\n';
  }

  // Tea
  if (ctx.tea?.length) {
    const sessions = { Morning: 0, Afternoon: 0, Evening: 0 };
    ctx.tea.forEach(t => { if (sessions[t.session] !== undefined) sessions[t.session] = t.totalTeas || 0; });
    prompt += `TEA TODAY: Morning=${sessions.Morning} | Afternoon=${sessions.Afternoon} | Evening=${sessions.Evening} | Total=${Object.values(sessions).reduce((a,b)=>a+b,0)}\n\n`;
  }

  // Shift Log
  if (ctx.shiftLog?.length) {
    const s = ctx.shiftLog[0];
    prompt += `LATEST SHIFT LOG (${s.date||'?'} · ${s.shift||'?'} · by ${s.staffOnDuty||s.submittedBy||'?'}):\n`;
    if (s.pendingVehicles) prompt += `- Pending vehicles: ${s.pendingVehicles}\n`;
    if (s.powerIssues) prompt += `- Power issues: ${s.powerIssues}\n`;
    if (s.specialVisitors) prompt += `- Special visitors: ${s.specialVisitors}\n`;
    if (s.notes) prompt += `- Notes: ${s.notes}\n`;
    prompt += '\n';
  }

  return prompt;
}

function fmtTS(ts) {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return '—'; }
}

// ── Sub-components at module level ────────────────────────────────────
function MessageBubble({ msg, dark }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 10,
      animation: 'msgIn 0.2s ease-out',
    }}>
      <style>{`@keyframes msgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {!isUser && (
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,var(--green),var(--green-dim))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, marginRight: 8, marginTop: 2, boxShadow: 'var(--shadow-green)' }}>A</div>
      )}
      <div style={{
        maxWidth: '78%',
        padding: '10px 14px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser
          ? 'linear-gradient(135deg,var(--green),var(--green-dim))'
          : 'var(--bg-raised)',
        color: isUser ? '#fff' : 'var(--text-primary)',
        fontSize: 13,
        lineHeight: 1.55,
        border: isUser ? 'none' : '1px solid var(--border-subtle)',
        boxShadow: isUser ? 'var(--shadow-green)' : 'var(--shadow-2)',
        whiteSpace: 'pre-wrap',
        fontFamily: 'var(--font-sans)',
      }}>
        {msg.content}
        {msg.loading && <span style={{ display: 'inline-block', marginLeft: 4 }}>
          <span style={{ animation: 'blink 1s infinite' }}>●</span>
          <style>{`@keyframes blink{0%,100%{opacity:0.2}50%{opacity:1}}`}</style>
        </span>}
      </div>
    </div>
  );
}

function SuggestedQuestion({ text, onClick }) {
  return (
    <button onClick={() => onClick(text)} style={{
      background: 'var(--glass-1)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-full)',
      padding: '5px 12px',
      fontSize: 11,
      color: 'var(--text-secondary)',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      transition: 'all var(--t-fast)',
      whiteSpace: 'nowrap',
    }}>
      {text}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────
export default function AlubeaAssistant({ unit, dark }) {
  const { userProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: `Hi ${userProfile?.name?.split(' ')[0] || 'there'}! 👋 I'm your Alubee factory assistant. Ask me anything about today's operations — who's inside, vehicle status, task updates, manpower, or ERP data.`,
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const SUGGESTED = [
    'Is Nayaz inside?',
    'Any vehicles inside?',
    'Who is outside right now?',
    'Any overdue tasks?',
    'Where has Munusamy gone?',
    'Pending permissions today?',
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // ── Voice input ──
  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert('Voice not supported on this browser');
    const r = new SR();
    r.lang = 'en-IN';
    r.continuous = false;
    r.interimResults = false;
    r.onstart = () => setListening(true);
    r.onresult = e => {
      setInput(e.results[0][0].transcript);
      setListening(false);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    r.start();
  }

  // ── Send message ──
  async function send(textOverride) {
    const text = (textOverride || input).trim();
    if (!text || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: text };
    const loadingMsg = { role: 'assistant', content: '', loading: true };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoading(true);

    try {
      // 1. Fetch live Firestore context
      const ctx = await fetchContext(text, unit || 'u1');

      // 2. Build system prompt with data
      const systemPrompt = buildPrompt(ctx, unit);

      // 3. Build conversation history (last 6 messages for context)
      const history = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
      }));

      // 4. Call Claude via Cloud Function proxy (avoids CORS)
      const PROXY_URL = 'https://alubeachat-7hey6bbxwq-el.a.run.app';
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [...history, { role: 'user', content: text }],
        }),
      });

      const data = await response.json();
      const answer = data.content?.[0]?.text || 'Sorry, I could not get an answer. Please try again.';

      setMessages(prev => [
        ...prev.slice(0, -1), // remove loading
        { role: 'assistant', content: answer },
      ]);
    } catch (e) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: `❌ Error: ${e.message}. Check your connection and try again.` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const hasUnread = false; // Could add unread tracking later

  return (
    <>
      {/* ── FLOATING BUTTON ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 54,
            height: 54,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,var(--green),var(--green-dim))',
            border: 'none',
            boxShadow: 'var(--shadow-green), var(--shadow-3)',
            cursor: 'pointer',
            zIndex: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            transition: 'all var(--t-base) var(--ease-spring)',
            animation: 'floatIn 0.4s var(--ease-spring)',
          }}
          title="Ask Alubee Assistant"
        >
          <style>{`
            @keyframes floatIn{from{opacity:0;transform:scale(0.5)}to{opacity:1;transform:scale(1)}}
            @keyframes glowPulse{0%,100%{box-shadow:var(--shadow-green),var(--shadow-3)}50%{box-shadow:0 0 32px rgba(34,197,94,0.5),var(--shadow-3)}}
          `}</style>
          🤖
        </button>
      )}

      {/* ── CHAT PANEL ── */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 'min(380px, calc(100vw - 32px))',
          height: 'min(580px, calc(100vh - 48px))',
          background: 'var(--bg-base)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-5)',
          zIndex: 900,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'panelIn 0.25s var(--ease-spring)',
          backdropFilter: 'blur(20px)',
        }}>
          <style>{`@keyframes panelIn{from{opacity:0;transform:scale(0.9) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg,var(--green-dim),#0a2e15)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid rgba(34,197,94,0.2)',
            flexShrink: 0,
          }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(34,197,94,0.2)', border: '1.5px solid rgba(34,197,94,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Alubee Assistant</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite' }}/>
                Live factory data · Unit {unit === 'u2' ? '2' : '1'}
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 16, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column' }}>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} dark={dark} />
            ))}

            {/* Suggested questions — only show when few messages */}
            {messages.length <= 2 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Try asking</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {SUGGESTED.map(s => <SuggestedQuestion key={s} text={s} onClick={send} />)}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-raised)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about factory status..."
                rows={1}
                style={{
                  flex: 1,
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 12px',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'var(--font-sans)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  resize: 'none',
                  lineHeight: 1.5,
                  maxHeight: 80,
                  overflowY: 'auto',
                  transition: 'border-color var(--t-fast)',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--green)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-default)'}
              />

              {/* Voice button */}
              <button
                onClick={startListening}
                disabled={loading}
                title="Voice input"
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 'none',
                  background: listening ? 'var(--red)' : 'var(--glass-2)',
                  color: listening ? '#fff' : 'var(--text-secondary)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 16, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all var(--t-fast)',
                  animation: listening ? 'glowPulse 1s infinite' : 'none',
                }}>
                {listening ? '⏺' : '🎤'}
              </button>

              {/* Send button */}
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 'none',
                  background: input.trim() && !loading ? 'linear-gradient(135deg,var(--green),var(--green-dim))' : 'var(--glass-1)',
                  color: input.trim() && !loading ? '#fff' : 'var(--text-muted)',
                  cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                  fontSize: 16, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all var(--t-fast)',
                  boxShadow: input.trim() && !loading ? 'var(--shadow-green)' : 'none',
                }}>
                {loading ? '⏳' : '↑'}
              </button>
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 5, textAlign: 'center' }}>
              Powered by Claude · Live Firestore data · Enter to send
            </div>
          </div>
        </div>
      )}
    </>
  );
}
