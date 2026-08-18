import React, { useEffect, useMemo, useState } from 'react';
import { subscribeAppRequests } from '../utils/requestService';

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
  const day = d.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  return isoLocal(d);
}

function monthBounds(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from, to: isoLocal(last) };
}

function flowApproved(r) {
  if (!r || r.rejected || r.cancelled) return false;
  if (r.autoApproved) return true;
  const flow = Array.isArray(r.flow) ? r.flow : [];
  if (!flow.length) return false;
  return flow.every((s) => {
    const role = typeof s === 'object' ? s.role : s;
    return r.approvals?.[role]?.status === 'Approved';
  });
}

function leaveStatus(r) {
  if (r.cancelled) return 'Cancelled';
  if (r.rejected) return 'Rejected';
  if (flowApproved(r)) return 'Approved';
  return 'Pending';
}

function leaveFrom(r) {
  return r.dateFrom || r.date || '';
}

function leaveTo(r) {
  return r.dateTo || r.date || '';
}

function overlapsRange(r, from, to) {
  const a = leaveFrom(r);
  const b = leaveTo(r);
  if (!a || !b || !from || !to) return false;
  return a <= to && b >= from;
}

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
];

function statusColor(st) {
  if (st === 'Approved') return '#15803d';
  if (st === 'Pending') return '#b45309';
  if (st === 'Rejected') return '#dc2626';
  return '#6b7280';
}

function LeaveTable({ rows, txt, sub }) {
  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 800, color: sub, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
  const td = { padding: '9px 10px', fontSize: 12, color: txt, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };

  if (!rows.length) {
    return <div style={{ textAlign: 'center', padding: 32, color: sub, fontSize: 13 }}>No leave records for this period</div>;
  }

  return (
    <div style={{ overflowX: 'auto', background: 'var(--bg-raised)', borderRadius: 12, border: '1px solid #e5e7eb' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
        <thead>
          <tr>
            <th style={th}>Employee</th>
            <th style={th}>Dept</th>
            <th style={th}>Type</th>
            <th style={th}>From</th>
            <th style={th}>To</th>
            <th style={th}>Days</th>
            <th style={th}>Status</th>
            <th style={th}>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = leaveStatus(r);
            const days = r.leaveDaysApproved ?? r.leaveDays ?? '—';
            return (
              <tr key={r.id}>
                <td style={{ ...td, fontWeight: 800 }}>{r.employeeName || '—'}</td>
                <td style={td}>{r.dept?.toUpperCase() || '—'}</td>
                <td style={td}>{r.leaveType || '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{leaveFrom(r) || '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{leaveTo(r) || '—'}</td>
                <td style={{ ...td, fontWeight: 800 }}>{days}</td>
                <td style={{ ...td, fontWeight: 800, color: statusColor(st) }}>{st}</td>
                <td style={{ ...td, maxWidth: 180 }}>{r.reason || r.description || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function HRDashboard({ userProfile, dark, onBack }) {
  const [tab, setTab] = useState('dashboard');
  const [leaves, setLeaves] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [period, setPeriod] = useState('today');
  const today = isoLocal();
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  useEffect(() => {
    return subscribeAppRequests((docs) => {
      setLeaves((docs || []).filter((r) => r.type === 'leave' && !r.deleted));
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
    () => leaves.filter((r) => overlapsRange(r, range.from, range.to))
      .sort((a, b) => String(leaveFrom(a)).localeCompare(String(leaveFrom(b)))),
    [leaves, range]
  );

  const stats = useMemo(() => {
    const pending = periodRows.filter((r) => leaveStatus(r) === 'Pending').length;
    const approved = periodRows.filter((r) => leaveStatus(r) === 'Approved').length;
    const cancelled = periodRows.filter((r) => leaveStatus(r) === 'Cancelled').length;
    const onLeave = periodRows.filter((r) => leaveStatus(r) === 'Approved').length;
    return { pending, approved, cancelled, onLeave, total: periodRows.length };
  }, [periodRows]);

  const listed = leaves.filter((r) => {
    if (statusFilter === 'all') return true;
    return leaveStatus(r).toLowerCase() === statusFilter;
  });

  const txt = 'var(--text-primary)';
  const sub = 'var(--text-secondary)';
  const inp = { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#111' };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <div style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)', color: '#fff', padding: '14px 18px', boxShadow: '0 2px 10px rgba(13,148,136,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          {onBack && <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 9, color: '#fff', fontSize: 18, cursor: 'pointer', padding: '5px 12px' }}>←</button>}
          <div>
            <div style={{ fontWeight: 900, fontSize: 17 }}>👔 HR</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Leave overview</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ id: 'dashboard', label: 'Dashboard', icon: '📊' }, { id: 'leave', label: 'Leave Requests', icon: '🌴' }].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                background: tab === t.id ? '#fff' : 'rgba(255,255,255,0.18)', color: tab === t.id ? '#0f766e' : '#fff' }}>
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
                { l: 'Pending', v: stats.pending, c: '#b45309', bg: '#fffbeb' },
                { l: 'Approved', v: stats.approved, c: '#15803d', bg: '#f0fdf4' },
                { l: period === 'today' ? 'On leave today' : 'On leave', v: stats.onLeave, c: '#1d4ed8', bg: '#eff6ff' },
                { l: 'Cancelled', v: stats.cancelled, c: '#6b7280', bg: '#f3f4f6' },
              ].map((s) => (
                <div key={s.l} style={{ background: s.bg, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: sub, textTransform: 'uppercase', marginTop: 4 }}>{s.l}</div>
                </div>
              ))}
            </div>

            <div style={{ fontWeight: 800, fontSize: 14, color: txt, marginBottom: 10 }}>Leave by period</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {PERIODS.map((p) => (
                <button key={p.id} onClick={() => setPeriod(p.id)}
                  style={{ padding: '7px 14px', borderRadius: 16, border: `1px solid ${period === p.id ? '#0f766e' : '#e5e7eb'}`,
                    background: period === p.id ? '#0f766e' : 'var(--bg-raised)', color: period === p.id ? '#fff' : sub,
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
              {range.from === range.to ? range.from : `${range.from} → ${range.to}`} · {periodRows.length} record{periodRows.length !== 1 ? 's' : ''}
            </div>

            <LeaveTable rows={periodRows} txt={txt} sub={sub} />
          </>
        )}

        {tab === 'leave' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {['all', 'pending', 'approved', 'cancelled', 'rejected'].map((f) => (
                <button key={f} onClick={() => setStatusFilter(f)}
                  style={{ padding: '5px 14px', borderRadius: 16, border: `1px solid ${statusFilter === f ? '#0f766e' : '#e5e7eb'}`,
                    background: statusFilter === f ? '#0f766e' : 'transparent', color: statusFilter === f ? '#fff' : '#6b7280',
                    fontWeight: statusFilter === f ? 700 : 400, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                  {f}
                </button>
              ))}
            </div>
            {listed.length === 0
              ? <div style={{ textAlign: 'center', padding: 40, color: sub }}>No leave requests</div>
              : listed.map((r) => {
                const st = leaveStatus(r);
                return (
                  <div key={r.id} style={{ background: 'var(--bg-raised)', borderRadius: 12, padding: '14px 16px', marginBottom: 10, border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontWeight: 800, color: txt }}>{r.employeeName}</div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: statusColor(st) }}>{st}</span>
                    </div>
                    <div style={{ fontSize: 12, color: sub, marginTop: 4 }}>
                      {r.dept?.toUpperCase()} · {r.leaveType} · {leaveFrom(r)} → {leaveTo(r)}
                    </div>
                    <div style={{ fontSize: 12, color: txt, marginTop: 6, fontWeight: 700 }}>
                      Requested {r.leaveDaysRequested ?? r.leaveDays} day(s)
                      {r.leaveDaysApproved != null ? ` · Approved ${r.leaveDaysApproved}` : ''}
                    </div>
                    {(r.reason || r.description) && <div style={{ fontSize: 12, color: sub, marginTop: 6 }}>{r.reason || r.description}</div>}
                  </div>
                );
              })}
          </>
        )}
      </div>
    </div>
  );
}
