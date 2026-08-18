import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';

const todayStr = () => new Date().toISOString().slice(0,10);

// June 2026 targets — U1 data
const MONTHLY_TARGET = {
  unit1Qty: 829268,
  unit1Value: 74226940,
  totalWorkingDays: 26,
  totalDays: 30,
  sundays: 4,
  dailyTarget: 2854882,           // Target per day Unit 1
  netDailySales: 6454622,         // Net sales to be achieved per day (combined)
  monthNorm: 85.59,               // Sales as per norms in Lakhs
};
const fmt = (v) => v===undefined||v===null||v===''?'—':`₹${parseFloat(v).toFixed(2)}L`;

export default function RevenueDashboard({ dark, onBack, unit }) {
  const activeUnit = unit||'u1';
  const { userProfile } = useAuth();
  const isOwner = userProfile?.role === 'owner';
  const [records, setRecords] = useState([]);
  const [tab, setTab] = useState('today');
  const [form, setForm] = useState({
    date: todayStr(),
    salesNorm: '', achieved: '', strikeRate: '',
    salePlanToday: '', deficitAsOnToday: '', yesterdaySales: '',
    remarks: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const bg   = dark ? '#0f111a' : '#f4f6fb';
  const card = dark ? '#1e2235' : '#fff';
  const txt  = dark ? '#e2e8f0' : '#1a1a2e';
  const sub  = dark ? '#94a3b8' : '#888';
  const bdr  = dark ? '#2d3748' : '#e8e8e8';
  const inp  = { border:`1.5px solid ${bdr}`, borderRadius:8, padding:'9px 12px', fontSize:13, outline:'none', fontFamily:'inherit', background:dark?'#151929':'#fff', color:txt, width:'100%', boxSizing:'border-box' };

  useEffect(()=>{
    const q = query(collection(db,`revenue_daily${activeUnit==='u2'?'_u2':''}`), orderBy('date','desc'), limit(30));
    return onSnapshot(q, s => setRecords(s.docs.map(d=>({id:d.id,...d.data()}))));
  },[]);

  const todayRecord = records.find(r=>r.date===todayStr());

  async function save() {
    if (!form.achieved) return alert('Enter at least Achieved revenue');
    setSaving(true);
    try {
      await addDoc(collection(db,`revenue_daily${activeUnit==='u2'?'_u2':''}`), {
        ...form,
        salesNorm:     parseFloat(form.salesNorm)||0,
        achieved:      parseFloat(form.achieved)||0,
        strikeRate:    parseFloat(form.strikeRate)||0,
        salePlanToday: parseFloat(form.salePlanToday)||0,
        deficitAsOnToday: parseFloat(form.deficitAsOnToday)||0,
        yesterdaySales: parseFloat(form.yesterdaySales)||0,
        submittedBy: userProfile?.name,
        createdAt: serverTimestamp(),
      });
      // Send notification
      const {createNotification, NOTIF_TYPES} = await import('../utils/notificationService');
      await createNotification(activeUnit||'u1', NOTIF_TYPES.REVENUE, {
        title: `📈 Revenue Updated — ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short'})}`,
        message: `${userProfile?.name||'PPC'} updated revenue. Achieved: ₹${parseFloat(form.achieved)||0}L | Strike Rate: ₹${parseFloat(form.strikeRate)||0}L`,
        screen: 'revenue',
      });
      setMsg('✅ Saved!');
      setForm(f=>({...f, salesNorm:'', achieved:'', strikeRate:'', salePlanToday:'', deficitAsOnToday:'', yesterdaySales:'', remarks:''}));
    } catch(e) { setMsg('❌ '+e.message); }
    finally { setSaving(false); setTimeout(()=>setMsg(''),4000); }
  }

  // Chart data — last 14 days
  const chartData = useMemo(()=>{
    return [...records].slice(0,14).reverse().map(r=>({
      date: new Date(r.date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short'}),
      Achieved: parseFloat(r.achieved)||0,
      Norm: parseFloat(r.salesNorm)||0,
      Plan: parseFloat(r.salePlanToday)||0,
      Deficit: parseFloat(r.deficitAsOnToday)||0,
    }));
  },[records]);

  const latest = records[0];

  const MetricCard = ({label,value,color,bg,sub2}) => (
    <div style={{background:bg||card,borderRadius:12,padding:'14px 16px',border:`1px solid ${bdr}`}}>
      <div style={{fontSize:10,fontWeight:700,color:sub,textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>{label}</div>
      <div style={{fontSize:22,fontWeight:900,color:color||txt}}>{value}</div>
      {sub2&&<div style={{fontSize:10,color:sub,marginTop:4}}>{sub2}</div>}
    </div>
  );

  return (
    <div style={{minHeight:'100vh',background:bg,fontFamily:"'DM Sans',sans-serif"}}>
      {/* Header */}
      <div style={{background:card,borderBottom:`1px solid ${bdr}`,padding:'12px 20px',display:'flex',alignItems:'center',gap:14,position:'sticky',top:0,zIndex:10}}>
        <button onClick={onBack} style={{background:'transparent',border:`1px solid ${bdr}`,borderRadius:8,padding:'7px 14px',color:sub,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>← Back</button>
        <div style={{flex:1}}>
          <h1 style={{margin:0,fontSize:16,fontWeight:800,color:txt}}>📈 Revenue Dashboard</h1>
          <p style={{margin:0,fontSize:11,color:sub}}>Daily Sales Tracker — {new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</p>
        </div>
        {msg&&<div style={{background:msg.startsWith('✅')?'#f0fdf4':'#fef2f2',borderRadius:8,padding:'6px 14px',fontSize:12,color:msg.startsWith('✅')?'#16a34a':'#dc2626',fontWeight:700}}>{msg}</div>}
      </div>

      {/* Tabs */}
      <div style={{background:card,borderBottom:`1px solid ${bdr}`,padding:'0 20px',display:'flex',gap:0}}>
        {[['today','📊 Today'],['entry','✏️ Entry'],['trend','📈 Trend'],['history','📅 History']].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:'10px 18px',border:'none',background:'transparent',fontFamily:'inherit',cursor:'pointer',fontSize:12,fontWeight:tab===t?800:400,color:tab===t?'#f97316':sub,borderBottom:tab===t?'3px solid #f97316':'3px solid transparent'}}>{l}</button>
        ))}
      </div>

      <div style={{padding:'16px 20px',maxWidth:900,paddingBottom:40}}>

        {/* TODAY TAB */}
        {tab==='today'&&(
          <div>
            {latest&&(
              <div style={{background:dark?'#1a3a1a':'#e8f5e9',border:'1px solid #4ade80',borderRadius:16,padding:'20px 24px',marginBottom:20}}>
                <div style={{fontWeight:800,color:'#16a34a',fontSize:13,marginBottom:12,textTransform:'uppercase'}}>📋 Day Details — {new Date(latest.date+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</div>
                {[
                  ['Sales as per Norms', `₹${latest.salesNorm}L`],
                  ['Achieved', `₹${latest.achieved}L`],
                  ["Strike Rate", `₹${latest.strikeRate}L`],
                  ['Sale Plan Today', `₹${latest.salePlanToday}L`],
                  ["Revenue Deficit As On Today", `₹${latest.deficitAsOnToday}L`],
                  ["Yesterday's Sales", `₹${latest.yesterdaySales}L`],
                ].map(([l,v])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(74,222,128,0.3)'}}>
                    <span style={{fontSize:13,color:dark?'#86efac':'#166534'}}>{l}</span>
                    <span style={{fontSize:14,fontWeight:800,color:dark?'#4ade80':'#15803d'}}>{v}</span>
                  </div>
                ))}
                {latest.remarks&&<div style={{marginTop:10,fontSize:12,color:dark?'#86efac':'#166534',fontStyle:'italic'}}>📝 {latest.remarks}</div>}
                <div style={{marginTop:10,fontSize:10,color:sub}}>By {latest.submittedBy} · {latest.date}</div>
              </div>
            )}
            {!latest&&<div style={{textAlign:'center',padding:40,color:sub}}>No data entered yet for today. Use Entry tab to add.</div>}
          </div>
        )}

                {/* ENTRY TAB */}
        {tab==='entry'&&(
          <div style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,padding:'20px'}}>
            <div style={{fontWeight:700,color:txt,fontSize:15,marginBottom:4}}>Enter Daily Revenue Data</div>
            <p style={{margin:'0 0 16px',fontSize:12,color:sub}}>Can be updated multiple times — each entry saved separately</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[
                ['date','Date','date'],
                ['salesNorm','Sales as per Norms (₹ Lakhs)','number'],
                ['achieved','Achieved (₹ Lakhs)','number'],
                ['strikeRate',"Strike Rate (₹ Lakhs)","number"],
                ['salePlanToday','Sale Plan Today (₹ Lakhs)','number'],
                ['deficitAsOnToday','Revenue Deficit As On Today (₹ Lakhs)','number'],
                ['yesterdaySales',"Yesterday's Sales (₹ Lakhs)",'number'],
              ].map(([k,l,t])=>(
                <div key={k}>
                  <label style={{fontSize:11,fontWeight:700,color:sub,textTransform:'uppercase',marginBottom:4,display:'block'}}>{l}</label>
                  <input style={inp} type={t} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={t==='number'?'0.00':''}
                    inputMode={t==='number'?'decimal':undefined}/>
                </div>
              ))}
              <div style={{gridColumn:'1/-1'}}>
                <label style={{fontSize:11,fontWeight:700,color:sub,textTransform:'uppercase',marginBottom:4,display:'block'}}>Remarks</label>
                <input style={inp} value={form.remarks} onChange={e=>setForm(f=>({...f,remarks:e.target.value}))} placeholder="Optional notes..."/>
              </div>
            </div>
            <button onClick={save} disabled={saving} style={{marginTop:16,background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:10,padding:'12px 28px',color:'#fff',fontSize:14,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
              {saving?'⏳ Saving...':'💾 Save Entry'}
            </button>
          </div>
        )}

        {/* TREND TAB */}
        {tab==='trend'&&(
          <div>
            <div style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,padding:'20px',marginBottom:16}}>
              <div style={{fontWeight:700,color:txt,marginBottom:16}}>Achieved vs Norm — Last 14 Days</div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{top:5,right:10,bottom:5,left:10}}>
                  <defs>
                    <linearGradient id="colorAch" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorNorm" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}/>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:sub}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:10,fill:sub}} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v}L`}/>
                  <Tooltip formatter={(v,n)=>[`₹${v}L`,n]} contentStyle={{background:card,border:`1px solid ${bdr}`,borderRadius:8,fontSize:12}}/>
                  <Area type="monotone" dataKey="Norm" stroke="#3b82f6" fill="url(#colorNorm)" strokeWidth={2} strokeDasharray="4 4" dot={false}/>
                  <Area type="monotone" dataKey="Achieved" stroke="#22c55e" fill="url(#colorAch)" strokeWidth={2.5} dot={{r:3,fill:'#22c55e'}}/>
                </AreaChart>
              </ResponsiveContainer>
              <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:8}}>
                {[['#22c55e','Achieved'],['#3b82f6','Norm (dashed)']].map(([c,l])=>(
                  <div key={l} style={{display:'flex',alignItems:'center',gap:6}}>
                    <div style={{width:20,height:3,background:c,borderRadius:2}}/>
                    <span style={{fontSize:11,color:sub}}>{l}</span>
                  </div>
                ))}
              </div>
            </div>


          </div>
        )}

        {/* HISTORY TAB */}
        {tab==='history'&&(
          <div style={{background:card,borderRadius:12,border:`1px solid ${bdr}`,overflow:'hidden'}}>
            <div style={{background:'#1F3864',padding:'10px 16px',display:'grid',gridTemplateColumns:'100px 90px 90px 80px 90px 90px 90px',color:'#fff',fontSize:10,fontWeight:700,gap:8}}>
              {['Date','Norm (₹L)','Achieved (₹L)','Lapse/Day (₹L)','Plan Today (₹L)','Deficit (₹L)','Yesterday (₹L)'].map(h=><span key={h}>{h}</span>)}
            </div>
            {records.length===0&&<div style={{padding:'30px',textAlign:'center',color:sub}}>No records yet</div>}
            {records.map((r,i)=>{
              const pct = r.salesNorm ? ((r.achieved/r.salesNorm)*100).toFixed(0) : 0;
              return (
                <div key={r.id} style={{display:'grid',gridTemplateColumns:'100px 90px 90px 80px 90px 90px 90px',padding:'10px 16px',gap:8,borderBottom:`1px solid ${bdr}`,background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc'),alignItems:'center'}}>
                  <span style={{fontSize:12,fontWeight:600,color:txt}}>{r.date}</span>
                  <span style={{fontSize:12,color:sub}}>₹{r.salesNorm}L</span>
                  <span style={{fontSize:13,fontWeight:700,color:'#22c55e'}}>₹{r.achieved}L</span>
                  <span style={{fontSize:12,fontWeight:700,color:'#f59e0b'}}>₹{parseFloat(r.strikeRate||0).toFixed(2)}L</span>
                  <span style={{fontSize:12,color:sub}}>₹{r.salePlanToday}L</span>
                  <span style={{fontSize:12,fontWeight:700,color:'#ef4444'}}>₹{r.deficitAsOnToday}L</span>
                  <span style={{fontSize:12,color:sub}}>₹{r.yesterdaySales}L</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
