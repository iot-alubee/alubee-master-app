import React, { useState, useEffect, useCallback } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { createNotification, NOTIF_TYPES } from '../utils/notificationService';

// ── Access ────────────────────────────────────────────────────────────────────
const ALLOWED = ['owner@alubee.com','md@alubee.com','agilan@alubee.com','mohan@alubee.com','pachayappan@alubee.com','gopi@alubee.com','udhay@alubee.com'];

// ── Child Parts Master (36 parts with supplier info) ─────────────────────────
const CHILD_PARTS_MASTER = {
  '2916.011.114':{partName:'M10 WASHER',unitPrice:2.13,leadTime:'2-3 Weeks',moq:5000,minStock:15000,supplierName:'PRIME ENGINEERING',supplierLocation:'Bangalore',supplierLocation:'Bangalore',supplierContact:'Krishna Prasad',supplierPhone:'95133 88859',supplyType:'external'},
  'F002.G91.107':{partName:'CLAMP',unitPrice:3.15,leadTime:'2-3 Weeks',moq:1000,minStock:1000,supplierName:'PRIME ENGINEERING',supplierLocation:'Bangalore',supplierContact:'Krishna Prasad',supplierPhone:'95133 88859',supplyType:'external'},
  '2000.301.043':{partName:'METAL BUSH',unitPrice:7.2,leadTime:'2-3 Weeks',moq:5000,minStock:2000,supplierName:'SEG INDIA PVT LTD',supplierLocation:'Bangalore',supplierContact:'Sateesha',supplierPhone:'91087 93191',supplyType:'external'},
  '2915.011.009':{partName:'M8 NUT',unitPrice:0.6,leadTime:'2-3 Weeks',moq:5000,minStock:2000,supplierName:'SEG INDIA PVT LTD',supplierLocation:'Bangalore',supplierContact:'sohan',supplierPhone:'8095431937',supplyType:'external'},
  '2916.011.016':{partName:'M8 Plain Washer',unitPrice:0.26,leadTime:'2-3 Weeks',moq:5000,minStock:2000,supplierName:'SEG INDIA PVT LTD',supplierLocation:'Bangalore',supplierContact:'sohan',supplierPhone:'8095431937',supplyType:'external'},
  '2918.740.007':{partName:'M8 Spring Washer',unitPrice:1.64,leadTime:'2-3 Weeks',moq:5000,minStock:5000,supplierName:'SEG INDIA PVT LTD',supplierLocation:'Bangalore',supplierContact:'sohan',supplierPhone:'8095431937',supplyType:'external'},
  '2918.740.008':{partName:'M10 Spring Washer',unitPrice:2.05,leadTime:'3-4 Weeks',moq:5000,minStock:20000,supplierName:'SEG INDIA PVT LTD',supplierLocation:'Bangalore',supplierContact:'sohan',supplierPhone:'8095431937',supplyType:'external'},
  '9003.330.315':{partName:'BUSH',unitPrice:6.61,leadTime:'2-3 Weeks',moq:5000,minStock:15000,supplierName:'SEG INDIA PVT LTD',supplierLocation:'Bangalore',supplierContact:'sohan',supplierPhone:'8095431937',supplyType:'external'},
  '9003.330.317':{partName:'SINTERED BUSH',unitPrice:7.77,leadTime:'2-3 Weeks',moq:5000,minStock:18000,supplierName:'SEG INDIA PVT LTD',supplierLocation:'Bangalore',supplierContact:'sohan',supplierPhone:'8095431937',supplyType:'external'},
  'F002.G21.504':{partName:'METAL BUSH (504)',unitPrice:5.75,leadTime:'3-4 Weeks',moq:5000,minStock:0,supplierName:'SEG INDIA PVT LTD',supplierLocation:'Bangalore',supplierContact:'Sateesha',supplierPhone:'91087 93191',supplyType:'external'},
  'F002.G11.482':{partName:'White Plug M8',unitPrice:0.75,leadTime:'2-3 Weeks',moq:3000,minStock:2000,supplierName:'KAMAKSHI PLASTIC COMPONENTS',supplierLocation:'Hosur',supplierContact:'Kumar',supplierPhone:'94436 33678',supplyType:'external'},
  'F002.G71.235':{partName:'M8 SCREW',unitPrice:6.87,leadTime:'4-6 Weeks',moq:20000,minStock:10000,supplierName:'POOJA PRECISION SCREWS',supplierLocation:'Bangalore',supplierContact:'ambika',supplierPhone:'6360988122',supplyType:'external'},
  '2915.051.108':{partName:'M10X1.5 NUT',unitPrice:3.99,leadTime:'2-3 Weeks',moq:5000,minStock:15000,supplierName:'GI AUTO PVT LTD',supplierLocation:'Bangalore',supplierContact:'IRFAN',supplierPhone:'8892352599',supplyType:'external'},
  'F002.G11.483':{partName:'MOUNTING BUSH',unitPrice:15.0,leadTime:'2-3 Weeks',moq:1000,minStock:1000,supplierName:'GI AUTO PVT LTD',supplierLocation:'Bangalore',supplierContact:'IRFAN',supplierPhone:'8892352599',supplyType:'external'},
  'F002.G21.200':{partName:'M8 SCREW (200)',unitPrice:8.14,leadTime:'2-3 Weeks',moq:1000,minStock:500,supplierName:'GI AUTO PVT LTD',supplierLocation:'Bangalore',supplierContact:'IRFAN',supplierPhone:'8892352599',supplyType:'external'},
  '1000.301.604':{partName:'BUSH C6X',unitPrice:2.67,leadTime:'3-4 Weeks',moq:30000,minStock:100000,supplierName:'NUTECH SINTERED P LTD',supplierLocation:'Mumbai',supplierContact:'Sanjay',supplierPhone:'93717 11300',supplyType:'external'},
  'F002.G21.997':{partName:'BUSH (997)',unitPrice:5.14,leadTime:'3-4 Weeks',moq:5000,minStock:20000,supplierName:'NUTECH SINTERED P LTD',supplierLocation:'Mumbai',supplierContact:'Sanjay',supplierPhone:'93717 11300',supplyType:'external'},
  'F002.G71.239':{partName:'EARTH TERMINAL',unitPrice:3.23,leadTime:'4-6 Weeks',moq:20000,minStock:10000,supplierName:'POOJA PRECISION SCREWS',supplierLocation:'Bangalore',supplierContact:'ambika',supplierPhone:'6360988122',supplyType:'external'},
  '1120.322.005':{partName:'STOP BUSH',unitPrice:11.27,leadTime:'2-3 Weeks',moq:1000,minStock:1000,supplierName:'SN AUTOMATS',supplierLocation:'Bangalore',supplierContact:'Premkumar',supplierPhone:'80723 10175',supplyType:'external'},
  'F002.G21.620':{partName:'DRAIN VALVE (620)',unitPrice:2.37,leadTime:'2-3 Weeks',moq:1000,minStock:0,supplierName:'STANDARD ELASTOMERS',supplierLocation:'Bangalore',supplierContact:'Kaushik',supplierPhone:'90358 98291',supplyType:'external'},
  'F002.G71.139':{partName:'DRAIN VALVE (139)',unitPrice:1.75,leadTime:'2-3 Weeks',moq:2000,minStock:2000,supplierName:'STANDARD ELASTOMERS',supplierLocation:'Bangalore',supplierContact:'Kaushik',supplierPhone:'90358 98291',supplyType:'external'},
  '1900.210.105':{partName:'O-RING (105)',unitPrice:0.49,leadTime:'2-3 Weeks',moq:2000,minStock:0,supplierName:'SUJA SHOEI INDUSTRIES',supplierLocation:'Mayiladudurai, TN',supplierContact:'Ganapathy',supplierPhone:'94433 11284',supplyType:'external'},
  '2916.740.049':{partName:'OIL SEAL',unitPrice:4.12,leadTime:'2-3 Weeks',moq:2000,minStock:0,supplierName:'SUJA SHOEI INDUSTRIES',supplierLocation:'Mayiladudurai, TN',supplierContact:'Ganapathy',supplierPhone:'94433 11284',supplyType:'external'},
  '6003.AC1.436':{partName:'DRAIN VALVE (436)',unitPrice:3.35,leadTime:'2-3 Weeks',moq:2000,minStock:0,supplierName:'SUJA SHOEI INDUSTRIES',supplierLocation:'Mayiladudurai, TN',supplierContact:'Ganapathy',supplierPhone:'94433 11284',supplyType:'external'},
  'F002.G71.234':{partName:'O RING (234)',unitPrice:1.25,leadTime:'4-6 Weeks',moq:5000,minStock:10000,supplierName:'SUJA SHOEI INDUSTRIES',supplierLocation:'Mayiladudurai, TN',supplierContact:'Ganapathy',supplierPhone:'94433 11284',supplyType:'external'},
  '9003.330.316':{partName:'METAL BUSH (316)',unitPrice:16.74,leadTime:'3-4 Weeks',moq:5000,minStock:10000,supplierName:'SPECIALITY SINTERED',supplierLocation:'Pune',supplierContact:'Rushikesh Dham',supplierPhone:'98228 91407',supplyType:'external'},
  'F002.G11.933':{partName:'Coupler Bush',unitPrice:61.34,leadTime:'4-6 Weeks',moq:1000,minStock:1000,supplierName:'SAAB ENGINEERING',supplierLocation:'Bangalore',supplierContact:'Dinakaran',supplierPhone:'90666 08914',supplyType:'external'},
  'F002.G71.117':{partName:'Flange Nut',unitPrice:3.33,leadTime:'4 Weeks',moq:2000,minStock:5000,supplierName:'SIMMONDS MARSHAL LTD',supplierLocation:'Pune',supplierContact:'Vijay Gurav',supplierPhone:'83086 65957',supplyType:'external'},
  'F002.G71.530':{partName:'O RING (530)',unitPrice:4.32,leadTime:'2-3 Weeks',moq:2000,minStock:2000,supplierName:'MEENAKSHI MOLDING',supplierLocation:'Chennai',supplierContact:'Vasudevan',supplierPhone:'9941012959',supplyType:'external'},
  '1000.301.056':{partName:'METAL BUSH (056)',unitPrice:4.68,leadTime:'3-4 Weeks',moq:5000,minStock:3000,supplierName:'SEG IND PVT LTD',supplierLocation:'Bangalore',supplierContact:'karthik.y',supplierPhone:'7259496976',supplyType:'external'},
  '2000.301.038':{partName:'METAL BUSH (038)',unitPrice:7.64,leadTime:'3-4 Weeks',moq:5000,minStock:0,supplierName:'SEG IND PVT LTD',supplierLocation:'Bangalore',supplierContact:'Sateesha',supplierPhone:'91087 93191',supplyType:'external'},
  'F002.G71.564':{partName:'M8 Screw (564)',unitPrice:10.98,leadTime:'3-4 Weeks',moq:2000,minStock:0,supplierName:'ANKIT FORGING P LTD',supplierLocation:'Bangalore',supplierContact:'Mrs. Marry',supplierPhone:'9538325928',supplyType:'external'},
  '399 C54 553':{partName:'Friction Washer',unitPrice:2.0,leadTime:'3-4 Weeks',moq:15000,minStock:5000,supplierName:'JL ENGINEERING',supplierLocation:'Bangalore',supplierContact:'Shivasamy',supplierPhone:'8105480002',supplyType:'external'},
  'F002.G71.740':{partName:'O-Ring (740)',unitPrice:2.48,leadTime:'1-3 Weeks',moq:5000,minStock:20000,supplierName:'MEENAKSHI MOLDING',supplierLocation:'Chennai',supplierContact:'Vasudevan',supplierPhone:'9941012959',supplyType:'external'},
  'F000BL164G':{partName:'BOLT',unitPrice:8.53,leadTime:'4-6 Weeks',moq:20000,minStock:20000,supplierName:'POOJA PRECISION SCREWS',supplierLocation:'Bangalore',supplierContact:'ambika',supplierPhone:'6360988122',supplyType:'external'},
  '64G':{partName:'M8 Bolt',unitPrice:8.53,leadTime:'4-6 Weeks',moq:20000,minStock:20000,supplierName:'POOJA PRECISION SCREWS',supplierLocation:'Bangalore',supplierContact:'ambika',supplierPhone:'6360988122',supplyType:'external'},
};

// ── BOM: Finished Part → Child Parts ─────────────────────────────────────────
const BOM = [
  {group:'A',finishedPartName:'CES 021',finishedPartNo:'F002.G70.021',children:[{childPartNo:'2916.011.114',bomQty:1},{childPartNo:'2918.740.008',bomQty:2},{childPartNo:'9003.330.317',bomQty:1},{childPartNo:'F002.G71.235',bomQty:1},{childPartNo:'2915.051.108',bomQty:2},{childPartNo:'F002.G71.234',bomQty:1}]},
  {group:'B',finishedPartName:'CES 551',finishedPartNo:'F002.G70.551',children:[{childPartNo:'2916.011.114',bomQty:1},{childPartNo:'2918.740.008',bomQty:2},{childPartNo:'9003.330.317',bomQty:1},{childPartNo:'F002.G71.235',bomQty:1},{childPartNo:'2915.051.108',bomQty:1},{childPartNo:'F002.G71.234',bomQty:1},{childPartNo:'F002.G71.117',bomQty:1}]},
  {group:'C',finishedPartName:'CES 365',finishedPartNo:'F002.G70.365',children:[{childPartNo:'2916.011.114',bomQty:1},{childPartNo:'2918.740.007',bomQty:1},{childPartNo:'9003.330.317',bomQty:1},{childPartNo:'F002.G71.234',bomQty:1},{childPartNo:'F002.G71.564',bomQty:1}]},
  {group:'D',finishedPartName:'CES 408',finishedPartNo:'F002.G70.408',children:[{childPartNo:'2916.011.114',bomQty:1},{childPartNo:'2918.740.008',bomQty:2},{childPartNo:'F002.G71.235',bomQty:1},{childPartNo:'2915.051.108',bomQty:2},{childPartNo:'F002.G71.139',bomQty:1},{childPartNo:'F002.G71.234',bomQty:1}]},
  {group:'E',finishedPartName:'CES 371',finishedPartNo:'F002.G70.371',children:[{childPartNo:'2918.740.007',bomQty:1},{childPartNo:'9003.330.317',bomQty:1},{childPartNo:'F002.G71.239',bomQty:1}]},
  {group:'F',finishedPartName:'C.L 64H',finishedPartNo:'F000.BL1.64H',children:[{childPartNo:'64G',bomQty:1}]},
  {group:'G',finishedPartName:'C.L 2WF',finishedPartNo:'F000.BL1.2WF',children:[{childPartNo:'64G',bomQty:1}]},
  {group:'H',finishedPartName:'CES 601',finishedPartNo:'1005.851.601',children:[{childPartNo:'1000.301.604',bomQty:1}]},
  {group:'I',finishedPartName:'CES 298',finishedPartNo:'F002.G70.298',children:[{childPartNo:'F002.G21.997',bomQty:1}]},
  {group:'J',finishedPartName:'CES 082',finishedPartNo:'2005.857.082',children:[{childPartNo:'399 C54 553',bomQty:1},{childPartNo:'9003.330.317',bomQty:1}]},
  {group:'K',finishedPartName:'CES 086',finishedPartNo:'2005.857.086',children:[{childPartNo:'399 C54 553',bomQty:1},{childPartNo:'9003.330.317',bomQty:1}]},
  {group:'L',finishedPartName:'CES 078',finishedPartNo:'2005.857.078',children:[{childPartNo:'399 C54 553',bomQty:1},{childPartNo:'9003.330.317',bomQty:1}]},
  {group:'M',finishedPartName:'IMB 112',finishedPartNo:'F002.G70.576',children:[{childPartNo:'9003.330.316',bomQty:1},{childPartNo:'F002.G71.740',bomQty:1}]},
  {group:'N',finishedPartName:'IMB 113',finishedPartNo:'F002.G70.020',children:[{childPartNo:'9003.330.315',bomQty:1},{childPartNo:'F002.G71.740',bomQty:1}]},
  {group:'O',finishedPartName:'CES 306',finishedPartNo:'F002.G70.306',children:[{childPartNo:'1000.301.056',bomQty:1},{childPartNo:'F002.G71.530',bomQty:1}]},
  {group:'P',finishedPartName:'DEF 200',finishedPartNo:'F002G90200',children:[{childPartNo:'F002.G91.107',bomQty:1},{childPartNo:'F002.G11.482',bomQty:1},{childPartNo:'F002.G11.483',bomQty:1}]},
  {group:'Q',finishedPartName:'CES 071',finishedPartNo:'2005857071',children:[{childPartNo:'9003.330.317',bomQty:1},{childPartNo:'F002.G71.139',bomQty:1},{childPartNo:'399 C54 553',bomQty:1}]},
  {group:'R',finishedPartName:'CES 905',finishedPartNo:'F002.G20.905',children:[{childPartNo:'9003.330.317',bomQty:1},{childPartNo:'6003.AC1.436',bomQty:1}]},
  {group:'S',finishedPartName:'CES 489',finishedPartNo:'F002.G70.489',children:[{childPartNo:'9003.330.317',bomQty:1}]},
  {group:'T',finishedPartName:'CES 439',finishedPartNo:'F002.G70.439',children:[{childPartNo:'9003.330.317',bomQty:1}]},
  {group:'U',finishedPartName:'DES 465',finishedPartNo:'F002.G10.465',children:[{childPartNo:'F002.G11.482',bomQty:1}]},
  {group:'V',finishedPartName:'CES 794',finishedPartNo:'F002.G20.794',children:[{childPartNo:'F002.G21.997',bomQty:1}]},
  {group:'W',finishedPartName:'DEF 361',finishedPartNo:'F002.G10.361',children:[{childPartNo:'1120.322.005',bomQty:1}]},
  {group:'X',finishedPartName:'DEF 019',finishedPartNo:'F002.G10.019',children:[{childPartNo:'1120.322.005',bomQty:1}]},
  {group:'Y',finishedPartName:'CES 074',finishedPartNo:'2005.857.074',children:[{childPartNo:'F002.G71.139',bomQty:1},{childPartNo:'399 C54 553',bomQty:1}]},
  {group:'Z',finishedPartName:'IMB 688',finishedPartNo:'F002.G20.688',children:[{childPartNo:'2916.740.049',bomQty:1},{childPartNo:'2000.301.038',bomQty:1}]},
  {group:'AA',finishedPartName:'COUPLING 740',finishedPartNo:'F002.G10.740',children:[{childPartNo:'F002.G11.933',bomQty:1}]},
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const C={bg:'#0F1117',card:'#181C2E',raised:'#1E2340',border:'#252D50',text:'#E6EDF3',sub:'#8892B0',green:'#22c55e',red:'#ef4444',orange:'#f97316',amber:'#f59e0b',blue:'#3b82f6',purple:'#818cf8'};
const todayStr=()=>new Date().toISOString().slice(0,10);
const fmtK=n=>n>=1000?`${(n/1000).toFixed(1)}K`:String(n||0);

// Calculate total child parts required from schedule
function calcRequiredFromSchedule(schedules) {
  const required = {}; // childPartNo → qty
  Object.entries(schedules).forEach(([custId, custParts]) => {
    Object.entries(custParts).forEach(([partNo, schData]) => {
      const schedQty = schData?.scheduleQty || 0;
      if (!schedQty) return;
      // Find BOM for this finished part
      const bom = BOM.find(b => b.finishedPartNo === partNo || b.finishedPartName === partNo);
      if (!bom) return;
      bom.children.forEach(child => {
        required[child.childPartNo] = (required[child.childPartNo]||0) + (schedQty * child.bomQty);
      });
    });
  });
  return required;
}

// ── Master Tab ────────────────────────────────────────────────────────────────
function MasterTab() {
  const [search, setSearch] = useState('');
  const [expandedPart, setExpandedPart] = useState(null);
  const [expandAll, setExpandAll] = useState(false);

  const filtered = BOM.filter(b =>
    !search ||
    b.finishedPartName.toLowerCase().includes(search.toLowerCase()) ||
    b.finishedPartNo.toLowerCase().includes(search.toLowerCase()) ||
    b.children.some(c=>{
      const m=CHILD_PARTS_MASTER[c.childPartNo]||{};
      return (m.partName||'').toLowerCase().includes(search.toLowerCase()) ||
             c.childPartNo.toLowerCase().includes(search.toLowerCase()) ||
             (m.supplierName||'').toLowerCase().includes(search.toLowerCase());
    })
  );

  const isExpanded = (g) => expandAll || expandedPart===g;

  const COLS = 'repeat(9,1fr)';
  const HEADERS = ['Child Part','Part No','BOM Qty','Supplier Name','Location','Contact','Phone','Lead Time','Min Stock / MOQ'];

  return (
    <div>
      {/* Controls */}
      <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search finished part, child part, or supplier…"
          style={{border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 12px',fontSize:12,
            outline:'none',background:C.raised,color:C.text,fontFamily:'inherit',
            flex:1,minWidth:200,boxSizing:'border-box'}}/>
        <button onClick={()=>{setExpandAll(v=>!v);setExpandedPart(null);}}
          style={{padding:'7px 14px',borderRadius:8,border:`1px solid ${C.border}`,
            background:'transparent',color:C.sub,fontSize:11,fontWeight:700,
            cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>
          {expandAll?'Collapse All':'Expand All'}
        </button>
        <div style={{fontSize:11,color:C.sub,whiteSpace:'nowrap'}}>
          {BOM.length} finished parts · {Object.keys(CHILD_PARTS_MASTER).length} child parts
        </div>
      </div>

      {filtered.map(fp=>(
        <div key={fp.group} style={{background:C.card,border:`1px solid ${C.border}`,
          borderRadius:12,marginBottom:8,overflow:'hidden'}}>

          {/* Finished Part Header — clickable */}
          <div onClick={()=>{setExpandAll(false);setExpandedPart(isExpanded(fp.group)?null:fp.group);}}
            style={{padding:'11px 16px',cursor:'pointer',display:'flex',
              justifyContent:'space-between',alignItems:'center',
              background:isExpanded(fp.group)?'rgba(249,115,22,0.06)':'transparent',
              borderLeft:`3px solid ${isExpanded(fp.group)?C.orange:'transparent'}`}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{background:'rgba(249,115,22,0.2)',color:C.orange,borderRadius:6,
                padding:'2px 8px',fontSize:10,fontWeight:800,flexShrink:0}}>{fp.group}</span>
              <div>
                <span style={{fontWeight:800,fontSize:13,color:C.text}}>{fp.finishedPartName}</span>
                <span style={{color:C.sub,fontSize:11,marginLeft:8}}>{fp.finishedPartNo}</span>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
              <span style={{fontSize:10,color:C.sub,background:C.raised,
                borderRadius:6,padding:'2px 8px'}}>
                {fp.children.length} child part{fp.children.length>1?'s':''}
              </span>
              <span style={{color:C.sub,fontSize:11}}>{isExpanded(fp.group)?'▲':'▼'}</span>
            </div>
          </div>

          {/* Expanded child parts table */}
          {isExpanded(fp.group)&&(
            <div style={{borderTop:`1px solid ${C.border}`,overflowX:'auto'}}>
              {/* Table header */}
              <div style={{display:'grid',gridTemplateColumns:COLS,
                minWidth:900,padding:'6px 16px',background:C.raised}}>
                {HEADERS.map(h=>(
                  <div key={h} style={{fontSize:9,fontWeight:800,color:C.sub,
                    textTransform:'uppercase',padding:'0 4px'}}>{h}</div>
                ))}
              </div>
              {/* Rows */}
              {fp.children.map((child,ci)=>{
                const m = CHILD_PARTS_MASTER[child.childPartNo]||{};
                return (
                  <div key={child.childPartNo} style={{display:'grid',
                    gridTemplateColumns:COLS,minWidth:900,
                    padding:'8px 16px',fontSize:11,alignItems:'center',
                    borderTop:`1px solid ${C.border}`,
                    background:ci%2===0?'transparent':'rgba(255,255,255,0.015)'}}>
                    {/* Child Part Name */}
                    <div style={{fontWeight:700,color:C.text,padding:'0 4px'}}>
                      {m.partName||child.childPartNo}
                    </div>
                    {/* Part No */}
                    <div style={{color:C.sub,fontSize:10,padding:'0 4px',wordBreak:'break-all'}}>
                      {child.childPartNo}
                    </div>
                    {/* BOM Qty */}
                    <div style={{padding:'0 4px'}}>
                      <span style={{background:'rgba(249,115,22,0.2)',color:C.orange,
                        borderRadius:5,padding:'2px 7px',fontSize:11,fontWeight:800}}>
                        ×{child.bomQty}
                      </span>
                    </div>
                    {/* Supplier Name */}
                    <div style={{color:C.text,fontSize:11,fontWeight:600,padding:'0 4px'}}>
                      {m.supplierName||<span style={{color:C.sub}}>—</span>}
                    </div>
                    {/* Location */}
                    <div style={{color:C.sub,fontSize:10,padding:'0 4px'}}>
                      {m.supplierLocation||'—'}
                    </div>
                    {/* Contact */}
                    <div style={{color:C.sub,fontSize:10,padding:'0 4px'}}>
                      {m.supplierContact||'—'}
                    </div>
                    {/* Phone */}
                    <div style={{color:C.blue,fontSize:10,padding:'0 4px'}}>
                      {m.supplierPhone||'—'}
                    </div>
                    {/* Lead Time */}
                    <div style={{padding:'0 4px'}}>
                      <span style={{background:'rgba(245,158,11,0.15)',color:C.amber,
                        borderRadius:5,padding:'2px 7px',fontSize:10,fontWeight:700}}>
                        {m.leadTime||'—'}
                      </span>
                    </div>
                    {/* Min Stock / MOQ */}
                    <div style={{color:C.sub,fontSize:10,padding:'0 4px'}}>
                      {m.minStock?<><span style={{color:C.blue,fontWeight:700}}>{fmtK(m.minStock)}</span> min</>:'—'}
                      {m.moq?<><br/><span style={{color:C.sub}}>{fmtK(m.moq)} MOQ</span></>:''}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Daily Entry Tab (spreadsheet style, like Customer Dashboard) ──────────────
function DailyEntryTab({ date, userProfile, entries, onSaved }) {
  const parts = Object.entries(CHILD_PARTS_MASTER).map(([partNo, m])=>({partNo,...m}));
  const [rows, setRows] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // Init rows from existing entries
  useEffect(()=>{
    const init = {};
    parts.forEach(p=>{
      const e = entries[p.partNo]||{};
      init[p.partNo] = {
        storeStock: e.storeStock??'',
        deptStock:  e.deptStock??'',
        received:   e.received??'',
        issued:     e.issued??'',
        remarks:    e.remarks||'',
      };
    });
    setRows(init);
  },[date, JSON.stringify(entries)]);

  const upd = (partNo, k, v) => setRows(r=>({...r,[partNo]:{...r[partNo],[k]:v}}));

  async function saveAll() {
    setSaving(true);
    try {
      const alerts = [];
      for (const p of parts) {
        const r = rows[p.partNo]||{};
        if (Object.values(r).every(v=>v===''||v===0||v==='')) continue; // skip empty rows
        const docId = `final_${date}_${p.partNo.replace(/[^a-zA-Z0-9]/g,'_')}`;
        const storeStock = parseInt(r.storeStock)||0;
        const deptStock  = parseInt(r.deptStock)||0;
        await setDoc(doc(db,'child_parts_final_u1',docId),{
          storeStock, deptStock,
          received: parseInt(r.received)||0,
          issued:   parseInt(r.issued)||0,
          remarks:  r.remarks||'',
          partNo: p.partNo, partName: p.partName,
          supplyType: p.supplyType, section:'final', date,
          updatedBy: userProfile?.name||'—', updatedAt: serverTimestamp(),
        });
        const bal = storeStock + deptStock;
        if (p.minStock>0 && bal < p.minStock*0.5) alerts.push(p.partName);
      }
      if (alerts.length>0) {
        await createNotification('u1', NOTIF_TYPES.STORES, {
          title: `⚠️ Child Parts Low Stock — ${date}`,
          message: `${alerts.length} part(s) below 50% min stock: ${alerts.slice(0,3).join(', ')}${alerts.length>3?'…':''}`,
        });
      }
      setSavedMsg(`✅ Saved ${date}`);
      setTimeout(()=>setSavedMsg(''),3000);
      onSaved();
    } catch(e){ alert('Save failed: '+e.message); }
    finally{ setSaving(false); }
  }

  const inp = {border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 6px',fontSize:11,
    outline:'none',background:C.raised,color:C.text,fontFamily:'inherit',
    width:'100%',boxSizing:'border-box',textAlign:'center'};

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:12,color:C.sub}}>Enter stock for {date} — only fill rows with changes</div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {savedMsg&&<span style={{fontSize:12,color:C.green,fontWeight:700}}>{savedMsg}</span>}
          <button onClick={saveAll} disabled={saving}
            style={{padding:'8px 20px',borderRadius:8,border:'none',
              background:saving?'#4a5568':'linear-gradient(135deg,#f97316,#ea580c)',
              color:'#fff',fontWeight:800,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
            {saving?'⏳ Saving…':'💾 Save All'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'2.5fr 0.8fr 0.8fr 0.8fr 0.8fr 1.2fr',
          gap:0,padding:'8px 12px',background:C.raised}}>
          {['Part / Supplier','Store Stock','Dept Stock','Received','Issued','Remarks'].map(h=>(
            <div key={h} style={{fontSize:9,fontWeight:800,color:C.sub,textTransform:'uppercase'}}>{h}</div>
          ))}
        </div>
        {parts.map((p,i)=>{
          const r = rows[p.partNo]||{};
          const bal = (parseInt(r.storeStock)||0)+(parseInt(r.deptStock)||0);
          const isLow = p.minStock>0 && bal>0 && bal<p.minStock;
          const isAlert = p.minStock>0 && bal>0 && bal<p.minStock*0.5;
          return (
            <div key={p.partNo} style={{display:'grid',gridTemplateColumns:'2.5fr 0.8fr 0.8fr 0.8fr 0.8fr 1.2fr',
              gap:0,padding:'6px 12px',borderTop:`1px solid ${C.border}`,
              background:isAlert?'rgba(239,68,68,0.05)':isLow?'rgba(245,158,11,0.03)':'transparent',
              alignItems:'center'}}>
              <div>
                <div style={{fontWeight:700,color:C.text,fontSize:11}}>{p.partName}</div>
                <div style={{color:C.sub,fontSize:9}}>{p.partNo} · {p.supplierName}</div>
                {isAlert&&<div style={{color:C.red,fontSize:9,fontWeight:700}}>⚠️ Balance {fmtK(bal)} {'<'} Min {fmtK(p.minStock)}</div>}
              </div>
              {['storeStock','deptStock','received','issued'].map(k=>(
                <div key={k} style={{padding:'0 4px'}}>
                  <input type="number" min={0} value={r[k]??''} onChange={e=>upd(p.partNo,k,e.target.value)}
                    style={{...inp,color:k==='received'?C.green:k==='issued'?C.orange:C.text}}/>
                </div>
              ))}
              <div style={{padding:'0 4px'}}>
                <input value={r.remarks||''} onChange={e=>upd(p.partNo,'remarks',e.target.value)}
                  style={{...inp,textAlign:'left'}} placeholder="—"/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Schedule Link Tab ─────────────────────────────────────────────────────────
function ScheduleLink({ entries, year, month }) {
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    async function load() {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db,'customer_schedules'),
          where('year','==',year), where('month','==',month)));
        const s = {};
        snap.docs.forEach(d=>{
          const {custId,partNo,scheduleQty} = d.data();
          if(!s[custId]) s[custId]={};
          s[custId][partNo]={scheduleQty:scheduleQty||0};
        });
        setSchedules(s);
      } catch(e){ console.error(e); }
      finally{ setLoading(false); }
    }
    load();
  },[year,month]);

  const required = calcRequiredFromSchedule(schedules);

  // Build comparison table
  const rows = Object.entries(required).map(([partNo, reqQty])=>{
    const m = CHILD_PARTS_MASTER[partNo]||{};
    const e = entries[partNo]||{};
    const stock = (e.storeStock||0)+(e.deptStock||0);
    const coverage = reqQty>0 ? (stock/reqQty*100).toFixed(0) : 100;
    const shortage = Math.max(0, reqQty - stock);
    const orderQty = shortage>0 ? Math.ceil(shortage/m.moq||1)*( m.moq||shortage) : 0;
    return {partNo, partName:m.partName||partNo, supplierName:m.supplierName||'—',
      leadTime:m.leadTime||'—', moq:m.moq||0,
      reqQty, stock, coverage:parseInt(coverage), shortage, orderQty };
  }).sort((a,b)=>a.coverage-b.coverage);

  const criticalRows = rows.filter(r=>r.shortage>0);

  if (loading) return <div style={{padding:40,textAlign:'center',color:C.sub}}>Loading schedule…</div>;

  const monthLabel = new Date(year,month).toLocaleString('en-IN',{month:'long',year:'numeric'});

  return (
    <div>
      <div style={{fontWeight:800,fontSize:14,color:C.text,marginBottom:4}}>
        📊 Schedule vs Stock — {monthLabel}
      </div>
      <div style={{fontSize:12,color:C.sub,marginBottom:16}}>
        Auto-calculated from customer schedule × BOM quantities. Shows what to order.
      </div>

      {criticalRows.length>0&&(
        <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',
          borderRadius:8,padding:'10px 14px',marginBottom:14}}>
          <div style={{fontWeight:800,color:C.red,fontSize:12,marginBottom:4}}>
            🚨 {criticalRows.length} parts need ordering
          </div>
          {criticalRows.slice(0,3).map(r=>(
            <div key={r.partNo} style={{fontSize:11,color:C.text,marginBottom:2}}>
              • <strong>{r.partName}</strong> — Shortage: {fmtK(r.shortage)} · Order: {fmtK(r.orderQty)} · Lead: {r.leadTime}
            </div>
          ))}
          {criticalRows.length>3&&<div style={{fontSize:10,color:C.sub}}>+{criticalRows.length-3} more below</div>}
        </div>
      )}

      {rows.length===0?(
        <div style={{padding:40,textAlign:'center',color:C.sub}}>
          No BOM-linked schedules found for this month.<br/>
          <span style={{fontSize:10}}>Make sure Customer Dashboard has schedules entered for {monthLabel}</span>
        </div>
      ):(
        <div style={{border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr',
            gap:0,padding:'8px 12px',background:C.raised}}>
            {['Child Part','Required','In Stock','Coverage','Shortage','Order Qty','Supplier / Lead'].map(h=>(
              <div key={h} style={{fontSize:9,fontWeight:800,color:C.sub,textTransform:'uppercase'}}>{h}</div>
            ))}
          </div>
          {rows.map(r=>(
            <div key={r.partNo} style={{display:'grid',gridTemplateColumns:'2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr',
              gap:0,padding:'8px 12px',borderTop:`1px solid ${C.border}`,
              background:r.shortage>0?'rgba(239,68,68,0.05)':'transparent',
              alignItems:'center',fontSize:11}}>
              <div>
                <div style={{fontWeight:700,color:C.text}}>{r.partName}</div>
                <div style={{color:C.sub,fontSize:9}}>{r.partNo}</div>
              </div>
              <div style={{color:C.blue,fontWeight:700}}>{fmtK(r.reqQty)}</div>
              <div style={{color:C.text,fontWeight:700}}>{fmtK(r.stock)}</div>
              <div>
                <div style={{height:4,background:C.raised,borderRadius:2,marginBottom:2}}>
                  <div style={{height:4,borderRadius:2,width:`${Math.min(r.coverage,100)}%`,
                    background:r.coverage>=100?C.green:r.coverage>=50?C.amber:C.red}}/>
                </div>
                <div style={{fontSize:9,color:r.coverage>=100?C.green:r.coverage>=50?C.amber:C.red,fontWeight:700}}>
                  {r.coverage}%
                </div>
              </div>
              <div style={{color:r.shortage>0?C.red:C.sub,fontWeight:r.shortage>0?800:400}}>
                {r.shortage>0?`-${fmtK(r.shortage)}`:'OK'}
              </div>
              <div style={{color:r.orderQty>0?C.orange:C.sub,fontWeight:r.orderQty>0?800:400}}>
                {r.orderQty>0?fmtK(r.orderQty):'—'}
              </div>
              <div style={{color:C.sub,fontSize:10}}>{r.supplierName}<br/>{r.leadTime}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ChildPartsDashboard({ userProfile, onBack }) {
  const userEmail = userProfile?.email;
  const isOwner   = ['owner@alubee.com','md@alubee.com'].includes(userEmail);
  if (!ALLOWED.includes(userEmail)&&!isOwner) return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',color:C.text}}>
      <div style={{textAlign:'center'}}><div style={{fontSize:48,marginBottom:12}}>🔒</div><div style={{fontWeight:700}}>Access restricted</div></div>
    </div>
  );

  const now = new Date();
  const [tab,   setTab]   = useState('entry');
  const [date,  setDate]  = useState(todayStr());
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [entries, setEntries] = useState({});

  // Live entries for selected date
  useEffect(()=>{
    const unsub = onSnapshot(collection(db,'child_parts_final_u1'), snap=>{
      const map = {};
      snap.docs.forEach(d=>{ const data=d.data(); if(data.date===date) map[data.partNo]=data; });
      setEntries(map);
    });
    return ()=>unsub();
  },[date]);

  const TABS = [
    {id:'entry',    label:'📝 Daily Entry'},
    {id:'master',   label:'📋 Part Master / BOM'},
    {id:'schedule', label:'🔗 Schedule vs Stock'},
  ];

  return (
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:'Inter,system-ui,sans-serif'}}>
      {/* Header */}
      <div style={{background:'linear-gradient(135deg,#1e3a5f,#0f2848)',color:'#fff',padding:'14px 18px',boxShadow:'0 2px 10px rgba(0,0,0,0.4)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
          {onBack&&<button onClick={onBack} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:9,color:'#fff',fontSize:18,cursor:'pointer',padding:'5px 12px'}}>←</button>}
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:17}}>🔩 Child Parts</div>
            <div style={{fontSize:11,opacity:0.8,marginTop:2}}>Stock Entry · BOM Master · Schedule Link</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {tab==='entry'&&<>
              <input type="date" value={date} max={todayStr()} onChange={e=>setDate(e.target.value)}
                style={{padding:'6px 10px',borderRadius:8,border:'none',background:'rgba(255,255,255,0.15)',
                  color:'#fff',fontSize:12,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}/>
              <button onClick={()=>setDate(todayStr())}
                style={{padding:'6px 12px',borderRadius:8,border:'none',background:'rgba(255,255,255,0.2)',
                  color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Today</button>
            </>}
            {tab==='schedule'&&(
              <select value={`${year}-${month}`} onChange={e=>{const[y,m]=e.target.value.split('-').map(Number);setYear(y);setMonth(m);}}
                style={{padding:'6px 10px',borderRadius:8,border:'none',background:'rgba(255,255,255,0.15)',
                  color:'#fff',fontSize:12,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>
                {Array.from({length:12},(_,i)=>{
                  const d=new Date(now.getFullYear(),i);
                  return <option key={i} value={`${now.getFullYear()}-${i}`}>{d.toLocaleString('en-IN',{month:'short',year:'numeric'})}</option>;
                })}
              </select>
            )}
          </div>
        </div>
        <div style={{display:'flex',gap:6}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:'7px 16px',borderRadius:20,border:'none',cursor:'pointer',fontWeight:700,
                fontSize:12,whiteSpace:'nowrap',
                background:tab===t.id?'#fff':'rgba(255,255,255,0.15)',
                color:tab===t.id?'#1e3a5f':'#fff'}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:'16px 14px',maxWidth:1100,margin:'0 auto'}}>
        {tab==='entry'   && <DailyEntryTab date={date} userProfile={userProfile} entries={entries} onSaved={()=>{}}/>}
        {tab==='master'  && <MasterTab/>}
        {tab==='schedule'&& <ScheduleLink entries={entries} year={year} month={month}/>}
      </div>
    </div>
  );
}
