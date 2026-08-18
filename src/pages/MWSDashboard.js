import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const today = () => new Date().toISOString().slice(0,10);

// Vacuum pump groups from MWS_DETAILS_DEC_25.xls
const VP_GROUPS = [
  {
    group:'A', vpName:'VP-149', vpNo:'9491.335.149',
    parts:[
      {no:'1',partNo:'9491.140.205',partName:'O-Ring',bomQty:1},
      {no:'2',partNo:'F002.G11.693',partName:'Vane',bomQty:4},
      {no:'3',partNo:'F002.G10.569',partName:'Non Return Valve',bomQty:1},
      {no:'4',partNo:'9491.140.108',partName:'Washer',bomQty:1},
      {no:'5',partNo:'6033.GC8.080',partName:'Rotor',bomQty:1},
      {no:'6',partNo:'2912.311.158',partName:'Screw',bomQty:3},
    ]
  },
  {
    group:'B', vpName:'VP-467', vpNo:'F002.G10.467',
    parts:[
      {no:'1',partNo:'9491.140.205',partName:'O-Ring',bomQty:1},
      {no:'2',partNo:'F002.G11.693',partName:'Vane',bomQty:4},
      {no:'3',partNo:'F002.G10.569',partName:'Non Return Valve',bomQty:1},
      {no:'4',partNo:'9491.140.108',partName:'Washer',bomQty:1},
      {no:'5',partNo:'6033.GC8.080',partName:'Rotor',bomQty:1},
      {no:'6',partNo:'2912.311.158',partName:'Screw',bomQty:3},
    ]
  },
  {
    group:'C', vpName:'VP-568', vpNo:'F002.G10.568',
    parts:[
      {no:'1',partNo:'9491.140.201',partName:'O-Ring (201)',bomQty:1},
      {no:'2',partNo:'F002.G91.563',partName:'Flat Ring Seal',bomQty:1},
      {no:'3',partNo:'F002.G11.533',partName:'Vane',bomQty:3},
      {no:'4',partNo:'F002.G11.531',partName:'Rotor',bomQty:1},
      {no:'5',partNo:'F002.G10.569',partName:'Non Return Valve',bomQty:1},
      {no:'6',partNo:'2912.452.124',partName:'Screw Yellow',bomQty:3},
    ]
  },
  {
    group:'D', vpName:'VP-638', vpNo:'F002.G10.638',
    parts:[
      {no:'1',partNo:'9491.140.201',partName:'O-Ring (201)',bomQty:1},
      {no:'2',partNo:'F002.G91.563',partName:'Flat Ring Seal',bomQty:1},
      {no:'3',partNo:'F002.G11.533',partName:'Vane',bomQty:3},
      {no:'4',partNo:'F002.G11.531',partName:'Rotor',bomQty:1},
      {no:'5',partNo:'F002.G10.569',partName:'Non Return Valve',bomQty:1},
      {no:'6',partNo:'2912.452.124',partName:'Screw Yellow',bomQty:3},
    ]
  },
  {
    group:'80CC', vpName:'VP-80CC Pump', vpNo:'F000.BV1.AJ9',
    parts:[
      {no:'1',partNo:'F000.BV1.AF1',partName:'O-Ring 80CC',bomQty:1},
      {no:'2',partNo:'F000.BV1.AE8',partName:'Rotor 80CC',bomQty:1},
      {no:'3',partNo:'F000.BV1.AE9',partName:'Vane 80CC',bomQty:1},
      {no:'4',partNo:'F002.G91.385',partName:'Flat Seal Ring 80CC',bomQty:1},
      {no:'5',partNo:'9121.033.304',partName:'Banjo Connector 80CC',bomQty:1},
    ]
  },
];

export default function MWSDashboard({ dark, onBack, unit }) {
  const { userProfile } = useAuth();
  const isOwner = userProfile?.role === 'owner';
  const [activeTab, setActiveTab] = useState(isOwner ? 'view' : 'entry');
  const [records, setRecords] = useState([]);
  const [latestRecord, setLatestRecord] = useState(null);
  const [submitMsg, setSubmitMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState('A');

  // Entry state — one row per VP group per part
  const [entries, setEntries] = useState(
    VP_GROUPS.map(g => ({
      group: g.group, vpName: g.vpName, vpNo: g.vpNo,
      parts: g.parts.map(p => ({...p, physStock:0, scheduleQty:0, balanceToGet:0, receipt:0}))
    }))
  );

  const bg   = dark?'#0f111a':'#f4f6fb';
  const card = dark?'#1e2235':'#fff';
  const txt  = dark?'#e2e8f0':'#1a1a2e';
  const sub  = dark?'#94a3b8':'#888';
  const bdr  = dark?'#2d3748':'#e8e8e8';
  const inp  = {border:`1px solid ${bdr}`,borderRadius:6,padding:'5px 8px',fontSize:11,outline:'none',fontFamily:'inherit',background:dark?'#151929':'#fff',color:txt,width:75,textAlign:'right',boxSizing:'border-box'};

  const colName = `mws_child_parts_${unit==='u2'?'u2':'u1'}`;

  useEffect(()=>{
    const q = query(collection(db, colName), orderBy('submittedAt','desc'), limit(10));
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d=>({id:d.id,...d.data()}));
      setRecords(docs);
      if(docs.length>0 && docs[0].entries) setLatestRecord(docs[0]);
    });
  },[]);

  function updatePart(groupIdx, partNo, k, v) {
    setEntries(entries.map((g,gi) => gi!==groupIdx ? g : {
      ...g, parts: g.parts.map(p => p.partNo===partNo ? {...p,[k]:v} : p)
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await addDoc(collection(db, colName), {
        entries, date: today(),
        submittedBy: userProfile?.name,
        submittedAt: serverTimestamp(), unit: unit||'u1'
      });
      setSubmitMsg('✅ Saved!');
    } catch(e) { setSubmitMsg('❌ '+e.message); }
    finally { setSaving(false); setTimeout(()=>setSubmitMsg(''),4000); }
  }

  const hd = {background:'#1F3864',color:'#fff',padding:'7px 10px',fontSize:10,fontWeight:700,textAlign:'center',border:'1px solid #2d4a8a',whiteSpace:'nowrap'};
  const GROUP_COLORS = {A:'#e74c3c',B:'#e67e22',C:'#3498db',D:'#8e44ad','80CC':'#27ae60'};

  const data = activeTab==='view' ? (latestRecord?.entries||[]) : entries;

  return (
    <div style={{minHeight:'100vh',background:bg,fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{background:dark?'#1e2235':'#fff',borderBottom:`1px solid ${bdr}`,padding:'12px 20px',display:'flex',alignItems:'center',gap:14,position:'sticky',top:0,zIndex:10}}>
        <button onClick={onBack} style={{background:'transparent',border:`1px solid ${bdr}`,borderRadius:8,padding:'7px 14px',color:sub,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>← Back</button>
        <div style={{flex:1}}>
          <h1 style={{margin:0,fontSize:16,fontWeight:800,color:txt}}>⚙️ MWS — Vacuum Pump Child Parts</h1>
          <p style={{margin:0,fontSize:11,color:sub}}>Assembly child parts tracking · Unit {unit==='u2'?'2':'1'}</p>
        </div>
        {submitMsg&&<div style={{background:submitMsg.startsWith('✅')?'#f0fdf4':'#fef2f2',borderRadius:8,padding:'7px 14px',fontSize:12,color:submitMsg.startsWith('✅')?'#16a34a':'#dc2626',fontWeight:700}}>{submitMsg}</div>}
      </div>

      <div style={{background:dark?'#1e2235':'#fff',borderBottom:`1px solid ${bdr}`,display:'flex',padding:'0 20px'}}>
        {!isOwner&&<button onClick={()=>setActiveTab('entry')} style={{padding:'10px 18px',border:'none',background:'transparent',fontFamily:'inherit',cursor:'pointer',fontSize:13,fontWeight:activeTab==='entry'?800:400,color:activeTab==='entry'?'#f97316':sub,borderBottom:activeTab==='entry'?'3px solid #f97316':'3px solid transparent'}}>✏️ Daily Entry</button>}
        <button onClick={()=>setActiveTab('view')} style={{padding:'10px 18px',border:'none',background:'transparent',fontFamily:'inherit',cursor:'pointer',fontSize:13,fontWeight:activeTab==='view'?800:400,color:activeTab==='view'?'#f97316':sub,borderBottom:activeTab==='view'?'3px solid #f97316':'3px solid transparent'}}>📊 View / History</button>
      </div>

      <div style={{padding:'16px 20px',paddingBottom:60}}>
        {/* Group pills */}
        <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
          {VP_GROUPS.map(g=>(
            <button key={g.group} onClick={()=>setExpandedGroup(g.group)}
              style={{background:expandedGroup===g.group?GROUP_COLORS[g.group]:(dark?'#2d3748':'#f0f0f0'),border:'none',borderRadius:20,padding:'7px 16px',color:expandedGroup===g.group?'#fff':sub,fontSize:12,fontWeight:expandedGroup===g.group?800:400,cursor:'pointer',fontFamily:'inherit'}}>
              Group {g.group}: {g.vpName}
            </button>
          ))}
          {activeTab==='entry'&&!isOwner&&(
            <button onClick={handleSave} disabled={saving} style={{marginLeft:'auto',background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:8,padding:'8px 18px',color:'#fff',fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
              {saving?'⏳ Saving':'💾 Save'}
            </button>
          )}
        </div>

        {/* History selector for view tab */}
        {activeTab==='view'&&records.length>1&&(
          <div style={{marginBottom:12,display:'flex',gap:8,flexWrap:'wrap'}}>
            {records.slice(0,7).map((r,i)=>(
              <button key={r.id} onClick={()=>setLatestRecord(r)}
                style={{background:latestRecord?.id===r.id?'#f97316':(dark?'#2d3748':'#f0f0f0'),border:'none',borderRadius:20,padding:'5px 12px',fontSize:11,color:latestRecord?.id===r.id?'#fff':sub,cursor:'pointer',fontFamily:'inherit',fontWeight:latestRecord?.id===r.id?700:400}}>
                {r.date}{i===0?' (Latest)':''}
              </button>
            ))}
          </div>
        )}

        {/* Table for selected group */}
        {data.filter(g=>g.group===expandedGroup).map(g=>{
          const color = GROUP_COLORS[g.group]||'#666';
          return (
            <div key={g.group}>
              {/* Group header */}
              <div style={{background:color+'22',borderLeft:`4px solid ${color}`,borderRadius:10,padding:'12px 16px',marginBottom:14}}>
                <div style={{fontWeight:800,color,fontSize:15}}>Group {g.group}: {g.vpName}</div>
                <div style={{fontSize:11,color:sub,marginTop:2}}>Part No: {g.vpNo}</div>
                {activeTab==='view'&&latestRecord&&(
                  <div style={{fontSize:11,color:sub,marginTop:2}}>
                    Last entry: {latestRecord.date} by {latestRecord.submittedBy}
                  </div>
                )}
              </div>
              <div style={{overflowX:'auto',marginBottom:20}}>
                <table style={{borderCollapse:'collapse',fontSize:11,background:card,width:'100%'}}>
                  <thead>
                    <tr>
                      <th style={hd}>S.No</th>
                      <th style={{...hd,textAlign:'left',minWidth:100}}>Part No</th>
                      <th style={{...hd,textAlign:'left',minWidth:140}}>Part Name</th>
                      <th style={hd}>BOM Qty</th>
                      {activeTab==='entry'
                        ? <><th style={hd}>Phy Stock</th><th style={hd}>Schedule</th><th style={hd}>Balance to Get</th><th style={hd}>Receipt</th></>
                        : <><th style={hd}>Phy Stock</th><th style={hd}>Schedule</th><th style={{...hd,background:'#dc2626'}}>Balance to Get</th><th style={hd}>Receipt</th></>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    {g.parts.map((p,pi)=>{
                      const groupIdx = entries.findIndex(e=>e.group===g.group);
                      return (
                        <tr key={p.partNo} style={{background:pi%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                          <td style={{padding:'6px 8px',border:`1px solid ${bdr}`,textAlign:'center',color:sub}}>{p.no}</td>
                          <td style={{padding:'6px 8px',border:`1px solid ${bdr}`,fontFamily:'monospace',fontSize:10,color:sub}}>{p.partNo}</td>
                          <td style={{padding:'6px 8px',border:`1px solid ${bdr}`,fontWeight:600,color:txt}}>{p.partName}</td>
                          <td style={{padding:'6px 8px',border:`1px solid ${bdr}`,textAlign:'center',color:sub}}>{p.bomQty}</td>
                          {activeTab==='entry'&&!isOwner
                            ? ['physStock','scheduleQty','balanceToGet','receipt'].map(k=>(
                                <td key={k} style={{padding:'2px 4px',border:`1px solid ${bdr}`}}>
                                  <input style={inp} type="number" inputMode="numeric" value={p[k]||0} onChange={e=>updatePart(groupIdx,p.partNo,k,e.target.value)}/>
                                </td>
                              ))
                            : ['physStock','scheduleQty','balanceToGet','receipt'].map((k,ki)=>(
                                <td key={k} style={{padding:'6px 8px',border:`1px solid ${bdr}`,textAlign:'right',fontWeight:ki===2&&parseInt(p[k])>0?800:400,color:ki===2&&parseInt(p[k])>0?'#dc2626':txt}}>
                                  {parseInt(p[k]||0).toLocaleString()}
                                </td>
                              ))
                          }
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {data.filter(g=>g.group===expandedGroup).length===0&&(
          <div style={{textAlign:'center',padding:'40px',color:sub}}>📭 No data yet for this group</div>
        )}
      </div>
    </div>
  );
}
