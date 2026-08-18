import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, limit, onSnapshot, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDeptColor } from '../data/orgData';

const fmt = (ts) => {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
};
const fmtTime = (ts) => {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
};

export default function ExecutiveSummary({ dark, onBack, unit }) {
  const { userProfile } = useAuth();
  const [viewMode, setViewMode] = useState('visual'); // visual | table
  const [activeTab, setActiveTab] = useState('erp');  // erp | stores
  const [erpSection, setErpSection] = useState('overview'); // overview | pdc_running | scrap | pallets | rework | alloy_wip | fg_super

  // Latest records from each collection
  const [pdcData,    setPdcData]    = useState(null);
  const [scrapData,  setScrapData]  = useState(null);
  const [palletData, setPalletData] = useState(null);
  const [reworkData, setReworkData] = useState(null);
  const [alloyData,  setAlloyData]  = useState(null);
  const [fgData,     setFgData]     = useState(null);
  const [storesData, setStoresData] = useState(null);
  const [alloySupplierData, setAlloySupplierData] = useState(null);
  const [alloySchedules, setAlloySchedules] = useState([]);
  const [intraTransfers, setIntraTransfers] = useState([]);
  const [convertModal, setConvertModal] = useState(null);
  const [convertSuccess, setConvertSuccess] = useState(false);
  const [history,    setHistory]    = useState({});

  const sfx = unit === 'u2' ? '_u2' : '_u1';

  useEffect(() => {
    const subs = [];
    const latest = (colName, setter) => {
      const q = query(collection(db, colName), orderBy('submittedAt','desc'), limit(7));
      return onSnapshot(q, snap => {
        const docs = snap.docs.map(d=>({id:d.id,...d.data()}));
        setter(docs[0] || null);
        setHistory(h=>({...h,[colName]:docs}));
      });
    };
    subs.push(latest(`erp_pdc_running${sfx}`, setPdcData));
    subs.push(latest(`erp_scrap${sfx}`,        setScrapData));
    subs.push(latest(`erp_pallets${sfx}`,      setPalletData));
    subs.push(latest(`erp_rework${sfx}`,       setReworkData));
    subs.push(latest(`erp_alloy_wip${sfx}`,    setAlloyData));
    subs.push(latest(`erp_fg_super${sfx}`,     setFgData));
    subs.push(latest(`stores_checklist${sfx}`, setStoresData));
    subs.push(latest(`stores_alloy_supplier${sfx}`, setAlloySupplierData));
    // Alloy schedule — not unit-specific
    const qSched = query(collection(db,'alloy_schedule'), orderBy('createdAt','desc'), limit(50));
    subs.push(onSnapshot(qSched, s=>setAlloySchedules(s.docs.map(d=>({id:d.id,...d.data()})))));
    const qTrans = query(collection(db,'alloy_intra_transfer'), orderBy('createdAt','desc'), limit(50));
    subs.push(onSnapshot(qTrans, s=>setIntraTransfers(s.docs.map(d=>({id:d.id,...d.data()})))));
    return () => subs.forEach(u=>u());
  }, [unit]);

  const bg   = dark?'#0f111a':'#f4f6fb';
  const card = dark?'#1e2235':'#fff';
  const txt  = dark?'#e2e8f0':'#1a1a2e';
  const sub  = dark?'#94a3b8':'#666';
  const bdr  = dark?'#2d3748':'#e8e8e8';

  const tabBtn = (id, label) => (
    <button key={id} onClick={()=>setActiveTab(id)}
      style={{ padding:'10px 20px', border:'none', background:'transparent', fontFamily:'inherit', cursor:'pointer', fontSize:13, fontWeight: activeTab===id?800:500,
        color: activeTab===id?'#f97316':sub, borderBottom: activeTab===id?'3px solid #f97316':'3px solid transparent' }}>
      {label}
    </button>
  );

  const sectionBtn = (id, label, icon) => (
    <button key={id} onClick={()=>setErpSection(id)}
      style={{ padding:'7px 14px', border:`1px solid ${erpSection===id?'#f97316':bdr}`, borderRadius:20, background: erpSection===id?'rgba(249,115,22,0.1)':'transparent',
        color: erpSection===id?'#f97316':sub, fontSize:12, fontWeight: erpSection===id?700:400, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
      {icon} {label}
    </button>
  );

  const togBtn = (mode, label) => (
    <button onClick={()=>setViewMode(mode)}
      style={{ padding:'7px 14px', border:'none', borderRadius:8, background: viewMode===mode?'#f97316':(dark?'#2d3748':'#f0f0f0'),
        color: viewMode===mode?'#fff':sub, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
      {label}
    </button>
  );

  const LastUpdated = ({data}) => data ? (
    <div style={{fontSize:11,color:sub,marginBottom:16}}>
      Last updated: <strong style={{color:'#f97316'}}>{data.date || fmt(data.submittedAt)}</strong>
      {' '}at {fmtTime(data.submittedAt)} by <strong style={{color:txt}}>{data.submittedBy}</strong>
    </div>
  ) : <div style={{fontSize:12,color:'#ef4444',marginBottom:16}}>⚠ No data submitted yet</div>;

  return (
    <div style={{minHeight:'100vh', background:bg, fontFamily:"'DM Sans',sans-serif"}}>
      {/* Header */}
      <div style={{background:dark?'#1e2235':'#fff', borderBottom:`1px solid ${bdr}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:16, position:'sticky', top:0, zIndex:10}}>
        <button onClick={onBack} style={{background:'transparent',border:`1px solid ${bdr}`,borderRadius:8,padding:'7px 14px',color:sub,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>← Back</button>
        <div style={{flex:1}}>
          <h1 style={{margin:0,fontSize:18,fontWeight:800,color:txt}}>📊 Executive Summary — Unit {unit==='u2'?'2':'1'}</h1>
          <p style={{margin:0,fontSize:11,color:sub}}>{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
        </div>
        <div style={{display:'flex',gap:6}}>
          {togBtn('visual','⬛ Visual')}
          {togBtn('table','☰ Table')}
        </div>
      </div>

      {/* Tabs */}
      <div style={{background:dark?'#1e2235':'#fff', borderBottom:`1px solid ${bdr}`, display:'flex', padding:'0 24px'}}>
        {tabBtn('erp','📋 ERP Data')}
        {tabBtn('stores','🏪 Stores Data')}
      </div>

      <div style={{padding:'20px 24px'}}>
        {/* ── ERP TAB ── */}
        {activeTab==='erp' && (
          <div>
            {/* Section pills */}
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
              {sectionBtn('overview',  'Overview',       '📈')}
              {sectionBtn('rework',    'Rework',         '🔧')}
              {sectionBtn('pdc_running','PDC Running',   '🏭')}
              {sectionBtn('scrap',     'Scrap',          '🗑')}
              {sectionBtn('pallets',   'Pallets',        '📦')}
              {sectionBtn('alloy_wip', 'Alloy WIP',      '⚗️')}
              {sectionBtn('fg_super',  'FG Supermarket', '🏪')}
            </div>

            {/* OVERVIEW */}
            {erpSection==='overview' && (
              <div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:16,marginBottom:24}}>
                  <SummaryCard title="Scrap" icon="🗑" color="#ef4444" dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} data={scrapData}
                    fields={[{l:'Overflow',k:'overflow'},{l:'Rej Components',k:'rejComponents'},{l:'Total Scrap',k:'total',highlight:true},{l:'Total Pallets',k:'totalPallet',highlight:true}]}/>
                  <SummaryCard title="Alloy WIP (KG)" icon="⚗️" color="#8e44ad" dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} data={alloyData}
                    fields={[{l:'U1 All Dept',k:'u1AllDept',tons:true},{l:'U1 Supplier',k:'u1Supplier',tons:true},{l:'FGW',k:'fgw',tons:true},{l:'Overall (KG)',k:'overall',highlight:true}]}/>
                  <PalletSummaryCard dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} data={palletData}/>
                  <ReworkSummaryCard dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} data={reworkData}/>
                </div>
              </div>
            )}

            {/* REWORK */}
            {erpSection==='rework' && (
              <div>
                <LastUpdated data={reworkData}/>
                {!reworkData ? <NoData/> : viewMode==='visual'
                  ? <ReworkVisual data={reworkData} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} onConvert={setConvertModal} isOwner_={userProfile?.role==='owner'}/>
                  : <ReworkTable  data={reworkData} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} history={history[`erp_rework${sfx}`]} onConvert={setConvertModal}/>
                }
              </div>
            )}

            {/* PDC RUNNING */}
            {erpSection==='pdc_running' && (
              <div>
                <LastUpdated data={pdcData}/>
                {!pdcData ? <NoData/> : viewMode==='visual'
                  ? <PDCVisual  data={pdcData} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
                  : <PDCTable   data={pdcData} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
                }
              </div>
            )}

            {/* SCRAP */}
            {erpSection==='scrap' && (
              <div>
                <LastUpdated data={scrapData}/>
                {!scrapData ? <NoData/> : viewMode==='visual'
                  ? <ScrapVisual  data={scrapData} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
                  : <ScrapTable   data={scrapData} history={history[`erp_scrap${sfx}`]} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
                }
              </div>
            )}

            {/* PALLETS */}
            {erpSection==='pallets' && (
              <div>
                <LastUpdated data={palletData}/>
                {!palletData ? <NoData/> : viewMode==='visual'
                  ? <PalletVisual data={palletData} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
                  : <PalletTable  data={palletData} history={history[`erp_pallets${sfx}`]} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
                }
              </div>
            )}

            {/* ALLOY WIP */}
            {erpSection==='alloy_wip' && (
              <div>
                <LastUpdated data={alloyData}/>
                {!alloyData ? <NoData/> : viewMode==='visual'
                  ? <AlloyVisual data={alloyData} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
                  : <AlloyTable  data={alloyData} history={history[`erp_alloy_wip${sfx}`]} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
                }
              </div>
            )}

            {/* FG SUPER */}
            {erpSection==='fg_super' && (
              <div>
                <LastUpdated data={fgData}/>
                {!fgData ? <NoData/> : viewMode==='visual'
                  ? <FGVisual data={fgData} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
                  : <FGTable  data={fgData} history={history[`erp_fg_super${sfx}`]} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
                }
              </div>
            )}
          </div>
        )}

        {/* ── STORES TAB ── */}
        {activeTab==='stores' && (
          <div style={{display:'flex',flexDirection:'column',gap:28}}>

            {/* Alloy Supplier PO */}
            <div>
              <h2 style={{margin:'0 0 10px',fontSize:16,fontWeight:800,color:txt}}>⚗️ Alloy Supplier PO Status</h2>
              <LastUpdated data={alloySupplierData}/>
              {!alloySupplierData ? <NoData/> : <AlloySupplierSummary data={alloySupplierData} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>}
            </div>

            {/* Alloy Delivery Schedule */}
            <div>
              <h2 style={{margin:'0 0 10px',fontSize:16,fontWeight:800,color:txt}}>📅 Alloy Delivery Schedule</h2>
              {alloySchedules.length===0
                ? <NoData/>
                : <AlloyScheduleSummary schedules={alloySchedules} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
              }
            </div>

            {/* Intra Unit Transfers */}
            {intraTransfers.length>0 && (
              <div>
                <h2 style={{margin:'0 0 10px',fontSize:16,fontWeight:800,color:txt}}>🔄 Alloy Intra-Unit Transfers</h2>
                <IntraTransferSummary transfers={intraTransfers} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
              </div>
            )}

            {/* Oil Storage Checklist */}
            <div>
              <h2 style={{margin:'0 0 10px',fontSize:16,fontWeight:800,color:txt}}>📋 Oil Storage Checklist</h2>
              <LastUpdated data={storesData}/>
              {!storesData ? <NoData/> : viewMode==='visual'
                ? <StoresVisual data={storesData} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
                : <StoresTable  data={storesData} history={history[`stores_checklist${sfx}`]} dark={dark} card={card} txt={txt} sub={sub} bdr={bdr}/>
              }
            </div>

          </div>
        )}
      </div>

      {/* Convert rework to task modal */}
      {convertModal&&(
        <ConvertToTaskModal
          item={convertModal}
          unit={unit}
          userProfile={userProfile}
          dark={dark}
          onClose={(success)=>{
            setConvertModal(null);
            if(success){setConvertSuccess(true);setTimeout(()=>setConvertSuccess(false),4000);}
          }}
        />
      )}
      {convertSuccess&&(
        <div style={{position:'fixed',bottom:80,left:'50%',transform:'translateX(-50%)',background:'#16a34a',color:'#fff',borderRadius:10,padding:'12px 24px',fontSize:13,fontWeight:700,zIndex:600,boxShadow:'0 8px 24px rgba(0,0,0,0.3)'}}>
          ✅ Task created successfully!
        </div>
      )}
    </div>
  );
}

// ── Generic helpers ────────────────────────────────────────────────────────────
const NoData = () => <div style={{textAlign:'center',padding:'60px',color:'#94a3b8',fontSize:14}}>📭 No data submitted yet for today.</div>;

function SummaryCard({title,icon,color,data,fields,dark,card,txt,sub,bdr}) {
  return (
    <div style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,overflow:'hidden',boxShadow:`0 2px 10px rgba(0,0,0,${dark?0.3:0.06})`}}>
      <div style={{background:color+'22',borderBottom:`2px solid ${color}`,padding:'12px 16px',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:18}}>{icon}</span>
        <span style={{fontWeight:800,color,fontSize:14}}>{title}</span>
        {data && <span style={{marginLeft:'auto',fontSize:10,color:sub}}>{data.date}</span>}
      </div>
      <div style={{padding:'14px 16px'}}>
        {!data ? <div style={{color:'#ef4444',fontSize:12}}>No data</div>
        : fields.map(f=>(
          <div key={f.k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:`1px solid ${bdr}`}}>
            <span style={{fontSize:12,color:sub}}>{f.l}</span>
            <span style={{fontSize:f.highlight?20:14,fontWeight:f.highlight?800:600,color:f.highlight?color:txt}}>{data[f.k]||'—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PalletSummaryCard({data,dark,card,txt,sub,bdr}) {
  const total = data?.sections?.reduce((a,s)=>a+(parseInt(s.total)||0),0)||0;
  return (
    <div style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,overflow:'hidden'}}>
      <div style={{background:'#16a34a22',borderBottom:'2px solid #16a34a',padding:'12px 16px',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:18}}>📦</span>
        <span style={{fontWeight:800,color:'#16a34a',fontSize:14}}>Pallets</span>
        {data&&<span style={{marginLeft:'auto',fontSize:10,color:sub}}>{data.date}</span>}
      </div>
      <div style={{padding:'14px 16px'}}>
        {!data?<div style={{color:'#ef4444',fontSize:12}}>No data</div>
        : data.sections?.map((s,i)=>(
          <div key={i} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${bdr}`}}>
            <div style={{fontSize:11,fontWeight:700,color:txt,marginBottom:6}}>{s.label}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6}}>
              {[
                {l:'Big',   v:parseInt(s.big)||0,   c:'#8e44ad'},
                {l:'Medium',v:parseInt(s.medium)||0, c:'#3498db'},
                {l:'Small', v:parseInt(s.small)||0,  c:'#27ae60'},
                {l:'Total', v:parseInt(s.total)||0,  c:'#f97316', bold:true},
              ].map(x=>(
                <div key={x.l} style={{textAlign:'center',background:dark?'#151929':'#f8f9fc',borderRadius:8,padding:'6px 4px'}}>
                  <div style={{fontSize:x.bold?18:14,fontWeight:800,color:x.c}}>{x.v}</div>
                  <div style={{fontSize:9,color:sub,marginTop:2}}>{x.l}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',marginTop:2}}>
          <span style={{fontSize:12,color:sub,fontWeight:600}}>Grand Total</span>
          <span style={{fontSize:22,fontWeight:900,color:'#16a34a'}}>{total}</span>
        </div>
      </div>
    </div>
  );
}

function ReworkSummaryCard({data,dark,card,txt,sub,bdr}) {
  const totals = useMemo(()=>{
    if(!data?.departments) return {};
    const map={};
    data.departments.forEach(d=>{
      const qty = d.rows?.reduce((a,r)=>a+(parseInt(r.qty)||0),0)||0;
      if(qty>0) map[d.dept]=qty;
    });
    return map;
  },[data]);
  const grandTotal = Object.values(totals).reduce((a,b)=>a+b,0);
  const DEPT_COLORS = {CNC:'#F39C12',Fettling:'#E67E22',PDC:'#E74C3C',Supplier:'#8E44AD','Shot Blasting':'#3498DB','Final / Hold':'#16A085'};

  return (
    <div style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,overflow:'hidden'}}>
      <div style={{background:'#f39c1222',borderBottom:'2px solid #f39c12',padding:'12px 16px',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:18}}>🔧</span>
        <span style={{fontWeight:800,color:'#f39c12',fontSize:14}}>Rework Summary</span>
        {data&&<span style={{marginLeft:'auto',fontSize:10,color:sub}}>{data.date}</span>}
      </div>
      <div style={{padding:'14px 16px'}}>
        {!data?<div style={{color:'#ef4444',fontSize:12}}>No data</div>
        : Object.entries(totals).map(([dept,qty])=>(
          <div key={dept} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:`1px solid ${bdr}`}}>
            <span style={{fontSize:11,fontWeight:600,color:DEPT_COLORS[dept]||sub}}>{dept}</span>
            <span style={{fontWeight:700,color:txt}}>{qty.toLocaleString()}</span>
          </div>
        ))}
        <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',marginTop:4}}>
          <span style={{fontSize:12,color:sub}}>Grand Total</span>
          <span style={{fontSize:20,fontWeight:800,color:'#f39c12'}}>{grandTotal.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ── REWORK visual + table ──────────────────────────────────────────────────────
const DEPT_COLORS2 = {CNC:'#F39C12',Fettling:'#E67E22',PDC:'#E74C3C',Supplier:'#8E44AD','Shot Blasting':'#3498DB','Final / Hold':'#16A085'};

function ReworkVisual({data,dark,card,txt,sub,bdr,onConvert,isOwner_}) {
  if(!data?.departments) return <NoData/>;
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {data.departments.filter(d=>d.rows?.some(r=>r.partName||r.partNo)).map((dept,di)=>{
        const color = DEPT_COLORS2[dept.dept.split('/')[0].trim()]||'#666';
        const deptTotal = dept.rows?.reduce((a,r)=>a+(parseInt(r.qty)||0),0)||0;
        return (
          <div key={di} style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,overflow:'hidden'}}>
            <div style={{background:color+'22',borderBottom:`2px solid ${color}`,padding:'12px 18px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontWeight:800,color,fontSize:14}}>{dept.dept} Department Rework</span>
              <span style={{background:color,color:'#fff',fontWeight:800,fontSize:14,padding:'3px 12px',borderRadius:20}}>{deptTotal.toLocaleString()} pcs</span>
            </div>
            <div style={{padding:'12px 18px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:10}}>
              {dept.rows?.filter(r=>r.partName||r.partNo).map((r,ri)=>(
                <div key={ri} style={{background:dark?'#151929':'#f8f9fc',borderRadius:10,padding:'10px 14px',border:`1px solid ${bdr}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                    <span style={{fontWeight:700,color,fontSize:13}}>{r.partName||r.partNo}</span>
                    <span style={{fontWeight:800,color:txt,fontSize:18}}>{parseInt(r.qty||0).toLocaleString()}</span>
                  </div>
                  <div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{fontSize:11,fontWeight:700,color:(parseInt(r.daysHeld||r.days_held||0)>7)?'#ef4444':'#f59e0b',background:(parseInt(r.daysHeld||r.days_held||0)>7)?'rgba(239,68,68,0.12)':'rgba(245,158,11,0.12)',padding:'3px 10px',borderRadius:12}}>📅 {r.daysHeld||r.days_held||0} days held</span>
                    {r.reason&&<span style={{fontSize:11,color:'#f59e0b',fontWeight:600}}>⚠ {r.reason}</span>}
                  </div>
                  {onConvert&&isOwner_&&<button onClick={()=>onConvert({partNo:r.partName||r.partNo,qty:r.qty,reason:r.reason,daysHeld:r.daysHeld||r.days_held,dept:dept.dept})} style={{marginTop:8,background:'rgba(249,115,22,0.15)',border:'1px solid #f97316',borderRadius:6,padding:'4px 12px',color:'#f97316',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>🔄 Convert to Task</button>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReworkTable({data,dark,card,txt,sub,bdr,history}) {
  const [showHist, setShowHist] = useState(false);
  const hd = {background:'#1F3864',color:'#fff',padding:'8px 12px',fontSize:11,fontWeight:700,textTransform:'uppercase',textAlign:'left',whiteSpace:'nowrap'};
  const allRows = useMemo(()=>{
    if(!data?.departments) return [];
    return data.departments.flatMap(d=>
      (d.rows||[]).filter(r=>r.partName||r.partNo).map(r=>({...r,dept:d.dept}))
    );
  },[data]);
  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <button onClick={()=>setShowHist(false)} style={{background:!showHist?'#f97316':'transparent',border:`1px solid ${!showHist?'#f97316':bdr}`,borderRadius:8,padding:'6px 14px',color:!showHist?'#fff':sub,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Today</button>
        <button onClick={()=>setShowHist(true)}  style={{background:showHist?'#f97316':'transparent',border:`1px solid ${showHist?'#f97316':bdr}`,borderRadius:8,padding:'6px 14px',color:showHist?'#fff':sub,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>History (7d)</button>
      </div>
      <div style={{overflowX:'auto',background:card,borderRadius:12,border:`1px solid ${bdr}`}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>
            {['Dept','Part Name','Part No','Qty','Reason'].map(h=><th key={h} style={hd}>{h}</th>)}
          </tr></thead>
          <tbody>
            {(showHist
              ? (history||[]).flatMap(rec=>(rec.departments||[]).flatMap(d=>(d.rows||[]).filter(r=>r.partName||r.partNo).map(r=>({...r,dept:d.dept,date:rec.date}))))
              : allRows
            ).map((r,i)=>(
              <tr key={i} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                <td style={{padding:'8px 12px',color:DEPT_COLORS2[r.dept?.split('/')[0].trim()]||sub,fontWeight:700,borderBottom:`1px solid ${bdr}`}}>
                  {r.dept}{r.date?<span style={{color:sub,fontWeight:400,marginLeft:6,fontSize:10}}>({r.date})</span>:''}
                </td>
                <td style={{padding:'8px 12px',color:txt,fontWeight:600,borderBottom:`1px solid ${bdr}`}}>{r.partName}</td>
                <td style={{padding:'8px 12px',color:sub,borderBottom:`1px solid ${bdr}`}}>{r.partNo}</td>
                <td style={{padding:'8px 12px',fontWeight:800,color:'#ef4444',textAlign:'right',borderBottom:`1px solid ${bdr}`}}>{parseInt(r.qty||0).toLocaleString()}</td>
                <td style={{padding:'8px 12px',color:'#ef4444',borderBottom:`1px solid ${bdr}`}}>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── PDC Running ────────────────────────────────────────────────────────────────
function PDCVisual({data,dark,card,txt,sub,bdr}) {
  if(!data?.rows?.length) return <NoData/>;
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
      {data.rows.map((r,i)=>{
        const balance  = (parseInt(r.scheQty)||0)-(parseInt(r.dispatched)||0);
        const wip      = parseInt(r.wipQty)||0;
        const pd       = parseInt(r.perDay)||0;
        const coverage = pd>0?(wip/pd).toFixed(1):'—';  // WIP÷PerDay (matches physical sheet)
        const covNum   = parseFloat(coverage);
        const covColor = isNaN(covNum)?sub:covNum<2?'#ef4444':covNum<3.5?'#f59e0b':'#16a34a';
        return (
          <div key={i} style={{background:card,borderRadius:12,border:`1px solid ${bdr}`,padding:'14px 16px',boxShadow:`0 2px 8px rgba(0,0,0,${dark?0.25:0.05})`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
              <div>
                <div style={{fontSize:11,color:sub,fontWeight:600}}>M/C: {r.mc||'—'}</div>
                <div style={{fontSize:15,fontWeight:800,color:txt}}>{r.part||'—'}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:9,color:sub}}>WIP Coverage</div>
                <div style={{fontSize:22,fontWeight:900,color:covColor}}>{coverage}d</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {[
                {l:'Scheduled',  v:r.scheQty},
                {l:'Dispatched', v:r.dispatched},
                {l:'Balance',    v:balance, bold:true},
                {l:'Per Day',    v:r.perDay},
                {l:'WIP Qty',    v:wip},
              ].map(x=>(
                <div key={x.l} style={{background:dark?'#151929':'#f8f9fc',borderRadius:8,padding:'7px 10px'}}>
                  <div style={{fontSize:9,color:sub,textTransform:'uppercase',marginBottom:2}}>{x.l}</div>
                  <div style={{fontSize:14,fontWeight:x.bold?800:600,color:x.bold?'#f97316':txt}}>{parseInt(x.v||0).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:10,height:5,background:dark?'#2d3748':'#f0f0f0',borderRadius:5}}>
              <div style={{height:'100%',borderRadius:5,background:covColor,width:`${Math.min(100,(covNum/7)*100)}%`,transition:'width 0.5s'}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PDCTable({data,dark,card,txt,sub,bdr}) {
  const hd = {background:'#1F3864',color:'#fff',padding:'8px 12px',fontSize:11,fontWeight:700,textAlign:'center',whiteSpace:'nowrap'};
  return (
    <div style={{overflowX:'auto',background:card,borderRadius:12,border:`1px solid ${bdr}`}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead><tr>{['S.No','M/C No','Running Part','Sche Qty','Dispatched','Balance','Per Day','WIP Qty','Coverage'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
        <tbody>{(data.rows||[]).map((r,i)=>{
          const bal  = (parseInt(r.scheQty)||0)-(parseInt(r.dispatched)||0);
          const wip  = parseInt(r.wipQty)||0;
          const pd   = parseInt(r.perDay)||0;
          const cov  = pd>0?(wip/pd).toFixed(1):'—';
          const covColor = parseFloat(cov)<2?'#ef4444':parseFloat(cov)<3.5?'#f59e0b':'#16a34a';
          return (
            <tr key={i} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
              <td style={{padding:'9px 12px',textAlign:'center',color:sub,borderBottom:`1px solid ${bdr}`}}>{i+1}</td>
              {/* M/C and Part as text */}
              <td style={{padding:'9px 12px',textAlign:'center',fontWeight:700,color:txt,borderBottom:`1px solid ${bdr}`}}>{r.mc||'—'}</td>
              <td style={{padding:'9px 12px',textAlign:'left',fontWeight:600,color:txt,borderBottom:`1px solid ${bdr}`}}>{r.part||'—'}</td>
              {/* Numeric columns */}
              {[r.scheQty,r.dispatched,bal,r.perDay,wip].map((v,j)=>(
                <td key={j} style={{padding:'9px 12px',textAlign:'center',color:j===2?'#f97316':txt,fontWeight:j===2?800:500,borderBottom:`1px solid ${bdr}`}}>
                  {parseInt(v||0).toLocaleString()}
                </td>
              ))}
              <td style={{padding:'9px 12px',textAlign:'center',fontWeight:800,color:covColor,borderBottom:`1px solid ${bdr}`}}>{cov}d</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

// ── Scrap ──────────────────────────────────────────────────────────────────────
function ScrapVisual({data,dark,card,txt,sub,bdr}) {
  const items=[{l:'OVERFLOW',v:data.overflow,c:'#ef4444'},{l:'REJ COMPONENTS',v:data.rejComponents,c:'#f97316'},{l:'TOTAL SCRAP',v:data.total,c:'#dc2626',big:true}];
  const pallets=[{l:'BIG PALLET',v:data.bigPallet,c:'#8e44ad'},{l:'MEDIUM PALLET',v:data.mediumPallet,c:'#3498db'},{l:'SMALL PALLET',v:data.smallPallet,c:'#27ae60'},{l:'TOTAL PALLETS',v:data.totalPallet,c:'#2c3e50',big:true}];
  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
      <div style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,overflow:'hidden'}}>
        <div style={{background:'#dc262622',borderBottom:'2px solid #dc2626',padding:'10px 16px',fontWeight:800,color:'#dc2626',fontSize:13}}>🗑 Scrap Details</div>
        <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
          {items.map(x=>(
            <div key={x.l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',background:dark?'#151929':'#f8f9fc',borderRadius:10,border:`1px solid ${bdr}`}}>
              <span style={{fontSize:12,color:sub,fontWeight:600}}>{x.l}</span>
              <span style={{fontSize:x.big?28:18,fontWeight:800,color:x.c}}>{parseInt(x.v||0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,overflow:'hidden'}}>
        <div style={{background:'#8e44ad22',borderBottom:'2px solid #8e44ad',padding:'10px 16px',fontWeight:800,color:'#8e44ad',fontSize:13}}>📦 Pallet Details</div>
        <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
          {pallets.map(x=>(
            <div key={x.l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',background:dark?'#151929':'#f8f9fc',borderRadius:10,border:`1px solid ${bdr}`}}>
              <span style={{fontSize:12,color:sub,fontWeight:600}}>{x.l}</span>
              <span style={{fontSize:x.big?28:18,fontWeight:800,color:x.c}}>{parseInt(x.v||0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScrapTable({data,history,dark,card,txt,sub,bdr}) {
  const hd={background:'#1F3864',color:'#fff',padding:'8px 14px',fontSize:11,fontWeight:700,textAlign:'left'};
  return (
    <div style={{overflowX:'auto',background:card,borderRadius:12,border:`1px solid ${bdr}`}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
        <thead><tr>{['Date','Overflow','Rej Components','Total Scrap','Big Pallet','Medium Pallet','Small Pallet','Total Pallets','Submitted By'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
        <tbody>{(history||[data]).filter(Boolean).map((r,i)=>(
          <tr key={i} style={{background:i===0?(dark?'rgba(249,115,22,0.08)':'#fffbeb'):(i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc'))}}>
            {[r.date,r.overflow,r.rejComponents,r.total,r.bigPallet,r.mediumPallet,r.smallPallet,r.totalPallet,r.submittedBy].map((v,j)=>(
              <td key={j} style={{padding:'9px 14px',color:j===3||j===7?'#ef4444':txt,fontWeight:j===3||j===7?800:500,borderBottom:`1px solid ${bdr}`}}>{v||'—'}</td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ── Pallets ────────────────────────────────────────────────────────────────────
function PalletVisual({data,dark,card,txt,sub,bdr}) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
      {(data.sections||[]).map((s,i)=>{
        const colors=['#16a34a','#3498db','#8e44ad','#f97316','#e74c3c'];
        const c = colors[i%colors.length];
        return (
          <div key={i} style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,overflow:'hidden'}}>
            <div style={{background:c+'22',borderBottom:`2px solid ${c}`,padding:'10px 16px',fontWeight:800,color:c,fontSize:13}}>{s.label}</div>
            <div style={{padding:'14px 16px'}}>
              {[{l:'Big Pallets',v:s.big},{l:'Medium Pallets',v:s.medium},{l:'Small Pallets',v:s.small}].map(x=>(
                <div key={x.l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:`1px solid ${bdr}`}}>
                  <span style={{fontSize:12,color:sub}}>{x.l}</span>
                  <span style={{fontWeight:700,color:txt,fontSize:15}}>{parseInt(x.v||0)}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',marginTop:4}}>
                <span style={{fontSize:13,color:sub,fontWeight:600}}>TOTAL</span>
                <span style={{fontSize:24,fontWeight:900,color:c}}>{s.total}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PalletTable({data,history,dark,card,txt,sub,bdr}) {
  const hd={background:'#1F3864',color:'#fff',padding:'8px 14px',fontSize:11,fontWeight:700};
  return (
    <div style={{overflowX:'auto',background:card,borderRadius:12,border:`1px solid ${bdr}`}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead><tr>{['Date','Section','Big','Medium','Small','Total','Submitted By'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
        <tbody>{(history||[data]).filter(Boolean).flatMap((rec,ri)=>
          (rec.sections||[]).map((s,si)=>(
            <tr key={`${ri}-${si}`} style={{background:ri===0?(dark?'rgba(249,115,22,0.08)':'#fffbeb'):(ri%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc'))}}>
              <td style={{padding:'8px 12px',color:sub,borderBottom:`1px solid ${bdr}`}}>{si===0?rec.date:''}</td>
              <td style={{padding:'8px 12px',fontWeight:700,color:txt,borderBottom:`1px solid ${bdr}`}}>{s.label}</td>
              {[s.big,s.medium,s.small,s.total].map((v,i)=><td key={i} style={{padding:'8px 12px',textAlign:'center',fontWeight:i===3?800:500,color:i===3?'#16a34a':txt,borderBottom:`1px solid ${bdr}`}}>{v||0}</td>)}
              <td style={{padding:'8px 12px',color:sub,borderBottom:`1px solid ${bdr}`}}>{si===0?rec.submittedBy:''}</td>
            </tr>
          ))
        )}</tbody>
      </table>
    </div>
  );
}

// ── Alloy WIP ──────────────────────────────────────────────────────────────────
function AlloyVisual({data,dark,card,txt,sub,bdr}) {
  const rows=[{l:'U1 ALL DEPT',k:'u1AllDept',c:'#e74c3c'},{l:'U1 SUPPLIER',k:'u1Supplier',c:'#e67e22'},{l:'FGW',k:'fgw',c:'#f39c12'},{l:'U2 ALL DEPT',k:'u2AllDept',c:'#3498db'},{l:'U2 SUPPLIER',k:'u2Supplier',c:'#8e44ad'}];
  const overall = parseFloat(data.overall)||0;
  return (
    <div style={{maxWidth:600}}>
      <div style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,overflow:'hidden'}}>
        <div style={{background:'#1F3864',padding:'12px 18px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{color:'#fff',fontWeight:800,fontSize:14}}>ALL DEPT WIP — KG & TONS</span>
          <span style={{color:'rgba(255,255,255,0.7)',fontSize:12}}>{data.date}</span>
        </div>
        <div style={{padding:'16px 18px',display:'flex',flexDirection:'column',gap:10}}>
          {rows.map(r=>{
            const val = parseFloat(data[r.k])||0;
            const tons = (val/1000).toFixed(2);
            const pct = overall>0?val/overall*100:0;
            return (
              <div key={r.k}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,alignItems:'baseline'}}>
                  <span style={{fontSize:13,color:sub,fontWeight:600}}>{r.l}</span>
                  <div style={{textAlign:'right'}}>
                    <span style={{fontSize:16,fontWeight:800,color:r.c}}>{val.toLocaleString()} KG</span>
                    <span style={{fontSize:12,color:sub,marginLeft:8}}>({tons} T)</span>
                  </div>
                </div>
                <div style={{height:7,background:dark?'#2d3748':'#f0f0f0',borderRadius:8}}>
                  <div style={{height:'100%',borderRadius:8,background:r.c,width:`${pct}%`,transition:'width 0.5s'}}/>
                </div>
              </div>
            );
          })}
          <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderTop:`2px solid ${bdr}`,marginTop:4,alignItems:'baseline'}}>
            <span style={{fontSize:14,color:sub,fontWeight:700}}>OVER ALL</span>
            <div style={{textAlign:'right'}}>
              <span style={{fontSize:26,fontWeight:900,color:'#d97706'}}>{overall.toLocaleString()} KG</span>
              <span style={{fontSize:14,color:'#d97706',marginLeft:10,fontWeight:700}}>({(overall/1000).toFixed(2)} T)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlloyTable({data,history,dark,card,txt,sub,bdr}) {
  const hd={background:'#1F3864',color:'#fff',padding:'8px 14px',fontSize:11,fontWeight:700};
  return (
    <div style={{overflowX:'auto',background:card,borderRadius:12,border:`1px solid ${bdr}`}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead><tr>{['Date','U1 All Dept','U1 Supplier','FGW','U2 All Dept','U2 Supplier','Overall','By'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
        <tbody>{(history||[data]).filter(Boolean).map((r,i)=>(
          <tr key={i} style={{background:i===0?(dark?'rgba(249,115,22,0.08)':'#fffbeb'):(i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc'))}}>
            {[r.date,r.u1AllDept,r.u1Supplier,r.fgw,r.u2AllDept,r.u2Supplier,r.overall,r.submittedBy].map((v,j)=>(
              <td key={j} style={{padding:'9px 14px',fontWeight:j===6?800:500,color:j===6?'#d97706':txt,borderBottom:`1px solid ${bdr}`}}>{v||'—'}</td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ── FG Supermarket ─────────────────────────────────────────────────────────────
function FGVisual({data,dark,card,txt,sub,bdr}) {
  return (
    <div style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,overflow:'hidden'}}>
      <div style={{background:'#1F3864',padding:'10px 18px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{color:'#fff',fontWeight:800}}>FG Supermarket</span>
        <span style={{color:'rgba(255,255,255,0.7)',fontSize:12}}>Total: <strong>{parseFloat(data.totalKg||0).toFixed(3)} KG</strong></span>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>{['Warehouse','Item Code','Description','Stock','In KG'].map(h=><th key={h} style={{background:'#2F5496',color:'#fff',padding:'8px 12px',textAlign:'left',fontSize:11,fontWeight:700}}>{h}</th>)}</tr></thead>
          <tbody>{(data.rows||[]).map((r,i)=>(
            <tr key={i} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
              <td style={{padding:'8px 12px',color:sub,borderBottom:`1px solid ${bdr}`}}>{r.warehouse}</td>
              <td style={{padding:'8px 12px',fontWeight:600,color:txt,borderBottom:`1px solid ${bdr}`}}>{r.itemCode}</td>
              <td style={{padding:'8px 12px',color:txt,borderBottom:`1px solid ${bdr}`}}>{r.description}</td>
              <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:txt,borderBottom:`1px solid ${bdr}`}}>{parseInt(r.stock||0).toLocaleString()}</td>
              <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:'#16a34a',borderBottom:`1px solid ${bdr}`}}>{parseFloat(r.inKg||0).toFixed(3)}</td>
            </tr>
          ))}
          <tr style={{background:dark?'#2d2005':'#fffbeb'}}>
            <td colSpan={4} style={{padding:'10px 12px',fontWeight:800,color:'#d97706',textAlign:'right',borderTop:`2px solid ${bdr}`}}>TOTAL KG</td>
            <td style={{padding:'10px 12px',fontWeight:900,color:'#d97706',fontSize:16,textAlign:'right',borderTop:`2px solid ${bdr}`}}>{parseFloat(data.totalKg||0).toFixed(3)}</td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FGTable({data,history,dark,card,txt,sub,bdr}) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {(history||[data]).filter(Boolean).map((rec,ri)=>(
        <div key={ri} style={{background:card,borderRadius:12,border:`1px solid ${bdr}`,overflow:'hidden'}}>
          <div style={{background:ri===0?'rgba(249,115,22,0.15)':'rgba(0,0,0,0.05)',padding:'8px 14px',display:'flex',justifyContent:'space-between',fontSize:12}}>
            <span style={{fontWeight:700,color:ri===0?'#f97316':txt}}>{rec.date} {ri===0?'(Latest)':''}</span>
            <span style={{color:sub}}>By {rec.submittedBy} · Total: <strong>{parseFloat(rec.totalKg||0).toFixed(3)} KG</strong></span>
          </div>
          <FGVisual data={rec} dark={dark} card={dark?'#1a1e30':'#f8f9fc'} txt={txt} sub={sub} bdr={bdr}/>
        </div>
      ))}
    </div>
  );
}

// ── Stores Visual + Table ──────────────────────────────────────────────────────
const STORES_SECTIONS = [
  {title:'OILS',            ids:[1,2,3,4],   color:'#2980b9'},
  {title:'ALLOY INGOTS',    ids:[5,6],       color:'#8e44ad'},
  {title:'ALLOY SCRAP',     ids:[7,8],       color:'#e74c3c'},
  {title:'FUEL',            ids:[9,10],      color:'#e67e22'},
  {title:'N2 CYLINDERS',    ids:[11,12,13],  color:'#27ae60'},
];

function StoresVisual({data,dark,card,txt,sub,bdr}) {
  const items = data.items || [];
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:16}}>
      {STORES_SECTIONS.map(sec=>{
        const secItems = items.filter(x=>sec.ids.includes(x.id)&&x.value);
        return (
          <div key={sec.title} style={{background:card,borderRadius:14,border:`1px solid ${bdr}`,overflow:'hidden'}}>
            <div style={{background:sec.color+'22',borderBottom:`2px solid ${sec.color}`,padding:'10px 16px',fontWeight:800,color:sec.color,fontSize:13}}>{sec.title}</div>
            <div style={{padding:'12px 16px'}}>
              {secItems.length===0 ? <div style={{color:sub,fontSize:12}}>No data entered</div>
              : secItems.map(item=>(
                <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${bdr}`}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:txt}}>{item.description}</div>
                    {item.note&&<div style={{fontSize:10,color:sub,marginTop:2}}>{item.note}</div>}
                  </div>
                  <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
                    <span style={{fontSize:18,fontWeight:800,color:sec.color}}>{item.value}</span>
                    <span style={{fontSize:11,color:sub,marginLeft:4}}>{item.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StoresTable({data,history,dark,card,txt,sub,bdr}) {
  const [showHist,setShowHist]=useState(false);
  const hd={background:'#1F3864',color:'#fff',padding:'8px 12px',fontSize:11,fontWeight:700,whiteSpace:'nowrap'};
  const records = showHist ? (history||[]) : [data].filter(Boolean);
  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <button onClick={()=>setShowHist(false)} style={{background:!showHist?'#f97316':'transparent',border:`1px solid ${!showHist?'#f97316':bdr}`,borderRadius:8,padding:'6px 14px',color:!showHist?'#fff':sub,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Today</button>
        <button onClick={()=>setShowHist(true)}  style={{background:showHist?'#f97316':'transparent',border:`1px solid ${showHist?'#f97316':bdr}`,borderRadius:8,padding:'6px 14px',color:showHist?'#fff':sub,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>History (7d)</button>
      </div>
      <div style={{overflowX:'auto',background:card,borderRadius:12,border:`1px solid ${bdr}`}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>
            <th style={hd}>Date</th>
            <th style={hd}>Item</th>
            <th style={hd}>Qty</th>
            <th style={hd}>Unit</th>
            <th style={hd}>Notes</th>
            <th style={hd}>By</th>
          </tr></thead>
          <tbody>{records.flatMap((rec,ri)=>
            (rec.items||[]).filter(x=>x.value).map((item,ii)=>(
              <tr key={`${ri}-${ii}`} style={{background:ri===0?(dark?'rgba(249,115,22,0.06)':'#fffefb'):(ri%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc'))}}>
                <td style={{padding:'7px 12px',color:sub,fontSize:11,borderBottom:`1px solid ${bdr}`}}>{ii===0?rec.date:''}</td>
                <td style={{padding:'7px 12px',fontWeight:600,color:txt,borderBottom:`1px solid ${bdr}`}}>{item.description}</td>
                <td style={{padding:'7px 12px',fontWeight:800,color:'#2980b9',textAlign:'right',borderBottom:`1px solid ${bdr}`}}>{item.value}</td>
                <td style={{padding:'7px 12px',color:sub,borderBottom:`1px solid ${bdr}`}}>{item.unit}</td>
                <td style={{padding:'7px 12px',color:sub,borderBottom:`1px solid ${bdr}`}}>{item.note||'—'}</td>
                <td style={{padding:'7px 12px',color:sub,fontSize:11,borderBottom:`1px solid ${bdr}`}}>{ii===0?rec.submittedBy:''}</td>
              </tr>
            ))
          )}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── Alloy Supplier Summary ─────────────────────────────────────────────────────
function AlloySupplierSummary({data,dark,card,txt,sub,bdr}) {
  if (!data?.suppliers?.length) return <div style={{color:sub,fontSize:13}}>No supplier data submitted yet.</div>;

  const totalPO  = data.suppliers.reduce((a,s)=>a+(parseFloat(s.totalPO)||0),0);
  const totalRec = data.suppliers.reduce((a,s)=>a+(parseFloat(s.received)||0),0);
  const totalBal = data.suppliers.reduce((a,s)=>a+(parseFloat(s.balance)||0),0);
  const overallPct = totalPO>0?Math.round(totalRec/totalPO*100):0;

  return (
    <div>
      {/* KPI strip */}
      <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        {[
          {l:'Total PO',    v:`${totalPO} T`,   c:'#4f46e5', bg:dark?'#1e1b4b':'#eef2ff'},
          {l:'Received',    v:`${totalRec} T`,  c:'#16a34a', bg:dark?'#052d14':'#f0fdf4'},
          {l:'Balance Due', v:`${totalBal} T`,  c:'#dc2626', bg:dark?'#2d1515':'#fef2f2'},
          {l:'% Received',  v:`${overallPct}%`, c:'#d97706', bg:dark?'#2d2005':'#fffbeb'},
        ].map(k=>(

          <div key={k.l} style={{flex:'1 1 100px',borderRadius:12,padding:'12px 16px',background:k.bg,minWidth:100}}>
            <div style={{fontSize:22,fontWeight:800,color:k.c}}>{k.v}</div>
            <div style={{fontSize:10,color:sub,marginTop:3,fontWeight:600,textTransform:'uppercase'}}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Supplier cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12}}>
        {data.suppliers.map((s,i)=>{
          const bal = parseFloat(s.balance)||0;
          const rec = parseFloat(s.received)||0;
          const tot = parseFloat(s.totalPO)||0;
          const pct = tot>0?Math.round(rec/tot*100):0;
          return (
            <div key={i} style={{background:card,borderRadius:12,border:`1px solid ${bdr}`,overflow:'hidden',boxShadow:`0 2px 8px rgba(0,0,0,${dark?0.25:0.06})`}}>
              <div style={{background: bal>0?'#dc262222':'#16a34a22', borderBottom:`2px solid ${bal>0?'#dc2626':'#16a34a'}`, padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:800,color:txt,fontSize:14}}>{s.name}</div>
                  {s.type&&<div style={{fontSize:11,color:sub,marginTop:1}}>{s.type}</div>}
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:sub}}>Balance</div>
                  <div style={{fontSize:20,fontWeight:900,color:bal>0?'#dc2626':'#16a34a'}}>{bal} T</div>
                </div>
              </div>
              <div style={{padding:'12px 14px'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
                  <div style={{background:dark?'#151929':'#f8f9fc',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
                    <div style={{fontSize:16,fontWeight:800,color:txt}}>{tot} T</div>
                    <div style={{fontSize:10,color:sub,marginTop:2}}>Total PO</div>
                  </div>
                  <div style={{background:dark?'#052d14':'#f0fdf4',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
                    <div style={{fontSize:16,fontWeight:800,color:'#16a34a'}}>{rec} T</div>
                    <div style={{fontSize:10,color:sub,marginTop:2}}>Received</div>
                  </div>
                  <div style={{background:dark?'#2d1a05':'#fff7ed',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
                    <div style={{fontSize:14,fontWeight:800,color:'#f97316'}}>{s.poPrice?`₹${s.poPrice}`:'—'}</div>
                    <div style={{fontSize:10,color:sub,marginTop:2}}>₹ / KG</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{height:6,background:dark?'#2d3748':'#f0f0f0',borderRadius:6}}>
                  <div style={{height:'100%',borderRadius:6,background:pct===100?'#16a34a':pct>60?'#f59e0b':'#ef4444',width:`${pct}%`,transition:'width 0.5s'}}/>
                </div>
                <div style={{fontSize:10,color:sub,marginTop:3,textAlign:'right'}}>{pct}% received</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── Convert Rework to Task Modal ───────────────────────────────────────────────
export function ConvertToTaskModal({item, unit, onClose, dark, userProfile}) {
  // All departments with correct heads from orgData
  const DEPT_OPTIONS = [
    {id:'cnc_vmc',   label:'CNC / VMC',       head:'Eswaran',     headId:'eswaran'},
    {id:'fettling',  label:'Fettling',         head:'Nagaraj',     headId:'nagaraj'},
    {id:'pdc',       label:'PDC',              head:'Prabhakaran', headId:'prabha'},
    {id:'secondary', label:'Secondary',        head:'Udaykumar',   headId:'udaykumar'},
    {id:'supplier',  label:'Supplier / Ext',   head:'Pradeep',     headId:'owner'},
    {id:'shotblast', label:'Shot Blasting',    head:'Prabhakaran', headId:'prabha'},
    {id:'final',     label:'Final / Hold',     head:'Pachayappan', headId:'pachayappan'},
    {id:'assembly',  label:'Assembly',         head:'Vignesh',     headId:'vignesh'},
    {id:'dispatch',  label:'Dispatch',         head:'Mangundu',    headId:'mangundu'},
    {id:'stores',    label:'Stores',           head:'Agilan',      headId:'agilan'},
    {id:'toolroom',  label:'Toolroom',         head:'Munusamy',    headId:'munusamy'},
    {id:'pdc_maint', label:'PDC Maintenance',  head:'Mahendhiran', headId:'mahendhiran'},
    {id:'maintenance',label:'Maintenance',     head:'Murugesh',    headId:'murugesh'},
    {id:'npd',       label:'NPD / Quality',    head:'Basha',       headId:'basha'},
  ];

  // Auto-detect dept from item.dept
  const autoMatch = DEPT_OPTIONS.find(d=>
    d.id === item.dept ||
    d.label.toLowerCase().includes((item.dept||'').toLowerCase()) ||
    (item.dept||'').toLowerCase().includes(d.id.toLowerCase())
  );

  const [dept, setDept] = useState(autoMatch?.id || 'fettling');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedDept = DEPT_OPTIONS.find(d=>d.id===dept);

  const bg  = dark?'#111827':'#fff';
  const txt = dark?'#e2e8f0':'#1a1a2e';
  const sub = dark?'#94a3b8':'#666';
  const bdr = dark?'#2d3748':'#e8e8e8';
  const inp = {border:`1.5px solid ${bdr}`,borderRadius:8,padding:'9px 12px',fontSize:13,outline:'none',fontFamily:'inherit',background:dark?'#151929':'#fff',color:txt,width:'100%',boxSizing:'border-box'};

  async function convert() {
    if (!dueDate) return alert('Target closure date is required');
    setSaving(true);
    try {
      const colName = unit==='u2'?'tasks_u2':'tasks';
      await addDoc(collection(db, colName), {
        description: `REWORK — ${item.partNo||item.partName}: ${item.reason} (${item.qty} pcs · ${item.daysHeld||0} days held)`,
        assignedToDept: dept,
        assignedToPersonName: selectedDept?.head||'',
        assignedPersonId: selectedDept?.headId||'',
        raisedByName: userProfile?.name||'ERP',
        raisedByDept: 'erp',
        raisedById: userProfile?.id||'erp',
        priority: parseInt(item.daysHeld||0)>7 ? 'Critical' : 'High',
        status: 'Open',
        dueDate: dueDate,
        unit: unit||'u1',
        partNumber: item.partNo||item.partName,
        remarks: `Rework: ${item.qty} pcs · Days held: ${item.daysHeld||0} · Reason: ${item.reason}`,
        reworkRef: true,
        reworkQty: parseInt(item.qty)||0,
        reworkDaysHeld: parseInt(item.daysHeld)||0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        pendingApproval: false,
      });
      onClose(true);
    } catch(e) { alert('Failed: '+e.message); }
    finally { setSaving(false); }
  }

  const daysHeldNum = parseInt(item.daysHeld||0);

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>e.target===e.currentTarget&&onClose(false)}>
      <div style={{background:bg,borderRadius:16,width:'100%',maxWidth:500,overflow:'hidden',boxShadow:'0 25px 60px rgba(0,0,0,0.4)'}}>
        <div style={{background:'#1F3864',padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{color:'#fff',fontWeight:800,fontSize:15}}>🔄 Convert Rework to Task</div>
            <div style={{color:'rgba(255,255,255,0.6)',fontSize:11,marginTop:2}}>{item.partNo||item.partName} · {item.qty} pcs</div>
          </div>
          <button onClick={()=>onClose(false)} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:8,color:'#fff',fontSize:16,cursor:'pointer',padding:'4px 10px'}}>✕</button>
        </div>
        <div style={{padding:'20px'}}>
          {/* Rework info */}
          <div style={{background:dark?'#2d1515':'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'12px 16px',marginBottom:16,display:'flex',gap:16,flexWrap:'wrap'}}>
            <div><div style={{fontSize:10,color:sub,fontWeight:700,textTransform:'uppercase'}}>Part</div><div style={{fontWeight:800,color:txt}}>{item.partNo||item.partName}</div></div>
            <div><div style={{fontSize:10,color:sub,fontWeight:700,textTransform:'uppercase'}}>Qty</div><div style={{fontWeight:800,color:'#f97316'}}>{item.qty} pcs</div></div>
            <div><div style={{fontSize:10,color:sub,fontWeight:700,textTransform:'uppercase'}}>Days Held</div><div style={{fontWeight:800,color:daysHeldNum>7?'#ef4444':'#f59e0b'}}>{daysHeldNum} days {daysHeldNum>7?'⚠️':''}</div></div>
            <div style={{flex:1}}><div style={{fontSize:10,color:sub,fontWeight:700,textTransform:'uppercase'}}>Reason</div><div style={{fontWeight:600,color:'#f59e0b',fontSize:12}}>{item.reason}</div></div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {/* Department selector */}
            <div>
              <label style={{fontSize:11,fontWeight:700,color:sub,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:4,display:'block'}}>Assign to Department *</label>
              <select style={{...inp,cursor:'pointer'}} value={dept} onChange={e=>setDept(e.target.value)}>
                {DEPT_OPTIONS.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>

            {/* Auto-assigned dept head */}
            {selectedDept&&(
              <div style={{background:dark?'#1e2540':'#eff6ff',borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:32,height:32,borderRadius:8,background:'#3b82f6',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:13,flexShrink:0}}>
                  {selectedDept.head[0]}
                </div>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:txt}}>Auto-assigned to: <strong style={{color:'#3b82f6'}}>{selectedDept.head}</strong></div>
                  <div style={{fontSize:11,color:sub}}>{selectedDept.label} Department Head</div>
                </div>
                <span style={{marginLeft:'auto',background:'#dbeafe',color:'#1d4ed8',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:12}}>Auto</span>
              </div>
            )}

            {/* Target date */}
            <div>
              <label style={{fontSize:11,fontWeight:700,color:sub,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:4,display:'block'}}>Target Rework Completion Date *</label>
              <input style={inp} type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}
                min={new Date().toISOString().slice(0,10)}/>
              {daysHeldNum>0&&!dueDate&&<div style={{fontSize:11,color:'#f59e0b',marginTop:4}}>⚠ Already held {daysHeldNum} days — set an urgent target date</div>}
            </div>
          </div>

          <div style={{display:'flex',gap:10,marginTop:20}}>
            <button onClick={()=>onClose(false)} style={{flex:1,background:dark?'#2d3748':'#f0f0f0',border:'none',borderRadius:10,padding:'11px',color:sub,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
            <button onClick={convert} disabled={saving||!dueDate} style={{flex:2,background:saving||!dueDate?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:10,padding:'11px',color:'#fff',fontSize:13,fontWeight:700,cursor:saving||!dueDate?'not-allowed':'pointer',fontFamily:'inherit'}}>
              {saving?'⏳ Creating Task...':'✅ Convert to Task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ALLOY SCHEDULE SUMMARY ────────────────────────────────────────────────────
function AlloyScheduleSummary({ schedules, dark, card, txt, sub, bdr }) {
  const [showCompleted, setShowCompleted] = React.useState(false);
  const today = new Date().toISOString().slice(0,10);
  const totalTons = schedules.reduce((a,s)=>a+(parseFloat(s.totalTons)||0),0);
  const totalDelivered = schedules.reduce((a,s)=>a+(s.deliveries||[]).reduce((b,d)=>b+(parseFloat(d.tons)||0),0),0);

  // All deliveries flat — sorted by date
  const allDeliveries = [];
  schedules.forEach(s=>{
    (s.deliveries||[]).forEach(d=>{
      allDeliveries.push({...d, supplier:s.supplier, grade:s.grade, ratePerKg:s.ratePerKg||s.totalPO||'—'});
    });
  });
  allDeliveries.sort((a,b)=>a.date.localeCompare(b.date));

  const upcoming = allDeliveries.filter(d=>d.date>today);
  const u1Total  = allDeliveries.filter(d=>d.unit==='u1').reduce((a,d)=>a+(parseFloat(d.tons)||0),0);
  const u2Total  = allDeliveries.filter(d=>d.unit==='u2').reduce((a,d)=>a+(parseFloat(d.tons)||0),0);

  return (
    <div>
      {/* KPI cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:16}}>
        {[
          {l:'Total POs',       v:schedules.length,              c:'#1e40af'},
          {l:'Total Tons (PO)', v:`${totalTons.toFixed(1)}T`,    c:'#374151'},
          {l:'Total Delivered', v:`${totalDelivered.toFixed(1)}T`, c:'#15803d'},
          {l:'Unit 1',          v:`${u1Total.toFixed(1)}T`,      c:'#7c3aed'},
          {l:'Unit 2',          v:`${u2Total.toFixed(1)}T`,      c:'#ea580c'},
        ].map(k=>(
          <div key={k.l} style={{background:card,borderRadius:10,padding:'10px 12px',border:`1px solid ${bdr}`}}>
            <div style={{fontSize:20,fontWeight:900,color:k.c}}>{k.v}</div>
            <div style={{fontSize:10,color:sub,marginTop:2}}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Per-supplier detail with all delivery dates */}
      {/* Filter toggle */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:11,color:sub}}>
          {showCompleted?`All ${schedules.length} POs`:`${schedules.filter(s=>(s.deliveries||[]).reduce((a,d)=>a+(parseFloat(d.tons)||0),0)<(parseFloat(s.totalTons)||1)).length} active POs`}
        </div>
        <button onClick={()=>setShowCompleted(v=>!v)}
          style={{padding:'4px 12px',borderRadius:7,border:`1px solid ${bdr}`,background:'transparent',
            color:showCompleted?'#f97316':sub,fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
          {showCompleted?'Hide Completed':'Show Completed'}
        </button>
      </div>
      {schedules.map((s,si)=>{
        const delivered = (s.deliveries||[]).reduce((a,d)=>a+(parseFloat(d.tons)||0),0);
        const pending   = Math.max(0,(s.totalTons||0)-delivered);
        const pct       = s.totalTons>0?Math.round((delivered/s.totalTons)*100):0;
        if (!showCompleted && pct>=100) return null;
        const sortedDel = [...(s.deliveries||[])].sort((a,b)=>a.date.localeCompare(b.date));

        return (
          <div key={s.id} style={{background:card,borderRadius:12,border:`1.5px solid ${pct>=100?'#86efac':bdr}`,padding:'14px 16px',marginBottom:12}}>
            {/* Supplier header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10,flexWrap:'wrap',gap:6}}>
              <div>
                <div style={{fontWeight:900,fontSize:15,color:txt}}>{s.supplier} — {s.grade}</div>
                <div style={{fontSize:11,color:sub,marginTop:2}}>
                  {s.unit==='both'?'Unit 1 & 2':s.unit==='u2'?'Unit 2':'Unit 1'} · ₹{s.ratePerKg||'—'}/kg · {s.submittedBy||'Stores'}
                </div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{background:'#eff6ff',color:'#1e40af',borderRadius:8,padding:'3px 10px',fontWeight:800,fontSize:12}}>{s.totalTons}T PO</span>
                <span style={{background:pct>=100?'#f0fdf4':'#fff7ed',color:pct>=100?'#15803d':'#b45309',borderRadius:8,padding:'3px 10px',fontWeight:800,fontSize:12}}>
                  {pct>=100?'✅ Complete':`${pct}% done`}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:sub,marginBottom:3}}>
                <span>Delivered: {delivered.toFixed(1)}T / {s.totalTons}T</span>
                {pending>0&&<span style={{color:'#ea580c',fontWeight:700}}>Pending: {pending.toFixed(1)}T</span>}
              </div>
              <div style={{background:dark?'#2d3748':'#e5e7eb',borderRadius:5,height:8,overflow:'hidden'}}>
                <div style={{width:`${Math.min(pct,100)}%`,height:'100%',background:pct>=100?'#16a34a':'#f97316',borderRadius:5}}/>
              </div>
            </div>

            {/* Date-wise delivery table */}
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead>
                  <tr style={{background:dark?'#2d3748':'#f3f4f6'}}>
                    {['Date','Tons','Unit','Status'].map(h=>(
                      <th key={h} style={{padding:'5px 8px',textAlign:h==='Date'?'left':'center',fontWeight:700,color:sub,fontSize:10}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedDel.map((d,i)=>{
                    const isPast = d.date<=today;
                    const isToday = d.date===today;
                    return (
                      <tr key={i} style={{background:isToday?(dark?'#1a2744':'#eff6ff'):i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f9fafb')}}>
                        <td style={{padding:'5px 8px',fontWeight:700,color:isToday?'#1e40af':txt}}>
                          {d.date}
                          {isToday&&<span style={{marginLeft:6,fontSize:9,background:'#1e40af',color:'#fff',borderRadius:4,padding:'1px 5px'}}>TODAY</span>}
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:txt}}>{d.tons}T</td>
                        <td style={{padding:'5px 8px',textAlign:'center',color:d.unit==='u2'?'#7c3aed':'#1e40af',fontWeight:600}}>Unit {d.unit==='u2'?'2':'1'}</td>
                        <td style={{padding:'5px 8px',textAlign:'center'}}>
                          {isPast
                            ? <span style={{background:'#f0fdf4',color:'#15803d',borderRadius:5,padding:'2px 7px',fontSize:10,fontWeight:700}}>✅ Delivered</span>
                            : <span style={{background:'#fff7ed',color:'#b45309',borderRadius:5,padding:'2px 7px',fontSize:10,fontWeight:700}}>⏳ Pending</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:'#1F3864'}}>
                    <td style={{padding:'5px 8px',color:'#fff',fontWeight:800,fontSize:11}}>TOTAL</td>
                    <td style={{padding:'5px 8px',textAlign:'center',color:'#4ade80',fontWeight:800}}>{delivered.toFixed(1)}T</td>
                    <td style={{padding:'5px 8px',textAlign:'center',color:'#fff',fontSize:10}}>
                      U1: {(s.deliveries||[]).filter(d=>d.unit!=='u2').reduce((a,d)=>a+(parseFloat(d.tons)||0),0).toFixed(1)}T &nbsp;
                      U2: {(s.deliveries||[]).filter(d=>d.unit==='u2').reduce((a,d)=>a+(parseFloat(d.tons)||0),0).toFixed(1)}T
                    </td>
                    <td style={{padding:'5px 8px',textAlign:'center',color:pending>0?'#f87171':'#4ade80',fontWeight:800}}>
                      {pending>0?`${pending.toFixed(1)}T pending`:'Complete'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

      {/* Upcoming deliveries alert */}
      {upcoming.length>0 && (
        <div style={{background:'#fffbeb',border:'1.5px solid #fde68a',borderRadius:12,padding:'12px 16px',marginTop:4}}>
          <div style={{fontWeight:800,fontSize:13,color:'#b45309',marginBottom:8}}>⚡ Upcoming Deliveries ({upcoming.length})</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {upcoming.map((d,i)=>{
              const daysAway = Math.ceil((new Date(d.date)-new Date())/(1000*60*60*24));
              return (
                <span key={i} style={{background:'#fff',border:`1px solid ${daysAway<=3?'#fbbf24':'#e5e7eb'}`,borderRadius:8,padding:'5px 10px',fontSize:11}}>
                  <span style={{fontWeight:700,color:daysAway<=3?'#b45309':'#374151'}}>{d.date}</span>
                  <span style={{color:'#6b7280',marginLeft:4}}>{d.supplier} · {d.tons}T · U{d.unit==='u2'?'2':'1'}</span>
                  {daysAway<=3&&<span style={{marginLeft:4,color:'#dc2626',fontWeight:700}}>{daysAway===0?'Today':daysAway===1?'Tomorrow':`${daysAway}d`}</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── INTRA TRANSFER SUMMARY ────────────────────────────────────────────────────
function IntraTransferSummary({ transfers, dark, card, txt, sub, bdr }) {
  const u1to2 = transfers.filter(t=>t.fromUnit==='u1'&&t.toUnit==='u2').reduce((a,t)=>a+(t.tons||0),0);
  const u2to1 = transfers.filter(t=>t.fromUnit==='u2'&&t.toUnit==='u1').reduce((a,t)=>a+(t.tons||0),0);
  const thisMonth = new Date().toISOString().slice(0,7);
  const monthTransfers = transfers.filter(t=>t.date?.startsWith(thisMonth));

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
        {[
          {l:'Total Transfers', v:transfers.length,          c:'#1e40af'},
          {l:'U1 → U2',        v:`${u1to2.toFixed(1)}T`,   c:'#7c3aed'},
          {l:'U2 → U1',        v:`${u2to1.toFixed(1)}T`,   c:'#ea580c'},
        ].map(k=>(
          <div key={k.l} style={{background:card,borderRadius:10,padding:'10px 14px',border:`1px solid ${bdr}`}}>
            <div style={{fontSize:22,fontWeight:900,color:k.c}}>{k.v}</div>
            <div style={{fontSize:10,color:sub,marginTop:2}}>{k.l}</div>
          </div>
        ))}
      </div>
      <div style={{fontWeight:700,fontSize:12,color:sub,marginBottom:8}}>This month ({monthTransfers.length} transfers):</div>
      {monthTransfers.slice(0,8).map((t,i)=>(
        <div key={t.id} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f9fafb'),padding:'7px 12px',borderRadius:8,marginBottom:4,display:'flex',gap:12,alignItems:'center'}}>
          <span style={{fontSize:20}}>🔄</span>
          <span style={{fontWeight:700,color:txt,fontSize:12}}>U{t.fromUnit==='u2'?'2':'1'} → U{t.toUnit==='u2'?'2':'1'}</span>
          <span style={{color:'#7c3aed',fontWeight:700,fontSize:12}}>{t.tons}T {t.grade}</span>
          <span style={{color:sub,fontSize:11}}>{t.date}</span>
          <span style={{color:sub,fontSize:11,marginLeft:'auto'}}>{t.reason||'—'}</span>
        </div>
      ))}
    </div>
  );
}
