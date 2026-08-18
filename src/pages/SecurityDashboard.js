import React, { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, updateDoc, doc, query, orderBy, limit, onSnapshot, serverTimestamp, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import ManpowerDashboard from './ManpowerDashboard';
import { createNotification, NOTIF_TYPES } from '../utils/notificationService';
import { subscribeAppRequests, updateAppRequest } from '../utils/requestService';

const todayStr = () => new Date().toISOString().slice(0,10);
const timeStr  = () => new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
const fmtTime  = ts => { if(!ts) return '—'; const d=ts?.toDate?ts.toDate():new Date(ts); return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); };
const fmtDur = (start,end) => { if(!start) return '—'; try{ const s=start?.toDate?start.toDate():new Date((start?.seconds||0)*1000); const e=end?(end?.toDate?end.toDate():new Date((end?.seconds||0)*1000)):new Date(); const m=Math.floor((e-s)/60000); if(m<0) return '—'; const h=Math.floor(m/60); const mm=m%60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }catch(err){return '—';} };

const TABS = ['dashboard','power','mobilebox','vehicle','od','visitor','transfer','tea','permission','dc','cleared','reports'];
const TAB_LABELS = {dashboard:'Dashboard',power:'Power',mobilebox:'Mobile Box',vehicle:'Vehicles',od:'OD',visitor:'Visitor',transfer:'U2→U1',tea:'Tea',permission:'Permission',dc:'DC Approval',cleared:'Cleared',reports:'Reports'};
const TAB_SHORT  = {dashboard:'Home',power:'Power',mobilebox:'Mobile',vehicle:'Vehicle',od:'OD',visitor:'Visitor',transfer:'U2→U1',tea:'Tea',permission:'Permit',dc:'DC',cleared:'Cleared',reports:'Reports'};
const TAB_ICONS  = {dashboard:'🏠',power:'⚡',mobilebox:'📱',vehicle:'🚗',od:'🚗',visitor:'👤',transfer:'🔄',tea:'☕',permission:'🔐',dc:'📄',cleared:'✅',reports:'📅'};

const DEPARTMENTS_LIST = ['PDC','Fettling','CNC/VMC','Secondary','Final'];
const VEHICLE_TYPES = ['Two Wheeler','Three Wheeler','Car/SUV','Van','Mini Truck (LCV)','Truck/Lorry (HCV)','Tanker','Tractor','Auto','Other'];
const PURPOSES = [
  'Alloy Delivery','Biscuit Delivery','Consumables Delivery',
  'Trimming Die Insert Delivery','New Mould Base Delivery','Die Insert Delivery','Die Maintenance & Repair',
  'Machine Inspection','Machine Spares Delivery','Equipment/Tools Delivery',
  'Design Discussion','Drawing Approval','PPAP / APQP Visit','Customer Audit',
  'FG Dispatch to Customer','FG Collection / Pickup','Sample Dispatch',
  'Annual Maintenance Contract','Calibration Visit',
  'Courier Pickup','Courier Delivery','Vendor Visit',
  'Scrap Collection','Waste Removal',
  'New Insert Delivery','Mould Box Delivery','Toolroom Raw Material Delivery',
  'Heat Treatment','Nitriding','Cylindrical Grinding','VMC Material',
  'Fabrication Support',
  'IoT/IT/Technology Support',
  'Machining Supplier Material Delivery',
  'Machining Supplier Material Collection',
  'Other',
];
const QUICK_SUPPLIERS = [
  {label:'SEG Hassan',    from:'SEG Hassan'},
  {label:'SEG Bangalore', from:'SEG Bangalore'},
  {label:'SEG Hosur',     from:'SEG Hosur'},
  {label:'KTTM',          from:'KTTM'},
  {label:'VS',            from:'VS'},
  {label:'Yokesh',        from:'Yokesh Enterprises'},
  {label:'Vinayagam',     from:'Vinayagam Enterprises'},
  {label:'Courier',       from:'Courier'},
];

const TEA_VENDOR = 'Regular Vendor'; // Fixed — update name later
const MOVEMENT_TYPES = ['Material Purchase','Material Collection','Unit 1 → Unit 2','Unit 2 → Unit 1','Unit 2 → Unit 1 (Transfer)','Tool/Equipment Pickup','Maintenance Visit','Machine Spares Collection','Delivery to Customer','Bank/Office Errand','Logistics Run','Die/Mould Collection','Vendor Visit','Government Office','Fabrication Support','Heat Treatment','Nitriding','Cylindrical Grinding','VMC Material','Job Work Outside','IoT/IT/Technology Support','Machining Supplier Material Collection','Other'];
const JOB_WORK_TYPES = ['Heat Treatment','Nitriding','Cylindrical Grinding','VMC Material','Fabrication Support','Die/Mould Collection','Job Work Outside'];

const INTERNAL_DEPTS = ['PDC','PDC Maintenance','CNC/VMC','Fettling','Secondary','Assembly','Final','Dispatch','Maintenance','Mould Maintenance','Fabrication','Stores','Toolroom','Design','NPD/Quality','PPC','ERP','Accounts','HR','Shot Blasting','Security','Logistics','Housekeeping','IoT/Technology'];
const FREQUENT_ALUBEANS = [
  {name:'Munusamy',   dept:'Toolroom',     movement:'Tool/Equipment Pickup'},
  {name:'Nayaz',      dept:'Stores',        movement:'Material Purchase'},
  {name:'Murugesh',   dept:'Maintenance',   movement:'Machine Spares Collection'},
  {name:'Kandhan',    dept:'Maintenance',   movement:'Maintenance Visit'},
  {name:'Pandiyarajan',dept:'Logistics',    movement:'Logistics Run'},
  {name:'Arun',       dept:'Logistics',     movement:'Logistics Run'},
];
const PERMISSION_REASONS = ['Early Leave','Late Arrival','Half Day','Emergency Leave','Medical Appointment','Bank Work','Personal Work','Material Purchase','Government Office','Other'];

export default function SecurityDashboard({ dark, onBack, unit, onManpower, initialTab, onTabConsumed, onRequests, onSignOut }) {
  const [tab, setTab] = useState(initialTab || 'dashboard');
  const [showManpower, setShowManpower] = useState(false);

  // Handle deep link tab navigation
  useEffect(()=>{
    if(initialTab) {
      const mapped = initialTab === 'internal' ? 'od' : initialTab;
      setTab(mapped);
      if(onTabConsumed) onTabConsumed();
    }
  },[initialTab]);
  const { userProfile } = useAuth();
  const isOwner = userProfile?.role === 'owner' || ['owner@alubee.com','md@alubee.com','jmd@alubee.com'].includes(userProfile?.email);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const bg   = 'var(--bg-base)';
  const card = 'var(--bg-raised)';
  const txt  = 'var(--text-primary)';
  const sub  = 'var(--text-secondary)';
  const bdr  = 'var(--border-subtle)';

  // Live data
  const [powerStatus, setPowerStatus]   = useState(null); // latest power doc
  const [vehicles,    setVehicles]      = useState([]);
  const [visitors,    setVisitors]      = useState([]);
  const [mobileBoxes, setMobileBoxes]   = useState([]);
  const [teaData,     setTeaData]       = useState(null);
  const [dieselLevel, setDieselLevel]   = useState(null);
  const [internalMovements, setInternalMovements] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [transferRecords, setTransferRecords] = useState([]);
  const [dcApprovals,    setDcApprovals]    = useState([]);
  const [approverAvail,  setApproverAvail]  = useState({ jmd:'Online', md:'Online' });

  const col = n => `security_${n}_${unit==='u2'?'u2':'u1'}`;

  useEffect(() => {
    const subs = [];
    // Power status
    subs.push(onSnapshot(query(collection(db,col('power')),orderBy('createdAt','desc'),limit(1)), s=>{
      setPowerStatus(s.docs[0]?{id:s.docs[0].id,...s.docs[0].data()}:null);
    }));
    // Vehicles inside today
    subs.push(onSnapshot(query(collection(db,col('vehicles')),orderBy('inTime','desc'),limit(50)), s=>{
      setVehicles(s.docs.map(d=>({id:d.id,...d.data()})));
    }));
    // Visitors today
    subs.push(onSnapshot(query(collection(db,col('visitors')),orderBy('createdAt','desc'),limit(50)), s=>{
      setVisitors(s.docs.map(d=>({id:d.id,...d.data()})));
    }));
    // Mobile boxes today
    subs.push(onSnapshot(query(collection(db,col('mobilebox')),where('date','==',todayStr())), s=>{
      setMobileBoxes(s.docs.map(d=>({id:d.id,...d.data()})));
    }));
    // Tea - today
    subs.push(onSnapshot(query(collection(db,col('tea')),where('date','==',todayStr())), s=>{
      const docs = s.docs.map(d=>({id:d.id,...d.data()}));
      setTeaData(docs); // array of all today's sessions
    }));
    // Internal movements
    const internalColName = `security_internal_${unit==='u2'?'u2':'u1'}`;
    subs.push(onSnapshot(query(collection(db,internalColName),orderBy('outTime','desc'),limit(30)), s=>{
      setInternalMovements(s.docs.map(d=>({id:d.id,...d.data()})));
    }));
    // All permissions (pending + approved today = on-permission tracking)
    subs.push(onSnapshot(query(collection(db,`security_permission_${unit==='u2'?'u2':'u1'}`)), s=>{
      setPermissions(s.docs.map(d=>({id:d.id,...d.data()})));
    }));
    // U2→U1 transfers today
    subs.push(onSnapshot(query(collection(db,'security_transfer_u2_u1'),where('date','==',todayStr())), s=>{
      setTransferRecords(s.docs.map(d=>({id:d.id,...d.data()})));
    }));
    // DC approvals — live
    // Approver availability
    subs.push(onSnapshot(doc(db,'approver_availability','status'), s=>{
      if(s.exists()) setApproverAvail(s.data());
    }));

    subs.push(onSnapshot(query(collection(db,'dc_approvals'),where('unit','==',unit||'u1')), s=>{
      const docs = s.docs.map(d=>({id:d.id,...d.data()}));
      // Sort in JS — avoids needing Firestore composite index
      docs.sort((a,b)=>{
        const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return bt - at;
      });
      setDcApprovals(docs);
    }));
    // Diesel from stores
    subs.push(onSnapshot(query(collection(db,`stores_checklist_${unit==='u2'?'u2':'u1'}`),orderBy('submittedAt','desc'),limit(1)), s=>{
      if(s.docs[0]){
        const items = s.docs[0].data().items||[];
        const diesel = items.find(i=>i.description==='DIESEL');
        if(diesel) setDieselLevel(parseFloat(diesel.value)||0);
      }
    }));
    return () => subs.forEach(u=>u());
  }, [unit]);

  const powerOn  = powerStatus?.status === 'ON';
  const pendingVisitors = visitors.filter(v=>v.approvalStatus==='Pending');
  const pendingDCs      = dcApprovals.filter(d=>d.status==='Pending');
  const vehiclesInside  = vehicles.filter(v=>!v.outTime);
  const pendingBoxes    = DEPARTMENTS_LIST.filter(d=>!mobileBoxes.find(m=>m.department===d));

  // Tab content rendered below via explicit conditionals

  // Route to Manpower Dashboard
  if(showManpower) return <ManpowerDashboard dark={dark} onBack={()=>setShowManpower(false)}/>;

  const navBtn = (t) => ({
    background: tab===t?(dark?'rgba(249,115,22,0.2)':'rgba(249,115,22,0.1)'):'transparent',
    border: 'none', borderLeft: tab===t?'3px solid #f97316':'3px solid transparent',
    padding:'10px 14px', color:tab===t?'#f97316':(dark?'rgba(255,255,255,0.7)':'#555'),
    fontSize:13, fontWeight:tab===t?700:400, cursor:'pointer', textAlign:'left',
    fontFamily:'var(--font-sans)', width:'100%', display:'flex', alignItems:'center', gap:8
  });

  return (
    <div style={{display:'flex',height:'100vh',background:'var(--bg-base)',fontFamily:'var(--font-sans)',overflow:'hidden'}}>

      {/* ── LEFT SIDEBAR — always visible, narrow on mobile ── */}
      <aside style={{
        width: isMobile?60:220,
        background:'var(--slate-950)',
        borderRight:'1px solid var(--border-subtle)',
        display:'flex', flexDirection:'column',
        flexShrink:0, overflowY:'auto', overflowX:'hidden',
        transition:'width 0.25s var(--ease-out)',
        zIndex:10,
        boxShadow:'var(--shadow-3)',
      }}>
        {/* Logo */}
        <div style={{padding:isMobile?'12px 0':'16px 14px',borderBottom:'1px solid var(--border-subtle)',marginBottom:4,textAlign:isMobile?'center':'left'}}>
          {isMobile
            ? <div style={{fontSize:16}}>🔒</div>
            : <>
                <div style={{fontSize:13,fontWeight:800,color:'var(--text-primary)',letterSpacing:0.5}}>🔒 SECURITY</div>
                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>Operations Panel · Unit {unit==='u2'?'2':'1'}</div>
              </>
          }
        </div>

        {/* Nav tabs */}
        {TABS.map(t=>{
          const icon = TAB_ICONS[t]||'•';
          const active = tab===t;
          return (
            <button key={t} onClick={()=>setTab(t)} style={{
              background: active?'var(--green-bg)':'transparent',
              border:'none', borderLeft:`3px solid ${active?'var(--green)':'transparent'}`,
              padding: isMobile?'8px 4px':'10px 14px',
              color: active?'#f97316':'rgba(255,255,255,0.65)',
              cursor:'pointer', textAlign:'left',
              fontFamily:'var(--font-sans)', width:'100%',
              display:'flex',
              flexDirection: isMobile?'column':'row',
              alignItems:'center',
              justifyContent: isMobile?'center':'flex-start',
              gap: isMobile?2:8,
              transition:'all 0.15s',
            }}>
              <span style={{fontSize:isMobile?18:14,lineHeight:1}}>{icon}</span>
              <span style={{fontSize:isMobile?8:12,fontWeight:active?700:400,lineHeight:1.2,marginTop:isMobile?1:0}}>{isMobile?TAB_SHORT[t]:TAB_LABELS[t]}</span>
              {t==='dc'&&pendingDCs.length>0&&<span style={{background:'#ef4444',color:'#fff',borderRadius:'50%',minWidth:16,height:16,fontSize:9,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 3px'}}>{pendingDCs.length}</span>}
              {t==='cleared'&&<ClearedBadge unit={unit}/>}
            </button>
          );
        })}

        {/* Manpower button */}
        <button onClick={()=>setShowManpower(true)} style={{
          margin:isMobile?'2px 4px':'4px 10px',
          background:'var(--orange-bg)',
          border:'1px solid rgba(249,115,22,0.3)',
          borderRadius:'var(--radius-md)',
          padding:isMobile?'8px 4px':'8px 10px',
          color:'var(--orange)',
          cursor:'pointer', fontFamily:'var(--font-sans)',
          textAlign:'center', fontWeight:700,
          display:'flex', flexDirection:isMobile?'column':'row',
          alignItems:'center',
          justifyContent:isMobile?'center':'flex-start',
          gap:isMobile?2:8,
          width:isMobile?'calc(100% - 8px)':'calc(100% - 20px)',
        }}>
          <span style={{fontSize:isMobile?18:14}}>👷</span>
          <span style={{fontSize:isMobile?8:12}}>{isMobile?'Mpwr':'Manpower'}</span>
        </button>

        <div style={{flex:1}}/>

        {/* Sign Out */}
        {!isMobile && (
          <button onClick={onSignOut} style={{
            margin:'0 10px 6px',
            background:'#dc2626',
            border:'none', borderRadius:'var(--radius-md)',
            padding:'8px 10px',
            color:'#fff',
            fontSize:12, fontWeight:700,
            cursor:'pointer', fontFamily:'var(--font-sans)',
            textAlign:'center',
          }}>
            ⎋ Sign Out
          </button>
        )}

        {/* Back button */}
        <button onClick={onBack} style={{
          margin:isMobile?'0 4px 8px':'0 10px 10px',
          background:'var(--glass-1)',
          border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-md)',
          padding:isMobile?'10px 0':'8px 10px',
          color:'var(--text-muted)',
          fontSize:isMobile?16:12,
          cursor:'pointer', fontFamily:'var(--font-sans)',
          textAlign:'center', transition:'all var(--t-fast)',
        }}>
          {isMobile?'←':'← Back'}
        </button>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>
        {/* Top bar — mobile only shows title + power status */}
        {isMobile&&(
          <div style={{background:'var(--slate-950)',borderBottom:'1px solid var(--border-subtle)',padding:'8px 14px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <span style={{flex:1,color:'var(--text-primary)',fontWeight:700,fontSize:13,letterSpacing:'-0.01em'}}>{TAB_LABELS[tab]||'Security'}</span>
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:powerOn?'#16a34a':'#ef4444',boxShadow:`0 0 6px ${powerOn?'#16a34a':'#ef4444'}`}}/>
              <span style={{fontSize:10,color:'var(--text-muted)',fontWeight:700}}>{powerOn?'ON':'OFF'}</span>
            </div>
          </div>
        )}

        <div style={{flex:1,overflowY:'auto',padding:isMobile?'10px':'20px 24px',paddingBottom:40}}>
          {/* Approver Availability Banner */}
          <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
            {[['JMD',approverAvail?.jmd||'Online'],['MD',approverAvail?.md||'Online']].map(([label,status])=>{
              const online = status!=='Offline';
              return (
                <div key={label} style={{display:'flex',alignItems:'center',gap:6,background:online?'#f0fdf4':'#fef2f2',border:`1px solid ${online?'#86efac':'#fca5a5'}`,borderRadius:8,padding:'5px 12px'}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:online?'#16a34a':'#dc2626'}}/>
                  <span style={{fontSize:11,fontWeight:700,color:online?'#15803d':'#dc2626'}}>{label}: {online?'Online':'Offline'}</span>
                </div>
              );
            })}
            {(approverAvail?.jmd==='Offline'&&approverAvail?.md==='Offline')&&(
              <div style={{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:8,padding:'5px 12px',fontSize:11,fontWeight:700,color:'#b45309'}}>
                ⚠️ Both offline — OD/Visitor auto approved
              </div>
            )}
          </div>
          {tab==='dashboard' && <DashboardTab dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} powerOn={powerOn} powerStatus={powerStatus} dieselLevel={dieselLevel} vehiclesInside={vehiclesInside} vehicles={vehicles} pendingVisitors={pendingVisitors} visitors={visitors} mobileBoxes={mobileBoxes} teaData={teaData} internalMovements={internalMovements||[]} permissions={permissions||[]} transferRecords={transferRecords||[]} setTab={setTab} isMobile={isMobile} unit={unit}/> }
          {tab==='power'     && <PowerTab     dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} powerOn={powerOn} powerStatus={powerStatus} col={col} userProfile={userProfile} unit={unit}/>}
          {tab==='mobilebox' && <MobileBoxTab dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} col={col} userProfile={userProfile} unit={unit}/>}
          {tab==='vehicle'   && <VehicleTab   dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} vehicles={vehicles} vehiclesInside={vehiclesInside} col={col} userProfile={userProfile} unit={unit} isMobile={isMobile} dcApprovals={dcApprovals}/>}
          {tab==='dc'        && <DCApprovalTab dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} dcApprovals={dcApprovals} pendingDCs={pendingDCs} userProfile={userProfile} unit={unit} isOwner={isOwner} isMobile={isMobile}/>}
          {tab==='cleared'   && <ClearedTab dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} col={col} userProfile={userProfile} unit={unit} isMobile={isMobile}/>}
          {tab==='reports'   && <SecurityReportsTab dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} col={col} userProfile={userProfile} unit={unit}/>}
          {tab==='permission'&& <PermissionTab dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} col={col} userProfile={userProfile} unit={unit} isOwner={isOwner}/>}
          {tab==='od'        && <SecurityRequestGateTab type="od" dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} col={col} userProfile={userProfile} unit={unit} isMobile={isMobile}/>}
          {tab==='visitor'   && <SecurityRequestGateTab type="visitor" dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} col={col} userProfile={userProfile} unit={unit} isMobile={isMobile}/>}
          {tab==='transfer'  && <TransferTab dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} col={col} userProfile={userProfile} unit={unit} isMobile={isMobile}/>}
          {tab==='tea'       && <TeaTab       dark={dark} card={card} txt={txt} sub={sub} bdr={bdr} col={col} userProfile={userProfile} unit={unit}/>}
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD TAB ─────────────────────────────────────────────────────────────
function DashboardTab({dark,card,txt,sub,bdr,powerOn,powerStatus,dieselLevel,vehiclesInside,vehicles,pendingVisitors,visitors,mobileBoxes,teaData,internalMovements,permissions,transferRecords,setTab,isMobile,unit}) {

  const dieselPct = dieselLevel!==null ? Math.min(100,dieselLevel) : 0;
  const dieselColor = dieselLevel===null?'#888':dieselLevel>50?'#22c55e':dieselLevel>20?'#f59e0b':'#ef4444';
  const visitorsInside = visitors.filter(v=>v.approvalStatus==='Approved'&&!v.outTime&&(v.date===todayStr()||v.fromRequest));
  const totalMobiles = (mobileBoxes||[]).reduce((a,m)=>a+(parseInt(m.mobileCount)||0),0);
  const MOBILE_DEPTS = ['PDC','Fettling','CNC/VMC','Secondary','Final'];
  const outDur = powerStatus&&!powerOn ? fmtDur(powerStatus.createdAt,null) : null;

  // Subscribe to today's full power history to calculate total outage
  const [powerHistory, setPowerHistory] = useState([]);
  useEffect(()=>{
    import('firebase/firestore').then(({collection,query,where,onSnapshot,orderBy})=>{
      import('../firebase').then(({db})=>{
        try {
          const q = query(collection(db,col('power')), where('date','==',todayStr()), orderBy('createdAt','asc'));
          return onSnapshot(q, s => setPowerHistory(s.docs.map(d=>({id:d.id,...d.data()}))));
        } catch(e) { console.log('power history', e); }
      });
    });
  },[]);

  // Calculate total outage minutes today by pairing OFF/ON events
  const totalOutageMin = (() => {
    let total = 0;
    let offTime = null;
    for (const h of powerHistory) {
      if (h.status === 'OFF') {
        offTime = h.createdAt?.toDate?.() || new Date(h.createdAt);
      } else if (h.status === 'ON' && offTime) {
        const onTime = h.createdAt?.toDate?.() || new Date(h.createdAt);
        total += Math.floor((onTime - offTime) / 60000);
        offTime = null;
      }
    }
    // If power is still off, count current outage
    if (!powerOn && offTime) {
      total += Math.floor((Date.now() - offTime.getTime()) / 60000);
    }
    return total;
  })();

  const todayVehicles  = vehicles.filter(v=>v.date===todayStr());
  const todayVisitors  = visitors.filter(v=>v.date===todayStr()||v.fromRequest);
  const todayInternal  = (internalMovements||[]).filter(m=>m.date===todayStr());

  const statusBadge = (status,small=false) => {
    const map = {
      inside:  {bg:'#1e3a5f',c:'#60a5fa',t:'Inside'},
      exited:  {bg:'#052d14',c:'#4ade80',t:'Exited'},
      pending: {bg:'#3d2600',c:'#fbbf24',t:'Pending'},
      approved:{bg:'#052d14',c:'#4ade80',t:'Approved'},
      rejected:{bg:'#2d0a0a',c:'#f87171',t:'Rejected'},
      out:     {bg:'#2d1515',c:'#f87171',t:'Out'},
      returned:{bg:'#052d14',c:'#4ade80',t:'Returned'},
    };
    const s = map[status]||map.pending;
    return <span style={{background:s.bg,color:s.c,fontSize:small?9:10,fontWeight:700,padding:small?'2px 7px':'3px 9px',borderRadius:20,letterSpacing:0.3,whiteSpace:'nowrap'}}>{s.t}</span>;
  };

  const _C = {
    panel:   'var(--bg-raised)',
    panelHdr:'var(--bg-overlay)',
    border:  'var(--border-subtle)',
    txt:     'var(--text-primary)',
    sub:     'var(--text-secondary)',
    accent:  'var(--orange)',
  };
  const C = _C;

  const Panel = ({children,style={}}) => (
    <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',overflow:'hidden',marginBottom:14,boxShadow:'var(--shadow-2)',...style}}>
      {children}
    </div>
  );

  const PanelHeader = ({icon,title,badge,badgeColor='var(--accent)',badgeBg}) => (
    <div style={{background:'var(--bg-overlay)',padding:'12px 16px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid var(--border-subtle)'}}>
      <span style={{fontSize:15}}>{icon}</span>
      <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',flex:1,letterSpacing:'-0.01em'}}>{title}</span>
      {badge!==undefined&&<span style={{background:badgeBg||'var(--glass-2)',color:badgeColor,fontSize:11,fontWeight:800,padding:'3px 10px',borderRadius:'var(--radius-full)',border:`1px solid ${badgeColor}33`}}>{badge}</span>}
    </div>
  );

  // Shared activity row renderer
  const ActivityRow = ({icon,iconColor,title,sub1,sub2,inTime,outTime,inTimeStr,outTimeStr,entryTime,exitTime,status,index,total}) => {
    // Universal: entryTime = when they arrived/went out, exitTime = when they left/returned
    // Vehicles: entryTime=inTime(entry), exitTime=outTime(exit)
    // Internal: entryTime=outTime(going out), exitTime=inTime(returning)
    // Visitors: entryTime=inTime(approved entry), exitTime=outTime(exit)
    const eTime = entryTime || inTime;
    const xTime = exitTime  || outTime;
    const eStr  = outTimeStr || (eTime  ? fmtTime(eTime)  : null);
    const xStr  = inTimeStr  || (xTime  ? fmtTime(xTime)  : null);
    const duration = eTime&&xTime ? fmtDur(eTime,xTime)
                   : eTime&&!xTime ? fmtDur(eTime,null) : null;
    const entryLabel = status==='out'||status==='returned' ? 'Out' : 'In';
    const exitLabel  = status==='out'||status==='returned' ? 'In'  : 'Out';
    return (
      <div style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 16px',borderBottom:index<total-1?`1px solid ${C.border}`:'none'}}>
        <div style={{width:32,height:32,borderRadius:'var(--radius-md)',background:iconColor+'18',border:`1px solid ${iconColor}30`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0,marginTop:2}}>
          {icon}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3,flexWrap:'wrap'}}>
            <span style={{fontWeight:800,color:'var(--text-primary)',fontSize:13}}>{title}</span>
            {statusBadge(status,true)}
          </div>
          {sub1&&<div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sub1}</div>}
          {sub2&&<div style={{fontSize:11,color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sub2}</div>}
          {/* In/Out time row */}
          <div style={{display:'flex',gap:12,marginTop:5,flexWrap:'wrap'}}>
            {eStr&&<div style={{display:'flex',alignItems:'center',gap:4}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:status==='out'||status==='returned'?'#f97316':'#3b82f6'}}/>
              <span style={{fontSize:10,color:'var(--text-secondary)'}}>{entryLabel}: <strong style={{color:'var(--text-primary)'}}>{eStr}</strong></span>
            </div>}
            {xStr&&<div style={{display:'flex',alignItems:'center',gap:4}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:'#22c55e'}}/>
              <span style={{fontSize:10,color:'var(--text-secondary)'}}>{exitLabel}: <strong style={{color:'var(--text-primary)'}}>{xStr}</strong></span>
            </div>}
            {duration&&<div style={{display:'flex',alignItems:'center',gap:4}}>
              <span style={{fontSize:10,color:'var(--amber)',fontWeight:700}}>⏱ {duration}</span>
            </div>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{fontFamily:'var(--font-sans)'}}>

      {/* Date header */}
      <div style={{marginBottom:16,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:'var(--text-primary)',letterSpacing:'-0.03em'}}>Security Operations</div>
          <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})} · Live</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:'var(--green)',boxShadow:'var(--shadow-green)',animation:'pulse 2s infinite'}}/>
          <span style={{fontSize:10,fontWeight:700,color:'var(--green)',letterSpacing:'0.06em'}}>LIVE</span>
        </div>
      </div>

      {/* ── POWER STATUS ── */}
      <div style={{borderRadius:'var(--radius-lg)',overflow:'hidden',marginBottom:14,background:powerOn?'linear-gradient(135deg,rgba(5,45,20,0.95),rgba(22,101,52,0.9))':'linear-gradient(135deg,rgba(45,10,10,0.95),rgba(153,27,27,0.9))',border:`1px solid ${powerOn?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}`,padding:'16px 20px',display:'flex',alignItems:'center',gap:14,backdropFilter:'blur(8px)',boxShadow:powerOn?'var(--shadow-green)':'var(--shadow-red)'}}>
        <div style={{width:40,height:40,borderRadius:'var(--radius-lg)',background:powerOn?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>{powerOn?'⚡':'🔴'}</div>
        <div style={{flex:1}}>
          <div style={{color:'#fff',fontWeight:900,fontSize:15,letterSpacing:'0.05em',fontFamily:'var(--font-sans)'}}>POWER {powerOn?'ON':'OFF'}</div>
          <div style={{color:'rgba(255,255,255,0.6)',fontSize:11,marginTop:3}}>
            {powerStatus ? powerOn
              ? `Restored ${fmtTime(powerStatus.restoredAt||powerStatus.createdAt)} · ${powerStatus.recordedBy}`
              : `Off since ${fmtTime(powerStatus.createdAt)} · ${powerStatus.recordedBy}`
              : 'No record today'}
          </div>
        </div>
          {totalOutageMin>0&&<div style={{background:powerOn?'rgba(239,68,68,0.15)':'rgba(239,68,68,0.25)',border:`1px solid ${powerOn?'rgba(239,68,68,0.3)':'rgba(239,68,68,0.4)'}`,borderRadius:'var(--radius-md)',padding:'8px 14px',textAlign:'center',flexShrink:0}}>
            <div style={{color:'#fca5a5',fontWeight:900,fontSize:16,fontFamily:'monospace'}}>{totalOutageMin}m</div>
            <div style={{color:'rgba(255,255,255,0.5)',fontSize:9,marginTop:2,letterSpacing:1}}>TODAY OUTAGE</div>
          </div>}
          {outDur&&!powerOn&&<div style={{background:'rgba(239,68,68,0.25)',border:'1px solid rgba(239,68,68,0.4)',borderRadius:'var(--radius-md)',padding:'8px 14px',textAlign:'center',flexShrink:0}}>
            <div style={{color:'#fca5a5',fontWeight:900,fontSize:18,fontFamily:'monospace'}}>{outDur}</div>
            <div style={{color:'rgba(255,255,255,0.5)',fontSize:9,marginTop:2,letterSpacing:1}}>CURRENT</div>
          </div>}
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </div>

      {/* ── ALUBEANS OUTSIDE + ON PERMISSION ── */}
      {(()=>{
        const outsideNow = (internalMovements||[]).filter(m=>m.status==='Out'&&m.date===todayStr());
        const onPerm     = (permissions||[]).filter(p=>p.status==='Approved'&&!p.returnedAt&&(p.requestedDate===todayStr()||p.date===todayStr()));
        const total = outsideNow.length + onPerm.length;
        if(!total) return null;
        return (
          <Panel style={{border:'1.5px solid rgba(239,68,68,0.4)',marginBottom:14}}>
            <PanelHeader icon="🏃" title={`Alubeans Outside — ${total}`} badge={total} badgeColor="#ef4444"/>
            <div style={{padding:'8px 14px',display:'flex',flexWrap:'wrap',gap:8}}>
              {outsideNow.map(m=>(
                <div key={m.id} style={{background:'var(--red-bg)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'var(--radius-md)',padding:'8px 12px',minWidth:140}}>
                  <div style={{fontWeight:800,color:'var(--text-primary)',fontSize:13}}>{m.alubean_name||m.employeeName||'—'}</div>
                  <div style={{fontSize:10,color:'var(--orange)',fontWeight:700,marginTop:2}}>{m.movementType}{m.destination?' → '+m.destination:''}</div>
                  <div style={{fontSize:10,color:'var(--text-secondary)',marginTop:1}}>{m.department}</div>
                  <div style={{fontSize:10,color:'var(--red)',marginTop:1}}>Out {m.outTimeStr}</div>
                </div>
              ))}
              {onPerm.map(p=>(
                <div key={p.id} style={{background:'var(--amber-bg)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:'var(--radius-md)',padding:'8px 12px',minWidth:140}}>
                  <div style={{fontWeight:800,color:'var(--text-primary)',fontSize:13}}>{p.alubean_name||p.employeeName||'—'}</div>
                  <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>{p.department}</div>
                  <div style={{fontSize:10,color:'var(--amber)',fontWeight:700,marginTop:2}}>🔐 On Permission</div>
                  <div style={{fontSize:10,color:'var(--text-secondary)',marginTop:1}}>{p.reason} · {p.duration}</div>
                </div>
              ))}
            </div>
          </Panel>
        );
      })()}

      {/* ── TOP ROW: Vehicles + Visitors + U2→U1 ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
        {/* Vehicles summary */}
        <Panel>
          <PanelHeader icon="🚗" title="Vehicles" badge={vehiclesInside.length+' inside'} badgeColor="#3b82f6"/>
          <div style={{padding:'10px 14px'}}>
            {vehiclesInside.length===0
              ? <div style={{fontSize:12,color:'var(--text-secondary)',padding:'4px 0'}}>None inside</div>
              : vehiclesInside.slice(0,3).map(v=>(
                <div key={v.id} style={{marginBottom:8,paddingBottom:8,borderBottom:'1px solid var(--border-subtle)'}}>
                  <div style={{fontWeight:800,color:'var(--text-primary)',fontSize:14}}>{v.comingFrom||v.partyName||'—'}</div>
                  <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:1}}>{v.vehicleNumber} · {v.driverName}</div>
                  <div style={{fontSize:10,color:'var(--accent)',marginTop:1}}>{v.purpose||'—'}</div>
                  <div style={{fontSize:10,color:'var(--amber)',fontWeight:600,marginTop:2}}>⏱ {fmtDur(v.inTime,null)}</div>
                </div>
              ))
            }
            <div style={{paddingTop:6,borderTop:'1px solid var(--border-subtle)',display:'flex',justifyContent:'space-between',fontSize:11}}>
              <span style={{color:'var(--text-secondary)'}}>Today total</span>
              <span style={{color:'var(--text-primary)',fontWeight:700}}>{todayVehicles.length}</span>
            </div>
          </div>
        </Panel>

        {/* Visitors summary */}
        <Panel style={{border:pendingVisitors.length>0?`1px solid rgba(245,158,11,0.4)`:undefined}}>
          <PanelHeader icon="👤" title="Visitors" badge={pendingVisitors.length>0?`${pendingVisitors.length} pending`:visitorsInside.length+' inside'} badgeColor={pendingVisitors.length>0?'#f59e0b':'#8b5cf6'}/>
          <div style={{padding:'10px 14px'}}>
            {pendingVisitors.length>0&&(
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,color:'var(--amber)',fontWeight:700,textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>⏳ Awaiting Approval</div>
                {pendingVisitors.slice(0,2).map(v=>(
                  <div key={v.id} style={{background:'rgba(245,158,11,0.08)',borderRadius:'var(--radius-md)',padding:'7px 10px',marginBottom:5}}>
                    <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:12}}>{v.visitorName}</div>
                    <div style={{fontSize:10,color:'var(--text-secondary)'}}>→ {v.alubeanToMeet}</div>
                  </div>
                ))}
              </div>
            )}
            {visitorsInside.length>0&&visitorsInside.slice(0,2).map(v=>(
              <div key={v.id} style={{marginBottom:6}}>
                <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:12}}>{v.visitorName}</div>
                <div style={{fontSize:10,color:'var(--text-secondary)'}}>⏱ {fmtDur(v.inTime||v.createdAt,null)} inside</div>
              </div>
            ))}
            {pendingVisitors.length===0&&visitorsInside.length===0&&<div style={{fontSize:12,color:'var(--text-secondary)'}}>No visitors today</div>}
          </div>
        </Panel>

        {/* U2→U1 Transfer summary */}
        <Panel style={{border:'1px solid rgba(249,115,22,0.3)'}}>
          <PanelHeader icon="🔄" title="U2→U1" badge={(transferRecords||[]).filter(r=>!r.returnedAt).length+' in U1'} badgeColor="#f97316"/>
          <div style={{padding:'10px 14px'}}>
            {(transferRecords||[]).filter(r=>!r.returnedAt).length>0?(
              (transferRecords||[]).filter(r=>!r.returnedAt).slice(0,3).map(r=>(
                <div key={r.id} style={{marginBottom:7}}>
                  <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:12}}>{r.alubean_name}</div>
                  <div style={{fontSize:10,color:'var(--orange)'}}>{r.reason}</div>
                  <div style={{fontSize:10,color:'var(--text-secondary)'}}>Arrived {r.arrivedTimeStr}</div>
                </div>
              ))
            ):(
              <div style={{fontSize:12,color:'var(--text-secondary)'}}>No one from U2</div>
            )}
            {(transferRecords||[]).length>0&&(
              <div style={{paddingTop:6,borderTop:'1px solid var(--border-subtle)',display:'flex',justifyContent:'space-between',fontSize:11,marginTop:4}}>
                <span style={{color:'var(--text-secondary)'}}>Total today</span>
                <span style={{color:'var(--text-primary)',fontWeight:700}}>{(transferRecords||[]).length}</span>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* ── PENDING PERMISSIONS ── */}
      {(()=>{
        const pending = (permissions||[]).filter(p=>p.status==='Pending');
        const approvedOut = (permissions||[]).filter(p=>p.status==='Approved'&&!p.returnedAt&&(p.requestedDate===todayStr()||p.date===todayStr()));
        if(!pending.length&&!approvedOut.length) return null;
        return (
          <Panel style={{border:'1.5px solid rgba(245,158,11,0.4)',marginBottom:14}}>
            <PanelHeader icon="🔐" title="Permissions" badge={(pending.length?`${pending.length} pending`:'')+(approvedOut.length?` · ${approvedOut.length} out`:'')} badgeColor="#f59e0b"/>
            {approvedOut.map((r,i)=>(
              <div key={r.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:'1px solid var(--border-subtle)',background:'var(--amber-bg)'}}>
                <div>
                  <div style={{fontWeight:800,color:'var(--text-primary)',fontSize:13}}>{r.alubean_name||r.employeeName} <span style={{fontSize:10,background:'#fef3c7',color:'#d97706',padding:'2px 6px',borderRadius:'var(--radius-md)',fontWeight:700}}>On Permission</span></div>
                  <div style={{fontSize:11,color:'var(--text-secondary)'}}>{r.department} · {r.reason} · {r.duration}</div>
                </div>
                <button onClick={async()=>{
                  const {updateDoc,doc,serverTimestamp}=await import('firebase/firestore');
                  const {db}=await import('../firebase');
                  await updateDoc(doc(db,`security_permission_${unit==='u2'?'u2':'u1'}`,r.id),{returnedAt:serverTimestamp(),returnedTimeStr:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),returnRecordedBy:'Security'});
                }} style={{background:'var(--green)',border:'none',borderRadius:'var(--radius-md)',padding:'7px 12px',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)',whiteSpace:'nowrap'}}>
                  ✓ Mark IN
                </button>
              </div>
            ))}
            {pending.map((r,i)=>(
              <div key={r.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:i<pending.length-1?`1px solid ${C.border}`:'none',background:dark?'rgba(245,158,11,0.03)':'#fffbeb'}}>
                <div>
                  <div style={{fontWeight:800,color:'var(--text-primary)',fontSize:13}}>{r.alubean_name||r.employeeName}</div>
                  <div style={{fontSize:11,color:'var(--text-secondary)'}}>{r.department} · {r.reason} · {r.duration}</div>
                </div>
                <span style={{background:'rgba(245,158,11,0.15)',color:'var(--amber)',fontWeight:700,fontSize:10,padding:'3px 10px',borderRadius:'var(--radius-lg)'}}>⏳ Pending</span>
              </div>
            ))}
          </Panel>
        );
      })()}

      {/* ── U2→U1 TRANSFER ── */}
      {(()=>{
        // This data comes from the TransferTab subscription - show in dashboard
        return null; // Handled in TransferTab - dashboard shows quick summary only
      })()}

      {/* ── U2→U1 TRANSFERS ── */}
      {(()=>{
        const insideNow  = (transferRecords||[]).filter(r=>r.status==='Inside'||!r.returnedAt);
        const returned   = (transferRecords||[]).filter(r=>r.returnedAt);
        if(!(transferRecords||[]).length) return null;
        return (
          <Panel style={{border:'1.5px solid rgba(249,115,22,0.4)',marginBottom:14}}>
            <PanelHeader icon="🔄" title="U2→U1 Transfers Today" badge={(transferRecords||[]).length} badgeColor="#f97316"/>
            {insideNow.length>0&&(
              <div style={{borderBottom:`1px solid ${C.border}`}}>
                <div style={{padding:'6px 16px',fontSize:10,fontWeight:700,color:'var(--orange)',textTransform:'uppercase',letterSpacing:'0.06em',background:'var(--orange-bg)'}}>🔴 Currently in Unit 1 ({insideNow.length})</div>
                {insideNow.map((r,i)=>(
                  <div key={r.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:i<insideNow.length-1?`1px solid ${C.border}`:'none'}}>
                    <div>
                      <div style={{fontWeight:800,color:C.txt,fontSize:13}}>{r.alubean_name}</div>
                      <div style={{fontSize:11,color:C.sub,marginTop:2}}>{r.department} · {r.reason}</div>
                      <div style={{fontSize:10,color:'var(--orange)',marginTop:1}}>Arrived {r.arrivedTimeStr}</div>
                    </div>
                    <button onClick={async()=>{
                      const {updateDoc,doc,serverTimestamp}=await import('firebase/firestore');
                      const {db}=await import('../firebase');
                      const t=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
                      await updateDoc(doc(db,'security_transfer_u2_u1',r.id),{status:'Returned',returnedAt:serverTimestamp(),returnedTimeStr:t,returnRecordedBy:'Security'});
                    }} style={{background:'var(--green)',border:'none',borderRadius:'var(--radius-sm)',padding:'7px 12px',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)',whiteSpace:'nowrap'}}>
                      ✅ Mark Return
                    </button>
                  </div>
                ))}
              </div>
            )}
            {returned.length>0&&(
              <div>
                <div style={{padding:'6px 16px',fontSize:10,fontWeight:700,color:'var(--green)',textTransform:'uppercase',letterSpacing:'0.06em',background:'var(--green-bg)'}}>✅ Returned Today ({returned.length})</div>
                {returned.map((r,i)=>(
                  <div key={r.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 16px',borderBottom:i<returned.length-1?`1px solid ${C.border}`:'none',opacity:0.8}}>
                    <div>
                      <span style={{fontWeight:700,color:C.txt,fontSize:12}}>{r.alubean_name}</span>
                      <span style={{fontSize:11,color:C.sub,marginLeft:6}}>{r.department} · {r.reason}</span>
                    </div>
                    <div style={{textAlign:'right',fontSize:10,color:C.sub}}>
                      <div>In: {r.arrivedTimeStr}</div>
                      <div style={{color:'var(--green)',fontWeight:600}}>Out: {r.returnedTimeStr}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{padding:'8px 16px',cursor:'pointer',textAlign:'center',fontSize:11,color:'var(--orange)',fontWeight:600}} onClick={()=>setTab('transfer')}>
              View All Transfer Records →
            </div>
          </Panel>
        );
      })()}

      {/* ── MOBILE BOX ── */}
      <Panel>
        <PanelHeader icon="📱" title="Mobile Box" badge={`${(mobileBoxes||[]).length}/${MOBILE_DEPTS.length} · ${totalMobiles} mobiles`} badgeColor="#22c55e"/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)'}}>
          {MOBILE_DEPTS.map((dept,i)=>{
            const rec = (mobileBoxes||[]).find(m=>m.department===dept);
            const isLast = i===MOBILE_DEPTS.length-1;
            return (
              <div key={dept} style={{padding:'12px 8px',textAlign:'center',borderRight:isLast?'none':`1px solid ${C.border}`,background:rec?(dark?'#0a1f0a':'#f0fdf4'):'transparent'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',marginBottom:6,letterSpacing:0.3}}>{dept.replace('/VMC','').replace('Secondary','Sec.')}</div>
                {rec ? <>
                  <div style={{fontSize:20,fontWeight:900,color:'var(--green)'}}>{rec.mobileCount}</div>
                  <div style={{fontSize:9,color:'var(--text-secondary)',marginTop:3}}>{rec.timeStr}</div>
                  <div style={{width:6,height:6,borderRadius:'50%',background:rec.isLate?'#f59e0b':'#22c55e',margin:'4px auto 0'}}/>
                </> : <>
                  <div style={{fontSize:20,fontWeight:900,color:dark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.08)'}}>—</div>
                  <div style={{fontSize:9,color:'var(--red)',fontWeight:700,marginTop:3}}>Pending</div>
                </>}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ── DIESEL + TEA ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
        <Panel>
          <PanelHeader icon="⛽" title="Diesel" badge={dieselLevel!==null?`${dieselLevel}L`:'—'} badgeColor={dieselColor}/>
          <div style={{padding:'14px 16px'}}>
            <div style={{height:8,background:'var(--glass-1)',borderRadius:'var(--radius-md)',overflow:'hidden',marginBottom:8}}>
              <div style={{height:'100%',borderRadius:'var(--radius-md)',background:`linear-gradient(90deg,${dieselColor},${dieselColor}88)`,width:`${dieselPct}%`,transition:'width 0.8s'}}/>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:dieselColor}}>
              {dieselLevel===null?'Not recorded':dieselLevel>50?'✅ Good':dieselLevel>20?'⚠️ Refill Soon':'🚨 Critical'}
            </div>
          </div>
        </Panel>
        <Panel>
          <PanelHeader icon="☕" title="Tea Today" badge={`${(Array.isArray(teaData)?teaData:[]).reduce((a,t)=>a+(t.totalTeas||0),0)} teas`} badgeColor="#a855f7"/>
          <div style={{padding:'12px 16px'}}>
            {['Morning','Afternoon','Evening'].map((s,i)=>{
              const rec = (Array.isArray(teaData)?teaData:[]).find(t=>t.session===s);
              return (
                <div key={s} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:i<2?8:0}}>
                  <span style={{fontSize:11,color:'var(--text-secondary)'}}>{s}{rec?' ✅':''}</span>
                  <span style={{fontSize:13,fontWeight:800,color:rec?'#a855f7':C.sub}}>{rec?rec.totalTeas||0:'—'}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* ══════════════════════════════════════════════
          THREE ACTIVITY FEEDS
      ══════════════════════════════════════════════ */}

      {/* ── VEHICLE ACTIVITY FEED ── */}
      <Panel>
        <PanelHeader icon="🚗" title="Vehicle Activity — Today" badge={todayVehicles.length} badgeColor="#3b82f6"/>
        {todayVehicles.length===0
          ? <div style={{padding:'20px',textAlign:'center',color:'var(--text-secondary)',fontSize:13}}>No vehicles recorded today</div>
          : todayVehicles.map((v,i)=>(
            <ActivityRow key={v.id}
              icon="🚗" iconColor={v.outTime?'#22c55e':'#3b82f6'}
              title={v.comingFrom||v.partyName||'—'}
              sub1={`${v.vehicleNumber} · ${v.driverName}`}
              sub2={`${v.purpose||'—'}${v.materialDetails?' · '+v.materialDetails:''}`}
              entryTime={v.inTime} exitTime={v.outTime}
              status={v.outTime?'exited':'inside'}
              index={i} total={todayVehicles.length}
            />
          ))
        }
      </Panel>

      {/* ── VISITOR ACTIVITY FEED ── */}
      <Panel>
        <PanelHeader icon="👤" title="Visitor Activity — Today" badge={todayVisitors.length} badgeColor="#8b5cf6"/>
        {todayVisitors.length===0
          ? <div style={{padding:'20px',textAlign:'center',color:'var(--text-secondary)',fontSize:13}}>No visitors recorded today</div>
          : todayVisitors.map((v,i)=>{
              const vstatus = v.outTime?'exited':v.approvalStatus==='Approved'?'inside':v.approvalStatus==='Rejected'?'rejected':'pending';
              const vcolor  = v.outTime?'#22c55e':v.approvalStatus==='Approved'?'#8b5cf6':v.approvalStatus==='Rejected'?'#ef4444':'#f59e0b';
              return (
                <ActivityRow key={v.id}
                  icon="👤" iconColor={vcolor}
                  title={`${v.visitorName} → ${v.alubeanToMeet||v.employeeToMeet||'—'}`}
                  sub1={`${v.company||'—'} · ${v.department||'—'}`}
                  sub2={v.purpose||'—'}
                  entryTime={v.approvalStatus==='Approved'?v.inTime||v.createdAt:null}
                  exitTime={v.outTime}
                  status={vstatus}
                  index={i} total={todayVisitors.length}
                />
              );
            })
        }
      </Panel>

      {/* ── INTERNAL MOVEMENT ACTIVITY FEED ── */}
      <Panel>
        <PanelHeader icon="🏭" title="Internal Movement — Today" badge={todayInternal.length} badgeColor="#f97316"/>
        {todayInternal.length===0
          ? <div style={{padding:'20px',textAlign:'center',color:'var(--text-secondary)',fontSize:13}}>No internal movements recorded today</div>
          : todayInternal.map((m,i)=>(
            <ActivityRow key={m.id}
              icon="🏭" iconColor={m.status==='Returned'?'#22c55e':'#f97316'}
              title={`${m.alubean_name||m.employeeName||'—'}${m.destination?' → '+m.destination:''}`}
              sub1={`${m.department} · ${m.movementType}`}
              sub2={`${m.vehicleNumber?'Vehicle: '+m.vehicleNumber:''}${m.remarks?' · '+m.remarks:''}`}
              outTimeStr={m.outTimeStr}
              inTimeStr={m.inTimeStr}
              entryTime={m.outTime}
              exitTime={m.inTime}
              status={m.status==='Returned'?'returned':'out'}
              index={i} total={todayInternal.length}
            />
          ))
        }
      </Panel>

    </div>
  );
}


// ── UNIVERSAL EDIT MODAL ────────────────────────────────────────────────────────
function EditRecordModal({record, colName, fields, onClose, dark}) {
  const [form, setForm] = useState(() => {
    const f = {};
    fields.forEach(field => { f[field.key] = record[field.key] ?? ''; });
    return f;
  });
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const inp = {border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',padding:'8px 12px',fontSize:13,outline:'none',fontFamily:'var(--font-sans)',background:'var(--bg-raised)',color:'var(--text-primary)',width:'100%',boxSizing:'border-box'};

  async function save() {
    setSaving(true);
    try {
      const {updateDoc,doc} = await import('firebase/firestore');
      const {db} = await import('../firebase');
      await updateDoc(doc(db, colName, record.id), form);
      onClose();
    } catch(e) { alert('Save failed: '+e.message); }
    setSaving(false);
  }

  async function deleteRecord() {
    setDeleting(true);
    try {
      const {deleteDoc, doc} = await import('firebase/firestore');
      const {db} = await import('../firebase');
      await deleteDoc(doc(db, colName, record.id));
      onClose();
    } catch(e) { alert('Delete failed: '+e.message); }
    setDeleting(false);
  }

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-xl)',border:'1px solid var(--border-subtle)',boxShadow:'var(--shadow-5)',width:'100%',maxWidth:480,overflow:'hidden'}}>
        <div style={{background:'var(--bg-overlay)',padding:'14px 18px',borderBottom:'1px solid var(--border-subtle)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:800,color:'var(--text-primary)',fontSize:14}}>✏️ Edit Record</span>
          <button onClick={onClose} style={{background:'var(--glass-1)',border:'none',borderRadius:'var(--radius-sm)',width:28,height:28,cursor:'pointer',color:'var(--text-secondary)',fontSize:16}}>×</button>
        </div>
        <div style={{padding:'18px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {fields.map(f=>(
            <div key={f.key} style={{gridColumn:f.full?'1/-1':'auto'}}>
              <label style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>{f.label}</label>
              {f.options ? (
                <select style={{...inp,cursor:'pointer'}} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}>
                  {f.options.map(o=><option key={o}>{o}</option>)}
                </select>
              ) : (
                <input style={inp} type={f.type||'text'} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.label}/>
              )}
            </div>
          ))}
        </div>

        {/* Delete confirm banner */}
        {confirmDel && (
          <div style={{margin:'0 18px 12px',background:'#fef2f2',border:'1.5px solid #fca5a5',borderRadius:'var(--radius-md)',padding:'12px 14px'}}>
            <div style={{fontWeight:800,fontSize:13,color:'#991b1b',marginBottom:8}}>⚠ Delete this record permanently?</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setConfirmDel(false)}
                style={{flex:1,background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',padding:'8px',color:'var(--text-secondary)',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                Cancel
              </button>
              <button onClick={deleteRecord} disabled={deleting}
                style={{flex:1,background:'#dc2626',border:'none',borderRadius:'var(--radius-md)',padding:'8px',color:'#fff',fontSize:12,fontWeight:800,cursor:deleting?'not-allowed':'pointer',fontFamily:'var(--font-sans)'}}>
                {deleting?'⏳ Deleting…':'🗑 Yes, Delete'}
              </button>
            </div>
          </div>
        )}

        <div style={{padding:'12px 18px',borderTop:'1px solid var(--border-subtle)',display:'flex',gap:8}}>
          {!confirmDel && (
            <button onClick={()=>setConfirmDel(true)}
              style={{background:'#fef2f2',border:'1.5px solid #fca5a5',borderRadius:'var(--radius-md)',padding:'8px 14px',color:'#dc2626',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              🗑 Delete
            </button>
          )}
          <div style={{flex:1}}/>
          <button onClick={onClose} style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',padding:'8px 18px',color:'var(--text-secondary)',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{background:'linear-gradient(135deg,var(--green),var(--green-dim))',border:'none',borderRadius:'var(--radius-md)',padding:'8px 18px',color:'#fff',fontSize:12,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'var(--font-sans)'}}>
            {saving?'⏳ Saving...':'✅ Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}


function PowerTab({dark,card,txt,sub,bdr,powerOn,powerStatus,col,userProfile,unit}) {
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editRec, setEditRec] = useState(null);

  useEffect(()=>{
    const q=query(collection(db,col('power')),orderBy('createdAt','desc'),limit(20));
    return onSnapshot(q,s=>setHistory(s.docs.map(d=>({id:d.id,...d.data()}))));
  },[]);

  async function togglePower() {
    setSaving(true);
    try {
      const newStatus = powerOn ? 'OFF' : 'ON';
      await addDoc(collection(db,col('power')), {
        status: newStatus,
        createdAt: serverTimestamp(),
        date: todayStr(),
        recordedBy: userProfile?.name||'Security',
        unit: unit||'u1',
        ...(newStatus==='ON'?{restoredAt:serverTimestamp()}:{}),
      });
      // Notify owner
      await createNotification(unit||'u1', NOTIF_TYPES.TASK_UPDATED, {
        title: newStatus==='OFF'?'⚠️ POWER OFF — Factory':'✅ Power Restored — Factory',
        message: `Power turned ${newStatus} by ${userProfile?.name} at ${timeStr()}`,
        taskId: null,
      });
    } catch(e){alert(e.message);}
    finally{setSaving(false);}
  }

  const outDur = powerStatus && !powerOn ? fmtDur(powerStatus.createdAt, null) : null;

  return (
    <div>
      <h2 style={{margin:'0 0 20px',fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>⚡ Power Monitoring</h2>

      {/* Big toggle */}
      <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:`2px solid ${powerOn?'#16a34a':'#ef4444'}`,padding:'28px',textAlign:'center',marginBottom:20,boxShadow:`0 8px 32px ${powerOn?'rgba(22,163,74,0.2)':'rgba(220,38,38,0.2)'}`}}>
        <div style={{fontSize:48,marginBottom:12}}>{powerOn?'⚡':'🔴'}</div>
        <div style={{fontSize:24,fontWeight:900,color:powerOn?'#16a34a':'#ef4444',marginBottom:4}}>POWER {powerOn?'ON':'OFF'}</div>
        {outDur&&<div style={{fontSize:14,color:'var(--red)',marginBottom:12}}>Outage duration: {outDur}</div>}
        {powerStatus&&<div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:20}}>Recorded by {powerStatus.recordedBy} at {fmtTime(powerStatus.createdAt)}</div>}
        <button onClick={togglePower} disabled={saving}
          style={{background:powerOn?'linear-gradient(135deg,#dc2626,#b91c1c)':'linear-gradient(135deg,#16a34a,#15803d)',border:'none',borderRadius:'var(--radius-lg)',padding:'16px 40px',color:'#fff',fontSize:18,fontWeight:800,cursor:saving?'not-allowed':'pointer',fontFamily:'var(--font-sans)',boxShadow:'0 6px 20px rgba(0,0,0,0.3)',letterSpacing:1}}>
          {saving?'Saving...':powerOn?'🔴 MARK POWER OFF':'✅ MARK POWER ON'}
        </button>
      </div>

      {/* History */}
      <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',overflow:'hidden'}}>
        <div style={{background:'#1F3864',padding:'10px 16px',color:'#fff',fontSize:12,fontWeight:700}}>Power Log — Today</div>
        {history.filter(h=>h.date===todayStr()).length===0?<div style={{padding:'20px',color:'var(--text-secondary)',textAlign:'center'}}>No records today</div>
        :history.filter(h=>h.date===todayStr()).map((h,i)=>(
          <div key={h.id} style={{display:'flex',alignItems:'center',padding:'10px 16px',borderBottom:`1px solid ${bdr}`,background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc'),gap:12}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:h.status==='ON'?'#16a34a':'#ef4444',flexShrink:0}}/>
            <div style={{flex:1}}>
              <span style={{fontWeight:700,color:h.status==='ON'?'#16a34a':'#ef4444'}}>Power {h.status}</span>
              <span style={{color:'var(--text-secondary)',fontSize:12,marginLeft:8}}>by {h.recordedBy}</span>
            </div>
            <div style={{fontSize:12,color:'var(--text-secondary)'}}>{fmtTime(h.createdAt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MOBILE BOX TAB ────────────────────────────────────────────────────────────
function MobileBoxTab({dark,card,txt,sub,bdr,col,userProfile,unit}) {
  const isOwner = userProfile?.role === 'owner' || ['owner@alubee.com','md@alubee.com','jmd@alubee.com'].includes(userProfile?.email);
  const [counts, setCounts] = useState({'PDC':'','Fettling':'','CNC/VMC':'','Secondary':'','Final':''});
  const [savedBoxes, setSavedBoxes] = useState({});
  const [boxDocs, setBoxDocs] = useState({}); // store full docs with IDs for editing
  const [saving, setSaving] = useState(null);
  const [editRec, setEditRec] = useState(null);
  const colName = `security_mobilebox_${unit==='u2'?'u2':'u1'}`;

  useEffect(()=>{
    const loadData = async () => {
      const {collection,query,where,onSnapshot} = await import('firebase/firestore');
      const {db} = await import('../firebase');
      const q = query(collection(db, colName), where('date','==',todayStr()));
      return onSnapshot(q, snap=>{
        const boxes = {};
        const docs = {};
        snap.docs.forEach(d=>{
          const data = d.data();
          if(data.department) {
            boxes[data.department] = {count:data.mobileCount, time:data.timeStr, isLate:data.isLate};
            docs[data.department] = {id:d.id, ...data};
          }
        });
        setSavedBoxes(boxes);
        setBoxDocs(docs);
      });
    };
    let unsub;
    loadData().then(u=>{ unsub=u; });
    return ()=>{ if(unsub) unsub(); };
  },[colName]);

  async function markReceived(dept) {
    const count = parseInt(counts[dept])||0;
    if(!count) { alert('Enter number of mobiles for ' + dept); return; }
    setSaving(dept);
    const now = new Date();
    const isLate = now.getHours()>9||(now.getHours()===9&&now.getMinutes()>30);
    const timeRecorded = now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    setSavedBoxes(prev=>({...prev,[dept]:{count,time:timeRecorded,isLate}}));
    setCounts(prev=>({...prev,[dept]:''}));
    try {
      const {collection,addDoc,serverTimestamp} = await import('firebase/firestore');
      const {db} = await import('../firebase');
      await addDoc(collection(db,colName),{
        department:dept, date:todayStr(), receivedAt:serverTimestamp(),
        mobileCount:count, isLate,
        receivedBy:userProfile?.name||'Security',
        timeStr:timeRecorded,
        unit:unit||'u1',
      });
    } catch(e){
      alert(e.message);
      setSavedBoxes(prev=>{const n={...prev};delete n[dept];return n;});
    }
    finally{ setSaving(null); }
  }

  const totalMobiles = Object.values(savedBoxes).reduce((a,b)=>a+(parseInt(b.count)||0),0);
  const submittedCount = Object.keys(savedBoxes).length;
  const lateCount = Object.values(savedBoxes).filter(b=>b.isLate).length;

  return (
    <div>
      <h2 style={{margin:'0 0 4px',fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>📱 Mobile Box Tracking</h2>
      <p style={{margin:'0 0 16px',fontSize:12,color:'var(--text-secondary)'}}>Deadline: 9:30 AM · {new Date().toLocaleDateString('en-IN')}</p>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
        {[
          {l:'Submitted', v:`${submittedCount}/${DEPARTMENTS_LIST.length}`, c:'#16a34a', bg:dark?'#052d14':'#f0fdf4'},
          {l:'Total Mobiles', v:totalMobiles, c:'#3b82f6', bg:dark?'#1e1b4b':'#eff6ff'},
          {l:'Late', v:lateCount, c:lateCount>0?'#d97706':'#16a34a', bg:dark?'#2d2005':'#fffbeb'},
        ].map(k=>(
          <div key={k.l} style={{background:k.bg,borderRadius:'var(--radius-md)',padding:'14px 12px',textAlign:'center'}}>
            <div style={{fontSize:22,fontWeight:900,color:k.c}}>{k.v}</div>
            <div style={{fontSize:9,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',marginTop:4}}>{k.l}</div>
          </div>
        ))}
      </div>

      <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',overflow:'hidden'}}>
        {/* Header */}
        <div style={{background:'#1F3864',padding:'12px 16px',display:'flex',gap:8,color:'#fff',fontSize:11,fontWeight:700}}>
          <span style={{flex:1}}>Department</span>
          <span style={{width:120,textAlign:'center'}}>{isOwner?'Mobiles':'Enter Mobiles'}</span>
          <span style={{width:120,textAlign:'center'}}>Status</span>
          <span style={{width:70,textAlign:'right'}}>Time</span>
        </div>

        {DEPARTMENTS_LIST.map((dept,i)=>{
          const rec = savedBoxes[dept];
          return (
            <div key={dept} style={{display:'flex',alignItems:'center',gap:8,padding:'14px 16px',borderBottom:`1px solid ${bdr}`,background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
              <span style={{flex:1,fontWeight:700,color:'var(--text-primary)',fontSize:14}}>{dept}</span>

              {/* Count input or display */}
              <div style={{width:120,display:'flex',justifyContent:'center'}}>
                {rec
                  ? <span style={{fontWeight:900,color:'var(--accent)',fontSize:24}}>{rec.count}</span>
                  : isOwner
                    ? <span style={{color:'var(--text-secondary)',fontSize:12}}>—</span>
                    : <input
                        type="number"
                        inputMode="numeric"
                        value={counts[dept]||''}
                        onChange={e=>setCounts(prev=>({...prev,[dept]:e.target.value}))}
                        placeholder="0"
                        style={{width:80,border:'2px solid #3b82f6',borderRadius:'var(--radius-md)',padding:'8px',fontSize:16,fontWeight:700,textAlign:'center',outline:'none',fontFamily:'var(--font-sans)',background:'var(--bg-raised)',color:dark?'#e2e8f0':'#1a1a2e'}}
                      />
                }
              </div>

              {/* Status / Button */}
              <div style={{width:120,display:'flex',justifyContent:'center'}}>
                {rec
                  ? <span style={{background:rec.isLate?'#fef3c7':'#f0fdf4',color:rec.isLate?'#d97706':'#16a34a',fontWeight:700,fontSize:11,padding:'5px 12px',borderRadius:20}}>
                      {rec.isLate?'⚠ Late':'✅ On Time'}
                    </span>
                  : isOwner
                    ? <span style={{color:'var(--text-secondary)',fontSize:11}}>Pending</span>
                    : <button
                        onClick={()=>markReceived(dept)}
                        disabled={saving===dept||!counts[dept]}
                        style={{background:saving===dept?'#999':!counts[dept]?'#9ca3af':'#16a34a',border:'none',borderRadius:'var(--radius-md)',padding:'8px 16px',color:'#fff',fontSize:13,fontWeight:700,cursor:saving===dept||!counts[dept]?'not-allowed':'pointer',fontFamily:'var(--font-sans)',whiteSpace:'nowrap'}}>
                        {saving===dept?'⏳ Saving':'✓ Received'}
                      </button>
                }
              </div>

              <span style={{width:70,textAlign:'right',fontSize:12,color:'var(--text-secondary)',fontWeight:600}}>{rec?rec.time:'—'}</span>
              {rec&&boxDocs[dept]&&<button onClick={()=>setEditRec(boxDocs[dept])} style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-sm)',padding:'5px 8px',color:'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'var(--font-sans)',flexShrink:0}}>✎</button>}
            </div>
          );
        })}
      </div>
      {editRec&&<EditRecordModal record={editRec} colName={colName} onClose={()=>setEditRec(null)} dark={dark} fields={[
        {key:'mobileCount', label:'Mobile Count', type:'number'},
        {key:'timeStr',     label:'Time Received (HH:MM)', type:'time'},
        {key:'department',  label:'Department'},
        {key:'receivedBy',  label:'Received By'},
      ]}/>}
    </div>
  );
}

function VehicleTab({dark,card,txt,sub,bdr,vehicles,vehiclesInside,col,userProfile,unit,isMobile,dcApprovals=[]}) {
  const [form, setForm] = useState({vehicleNumber:'',vehicleType:VEHICLE_TYPES[0],driverName:'',contactNumber:'',comingFrom:'',purpose:PURPOSES[0],materialDetails:''});
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('log'); // default to log
  const [editRec, setEditRec] = useState(null);

  const inp = {border:'1px solid #d1d5db',borderRadius:'var(--radius-md)',padding:'9px 12px',fontSize:13,outline:'none',fontFamily:'var(--font-sans)',background:'#ffffff',color:'#111827',width:'100%',boxSizing:'border-box'};
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  async function markEntry() {
    if(!form.vehicleNumber||!form.driverName) return alert('Vehicle number and driver name required');
    setSaving(true);
    try {
      await addDoc(collection(db,col('vehicles')),{
        vehicleNumber:form.vehicleNumber, vehicleType:form.vehicleType, driverName:form.driverName,
        contactNumber:form.contactNumber, comingFrom:form.comingFrom, purpose:form.purpose,
        materialDetails:form.materialDetails,
        inTime:serverTimestamp(), date:todayStr(),
        recordedBy:userProfile?.name||'Security', outTime:null,
      });
      // Notify owner
      const {createNotification,NOTIF_TYPES}=await import('../utils/notificationService');
      await createNotification(unit||'u1', NOTIF_TYPES.VEHICLE, {
        title:`🚗 Vehicle Entry`,
        message:`${form.vehicleNumber} | ${form.comingFrom?form.comingFrom+' — ':'' }Driver: ${form.driverName} | ${form.purpose}${form.materialDetails?' | '+form.materialDetails:''}`,
        taskId:null,
      });
      setForm({vehicleNumber:'',vehicleType:VEHICLE_TYPES[0],driverName:'',contactNumber:'',comingFrom:'',purpose:PURPOSES[0],materialDetails:''});
    } catch(e){alert(e.message);}
    finally{setSaving(false);}
  }

  const [dcModal, setDcModal] = useState(null); // vehicle record awaiting DC entry

  async function markExit(id) {
    // Check if this vehicle already has an approved DC
    const veh = vehicles.find(x=>x.id===id);
    const outgoingPurposes = ['Heat Treatment','Nitriding','Cylindrical Grinding','VMC Material','Fabrication Support','FG Dispatch to Customer','Sample Dispatch','Die Maintenance & Repair'];
    const needsDC = veh && outgoingPurposes.some(p=>veh.purpose===p);
    const existingDC = dcApprovals.find(d=>d.vehicleId===id && d.status==='Approved');
    const pendingDC  = dcApprovals.find(d=>d.vehicleId===id && d.status==='Pending');

    if(needsDC && !existingDC) {
      if(pendingDC) {
        alert('⏳ DC #' + pendingDC.dcNumber + ' is awaiting approval. Vehicle cannot exit until it is approved by the owner.');
        return;
      }
      // Prompt for DC entry
      setDcModal(veh);
      return;
    }
    try {
      await updateDoc(doc(db,col('vehicles'),id),{outTime:serverTimestamp(),exitRecordedBy:userProfile?.name});
      const v = vehicles.find(x=>x.id===id);
      if(v){
        const {createNotification,NOTIF_TYPES}=await import('../utils/notificationService');
        await createNotification(unit||'u1', NOTIF_TYPES.TASK_UPDATED, {
          title:`🚗 Vehicle Exit`,
          message:`${v.vehicleNumber}${v.comingFrom?' ('+v.comingFrom+')':''} — ${v.driverName} exited after ${fmtDur(v.inTime,null)} | ${v.purpose}`,
          taskId:null,
        });
      }
    } catch(e){alert(e.message);}
  }

  async function doExitAfterDC(vehicleId) {
    try {
      await updateDoc(doc(db,col('vehicles'),vehicleId),{outTime:serverTimestamp(),exitRecordedBy:userProfile?.name});
    } catch(e){alert(e.message);}
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <h2 style={{margin:0,fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>🚗 Vehicle Register</h2>
        <div style={{display:'flex',gap:6}}>
          {['entry','log'].map(v=><button key={v} onClick={()=>setView(v)} style={{background:view===v?'#f97316':'transparent',border:`1px solid ${view===v?'#f97316':dark?'#2d3748':'#e8e8e8'}`,borderRadius:'var(--radius-md)',padding:'6px 14px',color:view===v?'#fff':sub,fontSize:12,cursor:'pointer',fontFamily:'var(--font-sans)'}}>{v==='entry'?'+ Entry':'📋 Log'}</button>)}
        </div>
      </div>

      {view==='entry'&&(
        <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',padding:'20px'}}>
          {/* Quick supplier buttons */}
          <div style={{marginBottom:14}}>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:6,display:'block'}}>Quick Supplier Select</label>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {QUICK_SUPPLIERS.map(s=>(
                <button key={s.label} onClick={()=>set('comingFrom',s.from)}
                  style={{background:form.comingFrom===s.from?'#f97316':'transparent',border:`1px solid ${form.comingFrom===s.from?'#f97316':dark?'#2d3748':'#e8e8e8'}`,borderRadius:20,padding:'5px 12px',color:form.comingFrom===s.from?'#fff':sub,fontSize:12,cursor:'pointer',fontFamily:'var(--font-sans)',fontWeight:form.comingFrom===s.from?700:400}}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12}}>
            {[['Vehicle Number *','vehicleNumber','text','e.g. TN 39 AB 1234'],
              ['Driver / Person Name *','driverName','text','Full name'],
              ['Contact Number','contactNumber','tel','Phone number'],
              ['Coming From','comingFrom','text','City / Company']].map(([l,k,t,p])=>(
              <div key={k}>
                <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>{l}</label>
                <input style={inp} type={t} value={form[k]} onChange={e=>set(k,e.target.value)} placeholder={p}/>
              </div>
            ))}
            {[['Vehicle Type','vehicleType',VEHICLE_TYPES],['Purpose','purpose',PURPOSES]].map(([l,k,opts])=>(
              <div key={k}>
                <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>{l}</label>
                <select style={{...inp,cursor:'pointer'}} value={form[k]} onChange={e=>set(k,e.target.value)}>
                  {opts.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div style={{gridColumn:isMobile?'1':'1/-1'}}>
              <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Material / Goods Details</label>
              <input style={inp} value={form.materialDetails} onChange={e=>set('materialDetails',e.target.value)} placeholder="Optional — describe goods if any"/>
            </div>
          </div>
          <button onClick={markEntry} disabled={saving}
            style={{marginTop:16,background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:'var(--radius-md)',padding:'12px 28px',color:'#fff',fontSize:14,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'var(--font-sans)'}}>
            {saving?'⏳ Recording...':'✅ Record Entry'}
          </button>
        </div>
      )}

      {view==='log'&&(
        <div>
          {/* VEHICLES INSIDE — exit button prominent */}
          {vehiclesInside.length>0&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:'var(--orange)',marginBottom:8}}>🔴 Currently Inside ({vehiclesInside.length}) — tap to mark exit</div>
              {vehiclesInside.map(v=>(
                <div key={v.id} style={{background:'var(--bg-raised)',borderRadius:'var(--radius-md)',border:'2px solid rgba(249,115,22,0.4)',padding:'12px 16px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,color:'var(--text-primary)',fontSize:14}}>{v.vehicleNumber} <span style={{fontWeight:400,fontSize:12,color:'var(--text-secondary)'}}>· {v.comingFrom||v.vehicleType}</span></div>
                    <div style={{fontSize:12,color:'var(--text-secondary)'}}>{v.driverName} · {v.purpose}</div>
                    <div style={{fontSize:11,color:'#d97706',marginTop:2}}>⏱ {fmtDur(v.inTime,null)} inside · In: {fmtTime(v.inTime)}</div>
                  </div>
                  <button onClick={()=>markExit(v.id)}
                    style={{background:'linear-gradient(135deg,var(--green),var(--green-dim))',border:'none',borderRadius:'var(--radius-md)',padding:'10px 16px',color:'#fff',fontSize:12,fontWeight:800,cursor:'pointer',fontFamily:'var(--font-sans)',whiteSpace:'nowrap'}}>
                    🚪 Exit
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* All today */}
          <div style={{fontSize:13,fontWeight:700,color:'var(--text-secondary)',marginBottom:8}}>All Today ({vehicles.filter(v=>v.date===todayStr()).length})</div>
          {vehicles.filter(v=>v.date===todayStr()).map((v,i)=>(
            <div key={v.id} style={{background:'var(--bg-raised)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',padding:'10px 14px',marginBottom:6,display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:v.outTime?'#16a34a':'#f97316',flexShrink:0}}/>
              <div style={{flex:1}}>
                <span style={{fontWeight:700,color:'var(--text-primary)'}}>{v.vehicleNumber}</span>
                <span style={{color:'var(--text-secondary)',fontSize:12,marginLeft:8}}>{v.driverName}</span>
                <div style={{fontSize:11,color:'var(--text-secondary)'}}>{v.comingFrom||'—'} · {v.purpose||'—'}</div>
              </div>
              <div style={{fontSize:11,color:'var(--text-secondary)',textAlign:'right',marginRight:6}}>
                <div>In {fmtTime(v.inTime)}{v.outTime?` · Out ${fmtTime(v.outTime)}`:' · Inside'}</div>
                {v.outTime&&<div style={{color:'var(--green-dim)'}}>{fmtDur(v.inTime,v.outTime)}</div>}
              </div>
              <button onClick={()=>setEditRec(v)} style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-sm)',padding:'5px 9px',color:'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'var(--font-sans)',flexShrink:0}}>✎</button>
            </div>
          ))}
          {editRec&&<EditRecordModal record={editRec} colName={col('vehicles')} onClose={()=>setEditRec(null)} dark={dark} fields={[
            {key:'vehicleNumber',label:'Vehicle Number'},
            {key:'vehicleType',  label:'Vehicle Type',options:VEHICLE_TYPES},
            {key:'driverName',   label:'Driver Name'},
            {key:'contactNumber',label:'Contact Number'},
            {key:'comingFrom',   label:'Supplier/Customer'},
            {key:'purpose',      label:'Purpose',options:PURPOSES},
            {key:'materialDetails',label:'Material Details',full:true},
          ]}/> }
        </div>
      )}
      {dcModal && <DCEntryModal vehicle={dcModal} unit={unit} userProfile={userProfile} onClose={()=>setDcModal(null)}
        onSubmitted={async (dcId)=>{ setDcModal(null); alert('DC submitted for approval. Vehicle cannot exit until owner approves.'); }}/>}
    </div>
  );
}

// ── VISITOR TAB ───────────────────────────────────────────────────────────────
function VisitorTab({dark,card,txt,sub,bdr,visitors,pendingVisitors,col,userProfile,unit,isOwner,isMobile}) {
  const [form, setForm] = useState({visitorName:'',company:'',phone:'',purpose:'',alubeanToMeet:'',department:''});
  const [saving, setSaving] = useState(false);
  const [editRec, setEditRec] = useState(null);
  const [view, setView] = useState(pendingVisitors.length>0?'pending':'entry');

  const inp = {border:'1px solid #d1d5db',borderRadius:'var(--radius-md)',padding:'9px 12px',fontSize:13,outline:'none',fontFamily:'var(--font-sans)',background:'#ffffff',color:'#111827',width:'100%',boxSizing:'border-box'};
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  async function submitVisitor() {
    if(!form.visitorName||!form.alubeanToMeet) return alert('Visitor name and alubean to meet are required');
    setSaving(true);
    try {
      await addDoc(collection(db,col('visitors')),{
        ...form, approvalStatus:'Pending', createdAt:serverTimestamp(),
        date:todayStr(), recordedBy:userProfile?.name||'Security',
        inTime:null, outTime:null,
      });
      // Notify owner
      await createNotification(unit||'u1', NOTIF_TYPES.VISITOR, {
        title:`👤 Visitor Approval Required`,
        message:`${form.visitorName} from ${form.company||'—'} → ${form.alubeanToMeet} (${form.department||'—'}) | Purpose: ${form.purpose} | Recorded by ${userProfile?.name}`,
        taskId:null,
        pendingApproval:true,
      });
      setForm({visitorName:'',company:'',phone:'',purpose:'',alubeanToMeet:'',department:'',idProof:''});
      setView('pending');
    } catch(e){alert(e.message);}
    finally{setSaving(false);}
  }

  async function approveVisitor(id) {
    await updateDoc(doc(db,col('visitors'),id),{approvalStatus:'Approved',approvedBy:userProfile?.name,approvedAt:serverTimestamp(),inTime:serverTimestamp()});
  }
  async function rejectVisitor(id) {
    await updateDoc(doc(db,col('visitors'),id),{approvalStatus:'Rejected',rejectedBy:userProfile?.name,rejectedAt:serverTimestamp()});
  }

  const STATUS_STYLE = {Approved:{bg:'#f0fdf4',color:'var(--green-dim)'},Pending:{bg:'#fffbeb',color:'#d97706'},Rejected:{bg:'#fef2f2',color:'var(--red-dim)'}};

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <h2 style={{margin:0,fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>👤 Visitor Approval</h2>
        <div style={{display:'flex',gap:6}}>
          {['entry','pending','inside','log'].map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{position:'relative',background:view===v?'#f97316':'transparent',border:`1px solid ${view===v?'#f97316':dark?'#2d3748':'#e8e8e8'}`,borderRadius:'var(--radius-md)',padding:'6px 12px',color:view===v?'#fff':sub,fontSize:11,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              {v==='pending'?`⏳ Pending`:v==='log'?'📋 Log':v==='inside'?'🏢 Inside':'+ New'}
              {v==='pending'&&pendingVisitors.length>0&&<span style={{position:'absolute',top:-5,right:-5,background:'var(--red)',color:'#fff',borderRadius:'50%',width:14,height:14,fontSize:8,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{pendingVisitors.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* VISITORS INSIDE — always shown at top if any */}
      {visitors.filter(v=>v.approvalStatus==='Approved'&&!v.outTime&&(v.date===todayStr()||v.fromRequest)).length>0&&view!=='entry'&&view!=='pending'&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,color:'#8b5cf6',marginBottom:8}}>🏢 Currently Inside — tap to mark exit</div>
          {visitors.filter(v=>v.approvalStatus==='Approved'&&!v.outTime&&(v.date===todayStr()||v.fromRequest)).map(v=>(
            <div key={v.id} style={{background:'var(--bg-raised)',borderRadius:'var(--radius-md)',border:'2px solid rgba(139,92,246,0.4)',padding:'12px 16px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,color:'var(--text-primary)',fontSize:14}}>{v.visitorName} <span style={{fontWeight:400,fontSize:11,color:'var(--text-secondary)'}}>· {v.company}</span></div>
                <div style={{fontSize:12,color:'var(--text-secondary)'}}>Meeting {v.alubeanToMeet} · {v.purpose}</div>
                <div style={{fontSize:11,color:'#8b5cf6',marginTop:2}}>⏱ {fmtDur(v.inTime||v.createdAt,null)} inside · In: {fmtTime(v.inTime||v.createdAt)}</div>
              </div>
              <button onClick={async()=>{
                try{
                  await updateDoc(doc(db,col('visitors'),v.id),{outTime:serverTimestamp(),exitRecordedBy:userProfile?.name});
                  await createNotification(unit||'u1',NOTIF_TYPES.VISITOR,{
                    title:'👤 Visitor Exited',
                    message:`${v.visitorName} (met ${v.alubeanToMeet}) exited after ${fmtDur(v.inTime||v.createdAt,null)}. By ${userProfile?.name}`,
                    taskId:null,
                  });
                }catch(e){alert(e.message);}
              }} style={{background:'linear-gradient(135deg,var(--green),var(--green-dim))',border:'none',borderRadius:'var(--radius-md)',padding:'10px 16px',color:'#fff',fontSize:12,fontWeight:800,cursor:'pointer',fontFamily:'var(--font-sans)',whiteSpace:'nowrap'}}>
                🚪 Exit
              </button>
            </div>
          ))}
        </div>
      )}

      {view==='entry'&&(
        <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',padding:'20px'}}>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12}}>
            {[['Visitor Name *','visitorName','Full name'],['Company / Organisation','company','Company name'],['Phone Number','phone','Mobile number'],['Purpose of Visit *','purpose','Reason for visit'],['Alubean to Meet *','alubeanToMeet','Alubean name'],['Department','department','Which department']].map(([l,k,p])=>(
              <div key={k}>
                <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>{l}</label>
                <input style={inp} value={form[k]} onChange={e=>set(k,e.target.value)} placeholder={p}/>
              </div>
            ))}
          </div>
          <button onClick={submitVisitor} disabled={saving}
            style={{marginTop:16,background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:'var(--radius-md)',padding:'12px 28px',color:'#fff',fontSize:14,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'var(--font-sans)'}}>
            {saving?'⏳ Submitting...':'📤 Submit for Approval'}
          </button>
        </div>
      )}

      {view==='pending'&&(
        <div>
          {pendingVisitors.length===0?<div style={{textAlign:'center',padding:'40px',color:'var(--text-secondary)'}}>✅ No pending approvals</div>
          :pendingVisitors.map(v=>(
            <div key={v.id} style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'2px solid #f59e0b',padding:'16px',marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                <div>
                  <div style={{fontWeight:800,color:'var(--text-primary)',fontSize:15}}>{v.visitorName}</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)'}}>{v.company} · {v.phone}</div>
                </div>
                <span style={{background:'#fffbeb',color:'#d97706',fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>⏳ Pending</span>
              </div>
              <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                <span>👤 To meet: <strong style={{color:'var(--text-primary)'}}>{v.alubeanToMeet}</strong></span>
                <span>🏭 Dept: {v.department}</span>
                <span>📋 Purpose: {v.purpose}</span>
                <span>🪪 ID: {v.idProof||'Not provided'}</span>
                <span>🕐 Arrived: {fmtTime(v.createdAt)}</span>
              </div>
              {isOwner
                ? <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>approveVisitor(v.id)} style={{flex:1,background:'var(--green)',border:'none',borderRadius:'var(--radius-md)',padding:'10px',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✅ Approve Entry</button>
                    <button onClick={()=>rejectVisitor(v.id)} style={{flex:1,background:'var(--red)',border:'none',borderRadius:'var(--radius-md)',padding:'10px',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>❌ Reject</button>
                  </div>
                : <div style={{fontSize:12,color:'#d97706',fontWeight:700,padding:'8px 0'}}>⏳ Awaiting JMD approval — notification sent</div>
              }
            </div>
          ))}
        </div>
      )}

      {view==='log'&&(
        <div>
          {visitors.filter(v=>v.date===todayStr()||v.fromRequest).map((v,i)=>{
            const ss=STATUS_STYLE[v.approvalStatus]||STATUS_STYLE.Pending;
            return (
              <div key={v.id} style={{background:'var(--bg-raised)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',padding:'12px 16px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:'var(--text-primary)'}}>{v.visitorName} <span style={{fontWeight:400,color:'var(--text-secondary)',fontSize:12}}>→ {v.alubeanToMeet}</span></div>
                  <div style={{fontSize:11,color:'var(--text-secondary)'}}>{v.purpose} · {fmtTime(v.createdAt)}</div>
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{background:ss.bg,color:ss.color,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20,whiteSpace:'nowrap'}}>{v.approvalStatus}</span>
                  {v.approvalStatus==='Approved'&&!v.outTime&&<button onClick={async()=>{const {updateDoc,doc,serverTimestamp}=await import('firebase/firestore');const {db}=await import('../firebase');await updateDoc(doc(db,col('visitors'),v.id),{outTime:serverTimestamp(),exitRecordedBy:userProfile?.name});
                  await createNotification(unit||'u1', NOTIF_TYPES.VISITOR, {
                    title:'👤 Visitor Exited',
                    message:`${v.visitorName||'Visitor'} (met ${v.alubeanToMeet||'—'}) has exited. Recorded by ${userProfile?.name}`,
                    taskId:null,
                  });}} style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'var(--radius-sm)',padding:'3px 8px',color:'var(--red-dim)',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)',whiteSpace:'nowrap'}}>Exit</button>}
                  {v.outTime&&<span style={{fontSize:10,color:'var(--green-dim)',fontWeight:600}}>Out {fmtTime(v.outTime)}</span>}
                  <button onClick={()=>setEditRec(v)} style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-sm)',padding:'3px 8px',color:'var(--text-secondary)',fontSize:10,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✎</button>
                </div>
              </div>
            );
          })}
          {visitors.filter(v=>v.date===todayStr()||v.fromRequest).length===0&&<div style={{textAlign:'center',padding:'40px',color:'var(--text-secondary)'}}>No visitors today</div>}
        </div>
      )}
      {editRec&&<EditRecordModal record={editRec} colName={col('visitors')} onClose={()=>setEditRec(null)} dark={dark} fields={[
        {key:'visitorName',  label:'Visitor Name'},
        {key:'company',      label:'Company / Organisation'},
        {key:'phone',        label:'Phone Number'},
        {key:'purpose',      label:'Purpose'},
        {key:'alubeanToMeet',label:'Alubean to Meet'},
        {key:'department',   label:'Department'},
        {key:'approvalStatus',label:'Approval Status', options:['Pending','Approved','Rejected']},
      ]}/>}
    </div>
  );
}

// ── TEA TAB ───────────────────────────────────────────────────────────────────
const ALL_DEPTS_TEA = ['PDC','PDC Maintenance','CNC/VMC','Fettling','Secondary','Assembly','Final','Dispatch','Maintenance','Stores','Toolroom','Design','NPD/Quality','PPC','ERP','Accounts','HR','Shotblasting','Fabrication','Security'];

function TeaTab({dark,card,txt,sub,bdr,col,userProfile,unit}) {
  const [session, setSession] = useState('Morning');
  const [dist, setDist] = useState(ALL_DEPTS_TEA.map(d=>({dept:d,qty:''})));
  const [saving, setSaving] = useState(false);
  const [editRec, setEditRec] = useState(null);
  const [history, setHistory] = useState([]);

  const inp={border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',padding:'7px 10px',fontSize:14,fontWeight:700,outline:'none',fontFamily:'var(--font-sans)',background:'var(--bg-raised)',color:dark?'#e2e8f0':'#1a1a2e',width:80,textAlign:'center',boxSizing:'border-box'};

  useEffect(()=>{
    const q = query(collection(db,col('tea')),orderBy('arrivalTime','desc'),limit(15));
    return onSnapshot(q,s=>setHistory(s.docs.map(d=>({id:d.id,...d.data()}))));
  },[]);

  const submittedSessions = history.filter(h=>h.date===todayStr()).map(h=>h.session);
  const sessionLocked = submittedSessions.includes(session);
  const totalTeas = dist.reduce((a,d)=>a+(parseInt(d.qty)||0),0);

  async function saveTea() {
    if(!totalTeas) return alert('Enter at least one department quantity');
    setSaving(true);
    try {
      await addDoc(collection(db,col('tea')),{
        session, vendor:'Regular Vendor',
        distribution: dist.filter(d=>parseInt(d.qty)>0),
        totalTeas, date: todayStr(),
        submittedBy: userProfile?.name,
        arrivalTime: serverTimestamp(),
      });
      setDist(ALL_DEPTS_TEA.map(d=>({dept:d,qty:''})));
      // Notify owner
      await createNotification(unit||'u1', NOTIF_TYPES.TEA, {
        title:`☕ Tea Entry — ${session} Session`,
        message:`${totalTeas} teas distributed across ${dist.filter(d=>parseInt(d.qty)>0).length} departments. Recorded by ${userProfile?.name}`,
        taskId:null,
      });
    } catch(e){alert(e.message);}
    finally{setSaving(false);}
  }

  const todayHistory = history.filter(h=>h.date===todayStr());
  const sessionTotals = ['Morning','Afternoon','Evening'].map(s=>({
    session:s, total: todayHistory.filter(h=>h.session===s).reduce((a,h)=>a+(h.totalTeas||0),0)
  }));

  return (
    <div>
      <h2 style={{margin:'0 0 4px',fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>☕ Tea Distribution Tracking</h2>
      <p style={{margin:'0 0 16px',fontSize:12,color:'var(--text-secondary)'}}>{new Date().toLocaleDateString('en-IN')} · Enter number of teas per department</p>

      {/* Session summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
        {sessionTotals.map(s=>(
          <div key={s.session} onClick={()=>setSession(s.session)}
            style={{background:s.session===session?(dark?'rgba(249,115,22,0.15)':'#fff7ed'):(dark?'#1e2235':'#f8f9fc'),borderRadius:'var(--radius-md)',padding:'12px',textAlign:'center',border:`2px solid ${s.session===session?'#f97316':'transparent'}`,cursor:'pointer'}}>
            <div style={{fontSize:22,fontWeight:900,color:s.session==='Morning'?'#d97706':s.session==='Afternoon'?'#3b82f6':'#16a34a'}}>{s.total||0}</div>
            <div style={{fontSize:10,color:'var(--text-secondary)',fontWeight:700,marginTop:3}}>{s.session}</div>
          </div>
        ))}
      </div>

      {/* Entry panel */}
      <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',overflow:'hidden',marginBottom:16}}>
        <div style={{background:'#1F3864',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{color:'#fff',fontWeight:800,fontSize:14}}>Entry — {session} Session</span>
          <div style={{display:'flex',gap:6}}>
            {['Morning','Afternoon','Evening'].map(s=>{
              const done = submittedSessions.includes(s);
              return <button key={s} onClick={()=>setSession(s)} style={{background:session===s?'#f97316':'rgba(255,255,255,0.1)',border:'none',borderRadius:20,padding:'5px 12px',color:done?'rgba(255,255,255,0.5)':'#fff',fontSize:11,fontWeight:session===s?700:400,cursor:'pointer',fontFamily:'var(--font-sans)'}}>{done?'✅':''}{s}</button>;
            })}
          </div>
        </div>
        <div style={{background:dark?'#151929':'#f8f9fc',padding:'10px 16px',display:'flex',justifyContent:'flex-end',borderBottom:`1px solid ${bdr}`}}>
          <span style={{fontSize:16,fontWeight:900,color:totalTeas>0?'#16a34a':sub}}>Total: {totalTeas} teas</span>
        </div>
        <div style={{maxHeight:420,overflowY:'auto'}}>
          {dist.map((d,i)=>(
            <div key={d.dept} style={{display:'grid',gridTemplateColumns:'1fr 100px',alignItems:'center',padding:'9px 16px',borderBottom:`1px solid ${bdr}`,background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
              <span style={{fontSize:13,color:'var(--text-primary)',fontWeight:parseInt(d.qty)>0?700:400}}>{d.dept}</span>
              <input style={inp} type="number" inputMode="numeric" value={d.qty}
                onChange={e=>setDist(dist.map((x,j)=>j===i?{...x,qty:e.target.value}:x))} placeholder="0"/>
            </div>
          ))}
        </div>
        <div style={{padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderTop:`1px solid ${bdr}`}}>
          <span style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>Total: <span style={{color:'var(--green-dim)',fontSize:18,fontWeight:900}}>{totalTeas} teas</span></span>
          <button onClick={saveTea} disabled={saving||!totalTeas}
            style={{background:saving||!totalTeas?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:'var(--radius-md)',padding:'11px 24px',color:'#fff',fontSize:13,fontWeight:700,cursor:saving||!totalTeas?'not-allowed':'pointer',fontFamily:'var(--font-sans)'}}>
            {sessionLocked?'✅ Already Saved':saving?'⏳ Saving...':'💾 Save Tea Record'}
          </button>
        </div>
      </div>

      {todayHistory.length>0&&(
        <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',overflow:'hidden'}}>
          <div style={{background:'#1F3864',padding:'10px 16px',color:'#fff',fontSize:12,fontWeight:700}}>Today's Records</div>
          {todayHistory.map((h,i)=>(
            <div key={h.id} style={{padding:'10px 16px',borderBottom:`1px solid ${bdr}`,background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc'),display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div><span style={{fontWeight:700,color:'var(--text-primary)'}}>{h.session}</span><span style={{color:'var(--text-secondary)',fontSize:12,marginLeft:10}}>{h.distribution?.length||0} depts · by {h.submittedBy}</span></div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{fontWeight:900,color:'var(--orange)',fontSize:16}}>{h.totalTeas} teas</span>
                <button onClick={()=>setEditRec(h)} style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-sm)',padding:'4px 9px',color:'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✎</button>
              </div>
            </div>
          ))}
          <div style={{padding:'10px 16px',background:dark?'#151929':'#f8f9fc',display:'flex',justifyContent:'space-between'}}>
            <span style={{fontWeight:700,color:'var(--text-secondary)'}}>Day Total</span>
            <span style={{fontWeight:900,color:'var(--green-dim)',fontSize:18}}>{todayHistory.reduce((a,h)=>a+(h.totalTeas||0),0)} teas</span>
          </div>
        </div>
      )}
      {editRec&&<EditRecordModal record={editRec} colName={col('tea')} onClose={()=>setEditRec(null)} dark={dark} fields={[
        {key:'totalTeas', label:'Total Teas', type:'number'},
        {key:'session',   label:'Session', options:['Morning','Afternoon','Evening']},
        {key:'submittedBy', label:'Submitted By'},
      ]}/>}
    </div>
  );
}

// ── INTERNAL MOVEMENT TAB ────────────────────────────────────────────────────




function InternalMovementTab({dark,card,txt,sub,bdr,col,userProfile,unit,isMobile,dcApprovals=[]}) {
  const [form,setForm]=useState({alubean_name:'',department:INTERNAL_DEPTS[0],movementType:MOVEMENT_TYPES[0],destination:'',vehicleNumber:'',remarks:'',expectedReturn:''});
  const [dcForm,setDcForm]=useState({itemDescription:'',qty:'',uom:'Nos',operationInvolved:'',source:'',estHrsPerKg:'',earlierPrice:'',repeatJob:'No',dcNumber:'',remarks:''});
  const [showDCForm,setShowDCForm]=useState(false);
  const [movements,setMovements]=useState([]);
  const [saving,setSaving]=useState(false);
  const [editRec, setEditRec] = useState(null);
  const [quickSaving,setQuickSaving]=useState(null);
  const [view,setView]=useState('entry');
  const colName=`security_internal_${unit==='u2'?'u2':'u1'}`;

  useEffect(()=>{
    const load=async()=>{
      const {collection,query,orderBy,limit,onSnapshot}=await import('firebase/firestore');
      const {db}=await import('../firebase');
      const q=query(collection(db,colName),orderBy('outTime','desc'),limit(100));
      return onSnapshot(q,s=>setMovements(s.docs.map(d=>({id:d.id,...d.data()}))));
    };
    let unsub; load().then(u=>{unsub=u;}); return()=>{if(unsub)unsub();};
  },[colName]);

  const inp={border:'1px solid #d1d5db',borderRadius:'var(--radius-md)',padding:'9px 12px',fontSize:13,outline:'none',fontFamily:'var(--font-sans)',background:'#ffffff',color:'#111827',width:'100%',boxSizing:'border-box'};
  const set=(k,v)=>{
    setForm(f=>({...f,[k]:v}));
    if(k==='movementType') setShowDCForm(JOB_WORK_TYPES.includes(v));
  };
  const setDc=(k,v)=>setDcForm(f=>({...f,[k]:v}));
  const isJobWork = JOB_WORK_TYPES.includes(form.movementType);
  const totalCost = (parseFloat(dcForm.estHrsPerKg)||0) * (parseFloat(dcForm.qty)||0) * (parseFloat(dcForm.source&&dcForm.source?1:1)||1);
  // Total Cost = Qty × Est Hrs/Kg × hourly rate (entered as earlierPrice or separate rate)
  // Simple: budgetaryCost = qty × estHrsPerKg × hourlyRate; we use estHrsPerKg as hrs and add a rate field


  // Check if a frequent alubean is currently outside
  const isOut = (name) => movements.some(m=>m.status==='Out'&&!m.inTime&&m.date===todayStr()&&(m.alubean_name===name||m.employeeName===name));
  const getRecord = (name) => movements.find(m=>m.status==='Out'&&m.date===todayStr()&&(m.alubean_name===name||m.employeeName===name));

  // Quick toggle OUT for frequent alubean
  async function quickToggleOut(fa) {
    setQuickSaving(fa.name);
    try{
      const {collection,addDoc,serverTimestamp}=await import('firebase/firestore');
      const {db}=await import('../firebase');
      await addDoc(collection(db,colName),{
        alubean_name:fa.name, department:fa.dept, movementType:fa.movement,
        destination:'', vehicleNumber:'', remarks:'',
        outTime:serverTimestamp(), inTime:null, date:todayStr(),
        recordedBy:userProfile?.name||'Security', unit:unit||'u1',
        outTimeStr:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),
        status:'Out',
      });
      await createNotification(unit||'u1', NOTIF_TYPES.MOBILEBOX, {
        title:`🏭 ${fa.name} — Gone Out`,
        message:`${fa.name} (${fa.dept}) went out for: ${fa.movement}. By ${userProfile?.name||'Security'}`,
        screen:'security', tab:'internal',
      });
    }catch(e){alert(e.message);}
    finally{setQuickSaving(null);}
  }

  // Quick toggle IN for frequent alubean
  async function quickToggleIn(fa) {
    const rec = getRecord(fa.name);
    if(!rec) return;
    setQuickSaving(fa.name);
    try{
      const {updateDoc,doc,serverTimestamp}=await import('firebase/firestore');
      const {db}=await import('../firebase');
      const inTimeStr=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
      await updateDoc(doc(db,colName,rec.id),{inTime:serverTimestamp(),inTimeStr,status:'Returned',returnRecordedBy:userProfile?.name});
      await createNotification(unit||'u1', NOTIF_TYPES.MOBILEBOX, {
        title:`🏭 ${fa.name} — Returned`,
        message:`${fa.name} (${fa.dept}) returned to factory. Quick toggle by ${userProfile?.name}`,
        screen:'security', tab:'internal',
      });
    }catch(e){alert(e.message);}
    finally{setQuickSaving(null);}
  }

  async function markOut(){
    if(!form.alubean_name.trim()) return alert('Alubean name required');
    if(isJobWork && !dcForm.dcNumber.trim())        return alert('DC Number is required for job work movements');
    if(isJobWork && !dcForm.itemDescription.trim()) return alert('Item description is required');
    if(isJobWork && !dcForm.source.trim())          return alert('Supplier / Source is required');
    setSaving(true);
    try{
      const {collection:col2,addDoc,serverTimestamp:sts,doc:fsDoc,setDoc}=await import('firebase/firestore');
      const {db:db2}=await import('../firebase');

      // Save movement record
      await addDoc(col2(db2,colName),{
        ...form, outTime:sts(), inTime:null,
        date:todayStr(), recordedBy:userProfile?.name||'Security', unit:unit||'u1',
        outTimeStr:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),
        status: isJobWork ? 'DC Pending' : 'Out', hasJobWorkDC: isJobWork,
      });

      // Save DC approval record if job work
      if(isJobWork){
        const qty       = parseFloat(dcForm.qty)||0;
        const estHrs    = parseFloat(dcForm.estHrsPerKg)||0;
        const hourlyRate= parseFloat(dcForm.hourlyRate)||0;
        const budgetaryCost = qty * estHrs * hourlyRate;

        const dcDoc = await addDoc(col2(db2,'dc_approvals'),{
          dcNumber:        dcForm.dcNumber.trim(),
          itemDescription: dcForm.itemDescription.trim(),
          qty, uom:        dcForm.uom||'Nos',
          operationInvolved: dcForm.operationInvolved||'',
          source:          dcForm.source.trim(),
          estHrsPerKg:     estHrs,
          hourlyRate,
          budgetaryCost,
          earlierPrice:    parseFloat(dcForm.earlierPrice)||0,
          repeatJob:       dcForm.repeatJob||'No',
          remarks:         dcForm.remarks||'',
          alubeanName:     form.alubean_name,
          department:      form.department,
          movementType:    form.movementType,
          status:          'Pending',
          unit:            unit||'u1',
          submittedBy:     userProfile?.name||'Security',
          createdAt:       sts(),
          approvedBy:null, approvedAt:null,
          rejectedBy:null, rejectedAt:null, rejectionReason:'',
        });
        const dcDocId = dcDoc.id;

        // Push notification for DC approval — store dcId so bell can approve inline
        await createNotification(unit||'u1', NOTIF_TYPES.DC, {
          title:'📄 Job Work DC — Approval Required',
          message:`DC#${dcForm.dcNumber} | ${form.alubean_name} (${form.department}) → ${dcForm.source} | ${dcForm.itemDescription} | ${dcForm.operationInvolved||form.movementType} | Qty: ${qty} ${dcForm.uom} | ₹${(qty*estHrs*hourlyRate).toLocaleString('en-IN',{maximumFractionDigits:2})} | Submitted by ${userProfile?.name}`,
          taskId:null,
          dcId: dcDocId,
          pendingApproval: true,
        });
      }

      if(!isJobWork){
        await createNotification(unit||'u1', NOTIF_TYPES.INTERNAL, {
          title:`🏭 Alubean Out — ${form.department}`,
          message:`${form.alubean_name||"—"} (${form.department}) went out for: ${form.movementType}${form.destination?' → '+form.destination:''}. Recorded by ${userProfile?.name}`,
          taskId:null,
        });
      } else {
        await createNotification(unit||'u1', NOTIF_TYPES.INTERNAL, {
          title:`⏳ DC Pending — ${form.alubean_name}`,
          message:`${form.alubean_name} (${form.department}) submitted DC#${dcForm.dcNumber} for ${form.movementType}. Awaiting owner approval before exit.`,
          taskId:null,
        });
      }

      setForm({alubean_name:'',department:INTERNAL_DEPTS[0],movementType:MOVEMENT_TYPES[0],destination:'',vehicleNumber:'',remarks:'',expectedReturn:''});
      setDcForm({itemDescription:'',qty:'',uom:'Nos',operationInvolved:'',source:'',estHrsPerKg:'',hourlyRate:'',earlierPrice:'',repeatJob:'No',dcNumber:'',remarks:''});
      setShowDCForm(false);
      setView('log');
    }catch(e){alert('Save failed: '+e.message);}
    finally{setSaving(false);}
  }

  async function markIn(id,m){
    try{
      const {updateDoc,doc,serverTimestamp}=await import('firebase/firestore');
      const {db}=await import('../firebase');
      const inTimeStr=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
      await updateDoc(doc(db,colName,id),{inTime:serverTimestamp(),inTimeStr,status:'Returned',returnRecordedBy:userProfile?.name});
      await createNotification(unit||'u1', NOTIF_TYPES.INTERNAL, {
        title:`🏭 Alubean Returned — ${m.department}`,
        message:`${m.alubean_name||m.employeeName||"—"} (${m.department}) has returned from: ${m.movementType}. Recorded by ${userProfile?.name}`,
        taskId:null,
      });
    }catch(e){alert(e.message);}
  }

  const outside=movements.filter(m=>m.status==='Out'&&!m.inTime&&m.date===todayStr());
  const returned=movements.filter(m=>m.status==='Returned'&&m.date===todayStr());

  return(
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <h2 style={{margin:0,fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>🏭 Internal Movement</h2>
          <p style={{margin:'4px 0 0',fontSize:12,color:'var(--text-secondary)'}}>Track internal alubean movements · {new Date().toLocaleDateString('en-IN')}</p>
        </div>
        <div style={{display:'flex',gap:6}}>
          {['entry','log'].map(v=><button key={v} onClick={()=>setView(v)} style={{background:view===v?'#f97316':'transparent',border:`1px solid ${view===v?'#f97316':dark?'#2d3748':'#e8e8e8'}`,borderRadius:'var(--radius-md)',padding:'6px 14px',color:view===v?'#fff':sub,fontSize:12,cursor:'pointer',fontFamily:'var(--font-sans)'}}>{v==='entry'?'+ Mark Out':'📋 Log'}</button>)}
        </div>
      </div>

      {/* Summary */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
        {[{l:'Currently Outside',v:outside.length,c:'#ef4444',bg:dark?'#2d1515':'#fef2f2'},
          {l:'Returned Today',v:returned.length,c:'#16a34a',bg:dark?'#052d14':'#f0fdf4'},
          {l:'Total Movements',v:movements.filter(m=>m.date===todayStr()).length,c:'#3b82f6',bg:dark?'#1e1b4b':'#eff6ff'},
        ].map(k=><div key={k.l} style={{background:k.bg,borderRadius:'var(--radius-md)',padding:'12px',textAlign:'center'}}><div style={{fontSize:22,fontWeight:900,color:k.c}}>{k.v}</div><div style={{fontSize:9,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',marginTop:3}}>{k.l}</div></div>)}
      </div>

      {/* QUICK TOGGLE — frequent alubeans — U1 only */}
      {unit!=='u2'&&<div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',padding:'14px',marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:10}}>⚡ Quick Toggle — Frequent Alubeans</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {FREQUENT_ALUBEANS.map(fa=>{
            const out=isOut(fa.name);
            const rec=getRecord(fa.name);
            const loading=quickSaving===fa.name;
            return(
              <div key={fa.name} style={{background:out?(dark?'rgba(239,68,68,0.12)':'#fef2f2'):(dark?'rgba(34,197,94,0.08)':'#f0fdf4'),borderRadius:'var(--radius-md)',padding:'10px 12px',border:`1.5px solid ${out?'rgba(239,68,68,0.4)':'rgba(34,197,94,0.3)'}`}}>
                <div style={{fontWeight:800,color:'var(--text-primary)',fontSize:13}}>{fa.name}</div>
                <div style={{fontSize:10,color:'var(--text-secondary)',marginTop:1}}>{fa.dept}</div>
                {out&&rec&&<div style={{fontSize:10,color:'var(--red)',marginTop:2}}>Out {rec.outTimeStr} · {fmtDur(rec.outTime,null)}</div>}
                <button onClick={()=>out?quickToggleIn(fa):quickToggleOut(fa)} disabled={loading}
                  style={{marginTop:8,width:'100%',background:out?'#16a34a':'#ef4444',border:'none',borderRadius:7,padding:'6px',color:'#fff',fontSize:11,fontWeight:800,cursor:loading?'not-allowed':'pointer',fontFamily:'var(--font-sans)'}}>
                  {loading?'⏳':out?'✓ Mark IN':'→ Mark OUT'}
                </button>
              </div>
            );
          })}
        </div>
      </div>}

      {/* Currently outside alert */}
      {outside.length>0&&(
        <div style={{background:dark?'#2d1515':'#fef2f2',border:'1px solid #fecaca',borderRadius:'var(--radius-md)',padding:'10px 16px',marginBottom:12}}>
          <div style={{fontWeight:700,color:'var(--red-dim)',fontSize:13,marginBottom:6}}>🔴 Currently Outside ({outside.length})</div>
          {outside.map(m=>(
            <div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 0',borderBottom:`1px solid ${dark?'#3d1515':'#fecaca'}`}}>
              <div>
                <span style={{fontWeight:700,color:'var(--text-primary)'}}>{m.alubean_name||m.employeeName||"—"}</span>
                <span style={{color:'var(--text-secondary)',fontSize:12,marginLeft:8}}>{m.department} · {m.movementType}</span>
                {m.destination&&<span style={{color:'var(--text-secondary)',fontSize:11,marginLeft:6}}>→ {m.destination}</span>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:11,color:'var(--text-secondary)'}}>Out: {m.outTimeStr}</span>
                <button onClick={()=>markIn(m.id,m)} style={{background:'var(--green)',border:'none',borderRadius:'var(--radius-sm)',padding:'5px 12px',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✓ Mark In</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view==='entry'&&(
        <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',padding:'20px'}}>
          <div style={{fontWeight:700,color:'var(--text-primary)',marginBottom:14,fontSize:14}}>Record Alubean Going Out</div>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12}}>
            {[['Alubean Name *','alubean_name','text','Full name'],['Destination / Purpose Details','destination','text','Where going / what for'],['Vehicle Number','vehicleNumber','text','If using vehicle'],['Expected Return Time','expectedReturn','time','']].map(([l,k,t,p])=>(
              <div key={k}>
                <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>{l}</label>
                <input style={inp} type={t} value={form[k]} onChange={e=>set(k,e.target.value)} placeholder={p}/>
              </div>
            ))}
            {[['Department','department',INTERNAL_DEPTS],['Movement Type','movementType',MOVEMENT_TYPES]].map(([l,k,opts])=>(
              <div key={k}>
                <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>{l}</label>
                <select style={{...inp,cursor:'pointer'}} value={form[k]} onChange={e=>set(k,e.target.value)}>{opts.map(o=><option key={o}>{o}</option>)}</select>
              </div>
            ))}
            <div style={{gridColumn:isMobile?'1':'1/-1'}}>
              <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Remarks</label>
              <input style={inp} value={form.remarks} onChange={e=>set('remarks',e.target.value)} placeholder="Any additional notes"/>
            </div>
          </div>
          {/* ── JOB WORK DC FORM — appears when job work movement type selected ── */}
          {isJobWork && (
            <div style={{marginTop:16,background:'#eff6ff',border:'2px solid #3b82f6',borderRadius:12,padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div style={{fontWeight:900,fontSize:14,color:'#1e40af'}}>📄 Job Work Cost Approval (DC)</div>
                <span style={{background:'#fef3c7',color:'#b45309',borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:800}}>⏳ Requires Owner Approval</span>
              </div>
              <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:12,color:'#9a3412',fontWeight:600}}>
                Movement type <strong>{form.movementType}</strong> is a job work — DC details mandatory before marking out.
              </div>

              {/* Row 1: DC No + Source */}
              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:10,marginBottom:10}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#1e40af',textTransform:'uppercase',marginBottom:4,display:'block'}}>DC Number *</label>
                  <input style={{...inp,border:'2px solid #3b82f6',background:'#fff',fontWeight:800,color:'#1e40af'}} value={dcForm.dcNumber} onChange={e=>setDc('dcNumber',e.target.value)} placeholder="e.g. DC/2026/001"/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#1e40af',textTransform:'uppercase',marginBottom:4,display:'block'}}>Source / Supplier *</label>
                  <input style={{...inp,background:'#fff'}} value={dcForm.source} onChange={e=>setDc('source',e.target.value)} placeholder="Supplier or vendor name"/>
                </div>
              </div>

              {/* Row 2: Item description */}
              <div style={{marginBottom:10}}>
                <label style={{fontSize:11,fontWeight:700,color:'#1e40af',textTransform:'uppercase',marginBottom:4,display:'block'}}>Item Description *</label>
                <input style={{...inp,background:'#fff'}} value={dcForm.itemDescription} onChange={e=>setDc('itemDescription',e.target.value)} placeholder="e.g. C6X 601 Die Insert — set of 2"/>
              </div>

              {/* Row 3: Operation Involved */}
              <div style={{marginBottom:10}}>
                <label style={{fontSize:11,fontWeight:700,color:'#1e40af',textTransform:'uppercase',marginBottom:4,display:'block'}}>Operation Involved</label>
                <input style={{...inp,background:'#fff'}} value={dcForm.operationInvolved} onChange={e=>setDc('operationInvolved',e.target.value)} placeholder="e.g. Nitriding, CNC Turning, Surface Grinding"/>
              </div>

              {/* Row 4: Qty + UOM + Est Hrs/Kg + Hourly Rate */}
              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'1fr 80px 1fr 1fr',gap:10,marginBottom:10}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#1e40af',textTransform:'uppercase',marginBottom:4,display:'block'}}>Qty / Kg</label>
                  <input type="number" min={0} style={{...inp,background:'#fff',fontWeight:700}} value={dcForm.qty} onChange={e=>setDc('qty',e.target.value)} placeholder="0"/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#1e40af',textTransform:'uppercase',marginBottom:4,display:'block'}}>UOM</label>
                  <select style={{...inp,background:'#fff',cursor:'pointer'}} value={dcForm.uom} onChange={e=>setDc('uom',e.target.value)}>
                    {['Nos','Kgs','Sets','Lots'].map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#15803d',textTransform:'uppercase',marginBottom:4,display:'block'}}>Est. Hrs / Kg</label>
                  <input type="number" min={0} step={0.1} style={{...inp,background:'#fff',color:'#15803d',fontWeight:700}} value={dcForm.estHrsPerKg} onChange={e=>setDc('estHrsPerKg',e.target.value)} placeholder="0.0"/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#15803d',textTransform:'uppercase',marginBottom:4,display:'block'}}>Hourly Rate (₹)</label>
                  <input type="number" min={0} step={0.01} style={{...inp,background:'#fff',color:'#15803d',fontWeight:700}} value={dcForm.hourlyRate||''} onChange={e=>setDc('hourlyRate',e.target.value)} placeholder="₹ / hr"/>
                </div>
              </div>

              {/* Row 5: Earlier Price + Repeat Job */}
              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:10,marginBottom:10}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#1e40af',textTransform:'uppercase',marginBottom:4,display:'block'}}>Earlier Price (₹)</label>
                  <input type="number" min={0} step={0.01} style={{...inp,background:'#fff'}} value={dcForm.earlierPrice} onChange={e=>setDc('earlierPrice',e.target.value)} placeholder="Previous job cost if any"/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#1e40af',textTransform:'uppercase',marginBottom:4,display:'block'}}>Repeat Job?</label>
                  <div style={{display:'flex',gap:8,marginTop:2}}>
                    {['Yes','No'].map(v=>(
                      <button key={v} onClick={()=>setDc('repeatJob',v)}
                        style={{flex:1,padding:'9px',borderRadius:8,border:`2px solid ${dcForm.repeatJob===v?'#1e40af':'#d1d5db'}`,background:dcForm.repeatJob===v?'#1e40af':'#fff',color:dcForm.repeatJob===v?'#fff':'#374151',fontWeight:800,fontSize:13,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* DC Remarks */}
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,fontWeight:700,color:'#1e40af',textTransform:'uppercase',marginBottom:4,display:'block'}}>DC Remarks</label>
                <input style={{...inp,background:'#fff'}} value={dcForm.remarks} onChange={e=>setDc('remarks',e.target.value)} placeholder="Expected return date, special instructions..."/>
              </div>

              {/* TOTAL COST — auto calc */}
              <div style={{background:'#f0fdf4',border:'2px solid #86efac',borderRadius:10,padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'#166534',textTransform:'uppercase'}}>Total Budgetary Cost</div>
                  <div style={{fontSize:10,color:'#15803d',marginTop:2}}>Qty × Est Hrs/Kg × Hourly Rate</div>
                  <div style={{fontSize:10,color:'#15803d'}}>= {dcForm.qty||0} × {dcForm.estHrsPerKg||0} × ₹{dcForm.hourlyRate||0}</div>
                </div>
                <div style={{fontSize:28,fontWeight:900,color:'#15803d'}}>
                  ₹{((parseFloat(dcForm.qty)||0)*(parseFloat(dcForm.estHrsPerKg)||0)*(parseFloat(dcForm.hourlyRate)||0)).toLocaleString('en-IN',{maximumFractionDigits:2})}
                </div>
              </div>
            </div>
          )}

          <button onClick={markOut} disabled={saving}
            style={{marginTop:16,background:saving?'#999':isJobWork?'linear-gradient(135deg,#1e40af,#1d4ed8)':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:'var(--radius-md)',padding:'12px 28px',color:'#fff',fontSize:14,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'var(--font-sans)'}}>
            {saving?'⏳ Recording...':`${isJobWork?'📄 Submit DC & Mark Out':'🚶 Mark as Gone Out'}`}
          </button>
        </div>
      )}

      {view==='log'&&(
        <div>
          {movements.filter(m=>m.date===todayStr()).length===0
            ?<div style={{textAlign:'center',padding:'40px',color:'var(--text-secondary)'}}>No movements recorded today</div>
            :movements.filter(m=>m.date===todayStr()).map((m,i)=>(
              <div key={m.id} style={{background:'var(--bg-raised)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',padding:'12px 16px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:10,height:10,borderRadius:'50%',background:m.status==='Out'?'#ef4444':'#16a34a',flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:'var(--text-primary)'}}>{m.alubean_name||m.employeeName||"—"} <span style={{fontWeight:400,color:'var(--text-secondary)',fontSize:12}}>· {m.department}</span></div>
                  <div style={{fontSize:12,color:'var(--text-secondary)'}}>{m.movementType}{m.destination?' → '+m.destination:''}</div>
                </div>
                <div style={{fontSize:11,color:'var(--text-secondary)',textAlign:'right'}}>
                  <div>Out: {m.outTimeStr||'—'}</div>
                  {m.inTimeStr&&<div style={{color:'var(--green-dim)'}}>In: {m.inTimeStr}</div>}
                  {m.status==='Out'&&<button onClick={()=>markIn(m.id,m)} style={{background:'var(--green)',border:'none',borderRadius:'var(--radius-sm)',padding:'4px 10px',color:'#fff',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)',marginTop:4}}>✓ Mark In</button>}
                </div>
                <button onClick={()=>setEditRec(m)} style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-sm)',padding:'5px 9px',color:'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'var(--font-sans)',flexShrink:0}}>✎</button>
              </div>
            ))
          }
          {editRec&&<EditRecordModal record={editRec} colName={`security_internal_${unit==='u2'?'u2':'u1'}`} onClose={()=>setEditRec(null)} dark={dark} fields={[
            {key:'alubean_name',  label:'Alubean Name'},
            {key:'department',    label:'Department', options:INTERNAL_DEPTS},
            {key:'movementType',  label:'Movement Type', options:MOVEMENT_TYPES},
            {key:'destination',   label:'Destination'},
            {key:'outTimeStr',    label:'Out Time (HH:MM)', type:'time'},
            {key:'inTimeStr',     label:'In Time (HH:MM)', type:'time'},
            {key:'vehicleNumber', label:'Vehicle Number'},
            {key:'remarks',       label:'Remarks', full:true},
          ]}/> }
        </div>
      )}
    </div>
  );
}

// ── PERMISSION TAB ────────────────────────────────────────────────────────────


function PermissionTab({dark,card,txt,sub,bdr,col,userProfile,unit,isOwner}) {
  const [form,setForm]=useState({alubean_name:'',department:INTERNAL_DEPTS[0],reason:PERMISSION_REASONS[0],details:'',duration:'',outTimeStr:'',requestedDate:new Date().toISOString().slice(0,10)});
  const [requests,setRequests]=useState([]);
  const [saving,setSaving]=useState(false);
  const [editRec, setEditRec] = useState(null);
  const [view,setView]=useState(isOwner?'pending':'entry');
  const colName=`security_permission_${unit==='u2'?'u2':'u1'}`;

  useEffect(()=>{
    const load=async()=>{
      const {collection,query,orderBy,limit,onSnapshot}=await import('firebase/firestore');
      const {db}=await import('../firebase');
      const q=query(collection(db,colName),limit(100));
      return onSnapshot(q,s=>{
        const docs = s.docs.map(d=>({id:d.id,...d.data()}));
        docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        setRequests(docs);
      });
    };
    let unsub; load().then(u=>{unsub=u;}); return()=>{if(unsub)unsub();};
  },[colName]);

  const inp={border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',padding:'9px 12px',fontSize:13,outline:'none',fontFamily:'var(--font-sans)',background:'var(--bg-raised)',color:'var(--text-primary)',width:'100%',boxSizing:'border-box'};
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const pending  = requests.filter(r=>r.status==='Pending');
  const approved = requests.filter(r=>r.status==='Approved');
  const rejected = requests.filter(r=>r.status==='Rejected');

  async function submitRequest(){
    if(!form.alubean_name.trim()) return alert('Alubean name required');
    setSaving(true);
    try{
      const {collection,addDoc,serverTimestamp}=await import('firebase/firestore');
      const {db}=await import('../firebase');
      await addDoc(collection(db,colName),{
        ...form, status:'Pending',
        createdAt:serverTimestamp(), date:todayStr(),
        submittedBy:userProfile?.name||'Security', unit:unit||'u1',
      });
      setForm({alubean_name:'',department:INTERNAL_DEPTS[0],reason:PERMISSION_REASONS[0],details:'',duration:'',outTimeStr:'',requestedDate:new Date().toISOString().slice(0,10)});
      await createNotification(unit||'u1', NOTIF_TYPES.PERMISSION, {
        title:`🔐 Permission Request — ${form.alubean_name||form.employeeName||"—"}`,
        message:`${form.alubean_name||form.employeeName} (${form.department}) requests: ${form.reason}${form.duration?' | '+form.duration:''}`,
        pendingApproval: true,
      });
      alert('✅ Permission request submitted. Awaiting approval.');
    }catch(e){alert(e.message);}
    finally{setSaving(false);}
  }

  async function updateStatus(id,status){
    const {updateDoc,doc,serverTimestamp}=await import('firebase/firestore');
    const {db}=await import('../firebase');
    await updateDoc(doc(db,colName,id),{status,reviewedBy:userProfile?.name,reviewedAt:serverTimestamp()});
  }

  const STATUS_STYLE={
    Pending: {bg:dark?'#3d2600':'#fffbeb',c:'#d97706',border:'#f59e0b'},
    Approved:{bg:dark?'#052d14':'#f0fdf4',c:'#16a34a',border:'#22c55e'},
    Rejected:{bg:dark?'#2d0a0a':'#fef2f2',c:'#dc2626',border:'#ef4444'},
  };

  const RequestCard=({r})=>{
    const st=STATUS_STYLE[r.status]||STATUS_STYLE.Pending;
    return(
      <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:`1.5px solid ${st.border}33`,marginBottom:10,overflow:'hidden'}}>
        <div style={{background:st.bg,padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <span style={{fontWeight:800,color:'var(--text-primary)',fontSize:14}}>{r.alubean_name||r.employeeName||"—"}</span>
            <span style={{color:'var(--text-secondary)',fontSize:12,marginLeft:8}}>{r.department}</span>
          </div>
          <span style={{background:st.c+'22',color:st.c,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>{r.status}</span>
        </div>
        <div style={{padding:'12px 16px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
            <div>
              <div style={{fontSize:10,color:'var(--text-secondary)',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>Reason</div>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{r.reason}</div>
            </div>
            <div>
              <div style={{fontSize:10,color:'var(--text-secondary)',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>Date</div>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{r.requestedDate||r.date}</div>
            </div>
            {r.duration&&<div>
              <div style={{fontSize:10,color:'var(--text-secondary)',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>Duration</div>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{r.duration}</div>
            </div>}
            <div>
              <div style={{fontSize:10,color:'var(--text-secondary)',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>Requested By</div>
              <div style={{fontSize:12,color:'var(--text-secondary)'}}>{r.submittedBy} · {r.date}</div>
            </div>
          </div>
          {r.details&&<div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:10,fontStyle:'italic'}}>"{r.details}"</div>}
          {r.reviewedBy&&<div style={{fontSize:11,color:'var(--text-secondary)'}}>Reviewed by {r.reviewedBy}</div>}
          {isOwner&&r.status==='Pending'&&(
            <div style={{display:'flex',gap:8,marginTop:10,paddingTop:10,borderTop:`1px solid ${bdr}`}}>
              <button onClick={()=>updateStatus(r.id,'Approved')} style={{flex:1,background:'var(--green)',border:'none',borderRadius:'var(--radius-md)',padding:'9px',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✅ Approve</button>
              <button onClick={()=>updateStatus(r.id,'Rejected')} style={{flex:1,background:'var(--red)',border:'none',borderRadius:'var(--radius-md)',padding:'9px',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>❌ Reject</button>
            </div>
          )}
          {r.status==='Approved'&&!r.returnedAt&&(
            <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${bdr}`}}>
              <button onClick={async()=>{
                const {updateDoc,doc,serverTimestamp}=await import('firebase/firestore');
                const {db}=await import('../firebase');
                await updateDoc(doc(db,colName,r.id),{returnedAt:serverTimestamp(),returnedTimeStr:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),returnRecordedBy:userProfile?.name});
              }} style={{width:'100%',background:'linear-gradient(135deg,#3b82f6,#1d4ed8)',border:'none',borderRadius:'var(--radius-md)',padding:'9px',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                🏭 Mark Returned to Factory
              </button>
            </div>
          )}
          <div style={{display:'flex',gap:16,marginTop:8,flexWrap:'wrap',alignItems:'center'}}>
            {r.outTimeStr&&<div style={{fontSize:11,color:'var(--orange)',fontWeight:600}}>🚶 Out: {r.outTimeStr}</div>}
            {r.status==='Approved'&&r.returnedAt&&<div style={{fontSize:11,color:'var(--green-dim)',fontWeight:600}}>✅ Returned: {r.returnedTimeStr}</div>}
            <button onClick={()=>setEditRec(r)} style={{marginLeft:'auto',background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-sm)',padding:'4px 10px',color:'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✎ Edit</button>
          </div>
        </div>
      </div>
    );
  };

  return(
    <div>
      {editRec&&<EditRecordModal record={editRec} colName={colName} onClose={()=>setEditRec(null)} dark={dark} fields={[
        {key:'alubean_name',   label:'Alubean Name'},
        {key:'department',     label:'Department', options:INTERNAL_DEPTS},
        {key:'reason',         label:'Reason', options:PERMISSION_REASONS},
        {key:'duration',       label:'Duration'},
        {key:'outTimeStr',     label:'Out Time', type:'time'},
        {key:'returnedTimeStr',label:'Return Time', type:'time'},
        {key:'details',        label:'Details', full:true},
      ]}/> }
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <h2 style={{margin:0,fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>🔐 Permission Requests</h2>
          <p style={{margin:'4px 0 0',fontSize:12,color:'var(--text-secondary)'}}>Alubean permission requests · {todayStr()}</p>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          {pending.length>0&&<span style={{background:'#fef3c7',color:'#d97706',fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>{pending.length} Pending</span>}
          {!isOwner&&<button onClick={()=>setView(v=>v==='entry'?'log':'entry')} style={{background:'#f97316',border:'none',borderRadius:'var(--radius-md)',padding:'7px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>{view==='entry'?'📋 View Log':'+ New Request'}</button>}
        </div>
      </div>

      {/* Tabs for owner */}
      {isOwner&&(
        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
          {[['pending',`⏳ Pending (${pending.length})`],['approved','✅ Approved'],['rejected','❌ Rejected'],['all','All']].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{background:view===v?'#f97316':'transparent',border:`1px solid ${view===v?'#f97316':dark?'#2d3748':'#e8e8e8'}`,borderRadius:'var(--radius-md)',padding:'6px 14px',color:view===v?'#fff':sub,fontSize:12,cursor:'pointer',fontFamily:'var(--font-sans)',fontWeight:view===v?700:400}}>{l}</button>
          ))}
        </div>
      )}

      {/* Entry form */}
      {!isOwner&&view==='entry'&&(
        <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',padding:'20px',marginBottom:16}}>
          <div style={{fontWeight:700,color:'var(--text-primary)',marginBottom:14,fontSize:14}}>Submit Permission Request</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Alubean Name *</label>
              <input style={inp} value={form.alubean_name||""} onChange={e=>set('alubean_name',e.target.value)} placeholder="Full name"/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Department</label>
              <select style={{...inp,cursor:'pointer'}} value={form.department} onChange={e=>set('department',e.target.value)}>{INTERNAL_DEPTS.map(d=><option key={d}>{d}</option>)}</select>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Reason *</label>
              <select style={{...inp,cursor:'pointer'}} value={form.reason} onChange={e=>set('reason',e.target.value)}>{PERMISSION_REASONS.map(r=><option key={r}>{r}</option>)}</select>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Requested Date</label>
              <input style={inp} type="date" value={form.requestedDate} onChange={e=>set('requestedDate',e.target.value)}/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Duration (e.g. 2 hours / Half day)</label>
              <input style={inp} value={form.duration} onChange={e=>set('duration',e.target.value)} placeholder="e.g. 2 hours, Half day"/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Out Time</label>
              <input style={inp} type="time" value={form.outTimeStr||''} onChange={e=>set('outTimeStr',e.target.value)} placeholder="HH:MM"/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Additional Details</label>
              <input style={inp} value={form.details} onChange={e=>set('details',e.target.value)} placeholder="Optional details"/>
            </div>
          </div>
          <button onClick={submitRequest} disabled={saving}
            style={{marginTop:16,background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:'var(--radius-md)',padding:'12px 28px',color:'#fff',fontSize:14,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'var(--font-sans)'}}>
            {saving?'⏳ Submitting...':'📤 Submit Request'}
          </button>
        </div>
      )}

      {/* Pending approval card for non-owner */}
      {!isOwner&&view==='log'&&(
        <div>
          {requests.filter(r=>r.date===todayStr()||r.status==='Pending').length===0
            ?<div style={{textAlign:'center',padding:'40px',color:'var(--text-secondary)'}}>No requests today</div>
            :requests.filter(r=>r.date===todayStr()||r.status==='Pending').map(r=><RequestCard key={r.id} r={r}/>)
          }
        </div>
      )}

      {/* Owner views */}
      {isOwner&&(
        <div>
          {(view==='pending'?pending:view==='approved'?approved:view==='rejected'?rejected:requests).length===0
            ?<div style={{textAlign:'center',padding:'40px',color:'var(--text-secondary)'}}>No {view==='all'?'':view} requests</div>
            :(view==='pending'?pending:view==='approved'?approved:view==='rejected'?rejected:requests).map(r=><RequestCard key={r.id} r={r}/>)
          }
        </div>
      )}
    </div>
  );
}

// ── SECURITY REPORTS TAB ─────────────────────────────────────────────────────
function SecurityReportsTab({dark,card,txt,sub,bdr,col,userProfile,unit}) {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [section, setSection] = useState('vehicles');
  const [data, setData] = useState({vehicles:[],visitors:[],mobilebox:[],internal:[],power:[],tea:[],permissions:[],transfers:[],manpower:[]});
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [secPDFContent, setSecPDFContent] = useState('');

  const SECTIONS = [
    {id:'vehicles',    label:'🚗 Vehicles',          color:'var(--accent)'},
    {id:'visitors',    label:'👤 Visitors',           color:'#8b5cf6'},
    {id:'internal',    label:'🏭 Internal Movement',  color:'var(--orange)'},
    {id:'permissions', label:'🔐 Permissions',        color:'var(--amber)'},
    {id:'transfers',   label:'🔄 U2→U1 Transfers',   color:'var(--green)'},
    {id:'mobilebox',   label:'📱 Mobile Box',         color:'var(--green)'},
    {id:'power',       label:'⚡ Power Log',          color:'var(--red)'},
    {id:'tea',         label:'☕ Tea',                color:'#a855f7'},
    {id:'manpower',    label:'👷 Manpower',           color:'var(--accent)'},
  ];

  useEffect(()=>{
    if(!selectedDate) return;
    setLoading(true);
    const load = async () => {
      const {collection,query,where,getDocs} = await import('firebase/firestore');
      const {db} = await import('../firebase');
      const results = {};
      const colMap = {
        vehicles:    col('vehicles'),
        visitors:    col('visitors'),
        mobilebox:   col('mobilebox'),
        internal:    `security_internal_${unit==='u2'?'u2':'u1'}`,
        power:       col('power'),
        tea:         col('tea'),
        permissions: `security_permission_${unit==='u2'?'u2':'u1'}`,
        transfers:   'security_transfer_u2_u1',
      };
      for(const [key,colName] of Object.entries(colMap)) {
        try {
          const q = query(collection(db,colName), where('date','==',selectedDate));
          const snap = await getDocs(q);
          results[key] = snap.docs.map(d=>({id:d.id,...d.data()}));
        } catch(e) {
          if (key === 'permissions') {
            try {
              const q2 = query(collection(db,colName), where('requestedDate','==',selectedDate));
              const snap2 = await getDocs(q2);
              results[key] = snap2.docs.map(d=>({id:d.id,...d.data()}));
            } catch(e2) { results[key]=[]; }
          } else { results[key]=[]; }
        }
      }
      // Manpower - fetch all and filter client-side (avoids index requirement)
      try {
        const {query:q2,collection:col2,getDocs:gd2} = await import('firebase/firestore');
        const mpSnap = await gd2(q2(col2(db,'manpower_u1')));
        results.manpower = mpSnap.docs
          .map(d=>({id:d.id,...d.data()}))
          .filter(d=>String(d.date||'')===selectedDate)
          .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      } catch(e) { console.error('Manpower fetch error:',e); results.manpower=[]; }
      setData(results);
      setLoading(false);
    };
    load();
  },[selectedDate,unit,refreshKey]);

  // PDF Export
  async function exportSecurityPDF() {
    setExporting(true);
    try {
      const dateLabel = new Date(selectedDate+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
      const mp = data.manpower?.[0];

      // Section builder helper
      const sectionHtml = (title, color, rows) => rows.length===0 ? '' : `
        <div style="margin-bottom:24px;break-inside:avoid">
          <div style="background:${color};color:#fff;padding:10px 16px;border-radius:8px 8px 0 0;font-size:12px;font-weight:800;letter-spacing:0.5px">${title} <span style="opacity:0.7;font-weight:400">(${rows.length})</span></div>
          <table style="width:100%;border-collapse:collapse;font-size:10px;border:1px solid #e2e8f0;border-top:none">
            ${rows}
          </table>
        </div>`;

      const th = (...cols) => `<tr>${cols.map(h=>`<th style="padding:6px 8px;background:#f8fafc;color:#475569;font-weight:700;border-bottom:1px solid #e2e8f0;text-align:left">${h}</th>`).join('')}</tr>`;
      const td = (...vals) => `<tr>${vals.map(v=>`<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#0f172a">${v||'—'}</td>`).join('')}</tr>`;
      const badge = (text, bg, color) => `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700">${text}</span>`;

      // VEHICLES
      const fmtTs = (ts) => { if(!ts) return '—'; try{ const d=ts.toDate?ts.toDate():new Date((ts.seconds||0)*1000); return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}); }catch(e){return '—';} };
      const calcDur = (t1,t2) => { try{ const s1=t1?.seconds||0; const s2=t2?.seconds||Math.floor(Date.now()/1000); const m=Math.floor((s2-s1)/60); if(m<=0) return '—'; return m<60?m+'m':(Math.floor(m/60)+'h '+(m%60)+'m'); }catch(e){return '—';} };
      const vehiclesHTML = sectionHtml('🚗 VEHICLE MOVEMENTS', '#1e3a5f',
        `<thead>${th('Supplier/Customer','Vehicle No','Driver','Purpose','In Time','Out Time','Duration')}</thead><tbody>
        ${data.vehicles.map(v=>{
          const inT = fmtTs(v.inTime);
          const outT = v.outTime ? fmtTs(v.outTime) : '<span style="color:#dc2626;font-weight:700">Still Inside</span>';
          const dur = v.outTime ? calcDur(v.inTime,v.outTime) : '<span style="color:#f59e0b">Ongoing</span>';
          return td(v.comingFrom||v.partyName||'—',v.vehicleNumber||'—',v.driverName||'—',v.purpose||'—',inT,outT,dur);
        }).join('')}
        </tbody>`
      );

      // VISITORS
      const visitorsHTML = sectionHtml('👤 VISITOR LOG', '#4c1d95',
        `<thead>${th('Visitor Name','Company','Meeting','Department','Purpose','Status','In','Out')}</thead><tbody>
        ${data.visitors.map(v=>`${td(v.visitorName,v.company||'—',v.employeeToMeet||v.alubeanToMeet,v.department||'—',v.purpose,badge(v.approvalStatus,v.approvalStatus==='Approved'?'#dcfce7':v.approvalStatus==='Rejected'?'#fee2e2':'#fef9c3',v.approvalStatus==='Approved'?'#16a34a':v.approvalStatus==='Rejected'?'#dc2626':'#b45309'),v.inTimeStr||'—',v.outTimeStr||(v.outTime?'Exited':'Inside'))}`).join('')}
        </tbody>`
      );

      // INTERNAL MOVEMENTS - grouped by name
      const internalHTML = sectionHtml('🏭 INTERNAL MOVEMENTS', '#c2410c',
        `<thead>${th('Alubean / Trips','Department','Movement','Destination','Out Time','In Time','Duration')}</thead><tbody>
        ${(()=>{
          const groups={};
          data.internal.forEach(m=>{ const n=m.alubean_name||m.employeeName||'?'; if(!groups[n]) groups[n]={dept:m.department,rows:[]}; groups[n].rows.push(m); });
          return Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).map(([name,g])=>
            g.rows.map((m,i)=>`<tr>
              <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-weight:${i===0?'800':'400'};color:#0f172a">${i===0?`${name} <span style="background:#dbeafe;color:#1e40af;font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px">${g.rows.length} trip${g.rows.length>1?'s':''}</span>`:''}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#475569">${i===0?g.dept:''}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">${m.movementType||'—'}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">${m.destination||'—'}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#c2410c;font-weight:600">${m.outTimeStr||fmtTs(m.outTime)}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#16a34a;font-weight:600">${m.inTimeStr||fmtTs(m.inTime)||'<span style="color:#dc2626">—</span>'}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-weight:600">${m.inTime?calcDur(m.outTime,m.inTime):'<span style="color:#f59e0b">Still out</span>'}</td>
            </tr>`).join('')
          ).join('');
        })()}
        </tbody>`
      );

      // PERMISSIONS
      const permsHTML = sectionHtml('🔐 PERMISSION REQUESTS', '#92400e',
        `<thead>${th('Alubean','Department','Reason','Out Time','Returned At','Duration','Status')}</thead><tbody>
        ${data.permissions.map(p=>{
          const pDur = p.returnedAt ? calcDur({seconds:(p.createdAt?.seconds||0)},p.returnedAt) : (p.duration||'—');
          const sBg = p.status==='Approved'?'#dcfce7':p.status==='Rejected'?'#fee2e2':'#fef9c3';
          const sC = p.status==='Approved'?'#16a34a':p.status==='Rejected'?'#dc2626':'#b45309';
          return td(
            p.alubean_name||p.employeeName||'—',
            p.department||'—',
            p.reason||'—',
            p.outTimeStr||'—',
            p.returnedTimeStr||(p.returnedAt?fmtTs(p.returnedAt):'<span style="color:#dc2626">Not returned</span>'),
            pDur,
            badge(p.status,sBg,sC)
          );
        }).join('')}
        </tbody>`
      );

      // TRANSFERS
      const transfersHTML = sectionHtml('🔄 U2→U1 TRANSFERS', '#065f46',
        `<thead>${th('Alubean','Department','Reason','Vehicle','Arrived','Returned','Status')}</thead><tbody>
        ${data.transfers.map(t=>`${td(t.alubean_name,t.department,t.reason,t.vehicleNumber||'—',t.arrivedTimeStr||'—',t.returnedTimeStr||'<span style="color:#dc2626">Still in U1</span>',badge(t.returnedAt?'Returned':'In U1',t.returnedAt?'#dcfce7':'#fef9c3',t.returnedAt?'#16a34a':'#b45309'))}`).join('')}
        </tbody>`
      );

      // MOBILE BOX
      const mobileHTML = sectionHtml('📱 MOBILE BOX', '#065f46',
        `<thead>${th('Department','Count','Time Received','Status')}</thead><tbody>
        ${data.mobilebox.map(m=>`${td(m.department,m.mobileCount,m.timeRecorded||m.timeStr||'—',badge(m.isLate?'LATE':'On Time',m.isLate?'#fee2e2':'#dcfce7',m.isLate?'#dc2626':'#16a34a'))}`).join('')}
        </tbody>`
      );

      // POWER LOG
      const powerHTML = sectionHtml('⚡ POWER LOG', '#991b1b',
        `<thead>${th('Status','Time','Duration','Recorded By','Remarks')}</thead><tbody>
        ${data.power.map(p=>td(
          badge(p.status==='OFF'?'⚡ Power Cut':'✅ Restored',p.status==='OFF'?'#fee2e2':'#dcfce7',p.status==='OFF'?'#dc2626':'#16a34a'),
          p.timeStr||'—',
          p.duration||'<span style=\"color:#94a3b8\">Not recorded</span>',
          p.recordedBy||'—',
          p.remarks||'—'
        )).join('')}
        </tbody>`
      );

      // TEA
      const totalTeas = data.tea.reduce((a,t)=>a+(t.totalTeas||0),0);
      const teaHTML = data.tea.length===0 ? '' : `
        <div style="margin-bottom:24px">
          <div style="background:#6b21a8;color:#fff;padding:10px 16px;border-radius:8px 8px 0 0;font-size:12px;font-weight:800">☕ TEA DISTRIBUTION — Total: ${totalTeas} teas</div>
          <table style="width:100%;border-collapse:collapse;font-size:10px;border:1px solid #e2e8f0;border-top:none">
            <thead>${th('Session','Count')}</thead><tbody>
            ${data.tea.map(t=>td(t.session,`<strong style=\"font-size:13px\">${t.totalTeas||0}</strong>`)).join('')}
            </tbody>
          </table>
        </div>`;

      // MANPOWER
      const manpowerHTML = !mp ? '' : `
        <div style="margin-bottom:24px;break-inside:avoid">
          <div style="background:#1e3a5f;color:#fff;padding:10px 16px;border-radius:8px 8px 0 0;font-size:12px;font-weight:800">👷 MANPOWER — ${mp.shift||'—'} <span style="opacity:0.7;font-weight:400">by ${mp.submittedBy||'—'}</span></div>
          <table style="width:100%;border-collapse:collapse;font-size:10px;border:1px solid #e2e8f0;border-top:none">
            <thead><tr>
              <th style="padding:6px 8px;background:#f8fafc;color:#475569;font-weight:700;border-bottom:1px solid #e2e8f0;text-align:left">Department</th>
              <th style="padding:6px 8px;background:#dbeafe;color:#1e3a8a;font-weight:700;border-bottom:1px solid #e2e8f0;text-align:center">Budget</th>
              <th style="padding:6px 8px;background:#dbeafe;color:#1e3a8a;font-weight:700;border-bottom:1px solid #e2e8f0;text-align:center">Required</th>
              <th style="padding:6px 8px;background:#dcfce7;color:#14532d;font-weight:700;border-bottom:1px solid #e2e8f0;text-align:center">Actual</th>
              <th style="padding:6px 8px;background:#fee2e2;color:#7f1d1d;font-weight:700;border-bottom:1px solid #e2e8f0;text-align:center">Pending</th>
            </tr></thead>
            <tbody>
            ${(mp.u1||[]).map(r=>`<tr>
              <td style="padding:6px 8px;font-weight:600;color:#0f172a;border-bottom:1px solid #f1f5f9">${r.dept}</td>
              <td style="padding:6px 8px;text-align:center;color:#475569;border-bottom:1px solid #f1f5f9">${r.budget||0}</td>
              <td style="padding:6px 8px;text-align:center;color:#1d4ed8;font-weight:700;border-bottom:1px solid #f1f5f9">${r.todayReq||0}</td>
              <td style="padding:6px 8px;text-align:center;color:#16a34a;font-weight:700;border-bottom:1px solid #f1f5f9">${r.actual||0}</td>
              <td style="padding:6px 8px;text-align:center;color:${(r.pending||0)>0?'#dc2626':'#16a34a'};font-weight:700;border-bottom:1px solid #f1f5f9">${r.pending||0}</td>
            </tr>`).join('')}
            ${mp.totals?.u1?`<tr style="background:#f8fafc;font-weight:800">
              <td style="padding:6px 8px;font-weight:800;color:#0f172a">TOTAL</td>
              <td style="padding:6px 8px;text-align:center">${mp.totals.u1.budget||0}</td>
              <td style="padding:6px 8px;text-align:center;color:#1d4ed8">${mp.totals.u1.todayReq||0}</td>
              <td style="padding:6px 8px;text-align:center;color:#16a34a">${mp.totals.u1.actual||0}</td>
              <td style="padding:6px 8px;text-align:center;color:${(mp.totals.u1.pending||0)>0?'#dc2626':'#16a34a'}">${mp.totals.u1.pending||0}</td>
            </tr>`:''}
            </tbody>
          </table>
          ${mp.remarks?`<div style="padding:8px 16px;background:#f8fafc;font-size:11px;color:#475569;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">📝 ${mp.remarks}</div>`:''}
        </div>`;

      // Summary stats
      const stats = [
        {l:'Vehicles In',    v:data.vehicles.length,                              c:'#1e3a5f'},
        {l:'Visitors',       v:data.visitors.length,                              c:'#4c1d95'},
        {l:'Movements',      v:data.internal.length,                              c:'#c2410c'},
        {l:'Permissions',    v:data.permissions.length,                           c:'#92400e'},
        {l:'Transfers',      v:data.transfers.length,                             c:'#065f46'},
        {l:'Power Cuts',     v:data.power.filter(p=>p.status==='OFF').length,     c:'#991b1b'},
        {l:'Total Teas',     v:totalTeas,                                         c:'#6b21a8'},
        {l:'Manpower Actual',v:mp?.totals?.u1?.actual||'—',                      c:'#1e3a5f'},
      ];

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Security Report — ${selectedDate}</title>
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; padding:20px; color:#0f172a; }
        .page { max-width:960px; margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,0.08); overflow:hidden; }
        .header { background:linear-gradient(135deg,#030712,#0f172a); padding:24px 28px; }
        .body { padding:24px 28px; }
        .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:24px; }
        .stat { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center; }
        tr:nth-child(even) td { background:#fafafa; }
        @media print { body{background:#fff;padding:0} .page{box-shadow:none;border-radius:0} .noprint{display:none!important} }
      </style></head><body>
      <div class="noprint" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:999">
        <button onclick="window.print()" style="padding:10px 20px;background:#0f172a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">🖨 Print / Save PDF</button>
        <button onclick="window.close()" style="padding:10px 16px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:13px">✕ Close</button>
      </div>
      <div class="page">
        <div class="header">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
            <div style="width:44px;height:44px;background:linear-gradient(135deg,#22c55e,#16a34a);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff">A</div>
            <div>
              <div style="color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.5px">ALUBEE DIE CASTERS</div>
              <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:2px">Security Operations Report · Unit ${unit==='u2'?'2':'1'}</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end">
            <div>
              <div style="color:#fff;font-size:18px;font-weight:700">${dateLabel}</div>
              <div style="color:rgba(255,255,255,0.45);font-size:10px;margin-top:4px">Generated: ${new Date().toLocaleString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,day:'numeric',month:'short'})}</div>
            </div>
          </div>
        </div>

        <div class="body">
          <!-- Stats -->
          <div class="stats">
            ${stats.map(s=>`<div class="stat"><div style="font-size:26px;font-weight:900;color:${s.c}">${s.v}</div><div style="font-size:10px;color:#64748b;margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">${s.l}</div></div>`).join('')}
          </div>

          <!-- Sections -->
          ${vehiclesHTML}
          ${visitorsHTML}
          ${internalHTML}
          ${permsHTML}
          ${transfersHTML}
          ${mobileHTML}
          ${powerHTML}
          ${teaHTML}
          ${manpowerHTML}

          <!-- Footer -->
          <div style="border-top:1px solid #e2e8f0;padding-top:12px;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8">
            <span>Alubee Die Casters · Security Report · Confidential</span>
            <span>${selectedDate}</span>
          </div>
        </div>
      </div>
      </body></html>`;

      const isNative = !!(window.Capacitor?.isNativePlatform?.());
      if (isNative) {
        setSecPDFContent(html);
      } else {
        const win = window.open('','_blank');
        if (win) { win.document.write(html); win.document.close(); }
        else {
          const blob = new Blob([html],{type:'text/html'});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `security-report-${selectedDate}.html`; a.click();
        }
      }
    } catch(e) { alert('Export failed: '+e.message); }
    setExporting(false);
  }

  const inp = {border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',padding:'9px 12px',fontSize:13,outline:'none',fontFamily:'var(--font-sans)',background:'var(--bg-raised)',color:'var(--text-primary)'};
  const row = (label, value, highlight=false) => (
    <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:`1px solid ${bdr}`}}>
      <span style={{fontSize:12,color:'var(--text-secondary)'}}>{label}</span>
      <span style={{fontSize:12,fontWeight:highlight?800:600,color:highlight?'#f97316':txt}}>{value||'—'}</span>
    </div>
  );

  const hd = {background:'#1F3864',color:'#fff',padding:'7px 10px',fontSize:11,fontWeight:700,border:`1px solid #2d4a8a`};

  const currentData = data[section] || [];

  // Summary stats for selected date
  const stats = {
    vehicles: data.vehicles.length,
    vehiclesIn: data.vehicles.filter(v=>!v.outTime).length,
    visitors: data.visitors.length,
    visitorsApproved: data.visitors.filter(v=>v.approvalStatus==='Approved').length,
    internal: data.internal.length,
    internalOut: data.internal.filter(m=>m.status==='Out'||!m.inTime).length,
    totalMobiles: data.mobilebox.reduce((a,m)=>a+(parseInt(m.mobileCount)||0),0),
    powerCuts: data.power.filter(p=>p.status==='OFF').length,
    totalTeas: data.tea.reduce((a,t)=>a+(t.totalTeas||0),0),
    permissions: data.permissions.length,
    permissionsApproved: data.permissions.filter(p=>p.status==='Approved').length,
    transfers: data.transfers.length,
  };

  return (
    <div>
      {/* In-app PDF viewer for Android APK */}
      {secPDFContent&&(
        <div style={{position:'fixed',inset:0,zIndex:3000,background:'#fff',display:'flex',flexDirection:'column'}}>
          <div style={{background:'#0f172a',padding:'10px 16px',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            <button onClick={()=>setSecPDFContent('')}
              style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:8,padding:'8px 14px',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
              ← Back
            </button>
            <span style={{color:'#fff',fontWeight:700,fontSize:13,flex:1}}>Security Report</span>
            <button onClick={async()=>{
              try {
                const blob=new Blob([secPDFContent],{type:'text/html'});
                const url=URL.createObjectURL(blob);
                const a=document.createElement('a');
                a.href=url; a.download=`alubee-security-${new Date().toISOString().slice(0,10)}.html`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(()=>URL.revokeObjectURL(url),1000);
              } catch(e){ alert('Download failed: '+e.message); }
            }} style={{background:'#22c55e',border:'none',borderRadius:8,padding:'8px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>
              ⬇ Download
            </button>
            <button onClick={async()=>{
              try {
                if(navigator.share){
                  const blob=new Blob([secPDFContent],{type:'text/html'});
                  const file=new File([blob],`alubee-security-${new Date().toISOString().slice(0,10)}.html`,{type:'text/html'});
                  await navigator.share({files:[file],title:'Alubee Security Report'});
                } else {
                  window.open(URL.createObjectURL(new Blob([secPDFContent],{type:'text/html'})),'_blank');
                }
              } catch(e){ console.log('share',e); }
            }} style={{background:'#f97316',border:'none',borderRadius:8,padding:'8px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>
              ↗ Share
            </button>
          </div>
          <iframe srcDoc={secPDFContent} style={{flex:1,border:'none',width:'100%'}} title="Security Report"/>
        </div>
      )}
      <h2 style={{margin:'0 0 4px',fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>📅 Security Reports</h2>
      <p style={{margin:'0 0 16px',fontSize:12,color:'var(--text-secondary)'}}>View any day's security records</p>

      {/* Date picker */}
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:16,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:12,color:'var(--text-secondary)',fontWeight:600}}>Select Date:</span>
          <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} max={todayStr()}
            style={{...inp,padding:'8px 12px',cursor:'pointer'}}/>
        </div>
        {/* Quick date buttons */}
        {[['Today',todayStr()],['Yesterday',new Date(Date.now()-86400000).toISOString().slice(0,10)]].map(([l,d])=>(
          <button key={l} onClick={()=>setSelectedDate(d)}
            style={{background:selectedDate===d?'#f97316':'transparent',border:`1px solid ${selectedDate===d?'#f97316':dark?'#2d3748':'#e8e8e8'}`,borderRadius:'var(--radius-md)',padding:'6px 14px',color:selectedDate===d?'#fff':sub,fontSize:12,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
            {l}
          </button>
        ))}
        <button onClick={()=>setRefreshKey(k=>k+1)} disabled={loading}
          style={{background:'transparent',border:`1px solid ${dark?'#2d3748':'#e8e8e8'}`,borderRadius:'var(--radius-md)',padding:'6px 14px',color:sub,fontSize:12,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
          🔄 Refresh
        </button>
        <button onClick={exportSecurityPDF} disabled={exporting||loading}
          style={{marginLeft:'auto',background:'linear-gradient(135deg,#0f172a,#1e3a5f)',border:'none',borderRadius:'var(--radius-md)',padding:'8px 18px',color:'#fff',fontSize:12,fontWeight:700,cursor:exporting?'not-allowed':'pointer',fontFamily:'var(--font-sans)',whiteSpace:'nowrap',boxShadow:'var(--shadow-2)'}}>
          {exporting?'⏳ Exporting...':'🖨 Export Full Report PDF'}
        </button>
      </div>

      {loading?<div style={{textAlign:'center',padding:'40px',color:'var(--text-secondary)'}}>⏳ Loading...</div>:(
        <>
          {/* Day Summary */}
          <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',padding:'16px',marginBottom:16}}>
            <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:13,marginBottom:12}}>
              📊 Summary for {new Date(selectedDate+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
              {[
                {l:'Vehicles', v:stats.vehicles, sub:`${stats.vehiclesIn} still inside`, c:'#3b82f6'},
                {l:'Visitors', v:stats.visitors, sub:`${stats.visitorsApproved} approved`, c:'#8b5cf6'},
                {l:'Internal Movements', v:stats.internal, sub:`${stats.internalOut} still out`, c:'#f97316'},
                {l:'Mobiles Collected', v:stats.totalMobiles, sub:`from ${data.mobilebox.length} depts`, c:'#22c55e'},
                {l:'Power Cuts', v:stats.powerCuts, sub:`${data.power.length} events total`, c:'#ef4444'},
                {l:'Teas Distributed', v:stats.totalTeas, sub:`${data.tea.length} sessions`, c:'#a855f7'},
                {l:'Permissions', v:stats.permissions, sub:`${stats.permissionsApproved} approved`, c:'var(--amber)'},
                {l:'U2→U1 Transfers', v:stats.transfers, sub:`${(data.transfers||[]).filter(t=>t.returnedAt).length} returned`, c:'var(--orange)'},
              ].map(k=>(
                <div key={k.l} style={{background:dark?'#151929':'#f8f9fc',borderRadius:'var(--radius-md)',padding:'10px 12px'}}>
                  <div style={{fontSize:22,fontWeight:900,color:k.c}}>{k.v}</div>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--text-primary)',marginTop:2}}>{k.l}</div>
                  <div style={{fontSize:10,color:'var(--text-secondary)',marginTop:1}}>{k.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Section tabs */}
          <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
            {SECTIONS.map(s=>(
              <button key={s.id} onClick={()=>setSection(s.id)}
                style={{background:section===s.id?s.color:'transparent',border:`1px solid ${section===s.id?s.color:dark?'#2d3748':'#e8e8e8'}`,borderRadius:'var(--radius-md)',padding:'6px 12px',color:section===s.id?'#fff':sub,fontSize:11,fontWeight:section===s.id?700:400,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                {s.label} {data[s.id]?.length>0&&`(${data[s.id].length})`}
              </button>
            ))}
          </div>

          {/* Detail table for selected section */}
          {currentData.length===0
            ?<div style={{textAlign:'center',padding:'30px',color:'var(--text-secondary)',background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)'}}>No {section} records for {selectedDate}</div>
            :<div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',overflow:'hidden'}}>

              {/* VEHICLES */}
              {section==='vehicles'&&(
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr>{['Vehicle No','Type','Driver','From','Purpose','Material','In Time','Out Time','Duration'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
                  <tbody>{currentData.map((v,i)=>(
                    <tr key={v.id} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                      <td style={{padding:'8px 10px',fontWeight:700,color:'var(--text-primary)'}}>{v.vehicleNumber}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{v.vehicleType}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-primary)'}}>{v.driverName}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{v.comingFrom||'—'}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{v.purpose}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)',fontSize:11}}>{v.materialDetails||'—'}</td>
                      <td style={{padding:'8px 10px',color:'var(--accent)',fontWeight:600}}>{fmtTime(v.inTime)}</td>
                      <td style={{padding:'8px 10px',color:v.outTime?'#22c55e':'#f59e0b',fontWeight:600}}>{v.outTime?fmtTime(v.outTime):'Inside'}</td>
                      <td style={{padding:'8px 10px',color:'var(--orange)',fontWeight:700}}>{v.outTime?fmtDur(v.inTime,v.outTime):'—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}

              {/* VISITORS */}
              {section==='visitors'&&(
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr>{['Name','Company','To Meet','Dept','Purpose','Status','In Time','Out Time','Duration'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
                  <tbody>{currentData.map((v,i)=>(
                    <tr key={v.id} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                      <td style={{padding:'8px 10px',fontWeight:700,color:'var(--text-primary)'}}>{v.visitorName}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{v.company||'—'}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-primary)'}}>{v.alubeanToMeet}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{v.department||'—'}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{v.purpose}</td>
                      <td style={{padding:'8px 10px'}}>
                        <span style={{background:v.approvalStatus==='Approved'?'#f0fdf4':v.approvalStatus==='Rejected'?'#fef2f2':'#fffbeb',color:v.approvalStatus==='Approved'?'#16a34a':v.approvalStatus==='Rejected'?'#dc2626':'#d97706',fontWeight:700,fontSize:10,padding:'2px 8px',borderRadius:'var(--radius-lg)'}}>{v.approvalStatus}</span>
                      </td>
                      <td style={{padding:'8px 10px',color:'var(--accent)',fontWeight:600}}>{fmtTime(v.inTime||v.createdAt)}</td>
                      <td style={{padding:'8px 10px',color:v.outTime?'#22c55e':'#f59e0b',fontWeight:600}}>{v.outTime?fmtTime(v.outTime):'Inside'}</td>
                      <td style={{padding:'8px 10px',color:'var(--orange)',fontWeight:700}}>{v.outTime?fmtDur(v.inTime||v.createdAt,v.outTime):'—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}

              {/* INTERNAL */}
              {section==='internal'&&(
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr>{['Alubean','Dept','Movement','Destination','Vehicle','Out Time','In Time','Duration','Status'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
                  <tbody>{currentData.map((m,i)=>(
                    <tr key={m.id} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                      <td style={{padding:'8px 10px',fontWeight:700,color:'var(--text-primary)'}}>{m.alubean_name||m.employeeName||'—'}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{m.department}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{m.movementType}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{m.destination||'—'}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{m.vehicleNumber||'—'}</td>
                      <td style={{padding:'8px 10px',color:'var(--orange)',fontWeight:600}}>{m.outTimeStr||fmtTime(m.outTime)}</td>
                      <td style={{padding:'8px 10px',color:'var(--green)',fontWeight:600}}>{m.inTimeStr||fmtTime(m.inTime)||'—'}</td>
                      <td style={{padding:'8px 10px',color:'var(--accent)',fontWeight:700}}>{m.inTime?fmtDur(m.outTime,m.inTime):'—'}</td>
                      <td style={{padding:'8px 10px'}}>
                        <span style={{background:m.status==='Returned'?'#f0fdf4':'#fef2f2',color:m.status==='Returned'?'#16a34a':'#ef4444',fontWeight:700,fontSize:10,padding:'2px 8px',borderRadius:'var(--radius-lg)'}}>{m.status}</span>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              )}

              {/* MOBILE BOX */}
              {section==='mobilebox'&&(
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr>{['Department','Mobiles Collected','Received At','On Time / Late','Received By'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
                  <tbody>{currentData.map((m,i)=>(
                    <tr key={m.id} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                      <td style={{padding:'8px 10px',fontWeight:700,color:'var(--text-primary)'}}>{m.department}</td>
                      <td style={{padding:'8px 10px',fontWeight:800,color:'var(--accent)',fontSize:16}}>{m.mobileCount}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{m.timeStr||fmtTime(m.receivedAt)}</td>
                      <td style={{padding:'8px 10px'}}><span style={{background:m.isLate?'#fef3c7':'#f0fdf4',color:m.isLate?'#d97706':'#16a34a',fontWeight:700,fontSize:10,padding:'2px 8px',borderRadius:'var(--radius-lg)'}}>{m.isLate?'⚠ Late':'✅ On Time'}</span></td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{m.receivedBy}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}

              {/* POWER */}
              {section==='power'&&(
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr>{['Status','Time','Recorded By','Duration (if OFF)'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
                  <tbody>{currentData.sort((a,b)=>fmtTime(a.createdAt)>fmtTime(b.createdAt)?1:-1).map((p,i)=>(
                    <tr key={p.id} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                      <td style={{padding:'8px 10px'}}><span style={{background:p.status==='ON'?'#f0fdf4':'#fef2f2',color:p.status==='ON'?'#16a34a':'#ef4444',fontWeight:800,fontSize:12,padding:'3px 10px',borderRadius:'var(--radius-lg)'}}>⚡ {p.status}</span></td>
                      <td style={{padding:'8px 10px',fontWeight:600,color:'var(--text-primary)'}}>{fmtTime(p.createdAt)}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{p.recordedBy}</td>
                      <td style={{padding:'8px 10px',color:'var(--orange)',fontWeight:700}}>{p.status==='OFF'?'Ongoing until next ON event':'—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}

              {/* PERMISSIONS */}
              {section==='permissions'&&(
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr>{['Name','Dept','Reason','Duration','Status','Returned'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
                  <tbody>{currentData.map((p,i)=>(
                    <tr key={p.id} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                      <td style={{padding:'8px 10px',fontWeight:700,color:'var(--text-primary)'}}>{p.alubean_name||p.employeeName}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{p.department}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{p.reason}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-primary)'}}>{p.duration||'—'}</td>
                      <td style={{padding:'8px 10px'}}>
                        <span style={{background:p.status==='Approved'?'var(--green-bg)':p.status==='Rejected'?'var(--red-bg)':'var(--amber-bg)',color:p.status==='Approved'?'var(--green)':p.status==='Rejected'?'var(--red)':'var(--amber)',fontWeight:700,fontSize:10,padding:'2px 8px',borderRadius:'var(--radius-full)'}}>{p.status}</span>
                      </td>
                      <td style={{padding:'8px 10px',color:p.returnedAt?'var(--green)':'var(--amber)',fontWeight:600}}>{p.returnedAt?p.returnedTimeStr||'Yes':'Not returned'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}

              {/* U2→U1 TRANSFERS */}
              {section==='transfers'&&(
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr>{['Name','Dept','Reason','Vehicle','Arrived','Returned','Duration'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
                  <tbody>{currentData.map((t,i)=>(
                    <tr key={t.id} style={{background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                      <td style={{padding:'8px 10px',fontWeight:700,color:'var(--text-primary)'}}>{t.alubean_name}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{t.department}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{t.reason}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{t.vehicleNumber||'—'}</td>
                      <td style={{padding:'8px 10px',color:'var(--orange)',fontWeight:600}}>{t.arrivedTimeStr||'—'}</td>
                      <td style={{padding:'8px 10px',color:t.returnedAt?'var(--green)':'var(--amber)',fontWeight:600}}>{t.returnedAt?t.returnedTimeStr||'Yes':'Still in U1'}</td>
                      <td style={{padding:'8px 10px',color:'var(--text-secondary)'}}>{t.returnedAt?fmtDur(t.arrivedAt,t.returnedAt):'—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}

              {/* TEA */}
              {section==='tea'&&(
                <div>{currentData.map((t,i)=>(
                  <div key={t.id} style={{padding:'14px 16px',borderBottom:`1px solid ${bdr}`,background:i%2===0?(dark?'#1e2235':'#fff'):(dark?'#171a2d':'#f8f9fc')}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                      <span style={{fontWeight:800,color:'var(--text-primary)',fontSize:13}}>{t.session} Session</span>
                      <span style={{fontWeight:900,color:'#a855f7',fontSize:16}}>{t.totalTeas} teas</span>
                    </div>
                    {t.distribution&&t.distribution.length>0&&(
                      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                        {t.distribution.map((d,j)=>(
                          <span key={j} style={{background:dark?'#2d1b69':'#f5f3ff',color:'#7c3aed',fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:20}}>
                            {d.dept}: {d.qty}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:6}}>By {t.submittedBy}</div>
                  </div>
                ))}</div>
              )}

              {/* Manpower section */}
              {section==='manpower'&&(
                data.manpower?.length===0
                  ? <div style={{padding:'40px',textAlign:'center',color:'var(--text-secondary)'}}>No manpower data for this date</div>
                  : data.manpower?.map((mp,i)=>(
                    <div key={mp.id} style={{padding:'16px'}}>
                      <div style={{fontWeight:700,color:'var(--text-primary)',marginBottom:12}}>{mp.shift} · {mp.date} · By {mp.submittedBy}</div>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead><tr style={{background:'var(--bg-overlay)'}}>
                          {['Department','Budget','Required','Actual','Pending'].map(h=>(
                            <th key={h} style={{padding:'8px 10px',fontWeight:700,color:'var(--text-secondary)',textAlign:h==='Department'?'left':'center',borderBottom:'1px solid var(--border-subtle)'}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {(mp.u1||[]).map((r,j)=>(
                            <tr key={j} style={{borderBottom:'1px solid var(--border-subtle)'}}>
                              <td style={{padding:'7px 10px',fontWeight:600,color:'var(--text-primary)'}}>{r.dept}</td>
                              <td style={{padding:'7px 10px',textAlign:'center',color:'var(--text-secondary)'}}>{r.budget||0}</td>
                              <td style={{padding:'7px 10px',textAlign:'center',color:'#3b82f6',fontWeight:700}}>{r.todayReq||0}</td>
                              <td style={{padding:'7px 10px',textAlign:'center',color:'var(--green)',fontWeight:700}}>{r.actual||0}</td>
                              <td style={{padding:'7px 10px',textAlign:'center',color:(r.pending||0)>0?'var(--red)':'var(--green)',fontWeight:700}}>{r.pending||0}</td>
                            </tr>
                          ))}
                          {mp.totals?.u1&&(
                            <tr style={{background:'var(--bg-overlay)',fontWeight:800}}>
                              <td style={{padding:'8px 10px',color:'var(--text-primary)'}}>TOTAL</td>
                              <td style={{padding:'8px 10px',textAlign:'center'}}>{mp.totals.u1.budget||0}</td>
                              <td style={{padding:'8px 10px',textAlign:'center',color:'#3b82f6'}}>{mp.totals.u1.todayReq||0}</td>
                              <td style={{padding:'8px 10px',textAlign:'center',color:'var(--green)'}}>{mp.totals.u1.actual||0}</td>
                              <td style={{padding:'8px 10px',textAlign:'center',color:(mp.totals.u1.pending||0)>0?'var(--red)':'var(--green)'}}>{mp.totals.u1.pending||0}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                      {mp.remarks&&<div style={{marginTop:8,fontSize:11,color:'var(--text-secondary)'}}>📝 {mp.remarks}</div>}
                    </div>
                  ))
              )}
            </div>
          }
        </>
      )}
    </div>
  );
}

// ── SHIFT LOG TAB ─────────────────────────────────────────────────────────────
function ShiftLogTab({dark,card,txt,sub,bdr,col,userProfile}) {
  const [form,setForm]=useState({shift:'Day',notes:'',pendingVehicles:'',powerIssues:'',specialVisitors:'',staffOnDuty:''});
  const [logs,setLogs]=useState([]);
  const [saving,setSaving]=useState(false);
  const [expanded,setExpanded]=useState(null);

  useEffect(()=>{
    const q=query(collection(db,col('shiftlog')),orderBy('createdAt','desc'),limit(20));
    return onSnapshot(q,s=>setLogs(s.docs.map(d=>({id:d.id,...d.data()}))));
  },[]);

  const inp={border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',padding:'9px 12px',fontSize:13,outline:'none',fontFamily:'var(--font-sans)',background:'var(--bg-raised)',color:'var(--text-primary)',width:'100%',boxSizing:'border-box'};

  async function save(){
    setSaving(true);
    try{
      await addDoc(collection(db,col('shiftlog')),{...form,date:todayStr(),submittedBy:userProfile?.name,createdAt:serverTimestamp()});
      setForm({shift:'Day',notes:'',pendingVehicles:'',powerIssues:'',specialVisitors:'',staffOnDuty:''});
    }catch(e){alert(e.message);}
    finally{setSaving(false);}
  }

  return (
    <div>
      <h2 style={{margin:'0 0 16px',fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>📋 Shift Handover Log</h2>

      <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',padding:'18px',marginBottom:20}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Shift</label>
            <select style={{...inp,cursor:'pointer'}} value={form.shift} onChange={e=>setForm(f=>({...f,shift:e.target.value}))}>
              {['Day (6AM-2PM)','Evening (2PM-10PM)','Night (10PM-6AM)'].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Staff on Duty</label>
            <input style={inp} value={form.staffOnDuty} onChange={e=>setForm(f=>({...f,staffOnDuty:e.target.value}))} placeholder="Names of security staff"/>
          </div>
        </div>
        {[['Pending Vehicles','pendingVehicles','Any vehicles still inside?'],['Power Issues','powerIssues','Any power events this shift?'],['Special Visitors','specialVisitors','VIP or unusual visitors?'],['Handover Notes','notes','General notes for next shift']].map(([l,k,p])=>(
          <div key={k} style={{marginBottom:10}}>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>{l}</label>
            <textarea style={{...inp,resize:'vertical'}} rows={2} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={p}/>
          </div>
        ))}
        <button onClick={save} disabled={saving} style={{background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:'var(--radius-md)',padding:'11px 24px',color:'#fff',fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'var(--font-sans)'}}>
          {saving?'⏳ Saving...':'💾 Submit Shift Handover'}
        </button>
      </div>

      {/* Log history */}
      {logs.map(l=>(
        <div key={l.id} style={{background:'var(--bg-raised)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',marginBottom:8,overflow:'hidden'}}>
          <div style={{padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',background:dark?'#1e2235':'#f8f9fc'}} onClick={()=>setExpanded(e=>e===l.id?null:l.id)}>
            <div>
              <span style={{fontWeight:700,color:'var(--text-primary)'}}>{l.shift}</span>
              <span style={{color:'var(--text-secondary)',fontSize:12,marginLeft:10}}>{l.date} · By {l.submittedBy}</span>
            </div>
            <span style={{color:'var(--orange)'}}>{expanded===l.id?'▲':'▼'}</span>
          </div>
          {expanded===l.id&&(
            <div style={{padding:'12px 16px',fontSize:13}}>
              {[['Staff on Duty','staffOnDuty'],['Pending Vehicles','pendingVehicles'],['Power Issues','powerIssues'],['Special Visitors','specialVisitors'],['Notes','notes']].map(([label,k])=>l[k]&&(
                <div key={k} style={{marginBottom:8}}>
                  <span style={{fontWeight:700,color:'var(--text-secondary)',fontSize:11}}>{label}: </span>
                  <span style={{color:'var(--text-primary)'}}>{l[k]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── UNIT 2 → UNIT 1 TRANSFER TAB ──────────────────────────────────────────────
function TransferTab({dark,card,txt,sub,bdr,col,userProfile,unit,isMobile}) {
  const TRANSFER_REASONS = ['Material Collection','Tool/Die Pickup','Machine Parts','Production Support','Maintenance Support','Management Visit','Other'];
  const [form,setForm]=useState({alubean_name:'',department:INTERNAL_DEPTS[0],reason:TRANSFER_REASONS[0],vehicleNumber:'',remarks:''});
  const [records,setRecords]=useState([]);
  const [saving,setSaving]=useState(false);
  const [editRec, setEditRec] = useState(null);
  const [markingOut,setMarkingOut]=useState(null);
  const [view,setView]=useState('log');
  const colName='security_transfer_u2_u1';

  useEffect(()=>{
    const load=async()=>{
      const {collection,query,limit,onSnapshot}=await import('firebase/firestore');
      const {db}=await import('../firebase');
      const q=query(collection(db,colName),limit(100));
      return onSnapshot(q,s=>{
        setRecords(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
          const ta=a.arrivedAt?.seconds||0; const tb=b.arrivedAt?.seconds||0; return tb-ta;
        }));
      });
    };
    let unsub; load().then(u=>{unsub=u;}); return()=>{if(unsub)unsub();};
  },[]);

  const inp={border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',padding:'9px 12px',fontSize:13,outline:'none',fontFamily:'var(--font-sans)',background:'var(--bg-raised)',color:'var(--text-primary)',width:'100%',boxSizing:'border-box'};
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  async function save(){
    if(!form.alubean_name.trim()) return alert('Alubean name required');
    setSaving(true);
    try{
      const {collection,addDoc,serverTimestamp}=await import('firebase/firestore');
      const {db}=await import('../firebase');
      await addDoc(collection(db,colName),{
        ...form, arrivedAt:serverTimestamp(),
        arrivedTimeStr:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),
        date:todayStr(), recordedBy:userProfile?.name||'Security', unit:'u1',
        status:'Inside', returnedAt:null,
      });
      await createNotification('u1', NOTIF_TYPES.TRANSFER, {
        title:`🔄 U2→U1 — ${form.alubean_name} Arrived`,
        message:`${form.alubean_name} (${form.department}) arrived from Unit 2. Reason: ${form.reason}. By ${userProfile?.name}`,
        screen:'security', tab:'transfer',
      });
      setForm({alubean_name:'',department:INTERNAL_DEPTS[0],reason:TRANSFER_REASONS[0],vehicleNumber:'',remarks:''});
      setView('log');
    }catch(e){alert(e.message);}
    finally{setSaving(false);}
  }

  async function markReturn(r){
    setMarkingOut(r.id);
    try{
      const {updateDoc,doc,serverTimestamp}=await import('firebase/firestore');
      const {db}=await import('../firebase');
      const returnedTimeStr=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
      await updateDoc(doc(db,colName,r.id),{
        status:'Returned', returnedAt:serverTimestamp(),
        returnedTimeStr, returnRecordedBy:userProfile?.name||'Security',
      });
      await createNotification('u1', NOTIF_TYPES.TRANSFER, {
        title:`🔄 U2→U1 — ${r.alubean_name} Returned`,
        message:`${r.alubean_name} (${r.department}) returned to Unit 2 at ${returnedTimeStr}. By ${userProfile?.name}`,
        screen:'security', tab:'transfer',
      });
    }catch(e){alert(e.message);}
    finally{setMarkingOut(null);}
  }

  const todayRecs  = records.filter(r=>r.date===todayStr());
  const insideNow  = todayRecs.filter(r=>r.status==='Inside'||!r.returnedAt);
  const returnedToday = todayRecs.filter(r=>r.status==='Returned'&&r.returnedAt);

  return(
    <div>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <h2 style={{margin:0,fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>🔄 Unit 2 → Unit 1 Transfer</h2>
          <p style={{margin:'4px 0 0',fontSize:12,color:'var(--text-secondary)'}}>{insideNow.length} currently in U1 · {todayRecs.length} movements today</p>
        </div>
        <div style={{display:'flex',gap:6}}>
          {[['log','📋 Status'],['entry','+ Record'],['history','🗓 History']].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{background:view===v?'#f97316':'transparent',border:`1px solid ${view===v?'#f97316':dark?'#2d3748':'#e8e8e8'}`,borderRadius:'var(--radius-md)',padding:'6px 12px',color:view===v?'#fff':sub,fontSize:11,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
              {l}{v==='log'&&insideNow.length>0&&<span style={{marginLeft:4,background:'var(--red)',color:'#fff',borderRadius:'var(--radius-md)',padding:'1px 6px',fontSize:9,fontWeight:800}}>{insideNow.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* DASHBOARD — currently inside from U2 */}
      {view==='log'&&(
        <div>
          {/* Summary cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
            {[
              {l:'Currently in U1',v:insideNow.length,c:'#f97316',bg:dark?'rgba(249,115,22,0.15)':'#fff7ed'},
              {l:'Returned Today',v:returnedToday.length,c:'#16a34a',bg:dark?'rgba(22,163,74,0.12)':'#f0fdf4'},
              {l:'Total Movements',v:todayRecs.length,c:'#3b82f6',bg:dark?'rgba(59,130,246,0.12)':'#eff6ff'},
            ].map(k=>(
              <div key={k.l} style={{background:k.bg,borderRadius:'var(--radius-md)',padding:'12px',textAlign:'center',border:'1px solid var(--border-subtle)'}}>
                <div style={{fontSize:24,fontWeight:900,color:k.c}}>{k.v}</div>
                <div style={{fontSize:10,color:'var(--text-secondary)',marginTop:3,fontWeight:600,textTransform:'uppercase'}}>{k.l}</div>
              </div>
            ))}
          </div>

          {/* Currently inside — with Mark Return button */}
          {insideNow.length>0&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:'var(--orange)',marginBottom:8,textTransform:'uppercase',letterSpacing:0.5}}>🔴 Currently in Unit 1 — tap to mark return</div>
              {insideNow.map(r=>(
                <div key={r.id} style={{background:'var(--bg-raised)',borderRadius:'var(--radius-md)',border:'2px solid rgba(249,115,22,0.4)',padding:'12px 16px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,color:'var(--text-primary)',fontSize:14}}>{r.alubean_name}</div>
                    <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>{r.department} · {r.reason}</div>
                    <div style={{fontSize:11,color:'var(--orange)',marginTop:2}}>Arrived {r.arrivedTimeStr}{r.vehicleNumber?` · ${r.vehicleNumber}`:''}</div>
                  </div>
                  <button onClick={()=>markReturn(r)} disabled={markingOut===r.id}
                    style={{background:'linear-gradient(135deg,var(--green),var(--green-dim))',border:'none',borderRadius:'var(--radius-md)',padding:'10px 16px',color:'#fff',fontSize:12,fontWeight:800,cursor:markingOut===r.id?'not-allowed':'pointer',fontFamily:'var(--font-sans)',whiteSpace:'nowrap'}}>
                    {markingOut===r.id?'⏳':'✅ Mark Return'}
                  </button>
                  <button onClick={()=>setEditRec(r)} style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-sm)',padding:'8px',color:'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✎</button>
                </div>
              ))}
            </div>
          )}

          {/* Returned today */}
          {returnedToday.length>0&&(
            <div>
              <div style={{fontSize:12,fontWeight:700,color:'var(--green-dim)',marginBottom:8,textTransform:'uppercase',letterSpacing:0.5}}>✅ Returned Today ({returnedToday.length})</div>
              {returnedToday.map(r=>(
                <div key={r.id} style={{background:'var(--bg-raised)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',padding:'12px 16px',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center',opacity:0.8}}>
                  <div>
                    <span style={{fontWeight:700,color:'var(--text-primary)'}}>{r.alubean_name}</span>
                    <span style={{color:'var(--text-secondary)',fontSize:11,marginLeft:8}}>{r.department} · {r.reason}</span>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <div style={{textAlign:'right',fontSize:11,color:'var(--text-secondary)'}}>
                      <div>In: {r.arrivedTimeStr}</div>
                      <div style={{color:'var(--green-dim)',fontWeight:600}}>Out: {r.returnedTimeStr}</div>
                    </div>
                    <button onClick={()=>setEditRec(r)} style={{background:'var(--glass-1)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-sm)',padding:'5px 8px',color:'var(--text-secondary)',fontSize:11,cursor:'pointer',fontFamily:'var(--font-sans)'}}>✎</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {todayRecs.length===0&&(
            <div style={{padding:'40px',textAlign:'center',color:'var(--text-secondary)',background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)'}}>
              No transfers recorded today
            </div>
          )}
          {editRec&&<EditRecordModal record={editRec} colName={colName} onClose={()=>setEditRec(null)} dark={dark} fields={[
            {key:'alubean_name',     label:'Alubean Name'},
            {key:'department',       label:'Department', options:INTERNAL_DEPTS},
            {key:'reason',           label:'Reason', options:['Material Collection','Tool/Die Pickup','Machine Parts','Production Support','Maintenance Support','Management Visit','Other']},
            {key:'vehicleNumber',    label:'Vehicle Number'},
            {key:'arrivedTimeStr',   label:'Arrived Time', type:'time'},
            {key:'returnedTimeStr',  label:'Return Time', type:'time'},
            {key:'remarks',          label:'Remarks', full:true},
          ]}/> }
        </div>
      )}

      {/* ENTRY FORM */}
      {view==='entry'&&(
        <div style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-subtle)',padding:'20px'}}>
          <div style={{fontWeight:700,color:'var(--text-primary)',marginBottom:14}}>Record Arrival from Unit 2</div>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12}}>
            {[['Alubean Name *','alubean_name','text'],['Vehicle Number (if any)','vehicleNumber','text']].map(([l,k,t])=>(
              <div key={k}>
                <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>{l}</label>
                <input style={inp} type={t} value={form[k]} onChange={e=>set(k,e.target.value)} placeholder={l.replace(' *','')}/>
              </div>
            ))}
            {[['Department','department',INTERNAL_DEPTS],['Reason','reason',TRANSFER_REASONS]].map(([l,k,opts])=>(
              <div key={k}>
                <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>{l}</label>
                <select style={{...inp,cursor:'pointer'}} value={form[k]} onChange={e=>set(k,e.target.value)}>
                  {opts.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div style={{gridColumn:'1/-1'}}>
              <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Remarks</label>
              <input style={inp} value={form.remarks} onChange={e=>set('remarks',e.target.value)} placeholder="Optional"/>
            </div>
          </div>
          <button onClick={save} disabled={saving} style={{marginTop:16,background:saving?'#999':'linear-gradient(135deg,#f97316,#ea580c)',border:'none',borderRadius:'var(--radius-md)',padding:'12px 28px',color:'#fff',fontSize:14,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'var(--font-sans)'}}>
            {saving?'⏳ Recording...':'✅ Record Arrival from U2'}
          </button>
        </div>
      )}

      {/* HISTORY */}
      {view==='history'&&(
        <div>
          <div style={{fontWeight:700,color:'var(--text-primary)',marginBottom:10}}>All Records</div>
          {records.filter(r=>r.date!==todayStr()).length===0&&<div style={{padding:'30px',textAlign:'center',color:'var(--text-secondary)',background:'var(--bg-raised)',borderRadius:'var(--radius-lg)'}}>No historical records</div>}
          {records.filter(r=>r.date!==todayStr()).map((r,i)=>(
            <div key={r.id} style={{background:'var(--bg-raised)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',padding:'12px 16px',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:13}}>{r.alubean_name} <span style={{fontSize:11,color:'var(--text-secondary)'}}>· {r.department}</span></div>
                <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>{r.reason} · {r.date}</div>
              </div>
              <div style={{textAlign:'right',fontSize:11}}>
                <div style={{color:'var(--orange)'}}>In: {r.arrivedTimeStr}</div>
                {r.returnedTimeStr&&<div style={{color:'var(--green-dim)'}}>Out: {r.returnedTimeStr}</div>}
                {!r.returnedAt&&<div style={{color:'var(--red)',fontWeight:600}}>No return recorded</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



// ── DC ENTRY MODAL ────────────────────────────────────────────────────────────
// Shown when a vehicle with outgoing job-work purpose tries to exit
function DCEntryModal({ vehicle, unit, userProfile, onClose, onSubmitted }) {
  const [form, setForm] = useState({
    dcNumber:'', supplier:'', itemDescription:'', processType:'',
    quantity:'', unit_of_measure:'Nos', hourlyRate:'', estimatedHours:'', remarks:''
  });
  const [saving, setSaving] = useState(false);
  const upd = (k,v) => setForm(f=>({...f,[k]:v}));

  const budgetaryCost = (parseFloat(form.hourlyRate)||0) * (parseFloat(form.estimatedHours)||0);

  const PROCESS_TYPES = ['Heat Treatment','Nitriding','Cylindrical Grinding','VMC Machining','CNC Turning','Surface Grinding','Electroplating','Powder Coating','Anodizing','Hard Chrome','Welding/Fabrication','Other'];
  const UOM = ['Nos','Kgs','Lots','Sets'];

  const inp = {border:'1px solid #d1d5db',borderRadius:'var(--radius-md)',padding:'9px 12px',fontSize:13,outline:'none',fontFamily:'var(--font-sans)',background:'#ffffff',color:'#111827',width:'100%',boxSizing:'border-box'};

  async function submit() {
    if(!form.dcNumber.trim()) return alert('DC Number is required');
    if(!form.supplier.trim()) return alert('Supplier name is required');
    if(!form.itemDescription.trim()) return alert('Item description is required');
    setSaving(true);
    try {
      const { addDoc: ad } = await import('firebase/firestore');
      const { createNotification: cn, NOTIF_TYPES: NT } = await import('../utils/notificationService');
      const ref = await ad(collection(db,'dc_approvals'), {
        dcNumber: form.dcNumber.trim(),
        supplier: form.supplier.trim(),
        itemDescription: form.itemDescription.trim(),
        processType: form.processType,
        quantity: parseFloat(form.quantity)||0,
        unitOfMeasure: form.unit_of_measure,
        hourlyRate: parseFloat(form.hourlyRate)||0,
        estimatedHours: parseFloat(form.estimatedHours)||0,
        budgetaryCost,
        remarks: form.remarks,
        vehicleId: vehicle.id,
        vehicleNumber: vehicle.vehicleNumber,
        driverName: vehicle.driverName,
        vehiclePurpose: vehicle.purpose,
        status: 'Pending',
        unit: unit||'u1',
        submittedBy: userProfile?.name||'Security',
        createdAt: serverTimestamp(),
        approvedBy: null, approvedAt: null,
        rejectedBy: null, rejectedAt: null,
        rejectionReason: '',
      });
      await cn(unit||'u1', NT.TASK_UPDATED, {
        title: `📄 DC Approval Required`,
        message: `DC#${form.dcNumber} | ${form.supplier} | ${form.itemDescription} | ₹${budgetaryCost.toLocaleString('en-IN')} | Vehicle: ${vehicle.vehicleNumber} | Submitted by ${userProfile?.name}`,
        taskId: null,
        pendingApproval: true,
      });
      onSubmitted(ref.id);
    } catch(e) { alert('Submit failed: '+e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-raised)',borderRadius:16,width:'100%',maxWidth:520,padding:24,maxHeight:'92vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
          <div>
            <div style={{fontWeight:900,fontSize:16,color:'var(--text-primary)'}}>📄 Delivery Challan Entry</div>
            <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:3}}>Required before {vehicle.vehicleNumber} can exit · {vehicle.purpose}</div>
          </div>
          <button onClick={onClose} style={{background:'var(--glass-1)',border:'none',borderRadius:8,fontSize:18,cursor:'pointer',color:'var(--text-secondary)',width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
        </div>

        <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:10,padding:'10px 14px',margin:'12px 0',fontSize:12,color:'#9a3412',fontWeight:600}}>
          ⚠ This vehicle cannot exit until the DC is submitted and approved by the owner.
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {/* DC Number */}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>DC Number *</label>
            <input style={{...inp,border:'1.5px solid #3b82f6',background:'#eff6ff',fontWeight:800,color:'#1e40af'}} value={form.dcNumber} onChange={e=>upd('dcNumber',e.target.value)} placeholder="e.g. DC/2026/001"/>
          </div>
          {/* Supplier */}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>To Supplier *</label>
            <input style={inp} value={form.supplier} onChange={e=>upd('supplier',e.target.value)} placeholder="Supplier name"/>
          </div>
          {/* Item description */}
          <div style={{gridColumn:'1/-1'}}>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Item / Material Description *</label>
            <input style={inp} value={form.itemDescription} onChange={e=>upd('itemDescription',e.target.value)} placeholder="e.g. C6X 601 Die Insert — set of 2"/>
          </div>
          {/* Process type */}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Process Type</label>
            <select style={{...inp,cursor:'pointer'}} value={form.processType} onChange={e=>upd('processType',e.target.value)}>
              <option value="">— Select —</option>
              {PROCESS_TYPES.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          {/* Qty + UOM */}
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:8}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Quantity</label>
              <input style={inp} type="number" min={0} value={form.quantity} onChange={e=>upd('quantity',e.target.value)} placeholder="0"/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>UOM</label>
              <select style={{...inp,cursor:'pointer'}} value={form.unit_of_measure} onChange={e=>upd('unit_of_measure',e.target.value)}>
                {UOM.map(u=><option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          {/* Hourly rate */}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Hourly Rate (₹)</label>
            <input style={{...inp,color:'#15803d',fontWeight:700}} type="number" min={0} step={0.01} value={form.hourlyRate} onChange={e=>upd('hourlyRate',e.target.value)} placeholder="₹ per hour"/>
          </div>
          {/* Estimated hours */}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Estimated Hours</label>
            <input style={{...inp,color:'#15803d',fontWeight:700}} type="number" min={0} step={0.5} value={form.estimatedHours} onChange={e=>upd('estimatedHours',e.target.value)} placeholder="Hours"/>
          </div>
          {/* Budgetary cost — auto calc */}
          <div style={{gridColumn:'1/-1'}}>
            <div style={{background:'#f0fdf4',border:'2px solid #86efac',borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'#166534',textTransform:'uppercase'}}>Approx Budgetary Cost</div>
                <div style={{fontSize:9,color:'#15803d',marginTop:1}}>Hourly Rate × Estimated Hours</div>
              </div>
              <div style={{fontSize:24,fontWeight:900,color:'#15803d'}}>₹{budgetaryCost.toLocaleString('en-IN',{maximumFractionDigits:2})}</div>
            </div>
          </div>
          {/* Remarks */}
          <div style={{gridColumn:'1/-1'}}>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Remarks</label>
            <input style={inp} value={form.remarks} onChange={e=>upd('remarks',e.target.value)} placeholder="Optional — special instructions, expected return date, etc."/>
          </div>
        </div>

        <div style={{display:'flex',gap:10,marginTop:20}}>
          <button onClick={onClose} style={{flex:1,padding:'11px 0',borderRadius:9,border:'1px solid var(--border-subtle)',background:'var(--glass-1)',color:'var(--text-secondary)',fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving} style={{flex:2,padding:'11px 0',borderRadius:9,border:'none',background:saving?'#999':'linear-gradient(135deg,#1e40af,#1d4ed8)',color:'#fff',fontWeight:800,fontSize:14,cursor:saving?'not-allowed':'pointer',fontFamily:'var(--font-sans)'}}>
            {saving?'⏳ Submitting…':'📤 Submit for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DC APPROVAL TAB ───────────────────────────────────────────────────────────
function DCApprovalTab({ dark, card, txt, sub, bdr, dcApprovals, pendingDCs, userProfile, unit, isOwner, isMobile }) {
  const [view, setView] = useState(pendingDCs.length>0?'pending':'all');
  const [rejecting, setRejecting] = useState(null); // id being rejected
  const [rejReason, setRejReason] = useState('');
  const [acting, setActing] = useState(null);

  async function approve(dc) {
    setActing(dc.id);
    try {
      const { updateDoc: ud, doc: d } = await import('firebase/firestore');
      await ud(d(db,'dc_approvals',dc.id),{
        status:'Approved', approvedBy:userProfile?.name, approvedAt:serverTimestamp()
      });
      const {createNotification:cn,NOTIF_TYPES:NT}=await import('../utils/notificationService');
      await cn(unit||'u1', NT.DC, {
        title:`✅ DC Approved`,
        message:`DC#${dc.dcNumber} | ${dc.supplier} | ₹${(dc.budgetaryCost||0).toLocaleString('en-IN')} | Vehicle ${dc.vehicleNumber} cleared to exit | Approved by ${userProfile?.name}`,
        taskId:null,
      });
    } catch(e){alert(e.message);}
    finally{setActing(null);}
  }

  async function reject(dc) {
    if(!rejReason.trim()) return alert('Please enter a rejection reason');
    setActing(dc.id);
    try {
      const { updateDoc: ud, doc: d } = await import('firebase/firestore');
      await ud(d(db,'dc_approvals',dc.id),{
        status:'Rejected', rejectedBy:userProfile?.name, rejectedAt:serverTimestamp(), rejectionReason:rejReason
      });
      setRejecting(null); setRejReason('');
    } catch(e){alert(e.message);}
    finally{setActing(null);}
  }

  const statusStyle = { Pending:{bg:'#fffbeb',color:'#b45309',border:'#fde68a'}, Approved:{bg:'#f0fdf4',color:'#15803d',border:'#86efac'}, Rejected:{bg:'#fef2f2',color:'#b91c1c',border:'#fca5a5'} };
  const displayed = view==='pending' ? pendingDCs : dcApprovals;

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <h2 style={{margin:0,fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>📄 DC Approval</h2>
        <div style={{display:'flex',gap:6}}>
          {['pending','all'].map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{position:'relative',background:view===v?'#1e40af':'transparent',border:`1px solid ${view===v?'#1e40af':dark?'#2d3748':'#e8e8e8'}`,borderRadius:'var(--radius-md)',padding:'6px 14px',color:view===v?'#fff':sub,fontSize:12,cursor:'pointer',fontFamily:'var(--font-sans)',fontWeight:view===v?700:400}}>
              {v==='pending'?'⏳ Pending':'📋 All'}
              {v==='pending'&&pendingDCs.length>0&&<span style={{position:'absolute',top:-5,right:-5,background:'#ef4444',color:'#fff',borderRadius:'50%',width:15,height:15,fontSize:8,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{pendingDCs.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {!isOwner && view==='pending' && (
        <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'12px 16px',marginBottom:16,fontSize:12,color:'#1e40af',fontWeight:600}}>
          ℹ DCs are shown here. Only the owner can approve or reject. Security — please inform the owner to check the DC Approval tab.
        </div>
      )}

      {displayed.length===0 && (
        <div style={{textAlign:'center',padding:'48px 20px',color:'var(--text-secondary)',background:'var(--bg-raised)',borderRadius:'var(--radius-lg)'}}>
          {view==='pending'?'✅ No pending DCs — all clear':'No DC records yet'}
        </div>
      )}

      {displayed.map(dc=>{
        const st = statusStyle[dc.status]||statusStyle.Pending;
        const isRej = rejecting===dc.id;
        return (
          <div key={dc.id} style={{background:'var(--bg-raised)',borderRadius:'var(--radius-lg)',border:`2px solid ${st.border}`,padding:'16px 18px',marginBottom:12}}>
            {/* Header row */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8,marginBottom:12}}>
              <div>
                <div style={{fontWeight:900,fontSize:15,color:'var(--text-primary)'}}>DC#{dc.dcNumber}</div>
                <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>
                  {dc.alubeanName ? <>👤 {dc.alubeanName} · {dc.department} · {dc.movementType}</> : <>🚗 {dc.vehicleNumber} · 👤 {dc.driverName} · {dc.vehiclePurpose}</>}
                </div>
                <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>
                  Submitted by {dc.submittedBy} · {dc.createdAt?.toDate?.()?.toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})||'—'}
                </div>
              </div>
              <span style={{background:st.bg,color:st.color,border:`1.5px solid ${st.border}`,borderRadius:8,padding:'4px 12px',fontWeight:800,fontSize:12,whiteSpace:'nowrap'}}>
                {dc.status==='Pending'?'⏳ Pending':dc.status==='Approved'?'✅ Approved':'❌ Rejected'}
              </span>
            </div>

            {/* Detail grid */}
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'1fr 1fr 1fr 1fr',gap:10,marginBottom:12}}>
              {[
                ['To Supplier',  dc.supplier,            '#1e40af','#eff6ff'],
                ['Item',         dc.itemDescription,     '#374151','#f9fafb'],
                ['Process',      dc.processType||'—',    '#374151','#f9fafb'],
                ['Qty',          `${dc.quantity||0} ${dc.unitOfMeasure||'Nos'}`, '#374151','#f9fafb'],
                ['Hourly Rate',  `₹${(dc.hourlyRate||0).toLocaleString('en-IN')}`, '#15803d','#f0fdf4'],
                ['Est. Hours',   `${dc.estimatedHours||0} hrs`,   '#15803d','#f0fdf4'],
                ['Budgetary Cost',`₹${(dc.budgetaryCost||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`, '#b45309','#fffbeb'],
                ['Remarks',      dc.remarks||'—',        '#6b7280','#f9fafb'],
              ].map(([lbl,val,color,bg])=>(
                <div key={lbl} style={{background:bg,borderRadius:8,padding:'8px 10px'}}>
                  <div style={{fontSize:9,fontWeight:700,color:'#6b7280',textTransform:'uppercase',marginBottom:2}}>{lbl}</div>
                  <div style={{fontSize:12,fontWeight:800,color}}>{val}</div>
                </div>
              ))}
            </div>

            {/* Approval info */}
            {dc.status==='Approved' && (
              <div style={{fontSize:11,color:'#15803d',fontWeight:600}}>✅ Approved by {dc.approvedBy} · {dc.approvedAt?.toDate?.()?.toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})||'—'}</div>
            )}
            {dc.status==='Rejected' && (
              <div style={{fontSize:11,color:'#b91c1c',fontWeight:600}}>❌ Rejected by {dc.rejectedBy} — "{dc.rejectionReason}"</div>
            )}

            {/* Action buttons — owner only, pending only */}
            {isOwner && dc.status==='Pending' && !isRej && (
              <div style={{display:'flex',gap:10,marginTop:12}}>
                <button onClick={()=>{setRejecting(dc.id);setRejReason('');}}
                  style={{flex:1,padding:'10px 0',borderRadius:9,border:'1.5px solid #fca5a5',background:'#fef2f2',color:'#b91c1c',fontWeight:800,fontSize:13,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                  ❌ Reject
                </button>
                <button onClick={()=>approve(dc)} disabled={acting===dc.id}
                  style={{flex:2,padding:'10px 0',borderRadius:9,border:'none',background:acting===dc.id?'#999':'linear-gradient(135deg,#15803d,#16a34a)',color:'#fff',fontWeight:800,fontSize:14,cursor:acting===dc.id?'not-allowed':'pointer',fontFamily:'var(--font-sans)'}}>
                  {acting===dc.id?'⏳ Approving…':'✅ Approve & Clear to Exit'}
                </button>
              </div>
            )}
            {isOwner && dc.status==='Pending' && isRej && (
              <div style={{marginTop:12}}>
                <input value={rejReason} onChange={e=>setRejReason(e.target.value)} placeholder="Rejection reason (required)"
                  style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #fca5a5',fontSize:13,marginBottom:8,boxSizing:'border-box',fontFamily:'var(--font-sans)'}}/>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setRejecting(null)} style={{flex:1,padding:'9px 0',borderRadius:9,border:'1px solid var(--border-subtle)',background:'var(--glass-1)',color:'var(--text-secondary)',fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)'}}>Cancel</button>
                  <button onClick={()=>reject(dc)} disabled={acting===dc.id} style={{flex:1,padding:'9px 0',borderRadius:9,border:'none',background:'#dc2626',color:'#fff',fontWeight:800,cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                    {acting===dc.id?'⏳ Rejecting…':'Confirm Reject'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function requestIsFullyApproved(r) {
  if (!r || r.rejected) return false;
  if (r.autoApproved) return true;
  const flow = Array.isArray(r.flow) ? r.flow : [];
  if (!flow.length) return false;
  return flow.every((s) => {
    const role = typeof s === 'object' ? s.role : s;
    return r.approvals?.[role]?.status === 'Approved';
  });
}

function requestDateKey(r) {
  return String(r?.date || r?.dateFrom || (r?.createdAt || '')).slice(0, 10);
}

function approvalChips(req) {
  const flow = Array.isArray(req.flow) ? req.flow : [];
  return flow.map((s) => {
    const role = typeof s === 'object' ? s.role : s;
    const label = (typeof s === 'object' && s.label) ? s.label : (role === 'jmd' || role === 'jmd_1' ? 'JMD 1' : role === 'jmd_2' ? 'JMD 2' : role === 'md' ? 'MD' : role === 'reporting' ? 'Reporting' : String(role));
    const st = req.approvals?.[role]?.status;
    return { role, label, st };
  });
}

// ── OD / VISITOR GATE (from Requests) ─────────────────────────────────────────
function SecurityRequestGateTab({ type, dark, card, txt, sub, bdr, col, userProfile, unit, isMobile }) {
  const isOD = type === 'od';
  const [filterDate, setFilterDate] = useState(todayStr());
  const [requests, setRequests] = useState([]);
  const [acting, setActing] = useState(null);

  useEffect(() => {
    return subscribeAppRequests((docs) => {
      setRequests((docs || []).filter((r) => r.type === type && !r.deleted && r.active !== false));
    });
  }, [type]);

  const listed = requests.filter((r) => {
    if (r.cancelled || r.rejected) return false;
    const d = requestDateKey(r);
    if (d === filterDate) return true;
    if (filterDate === todayStr()) {
      if (isOD && r.securityOutTime && !r.securityInTime) return true;
      if (!isOD && r.securityInTime && !r.securityOutTime) return true;
    }
    return false;
  }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const awaiting = listed.filter((r) => requestIsFullyApproved(r) && (isOD ? !r.securityOutTime : !r.securityInTime));
  const openGate = listed.filter((r) => isOD ? (r.securityOutTime && !r.securityInTime) : (r.securityInTime && !r.securityOutTime));
  const done = listed.filter((r) => r.securityOutTime && r.securityInTime);
  const pendingApproval = listed.filter((r) => !r.rejected && !requestIsFullyApproved(r) && !r.securityOutTime && !r.securityInTime);

  async function markOut(req) {
    setActing(req.id);
    try {
      const outTimeStr = timeStr();
      const stamp = new Date().toISOString();
      let logId = req.securityLogId || null;
      if (isOD) {
        const ref = await addDoc(collection(db, col('internal')), {
          alubean_name: req.employeeName,
          department: req.dept?.toUpperCase() || 'General',
          movementType: req.purpose || 'OD',
          destination: req.visitingTo || '',
          vehicleNumber: req.vehicle || req.vehicleNumber || '',
          remarks: 'OD Request',
          outTime: serverTimestamp(),
          inTime: null,
          date: todayStr(),
          outTimeStr,
          status: 'Out',
          recordedBy: userProfile?.name || 'Security',
          unit: unit || 'u1',
          fromRequest: req.id,
        });
        logId = ref.id;
        await updateAppRequest(req.id, {
          securityOutTime: stamp,
          securityOutTimeStr: outTimeStr,
          securityOutBy: userProfile?.name || 'Security',
          securityLogId: logId,
          securityActioned: true,
          securityActionedAt: stamp,
          securityActionedBy: userProfile?.name || 'Security',
        });
      } else {
        if (req.securityLogId) {
          await updateDoc(doc(db, col('visitors'), req.securityLogId), {
            outTime: serverTimestamp(),
            outTimeStr,
            exitRecordedBy: userProfile?.name,
          });
        }
        await updateAppRequest(req.id, {
          securityOutTime: stamp,
          securityOutTimeStr: outTimeStr,
          securityOutBy: userProfile?.name || 'Security',
          securityActioned: true,
          securityActionedAt: stamp,
          securityActionedBy: userProfile?.name || 'Security',
        });
      }
    } catch (e) {
      alert('Failed: ' + e.message);
    } finally {
      setActing(null);
    }
  }

  async function markIn(req) {
    setActing(req.id);
    try {
      const inTimeStr = timeStr();
      const stamp = new Date().toISOString();
      if (isOD) {
        await updateAppRequest(req.id, {
          securityInTime: stamp,
          securityInTimeStr: inTimeStr,
          securityInBy: userProfile?.name || 'Security',
        });
        if (req.securityLogId) {
          await updateDoc(doc(db, col('internal'), req.securityLogId), {
            inTime: serverTimestamp(),
            inTimeStr,
            status: 'Returned',
            returnRecordedBy: userProfile?.name,
          });
        }
      } else {
        const ref = await addDoc(collection(db, col('visitors')), {
          visitorName: req.visitorName,
          visitorType: req.visitorType || 'Visitor',
          purpose: req.purpose || '',
          comingFrom: req.comingFrom || '',
          noOfPeople: req.noOfPeople || 1,
          mobileNumber: req.mobileNumber || '',
          hostName: req.employeeName,
          hostDept: req.dept?.toUpperCase() || 'General',
          inTime: serverTimestamp(),
          outTime: null,
          date: todayStr(),
          inTimeStr,
          approvalStatus: 'Approved',
          approvedBy: 'JMD & MD (via Requests)',
          recordedBy: userProfile?.name || 'Security',
          unit: unit || 'u1',
          fromRequest: req.id,
          visitorToMeet: req.employeeName,
          alubeanToMeet: req.employeeName,
          company: req.comingFrom || '',
          department: req.dept?.toUpperCase() || 'General',
          createdAt: serverTimestamp(),
        });
        await updateAppRequest(req.id, {
          securityInTime: stamp,
          securityInTimeStr: inTimeStr,
          securityInBy: userProfile?.name || 'Security',
          securityLogId: ref.id,
          securityActioned: true,
          securityActionedAt: stamp,
          securityActionedBy: userProfile?.name || 'Security',
        });
      }
    } catch (e) {
      alert('Failed: ' + e.message);
    } finally {
      setActing(null);
    }
  }

  function Card({ req }) {
    const approved = requestIsFullyApproved(req);
    const outDone = !!req.securityOutTime;
    const inDone = !!req.securityInTime;
    const complete = outDone && inDone;
    const border = complete ? '#86efac' : approved ? '#fde68a' : '#e5e7eb';

    return (
      <div style={{ background: card, borderRadius: 14, border: `2px solid ${border}`, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15, color: txt }}>
              {isOD ? req.employeeName : req.visitorName || req.employeeName}
            </div>
            <div style={{ fontSize: 11, color: sub, marginTop: 3 }}>
              {req.dept?.toUpperCase() || '—'} · {req.employeeName} · {requestDateKey(req)}
            </div>
          </div>
          <span style={{
            background: complete ? '#dcfce7' : approved ? '#fef9c3' : '#f3f4f6',
            color: complete ? '#15803d' : approved ? '#b45309' : '#6b7280',
            borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 800,
          }}>
            {complete ? '✅ Done' : approved ? (isOD ? (outDone ? '⏳ Out — awaiting In' : '⚡ Ready') : (inDone ? '⏳ Inside — awaiting Out' : '⚡ Ready')) : '⏳ Awaiting approval'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 10 }}>
          {isOD ? (
            <>
              <GateInfo label="Visiting To" value={req.visitingTo} sub={sub} txt={txt} />
              <GateInfo label="Purpose" value={req.purpose} sub={sub} txt={txt} />
              <GateInfo label="Time Required" value={req.timeRequired} sub={sub} txt={txt} />
              <GateInfo label="Vehicle" value={req.vehicle || (req.companyVehicle ? 'Yes' : 'No')} sub={sub} txt={txt} />
            </>
          ) : (
            <>
              <GateInfo label="Visitor" value={req.visitorName} sub={sub} txt={txt} />
              <GateInfo label="Type" value={req.visitorType} sub={sub} txt={txt} />
              <GateInfo label="Coming From" value={req.comingFrom} sub={sub} txt={txt} />
              <GateInfo label="To Meet" value={req.employeeName} sub={sub} txt={txt} />
              <GateInfo label="People" value={req.noOfPeople} sub={sub} txt={txt} />
              <GateInfo label="Mobile" value={req.mobileNumber} sub={sub} txt={txt} />
              <GateInfo label="Purpose" value={req.purpose} sub={sub} txt={txt} />
            </>
          )}
          <GateInfo label="Out Time" value={req.securityOutTimeStr || '—'} sub={sub} txt={txt} highlight={!!req.securityOutTime} />
          <GateInfo label="In Time" value={req.securityInTimeStr || '—'} sub={sub} txt={txt} highlight={!!req.securityInTime} />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {approvalChips(req).map((c) => {
            const bg = c.st === 'Approved' ? '#f0fdf4' : c.st === 'Rejected' ? '#fef2f2' : '#fef9c3';
            const co = c.st === 'Approved' ? '#15803d' : c.st === 'Rejected' ? '#dc2626' : '#b45309';
            const ic = c.st === 'Approved' ? '✅' : c.st === 'Rejected' ? '❌' : '⏳';
            return <span key={c.role} style={{ background: bg, color: co, borderRadius: 6, padding: '2px 10px', fontSize: 10, fontWeight: 700 }}>{ic} {c.label}</span>;
          })}
        </div>

        {approved && isOD && !outDone && (
          <button onClick={() => markOut(req)} disabled={acting === req.id}
            style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: acting === req.id ? '#999' : 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {acting === req.id ? '⏳ Recording…' : '🚗 Mark Out'}
          </button>
        )}
        {approved && isOD && outDone && !inDone && (
          <button onClick={() => markIn(req)} disabled={acting === req.id}
            style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: acting === req.id ? '#999' : 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {acting === req.id ? '⏳ Recording…' : '✅ Mark In'}
          </button>
        )}
        {approved && !isOD && !inDone && (
          <button onClick={() => markIn(req)} disabled={acting === req.id}
            style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: acting === req.id ? '#999' : 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {acting === req.id ? '⏳ Recording…' : '👤 Mark In'}
          </button>
        )}
        {approved && !isOD && inDone && !outDone && (
          <button onClick={() => markOut(req)} disabled={acting === req.id}
            style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: acting === req.id ? '#999' : 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {acting === req.id ? '⏳ Recording…' : '👤 Mark Out'}
          </button>
        )}
        {!approved && !req.rejected && (
          <div style={{ background: '#fef9c3', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#b45309', fontWeight: 700, textAlign: 'center' }}>
            ⏳ Awaiting approval before gate action
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: txt }}>{isOD ? '🚗 OD Requests' : '👤 Visitor Requests'}</h2>
          <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Approved requests · Mark {isOD ? 'Out then In' : 'In then Out'}</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: sub }}>
          Date
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value || todayStr())}
            style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${bdr}`, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#111' }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { l: 'Ready', v: awaiting.length, c: '#b45309', bg: '#fef9c3' },
          { l: isOD ? 'Out now' : 'Inside', v: openGate.length, c: '#1d4ed8', bg: '#dbeafe' },
          { l: 'Done', v: done.length, c: '#15803d', bg: '#dcfce7' },
          { l: 'Pending approval', v: pendingApproval.length, c: '#6b7280', bg: '#f3f4f6' },
        ].map((s) => (
          <div key={s.l} style={{ background: s.bg, color: s.c, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 800 }}>
            {s.l} {s.v}
          </div>
        ))}
      </div>

      {listed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: sub }}>No {isOD ? 'OD' : 'visitor'} requests for this date</div>
      ) : listed.map((r) => <Card key={r.id} req={r} />)}
    </div>
  );
}

function GateInfo({ label, value, sub, txt, highlight }) {
  return (
    <div style={{ background: highlight ? '#eff6ff' : 'var(--glass-1, #f9fafb)', borderRadius: 8, padding: '7px 10px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: sub, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: txt }}>{value || '—'}</div>
    </div>
  );
}

// ── CLEARED BADGE (live count) ─────────────────────────────────────────────────

function ClearedBadge({ unit }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const today = new Date().toISOString().slice(0,10);
    const q = query(collection(db,'requests'),
      where('rejected','==',false),
      where('date','==',today),
      limit(100)
    );
    const unsub = onSnapshot(q, snap => {
      let n = 0;
      snap.docs.forEach(d => {
        const r = d.data();
        if (r.type === 'od' || r.type === 'visitor') {
          const flow = r.type==='od'
            ? [{role:'jmd'},{role:'md'}]
            : [{role:'jmd'},{role:'md'}];
          const allApproved = flow.every(s => r.approvals?.[s.role]?.status==='Approved');
          if (allApproved && !r.securityActioned) n++;
        }
      });
      setCount(n);
    }, ()=>{});
    return ()=>unsub();
  },[unit]);
  if (!count) return null;
  return (
    <span style={{background:'#16a34a',color:'#fff',borderRadius:'50%',minWidth:16,height:16,fontSize:9,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 3px'}}>
      {count}
    </span>
  );
}

// ── CLEARED TAB ────────────────────────────────────────────────────────────────
function ClearedTab({ dark, card, txt, sub, bdr, col, userProfile, unit, isMobile }) {
  const [requests, setRequests] = useState([]);
  const [editModal, setEditModal] = useState(null);
  const [acting, setActing] = useState(null);
  const [view, setView] = useState('pending'); // 'pending' | 'done'

  const today = new Date().toISOString().slice(0,10);

  useEffect(() => {
    const q = query(collection(db,'requests'), where('rejected','==',false), limit(200));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d=>({id:d.id,...d.data()}));
      // Show ALL requests — any stage including just raised
      const filtered = docs.filter(r => {
        return r.type === 'od' || r.type === 'visitor' || r.type === 'leave';
      });
      filtered.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
      setRequests(filtered);
    }, ()=>{});
    return ()=>unsub();
  },[unit]);

  const isFullyApproved = r => (r.flow||['jmd','md']).every(role => r.approvals?.[role]?.status==='Approved') || r.autoApproved;
  const getApprovalStatus = r => {
    const jmd = r.approvals?.jmd?.status;
    const md  = r.approvals?.md?.status;
    if (r.rejected) return 'Rejected';
    if (jmd==='Approved' && md==='Approved') return 'Both Approved';
    if (jmd==='Approved') return 'JMD Approved — MD Pending';
    if (md==='Approved')  return 'MD Approved — JMD Pending';
    return 'Pending Both';
  };
  const pending = requests.filter(r => !r.securityActioned && r.type !== 'leave' && !r.rejected);
  const leave   = requests.filter(r => r.type === 'leave' && !r.rejected);
  const done    = requests.filter(r => r.securityActioned);

  async function markOD(req) {
    setActing(req.id);
    try {
      // Create internal movement record
      await addDoc(collection(db, col('internal')), {
        alubean_name:  req.employeeName,
        department:    req.dept?.toUpperCase() || 'General',
        movementType:  req.purpose || 'Vendor Visit',
        destination:   req.visitingTo || '',
        vehicleNumber: req.vehicleNumber || '',
        remarks:       `OD Request — approved by JMD & MD`,
        outTime:       serverTimestamp(),
        inTime:        null,
        date:          todayStr(),
        outTimeStr:    timeStr(),
        status:        'Out',
        recordedBy:    userProfile?.name || 'Security',
        unit:          unit||'u1',
        fromRequest:   req.id,
      });
      // Mark request as actioned
      await updateDoc(doc(db,'requests',req.id), {
        securityActioned: true,
        securityActionedAt: serverTimestamp(),
        securityActionedBy: userProfile?.name,
      });
      await createNotification(unit||'u1', NOTIF_TYPES.INTERNAL, {
        title: `🏭 OD — ${req.employeeName} gone out`,
        message: `${req.employeeName} (${req.dept}) marked out for OD — ${req.visitingTo}. Recorded by ${userProfile?.name}`,
        taskId: null,
      });
    } catch(e) { alert('Failed: '+e.message); }
    finally { setActing(null); }
  }

  async function markVisitor(req) {
    setActing(req.id);
    try {
      // Create visitor record
      await addDoc(collection(db, col('visitors')), {
        visitorName:    req.visitorName,
        visitorType:    req.visitorType || 'Visitor',
        purpose:        req.purpose || '',
        comingFrom:     req.comingFrom || '',
        noOfPeople:     req.noOfPeople || 1,
        mobileNumber:   req.mobileNumber || '',
        hostName:       req.employeeName,
        hostDept:       req.dept?.toUpperCase() || 'General',
        inTime:         serverTimestamp(),
        outTime:        null,
        date:           todayStr(),
        inTimeStr:      timeStr(),
        approvalStatus: 'Approved',
        approvedBy:     'JMD & MD (via Requests)',
        recordedBy:     userProfile?.name || 'Security',
        unit:           unit||'u1',
        fromRequest:    req.id,
        visitorToMeet:  req.employeeName,
        alubeanToMeet:  req.employeeName,
        company:        req.comingFrom || '',
        department:     req.dept?.toUpperCase() || 'General',
        createdAt:      serverTimestamp(),
      });
      await updateDoc(doc(db,'requests',req.id), {
        securityActioned: true,
        securityActionedAt: serverTimestamp(),
        securityActionedBy: userProfile?.name,
      });
      await createNotification(unit||'u1', NOTIF_TYPES.VISITOR, {
        title: `👤 Visitor In — ${req.visitorName}`,
        message: `${req.visitorName} (${req.visitorType}) from ${req.comingFrom} — visiting ${req.employeeName}. Recorded by ${userProfile?.name}`,
        taskId: null,
      });
    } catch(e) { alert('Failed: '+e.message); }
    finally { setActing(null); }
  }

  function RequestCard({ req }) {
    const isOD      = req.type === 'od';
    const isVisitor = req.type === 'visitor';
    const isLeave   = req.type === 'leave';
    const actioned  = req.securityActioned;
    const borderColor = actioned ? '#86efac' : isLeave ? '#bfdbfe' : '#fde68a';
    const typeIcon  = isOD ? '🚗' : isVisitor ? '👤' : '🌴';
    const typeLabel = isOD ? 'OD' : isVisitor ? 'Visitor' : 'Leave';

    return (
      <div style={{background:card,borderRadius:14,border:`2px solid ${borderColor}`,padding:'14px 16px',marginBottom:12,
        boxShadow:actioned?'none':'0 2px 8px rgba(0,0,0,0.08)'}}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10,flexWrap:'wrap',gap:6}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:18}}>{typeIcon}</span>
              <span style={{fontWeight:900,fontSize:15,color:txt}}>{req.employeeName}</span>
              <span style={{background:actioned?'#dcfce7':isLeave?'#dbeafe':'#fef9c3',color:actioned?'#15803d':isLeave?'#1e40af':'#b45309',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:800}}>
                {actioned?'✅ Done':isLeave?'ℹ️ On Leave':'⚡ Action Required'}
              </span>
            </div>
            <div style={{fontSize:11,color:sub,marginTop:3}}>
              {req.dept?.toUpperCase()} · {typeLabel} · {req.date}
            </div>
          </div>
          {!actioned && !isLeave && (
            <button onClick={()=>setEditModal(req)}
              style={{padding:'5px 12px',borderRadius:7,border:`1px solid ${bdr}`,background:'#f9fafb',color:sub,fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
              ✎ Edit
            </button>
          )}
        </div>

        {/* Details grid */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
          {isOD && <>
            <InfoBox label="Visiting To" value={req.visitingTo} highlight={!req.visitingTo}/>
            <InfoBox label="Purpose" value={req.purpose}/>
            <InfoBox label="Time Required" value={req.timeRequired}/>
            <InfoBox label="Vehicle No" value={req.vehicleNumber} highlight={!req.vehicleNumber}/>
          </>}
          {isVisitor && <>
            <InfoBox label="Visitor Name" value={req.visitorName}/>
            <InfoBox label="Visitor Type" value={req.visitorType}/>
            <InfoBox label="Coming From" value={req.comingFrom} highlight={!req.comingFrom}/>
            <InfoBox label="No. of People" value={req.noOfPeople}/>
            <InfoBox label="Mobile" value={req.mobileNumber} highlight={!req.mobileNumber}/>
            <InfoBox label="Purpose" value={req.purpose}/>
          </>}
          {isLeave && <>
            <InfoBox label="Leave Type" value={req.leaveType}/>
            <InfoBox label="Days" value={`${req.leaveDays} day${req.leaveDays!==1?'s':''}`}/>
            <InfoBox label="Date" value={req.date}/>
            <InfoBox label="Reason" value={req.reason} full/>
          </>}
        </div>

        {/* Approval stamps — only show roles in stored flow */}
        <div style={{display:'flex',gap:6,marginBottom:isLeave?0:10,flexWrap:'wrap'}}>
          {(req.flow?.length>0?req.flow:[...(isLeave?['supervisor','hr','jmd','md']:['jmd','md'])]).map(role=>{
            const label = role==='jmd'?'JMD':role==='md'?'MD':role==='hr'?'HR':role.charAt(0).toUpperCase()+role.slice(1);
            return [role,label];
          }).map(([role,label])=>{
            const st = req.approvals?.[role]?.status;
            const bg = st==='Approved'?'#f0fdf4':st==='Rejected'?'#fef2f2':'#fef9c3';
            const co = st==='Approved'?'#15803d':st==='Rejected'?'#dc2626':'#b45309';
            const ic = st==='Approved'?'✅':st==='Rejected'?'❌':'⏳';
            return <span key={role} style={{background:bg,color:co,borderRadius:6,padding:'2px 10px',fontSize:10,fontWeight:700}}>{ic} {label} {st||'Pending'}</span>;
          })}
          {req.editedDays && <span style={{background:'#eff6ff',color:'#1e40af',borderRadius:6,padding:'2px 10px',fontSize:10,fontWeight:700}}>✏️ Days edited: {req.leaveDays}</span>}
        </div>

        {/* Action buttons */}
        {!actioned && isOD && (() => {
          const fullyApproved = (req.flow||['jmd','md']).every(r=>req.approvals?.[r]?.status==='Approved')||req.autoApproved;
          return fullyApproved
            ? <button onClick={()=>markOD(req)} disabled={acting===req.id}
                style={{width:'100%',padding:'12px',borderRadius:10,border:'none',background:acting===req.id?'#999':'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',fontWeight:800,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>
                {acting===req.id?'⏳ Recording…':'🚗 Mark Out — Gone for OD'}
              </button>
            : <div style={{background:'#fef9c3',borderRadius:10,padding:'10px 14px',fontSize:12,color:'#b45309',fontWeight:700,textAlign:'center'}}>
                ⏳ Awaiting approval before mark out
              </div>;
        })()}
        {!actioned && isVisitor && (() => {
          const fullyApproved = (req.flow||['jmd','md']).every(r=>req.approvals?.[r]?.status==='Approved')||req.autoApproved;
          return fullyApproved
            ? <button onClick={()=>markVisitor(req)} disabled={acting===req.id}
                style={{width:'100%',padding:'12px',borderRadius:10,border:'none',background:acting===req.id?'#999':'linear-gradient(135deg,#16a34a,#15803d)',color:'#fff',fontWeight:800,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>
                {acting===req.id?'⏳ Recording…':'👤 Mark In — Visitor Arrived'}
              </button>
            : <div style={{background:'#fef9c3',borderRadius:10,padding:'10px 14px',fontSize:12,color:'#b45309',fontWeight:700,textAlign:'center'}}>
                ⏳ Awaiting approval before marking in
              </div>;
        })()}
        {actioned && (
          <div style={{fontSize:11,color:sub,marginTop:4}}>
            ✅ Recorded by {req.securityActionedBy} · {req.securityActionedAt?.toDate?.()?.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})||''}
          </div>
        )}
      </div>
    );
  }

  function InfoBox({ label, value, highlight, full }) {
    return (
      <div style={{gridColumn:full?'1/-1':'auto',background:highlight?'#fef3c7':dark?'#2d3748':'#f9fafb',borderRadius:8,padding:'7px 10px',border:highlight?'1.5px solid #fde68a':'none'}}>
        <div style={{fontSize:9,fontWeight:700,color:sub,textTransform:'uppercase',marginBottom:2}}>{label}{highlight?' ⚠️ Missing':''}</div>
        <div style={{fontSize:12,fontWeight:700,color:highlight?'#b45309':txt}}>{value||'—'}</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <h2 style={{margin:0,fontSize:17,fontWeight:900,color:txt}}>✅ Approved — Ready for Security</h2>
        <div style={{display:'flex',gap:6}}>
          {['pending','leave','done'].map(v=>(
            <button key={v} onClick={()=>setView(v)}
              style={{padding:'6px 14px',borderRadius:16,border:`1px solid ${view===v?'#16a34a':bdr}`,
                background:view===v?'#16a34a':'transparent',color:view===v?'#fff':sub,
                fontWeight:view===v?700:400,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
              {v==='pending'?`⚡ Action (${pending.length})`:v==='leave'?`🌴 Leave (${leave.length})`:`✅ Done (${done.length})`}
            </button>
          ))}
        </div>
      </div>

      {view==='pending' && (
        <>
          {pending.length===0
            ? <div style={{textAlign:'center',padding:48,color:sub}}>No pending actions — all clear ✅</div>
            : pending.map(r=><RequestCard key={r.id} req={r}/>)
          }
        </>
      )}
      {view==='leave' && (
        <>
          {leave.length===0
            ? <div style={{textAlign:'center',padding:48,color:sub}}>No approved leave requests today</div>
            : leave.map(r=><RequestCard key={r.id} req={r}/>)
          }
        </>
      )}
      {view==='done' && (
        <>
          {done.length===0
            ? <div style={{textAlign:'center',padding:48,color:sub}}>No completed actions yet</div>
            : done.map(r=><RequestCard key={r.id} req={r}/>)
          }
        </>
      )}

      {/* Edit modal */}
      {editModal && <ClearedEditModal req={editModal} onClose={()=>setEditModal(null)} dark={dark} bdr={bdr} txt={txt}/>}
    </div>
  );
}

// ── EDIT MODAL for cleared requests ──────────────────────────────────────────
function ClearedEditModal({ req, onClose, dark, bdr, txt }) {
  const [form, setForm] = useState({
    visitingTo:   req.visitingTo||'',
    vehicleNumber:req.vehicleNumber||'',
    purpose:      req.purpose||'',
    timeRequired: req.timeRequired||'',
    visitorName:  req.visitorName||'',
    visitorType:  req.visitorType||'',
    comingFrom:   req.comingFrom||'',
    noOfPeople:   req.noOfPeople||1,
    mobileNumber: req.mobileNumber||'',
  });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const inp = {border:`1px solid ${bdr}`,borderRadius:8,padding:'9px 12px',fontSize:13,outline:'none',width:'100%',boxSizing:'border-box',background:'#fff',color:'#111'};

  async function save() {
    setSaving(true);
    try {
      await updateDoc(doc(db,'requests',req.id), form);
      onClose();
    } catch(e) { alert('Save failed: '+e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:460,padding:22,maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:900,fontSize:15,color:'#1e40af'}}>✎ Edit Details — {req.employeeName}</div>
          <button onClick={onClose} style={{background:'#f3f4f6',border:'none',borderRadius:8,width:30,height:30,cursor:'pointer',fontSize:16}}>✕</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          {req.type==='od' && <>
            <div style={{gridColumn:'1/-1'}}>
              <label style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',display:'block',marginBottom:4}}>Visiting To</label>
              <input style={inp} value={form.visitingTo} onChange={e=>set('visitingTo',e.target.value)}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',display:'block',marginBottom:4}}>Vehicle Number</label>
              <input style={inp} value={form.vehicleNumber} onChange={e=>set('vehicleNumber',e.target.value)} placeholder="e.g. TN38 AB1234"/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',display:'block',marginBottom:4}}>Time Required</label>
              <input style={inp} value={form.timeRequired} onChange={e=>set('timeRequired',e.target.value)} placeholder="e.g. 2 hours"/>
            </div>
          </>}
          {req.type==='visitor' && <>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',display:'block',marginBottom:4}}>Visitor Name</label>
              <input style={inp} value={form.visitorName} onChange={e=>set('visitorName',e.target.value)}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',display:'block',marginBottom:4}}>Mobile Number</label>
              <input style={inp} value={form.mobileNumber} onChange={e=>set('mobileNumber',e.target.value)}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',display:'block',marginBottom:4}}>Coming From</label>
              <input style={inp} value={form.comingFrom} onChange={e=>set('comingFrom',e.target.value)}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',display:'block',marginBottom:4}}>No. of People</label>
              <input type="number" min={1} style={inp} value={form.noOfPeople} onChange={e=>set('noOfPeople',parseInt(e.target.value)||1)}/>
            </div>
            <div style={{gridColumn:'1/-1'}}>
              <label style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',display:'block',marginBottom:4}}>Purpose</label>
              <input style={inp} value={form.purpose} onChange={e=>set('purpose',e.target.value)}/>
            </div>
          </>}
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:'10px',borderRadius:8,border:`1px solid ${bdr}`,background:'#f9fafb',color:'#374151',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{flex:2,padding:'10px',borderRadius:8,border:'none',background:'#1e40af',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
            {saving?'Saving…':'✓ Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
