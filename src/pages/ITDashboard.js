import React, { useEffect, useMemo, useState } from 'react';
import { subscribeAppRequests } from '../utils/requestService';
import { IT_CATEGORIES, itTicketDate, itTicketStatus } from '../utils/itRequestService';
import ITTicketActions from '../components/ITTicketActions';

function isoLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

function startOfWeek(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoLocal(d);
}

function monthBounds(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from, to: isoLocal(last) };
}

function inRange(iso, from, to) {
  if (!iso || !from || !to) return false;
  return iso >= from && iso <= to;
}

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
];

function statusColor(st) {
  if (st === 'Closed') return '#15803d';
  if (st === 'Resolved') return '#0f766e';
  if (st === 'Assigned') return '#1d4ed8';
  if (st === 'Open') return '#b45309';
  if (st === 'Cancelled') return '#6b7280';
  return '#6b7280';
}

function TicketTable({ rows, txt, sub, userProfile, onDone }) {
  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 800, color: sub, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
  const td = { padding: '9px 10px', fontSize: 12, color: txt, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };

  if (!rows.length) {
    return <div style={{ textAlign: 'center', padding: 32, color: sub, fontSize: 13 }}>No IT tickets for this period</div>;
  }

  return (
    <div style={{ overflowX: 'auto', background: 'var(--bg-raised)', borderRadius: 12, border: '1px solid #e5e7eb' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
        <thead>
          <tr>
            <th style={th}>Employee</th>
            <th style={th}>Dept</th>
            <th style={th}>Category</th>
            <th style={th}>Issue</th>
            <th style={th}>Assigned to</th>
            <th style={th}>Status</th>
            <th style={th}>Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = itTicketStatus(r);
            return (
              <tr key={r.id}>
                <td style={{ ...td, fontWeight: 800 }}>{r.employeeName || '—'}</td>
                <td style={td}>{r.dept?.toUpperCase() || '—'}</td>
                <td style={td}>{r.category || '—'}</td>
                <td style={{ ...td, maxWidth: 220 }}>
                  {r.issue || r.description || '—'}
                  <ITTicketActions req={r} userProfile={userProfile} onDone={onDone} />
                </td>
                <td style={td}>{r.assignedToName || '—'}</td>
                <td style={{ ...td, fontWeight: 800, color: statusColor(st) }}>{st}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{itTicketDate(r) || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ITDashboard({ userProfile, dark, onBack }) {
  const [tab, setTab] = useState('dashboard');
  const [tickets, setTickets] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [period, setPeriod] = useState('today');
  const today = isoLocal();
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return subscribeAppRequests((docs) => {
      setTickets((docs || []).filter((r) => r.type === 'it' && !r.deleted));
    });
  }, []);

  const range = useMemo(() => {
    if (period === 'today') return { from: today, to: today };
    if (period === 'tomorrow') {
      const t = addDays(today, 1);
      return { from: t, to: t };
    }
    if (period === 'week') return { from: startOfWeek(today), to: addDays(startOfWeek(today), 6) };
    if (period === 'month') return monthBounds(today);
    const from = customFrom || today;
    const to = customTo && customTo >= from ? customTo : from;
    return { from, to };
  }, [period, today, customFrom, customTo]);

  const periodRows = useMemo(
    () => tickets.filter((r) => inRange(itTicketDate(r), range.from, range.to))
      .sort((a, b) => String(itTicketDate(b)).localeCompare(String(itTicketDate(a)))),
    [tickets, range, tick]
  );

  const stats = useMemo(() => {
    const open = periodRows.filter((r) => itTicketStatus(r) === 'Open').length;
    const assigned = periodRows.filter((r) => itTicketStatus(r) === 'Assigned').length;
    const resolved = periodRows.filter((r) => itTicketStatus(r) === 'Resolved').length;
    const closed = periodRows.filter((r) => itTicketStatus(r) === 'Closed').length;
    return { open, assigned, resolved, closed, total: periodRows.length };
  }, [periodRows]);

  const listed = tickets.filter((r) => {
    if (statusFilter !== 'all' && itTicketStatus(r).toLowerCase() !== statusFilter) return false;
    if (catFilter !== 'all' && r.category !== catFilter) return false;
    return true;
  }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const txt = 'var(--text-primary)';
  const sub = 'var(--text-secondary)';
  const inp = { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#111' };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <div style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', padding: '14px 18px', boxShadow: '0 2px 10px rgba(37,99,235,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          {onBack && <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 9, color: '#fff', fontSize: 18, cursor: 'pointer', padding: '5px 12px' }}>←</button>}
          <div>
            <div style={{ fontWeight: 900, fontSize: 17 }}>💻 IT</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Tickets · assign · close</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ id: 'dashboard', label: 'Dashboard', icon: '📊' }, { id: 'tickets', label: 'Tickets', icon: '🎫' }].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                background: tab === t.id ? '#fff' : 'rgba(255,255,255,0.18)', color: tab === t.id ? '#1d4ed8' : '#fff' }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 14px', maxWidth: 960, margin: '0 auto' }}>
        {tab === 'dashboard' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { l: 'Open', v: stats.open, c: '#b45309', bg: '#fffbeb' },
                { l: 'Assigned', v: stats.assigned, c: '#1d4ed8', bg: '#eff6ff' },
                { l: 'Resolved', v: stats.resolved, c: '#0f766e', bg: '#f0fdfa' },
                { l: 'Closed', v: stats.closed, c: '#15803d', bg: '#f0fdf4' },
              ].map((s) => (
                <div key={s.l} style={{ background: s.bg, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: sub, textTransform: 'uppercase', marginTop: 4 }}>{s.l}</div>
                </div>
              ))}
            </div>

            <div style={{ fontWeight: 800, fontSize: 14, color: txt, marginBottom: 10 }}>Tickets by period</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {PERIODS.map((p) => (
                <button key={p.id} onClick={() => setPeriod(p.id)}
                  style={{ padding: '7px 14px', borderRadius: 16, border: `1px solid ${period === p.id ? '#1d4ed8' : '#e5e7eb'}`,
                    background: period === p.id ? '#1d4ed8' : 'var(--bg-raised)', color: period === p.id ? '#fff' : sub,
                    fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {p.label}
                </button>
              ))}
            </div>

            {period === 'custom' && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: sub }}>
                  From
                  <input type="date" style={{ ...inp, display: 'block', marginTop: 4 }} value={customFrom} onChange={(e) => setCustomFrom(e.target.value || today)} />
                </label>
                <label style={{ fontSize: 11, fontWeight: 700, color: sub }}>
                  To
                  <input type="date" min={customFrom} style={{ ...inp, display: 'block', marginTop: 4 }} value={customTo} onChange={(e) => setCustomTo(e.target.value || customFrom)} />
                </label>
              </div>
            )}

            <div style={{ fontSize: 12, color: sub, marginBottom: 10, fontWeight: 700 }}>
              {range.from === range.to ? range.from : `${range.from} → ${range.to}`} · {periodRows.length} ticket{periodRows.length !== 1 ? 's' : ''}
            </div>

            <TicketTable rows={periodRows} txt={txt} sub={sub} userProfile={userProfile} onDone={() => setTick((n) => n + 1)} />
          </>
        )}

        {tab === 'tickets' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {['all', 'open', 'assigned', 'resolved', 'closed', 'cancelled'].map((f) => (
                <button key={f} onClick={() => setStatusFilter(f)}
                  style={{ padding: '5px 14px', borderRadius: 16, border: `1px solid ${statusFilter === f ? '#1d4ed8' : '#e5e7eb'}`,
                    background: statusFilter === f ? '#1d4ed8' : 'transparent', color: statusFilter === f ? '#fff' : '#6b7280',
                    fontWeight: statusFilter === f ? 700 : 400, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                  {f}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              <button onClick={() => setCatFilter('all')}
                style={{ padding: '5px 12px', borderRadius: 16, border: `1px solid ${catFilter === 'all' ? '#0ea5e9' : '#e5e7eb'}`,
                  background: catFilter === 'all' ? '#0ea5e9' : 'transparent', color: catFilter === 'all' ? '#fff' : '#6b7280',
                  fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>All categories</button>
              {IT_CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCatFilter(c)}
                  style={{ padding: '5px 12px', borderRadius: 16, border: `1px solid ${catFilter === c ? '#0ea5e9' : '#e5e7eb'}`,
                    background: catFilter === c ? '#0ea5e9' : 'transparent', color: catFilter === c ? '#fff' : '#6b7280',
                    fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>{c}</button>
              ))}
            </div>
            {listed.length === 0
              ? <div style={{ textAlign: 'center', padding: 40, color: sub }}>No IT tickets</div>
              : listed.map((r) => {
                const st = itTicketStatus(r);
                return (
                  <div key={r.id} style={{ background: 'var(--bg-raised)', borderRadius: 12, padding: '14px 16px', marginBottom: 10, border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontWeight: 800, color: txt }}>{r.employeeName}</div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: statusColor(st) }}>{st}</span>
                    </div>
                    <div style={{ fontSize: 12, color: sub, marginTop: 4 }}>
                      {r.dept?.toUpperCase()} · {r.category} · {itTicketDate(r)}
                      {r.assignedToName ? ` · Engineer: ${r.assignedToName}` : ''}
                    </div>
                    {(r.issue || r.description) && <div style={{ fontSize: 12, color: txt, marginTop: 6 }}>{r.issue || r.description}</div>}
                    {r.resolveNote && <div style={{ fontSize: 11, color: '#15803d', marginTop: 6 }}>Resolved note: {r.resolveNote}</div>}
                    <ITTicketActions req={r} userProfile={userProfile} onDone={() => setTick((n) => n + 1)} />
                  </div>
                );
              })}
          </>
        )}
      </div>
    </div>
  );
}
