import React, { useState, useEffect, useCallback } from 'react';
// ── Last Updated Badge ────────────────────────────────────────────────────────
function LastUpdatedBadge({at, by}) {
  if (!at && !by) return null;
  let ts = null;
  try {
    if (at instanceof Date) { ts = at; }
    else if (at && typeof at.toDate === 'function') { ts = at.toDate(); }
    else if (at && at.seconds) { ts = new Date(at.seconds * 1000); }
    else if (at && typeof at === 'string') { ts = new Date(at); }
    else if (at && typeof at === 'number') { ts = new Date(at); }
    if (ts && isNaN(ts.getTime())) ts = null;
  } catch(e) { ts = null; }
  const dateStr = ts ? ts.toLocaleDateString('en-IN',{year:'numeric',month:'2-digit',day:'2-digit'}).split('/').reverse().join('-') : null;
  const timeStr = ts ? ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : null;
  return (
    <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>
      Last updated:{dateStr&&<> <span style={{color:'#f97316',fontWeight:700}}>{dateStr}</span></>}{timeStr&&<> at {timeStr}</>}{by&&<> by <strong style={{color:'#e2e8f0'}}>{by}</strong></>}
    </div>
  );
}


import { doc, setDoc, getDocs, deleteDoc, query, where, collection } from 'firebase/firestore';
import { createNotification, NOTIF_TYPES } from '../utils/notificationService';
import ScheduleRevisionComp from './ScheduleRevision';
import { db } from '../firebase';

// ─── WORKING DAYS ─────────────────────────────────────────────────────────────
function getWorkingDaysInMonth(year, month) {
  let c = 0;
  for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++)
    if (new Date(year, month, d).getDay() !== 0) c++;
  return c;
}
function getWorkingDaysElapsed(year, month, today) {
  let c = 0;
  for (let d = 1; d <= today; d++)
    if (new Date(year, month, d).getDay() !== 0) c++;
  return c;
}
function getNorms(year, month, today) {
  const total = getWorkingDaysInMonth(year, month);
  return total > 0 ? getWorkingDaysElapsed(year, month, today) / total : 0;
}

// ─── MASTER DATA — JULY 2026 ──────────────────────────────────────────────────
const DEFAULT_CUSTOMERS = [
  {id:'seg_heatsink', name:'SEG - Heat Sink', parts:[
    {partNo:'F002.G11.198',partName:'HEAT SINK-198',rate:30.63},
    {partNo:'F000.BL2.112',partName:'Heat Sink-112',rate:30.37},
    {partNo:'F00M.934.101',partName:'Heat Sink - 101',rate:41.04},
    {partNo:'F000.BL1.1CS',partName:'Heat Sink -1 CS',rate:34.74},
    {partNo:'F000.BL1.429',partName:'HEAT SINK - 429',rate:34.46}]},
  {id:'seg_hosur', name:'SEG - Hosur', parts:[
    {partNo:'F000.BL1.262',partName:'HEAT SINK - 262',rate:33.18},
    {partNo:'F000.BL1.429',partName:'HEAT SINK - 429',rate:34.46},
    {partNo:'F000.BL2.111',partName:'HEAT SINK - 111',rate:29.29},
    {partNo:'F000.BL2.112',partName:'Heat Sink-112',rate:30.37},
    {partNo:'F000BL12WB',partName:'Heat Sink -2WB',rate:38.92},
    {partNo:'F000.BL1.15D',partName:'SREC 15D',rate:217.94},
    {partNo:'F000.BL1.OES',partName:'SREC 0ES',rate:216.51}]},
  {id:'shaswathi', name:'SHASWATHI - MYSORE', parts:[
    {partNo:'F000.BL2.111',partName:'Heat Sink-111',rate:29.54},
    {partNo:'F000.BL2.112',partName:'Heat Sink-112',rate:31.04},
    {partNo:'F000BL12WB',partName:'Heat Sink -2WB',rate:40.07},
    {partNo:'F000.BL1.1CS',partName:'Heat Sink -1 CS',rate:36.56},
    {partNo:'F000 BL2 262',partName:'Heat Sink -262',rate:33.88},
    {partNo:'F000 BV1 A17',partName:'Heat Sink -A17',rate:55.89},
    {partNo:'F000 BV1 A20-01',partName:'Heat Sink -A20',rate:45.32},
    {partNo:'F002.G0C.0G9',partName:'Heat Sink-0G9',rate:38.40},
    {partNo:'F002.G91.259',partName:'Heat Sink-259',rate:30.82},
    {partNo:'F000 BL1 427',partName:'Heat Sink -427',rate:31.16}]},
  {id:'lucas_pondy', name:'LUCAS TVS - Pondicherry', parts:[
    {partNo:'26223649',partName:'DIAMLER SRE BRACKET-3649',rate:171.19}]},
  {id:'lucas_padi', name:'LUCAS TVS - PADI', parts:[
    {partNo:'26216784',partName:'PUMP HOUSING -6784',rate:132.63},
    {partNo:'26223992',partName:'PUMP HOUSING -3992',rate:136.26}]},
  {id:'seg_chandru', name:'SEG - NHP Chandru', parts:[
    {partNo:'F002.G70.306',partName:'Commutator End Shield-306',rate:83.02}]},
  {id:'seg_hassan', name:'SEG - Hassan Plant', parts:[
    {partNo:'1005.851.601',partName:'Commutator End Shield-601',rate:39.11},
    {partNo:'1005.851.610',partName:'Commutator End Shield-610',rate:40.85}]},
  {id:'prem', name:'Prem Industries', parts:[
    {partNo:'F000.BL1.2WF',partName:'Connecting Link-2WF',rate:31.55}]},
  {id:'kttm', name:'KTTM', parts:[
    {partNo:'R3411-4206000',partName:'LEVER TENSION LH(W30)',rate:68.65},
    {partNo:'R3411-4106000',partName:'LEVER TENSION RH(W30)',rate:68.65}]},
  {id:'seg_gururaj', name:'SEG - NHP Gururaj', parts:[
    {partNo:'F002.G70.576',partName:'IMB-112',rate:102.36},
    {partNo:'F002.G70.020',partName:'IMB-113',rate:93.00},
    {partNo:'1005.842.306',partName:'IMB-306',rate:232.57},
    {partNo:'2005.835.655',partName:'DEF-655',rate:541.57},
    {partNo:'2005.835.661',partName:'DEF-661',rate:552.12},
    {partNo:'2005.857.098',partName:'CES 098',rate:131.25},
    {partNo:'2005.857.078',partName:'CES 078',rate:134.93},
    {partNo:'2005.857.082',partName:'CES 082',rate:134.93},
    {partNo:'2005.857.086',partName:'CES 086',rate:134.93},
    {partNo:'F002.G70.021',partName:'CES 021',rate:141.54},
    {partNo:'F002.G70.365',partName:'CES 365',rate:145.84},
    {partNo:'F002.G70.371',partName:'CES 371',rate:126.41},
    {partNo:'F002.G70.439',partName:'CES 439',rate:111.96},
    {partNo:'F002.G70.489',partName:'CES 489',rate:110.20},
    {partNo:'F002.G70.551',partName:'CES 551',rate:138.81},
    {partNo:'F002.G20.905',partName:'CES 905',rate:113.90}]},
  {id:'ultraviolet', name:'Ultraviolet', parts:[
    {partNo:'VX182070',partName:'Charger Lid',rate:295.34}]},
  {id:'nbl', name:'NBL ITEMS', parts:[
    {partNo:'F00M.937.203',partName:'Drive End Shield-203',rate:245.57},
    {partNo:'F00M.937.603',partName:'Slip Ring End Shield-603',rate:209.72},
    {partNo:'F000.BL1.64B',partName:'Drive End Shield-64B',rate:282.91},
    {partNo:'F000.BL1.64D',partName:'Slip Ring End Shield-64D',rate:207.05},
    {partNo:'F000.BL1.2A6',partName:'Drive End Flange-2A6',rate:202.77},
    {partNo:'F000.BL1.2A8',partName:'Slip Ring End Shield-2A8',rate:207.89},
    {partNo:'F000.BL1.2UG',partName:'Drive End Shield-2UG',rate:194.08},
    {partNo:'F000.BL1.2UE',partName:'Slip Ring End Shield-2UE',rate:187.47},
    {partNo:'F000.BL1.350',partName:'Drive End Flange-350',rate:195.10},
    {partNo:'F000 BL1 255',partName:'Slip Ring End Shield-255',rate:197.22},
    {partNo:'F00M.136.823',partName:'SREC-823',rate:228.41},
    {partNo:'F000.BL1.11W',partName:'SREC-15K',rate:197.35},
    {partNo:'F000.BL1.286',partName:'SREC-286',rate:197.35},
    {partNo:'F000.BL1.15K',partName:'Slip Ring End Shield-15K',rate:156.71},
    {partNo:'F00M937211',partName:'DRIVE BEARING-211',rate:243.23},
    {partNo:'F00M937213',partName:'Slip Ring End Shield-213',rate:208.45}]},
  {id:'seg_karthiky', name:'SEG - Karthik Y', parts:[
    {partNo:'F002.G70.298',partName:'Commutator End Shield-298',rate:61.02},
    {partNo:'F002.G20.794',partName:'Commutator End Shield-794',rate:58.70},
    {partNo:'F000.BL1.537',partName:'DES 537',rate:186.91},
    {partNo:'F002.G10.740',partName:'COUPLING',rate:114.60}]},
  {id:'seg_prathwin', name:'SEG - Prathwin', parts:[
    {partNo:'F002G10568',partName:'ASSY 568',rate:66.65},
    {partNo:'F002G10467',partName:'ASSY 467',rate:71.15},
    {partNo:'F000BV1091',partName:'ASSY 091',rate:377.97},
    {partNo:'9491335149',partName:'ASSY 149',rate:72.50},
    {partNo:'F002G90276',partName:'ASSY 276',rate:67.65},
    {partNo:'F000BV1AJ9',partName:'ASSY AJ9',rate:90.23},
    {partNo:'F000BV1AE3',partName:'ASSY AE3',rate:108.46},
    {partNo:'F002.G91.336',partName:'Drive End Shield-336',rate:179.87},
    {partNo:'F002.G90.204',partName:'Drive End Shield-204',rate:183.10},
    {partNo:'F002.G90.205',partName:'Drive End Shield-205',rate:184.15},
    {partNo:'F002.G11.877',partName:'Drive End Shield-877',rate:202.72},
    {partNo:'F002.G90.200',partName:'Drive End Shield-200',rate:211.21},
    {partNo:'F002.G91.445',partName:'Drive End Flange-445',rate:183.10},
    {partNo:'F002.G11.882',partName:'Drive End Flange-882',rate:195.09},
    {partNo:'F002.G10.465',partName:'Drive End Shield-465',rate:199.40},
    {partNo:'F002.G91.339',partName:'Drive End Shield-339',rate:318.82},
    {partNo:'F002.G91.507',partName:'Drive End Shield-507',rate:324.45},
    {partNo:'F002.G91.022',partName:'Drive End Shield-022',rate:322.24},
    {partNo:'F002.G91.473',partName:'Banjo Aluminium-473',rate:25.57},
    {partNo:'F002.G90.589',partName:'Drive End Shield-589',rate:192.69}]},
  {id:'ola', name:'OLA Electric', parts:[
    {partNo:'2W000000025655',partName:'SWINGARM END CAP',rate:19.12},
    {partNo:'2W000000034555',partName:'WSS MTG BRACKET',rate:59.78},
    {partNo:'2W000000031145',partName:'HOLDER LH MIRROR',rate:68.19},
    {partNo:'2W000000024516',partName:'HANDLEBAR CLAMP',rate:20.90},
    {partNo:'2W000000030105',partName:'FOOTPEGS LH',rate:139.97},
    {partNo:'2W000000030120',partName:'FOOTPEGS RH',rate:137.38},
    {partNo:'2W000000027966',partName:'LOWER HOLDER M3X',rate:72.70},
    {partNo:'2W000000031090',partName:'BAR END M3X',rate:39.99},
    {partNo:'2W000000027077',partName:'UPPER HOLDER M3X',rate:68.94},
    {partNo:'2W000000030010',partName:'SWINGARM END CAP 2',rate:17.57},
    {partNo:'N6030250',partName:'COVER MAGNETO',rate:235.18}]},
];

const BINS_DATA = [
  {custId:'seg_heatsink',partNo:'F000 BL2  111',partName:'HS 111',stdBins:200,totalBins:0.0,reqBins:757.9,normsBins:30.3,received:423,available:12,custodian:'Gopi',saHr:500,binsAvail:800},
  {custId:'seg_heatsink',partNo:'F002.G11.198',partName:'HS 198',stdBins:150,totalBins:16.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:0},
  {custId:'seg_heatsink',partNo:'F000.BL2.112',partName:'HS 112',stdBins:200,totalBins:295.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:1000},
  {custId:'seg_heatsink',partNo:'F00M.934.101',partName:'HS 101',stdBins:125,totalBins:371.7,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:625},
  {custId:'seg_heatsink',partNo:'F000.BL1.1CS',partName:'HS 1CS',stdBins:125,totalBins:74.4,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:0,binsAvail:0},
  {custId:'seg_heatsink',partNo:'F000.BL1.429',partName:'HEAT SINK - 429',stdBins:150,totalBins:0.8,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:600},
  {custId:'seg_hosur',partNo:'F000.BL1.262',partName:'HS 262',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:2000},
  {custId:'seg_hosur',partNo:'F000.BL1.429',partName:'HS 429',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:1200},
  {custId:'shaswathi',partNo:'F000.BL2.111',partName:'HS 111',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:1050},
  {custId:'shaswathi',partNo:'F000.BL2.112',partName:'HS 112',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:0},
  {custId:'shaswathi',partNo:'F000BL12WB',partName:'HS 2WB',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:0},
  {custId:'shaswathi',partNo:'F000.BL1.1CS',partName:'HS 1CS',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:0},
  {custId:'shaswathi',partNo:'F000 BL2 262',partName:'HS 262',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:0},
  {custId:'shaswathi',partNo:'F000 BV1 A17',partName:'HS A17',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:350,binsAvail:0},
  {custId:'shaswathi',partNo:'F000 BV1 A20-01',partName:'HS A20',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:400,binsAvail:300},
  {custId:'shaswathi',partNo:'F002.G0C.0G9',partName:'HS 0G9',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:0},
  {custId:'shaswathi',partNo:'F000.BL1.1AX',partName:'HS 1AX',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:0},
  {custId:'lucas_pondy',partNo:'26223236',partName:'HS 3236',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:300,binsAvail:0},
  {custId:'lucas_pondy',partNo:'26223391',partName:'HR 10 SRE',stdBins:40,totalBins:37.5,reqBins:75.0,normsBins:3.1,received:0,available:0,custodian:'Gopi',saHr:150,binsAvail:0},
  {custId:'lucas_pondy',partNo:'26223388',partName:'HR 10 DE',stdBins:40,totalBins:37.5,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:150,binsAvail:0},
  {custId:'lucas_pondy',partNo:'26223649',partName:'AL TRUCK',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:150,binsAvail:0},
  {custId:'lucas_padi',partNo:'26216784',partName:'PH 6784',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:120,binsAvail:375},
  {custId:'lucas_padi',partNo:'26223992',partName:'PH 3992',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:120,binsAvail:0},
  {custId:'seg_chandru',partNo:'F002.G70.306',partName:'CES 306',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:150,binsAvail:0},
  {custId:'seg_chandru',partNo:'F002.G70.298',partName:'CES 298',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:270,binsAvail:720},
  {custId:'seg_chandru',partNo:'F002.G20.794',partName:'CES 794',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:270,binsAvail:720},
  {custId:'seg_chandru',partNo:'F002.G10.740',partName:'COUPLING 740',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:270,binsAvail:0},
  {custId:'seg_hassan',partNo:'1005.851.601',partName:'CES 601',stdBins:60,totalBins:2668.2,reqBins:2668.2,normsBins:106.7,received:2161,available:76,custodian:'Gopi',saHr:500,binsAvail:6000},
  {custId:'rajamane',partNo:'MAP4017241',partName:'COVER III -7241',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:250,binsAvail:0},
  {custId:'rajamane',partNo:'MAP4017131',partName:'COVER-II - 7131',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:250,binsAvail:0},
  {custId:'prem',partNo:'F000.BL1.64H',partName:'C.L 64H',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:1000},
  {custId:'prem',partNo:'F000.BL1.2WF',partName:'C.L 2WF',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:500,binsAvail:0},
  {custId:'kttm',partNo:'R3411-4206000',partName:'KTTM LH',stdBins:42,totalBins:0.0,reqBins:0.0,normsBins:0.0,received:0,available:267,custodian:'Gopi',saHr:400,binsAvail:1680},
  {custId:'kttm',partNo:'R3411-4106000',partName:'KTTM RH',stdBins:6,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:400,binsAvail:240},
  {custId:'kttm',partNo:'F000.BL1.14V',partName:'DRIVE END SHIELD - 14V (1M8)',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:0,binsAvail:120},
  {custId:'kttm',partNo:'F000.BL1.0ES',partName:'SLIP-RING END SHIELD - OES',stdBins:24,totalBins:0,reqBins:20.0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:0,binsAvail:0},
  {custId:'seg_gururaj',partNo:'F002.G70.576',partName:'IMB 112',stdBins:24,totalBins:1325.0,reqBins:1325.0,normsBins:53.0,received:1400,available:20,custodian:'Mangundu',saHr:270,binsAvail:1008},
  {custId:'seg_gururaj',partNo:'F002.G70.020',partName:'IMB113',stdBins:24,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:270,binsAvail:288},
  {custId:'seg_gururaj',partNo:'2005.835.618',partName:'DEF - 618',stdBins:12,totalBins:0.0,reqBins:670.0,normsBins:26.8,received:623,available:0,custodian:'Mangundu',saHr:120,binsAvail:480},
  {custId:'seg_gururaj',partNo:'2005.835.655',partName:'DEF-655',stdBins:6,totalBins:670.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:120,binsAvail:78},
  {custId:'seg_gururaj',partNo:'2005.857.082',partName:'CES 082',stdBins:12,totalBins:0.0,reqBins:2418.7,normsBins:96.7,received:2269,available:56,custodian:'Mangundu',saHr:120,binsAvail:156},
  {custId:'seg_gururaj',partNo:'2005.857.086',partName:'CES 086',stdBins:12,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:120,binsAvail:0},
  {custId:'seg_gururaj',partNo:'F002.G70.021',partName:'CES 021',stdBins:12,totalBins:2418.7,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:120,binsAvail:120},
  {custId:'seg_gururaj',partNo:'F002.G70.365',partName:'CES 365',stdBins:12,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:120,binsAvail:0},
  {custId:'seg_gururaj',partNo:'F002.G70.371',partName:'CES 371',stdBins:12,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:150,binsAvail:360},
  {custId:'seg_gururaj',partNo:'F002.G70.408',partName:'CES 408',stdBins:12,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:120,binsAvail:0},
  {custId:'seg_gururaj',partNo:'F002.G70.439',partName:'CES 439',stdBins:12,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:200,binsAvail:192},
  {custId:'seg_gururaj',partNo:'F002.G70.489',partName:'CES 489',stdBins:12,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:120,binsAvail:0},
  {custId:'seg_gururaj',partNo:'F002.G70.551',partName:'CES 551',stdBins:12,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:120,binsAvail:480},
  {custId:'seg_gururaj',partNo:'2005.835.618',partName:'DEF - 618',stdBins:12,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:120,binsAvail:480},
  {custId:'seg_gururaj',partNo:'F002.G20.905',partName:'CES 905',stdBins:12,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:120,binsAvail:480},
  {custId:'seg_gururaj',partNo:'1605.806.464',partName:'GH 464',stdBins:24,totalBins:818.4,reqBins:1263.0,normsBins:52.6,received:0,available:0,custodian:'Mangundu',saHr:270,binsAvail:600},
  {custId:'seg_gururaj',partNo:'1605.806.5G9',partName:'GH 5G9',stdBins:24,totalBins:187.5,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:270,binsAvail:0},
  {custId:'seg_gururaj',partNo:'1.605.806.5HB',partName:'GH 5HB',stdBins:24,totalBins:226.8,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:270,binsAvail:528},
  {custId:'seg_gururaj',partNo:'1.605.805.137',partName:'Gear Housing-137',stdBins:0,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Mangundu',saHr:270,binsAvail:528},
  {custId:'nbl',partNo:'F00M.937.203',partName:'DES 203',stdBins:20,totalBins:1216.0,reqBins:5529.7,normsBins:241.2,received:3733,available:100,custodian:'Loganathan',saHr:130,binsAvail:300},
  {custId:'nbl',partNo:'F00M.937.603',partName:'SREC 603',stdBins:24,totalBins:932.5,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:130,binsAvail:288},
  {custId:'nbl',partNo:'F000.BL1.64B',partName:'DEF 64B',stdBins:20,totalBins:707.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:130,binsAvail:400},
  {custId:'nbl',partNo:'F000.BL1.64D',partName:'SREC 64D',stdBins:24,totalBins:557.5,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:130,binsAvail:600},
  {custId:'nbl',partNo:'F000.BL1.2A6',partName:'DEF 2A6',stdBins:24,totalBins:444.2,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:200,binsAvail:840},
  {custId:'nbl',partNo:'F000.BL1.2A8',partName:'SREC 2A8',stdBins:24,totalBins:455.8,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:140,binsAvail:720},
  {custId:'nbl',partNo:'F000.BL1.2UG',partName:'DES 0B8',stdBins:24,totalBins:183.3,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:130,binsAvail:336},
  {custId:'nbl',partNo:'F000.BL1.2UE',partName:'SREC 0C1',stdBins:24,totalBins:180.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:130,binsAvail:312},
  {custId:'nbl',partNo:'F000.BL1.350',partName:'DEF 350',stdBins:24,totalBins:145.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:200,binsAvail:0},
  {custId:'nbl',partNo:'F000 BL1 255',partName:'SREC 255',stdBins:24,totalBins:165.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:140,binsAvail:120},
  {custId:'nbl',partNo:'F000.BL1.286',partName:'DES - 11U',stdBins:24,totalBins:35.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:200,binsAvail:0},
  {custId:'nbl',partNo:'F00M.136.823',partName:'SREC-823',stdBins:15,totalBins:29.3,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:100,binsAvail:0},
  {custId:'nbl',partNo:'F000.BL1.11W',partName:'SREC  -15K',stdBins:24,totalBins:0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:0,binsAvail:0},
  {custId:'nbl',partNo:'F000.BL1.282',partName:'SREC-282',stdBins:24,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:140,binsAvail:0},
  {custId:'nbl',partNo:'F00M937211',partName:'DEF 211',stdBins:20,totalBins:100.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:130,binsAvail:500},
  {custId:'nbl',partNo:'F00M937213',partName:'SREC213',stdBins:20,totalBins:101.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:130,binsAvail:480},
  {custId:'nbl',partNo:'F000.BL1.0S5',partName:'SREC - 0S5',stdBins:24,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Loganathan',saHr:270,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002G10568',partName:'ASSY 568',stdBins:15,totalBins:0.0,reqBins:621.0,normsBins:24.8,received:1288,available:0,custodian:'Raj kumar/Uday',saHr:0,binsAvail:450},
  {custId:'seg_prathwin',partNo:'F002G10467',partName:'ASSY 467',stdBins:15,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Raj kumar/Uday',saHr:0,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F000BV1091',partName:'ASSY 091',stdBins:15,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Raj kumar/Uday',saHr:0,binsAvail:0},
  {custId:'seg_prathwin',partNo:'9491335149',partName:'ASSY 149',stdBins:15,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Raj kumar/Uday',saHr:0,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002G90276',partName:'ASSY 276',stdBins:15,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Raj kumar/Uday',saHr:0,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F000BV1AJ9',partName:'ASSY AJ9',stdBins:15,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Raj kumar/Uday',saHr:0,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F000BV1AE3',partName:'ASSY AE3',stdBins:9,totalBins:0,reqBins:0.0,normsBins:0,received:0,available:0,custodian:'Raj kumar/Uday',saHr:0,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G91.336',partName:'DES 336',stdBins:30,totalBins:60.0,reqBins:477.5,normsBins:21.7,received:0,available:0,custodian:'Gopi',saHr:270,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G91.338',partName:'DES 338',stdBins:30,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:270,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G90.204',partName:'DES 204',stdBins:30,totalBins:26.7,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:270,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G90.205',partName:'DES 205',stdBins:30,totalBins:20.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:270,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G11.882',partName:'Drive End Shield-882',stdBins:30,totalBins:6.7,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:270,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G91.445',partName:'DEF 445',stdBins:30,totalBins:30.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:270,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G91.335',partName:'DES 335',stdBins:30,totalBins:0.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:270,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G10.465',partName:'DES 465',stdBins:24,totalBins:108.3,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:130,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G90.200',partName:'Drive End Shield-200',stdBins:24,totalBins:12.5,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:130,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G91.339',partName:'DES 339',stdBins:15,totalBins:80.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:150,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G91.507',partName:'DES 507',stdBins:15,totalBins:73.3,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:150,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G91.022',partName:'DES 022',stdBins:15,totalBins:53.3,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:150,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G90.589',partName:'DRIVE END FLANGE',stdBins:30,totalBins:6.7,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:250,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G90.206',partName:'DRIVE END SHIELD; SM BASIS',stdBins:15,totalBins:6.7,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:270,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G11.877',partName:'Drive End Shield-877',stdBins:30,totalBins:30.0,reqBins:0,normsBins:0,received:0,available:0,custodian:'Gopi',saHr:270,binsAvail:0},
  {custId:'seg_prathwin',partNo:'F002.G91.473',partName:'Banjo 473',stdBins:45,totalBins:8.9,reqBins:8.9,normsBins:0.4,received:0,available:0,custodian:'Gopi',saHr:270,binsAvail:0},
];

const BINS_CHARTS = [
  {label:"HS ( 399 )",name:"Heat Sink — HS 399 Bins",custId:"seg_heatsink",normPerDay:30.0,daily:{}},
  {label:"IMB (375)",name:"IMB Bins (375)",custId:"seg_gururaj",normPerDay:53.0,daily:{}},
  {label:"DEF (394)",name:"DEF Bins (394)",custId:"seg_gururaj",normPerDay:18.0,daily:{}},
  {label:"CES (408)",name:"CES Bins (408)",custId:"seg_gururaj",normPerDay:97.0,daily:{}},
  {label:"DEF&SREC(400)",name:"DEF & SREC Bins (400)",custId:"nbl",normPerDay:241.0,daily:{}},
  {label:"ASSY (406)",name:"ASSY Bins (406)",custId:"seg_prathwin",normPerDay:25.0,daily:{}},
  {label:"CES 601",name:"CES 601 Bins",custId:"seg_hassan",normPerDay:107.0,daily:{}},
  {label:"IMB 112 Hassan",name:"IMB 112 Bins — Hassan",custId:"seg_hassan",normPerDay:50.0,daily:{}},
];

// ─── FIRESTORE HELPERS ────────────────────────────────────────────────────────
async function loadCustomerMaster(unit) {
  const u = unit||'u1';
  const colName = u==='u2' ? 'customer_master_u2' : 'customer_master';
  try {
    const snap = await getDocs(collection(db,colName));
    if (!snap.empty) {
      const list=[]; snap.forEach(d=>list.push(d.data()));
      const sorted=list.sort((a,b)=>(a.order||0)-(b.order||0));
      // For U2 always return what's in Firestore (rates start at 0 and are entered fresh)
      if (u==='u2') return sorted;
      // For U1 trust Firestore only if parts have rate > 0 (stale data has rate:0)
      const hasRates = sorted.some(s=>Array.isArray(s.parts)&&s.parts.some(p=>p.rate>0));
      if (hasRates) return sorted;
      // Stale U1 data — delete and reseed
      await Promise.all(snap.docs.map(d=>deleteDoc(doc(db,colName,d.id))));
    }
  } catch(e) { console.error('loadCustomerMaster error',e); }
  // Seed Firestore with defaults
  if (u==='u2') return []; // U2 has its own master
  const defaults = DEFAULT_CUSTOMERS.map((c,i)=>({...c,order:i+1}));
  await Promise.all(defaults.map(c=>setDoc(doc(db,colName,c.id),c)));
  return defaults;
}
async function saveCustomerMaster(c,unit) { const col=(unit||'u1')==='u2'?'customer_master_u2':'customer_master'; await setDoc(doc(db,col,c.id),c); }

async function saveSchedule(year,month,custId,partNo,scheduleQty,wipQty,unit) {
  const u=unit||'u1';
  const id=`${year}_${String(month+1).padStart(2,'0')}_${custId}_${partNo.replace(/[\s'.\/]/g,'_')}`;
  await setDoc(doc(db,`customer_schedules${u==='u2'?'_u2':''}`,id),{year,month,custId,partNo,scheduleQty:Number(scheduleQty)||0,wipQty:Number(wipQty)||0,updatedAt:new Date(),updatedBy:window._currentUserName||'PPC'},{merge:true});
}
async function getSchedules(year,month,unit) {
  const u=unit||'u1';
  try {
    const q=query(collection(db,`customer_schedules${u==='u2'?'_u2':''}`),where('year','==',year));
    const snap=await getDocs(q); const r={};
    snap.forEach(d=>{
      const dat=d.data();
      if(dat.month!==month) return;
      const{custId,partNo,scheduleQty,wipQty,updatedAt,updatedBy}=dat;
      if(!r[custId])r[custId]={};
      let schedMs = null;
      try {
        if (updatedAt instanceof Date) schedMs = updatedAt.getTime();
        else if (updatedAt && typeof updatedAt.toDate==='function') schedMs = updatedAt.toDate().getTime();
        else if (updatedAt && updatedAt.seconds) schedMs = updatedAt.seconds*1000;
      } catch(e){}
      r[custId][partNo]={scheduleQty:scheduleQty||0,wipQty:wipQty||0,
        updatedAt:schedMs?new Date(schedMs):null,updatedBy:updatedBy||null};
    });
    return r;
  } catch(e){ console.error('getSchedules error',e); return {}; }
}
async function saveDailyEntry(year,month,day,custId,partNo,dispatched,unit) {
  const u=unit||'u1';
  const id=`${year}_${String(month+1).padStart(2,'0')}_${custId}_${partNo.replace(/[\s'.\/]/g,'_')}_${String(day).padStart(2,'0')}`;
  await setDoc(doc(db,`customer_daily${u==='u2'?'_u2':''}`,id),{year,month,day,custId,partNo,dispatched:Number(dispatched)||0,updatedAt:new Date(),updatedBy:window._currentUserName||'PPC'},{merge:true});
}
async function getDailyEntries(year,month,unit) {
  const u=unit||'u1';
  try {
    const q=query(collection(db,`customer_daily${u==='u2'?'_u2':''}`),where('year','==',year));
    const snap=await getDocs(q); const r={};
    snap.forEach(d=>{
      const dat=d.data();
      if(dat.month!==month) return;
      const{custId,partNo,day,dispatched,updatedAt,updatedBy}=dat;
      if(!r[custId])r[custId]={};
      if(!r[custId][partNo])r[custId][partNo]={};
      if(!r[custId][partNo])r[custId][partNo]={};
      r[custId][partNo][day]=dispatched||0;
      // Track most recent update - normalize to ms for comparison
      if(updatedAt) {
        let ms = null;
        try {
          if (updatedAt instanceof Date) ms = updatedAt.getTime();
          else if (updatedAt && typeof updatedAt.toDate==='function') ms = updatedAt.toDate().getTime();
          else if (updatedAt && updatedAt.seconds) ms = updatedAt.seconds*1000;
          else if (typeof updatedAt==='string'||typeof updatedAt==='number') ms = new Date(updatedAt).getTime();
        } catch(e){}
        if (ms && !isNaN(ms) && (!r._lastUpd || ms > r._lastUpd.ms)) {
          r._lastUpd = {ms, at: new Date(ms), by: updatedBy||'—'};
        }
      }
    });
    return r;
  } catch(e){ console.error('getDailyEntries error',e); return {}; }
}

// ─── COLOURS ──────────────────────────────────────────────────────────────────
// ─── COLOURS & STYLES ─────────────────────────────────────────────────────────
const C={bg:'#0F1117',card:'#181C2E',raised:'#1E2340',border:'#252D50',
  text:'#E6EDF3',sub:'#8892B0',green:'#22c55e',red:'#ef4444',orange:'#f97316',
  gold:'#F5A623',teal:'#00BFA6',purple:'#818cf8',blue:'#3b82f6'};

// No spinner arrows on number inputs
const numInp = {border:`1px solid ${C.border}`,borderRadius:7,padding:'7px 10px',fontSize:12,
  outline:'none',fontFamily:'inherit',background:C.raised,color:C.text,
  boxSizing:'border-box', MozAppearance:'textfield', WebkitAppearance:'none'};
const inp = {...numInp};

const fmtL = n => `₹${(n/100000).toFixed(2)}L`;
const fmtK = n => n>=1000?(n/1000).toFixed(1)+'K':Math.round(n).toLocaleString();

// ─── SCHEDULE MODAL — full management ────────────────────────────────────────
function ScheduleModal({customer,year,month,schedules,dailyData,onSave,onClose,activeUnit}){
  const ex = schedules[customer.id]||{};
  const dd = dailyData[customer.id]||{};
  const today = new Date().getDate();

  const [rows,setRows] = useState(customer.parts.map(p=>{
    const s=ex[p.partNo]||{};
    return {...p, scheduleQty:s.scheduleQty||'', wipQty:s.wipQty||'', rate:p.rate};
  }));
  const [saving,setSaving] = useState(false);
  const [tab,setTab]       = useState('schedule'); // 'schedule' | 'dispatch'
  const [selPart,setSelPart] = useState(customer.parts[0]?.partNo||'');
  const [dispDay,setDispDay] = useState(today);
  const [dispRows,setDispRows] = useState([]);
  const [addingRow,setAddingRow] = useState(false);
  const [newPart,setNewPart] = useState({partNo:'',partName:'',rate:'',scheduleQty:'',wipQty:''});

  const daysInMonth = new Date(year,month+1,0).getDate();

  // Load dispatch for selected part
  useEffect(()=>{
    const pd = (dd[selPart])||{};
    const list = Object.entries(pd).map(([d,qty])=>({day:Number(d),qty:qty||0})).filter(x=>x.qty>0).sort((a,b)=>a.day-b.day);
    setDispRows(list);
    setDispDay(today);
  },[selPart]);

  const updRow=(i,k,v)=>setRows(r=>r.map((x,j)=>j===i?{...x,[k]:v}:x));
  const delRow=(i)=>setRows(r=>r.filter((_,j)=>j!==i));

  async function saveSchedule_(){
    setSaving(true);
    await Promise.all(rows.map(r=>saveSchedule(year,month,customer.id,r.partNo,r.scheduleQty||0,r.wipQty||0)));
    const totalSch=rows.reduce((a,r)=>a+(Number(r.scheduleQty)||0),0);
    await createNotification(activeUnit||'u1',NOTIF_TYPES.CUSTOMER_SCHEDULE,{
      title:`📅 Schedule Updated — ${customer.name}`,
      message:`Total schedule: ${totalSch.toLocaleString()} pcs across ${rows.length} parts`,
      custId:customer.id,custName:customer.name,totalSch,
    });
    // Save rate changes to customer master
    const updatedParts = rows.map(r=>({partNo:r.partNo,partName:r.partName,rate:parseFloat(r.rate)||0}));
    const removedParts = customer.parts.filter(p=>!rows.find(r=>r.partNo===p.partNo));
    if(updatedParts.some((r,i)=>r.rate!==customer.parts.find(p=>p.partNo===r.partNo)?.rate)||removedParts.length){
      await saveCustomerMaster({...customer,parts:updatedParts});
    }
    onSave(); onClose(); setSaving(false);
  }

  async function saveDispatch(){
    setSaving(true);
    await Promise.all(dispRows.map(d=>saveDailyEntry(year,month,d.day,customer.id,selPart,d.qty)));
    onSave(); setSaving(false);
  }

  async function addNewPart(){
    if(!newPart.partNo.trim()) return alert('Part number required');
    const part={partNo:newPart.partNo.trim().toUpperCase(),partName:newPart.partName.trim()||newPart.partNo.trim(),rate:parseFloat(newPart.rate)||0};
    setRows(r=>[...r,{...part,scheduleQty:newPart.scheduleQty||'',wipQty:newPart.wipQty||''}]);
    setNewPart({partNo:'',partName:'',rate:'',scheduleQty:'',wipQty:''});
    setAddingRow(false);
  }

  const tabBtn=(t,lbl)=>(
    <button onClick={()=>setTab(t)} style={{padding:'8px 18px',borderRadius:0,border:'none',borderBottom:`3px solid ${tab===t?C.teal:'transparent'}`,background:'transparent',color:tab===t?C.teal:C.sub,fontWeight:tab===t?700:400,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>{lbl}</button>
  );

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:12}}>
      <div style={{background:C.card,borderRadius:16,border:`1px solid ${C.border}`,width:'100%',maxWidth:760,maxHeight:'92vh',display:'flex',flexDirection:'column'}}>
        {/* Header */}
        <div style={{background:C.raised,padding:'14px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{fontWeight:800,color:C.text,fontSize:14}}>⚙️ {customer.name}</div>
          <button onClick={onClose} style={{background:'transparent',border:'none',color:C.sub,fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          {tabBtn('schedule','📅 Schedule & Parts')}
          {tabBtn('dispatch','✏️ Dispatch History')}
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          {/* ── SCHEDULE TAB ── */}
          {tab==='schedule'&&(
            <>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:600}}>
                  <thead><tr style={{background:'#0E1830'}}>
                    {['Part No','Part Name','Rate ₹/pc','Schedule Qty','WIP Qty',''].map(h=>(
                      <th key={h} style={{padding:'9px 10px',color:C.sub,fontWeight:700,textAlign:h==='Part No'||h==='Part Name'||h===''?'left':'right',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {rows.map((r,i)=>(
                      <tr key={r.partNo} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.card:C.raised}}>
                        <td style={{padding:'7px 10px',color:C.teal,fontFamily:'monospace',fontSize:10}}>{r.partNo}</td>
                        <td style={{padding:'7px 10px'}}>
                          <input value={r.partName} onChange={e=>updRow(i,'partName',e.target.value)} style={{...numInp,width:'100%',padding:'5px 8px'}}/>
                        </td>
                        <td style={{padding:'7px 8px',width:90}}>
                          <input type="number" inputMode="numeric" value={r.rate||''} onChange={e=>updRow(i,'rate',e.target.value)} style={{...numInp,textAlign:'right',width:'100%',padding:'5px 8px',background:'#1a1000',color:C.gold}} placeholder="0"/>
                        </td>
                        <td style={{padding:'7px 8px',width:110}}>
                          <input type="number" inputMode="numeric" value={r.scheduleQty||''} onChange={e=>updRow(i,'scheduleQty',e.target.value)} style={{...numInp,textAlign:'right',width:'100%',padding:'5px 8px'}} placeholder="0"/>
                        </td>
                        <td style={{padding:'7px 8px',width:100}}>
                          <input type="number" inputMode="numeric" value={r.wipQty||''} onChange={e=>updRow(i,'wipQty',e.target.value)} style={{...numInp,textAlign:'right',width:'100%',padding:'5px 8px',background:'#160d2e'}} placeholder="0"/>
                        </td>
                        <td style={{padding:'7px 8px',textAlign:'center'}}>
                          <button onClick={()=>delRow(i)} style={{background:'#2d0c0c',border:'none',borderRadius:5,color:'#ef4444',padding:'4px 8px',cursor:'pointer',fontSize:11}}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add part row */}
              {addingRow?(
                <div style={{background:C.raised,borderRadius:8,padding:'10px 12px',marginTop:10,border:`1.5px dashed ${C.gold}`}}>
                  <div style={{fontWeight:700,fontSize:11,color:C.gold,marginBottom:8}}>Add New Part</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 80px 100px 100px',gap:8,marginBottom:8}}>
                    {[['Part No *','partNo','text'],['Part Name','partName','text'],['Rate ₹','rate','number'],['Schedule','scheduleQty','number'],['WIP','wipQty','number']].map(([lbl,key,type])=>(
                      <div key={key}>
                        <div style={{fontSize:9,color:C.sub,marginBottom:3}}>{lbl}</div>
                        <input type={type} inputMode={type==='number'?'numeric':undefined} value={newPart[key]} onChange={e=>setNewPart(p=>({...p,[key]:e.target.value}))}
                          style={{...numInp,width:'100%',padding:'5px 8px',textAlign:type==='number'?'right':'left'}} placeholder={lbl.replace(' *','')}/>
                      </div>
                    ))}
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={addNewPart} style={{padding:'6px 16px',borderRadius:7,border:'none',background:C.green,color:'#fff',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>✅ Add</button>
                    <button onClick={()=>setAddingRow(false)} style={{padding:'6px 12px',borderRadius:7,border:`1px solid ${C.border}`,background:'transparent',color:C.sub,cursor:'pointer'}}>Cancel</button>
                  </div>
                </div>
              ):(
                <button onClick={()=>setAddingRow(true)} style={{marginTop:10,padding:'7px 16px',borderRadius:8,border:`1.5px dashed ${C.border}`,background:'transparent',color:C.sub,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>+ Add Part</button>
              )}

              <div style={{display:'flex',gap:8,marginTop:16,justifyContent:'flex-end'}}>
                <button onClick={onClose} style={{padding:'8px 18px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:C.sub,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
                <button onClick={saveSchedule_} disabled={saving} style={{padding:'8px 20px',borderRadius:8,border:'none',background:C.teal,color:'#fff',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>{saving?'Saving…':'✅ Save All'}</button>
              </div>
            </>
          )}

          {/* ── DISPATCH TAB ── */}
          {tab==='dispatch'&&(
            <>
              {/* Part selector */}
              <div style={{marginBottom:14}}>
                <label style={{fontSize:10,color:C.sub,display:'block',marginBottom:4}}>Select Part</label>
                <select value={selPart} onChange={e=>setSelPart(e.target.value)} style={{...numInp,width:'100%',cursor:'pointer'}}>
                  {customer.parts.map(p=><option key={p.partNo} value={p.partNo}>{p.partNo} — {p.partName}</option>)}
                </select>
              </div>

              {/* Dispatch entries */}
              <div style={{background:C.raised,borderRadius:8,padding:12,marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:11,color:C.text,marginBottom:10}}>Dispatch entries for {selPart}</div>
                {dispRows.length===0&&<div style={{color:C.sub,fontSize:11,padding:'8px 0'}}>No dispatch entries yet</div>}
                {dispRows.map((d,i)=>(
                  <div key={d.day} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize:11,color:C.sub,minWidth:55}}>Jul {String(d.day).padStart(2,'0')}</span>
                    <input type="number" inputMode="numeric" value={d.qty||''} onChange={e=>setDispRows(r=>r.map((x,j)=>j===i?{...x,qty:e.target.value}:x))}
                      style={{...numInp,width:110,textAlign:'right',padding:'5px 8px'}} placeholder="0"/>
                    <span style={{fontSize:10,color:C.sub}}>pcs</span>
                    <button onClick={()=>setDispRows(r=>r.filter((_,j)=>j!==i))} style={{background:'#2d0c0c',border:'none',borderRadius:5,color:'#ef4444',padding:'4px 8px',cursor:'pointer',fontSize:11}}>🗑</button>
                  </div>
                ))}

                {/* Add new day */}
                <div style={{display:'flex',alignItems:'center',gap:8,marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                  <select value={dispDay} onChange={e=>setDispDay(Number(e.target.value))} style={{...numInp,width:130,cursor:'pointer',padding:'5px 8px'}}>
                    {Array.from({length:daysInMonth},(_,i)=>i+1).filter(d=>!dispRows.find(x=>x.day===d)).map(d=>(
                      <option key={d} value={d}>Jul {String(d).padStart(2,'0')}{d===today?' (Today)':''}</option>
                    ))}
                  </select>
                  <button onClick={()=>{if(!dispRows.find(x=>x.day===dispDay))setDispRows(r=>[...r,{day:dispDay,qty:''}].sort((a,b)=>a.day-b.day));}}
                    style={{padding:'6px 14px',borderRadius:7,border:`1.5px dashed ${C.border}`,background:'transparent',color:C.sub,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>+ Add Day</button>
                </div>
              </div>

              <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                <button onClick={onClose} style={{padding:'8px 18px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:C.sub,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
                <button onClick={saveDispatch} disabled={saving} style={{padding:'8px 20px',borderRadius:8,border:'none',background:C.green,color:'#fff',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>{saving?'Saving…':'✅ Save Dispatch'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DAILY ENTRY MODAL (with edit) ───────────────────────────────────────────
function DailyEntryModal({customer,year,month,dailyData,onSave,onClose,activeUnit}){
  const today=new Date().getDate();
  const monthLabel = new Date(year,month).toLocaleString('en-IN',{month:'long',year:'numeric'});
  const [day,setDay]=useState(today);
  const mk = d => customer.parts.map(p=>{const ex=((dailyData[customer.id]||{})[p.partNo]||{})[d]||0;return{...p,dispatched:ex===0?'':ex};});
  const [rows,setRows]=useState(mk(today));
  const [saving,setSaving]=useState(false);
  function loadDay(d){setDay(d);setRows(mk(d));}
  const upd=(i,v)=>setRows(r=>r.map((x,j)=>j===i?{...x,dispatched:v}:x));
  async function save(){
    setSaving(true);
    await Promise.all(rows.map(r=>saveDailyEntry(year,month,day,customer.id,r.partNo,r.dispatched||0)));
    const totalDisp=rows.reduce((a,r)=>a+(Number(r.dispatched)||0),0);
    if(totalDisp>0){
      await createNotification(activeUnit||'u1',NOTIF_TYPES.CUSTOMER_DISPATCH,{
        title:`🚚 Dispatch — ${customer.name}`,
        message:`Day ${day}: ${totalDisp.toLocaleString()} pcs across ${rows.filter(r=>r.dispatched>0).length} part(s)`,
        custId:customer.id,custName:customer.name,day,qty:totalDisp,
      });
    }
    onSave();onClose();setSaving(false);
  }
  const daysInMonth=new Date(year,month+1,0).getDate();
  // Compute today total
  const todayTotal = rows.reduce((a,r)=>a+(Number(r.dispatched)||0),0);
  const todayVal   = rows.reduce((a,r)=>a+(Number(r.dispatched)||0)*r.rate,0);
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:12}}>
      <div style={{background:C.card,borderRadius:16,border:`1px solid ${C.border}`,width:'100%',maxWidth:600,maxHeight:'95vh',overflowY:'auto'}}>
        <div style={{background:C.raised,padding:'14px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontWeight:800,color:C.text,fontSize:14}}>✏️ Daily Dispatch — {customer.name}</div>
          <button onClick={onClose} style={{background:'transparent',border:'none',color:C.sub,fontSize:20,cursor:'pointer'}}>×</button>
        </div>
        <div style={{padding:16}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
            <span style={{fontSize:12,color:C.sub}}>Date:</span>
            <select value={day} onChange={e=>loadDay(Number(e.target.value))} style={{...inp,width:160,cursor:'pointer'}}>
              {Array.from({length:daysInMonth},(_,i)=>i+1).map(d=>(
                <option key={d} value={d}>{d < 10 ? '0'+d : d} {new Date(year,month,d).toLocaleDateString('en-IN',{weekday:'short'})}{d===today?' (Today)':''}</option>
              ))}
            </select>
            {todayTotal>0&&<span style={{fontSize:11,color:C.teal,fontWeight:700}}>Total: {fmtK(todayTotal)} pcs · {fmtL(todayVal)}</span>}
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead><tr style={{background:'#0E1830'}}>
              {['Part No','Part Name','Rate ₹/pc','Dispatched Qty'].map(h=>(
                <th key={h} style={{padding:'8px 10px',color:C.sub,fontWeight:700,textAlign:h.includes('Part')?'left':'right',borderBottom:`1px solid ${C.border}`}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{rows.map((r,i)=>(
              <tr key={r.partNo} style={{borderBottom:`1px solid ${C.border}`}}>
                <td style={{padding:'7px 10px',color:C.teal,fontFamily:'monospace',fontSize:10}}>{r.partNo}</td>
                <td style={{padding:'7px 10px',color:C.text,fontSize:11}}>{r.partName}</td>
                <td style={{padding:'7px 10px',textAlign:'right',color:C.gold}}>₹{r.rate}</td>
                <td style={{padding:'7px 10px',width:140}}>
                  <input type="number" inputMode="numeric" value={r.dispatched} onChange={e=>upd(i,e.target.value)} style={{...numInp,textAlign:'right',width:'100%',background:'#0d201a'}} placeholder="0"/>
                </td>
              </tr>
            ))}</tbody>
          </table>
          <div style={{display:'flex',gap:8,marginTop:14,justifyContent:'flex-end'}}>
            <button onClick={onClose} style={{padding:'8px 18px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:C.sub,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
            <button onClick={save} disabled={saving} style={{padding:'8px 18px',borderRadius:8,border:'none',background:C.green,color:'#fff',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>{saving?'Saving…':'✅ Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SCHEDULE MASTER EDITOR ───────────────────────────────────────────────────
function ScheduleMasterEditor({customers,schedules,year,month,onSave,onClose}){
  const [search,setSearch]=useState('');
  const [editCell,setEditCell]=useState(null);
  const [vals,setVals]=useState({});
  const [rateVals,setRateVals]=useState({});
  const [localCustomers,setLocalCustomers]=useState(()=>JSON.parse(JSON.stringify(customers)));
  const [saving,setSaving]=useState(false);

  const getRateVal=(custId,partNo)=>{
    const key=`${custId}_${partNo}`;
    return rateVals[key]!==undefined?rateVals[key]:localCustomers.find(c=>c.id===custId)?.parts.find(p=>p.partNo===partNo)?.rate||0;
  };
  const setRateVal=(custId,partNo,v)=>setRateVals(prev=>({...prev,[`${custId}_${partNo}`]:v}));

  function addPart(custId){
    const pn=prompt('Part number:');
    if(!pn) return;
    const pname=prompt('Part name:') || pn;
    const rate=parseFloat(prompt('Rate ₹/pc:')||'0')||0;
    setLocalCustomers(prev=>prev.map(c=>c.id===custId?{...c,parts:[...c.parts,{partNo:pn.trim().toUpperCase(),partName:pname.trim(),rate}]}:c));
  }

  async function deletePart(custId,partNo){
    if(!window.confirm(`Delete ${partNo}?`)) return;
    const updated=localCustomers.map(c=>c.id===custId?{...c,parts:c.parts.filter(p=>p.partNo!==partNo)}:c);
    setLocalCustomers(updated);
    const cust=updated.find(c=>c.id===custId);
    await saveCustomerMaster(cust);
  }

  const filtered = localCustomers.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()));

  function getCellVal(custId,partNo,field){
    const key=`${custId}_${partNo}_${field}`;
    if(vals[key]!==undefined) return vals[key];
    return (schedules[custId]||{})[partNo]?.[field]||0;
  }
  function setCellVal(custId,partNo,field,v){
    setVals(prev=>({...prev,[`${custId}_${partNo}_${field}`]:v}));
  }

  async function saveAll(){
    setSaving(true);
    // Save rate changes to customer master
    for(const [key,rate] of Object.entries(rateVals)){
      // key = custId + '_' + partNo, custId may contain underscores
      // Find matching cust by trying each possible split point
      let foundCust=null, foundPartNo=null;
      for(const c of localCustomers){
        if(key.startsWith(c.id+'_')){
          const pn=key.slice(c.id.length+1);
          if(c.parts.some(p=>p.partNo===pn)){ foundCust=c; foundPartNo=pn; break; }
        }
      }
      if(foundCust){
        const updated={...foundCust,parts:foundCust.parts.map(p=>p.partNo===foundPartNo?{...p,rate:parseFloat(rate)||0}:p)};
        await saveCustomerMaster(updated);
      }
    }
    // Save schedule/wip changes
    const changed=Object.entries(vals);
    const groups={};
    changed.forEach(([key,v])=>{
      // key = custId + '_' + partNo + '_' + field
      // custId may have underscores — find by matching customer ids
      let custId=null, partNo=null, field=null;
      for(const c of localCustomers){
        if(key.startsWith(c.id+'_')){
          const rest=key.slice(c.id.length+1);
          const lastUs=rest.lastIndexOf('_');
          if(lastUs>0){ partNo=rest.slice(0,lastUs); field=rest.slice(lastUs+1); custId=c.id; break; }
        }
      }
      if(!custId) return;
      const gk=`${custId}||${partNo}`;
      if(!groups[gk]) groups[gk]={custId,partNo,sch:null,wip:null};
      if(field==='scheduleQty') groups[gk].sch=Number(v)||0;
      if(field==='wipQty')      groups[gk].wip=Number(v)||0;
    });
    for(const {custId,partNo,sch,wip} of Object.values(groups)){
      const ex=(schedules[custId]||{})[partNo]||{};
      await saveSchedule(year,month,custId,partNo,sch!==null?sch:ex.scheduleQty||0,wip!==null?wip:ex.wipQty||0);
    }
    setVals({}); setRateVals({});
    onSave(); setSaving(false); onClose();
  }

  const pendingCount = Object.keys(vals).length + Object.keys(rateVals).length;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:3000,display:'flex',flexDirection:'column'}}>
      {/* Header */}
      <div style={{background:'#1F3864',padding:'12px 20px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
        <button onClick={onClose} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:8,color:'#fff',padding:'6px 14px',cursor:'pointer',fontFamily:'inherit',fontSize:13}}>← Back</button>
        <div style={{flex:1}}>
          <div style={{color:'#fff',fontWeight:900,fontSize:15}}>📋 Schedule Master — {new Date(year,month).toLocaleString('en-IN',{month:'long',year:'numeric'})}</div>
          <div style={{color:'#93c5fd',fontSize:11}}>Edit schedule qty & WIP for any customer · part</div>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customer…"
          style={{...inp,width:200,background:'rgba(255,255,255,0.1)',color:'#fff',border:'1px solid rgba(255,255,255,0.2)'}}/>
        {pendingCount>0&&<span style={{background:'#f97316',color:'#fff',borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700}}>{pendingCount} changes</span>}
        <button onClick={saveAll} disabled={saving||!pendingCount} style={{padding:'8px 20px',borderRadius:8,border:'none',background:pendingCount?C.green:'#374151',color:'#fff',fontWeight:800,cursor:pendingCount?'pointer':'not-allowed',fontFamily:'inherit'}}>
          {saving?'Saving…':'✅ Save All'}
        </button>
      </div>

      {/* Table */}
      <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
        {filtered.map(c=>{
          const sch = schedules[c.id]||{};
          const totSch = c.parts.reduce((a,p)=>a+(getCellVal(c.id,p.partNo,'scheduleQty')||0),0);
          const totVal = c.parts.reduce((a,p)=>a+(getCellVal(c.id,p.partNo,'scheduleQty')||0)*p.rate,0);
          return (
            <div key={c.id} style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,marginBottom:14}}>
              <div style={{background:C.raised,padding:'10px 16px',borderRadius:'12px 12px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontWeight:800,color:C.text,fontSize:13}}>{c.name}</div>
                <div style={{display:'flex',gap:16,fontSize:11}}>
                  <span style={{color:C.sub}}>Total Sch: <span style={{color:C.teal,fontWeight:700}}>{totSch.toLocaleString()}</span></span>
                  <span style={{color:C.sub}}>Order Val: <span style={{color:C.gold,fontWeight:700}}>{fmtL(totVal)}</span></span>
                  <span style={{color:C.sub}}>ARPU: <span style={{color:C.purple,fontWeight:700}}>₹{totSch>0?(totVal/totSch).toFixed(2):0}/pc</span></span>
                </div>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead><tr style={{background:'#0E1830'}}>
                    {['Part No','Part Name','Rate ₹/pc','Schedule Qty','WIP Qty','Order Value',''].map(h=>(
                      <th key={h} style={{padding:'7px 12px',color:C.sub,fontWeight:700,textAlign:h==='Part No'||h==='Part Name'?'left':'right',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{c.parts.map((p,i)=>{
                    const schVal = getCellVal(c.id,p.partNo,'scheduleQty');
                    const wipVal = getCellVal(c.id,p.partNo,'wipQty');
                    const orderVal = (schVal||0)*p.rate;
                    const changed = vals[`${c.id}_${p.partNo}_scheduleQty`]!==undefined||vals[`${c.id}_${p.partNo}_wipQty`]!==undefined;
                    return (
                      <tr key={p.partNo} style={{background:changed?'#1a2010':i%2===0?C.card:C.raised,borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:'7px 12px',color:C.teal,fontFamily:'monospace',fontSize:10}}>{p.partNo}</td>
                        <td style={{padding:'7px 12px',color:C.text}}>{p.partName}</td>
                        <td style={{padding:'6px 8px',width:100}}>
                          <input type="number" inputMode="numeric" value={getRateVal(c.id,p.partNo)||''} placeholder="0.00" step="0.01"
                            onChange={e=>setRateVal(c.id,p.partNo,e.target.value)}
                            style={{...numInp,textAlign:'right',width:'100%',background:'#1a1000',color:C.gold}}/>
                        </td>
                        <td style={{padding:'6px 12px',width:130}}>
                          <input type="number" inputMode="numeric" value={schVal||''} placeholder="0"
                            onChange={e=>setCellVal(c.id,p.partNo,'scheduleQty',e.target.value)}
                            style={{...numInp,textAlign:'right',width:'100%',background:changed?'#0d1f08':'#0d201a'}}/>
                        </td>
                        <td style={{padding:'6px 12px',width:120}}>
                          <input type="number" inputMode="numeric" value={wipVal||''} placeholder="0"
                            onChange={e=>setCellVal(c.id,p.partNo,'wipQty',e.target.value)}
                            style={{...numInp,textAlign:'right',width:'100%',background:'#160d2e'}}/>
                        </td>
                        <td style={{padding:'7px 12px',textAlign:'right',color:C.gold,fontWeight:700}}>{fmtL(orderVal)}</td>
                        <td style={{padding:'6px 8px',textAlign:'center'}}>
                          <button onClick={()=>deletePart(c.id,p.partNo)} style={{background:'#2d0c0c',border:'none',borderRadius:5,color:'#ef4444',padding:'3px 8px',cursor:'pointer',fontSize:11}}>🗑</button>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <div style={{padding:'8px 16px',borderTop:`1px solid ${C.border}`}}>
                <button onClick={()=>addPart(c.id)} style={{padding:'5px 14px',borderRadius:7,border:`1px dashed ${C.border}`,background:'transparent',color:C.sub,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>+ Add Part</button>
              </div>
              <div style={{padding:'8px 16px',borderTop:`1px solid ${C.border}`}}>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── INSIGHTS PANEL ───────────────────────────────────────────────────────────
// ─── CUSTOMER DETAIL ──────────────────────────────────────────────────────────
function CustomerDetail({customer,schedules,dailyData,normsPercent,onBack,isPPC,onEntry,onSchedule,userProfile,schedLastUpd,dailyLastUpd,activeUnit}){
  const sch = schedules[customer.id]||{};
  const dd  = dailyData[customer.id]||{};
  const normsPct = normsPercent*100;
  const [activeTab, setActiveTab] = useState('overview');

  const custBins = BINS_DATA.filter(b=>b.custId===customer.id);

  const parts = customer.parts.map(p=>{
    const s   = sch[p.partNo]||{};
    const pd  = dd[p.partNo]||{};
    const schQ= s.scheduleQty||0;
    const wip = s.wipQty||0;
    const disp= Object.values(pd).reduce((a,v)=>a+(v||0),0);
    const bal = Math.max(0,schQ-disp);
    const dispPct = schQ>0?disp/schQ*100:0;
    const orderVal= schQ*p.rate;
    const achieved= disp*p.rate;
    const perDay  = schQ>0?schQ/23:0;
    const daysCov = perDay>0?wip/perDay:0;
    const dailyList = Object.entries(pd).map(([d,qty])=>({day:Number(d),qty:qty||0})).filter(x=>x.qty>0).sort((a,b)=>a.day-b.day);
    return {...p,schQ,wip,disp,bal,dispPct,orderVal,achieved,daysCov,dailyList};
  });

  const totSch = parts.reduce((a,p)=>a+p.schQ,0);
  const totDisp= parts.reduce((a,p)=>a+p.disp,0);
  const totBal = parts.reduce((a,p)=>a+p.bal,0);
  const totVal = parts.reduce((a,p)=>a+p.orderVal,0);
  const totAch = parts.reduce((a,p)=>a+p.achieved,0);
  const dispPct= totSch>0?totDisp/totSch*100:0;
  const backPct= Math.max(0,normsPct-dispPct);
  const normsVal= totVal*(normsPct/100);
  const backVal = Math.max(0,normsVal-totAch);
  const arpu    = totSch>0?totVal/totSch:0;
  const ragC    = dispPct>=normsPct?C.green:dispPct>=normsPct*0.6?C.orange:C.red;

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:'12px 20px',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <button onClick={onBack} style={{background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,cursor:'pointer',padding:'6px 14px',fontFamily:'inherit'}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:16}}>{customer.name}</div>
            <div style={{fontSize:11,color:C.sub}}>{parts.length} parts · ARPU ₹{arpu.toFixed(2)}/pc · Order {fmtL(totVal)}</div>
          </div>
          {isPPC&&<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <button onClick={onSchedule} style={{padding:'7px 14px',borderRadius:8,border:`1px solid #7c3aed`,background:'#160d2e',color:'#a78bfa',fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>📅 Schedule</button>
            <button onClick={onEntry} style={{padding:'7px 14px',borderRadius:8,border:`1px solid ${C.teal}`,background:'#0d2420',color:C.teal,fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>✏️ Daily Entry</button>
          </div>}
        </div>
        <div style={{display:'flex',gap:0,marginTop:10,borderBottom:`1px solid ${C.border}`}}>
          {[['overview','📊 Overview'],['bins','🗂 Bins'],['history','📈 6M History']].map(([t,l])=>(
            <button key={t} onClick={()=>setActiveTab(t)} style={{padding:'6px 18px',border:'none',borderBottom:`2px solid ${activeTab===t?C.teal:'transparent'}`,background:'transparent',color:activeTab===t?C.teal:C.sub,fontWeight:activeTab===t?700:400,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>{l}{t==='bins'&&custBins.length>0?` (${custBins.length})`:''}</button>
          ))}
        </div>
      </div>

      <div style={{padding:'16px 20px'}}>
        {activeTab==='overview'&&(<>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:16}}>
          <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:'16px 18px'}}>
            <div style={{fontWeight:700,fontSize:11,color:C.sub,letterSpacing:1,marginBottom:14}}>SCHEDULE VS DISPATCH</div>
            {[
              {l:'Schedule',  v:totSch,  co:'#4b5563'},
              {l:'Dispatched',v:totDisp, co:C.green},
              {l:'Balance',   v:totBal,  co:C.blue},
            ].map(k=>(
              <div key={k.l} style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:5}}>
                  <span style={{color:C.sub}}>{k.l}</span>
                  <span style={{fontWeight:800,color:k.co}}>{k.v.toLocaleString()}</span>
                </div>
                <div style={{background:'#0E1830',borderRadius:3,height:18,overflow:'hidden'}}>
                  <div style={{width:`${totSch>0?Math.min(k.v/totSch*100,100):0}%`,height:'100%',background:k.co}}/>
                </div>
              </div>
            ))}
          </div>
          <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:'16px 18px'}}>
            <div style={{fontWeight:700,fontSize:11,color:C.sub,letterSpacing:1,marginBottom:14}}>OVERALL PERFORMANCE</div>
            {[
              {l:'Dispatch %', v:dispPct,  co:ragC},
              {l:'Norms %',    v:normsPct, co:C.green},
              {l:'Backlog %',  v:backPct,  co:C.red},
            ].map(k=>(
              <div key={k.l} style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:5}}>
                  <span style={{color:C.sub}}>{k.l}</span>
                  <span style={{fontWeight:800,color:k.co}}>{k.v.toFixed(1)}%</span>
                </div>
                <div style={{background:'#0E1830',borderRadius:3,height:18,overflow:'hidden'}}>
                  <div style={{width:`${Math.min(k.v,100)}%`,height:'100%',background:k.co}}/>
                </div>
              </div>
            ))}
          </div>
          <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:'16px 18px'}}>
            <div style={{fontWeight:700,fontSize:11,color:C.sub,letterSpacing:1,marginBottom:14}}>VALUE PERFORMANCE</div>
            {[
              {l:'Order Value', v:fmtL(totVal),   co:C.sub},
              {l:'Norms',       v:fmtL(normsVal),  co:C.green},
              {l:'Achieved',    v:fmtL(totAch),    co:C.teal},
              {l:'Backlog',     v:fmtL(backVal),   co:C.red},
            ].map(k=>(
              <div key={k.l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:12,color:C.sub}}>{k.l}</span>
                <span style={{fontSize:13,fontWeight:800,color:k.co}}>{k.v}</span>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:10}}>
              <span style={{fontSize:12,color:C.sub}}>ARPU</span>
              <span style={{fontSize:14,fontWeight:900,color:C.gold}}>₹{arpu.toFixed(2)}/pc</span>
            </div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:'14px 16px',overflowX:'auto'}}>
            <div style={{fontWeight:700,fontSize:11,color:C.sub,letterSpacing:1,marginBottom:12}}>PART-WISE DETAILS</div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead><tr style={{background:'#0E1830'}}>
                {['Part','Schedule','Dispatched','WIP','Days Cov'].map(h=>(
                  <th key={h} style={{padding:'7px 10px',color:C.sub,fontWeight:700,textAlign:h==='Part'?'left':'right',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{parts.map((p,i)=>(
                <tr key={p.partNo} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.card:C.raised}}>
                  <td style={{padding:'8px 10px',color:C.teal,fontFamily:'monospace',fontSize:9}}>{p.partNo}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',color:C.text}}>{p.schQ.toLocaleString()}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',color:C.green,fontWeight:700}}>{p.disp.toLocaleString()}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',color:C.purple}}>{p.wip>0?p.wip.toLocaleString():<span style={{color:'#374151'}}>0</span>}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',color:C.gold}}>{p.daysCov>0?p.daysCov.toFixed(1):'—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:'14px 16px'}}>
            <div style={{fontWeight:700,fontSize:11,color:C.sub,letterSpacing:1,marginBottom:12}}>DISPATCH % VS NORMS ({normsPct.toFixed(0)}%)</div>
            {parts.filter(p=>p.schQ>0).map(p=>{
              const rc=p.dispPct>=normsPct?C.green:p.dispPct>=normsPct*0.6?C.orange:C.red;
              return (
                <div key={p.partNo} style={{marginBottom:9}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
                    <span style={{color:C.text,fontWeight:600}}>{p.partName}</span>
                    <span style={{color:rc,fontWeight:800}}>{p.dispPct.toFixed(1)}%</span>
                  </div>
                  <div style={{position:'relative',height:10,background:'#0E1830',borderRadius:3}}>
                    <div style={{width:`${Math.min(p.dispPct,100)}%`,height:'100%',background:rc,borderRadius:3}}/>
                    <div style={{position:'absolute',top:-2,left:`${Math.min(normsPct,100)}%`,height:14,width:2,background:C.gold}}/>
                  </div>
                </div>
              );
            })}
            <div style={{display:'flex',gap:16,marginTop:14,paddingTop:10,borderTop:`1px solid ${C.border}`,flexWrap:'wrap'}}>
              <span style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:C.sub}}><div style={{width:14,height:8,background:C.green,borderRadius:2}}/> On Track</span>
              <span style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:C.sub}}><div style={{width:14,height:8,background:C.orange,borderRadius:2}}/> At Risk</span>
              <span style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:C.sub}}><div style={{width:14,height:8,background:C.red,borderRadius:2}}/> Critical</span>
              <span style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:C.sub}}><div style={{width:2,height:14,background:C.gold,borderRadius:1}}/> Norms ({normsPct.toFixed(0)}%)</span>
              <span style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:C.sub}}><div style={{width:14,height:8,background:'#0E1830',borderRadius:2,border:`1px solid ${C.border}`}}/> WIP (see table)</span>
            </div>
          </div>
        </div>
        </>)}
        {activeTab==='bins'&&(
          <BinsTab custId={customer.id} custName={customer.name} custBins={custBins} userProfile={userProfile} activeUnit={activeUnit}/>
        )}
        {activeTab==='history'&&(
          <HistoryTab customer={customer} activeUnit={activeUnit}/>
        )}

      </div>
    </div>
  );
}

// ─── INSIGHTS PANEL ───────────────────────────────────────────────────────────
function InsightsPanel({customers,schedules,dailyData,normsPercent,year,month,workingDays,onClose}){
  const WORKING_DAYS = workingDays || getWorkingDaysInMonth(year,month);
  const today = new Date().getDate();
  const daysElapsed = Math.max(getWorkingDaysElapsed(year,month,today-1),1);
  const daysLeft = Math.max(WORKING_DAYS - getWorkingDaysElapsed(year,month,today), 1);
  const daysElapsedWD = Math.max(getWorkingDaysElapsed(year,month,today-1), 1); // completed days
  const normsPct = normsPercent*100;
  const [view,setView] = useState('morning'); // 'morning' | 'monthly' | 'mom'
  const [momData, setMomData]   = useState(null);  // {prevSchedules, prevDaily, prevYear, prevMonth}
  const [momLoading, setMomLoading] = useState(false);

  // Load prev month data when MoM tab is opened
  useEffect(()=>{
    if (view !== 'mom' || momData) return;
    setMomLoading(true);
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear  = month === 0 ? year - 1 : year;
    Promise.all([getSchedules(prevYear, prevMonth), getDailyEntries(prevYear, prevMonth)])
      .then(([prevSch, prevDaily])=>{
        setMomData({ prevSch, prevDaily, prevYear, prevMonth });
        setMomLoading(false);
      })
      .catch(()=>setMomLoading(false));
  },[view]);

  // ── Build customer stats ──────────────────────────────────────────────────
  const allStats = customers.map(c=>{
    const sch = schedules[c.id]||{};
    const dd  = dailyData[c.id]||{};
    const parts = c.parts.map(p=>{
      const s  = sch[p.partNo]||{};
      const pd = dd[p.partNo]||{};
      const schQ = s.scheduleQty||0;
      const disp = Object.values(pd).reduce((a,v)=>a+(v||0),0);
      // Last dispatch day
      // Keys may be strings or numbers from Firestore — normalize to numbers
      const dispDays = Object.keys(pd).map(Number).filter(d=>!isNaN(d)&&(pd[d]>0||pd[String(d)]>0));
      const lastDay  = dispDays.length ? Math.max(...dispDays) : 0;
      // Working days since last dispatch (not calendar days)
      const daysSinceLast = lastDay
        ? Math.max(0, getWorkingDaysElapsed(year, month, today) - getWorkingDaysElapsed(year, month, lastDay))
        : 999;
      return {...p,schQ,disp,bal:Math.max(0,schQ-disp),rate:p.rate,
        orderVal:schQ*p.rate,ach:disp*p.rate,
        dispPct:schQ>0?disp/schQ*100:0,lastDay,daysSinceLast};
    });
    const totSch  = parts.reduce((a,p)=>a+p.schQ,0);
    const totDisp = parts.reduce((a,p)=>a+p.disp,0);
    const totVal  = parts.reduce((a,p)=>a+p.orderVal,0);
    const totAch  = parts.reduce((a,p)=>a+p.ach,0);
    const dispPct = totSch>0?totDisp/totSch*100:0;
    const arpu    = totSch>0?totVal/totSch:0;
    const reqRate = daysLeft>0?Math.max(0,totSch-totDisp)/daysLeft:0;
    const currRate= totDisp/daysElapsed;
    const projDisp = totAch/Math.max(arpu,1) + currRate*daysLeft; // achieved qty + projected additional
    const projVal  = totAch + currRate*daysLeft*arpu;              // achieved value + projected additional value
    const valAtRisk= Math.max(0, totVal - projVal);
    const status = dispPct>=normsPct?'ok':dispPct>=normsPct*0.6?'risk':'crit';
    const stalled = parts.filter(p=>p.schQ>0&&p.daysSinceLast>=3&&p.disp<p.schQ);
    return {id:c.id,name:c.name,parts,totSch,totDisp,totVal,totAch,dispPct,arpu,
      reqRate,currRate,projDisp,projVal,valAtRisk,status,stalled,
      bal:Math.max(0,totSch-totDisp)};
  }).filter(s=>s.totSch>0);

  const grand = allStats.reduce((a,s)=>({
    sch:a.sch+s.totSch,disp:a.disp+s.totDisp,
    val:a.val+s.totVal,ach:a.ach+s.totAch
  }),{sch:0,disp:0,val:0,ach:0});
  const grandARPU    = grand.sch>0?grand.val/grand.sch:0;
  const avgDay       = grand.disp/daysElapsed;
  const reqDay       = Math.max(0,grand.sch-grand.disp)/daysLeft;
  const grandARPU_val = grand.sch>0 ? grand.val/grand.sch : 0;
  // Projection: what we've achieved + what we'll achieve at current rate for remaining days
  const projAddl     = avgDay * daysLeft * grandARPU_val;
  const projGrandVal = grand.ach + projAddl;
  const valAtRisk    = Math.max(0, grand.val - projGrandVal);
  const backlogVal   = Math.max(0, grand.val*(normsPct/100) - grand.ach);
  // Strike rate: revenue per day needed to hit 100% order value
  const strikeRate   = daysLeft>0 ? Math.max(0, grand.val-grand.ach)/daysLeft : 0;
  // Avg revenue per day achieved so far
  const avgRevDay    = daysElapsed>0 ? grand.ach/daysElapsed : 0;

  // Daily totals
  const dailyTotals={};
  customers.forEach(c=>{
    const dd=dailyData[c.id]||{};
    c.parts.forEach(p=>{
      Object.entries(dd[p.partNo]||{}).forEach(([d,q])=>{
        dailyTotals[d]=(dailyTotals[d]||0)+(q||0);
      });
    });
  });
  const dispDays = Object.keys(dailyTotals).map(Number).sort((a,b)=>a-b);
  const maxDaily = Math.max(...Object.values(dailyTotals),1);

  // Revenue concentration
  const byRev = [...allStats].sort((a,b)=>b.totAch-a.totAch);
  const totalAch = grand.ach||1;
  let cumPct=0;
  const revConc = byRev.map(s=>{cumPct+=s.totAch/totalAch*100; return {...s,revPct:s.totAch/totalAch*100,cumPct};});

  // Alerts
  const critical   = allStats.filter(s=>s.status==='crit');
  const atRisk     = allStats.filter(s=>s.status==='risk');
  const overloaded = allStats.filter(s=>s.reqRate>s.currRate*2&&s.currRate>0);
  const allStalled = allStats.flatMap(s=>s.stalled.map(p=>({...p,custName:s.name})));
  const dep2 = revConc.slice(0,2).reduce((a,s)=>a+s.revPct,0);

  const ragC = p=>p>=normsPct?C.green:p>=normsPct*0.6?C.orange:C.red;
  const statusBg = s=>s==='ok'?'#0d2010':s==='risk'?'#1a1200':'#200808';
  const statusColor = s=>s==='ok'?C.green:s==='risk'?C.orange:C.red;
  const statusLabel = s=>s==='ok'?'✅ ON TRACK':s==='risk'?'⚠ AT RISK':'🔴 CRITICAL';

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"Inter,system-ui,sans-serif",color:C.text}}>
      {/* Header */}
      <div style={{background:"#0B1628",borderBottom:`1px solid ${C.border}`,padding:"12px 20px",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,color:"#fff",padding:"6px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:13}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:16,color:"#fff"}}>📈 Dispatch Insights — {new Date(year,month).toLocaleString('en-IN',{month:'long',year:'numeric'})}</div>
            <div style={{fontSize:11,color:C.sub}}>Day {today} of {WORKING_DAYS} · {daysLeft} working days remaining</div>
          </div>
          {/* View toggle */}
          <div style={{display:"flex",background:C.raised,borderRadius:8,padding:2,border:`1px solid ${C.border}`}}>
            {[["morning","☀ Morning View"],["monthly","📅 Monthly View"],["mom","📊 MoM Compare"]].map(([v,l])=>(
              <button key={v} onClick={()=>setView(v)} style={{padding:"6px 14px",borderRadius:6,border:"none",background:view===v?"#1F3864":"transparent",color:view===v?"#fff":C.sub,fontWeight:view===v?700:400,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{padding:"16px 20px"}}>
        {/* ── KPI STRIP ─────────────────────────────────────────────────── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:16}}>
          {[
            {l:"Overall ARPU",        v:`₹${grandARPU.toFixed(0)}/pc`,           co:"#F5A623", sub:"Order value ÷ schedule qty"},
            {l:"Avg Dispatch/Day",    v:fmtK(Math.round(avgDay)),                co:C.teal,    sub:`${daysElapsed} working days elapsed`},
            {l:"Avg Revenue/Day",     v:fmtL(avgRevDay),                   co:C.green,   sub:`Achieved ÷ ${daysElapsed} days`},
            {l:"Strike Rate",         v:fmtL(strikeRate)+'/day',              co:strikeRate>avgRevDay*1.5?C.red:C.orange,
              sub:"Needed to hit 100% value", alert:strikeRate>avgRevDay*2},
            {l:"Required Qty/Day",    v:fmtK(Math.round(reqDay)),                co:reqDay>avgDay*1.5?C.red:reqDay>avgDay?C.orange:C.green,
              sub:"To clear balance", alert:reqDay>avgDay*2},
            {l:"Order Value",         v:fmtL(grand.val),                         co:C.text,    sub:"Schedule × rate"},
            {l:"Value Achieved",      v:fmtL(grand.ach),                         co:C.green,   sub:`${(grand.ach/(grand.val||1)*100).toFixed(1)}% of order`},
            {l:"Avg Backlog/Day",     v:fmtL(backlogVal/Math.max(daysElapsed,1)), co:C.red, sub:"Behind norms · per day"},
            {l:"Value at Risk",       v:fmtL(Math.max(0,grand.val-projGrandVal)), co:"#f87171", sub:"If pace stays same", alert:valAtRisk>0},
            {l:"Days Remaining",      v:`${daysLeft}d`,                           co:daysLeft<=3?C.red:daysLeft<=7?C.orange:C.blue,
              sub:"Working days left", alert:daysLeft<=3},
          ].map(k=>(
            <div key={k.l} style={{background:k.alert?'#1a0808':C.card,border:`1px solid ${k.alert?'#7f1d1d':C.border}`,borderRadius:12,padding:"12px 14px"}}>
              <div style={{fontSize:20,fontWeight:900,color:k.co}}>{k.v}</div>
              <div style={{fontSize:10,color:C.text,fontWeight:600,marginTop:2}}>{k.l}</div>
              <div style={{fontSize:9,color:C.sub,marginTop:1}}>{k.sub}</div>
            </div>
          ))}
        </div>
        {/* ── DAILY REVENUE + BACKLOG SUMMARY ─────────────────────────── */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 16px',marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:12,color:C.text,marginBottom:10}}>📅 Daily Sales Summary — {new Date(year,month).toLocaleString('en-IN',{month:'long',year:'numeric'})}</div>
          <div style={{display:'flex',gap:16,flexWrap:'wrap',fontSize:11,color:C.sub}}>
            <span>Avg qty/day: <strong style={{color:C.teal}}>{fmtK(Math.round(avgDay))}</strong></span>
            <span>Avg revenue/day: <strong style={{color:C.green}}>{fmtL(avgRevDay)}</strong></span>
            <span>Strike rate needed: <strong style={{color:strikeRate>avgRevDay*1.5?C.red:C.orange}}>{fmtL(strikeRate)}/day</strong></span>
            <span>Avg backlog/day: <strong style={{color:C.red}}>{fmtL(backlogVal/Math.max(daysElapsed,1))}</strong></span>
            <span>Total backlog qty: <strong style={{color:C.red}}>{fmtK(Math.round(Math.max(0,grand.sch-grand.disp)))}</strong></span>
          </div>
          {/* Day-wise revenue table */}
          <div style={{marginTop:10,overflowX:'auto'}}>
            <div style={{display:'flex',gap:6,minWidth:'max-content'}}>
              {Object.keys(dailyTotals).sort((a,b)=>Number(a)-Number(b)).map(d=>{
                const qty=dailyTotals[d]||0;
                const rev=qty*grandARPU_val;
                return (
                  <div key={d} style={{textAlign:'center',minWidth:42,background:C.raised,borderRadius:6,padding:'6px 4px'}}>
                    <div style={{fontSize:9,color:C.sub,marginBottom:2}}>{d}</div>
                    <div style={{fontSize:11,fontWeight:700,color:C.text}}>{fmtK(qty)}</div>
                    <div style={{fontSize:9,color:C.green}}>₹{fmtL(rev)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── MORNING VIEW ─────────────────────────────────────────────── */}
        {view==="morning"&&(<>

          {/* ALERT PANEL */}
          {(critical.length>0||overloaded.length>0||allStalled.length>0)&&(
            <div style={{background:"#1a0808",borderRadius:12,border:"1.5px solid #7f1d1d",padding:"14px 16px",marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:13,color:"#fca5a5",marginBottom:12}}>🚨 Action Required Today</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:10}}>
                {critical.length>0&&(
                  <div style={{background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:6}}>🔴 Critical — {critical.length} customers below 50% target</div>
                    {critical.map(s=>(
                      <div key={s.id} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"3px 0",borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
                        <span style={{color:"#fca5a5"}}>{s.name}</span>
                        <span style={{color:C.red,fontWeight:700}}>{s.dispPct.toFixed(0)}% · need {fmtK(Math.round(s.reqRate))}/day</span>
                      </div>
                    ))}
                  </div>
                )}
                {overloaded.length>0&&(
                  <div style={{background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.orange,marginBottom:6}}>⚡ Run Rate 2× above current pace</div>
                    {overloaded.map(s=>(
                      <div key={s.id} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"3px 0",borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
                        <span style={{color:"#fed7aa"}}>{s.name}</span>
                        <span style={{color:C.orange,fontWeight:700}}>Need {fmtK(Math.round(s.reqRate))} · avg {fmtK(Math.round(s.currRate))}/day</span>
                      </div>
                    ))}
                  </div>
                )}
                {allStalled.length>0&&(
                  <div style={{background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#f87171",marginBottom:6}}>⏸ Zero dispatch ≥3 working days</div>
                    {allStalled.slice(0,6).map((p,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"3px 0",borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
                        <span style={{color:"#fca5a5"}}>{p.custName} · {p.partNo}</span>
                        <span style={{color:C.red,fontWeight:700}}>{p.daysSinceLast>=999?'No dispatch this month':`${p.daysSinceLast>=999?'Never dispatched':`${p.daysSinceLast}d stalled`}`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* DAILY BAR CHART */}
          <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 16px",marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>Daily Dispatch — All Customers (Qty)</div>
            <div style={{fontSize:10,color:C.sub,marginBottom:12}}>Avg {fmtK(Math.round(avgDay))}/day · Required {fmtK(Math.round(reqDay))}/day to close</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:2,height:130,overflowX:"auto"}}>
              {dispDays.map(d=>{
                const qty=dailyTotals[d]||0;
                const pct=Math.round((qty/maxDaily)*100);
                const isAbove=qty>=avgDay;
                const isReq=qty>=reqDay;
                return (
                  <div key={d} style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:22,flex:1}}>
                    <div style={{fontSize:7,color:isAbove?C.green:C.orange,marginBottom:1,fontWeight:700}}>{fmtK(qty)}</div>
                    <div style={{width:"100%",height:100,display:"flex",alignItems:"flex-end"}}>
                      <div style={{width:"100%",height:`${Math.max(pct,1)}%`,background:isAbove?C.green:C.orange,borderRadius:"2px 2px 0 0",opacity:0.9}}/>
                    </div>
                    <div style={{fontSize:7,color:C.sub,marginTop:2}}>{d}</div>
                  </div>
                );
              })}
            </div>
            {/* Avg + required lines (visual only - pseudo lines with labels) */}
            <div style={{display:"flex",gap:16,marginTop:8,fontSize:9}}>
              <span style={{color:C.green}}>█ Above avg ({fmtK(Math.round(avgDay))})</span>
              <span style={{color:C.orange}}>█ Below avg</span>
              <span style={{color:C.red,marginLeft:"auto"}}>Required/day to close: {fmtK(Math.round(reqDay))}</span>
            </div>
          </div>

          {/* CUSTOMER STATUS + RUN RATE */}
          <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 16px",marginBottom:16}}>
            {/* Customer-wise projection table */}
            <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>📈 Customer-wise Month-end Projection</div>
            <div style={{border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden',marginBottom:16}}>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',gap:0,padding:'6px 12px',background:C.raised}}>
                {['Customer','Achieved','Order Value','Projected Month-end','Gap'].map(h=>(
                  <div key={h} style={{fontSize:9,fontWeight:800,color:C.sub,textTransform:'uppercase'}}>{h}</div>
                ))}
              </div>
              {allStats.map(s=>{
                const short = s.projVal < s.totVal;
                return (
                  <div key={s.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',
                    gap:0,padding:'7px 12px',borderTop:`1px solid ${C.border}`,
                    background:short?'rgba(239,68,68,0.04)':'transparent',alignItems:'center',fontSize:11}}>
                    <div style={{fontWeight:700,color:C.text,fontSize:12}}>{s.name}</div>
                    <div style={{color:C.green,fontWeight:700}}>{fmtL(s.totAch)}</div>
                    <div style={{color:C.sub}}>{fmtL(s.totVal)}</div>
                    <div style={{color:short?C.orange:C.green,fontWeight:800}}>{fmtL(s.projVal)}</div>
                    <div style={{color:short?C.red:C.green,fontWeight:700,fontSize:10}}>
                      {short?`↓ ${fmtL(s.totVal-s.projVal)} short`:'✅ On track'}
                    </div>
                  </div>
                );
              })}
              {/* Grand total row */}
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',
                gap:0,padding:'8px 12px',borderTop:`2px solid ${C.border}`,background:C.raised,fontSize:11}}>
                <div style={{fontWeight:900,color:C.text}}>TOTAL</div>
                <div style={{fontWeight:900,color:C.green}}>{fmtL(grand.ach)}</div>
                <div style={{fontWeight:900,color:C.sub}}>{fmtL(grand.val)}</div>
                <div style={{fontWeight:900,color:projGrandVal>=grand.val?C.green:C.orange}}>{fmtL(projGrandVal)}</div>
                <div style={{fontWeight:900,color:projGrandVal>=grand.val?C.green:C.red,fontSize:10}}>
                  {projGrandVal>=grand.val?'✅ On track':`↓ ${fmtL(grand.val-projGrandVal)} short`}
                </div>
              </div>
            </div>
            <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Customer Status — Run Rate vs Required</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:600}}>
                <thead><tr style={{background:"#0E1830"}}>
                  {["Customer","Status","Dispatch%","Dispatched","Balance","Curr Rate/day","Req Rate/day","Gap","Val at Risk"].map(h=>(
                    <th key={h} style={{padding:"8px 10px",color:C.sub,fontWeight:700,textAlign:h==="Customer"||h==="Status"?"left":"right",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",fontSize:10}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{[...allStats].sort((a,b)=>{
                  const so={"crit":0,"risk":1,"ok":2};
                  return (so[a.status]||0)-(so[b.status]||0)||b.valAtRisk-a.valAtRisk;
                }).map((s,i)=>{
                  const gap = s.reqRate - s.currRate;
                  const rc  = ragC(s.dispPct);
                  return (
                    <tr key={s.id} style={{background:statusBg(s.status),borderBottom:`1px solid ${C.border}`}}>
                      <td style={{padding:"8px 10px",fontWeight:700,color:C.text}}>{s.name}</td>
                      <td style={{padding:"8px 10px"}}>
                        <span style={{fontSize:9,fontWeight:700,color:statusColor(s.status),background:`${statusColor(s.status)}18`,borderRadius:4,padding:"2px 7px"}}>{statusLabel(s.status)}</span>
                      </td>
                      <td style={{padding:"8px 10px",textAlign:"right"}}>
                        <div style={{display:"flex",alignItems:"center",gap:5,justifyContent:"flex-end"}}>
                          <div style={{width:50,height:5,background:"#0E1830",borderRadius:2,overflow:"hidden"}}>
                            <div style={{width:`${Math.min(s.dispPct,100)}%`,height:"100%",background:rc}}/>
                          </div>
                          <span style={{color:rc,fontWeight:700}}>{s.dispPct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td style={{padding:"8px 10px",textAlign:"right",color:C.green}}>{fmtK(s.totDisp)}</td>
                      <td style={{padding:"8px 10px",textAlign:"right",color:C.gold}}>{fmtK(s.bal)}</td>
                      <td style={{padding:"8px 10px",textAlign:"right",color:C.teal}}>{fmtK(s.currRate.toFixed(0))}</td>
                      <td style={{padding:"8px 10px",textAlign:"right",color:gap>0?C.red:C.green,fontWeight:700}}>{fmtK(s.reqRate.toFixed(0))}</td>
                      <td style={{padding:"8px 10px",textAlign:"right",color:gap>0?"#f87171":"#4ade80",fontWeight:700}}>
                        {gap>0?`+${fmtK(gap.toFixed(0))} ↑`:`${fmtK(Math.abs(gap).toFixed(0))} ↓`}
                      </td>
                      <td style={{padding:"8px 10px",textAlign:"right",color:s.valAtRisk>0?C.red:C.sub,fontWeight:s.valAtRisk>0?700:400}}>{s.valAtRisk>0?fmtL(s.valAtRisk):"—"}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
        </>)}

        {/* ── MONTHLY VIEW ──────────────────────────────────────────────── */}
        {view==="monthly"&&(<>

          {/* PROJECTION */}
          <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 16px",marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>📊 Month-end Projection</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
              {[
                {l:"Order Value (Target)",  v:fmtL(grand.val),           co:C.text},
                {l:"Achieved So Far",        v:fmtL(grand.ach),           co:C.green},
                {l:"Projected Month-end",    v:fmtL(projGrandVal),        co:projGrandVal>=grand.val?C.green:C.orange},
                {l:"Projected Gap",          v:fmtL(Math.abs(grand.val-projGrandVal)), co:grand.val>projGrandVal?C.red:C.green,
                  prefix:grand.val>projGrandVal?"↓ Short":"↑ Excess"},
              ].map(k=>(
                <div key={k.l} style={{background:C.raised,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:9,color:C.sub,marginBottom:4}}>{k.l}</div>
                  <div style={{fontSize:20,fontWeight:900,color:k.co}}>{k.prefix?<span style={{fontSize:12}}>{k.prefix} </span>:null}{k.v}</div>
                </div>
              ))}
            </div>
            {/* Progress bar: achieved vs projected vs target */}
            <div style={{marginTop:14}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.sub,marginBottom:4}}>
                <span>₹0</span>
                <span style={{color:C.green}}>Achieved: {fmtL(grand.ach)}</span>
                <span style={{color:C.orange}}>Projected: {fmtL(projGrandVal)}</span>
                <span>{fmtL(grand.val)}</span>
              </div>
              <div style={{background:"#0E1830",borderRadius:6,height:20,overflow:"hidden",position:"relative"}}>
                <div style={{width:`${Math.min(grand.ach/grand.val*100,100)}%`,height:"100%",background:C.green}}/>
                <div style={{position:"absolute",top:0,left:`${Math.min(grand.ach/grand.val*100,100)}%`,width:`${Math.max(0,Math.min((projGrandVal-grand.ach)/grand.val*100,100-grand.ach/grand.val*100))}%`,height:"100%",background:C.orange,opacity:0.7}}/>
                <div style={{position:"absolute",top:0,left:`${Math.min(projGrandVal/grand.val*100,100)}%`,height:"100%",width:2,background:"#fff",opacity:0.5}}/>
              </div>
              <div style={{display:"flex",gap:14,marginTop:6,fontSize:9}}>
                <span style={{color:C.green}}>█ Achieved ({(grand.ach/grand.val*100).toFixed(1)}%)</span>
                <span style={{color:C.orange}}>█ Projected additional</span>
                <span style={{color:C.sub}}>| Projected end</span>
              </div>
            </div>
          </div>

          {/* ARPU TABLE + DISPATCH % side by side */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 16px"}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>ARPU by Customer (₹/pc)</div>
              {[...allStats].sort((a,b)=>b.arpu-a.arpu).map((s,i)=>{
                const arpuColor = s.arpu>150?C.green:s.arpu>75?C.orange:C.red;
                return (
                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <div style={{fontSize:9,color:C.sub,minWidth:14}}>{i+1}</div>
                    <div style={{flex:1,fontSize:10,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                    <div style={{minWidth:60}}>
                      <div style={{height:5,background:"#0E1830",borderRadius:2,overflow:"hidden"}}>
                        <div style={{width:`${Math.min(s.arpu/400*100,100)}%`,height:"100%",background:arpuColor}}/>
                      </div>
                    </div>
                    <div style={{minWidth:65,textAlign:"right",fontSize:10,fontWeight:800,color:arpuColor}}>₹{s.arpu.toFixed(0)}/pc</div>
                  </div>
                );
              })}
              <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${C.border}`,fontSize:9,color:C.sub,display:"flex",gap:12}}>
                <span style={{color:C.green}}>█ &gt;₹150</span>
                <span style={{color:C.orange}}>█ ₹75–150</span>
                <span style={{color:C.red}}>█ &lt;₹75</span>
              </div>
            </div>

            <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 16px"}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Dispatch % vs Norms ({normsPct.toFixed(0)}%)</div>
              {[...allStats].sort((a,b)=>b.dispPct-a.dispPct).map((s,i)=>{
                const rc=ragC(s.dispPct);
                const behind=normsPct>s.dispPct;
                return (
                  <div key={s.id} style={{marginBottom:9}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2}}>
                      <span style={{color:C.text}}>{s.name}{behind?" ⚠":""}</span>
                      <span style={{color:rc,fontWeight:700}}>{s.dispPct.toFixed(1)}%</span>
                    </div>
                    <div style={{position:"relative",height:8,background:"#0E1830",borderRadius:3}}>
                      <div style={{width:`${Math.min(s.dispPct,100)}%`,height:"100%",background:rc,borderRadius:3}}/>
                      <div style={{position:"absolute",top:-2,left:`${Math.min(normsPct,100)}%`,height:12,width:2,background:C.gold}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* REVENUE CONCENTRATION */}
          <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:13}}>Revenue Concentration</div>
              {dep2>50&&<span style={{background:"#7c2d12",color:"#fed7aa",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700}}>⚠ Top 2 customers = {dep2.toFixed(0)}% of revenue — dependency risk</span>}
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}>
                <thead><tr style={{background:"#0E1830"}}>
                  {["Rank","Customer","Revenue (₹L)","% Share","Cumulative%","ARPU","Dispatched"].map(h=>(
                    <th key={h} style={{padding:"8px 10px",color:C.sub,fontWeight:700,textAlign:h==="Customer"?"left":"right",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",fontSize:10}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{revConc.map((s,i)=>(
                  <tr key={s.id} style={{borderBottom:`1px solid ${C.border}`,background:i<2?"#16130a":i%2===0?C.card:C.raised}}>
                    <td style={{padding:"8px 10px",textAlign:"right",color:i<2?C.gold:C.sub,fontWeight:i<2?700:400}}>#{i+1}{i<2?"⭐":""}</td>
                    <td style={{padding:"8px 10px",fontWeight:600,color:C.text}}>{s.name}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:C.teal,fontWeight:700}}>{fmtL(s.totAch)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right"}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,justifyContent:"flex-end"}}>
                        <div style={{width:50,height:5,background:"#0E1830",borderRadius:2}}>
                          <div style={{width:`${Math.min(s.revPct,100)}%`,height:"100%",background:i<2?C.gold:C.teal}}/>
                        </div>
                        <span style={{color:i<2?C.gold:C.text,fontWeight:i<2?700:400}}>{s.revPct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:C.sub}}>{s.cumPct.toFixed(1)}%</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:s.arpu>150?C.green:s.arpu>75?C.orange:C.red,fontWeight:700}}>₹{s.arpu.toFixed(0)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:C.sub}}>{fmtK(s.totDisp)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          {/* FULL VALUE TABLE */}
          <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 16px"}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Full Value Analysis</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:700}}>
                <thead><tr style={{background:"#0E1830"}}>
                  {["Customer","Schedule","Dispatched","Balance","Dispatch%","Order Val","Achieved","Backlog","Val@Risk","ARPU"].map(h=>(
                    <th key={h} style={{padding:"8px 10px",color:C.sub,fontWeight:700,textAlign:h==="Customer"?"left":"right",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",fontSize:10}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {[...allStats].sort((a,b)=>b.totVal-a.totVal).map((s,i)=>{
                    const backV = Math.max(0,s.totVal*(normsPct/100)-s.totAch);
                    const rc    = ragC(s.dispPct);
                    return (
                      <tr key={s.id} style={{background:statusBg(s.status),borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:"8px 10px",fontWeight:700,color:C.text}}>{s.name}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:C.sub}}>{fmtK(s.totSch)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:C.green}}>{fmtK(s.totDisp)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:C.gold}}>{fmtK(s.bal)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:rc,fontWeight:700}}>{s.dispPct.toFixed(1)}%</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:C.text}}>{fmtL(s.totVal)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:C.teal}}>{fmtL(s.totAch)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:C.orange}}>{fmtL(backV)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:s.valAtRisk>0?"#f87171":C.sub,fontWeight:s.valAtRisk>0?700:400}}>{s.valAtRisk>0?fmtL(s.valAtRisk):"—"}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:s.arpu>150?C.green:s.arpu>75?C.orange:C.red,fontWeight:700}}>₹{s.arpu.toFixed(0)}</td>
                      </tr>
                    );
                  })}
                  {/* Grand total row */}
                  <tr style={{background:"#1F3864",fontWeight:800}}>
                    <td style={{padding:"8px 10px",color:"#fff"}}>TOTAL</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:"#fff"}}>{fmtK(grand.sch)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:"#4ade80"}}>{fmtK(grand.disp)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:C.gold}}>{fmtK(grand.sch-grand.disp)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:ragC(grand.sch>0?grand.disp/grand.sch*100:0)}}>{grand.sch>0?(grand.disp/grand.sch*100).toFixed(1):0}%</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:C.gold}}>{fmtL(grand.val)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:C.teal}}>{fmtL(grand.ach)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:C.orange}}>{fmtL(backlogVal)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:"#f87171"}}>{fmtL(Math.max(0,grand.val-projGrandVal))}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:"#F5A623"}}>₹{grandARPU.toFixed(0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </>)}

        {/* ── MoM COMPARISON VIEW ──────────────────────────────────────── */}
        {view==="mom"&&(<>
          {momLoading && (
            <div style={{textAlign:'center',padding:60,color:C.sub,fontSize:14}}>⏳ Loading previous month data…</div>
          )}
          {!momLoading && momData && (()=>{
            const prevLabel = new Date(momData.prevYear, momData.prevMonth).toLocaleString('en-IN',{month:'long',year:'numeric'});
            const currLabel = new Date(year,month).toLocaleString('en-IN',{month:'long',year:'numeric'});

            // Build stats for both months per customer per part
            const custComps = customers.map(cust=>{
              const currSch  = schedules[cust.id]||{};
              const currDD   = dailyData[cust.id]||{};
              const prevSch  = momData.prevSch[cust.id]||{};
              const prevDD   = momData.prevDaily[cust.id]||{};

              // All part numbers that appear in either month
              const allParts = [...new Set([...Object.keys(currSch),...Object.keys(prevSch)])];

              const parts = allParts.map(partNo=>{
                const cp  = cust.parts.find(p=>p.partNo===partNo)||{};
                const rate = cp.rate||0;

                const cSch  = (currSch[partNo]?.scheduleQty)||0;
                const cDisp = Object.values(currDD[partNo]||{}).reduce((a,v)=>a+(v||0),0);
                const cVal  = cSch*rate;
                const cAch  = cDisp*rate;

                const pSch  = (prevSch[partNo]?.scheduleQty)||0;
                const pDisp = Object.values(prevDD[partNo]||{}).reduce((a,v)=>a+(v||0),0);
                const pVal  = pSch*rate;
                const pAch  = pDisp*rate;

                const schDelta  = cSch  - pSch;
                const dispDelta = cDisp - pDisp;
                const valDelta  = cVal  - pVal;
                const achDelta  = cAch  - pAch;

                const isNew     = pSch===0 && cSch>0;
                const isDropped = cSch===0 && pSch>0;

                return {partNo, rate, cp,
                  cSch, cDisp, cVal, cAch,
                  pSch, pDisp, pVal, pAch,
                  schDelta, dispDelta, valDelta, achDelta,
                  isNew, isDropped};
              });

              const cTotSch  = parts.reduce((a,p)=>a+p.cSch,0);
              const pTotSch  = parts.reduce((a,p)=>a+p.pSch,0);
              const cTotDisp = parts.reduce((a,p)=>a+p.cDisp,0);
              const pTotDisp = parts.reduce((a,p)=>a+p.pDisp,0);
              const cTotVal  = parts.reduce((a,p)=>a+p.cVal,0);
              const pTotVal  = parts.reduce((a,p)=>a+p.pVal,0);
              const cTotAch  = parts.reduce((a,p)=>a+p.cAch,0);
              const pTotAch  = parts.reduce((a,p)=>a+p.pAch,0);
              const newParts     = parts.filter(p=>p.isNew);
              const droppedParts = parts.filter(p=>p.isDropped);
              const activeParts  = parts.filter(p=>!p.isNew&&!p.isDropped&&(p.cSch>0||p.pSch>0));

              return {id:cust.id, name:cust.name, parts, activeParts, newParts, droppedParts,
                cTotSch, pTotSch, cTotDisp, pTotDisp,
                cTotVal, pTotVal, cTotAch, pTotAch,
                schDelta:cTotSch-pTotSch, valDelta:cTotVal-pTotVal, achDelta:cTotAch-pTotAch};
            }).filter(c=>c.cTotSch>0||c.pTotSch>0);

            // Grand totals
            const gCurrSch = custComps.reduce((a,c)=>a+c.cTotSch,0);
            const gPrevSch = custComps.reduce((a,c)=>a+c.pTotSch,0);
            const gCurrVal = custComps.reduce((a,c)=>a+c.cTotVal,0);
            const gPrevVal = custComps.reduce((a,c)=>a+c.pTotVal,0);
            const gCurrAch = custComps.reduce((a,c)=>a+c.cTotAch,0);
            const gPrevAch = custComps.reduce((a,c)=>a+c.pTotAch,0);

            // Top movers by value delta
            const allPartMoves = custComps.flatMap(c=>c.parts.map(p=>({...p,custName:c.name})));
            const topGainers = [...allPartMoves].sort((a,b)=>b.valDelta-a.valDelta).filter(p=>p.valDelta>0).slice(0,5);
            const topLosers  = [...allPartMoves].sort((a,b)=>a.valDelta-b.valDelta).filter(p=>p.valDelta<0).slice(0,5);
            const newAllParts = allPartMoves.filter(p=>p.isNew);
            const drpAllParts = allPartMoves.filter(p=>p.isDropped);

            const deltaColor = v => v>0?'#4ade80':v<0?'#f87171':'#94a3b8';
            const deltaArrow = v => v>0?'▲':v<0?'▼':'—';
            const fmtDelta = v => `${v>0?'+':''}${fmtK(Math.round(v))}`;
            const fmtDeltaL = v => `${v>0?'+':''}${fmtL(Math.abs(v))}`;

            return (<>

              {/* Summary strip */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10,marginBottom:16}}>
                {[
                  {l:'Schedule Volume',  curr:gCurrSch,    prev:gPrevSch,    fmt:v=>fmtK(v),     unit:'pcs'},
                  {l:'Order Value',      curr:gCurrVal,    prev:gPrevVal,    fmt:v=>fmtL(v),     unit:''},
                  {l:'Achieved Value',   curr:gCurrAch,    prev:gPrevAch,    fmt:v=>fmtL(v),     unit:''},
                  {l:'Active Customers', curr:custComps.filter(c=>c.cTotSch>0).length,
                                         prev:custComps.filter(c=>c.pTotSch>0).length, fmt:v=>`${v}`,unit:''},
                  {l:'New Parts',        curr:newAllParts.length, prev:0,    fmt:v=>`${v}`,      unit:''},
                  {l:'Dropped Parts',    curr:0, prev:drpAllParts.length,    fmt:v=>`${v}`,      unit:''},
                ].map(k=>{
                  const delta = k.curr - k.prev;
                  return (
                    <div key={k.l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 14px'}}>
                      <div style={{fontSize:10,color:C.sub,fontWeight:700,textTransform:'uppercase',marginBottom:6}}>{k.l}</div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
                        <div>
                          <div style={{fontSize:9,color:C.sub}}>{prevLabel}</div>
                          <div style={{fontSize:13,fontWeight:700,color:C.sub}}>{k.fmt(k.prev)}</div>
                        </div>
                        <div style={{fontSize:16,color:deltaColor(delta),fontWeight:900}}>{deltaArrow(delta)}</div>
                        <div>
                          <div style={{fontSize:9,color:C.sub}}>{currLabel}</div>
                          <div style={{fontSize:15,fontWeight:900,color:C.text}}>{k.fmt(k.curr)}</div>
                        </div>
                      </div>
                      <div style={{marginTop:6,fontSize:11,fontWeight:800,color:deltaColor(delta)}}>
                        {delta>0?'+':''}{k.fmt(delta)} {k.unit} {delta>0?'increase':delta<0?'decrease':'no change'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Top Gainers & Losers */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div style={{background:C.card,border:'1px solid #14532d',borderRadius:12,padding:'14px 16px'}}>
                  <div style={{fontWeight:800,fontSize:13,color:'#4ade80',marginBottom:10}}>▲ Top Gainers — by Order Value</div>
                  {topGainers.length===0?<div style={{color:C.sub,fontSize:12}}>No gainers this month</div>:
                  topGainers.map((p,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:`1px solid ${C.border}`}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:C.text}}>{p.custName}</div>
                        <div style={{fontSize:10,color:C.sub}}>{p.partNo} · ₹{p.rate}/pc</div>
                        <div style={{fontSize:10,color:C.sub}}>{fmtK(p.pSch)} → {fmtK(p.cSch)} pcs schedule</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:14,fontWeight:900,color:'#4ade80'}}>+{fmtL(p.valDelta)}</div>
                        <div style={{fontSize:10,color:C.sub}}>value change</div>
                        {p.isNew&&<div style={{fontSize:9,background:'#14532d',color:'#4ade80',borderRadius:4,padding:'1px 6px',marginTop:2}}>NEW PART</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{background:C.card,border:'1px solid #7f1d1d',borderRadius:12,padding:'14px 16px'}}>
                  <div style={{fontWeight:800,fontSize:13,color:'#f87171',marginBottom:10}}>▼ Top Losers — by Order Value</div>
                  {topLosers.length===0?<div style={{color:C.sub,fontSize:12}}>No losers this month</div>:
                  topLosers.map((p,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:`1px solid ${C.border}`}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:C.text}}>{p.custName}</div>
                        <div style={{fontSize:10,color:C.sub}}>{p.partNo} · ₹{p.rate}/pc</div>
                        <div style={{fontSize:10,color:C.sub}}>{fmtK(p.pSch)} → {fmtK(p.cSch)} pcs schedule</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:14,fontWeight:900,color:'#f87171'}}>{fmtL(p.valDelta)}</div>
                        <div style={{fontSize:10,color:C.sub}}>value change</div>
                        {p.isDropped&&<div style={{fontSize:9,background:'#7f1d1d',color:'#f87171',borderRadius:4,padding:'1px 6px',marginTop:2}}>DROPPED</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* New & Dropped parts */}
              {(newAllParts.length>0||drpAllParts.length>0)&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                  {newAllParts.length>0&&(
                    <div style={{background:'#0a1f12',border:'1px solid #14532d',borderRadius:12,padding:'14px 16px'}}>
                      <div style={{fontWeight:800,fontSize:12,color:'#4ade80',marginBottom:8}}>✨ New Parts Added in {currLabel}</div>
                      {newAllParts.map((p,i)=>(
                        <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,padding:'4px 0',borderBottom:`1px solid ${C.border}`}}>
                          <span style={{color:C.text}}>{p.custName} · <span style={{color:'#4ade80',fontWeight:700}}>{p.partNo}</span></span>
                          <span style={{color:C.sub}}>{fmtK(p.cSch)} pcs · {fmtL(p.cVal)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {drpAllParts.length>0&&(
                    <div style={{background:'#1a0808',border:'1px solid #7f1d1d',borderRadius:12,padding:'14px 16px'}}>
                      <div style={{fontWeight:800,fontSize:12,color:'#f87171',marginBottom:8}}>❌ Parts Dropped from {prevLabel}</div>
                      {drpAllParts.map((p,i)=>(
                        <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,padding:'4px 0',borderBottom:`1px solid ${C.border}`}}>
                          <span style={{color:C.text}}>{p.custName} · <span style={{color:'#f87171',fontWeight:700}}>{p.partNo}</span></span>
                          <span style={{color:C.sub}}>{fmtK(p.pSch)} pcs · {fmtL(p.pVal)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Customer-wise table */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 16px',marginBottom:16}}>
                <div style={{fontWeight:800,fontSize:13,marginBottom:12}}>Customer-wise Comparison — {prevLabel} vs {currLabel}</div>
                <div style={{overflowX:'auto'}}>
                  <table style={{borderCollapse:'collapse',width:'100%',fontSize:11}}>
                    <thead>
                      <tr style={{background:'#1F3864'}}>
                        {['Customer','Sched Qty','','Sched Qty Δ','Order Value','','Order Val Δ','Achieved','','Achieved Δ','Variety'].map((h,i)=>(
                          <th key={i} style={{padding:'7px 8px',color:'#fff',fontWeight:700,textAlign:i===0?'left':'center',whiteSpace:'nowrap'}}>
                            {h===''?<span style={{fontSize:9,opacity:0.6}}>{i<=3?prevLabel+' → '+currLabel:i<=6?'':''}</span>:h}
                          </th>
                        ))}
                      </tr>
                      <tr style={{background:'#0f1e38'}}>
                        <td style={{padding:'4px 8px',color:C.sub,fontSize:9}}></td>
                        <td style={{padding:'4px 8px',color:C.sub,fontSize:9,textAlign:'center'}}>{prevLabel}</td>
                        <td style={{padding:'4px 8px',color:C.sub,fontSize:9,textAlign:'center'}}>{currLabel}</td>
                        <td style={{padding:'4px 8px',color:C.sub,fontSize:9,textAlign:'center'}}>Change</td>
                        <td style={{padding:'4px 8px',color:C.sub,fontSize:9,textAlign:'center'}}>{prevLabel}</td>
                        <td style={{padding:'4px 8px',color:C.sub,fontSize:9,textAlign:'center'}}>{currLabel}</td>
                        <td style={{padding:'4px 8px',color:C.sub,fontSize:9,textAlign:'center'}}>Change</td>
                        <td style={{padding:'4px 8px',color:C.sub,fontSize:9,textAlign:'center'}}>{prevLabel}</td>
                        <td style={{padding:'4px 8px',color:C.sub,fontSize:9,textAlign:'center'}}>{currLabel}</td>
                        <td style={{padding:'4px 8px',color:C.sub,fontSize:9,textAlign:'center'}}>Change</td>
                        <td style={{padding:'4px 8px',color:C.sub,fontSize:9,textAlign:'center'}}>+New / -Drop</td>
                      </tr>
                    </thead>
                    <tbody>
                      {custComps.sort((a,b)=>b.valDelta-a.valDelta).map((c,i)=>{
                        const bg = i%2===0?'transparent':'rgba(255,255,255,0.02)';
                        return (
                          <tr key={c.id} style={{background:bg}}>
                            <td style={{padding:'7px 8px',fontWeight:700,color:C.text}}>{c.name}</td>
                            <td style={{padding:'7px 8px',textAlign:'center',color:C.sub}}>{fmtK(c.pTotSch)}</td>
                            <td style={{padding:'7px 8px',textAlign:'center',color:C.text,fontWeight:700}}>{fmtK(c.cTotSch)}</td>
                            <td style={{padding:'7px 8px',textAlign:'center',fontWeight:800,color:deltaColor(c.schDelta)}}>{deltaArrow(c.schDelta)} {fmtDelta(c.schDelta)}</td>
                            <td style={{padding:'7px 8px',textAlign:'center',color:C.sub}}>{fmtL(c.pTotVal)}</td>
                            <td style={{padding:'7px 8px',textAlign:'center',color:C.text,fontWeight:700}}>{fmtL(c.cTotVal)}</td>
                            <td style={{padding:'7px 8px',textAlign:'center',fontWeight:800,color:deltaColor(c.valDelta)}}>{deltaArrow(c.valDelta)} {fmtDeltaL(c.valDelta)}</td>
                            <td style={{padding:'7px 8px',textAlign:'center',color:C.sub}}>{fmtL(c.pTotAch)}</td>
                            <td style={{padding:'7px 8px',textAlign:'center',color:C.text,fontWeight:700}}>{fmtL(c.cTotAch)}</td>
                            <td style={{padding:'7px 8px',textAlign:'center',fontWeight:800,color:deltaColor(c.achDelta)}}>{deltaArrow(c.achDelta)} {fmtDeltaL(c.achDelta)}</td>
                            <td style={{padding:'7px 8px',textAlign:'center',fontSize:10}}>
                              {c.newParts.length>0&&<span style={{color:'#4ade80',fontWeight:700}}>+{c.newParts.length} </span>}
                              {c.droppedParts.length>0&&<span style={{color:'#f87171',fontWeight:700}}>-{c.droppedParts.length}</span>}
                              {c.newParts.length===0&&c.droppedParts.length===0&&<span style={{color:C.sub}}>—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:'#1F3864',fontWeight:800}}>
                        <td style={{padding:'8px',color:'#fff'}}>TOTAL</td>
                        <td style={{padding:'8px',textAlign:'center',color:C.sub}}>{fmtK(gPrevSch)}</td>
                        <td style={{padding:'8px',textAlign:'center',color:'#fff'}}>{fmtK(gCurrSch)}</td>
                        <td style={{padding:'8px',textAlign:'center',color:deltaColor(gCurrSch-gPrevSch),fontWeight:900}}>{deltaArrow(gCurrSch-gPrevSch)} {fmtDelta(gCurrSch-gPrevSch)}</td>
                        <td style={{padding:'8px',textAlign:'center',color:C.sub}}>{fmtL(gPrevVal)}</td>
                        <td style={{padding:'8px',textAlign:'center',color:'#fff'}}>{fmtL(gCurrVal)}</td>
                        <td style={{padding:'8px',textAlign:'center',color:deltaColor(gCurrVal-gPrevVal),fontWeight:900}}>{deltaArrow(gCurrVal-gPrevVal)} {fmtDeltaL(gCurrVal-gPrevVal)}</td>
                        <td style={{padding:'8px',textAlign:'center',color:C.sub}}>{fmtL(gPrevAch)}</td>
                        <td style={{padding:'8px',textAlign:'center',color:'#4ade80'}}>{fmtL(gCurrAch)}</td>
                        <td style={{padding:'8px',textAlign:'center',color:deltaColor(gCurrAch-gPrevAch),fontWeight:900}}>{deltaArrow(gCurrAch-gPrevAch)} {fmtDeltaL(gCurrAch-gPrevAch)}</td>
                        <td style={{padding:'8px',textAlign:'center',color:'#fff'}}>
                          +{newAllParts.length} / -{drpAllParts.length}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>);
          })()}
        </>)}
      </div>
    </div>
  );
}

// ─── BINS TAB ─────────────────────────────────────────────────────────────────
function BinsChart({chart, lastUpdatedInfo}){
  const {AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer} = require('recharts');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const allDays = Array.from({length:31},(_,i)=>i+1);
  const activePts = allDays
    .map(d=>({d, v:chart.daily[d]??null}))
    .filter(p=>p.v!==null)
    .map(p=>({
      date: new Date(year,month,p.d).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}),
      Received: p.v,
      Norm: chart.normPerDay,
      day: p.d,
    }));

  const total = activePts.reduce((a,p)=>a+p.Received,0);
  const avg = activePts.length>0 ? Math.round(total/activePts.length) : 0;
  const shortDays = activePts.filter(p=>p.Received<chart.normPerDay).length;
  const status = avg >= chart.normPerDay ? 'ok' : avg >= chart.normPerDay*0.7 ? 'warn' : 'crit';
  const statusColor = status==='ok'?C.green:status==='warn'?C.orange:C.red;

  const CustomTooltip = ({active,payload,label})=>{
    if(!active||!payload||!payload.length) return null;
    const rcv = payload.find(p=>p.dataKey==='Received');
    const nrm = payload.find(p=>p.dataKey==='Norm');
    const isShort = rcv&&rcv.value<chart.normPerDay;
    return (
      <div style={{background:'rgba(15,17,23,0.97)',border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 12px'}}>
        <div style={{fontSize:11,color:C.sub,marginBottom:4}}>{label}</div>
        {rcv&&<div style={{fontSize:14,fontWeight:800,color:isShort?C.red:C.green}}>{rcv.value} bins</div>}
        {nrm&&<div style={{fontSize:10,color:'#3b9ede'}}>Norm: {nrm.value}</div>}
        {isShort&&rcv&&<div style={{fontSize:10,color:C.red}}>Short by {chart.normPerDay-rcv.value}</div>}
      </div>
    );
  };

  return (
    <div style={{background:C.card,borderRadius:12,border:`1.5px solid ${status==='crit'?C.red:status==='warn'?C.orange:C.border}`,padding:'16px',marginBottom:12}}>
      {lastUpdatedInfo?.at&&<div style={{fontSize:10,color:C.sub,marginBottom:6}}>
        🕐 Updated {new Date(lastUpdatedInfo.at*1000).toLocaleDateString('en-IN',{day:'numeric',month:'short'})} by {lastUpdatedInfo.by||'—'}
      </div>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <div>
          <div style={{fontWeight:800,fontSize:14,color:C.text}}>{chart.name}</div>
          <div style={{display:'flex',gap:12,marginTop:4,fontSize:11,flexWrap:'wrap',color:C.sub}}>
            <span style={{color:'#3b9ede'}}>Norm: <b>{chart.normPerDay}/day</b></span>
            <span style={{color:statusColor}}>Avg: <b>{avg}/day</b></span>
            <span>Total dispatched: <b>{total}</b></span>
          </div>
        </div>
        <div>
          {status==='crit'&&<span style={{background:'rgba(127,29,29,0.5)',color:'#fca5a5',borderRadius:6,padding:'4px 10px',fontSize:11,fontWeight:800}}>🔴 CRITICAL — {shortDays} days short</span>}
          {status==='warn'&&<span style={{background:'rgba(124,45,18,0.5)',color:'#fed7aa',borderRadius:6,padding:'4px 10px',fontSize:11,fontWeight:800}}>⚠ AT RISK — {shortDays} days short</span>}
          {status==='ok'&&<span style={{background:'rgba(20,83,45,0.5)',color:'#86efac',borderRadius:6,padding:'4px 10px',fontSize:11,fontWeight:800}}>✅ ON TRACK</span>}
        </div>
      </div>

      {activePts.length===0?(
        <div style={{textAlign:'center',padding:'40px 0',color:C.sub,fontSize:12}}>No data entered yet — click Edit Bins Data to add</div>
      ):(
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={activePts} margin={{top:5,right:10,bottom:5,left:10}}>
            <defs>
              <linearGradient id={`binsGrad_${chart.label.replace(/[^a-z0-9]/gi,'_')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id={`normGrad_${chart.label.replace(/[^a-z0-9]/gi,'_')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
            <XAxis dataKey="date" tick={{fontSize:9,fill:C.sub}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:9,fill:C.sub}} axisLine={false} tickLine={false} width={30}/>
            <Tooltip content={<CustomTooltip/>}/>
            <Area type="monotone" dataKey="Norm" stroke="#3b82f6" fill={`url(#normGrad_${chart.label.replace(/[^a-z0-9]/gi,'_')})`} strokeWidth={2} strokeDasharray="5 4" dot={false}/>
            <Area type="monotone" dataKey="Received" stroke="#22c55e" fill={`url(#binsGrad_${chart.label.replace(/[^a-z0-9]/gi,'_')})`} strokeWidth={2.5} dot={{r:3,fill:'#22c55e',stroke:'#0a0d16',strokeWidth:1}}
              activeDot={{r:5,fill:'#22c55e'}}/>
          </AreaChart>
        </ResponsiveContainer>
      )}

      <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:8}}>
        {[['#22c55e','Received'],['#3b82f6','Norm (dashed)']].map(([c,l])=>(
          <div key={l} style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:20,height:3,background:c,borderRadius:2}}/>
            <span style={{fontSize:11,color:C.sub}}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BinsTab({custId, custName, custBins, userProfile, activeUnit}){
  const custCharts = BINS_CHARTS.filter(c=>c.custId===custId);
  const today = new Date().getDate();
  const _now = new Date();
  const year=_now.getFullYear(), month=_now.getMonth();
  const [liveDaily, setLiveDaily] = useState({});
  const [lastUpdated, setLastUpdated] = useState({});

  // Load this month's bins data from Firestore
  useEffect(()=>{
    if (!custId||custCharts.length===0) return;
    import('firebase/firestore').then(({collection,onSnapshot})=>{
      import('../firebase').then(({db})=>{
        const q = collection(db,`bins_daily_${custId}`);
        const unsub = onSnapshot(q, snap=>{
          const daily = {};
          const lu = {};
          snap.docs.forEach(d=>{
            const data = d.data();
            if (data.year!==year||data.month!==month) return; // client-side filter
            if (!daily[data.chartLabel]) daily[data.chartLabel] = {};
            daily[data.chartLabel][data.day] = data.qty;
            // Track latest update per chart
            if (!lu[data.chartLabel]||data.updatedAt?.seconds>lu[data.chartLabel].at) {
              lu[data.chartLabel] = {at:data.updatedAt?.seconds, by:data.updatedBy||'—'};
            }
          });
          setLiveDaily(daily);
          setLastUpdated(lu);
        });
        return ()=>unsub();
      });
    });
  },[custId,year,month]);

  const [entryChart,setEntryChart] = useState(null);
  const [entryRows, setEntryRows] = useState([]);
  const [saving,setSaving] = useState(false);

  // Merge live Firestore data with static chart definitions
  const mergedCharts = custCharts.map(c=>({
    ...c,
    daily: liveDaily[c.label]||{},
  }));

  function openEntry(chart){
    const rows = Array.from({length:new Date(year,month+1,0).getDate()},(_,i)=>{
      const d=i+1;
      const merged = mergedCharts.find(c=>c.label===chart.label)||chart;
      return {day:d, qty:merged.daily[d]!=null?merged.daily[d]:''};  // 0 is valid
    }).filter(r=>r.qty!==''||r.day<=today);
    setEntryRows(rows);
    setEntryChart(chart);
  }

  async function saveEntry(){
    if(!entryChart) return;
    setSaving(true);
    try {
      const {setDoc,doc} = await import('firebase/firestore');
      const {db} = await import('../firebase');
      await Promise.all(entryRows.filter(r=>r.qty!==''&&r.qty!==null&&r.qty!==undefined).map(r=>
        setDoc(doc(db,`bins_daily_${custId}`,`${year}_${String(month+1).padStart(2,'0')}_${entryChart.label.replace(/[\s()\/]/g,'_')}_${String(r.day).padStart(2,'0')}`),
          {year,month,day:r.day,custId,chartLabel:entryChart.label,qty:Number(r.qty)||0,updatedAt:new Date(),updatedBy:userProfile?.name||'PPC'},{merge:true})
      ));
      const shortDays = entryRows.filter(r=>r.qty!==''&&Number(r.qty)>0&&Number(r.qty)<entryChart.normPerDay);
      if(shortDays.length>0){
        await createNotification(activeUnit||'u1',NOTIF_TYPES.BINS_SHORTAGE,{
          title:`📭 Bins Shortage — ${entryChart.name}`,
          message:`${shortDays.length} day(s) below norm of ${entryChart.normPerDay}/day: ${shortDays.slice(0,3).map(r=>`${new Date(year,month,r.day).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}(${r.qty})`).join(', ')}`,
          chartLabel:entryChart.label,custId,normPerDay:entryChart.normPerDay,
        });
      }
    } catch(e){alert(e.message);}
    setSaving(false);
    setEntryChart(null);
  }

  // Summary
  const totalShortDays = mergedCharts.reduce((a,c)=>{
    return a+Object.entries(c.daily).filter(([,v])=>v<c.normPerDay).length;
  },0);
  const criticalCharts = mergedCharts.filter(c=>c.avgPerDay<c.normPerDay*0.7);

  if(custBins.length===0&&mergedCharts.length===0)
    return <div style={{textAlign:'center',padding:48,color:C.sub}}>No bins data for {custName}</div>;

  return (
    <div>
      {/* Alert banner if critical */}
      {criticalCharts.length>0&&(
        <div style={{background:'#450a0a',border:'1.5px solid #dc2626',borderRadius:10,padding:'10px 16px',marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:20}}>🚨</span>
          <div>
            <div style={{fontWeight:800,color:'#fca5a5',fontSize:13}}>BINS SHORTAGE ALERT — {criticalCharts.length} chart{criticalCharts.length>1?'s':''} below 70% of norms</div>
            <div style={{fontSize:11,color:'#f87171'}}>{criticalCharts.map(c=>c.name).join(' · ')}</div>
          </div>
        </div>
      )}

      {/* Summary strip */}
      {custBins.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:8,marginBottom:14}}>
          {[
            {l:'Parts',v:custBins.length,co:C.text},
            {l:'Std Bins',v:custBins.reduce((a,b)=>a+b.stdBins,0),co:C.teal},
            {l:'Req Bins',v:custBins.reduce((a,b)=>a+b.reqBins,0).toFixed(0),co:C.gold},
            {l:'Total Received',v:mergedCharts.reduce((a,c)=>a+Object.values(c.daily).reduce((s,v)=>s+v,0),0).toLocaleString(),co:C.green},
          ].map(k=>(
            <div key={k.l} style={{background:'#0a0d16',borderRadius:8,padding:'8px 12px',border:`1px solid ${C.border}`}}>
              <div style={{fontSize:18,fontWeight:900,color:k.co}}>{k.v}</div>
              <div style={{fontSize:9,color:C.sub,marginTop:2}}>{k.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {mergedCharts.map((chart,i)=>(
        <div key={i}>
          <BinsChart chart={chart} lastUpdatedInfo={lastUpdated[chart.label]}/>
          <div style={{marginBottom:14,display:'flex',justifyContent:'flex-end'}}>
            <button onClick={()=>openEntry(chart)}
              style={{padding:'6px 14px',borderRadius:7,border:`1px solid ${C.teal}`,background:'#0d2420',color:C.teal,fontWeight:700,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
              ✏️ Edit Bins Data — {chart.label}
            </button>
          </div>
        </div>
      ))}

      {/* Bins reference table */}
      {custBins.length>0&&(
        <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,overflow:'hidden',marginTop:8}}>
          <div style={{padding:'10px 14px',fontWeight:700,fontSize:12,color:C.sub,borderBottom:`1px solid ${C.border}`}}>📦 Bins Reference</div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:10,minWidth:500}}>
              <thead><tr style={{background:'#0E1830'}}>
                {['Part No','Part Name','SA/HR','Std','Total','Req','Norms/d','Recd','Avail','@Cust','Custodian'].map(h=>(
                  <th key={h} style={{padding:'7px 10px',color:C.sub,fontWeight:700,textAlign:h==='Part No'||h==='Part Name'||h==='Custodian'?'left':'right',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{custBins.map((b,i)=>{
                const sht=b.reqBins>0&&b.available<b.normsBins;
                return (
                  <tr key={b.partNo+i} style={{background:sht?'#200808':i%2===0?C.card:C.raised,borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:'7px 10px',color:C.teal,fontFamily:'monospace',fontSize:9}}>{b.partNo}</td>
                    <td style={{padding:'7px 10px',fontWeight:600}}>{b.partName}</td>
                    <td style={{padding:'7px 10px',textAlign:'right',color:C.sub}}>{b.saHr||'-'}</td>
                    <td style={{padding:'7px 10px',textAlign:'right'}}>{b.stdBins||'-'}</td>
                    <td style={{padding:'7px 10px',textAlign:'right',color:C.teal}}>{b.totalBins>0?b.totalBins.toFixed(0):'-'}</td>
                    <td style={{padding:'7px 10px',textAlign:'right',color:C.gold}}>{b.reqBins>0?b.reqBins.toFixed(0):'-'}</td>
                    <td style={{padding:'7px 10px',textAlign:'right',color:C.orange}}>{b.normsBins>0?b.normsBins.toFixed(1):'-'}</td>
                    <td style={{padding:'7px 10px',textAlign:'right',color:C.green,fontWeight:700}}>{b.received||'-'}</td>
                    <td style={{padding:'7px 10px',textAlign:'right',color:sht?C.red:C.purple,fontWeight:sht?700:400}}>{b.available||'-'}{sht?' ⚠':''}</td>
                    <td style={{padding:'7px 10px',textAlign:'right',color:C.sub}}>{b.binsAvail||'-'}</td>
                    <td style={{padding:'7px 10px',color:C.sub,fontSize:9}}>{b.custodian}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily entry modal */}
      {entryChart&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:12}}>
          <div style={{background:C.card,borderRadius:16,border:`1px solid ${C.border}`,width:'100%',maxWidth:480,maxHeight:'90vh',display:'flex',flexDirection:'column'}}>
            <div style={{background:'#0a0d16',padding:'14px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div>
                <div style={{fontWeight:800,color:'#fff',fontSize:13}}>✏️ {entryChart.name}</div>
                <div style={{fontSize:10,color:C.sub,marginTop:2}}>Norm: {entryChart.normPerDay}/day · Edit any date</div>
              </div>
              <button onClick={()=>setEntryChart(null)} style={{background:'transparent',border:'none',color:C.sub,fontSize:20,cursor:'pointer'}}>×</button>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:14}}>
              {entryRows.map((r,i)=>{
                const isShort=Number(r.qty)>0&&Number(r.qty)<entryChart.normPerDay;
                const isOk=Number(r.qty)>=entryChart.normPerDay;
                return (
                  <div key={r.day} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize:11,color:C.sub,minWidth:50}}>{new Date(year,month,r.day).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</span>
                    <div style={{flex:1,position:'relative'}}>
                      <input type="number" inputMode="numeric" value={r.qty===''?'':r.qty}
                        onChange={e=>setEntryRows(rows=>rows.map((x,j)=>j===i?{...x,qty:e.target.value===''?'':Number(e.target.value)}:x))}
                        style={{...numInp,width:'100%',textAlign:'right',
                          borderColor:isShort?'#dc2626':isOk?'#16a34a':C.border,
                          background:isShort?'#1a0808':isOk?'#0d2010':C.raised}}
                        placeholder="0"/>
                    </div>
                    <span style={{fontSize:10,minWidth:60,color:isShort?C.red:isOk?C.green:C.sub}}>
                      {Number(r.qty)>0?(isShort?`⚠ -${entryChart.normPerDay-Number(r.qty)}`:isOk?'✅':''):'-'}
                    </span>
                    <button onClick={()=>setEntryRows(rows=>rows.map((x,j)=>j===i?{...x,qty:''}:x))}
                      style={{background:'transparent',border:'none',color:'#374151',cursor:'pointer',fontSize:12}}>✕</button>
                  </div>
                );
              })}
            </div>
            <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`,display:'flex',gap:8,flexShrink:0}}>
              <button onClick={()=>setEntryChart(null)} style={{flex:1,padding:'9px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:C.sub,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
              <button onClick={saveEntry} disabled={saving} style={{flex:2,padding:'9px',borderRadius:8,border:'none',background:C.green,color:'#fff',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>{saving?'Saving…':'✅ Save Bins Data'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
// Thin wrapper so ScheduleRevision renders inside Dispatch without sidebar
function ScheduleRevisionInline({userProfile, activeUnit, onBack}) {
  return <ScheduleRevisionComp userProfile={userProfile} activeUnit={activeUnit} onBack={onBack}/>;
}

export default function CustomerDashboard({dark,onBack,userProfile,unit}){
  const activeUnit = unit||'u1';
  const isPPC = userProfile?.role==='owner'||userProfile?.dept==='ppc';
  const now=new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [wdOverride, setWdOverride] = useState(null); // null = auto-calculate
  const [wdSaving,  setWdSaving]  = useState(false);

  // Load saved working days for this month from Firestore
  useEffect(()=>{
    const key = `${year}-${String(month+1).padStart(2,'0')}`;
    import('firebase/firestore').then(({doc,getDoc})=>{
      import('../firebase').then(({db})=>{
        getDoc(doc(db,'working_days_config','customer')).then(snap=>{
          if (snap.exists()) {
            const val = snap.data()[key];
            setWdOverride(val !== undefined ? val : null);
          } else {
            setWdOverride(null);
          }
        }).catch(()=>setWdOverride(null));
      });
    });
  },[year,month]);

  async function saveWdOverride(val) {
    const key = `${year}-${String(month+1).padStart(2,'0')}`;
    setWdSaving(true);
    try {
      const {doc,setDoc} = await import('firebase/firestore');
      const {db} = await import('../firebase');
      await setDoc(doc(db,'working_days_config','customer'), { [key]: val }, { merge: true });
      setWdOverride(val);
    } catch(e) { alert('Save failed: '+e.message); }
    finally { setWdSaving(false); }
  }

  async function resetWdOverride() {
    const key = `${year}-${String(month+1).padStart(2,'0')}`;
    setWdSaving(true);
    try {
      const {doc,updateDoc,deleteField} = await import('firebase/firestore');
      const {db} = await import('../firebase');
      await updateDoc(doc(db,'working_days_config','customer'), { [key]: deleteField() });
      setWdOverride(null);
    } catch(e) { setWdOverride(null); }
    finally { setWdSaving(false); }
  }
  const [customers,setCustomers]=useState([]);
  const [schedules,setSchedules]=useState({});
  const [dailyData,setDailyData]=useState({});
  const [loading,setLoading]=useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [lastSyncBy,   setLastSyncBy]   = useState(null);
  const [schedLastUpd, setSchedLastUpd] = useState({at:null,by:null});
  const [dailyLastUpd, setDailyLastUpd] = useState({at:null,by:null});
  const [selected,setSelected]=useState(null);
  const [schedModal,setSchedModal]=useState(null);
  const [entryModal,setEntryModal]=useState(null);
  const [showMaster,setShowMaster]=useState(false);
  const [showInsights,setShowInsights]=useState(false);
  const [showRevision,setShowRevision]=useState(false);

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  // Make current user name available to Firestore helper functions
  if (userProfile?.name) window._currentUserName = userProfile.name;
  const lastDayOfMonth = new Date(year, month+1, 0).getDate();
  // Norms based on COMPLETED days only (today is in progress, subtract 1)
  const effectiveDayForNorms = isCurrentMonth ? Math.max(0, now.getDate() - 1) : lastDayOfMonth;
  const autoWD = getWorkingDaysInMonth(year,month);
  // Working days override only applies to current month — past months are locked
  const effectiveWD = isCurrentMonth && wdOverride !== null ? wdOverride : autoWD;
  const normsPercent = effectiveWD > 0 ? getWorkingDaysElapsed(year,month,effectiveDayForNorms) / effectiveWD : 0;
  const monthLabel = new Date(year,month).toLocaleString('en-IN',{month:'long',year:'numeric'});
  const normsPct=normsPercent*100;

  const load=useCallback(async()=>{
    setLoading(true);
    const [c,s,d]=await Promise.all([loadCustomerMaster(activeUnit),getSchedules(year,month,activeUnit),getDailyEntries(year,month,activeUnit)]);
    setCustomers(c);setSchedules(s);setDailyData(d);
    // Find most recent updatedAt across all schedule/daily docs
    const allDocs = [...Object.values(s),...Object.values(d).flatMap(cust=>Object.values(cust).flatMap(part=>typeof part==='object'?Object.values(part):[]))];
    // Find most recent update in schedules
    const schedPartDocs = Object.values(s).flatMap(cust=>Object.values(cust||{}));
    const latestSched = schedPartDocs.reduce((best,doc)=>{
      if (!doc||typeof doc!=='object') return best;
      const rawAt = doc.updatedAt;
      if (!rawAt) return best;
      const dt = rawAt instanceof Date ? rawAt : rawAt?.toDate ? rawAt.toDate() : rawAt?.seconds ? new Date(rawAt.seconds*1000) : new Date(rawAt);
      return (!best.at||dt>best.at) ? {at:dt,by:doc.updatedBy||'—'} : best;
    },{at:null,by:null});
    setSchedLastUpd(latestSched);
    // Extract lastUpd from _lastUpd sentinel stored in daily result
    const latestDaily = d._lastUpd ? {at: d._lastUpd.at, by: d._lastUpd.by||'—'} : {at:null,by:null};
    setDailyLastUpd(latestDaily);
    setLastSyncTime(new Date()); setLoading(false);
  },[year,month,activeUnit]);
  useEffect(()=>{load();},[load]);

  const allStats=customers.map(c=>{
    const sch=schedules[c.id]||{};
    const dd=dailyData[c.id]||{};
    const totSch=c.parts.reduce((a,p)=>a+(sch[p.partNo]?.scheduleQty||0),0);
    const totDisp=c.parts.reduce((a,p)=>a+Object.values(dd[p.partNo]||{}).reduce((s,v)=>s+(v||0),0),0);
    const totVal=c.parts.reduce((a,p)=>a+(sch[p.partNo]?.scheduleQty||0)*p.rate,0);
    const totAch=c.parts.reduce((a,p)=>a+Object.values(dd[p.partNo]||{}).reduce((s,v)=>s+(v||0),0)*p.rate,0);
    const dispPct=totSch>0?totDisp/totSch*100:0;
    return {id:c.id,name:c.name,totSch,totDisp,totVal,totAch,dispPct,arpu:totSch>0?totVal/totSch:0};
  });

  const grand=allStats.reduce((a,s)=>({sch:a.sch+s.totSch,disp:a.disp+s.totDisp,val:a.val+s.totVal,ach:a.ach+s.totAch}),{sch:0,disp:0,val:0,ach:0});
  const grandPct=grand.sch>0?grand.disp/grand.sch*100:0;
  const grandBack=Math.max(0,normsPct-grandPct);
  const ragC=p=>p>=normsPct?C.green:p>=normsPct*0.6?C.orange:C.red;

  if(showInsights) return <InsightsPanel customers={customers} schedules={schedules} dailyData={dailyData} normsPercent={normsPercent} year={year} month={month} workingDays={effectiveWD} onClose={()=>setShowInsights(false)}/>;
  if(showRevision) return <ScheduleRevisionInline userProfile={userProfile} activeUnit={activeUnit} onBack={()=>setShowRevision(false)}/>;
  if(showMaster)   return <ScheduleMasterEditor customers={customers} schedules={schedules} year={year} month={month} onSave={load} onClose={()=>setShowMaster(false)}/>;
  if(selected){
    const cust=customers.find(c=>c.id===selected);
    if(!cust) return null;
    return (
      <>
        <CustomerDetail customer={cust} schedules={schedules} dailyData={dailyData} normsPercent={normsPercent}
          onBack={()=>setSelected(null)} isPPC={isPPC} userProfile={userProfile}
          schedLastUpd={schedLastUpd} dailyLastUpd={dailyLastUpd} activeUnit={activeUnit}
          onSchedule={()=>setSchedModal(cust)} onEntry={()=>setEntryModal(cust)}/>
        {schedModal&&<ScheduleModal customer={schedModal} year={year} month={month} schedules={schedules} dailyData={dailyData} onSave={load} onClose={()=>setSchedModal(null)} activeUnit={activeUnit}/>}
        {entryModal&&<DailyEntryModal customer={entryModal} year={year} month={month} dailyData={dailyData} onSave={load} onClose={()=>setEntryModal(null)} activeUnit={activeUnit}/>}
      </>
    );
  }

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:'12px 20px',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <button onClick={onBack} style={{background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,cursor:'pointer',padding:'6px 14px',fontFamily:'inherit'}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:17}}>📊 Customer Dashboard — {monthLabel}</div>
            <div style={{fontSize:11,color:C.sub}}>
              {Math.round(normsPercent*100)}% norms · {effectiveWD} working days{isCurrentMonth&&wdOverride!==null?' ✓ saved':''}{!isCurrentMonth?' (final)':''}
              {isCurrentMonth&&<>
                {' · '}<span style={{color:'#f97316',fontWeight:700}}>Day {getWorkingDaysElapsed(year,month,now.getDate())} of {effectiveWD}</span>
                {' · '}<span style={{color:C.sub}}>{Math.max(0,effectiveWD-getWorkingDaysElapsed(year,month,now.getDate()))} days left</span>
              </>}
            </div>
            <LastUpdatedBadge at={dailyLastUpd.at||schedLastUpd.at} by={dailyLastUpd.by||schedLastUpd.by}/>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <select value={`${year}-${month}`} onChange={e=>{
  const[y,m]=e.target.value.split('-').map(Number);
  setYear(y);setMonth(m);setWdOverride(null);
}}
              style={{padding:'7px 10px',borderRadius:8,border:`1px solid ${C.border}`,background:C.raised,color:C.text,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
              {Array.from({length:12},(_,i)=>{
                const d=new Date(now.getFullYear(),i);
                return <option key={i} value={`${now.getFullYear()}-${i}`}>{d.toLocaleString('en-IN',{month:'short',year:'numeric'})}</option>;
              })}
            </select>
            {isCurrentMonth && (
              <div style={{display:'flex',alignItems:'center',gap:6,background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:'5px 10px'}}>
                <span style={{fontSize:11,color:C.sub,whiteSpace:'nowrap'}}>Working days:</span>
                <input type="number" min={1} max={31}
                  value={wdOverride!==null?wdOverride:autoWD}
                  onChange={e=>setWdOverride(Number(e.target.value))}
                  style={{width:36,border:'none',background:'transparent',color:C.text,fontWeight:800,fontSize:13,textAlign:'center',outline:'none',fontFamily:'inherit'}}/>
                <button onClick={()=>saveWdOverride(wdOverride!==null?wdOverride:autoWD)} disabled={wdSaving}
                  title="Save for this month"
                  style={{background:'#16a34a',border:'none',borderRadius:6,color:'#fff',fontSize:10,fontWeight:800,cursor:'pointer',padding:'3px 8px',fontFamily:'inherit'}}>
                  {wdSaving?'…':'Save'}
                </button>
                {wdOverride!==null&&<button onClick={resetWdOverride} disabled={wdSaving} title="Reset to auto"
                  style={{background:'transparent',border:'none',color:C.sub,cursor:'pointer',fontSize:11,padding:'0 2px'}}>↺</button>}
              </div>
            )}
            <button onClick={()=>setShowInsights(true)} style={{padding:'7px 14px',borderRadius:8,border:`1px solid ${C.purple}`,background:'#1a0d30',color:C.purple,fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>📈 Insights</button>
            {(userProfile?.dept==='ppc'||userProfile?.role==='owner'||['owner@alubee.com','md@alubee.com','gopi@alubee.com','udhay@alubee.com','gokul@alubee.com','loganathan.ppc@alubee.com'].includes(userProfile?.email))&&<button onClick={()=>setShowRevision(true)} style={{padding:'7px 14px',borderRadius:8,border:`1px solid ${C.orange}`,background:'rgba(249,115,22,0.1)',color:C.orange,fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>🔄 Schedule Revision</button>}
            {isPPC&&<button onClick={()=>setShowMaster(true)} style={{padding:'7px 14px',borderRadius:8,border:`1px solid ${C.gold}`,background:'#1a1200',color:C.gold,fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>📋 Schedule Master</button>}
          </div>
        </div>
      </div>

      <div style={{padding:'16px 20px'}}>
        {loading?<div style={{textAlign:'center',padding:60,color:C.sub}}>Loading…</div>:(<>
          {/* Grand KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:16}}>
            {[
              {l:'Total Schedule',   v:grand.sch.toLocaleString(),    co:C.text},
              {l:'Total Dispatched', v:grand.disp.toLocaleString(),   co:C.green},
              {l:'Balance',         v:(grand.sch-grand.disp).toLocaleString(),co:C.blue},
              {l:'Order Value',      v:fmtL(grand.val),  co:C.gold},
              {l:'Achieved',         v:fmtL(grand.ach),  co:C.teal},
              {l:'Backlog Value',    v:fmtL(Math.max(0,grand.val*(normsPct/100)-grand.ach)),co:C.red},
            ].map(k=>(
              <div key={k.l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 14px'}}>
                <div style={{fontSize:20,fontWeight:900,color:k.co}}>{k.v}</div>
                <div style={{fontSize:10,color:C.sub,marginTop:2}}>{k.l}</div>
              </div>
            ))}
          </div>

          {/* Overall bar */}
          <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:'14px 20px',marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,flexWrap:'wrap',gap:8}}>
              <span style={{fontWeight:700,fontSize:13}}>Overall Dispatch Progress — {new Date(year,month).toLocaleString('en-IN',{month:'long',year:'numeric'})}</span>
              <div style={{display:'flex',gap:14,fontSize:12,fontWeight:800}}>
                <span style={{color:ragC(grandPct)}}>Dispatch: {grandPct.toFixed(1)}%</span>
                <span style={{color:C.green}}>Norms: {normsPct.toFixed(1)}%</span>
                <span style={{color:C.red}}>Backlog: {grandBack.toFixed(1)}%</span>
              </div>
            </div>
            <div style={{background:'#0E1830',borderRadius:6,height:16,overflow:'hidden',position:'relative',marginBottom:6}}>
              <div style={{width:`${Math.min(grandPct,100)}%`,height:'100%',background:ragC(grandPct)}}/>
              <div style={{position:'absolute',top:0,left:`${Math.min(normsPct,100)}%`,height:'100%',width:2,background:C.gold}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:C.sub}}>
              <span>{grand.disp.toLocaleString()} dispatched</span>
              <span style={{color:C.gold}}>▲ {normsPct.toFixed(1)}% target</span>
              <span>{grand.sch.toLocaleString()} schedule</span>
            </div>
          </div>

          {/* Bar chart */}
          <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:'14px 20px',marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Dispatch % by Customer <span style={{fontSize:10,color:C.sub,fontWeight:400}}>· Click to drill down</span></div>
            {allStats.filter(s=>s.totSch>0).sort((a,b)=>b.totSch-a.totSch).map(s=>(
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7,cursor:'pointer'}} onClick={()=>setSelected(s.id)}>
                <div style={{minWidth:170,fontSize:10,color:C.text,fontWeight:600,textAlign:'right',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
                <div style={{flex:1,position:'relative',height:18,background:'#0E1830',borderRadius:3}}>
                  <div style={{width:`${Math.min(s.dispPct,100)}%`,height:'100%',background:ragC(s.dispPct),borderRadius:3}}/>
                  <div style={{position:'absolute',top:-2,left:`${Math.min(normsPct,100)}%`,height:22,width:2,background:C.gold}}/>
                </div>
                <div style={{minWidth:40,fontSize:11,fontWeight:800,color:ragC(s.dispPct),textAlign:'right'}}>{s.dispPct.toFixed(0)}%</div>
                <div style={{minWidth:60,fontSize:9,color:C.sub,textAlign:'right'}}>{s.totSch.toLocaleString()}</div>
                <div style={{minWidth:60,fontSize:9,color:C.gold,textAlign:'right'}}>{fmtL(s.totVal)}</div>
              </div>
            ))}
          </div>

          {/* Customer cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
            {customers.map(c=>{
              const s=allStats.find(x=>x.id===c.id)||{totSch:0,totDisp:0,totVal:0,totAch:0,dispPct:0,arpu:0};
              const rc=ragC(s.dispPct);
              return (
                <div key={c.id} onClick={()=>setSelected(c.id)}
                  style={{background:C.card,borderRadius:14,border:`1.5px solid ${s.totSch>0&&s.dispPct<normsPct*0.6?'#7f1d1d':s.totSch>0&&s.dispPct<normsPct?'#7c2d12':C.border}`,padding:16,cursor:'pointer',transition:'transform 0.15s'}}
                  onMouseEnter={e=>e.currentTarget.style.transform='scale(1.01)'}
                  onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:13,color:C.text}}>{c.name}</div>
                      <div style={{fontSize:10,color:C.sub,marginTop:2}}>{c.parts.length} parts · ARPU ₹{s.arpu.toFixed(0)}/pc</div>
                    </div>
                    {s.totSch>0&&<span style={{fontSize:9,fontWeight:700,color:rc,background:`${rc}18`,borderRadius:5,padding:'2px 7px',border:`1px solid ${rc}44`,whiteSpace:'nowrap'}}>
                      {s.dispPct>=normsPct?'✅ On Track':s.dispPct>=normsPct*0.6?'⚠ At Risk':'🔴 Critical'}
                    </span>}
                  </div>
                  {s.totSch>0?<>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:C.sub,marginBottom:3}}>
                      <span>Dispatch</span><span style={{color:rc,fontWeight:700}}>{s.dispPct.toFixed(1)}% · Norms {normsPct.toFixed(0)}%</span>
                    </div>
                    <div style={{background:'#0E1830',borderRadius:3,height:8,overflow:'hidden',position:'relative',marginBottom:10}}>
                      <div style={{width:`${Math.min(s.dispPct,100)}%`,height:'100%',background:rc}}/>
                      <div style={{position:'absolute',top:0,left:`${Math.min(normsPct,100)}%`,height:'100%',width:1.5,background:C.gold}}/>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5}}>
                      {[
                        {l:'Schedule',v:s.totSch.toLocaleString(),co:C.sub},
                        {l:'Dispatched',v:s.totDisp.toLocaleString(),co:C.green},
                        {l:'Balance',v:(s.totSch-s.totDisp).toLocaleString(),co:C.blue},
                        {l:'Order Val',v:fmtL(s.totVal),co:C.gold},
                        {l:'Achieved',v:fmtL(s.totAch),co:C.teal},
                        {l:'Backlog',v:fmtL(Math.max(0,s.totVal*(normsPct/100)-s.totAch)),co:C.red},
                      ].map(k=>(
                        <div key={k.l} style={{background:'#0E1830',borderRadius:6,padding:'5px 8px'}}>
                          <div style={{fontSize:11,fontWeight:800,color:k.co}}>{k.v}</div>
                          <div style={{fontSize:8,color:C.sub,marginTop:1}}>{k.l}</div>
                        </div>
                      ))}
                    </div>
                  </>:<div style={{fontSize:11,color:C.sub,textAlign:'center',padding:'10px 0'}}>No schedule · {isPPC&&<span style={{color:C.teal}}>Click to add →</span>}</div>}
                </div>
              );
            })}
          </div>
        </>)}
      </div>

      {schedModal&&<ScheduleModal customer={schedModal} year={year} month={month} schedules={schedules} dailyData={dailyData} onSave={load} onClose={()=>setSchedModal(null)}/>}
      {entryModal&&<DailyEntryModal customer={entryModal} year={year} month={month} dailyData={dailyData} onSave={load} onClose={()=>setEntryModal(null)}/>}
    </div>
  );
}

// ── HISTORY TAB — 6-month intake per part ─────────────────────────────────────
const HISTORY_MONTHS = 6;
const REVISION_REASONS = [
  'Based on last 6-month average intake',
  'Customer hold instruction',
  'Bin supply issue — bins not returned',
  'MOQ not met — volume too low',
  'Customer PO revised downward',
  'Customer PO revised upward',
  'Volume spike — customer demand increased',
  'Seasonal demand adjustment',
  'New part introduced — replacing old',
  'Other',
];

function HistoryTab({ customer, activeUnit }) {
  const [histData, setHistData] = useState(null); // {partNo: {YYYY-MM: qty}}
  const [loading, setLoading] = useState(true);
  const [migModal, setMigModal] = useState(false);

  const now = new Date();
  const months = Array.from({ length: HISTORY_MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (HISTORY_MONTHS - 1 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: d.toLocaleString('en-IN',{month:'short',year:'2-digit'}) };
  });

  useEffect(() => {
    if (!customer?.id) return;
    setLoading(true);
    async function load() {
      try {
        const { getDocs, query, collection, where } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        const col = `customer_history_${activeUnit==='u2'?'u2':'u1'}`;
        const snap = await getDocs(query(collection(db, col), where('custId','==',customer.id)));
        const map = {};
        snap.docs.forEach(d => {
          const { partNo, monthKey, qty } = d.data();
          if (!map[partNo]) map[partNo] = {};
          map[partNo][monthKey] = qty || 0;
        });
        setHistData(map);
      } catch(e) { setHistData({}); }
      setLoading(false);
    }
    load();
  }, [customer?.id, activeUnit]);

  const parts = customer?.parts || [];

  // Calculate avg and detect spikes
  function getStats(partNo) {
    const d = histData?.[partNo] || {};
    const vals = months.map(m => d[m.key] || 0);
    const nonZero = vals.filter(v => v > 0);
    const avg = nonZero.length > 0 ? Math.round(nonZero.reduce((a,v)=>a+v,0)/nonZero.length) : 0;
    return { vals, avg };
  }

  function spikeColor(val, avg) {
    if (!avg || !val) return 'transparent';
    const ratio = val / avg;
    if (ratio > 1.3) return 'rgba(34,197,94,0.15)';   // spike up — green
    if (ratio < 0.7) return 'rgba(239,68,68,0.15)';   // spike down — red
    return 'transparent';
  }
  function spikeLabel(val, avg) {
    if (!avg || !val) return '';
    const pct = Math.round(((val-avg)/avg)*100);
    if (pct > 30) return `▲${pct}%`;
    if (pct < -30) return `▼${Math.abs(pct)}%`;
    return '';
  }

  const hasData = histData && Object.keys(histData).length > 0;

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div>
          <div style={{fontWeight:800,fontSize:14,color:C.text}}>📈 6-Month Intake History</div>
          <div style={{fontSize:11,color:C.sub,marginTop:2}}>Last {HISTORY_MONTHS} months actual dispatch from customer</div>
        </div>
        <button onClick={()=>setMigModal(true)}
          style={{padding:'7px 16px',borderRadius:8,border:`1px solid ${C.orange}`,background:'rgba(249,115,22,0.1)',color:C.orange,fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
          📥 Enter / Update History
        </button>
      </div>

      {loading && <div style={{textAlign:'center',padding:40,color:C.sub}}>Loading…</div>}

      {!loading && !hasData && (
        <div style={{textAlign:'center',padding:40,color:C.sub}}>
          <div style={{fontSize:32,marginBottom:12}}>📊</div>
          <div style={{fontWeight:700,marginBottom:4}}>No historical data yet</div>
          <div style={{fontSize:12}}>Click "Enter / Update History" to add the last 6 months intake data</div>
        </div>
      )}

      {!loading && hasData && (
        <div style={{overflowX:'auto'}}>
          {/* Legend */}
          <div style={{display:'flex',gap:16,marginBottom:10,fontSize:11}}>
            <span style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:12,height:12,background:'rgba(34,197,94,0.3)',borderRadius:2}}/> Spike up &gt;30%</span>
            <span style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:12,height:12,background:'rgba(239,68,68,0.2)',borderRadius:2}}/> Drop &gt;30%</span>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:600}}>
            <thead>
              <tr style={{background:C.raised}}>
                <th style={{padding:'8px 10px',textAlign:'left',color:C.sub,fontWeight:700,borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>Part</th>
                {months.map(m=><th key={m.key} style={{padding:'8px 10px',textAlign:'center',color:C.sub,fontWeight:700,borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{m.label}</th>)}
                <th style={{padding:'8px 10px',textAlign:'center',color:C.amber,fontWeight:700,borderBottom:`1px solid ${C.border}`}}>6M Avg</th>
                <th style={{padding:'8px 10px',textAlign:'center',color:C.sub,fontWeight:700,borderBottom:`1px solid ${C.border}`}}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {parts.map(p => {
                const { vals, avg } = getStats(p.partNo);
                const nonZero = vals.filter(v=>v>0);
                let trend = '→';
                if (nonZero.length >= 2) {
                  const first = nonZero.slice(0, Math.floor(nonZero.length/2));
                  const last  = nonZero.slice(Math.ceil(nonZero.length/2));
                  const fAvg  = first.reduce((a,v)=>a+v,0)/first.length;
                  const lAvg  = last.reduce((a,v)=>a+v,0)/last.length;
                  if (lAvg > fAvg * 1.1) trend = '↑';
                  else if (lAvg < fAvg * 0.9) trend = '↓';
                }
                return (
                  <tr key={p.partNo}>
                    <td style={{padding:'8px 10px',fontWeight:700,color:C.text,borderBottom:`1px solid ${C.border}`}}>
                      <div>{p.partName||p.partNo}</div>
                      <div style={{fontSize:9,color:C.sub}}>{p.partNo}</div>
                    </td>
                    {months.map((m,i) => {
                      const v = vals[i];
                      const lbl = spikeLabel(v, avg);
                      return (
                        <td key={m.key} style={{padding:'8px 10px',textAlign:'center',borderBottom:`1px solid ${C.border}`,background:spikeColor(v,avg)}}>
                          <div style={{fontWeight:v>0?700:400,color:v>0?C.text:C.sub}}>{v>0?v.toLocaleString('en-IN'):'—'}</div>
                          {lbl&&<div style={{fontSize:8,color:lbl.startsWith('▲')?C.green:C.red,fontWeight:800}}>{lbl}</div>}
                        </td>
                      );
                    })}
                    <td style={{padding:'8px 10px',textAlign:'center',borderBottom:`1px solid ${C.border}`,color:C.amber,fontWeight:800}}>
                      {avg>0?avg.toLocaleString('en-IN'):'—'}
                    </td>
                    <td style={{padding:'8px 10px',textAlign:'center',borderBottom:`1px solid ${C.border}`,fontSize:16,color:trend==='↑'?C.green:trend==='↓'?C.red:C.sub}}>
                      {trend}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {migModal && <HistoryMigrationModal customer={customer} months={months} existing={histData||{}} activeUnit={activeUnit} onClose={()=>{setMigModal(false);setLoading(true);setHistData(null);setLoading(false);}} onSaved={()=>{setMigModal(false);setLoading(true);setHistData(null);}}/>}
    </div>
  );
}

// ── HISTORY MIGRATION MODAL ────────────────────────────────────────────────────
function HistoryMigrationModal({ customer, months, existing, activeUnit, onClose, onSaved }) {
  const parts = customer?.parts || [];
  const [rows, setRows] = useState(() => {
    const init = {};
    parts.forEach(p => {
      init[p.partNo] = {};
      months.forEach(m => { init[p.partNo][m.key] = existing[p.partNo]?.[m.key] ?? ''; });
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const upd = (partNo, monthKey, val) => setRows(r => ({ ...r, [partNo]: { ...r[partNo], [monthKey]: val } }));

  async function save() {
    setSaving(true);
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      const col = `customer_history_${activeUnit==='u2'?'u2':'u1'}`;
      for (const p of parts) {
        for (const m of months) {
          const val = parseInt(rows[p.partNo]?.[m.key]) || 0;
          const docId = `${customer.id}_${p.partNo.replace(/[^a-zA-Z0-9]/g,'_')}_${m.key}`;
          await setDoc(doc(db, col, docId), {
            custId: customer.id, custName: customer.name,
            partNo: p.partNo, partName: p.partName||p.partNo,
            monthKey: m.key, qty: val,
            updatedAt: new Date(),
          });
        }
      }
      onSaved();
    } catch(e) { alert('Save failed: '+e.message); }
    setSaving(false);
  }

  const inp = { border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 6px',fontSize:11,outline:'none',background:C.raised,color:C.text,fontFamily:'inherit',width:'100%',boxSizing:'border-box',textAlign:'center' };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,maxWidth:800,width:'100%',maxHeight:'90vh',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'16px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontWeight:900,fontSize:15,color:C.text}}>📥 Enter Historical Intake — {customer.name}</div>
            <div style={{fontSize:11,color:C.sub,marginTop:2}}>Enter actual monthly dispatch quantities for last 6 months</div>
          </div>
          <button onClick={onClose} style={{background:'transparent',border:'none',color:C.sub,fontSize:22,cursor:'pointer'}}>×</button>
        </div>
        <div style={{overflowY:'auto',padding:'16px 20px',flex:1}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead>
              <tr style={{background:C.raised}}>
                <th style={{padding:'7px 8px',textAlign:'left',color:C.sub,fontWeight:700,borderBottom:`1px solid ${C.border}`}}>Part</th>
                {months.map(m=><th key={m.key} style={{padding:'7px 8px',textAlign:'center',color:C.sub,fontWeight:700,borderBottom:`1px solid ${C.border}`,minWidth:80}}>{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {parts.map(p => (
                <tr key={p.partNo}>
                  <td style={{padding:'7px 8px',fontWeight:700,color:C.text,borderBottom:`1px solid ${C.border}`}}>
                    <div>{p.partName||p.partNo}</div>
                    <div style={{fontSize:9,color:C.sub}}>{p.partNo}</div>
                  </td>
                  {months.map(m => (
                    <td key={m.key} style={{padding:'4px 6px',borderBottom:`1px solid ${C.border}`}}>
                      <input type="number" min={0} style={inp} value={rows[p.partNo]?.[m.key]??''} onChange={e=>upd(p.partNo,m.key,e.target.value)}/>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{padding:'12px 20px',borderTop:`1px solid ${C.border}`,display:'flex',gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:'10px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:C.sub,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{flex:2,padding:'10px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',fontWeight:800,fontSize:13,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit'}}>
            {saving?'⏳ Saving…':'💾 Save History'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── REVISION TAB ──────────────────────────────────────────────────────────────