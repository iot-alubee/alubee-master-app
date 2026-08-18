import React, { useState } from 'react';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const CUSTOMERS = [
  { id:'royal_enfield', name:'ROYAL ENFIELD', order:1, parts:[
    {partNo:'J1D_GRAB_RAIL_LH',partName:'J1D GRAB RAIL-LH',rate:0},
    {partNo:'J1D_GRAB_RAIL_RH',partName:'J1D GRAB RAIL-RH',rate:0},
    {partNo:'J1D_GRAB_RAIL_PLATE',partName:'J1D GRAB RAIL-PLATE',rate:0},
    {partNo:'47_D_SEAT_SPRING',partName:'47/D SEAT SPRING',rate:0},
    {partNo:'169_A_J1A_SET',partName:'169/A J1A SET',rate:0},
    {partNo:'141_B_J1D_EXTENDER',partName:'141/B J1D EXTENDER + HOSUR',rate:0},
    {partNo:'168_B_J1B_SET',partName:'168/B J1B SET',rate:0},
    {partNo:'103_G_J1C_SET',partName:'103/G J1C SET',rate:0},
    {partNo:'P4D_SETS_74C_JAIPUR',partName:'P4D SETS -74/C Jaipur',rate:0},
    {partNo:'P4D_SIDE_RAIL_LH_VALLAM',partName:'P4D SIDE RAIL-LH Vallam',rate:0},
    {partNo:'P4D_SIDE_RAIL_RH_VALLAM',partName:'P4D SIDE RAIL-RH Vallam',rate:0},
    {partNo:'FRONT_UNDER_SEAT_BRACKET',partName:'Front Under Seat Bracket Vallam',rate:0},
    {partNo:'REAR_UNDER_SEAT_BRACKET',partName:'Rear Under Seat Bracket Vallam',rate:0},
  ]},
  { id:'gates', name:'GATES', order:2, parts:[
    {partNo:'P15_DUST_BASE',partName:'P15 DUST BASE',rate:0},
    {partNo:'RENO_ADJUSTER',partName:'RENO ADJUSTER',rate:0},
    {partNo:'RENO_ARM',partName:'RENO ARM',rate:0},
    {partNo:'DISEL_ARM',partName:'DISEL ARM',rate:0},
    {partNo:'FORD_ARM',partName:'FORD ARM',rate:0},
    {partNo:'N6_ARM',partName:'N6 ARM',rate:0},
    {partNo:'N6_BASE',partName:'N6 BASE',rate:0},
    {partNo:'SPACER',partName:'SPACER',rate:0},
    {partNo:'JCB',partName:'JCB',rate:0},
    {partNo:'W201',partName:'W201',rate:0},
  ]},
  { id:'tvs', name:'TVS', order:3, parts:[
    {partNo:'COVER_OIL_PUMP',partName:'COVER OIL PUMP',rate:0},
    {partNo:'COVER_CRANK_CASE',partName:'COVER CRANK CASE',rate:0},
    {partNo:'COVER_MAGNETO',partName:'COVER MAGNETO',rate:0},
    {partNo:'COVER_CYLINDER_HEAD',partName:'COVER CYLINDER HEAD',rate:0},
  ]},
  { id:'ola', name:'OLA', order:4, parts:[
    {partNo:'WHEEL_HUB',partName:'WHEEL HUB',rate:0},
    {partNo:'M3X_CASTED_CASTING',partName:'M3X CASTED CASTING',rate:0},
    {partNo:'GEN2_MOTOR_HOUSING',partName:'GEN2 MOTOR HOUSING',rate:0},
  ]},
  { id:'seg_ola', name:'SEG OLA', order:5, parts:[
    {partNo:'RE_COVER_050',partName:'RE COVER 050',rate:0},
    {partNo:'RE_COVER_017',partName:'RE COVER 017',rate:0},
    {partNo:'END_PLATE',partName:'END PLATE',rate:0},
    {partNo:'DE_SHIELD_017',partName:'DE SHIELD 017',rate:0},
  ]},
  { id:'kaynes', name:'KAYNES', order:6, parts:[
    {partNo:'M3_CHARGER_TOP_COVER',partName:'M3 CHARGER TOP COVER',rate:0},
  ]},
  { id:'amara_raja', name:'AMARA RAJA', order:7, parts:[
    {partNo:'2KW_TOP_COVER',partName:'2KW TOP COVER',rate:0},
    {partNo:'3KW_TOP_COVER',partName:'3KW TOP COVER',rate:0},
    {partNo:'3KW_BOTTOM_COVER',partName:'3KW BOTTOM COVER',rate:0},
  ]},
  { id:'fuji', name:'FUJI', order:8, parts:[
    {partNo:'HS_401_FUJI_HS',partName:'HS-401 (FUJI-HS)',rate:0},
  ]},
  { id:'royal_enfield_child_parts', name:'ROYAL ENFIELD - CHILD PARTS', order:9, parts:[
    {partNo:'BOLT_HHF_M8X16_BLK',partName:'BOLT,HHF,M8X 16, 8.8 BLK,L',rate:0},
    {partNo:'M8_THREAD_BUNG',partName:'M8 Thread Bung',rate:0},
    {partNo:'BOLT_HHF_M6X25_WHT',partName:'BOLT, HHF,M6X25,10.9 WHT',rate:0},
    {partNo:'WASH_FLAT_10_5X20X2',partName:'Wash, Flat 10.5x 20x 2, 140HV,WHT',rate:0},
  ]},
];

const SUPPLIERS = [
  { id:'neocol', name:'Neocol', parts:[
    {partNo:'J1A_LH',partName:'J1A LH',rate:0},
    {partNo:'J1A_RH',partName:'J1A RH',rate:0},
    {partNo:'J1B_LH',partName:'J1B LH',rate:0},
    {partNo:'J1B_RH',partName:'J1B RH',rate:0},
    {partNo:'J1D_LH',partName:'J1D LH',rate:0},
    {partNo:'J1D_RH',partName:'J1D RH',rate:0},
    {partNo:'BACK_PLATE',partName:'Back Plate',rate:0},
    {partNo:'P4D_LH',partName:'P4D LH',rate:0},
    {partNo:'P4D_RH',partName:'P4D RH',rate:0},
    {partNo:'SS_MOUNT_LH',partName:'SS Mount LH',rate:0},
    {partNo:'SS_MOUNT_RH',partName:'SS Mount RH',rate:0},
    {partNo:'2KW_TOP',partName:'2KW Top',rate:0},
    {partNo:'3KW_TOP',partName:'3KW Top',rate:0},
    {partNo:'3KW_BOTTOM',partName:'3KW Bottom',rate:0},
    {partNo:'COVER_MAGNETO',partName:'Cover Magneto',rate:0},
    {partNo:'COVER_CYLINDER_HEAD',partName:'Cover Cylinder Head',rate:0},
    {partNo:'J1C_LH',partName:'J1C LH',rate:0},
    {partNo:'J1C_RH',partName:'J1C RH',rate:0},
    {partNo:'WHEEL_HUB',partName:'Wheel Hub',rate:0},
    {partNo:'COVER_OIL_PUMP',partName:'Cover Oil Pump',rate:0},
    {partNo:'P15BASE',partName:'P15BASE',rate:0},
  ]},
  { id:'valli', name:'Valli', parts:[] },
  { id:'v_tech', name:'V-tech', parts:[] },
];

export default function MigrateU2Data({ onDone }) {
  const [status, setStatus] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const log = msg => setStatus(s => [...s, msg]);

  async function run() {
    setRunning(true);
    setStatus([]);
    try {
      // Customer master
      log('📋 Writing customer_master_u2...');
      for (const c of CUSTOMERS) {
        await setDoc(doc(db, 'customer_master_u2', c.id), c);
        log(`  ✅ ${c.name} — ${c.parts.length} parts`);
      }

      // Supplier master
      log('🚛 Writing supplier_master_u2...');
      for (const s of SUPPLIERS) {
        await setDoc(doc(db, 'supplier_master_u2', s.id), s);
        log(`  ✅ ${s.name} — ${s.parts.length} parts`);
      }

      const totalParts = CUSTOMERS.reduce((a,c)=>a+c.parts.length,0);
      log(`\n🎉 Done! ${CUSTOMERS.length} customers (${totalParts} parts) + ${SUPPLIERS.length} suppliers`);
      log('Rates are set to 0 — your brother can update them in the Schedule Master.');
      setDone(true);
    } catch(e) {
      log(`❌ Error: ${e.message}`);
    }
    setRunning(false);
  }

  return (
    <div style={{minHeight:'100vh',background:'#0F1117',display:'flex',alignItems:'center',
      justifyContent:'center',fontFamily:'Inter,system-ui,sans-serif',padding:20}}>
      <div style={{background:'#181C2E',border:'1px solid #252D50',borderRadius:16,
        padding:'28px 32px',maxWidth:520,width:'100%'}}>
        <div style={{fontSize:20,fontWeight:900,color:'#E6EDF3',marginBottom:4}}>
          🔄 U2 Master Setup
        </div>
        <div style={{fontSize:12,color:'#8892B0',marginBottom:20}}>
          Seeds customer_master_u2 and supplier_master_u2 in Firestore
        </div>

        <div style={{marginBottom:16,fontSize:12,color:'#8892B0'}}>
          <strong style={{color:'#E6EDF3'}}>Customers ({CUSTOMERS.length}):</strong>{' '}
          {CUSTOMERS.map(c=>c.name).join(', ')}
        </div>
        <div style={{marginBottom:20,fontSize:12,color:'#8892B0'}}>
          <strong style={{color:'#E6EDF3'}}>Suppliers (3):</strong> Neocol (21 parts), Valli, V-tech
        </div>

        {status.length>0&&(
          <div style={{background:'#0F1117',borderRadius:8,padding:'12px 14px',
            marginBottom:16,maxHeight:240,overflowY:'auto',fontFamily:'monospace',fontSize:11}}>
            {status.map((s,i)=>(
              <div key={i} style={{color:s.startsWith('❌')?'#f87171':s.startsWith('🎉')?'#4ade80':'#8892B0',
                marginBottom:2,whiteSpace:'pre-wrap'}}>{s}</div>
            ))}
          </div>
        )}

        <div style={{display:'flex',gap:10}}>
          {!done?(
            <button onClick={run} disabled={running}
              style={{flex:1,padding:'12px',borderRadius:10,border:'none',
                background:running?'#374151':'linear-gradient(135deg,#7c3aed,#5b21b6)',
                color:'#fff',fontWeight:800,fontSize:14,cursor:running?'not-allowed':'pointer',
                fontFamily:'inherit'}}>
              {running?'⏳ Migrating…':'🚀 Run Migration'}
            </button>
          ):(
            <button onClick={onDone}
              style={{flex:1,padding:'12px',borderRadius:10,border:'none',
                background:'linear-gradient(135deg,#16a34a,#15803d)',
                color:'#fff',fontWeight:800,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>
              ✅ Done — Go to Dashboard
            </button>
          )}
          <button onClick={onDone} disabled={running}
            style={{padding:'12px 20px',borderRadius:10,border:'1px solid #252D50',
              background:'transparent',color:'#8892B0',fontWeight:700,fontSize:13,
              cursor:'pointer',fontFamily:'inherit'}}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
