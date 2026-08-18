import React, { useEffect, useState, useMemo } from 'react';
import { subscribeAllTasks, subscribeDeptTasks, daysOpen, agingBucket } from '../utils/taskService';
import { DEPARTMENTS, getDeptLabel, getDeptColor } from '../data/orgData';
import { useAuth } from '../contexts/AuthContext';

function getTaskOwner(t) { return t.assignedToPersonName || t.raisedByName || '—'; }

export default function AgeingScreen({ dark, onBack }) {
  const { userProfile } = useAuth();
  const isOwner = userProfile?.role === 'owner';
  const [tasks, setTasks] = useState([]);
  const [filterDept, setFilterDept] = useState('All');

  useEffect(() => {
    let unsub;
    if (isOwner) unsub = subscribeAllTasks(userProfile?.unit || 'u1', setTasks);
    else unsub = subscribeDeptTasks(userProfile?.dept, userProfile?.unit || 'u1', setTasks);
    return () => unsub && unsub();
  }, [userProfile, isOwner]);

  const deptRows = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      const dept = t.assignedToDept || t.raisedByDept;
      if (!dept) return;
      if (!map[dept]) map[dept] = {
        dept, tasks: [], owner: getTaskOwner(t),
        total:0, fresh:0, watch:0, overdue:0, onHold:0, closed:0, cancelled:0,
        days:[], oldest:0,
      };
      map[dept].tasks.push(t);
      map[dept].total++;
      const d = daysOpen(t);
      const b = agingBucket(d);
      if (t.status === 'Closed')      { map[dept].closed++; }
      else if (t.status === 'Cancelled') { map[dept].cancelled++; }
      else if (t.status === 'On Hold')   { map[dept].onHold++; }
      else {
        if (b === 'fresh')   map[dept].fresh++;
        else if (b === 'watch')  map[dept].watch++;
        else if (b === 'overdue') map[dept].overdue++;
        map[dept].days.push(d);
        if (d > map[dept].oldest) map[dept].oldest = d;
      }
    });
    return Object.values(map).sort((a,b) => b.overdue - a.overdue || b.total - a.total);
  }, [tasks]);

  const totals = useMemo(() => deptRows.reduce((acc, r) => ({
    total:    acc.total + r.total,
    fresh:    acc.fresh + r.fresh,
    watch:    acc.watch + r.watch,
    overdue:  acc.overdue + r.overdue,
    onHold:   acc.onHold + r.onHold,
    closed:   acc.closed + r.closed,
    cancelled:acc.cancelled + r.cancelled,
  }), { total:0, fresh:0, watch:0, overdue:0, onHold:0, closed:0, cancelled:0 }), [deptRows]);

  const filtered = filterDept === 'All' ? deptRows : deptRows.filter(r => r.dept === filterDept);

  const bg   = dark ? '#0f111a' : '#f4f6fb';
  const card = dark ? '#1e2235' : '#fff';
  const txt  = dark ? '#e2e8f0' : '#1a1a2e';
  const sub  = dark ? '#94a3b8' : '#888';
  const bdr  = dark ? '#2d3748' : '#e8e8e8';
  const hdrBg= '#1F3864';

  const inp = { border:`1.5px solid ${bdr}`, borderRadius:10, padding:'8px 12px', fontSize:13, outline:'none', fontFamily:'inherit', background:dark?'#151929':'#fff', color:txt, cursor:'pointer' };

  function pctDone(r) { return r.total ? Math.round(r.closed / r.total * 100) : 0; }
  function avgDays(r) {
    const active = r.days;
    return active.length ? (active.reduce((a,b)=>a+b,0)/active.length).toFixed(1) : '0.0';
  }

  const colW = { dept:160, owner:120, total:70, fresh:80, watch:80, overdue:90, hold:70, closed:70, cancelled:80, avg:130, oldest:100, pct:80 };

  return (
    <div style={{ minHeight:'100vh', background:bg, fontFamily:"'DM Sans',sans-serif", padding:'24px 28px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24 }}>
        <button onClick={onBack}
          style={{ background:dark?'rgba(255,255,255,0.06)':'#fff', border:`1px solid ${bdr}`, borderRadius:10, padding:'9px 16px', color:sub, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
          ← Back
        </button>
        <div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:txt }}>Open Tasks — Ageing Breakdown</h1>
          <p style={{ margin:'4px 0 0', fontSize:12, color:sub }}>
            {new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
            {' · '}Unit {userProfile?.unit==='u2'?'2':'1'}
          </p>
        </div>
        <div style={{ marginLeft:'auto' }}>
          <select style={inp} value={filterDept} onChange={e=>setFilterDept(e.target.value)}>
            <option value="All">All Departments</option>
            {DEPARTMENTS.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display:'flex', gap:10, marginBottom:24, flexWrap:'wrap' }}>
        {[
          {l:'Total Tasks',  v:totals.total,    c:'#4f46e5', bg:dark?'#1e1b4b':'#eef2ff'},
          {l:'🟢 Fresh 0–7d', v:totals.fresh,   c:'#16a34a', bg:dark?'#052d14':'#f0fdf4'},
          {l:'🟡 Watch 8–14d',v:totals.watch,   c:'#d97706', bg:dark?'#2d2005':'#fffbeb'},
          {l:'🔴 Overdue 15d+',v:totals.overdue,c:'#dc2626', bg:dark?'#2d1515':'#fef2f2'},
          {l:'On Hold',      v:totals.onHold,   c:'#ea580c', bg:dark?'#2d1a05':'#fff7ed'},
          {l:'Closed',       v:totals.closed,   c:'#16a34a', bg:dark?'#052d14':'#f0fdf4'},
        ].map(k=>(
          <div key={k.l} style={{ flex:'1 1 100px', borderRadius:12, padding:'14px 16px', minWidth:100, background:k.bg }}>
            <div style={{ fontSize:24, fontWeight:800, color:k.c }}>{k.v}</div>
            <div style={{ fontSize:10, color:sub, marginTop:4, fontWeight:600 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background:card, borderRadius:16, overflow:'hidden', boxShadow:`0 2px 12px rgba(0,0,0,${dark?0.3:0.08})`, border:`1px solid ${bdr}` }}>
        {/* Table header */}
        <div style={{ display:'flex', background:hdrBg, padding:'10px 16px', fontSize:11, fontWeight:700, color:'#fff', letterSpacing:'0.5px', textTransform:'uppercase' }}>
          <div style={{width:colW.dept,flexShrink:0}}>Department</div>
          <div style={{width:colW.owner,flexShrink:0}}>Owner</div>
          <div style={{width:colW.total,flexShrink:0,textAlign:'center'}}>Total</div>
          <div style={{width:colW.fresh,flexShrink:0,textAlign:'center'}}>🟢 0–7d</div>
          <div style={{width:colW.watch,flexShrink:0,textAlign:'center'}}>🟡 8–14d</div>
          <div style={{width:colW.overdue,flexShrink:0,textAlign:'center'}}>🔴 15d+</div>
          <div style={{width:colW.hold,flexShrink:0,textAlign:'center'}}>On Hold</div>
          <div style={{width:colW.closed,flexShrink:0,textAlign:'center'}}>Closed</div>
          <div style={{width:colW.cancelled,flexShrink:0,textAlign:'center'}}>Cancelled</div>
          <div style={{width:colW.avg,flexShrink:0,textAlign:'center'}}>Avg Days (Active)</div>
          <div style={{width:colW.oldest,flexShrink:0,textAlign:'center'}}>Oldest (d)</div>
          <div style={{width:colW.pct,flexShrink:0,textAlign:'center'}}>% Done</div>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ padding:'40px', textAlign:'center', color:sub }}>No data available</div>
        ) : filtered.map((r, i) => {
          const isAlt = i % 2 === 0;
          const rowBg = dark ? (isAlt?'#1e2235':'#171a2d') : (isAlt?'#fff':'#f8f9fc');
          const pct = pctDone(r);
          return (
            <div key={r.dept} style={{ display:'flex', alignItems:'center', padding:'11px 16px', background:rowBg, borderBottom:`1px solid ${bdr}`, fontSize:13 }}>
              <div style={{ width:colW.dept, flexShrink:0, display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:getDeptColor(r.dept), flexShrink:0 }}/>
                <span style={{ fontWeight:700, color:getDeptColor(r.dept) }}>{getDeptLabel(r.dept)}</span>
              </div>
              <div style={{ width:colW.owner, flexShrink:0, color:sub, fontSize:12 }}>{r.owner}</div>
              <div style={{ width:colW.total, flexShrink:0, textAlign:'center', fontWeight:700, color:txt }}>{r.total}</div>
              <div style={{ width:colW.fresh, flexShrink:0, textAlign:'center' }}>
                <span style={{ background:'#f0fdf4', color:'#16a34a', fontWeight:700, padding:'2px 8px', borderRadius:20, fontSize:11 }}>{r.fresh}</span>
              </div>
              <div style={{ width:colW.watch, flexShrink:0, textAlign:'center' }}>
                <span style={{ background:'#fffbeb', color:'#d97706', fontWeight:700, padding:'2px 8px', borderRadius:20, fontSize:11 }}>{r.watch}</span>
              </div>
              <div style={{ width:colW.overdue, flexShrink:0, textAlign:'center' }}>
                {r.overdue > 0
                  ? <span style={{ background:'#fef2f2', color:'#dc2626', fontWeight:800, padding:'2px 8px', borderRadius:20, fontSize:11 }}>⚠ {r.overdue}</span>
                  : <span style={{ color:sub }}>0</span>}
              </div>
              <div style={{ width:colW.hold, flexShrink:0, textAlign:'center', color:sub }}>{r.onHold}</div>
              <div style={{ width:colW.closed, flexShrink:0, textAlign:'center', color:'#16a34a', fontWeight:600 }}>{r.closed}</div>
              <div style={{ width:colW.cancelled, flexShrink:0, textAlign:'center', color:sub }}>{r.cancelled}</div>
              <div style={{ width:colW.avg, flexShrink:0, textAlign:'center', color:sub, fontSize:12 }}>{avgDays(r)}</div>
              <div style={{ width:colW.oldest, flexShrink:0, textAlign:'center' }}>
                {r.oldest > 0
                  ? <span style={{ color: r.oldest>=15?'#dc2626':r.oldest>=8?'#d97706':'#16a34a', fontWeight:700 }}>{r.oldest}d</span>
                  : <span style={{ color:sub }}>—</span>}
              </div>
              <div style={{ width:colW.pct, flexShrink:0 }}>
                <div style={{ background:dark?'#2d3748':'#f0f0f0', borderRadius:20, height:6, marginBottom:3 }}>
                  <div style={{ height:'100%', borderRadius:20, background: pct===100?'#16a34a':pct>50?'#f59e0b':'#ef4444', width:`${pct}%`, transition:'width 0.5s' }}/>
                </div>
                <div style={{ fontSize:10, color:sub, textAlign:'center' }}>{pct}%</div>
              </div>
            </div>
          );
        })}

        {/* Totals row */}
        {filtered.length > 0 && (
          <div style={{ display:'flex', alignItems:'center', padding:'11px 16px', background:'#2F5496', fontSize:13, fontWeight:700, color:'#fff' }}>
            <div style={{ width:colW.dept, flexShrink:0 }}>TOTAL</div>
            <div style={{ width:colW.owner, flexShrink:0 }}/>
            <div style={{ width:colW.total, flexShrink:0, textAlign:'center' }}>{totals.total}</div>
            <div style={{ width:colW.fresh, flexShrink:0, textAlign:'center' }}>{totals.fresh}</div>
            <div style={{ width:colW.watch, flexShrink:0, textAlign:'center' }}>{totals.watch}</div>
            <div style={{ width:colW.overdue, flexShrink:0, textAlign:'center' }}>{totals.overdue}</div>
            <div style={{ width:colW.hold, flexShrink:0, textAlign:'center' }}>{totals.onHold}</div>
            <div style={{ width:colW.closed, flexShrink:0, textAlign:'center' }}>{totals.closed}</div>
            <div style={{ width:colW.cancelled, flexShrink:0, textAlign:'center' }}>{totals.cancelled}</div>
            <div style={{ width:colW.avg, flexShrink:0 }}/>
            <div style={{ width:colW.oldest, flexShrink:0 }}/>
            <div style={{ width:colW.pct, flexShrink:0, textAlign:'center' }}>
              {totals.total ? Math.round(totals.closed/totals.total*100) : 0}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
