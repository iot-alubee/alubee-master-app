// src/data/orgData.js — U1 + U2 combined org chart

export const ROLES = { OWNER:'owner', DEPT_HEAD:'dept_head', MEMBER:'member', VIEWER:'viewer' };

export const DEPARTMENTS = [
  { id:'pdc',          label:'PDC',                  color:'#E74C3C' },
  { id:'pdc_maint',    label:'PDC Maintenance',      color:'#C0392B' },
  { id:'fettling',     label:'Fettling',             color:'#E67E22' },
  { id:'cnc_vmc',      label:'CNC / VMC Machining',  color:'#F39C12' },
  { id:'secondary',    label:'Secondary Operations', color:'#27AE60' },
  { id:'assembly',     label:'Assembly',             color:'#2ECC71' },
  { id:'final',        label:'Final',                color:'#1ABC9C' },
  { id:'dispatch',     label:'Dispatch',             color:'#16A085' },
  { id:'maintenance',  label:'Maintenance',          color:'#2980B9' },
  { id:'stores',       label:'Stores',               color:'#3498DB' },
  { id:'toolroom',     label:'Toolroom',             color:'#8E44AD' },
  { id:'design',       label:'Design',               color:'#9B59B6' },
  { id:'npd',          label:'NPD / Quality',        color:'#2C3E50' },
  { id:'ppc',          label:'PPC',                  color:'#34495E' },
  { id:'erp',          label:'ERP',                  color:'#7F8C8D' },
  { id:'accounts',     label:'Accounts',             color:'#95A5A6' },
  { id:'hr',           label:'HR',                   color:'#E91E63' },
  { id:'shotblasting', label:'Shotblasting',         color:'#FF5722' },
  { id:'fabrication',  label:'Fabrication',          color:'#795548' },
  { id:'security',     label:'Security',             color:'#607D8B' },
  { id:'housekeeping', label:'Housekeeping',          color:'#26C6DA' },
  { id:'te',           label:'TE',                   color:'#607D8B' },
  { id:'mould',        label:'Mould',                color:'#455A64' },
  { id:'it',           label:'IT',                   color:'#0EA5E9' },
];

// ─── UNIT 1 ───────────────────────────────────────────────────────────────────
export const USERS_U1 = [
  { id:'owner',        name:'Owner',        email:'owner@alubee.com',                role:ROLES.OWNER,     dept:null,          unit:'u1' },
  { id:'md',           name:'MD',           email:'md@alubee.com',                   role:ROLES.OWNER,     dept:null,          unit:'u1' },
  { id:'natesan',      name:'Natesan',      email:'natesan@alubee.com',              role:ROLES.VIEWER,    dept:null,          unit:'u1' },
  // PDC
  { id:'prabha',       name:'Prabhakaran',  email:'prabha@alubee.com',               role:ROLES.DEPT_HEAD, dept:'pdc',         unit:'u1', shift:'common' },
  { id:'vijay',        name:'Vijay',        email:'vijay@alubee.com',                role:ROLES.MEMBER,    dept:'pdc',         unit:'u1', shift:'A' },
  { id:'singaravelu',  name:'Singaravelu',  email:'singaravelu@alubee.com',          role:ROLES.MEMBER,    dept:'pdc',         unit:'u1', shift:'A' },
  { id:'murali',       name:'Murali',       email:'murali@alubee.com',               role:ROLES.MEMBER,    dept:'pdc',         unit:'u1', shift:'B' },
  { id:'sivaprakasam', name:'Sivaprakasam', email:'sivaprakasam@alubee.com',         role:ROLES.MEMBER,    dept:'pdc',         unit:'u1', shift:'B' },
  // PDC Maintenance
  { id:'mahendhiran',  name:'Mahendhiran',  email:'mahendhiran@alubee.com',          role:ROLES.DEPT_HEAD, dept:'pdc_maint',   unit:'u1', shift:'common' },
  { id:'kalaivanan',   name:'Kalaivanan',   email:'kalaivanan@alubee.com',           role:ROLES.MEMBER,    dept:'pdc_maint',   unit:'u1', shift:'common' },
  // Fettling
  { id:'nagaraj',      name:'Nagaraj',      email:'nagaraj@alubee.com',              role:ROLES.DEPT_HEAD, dept:'fettling',    unit:'u1', shift:'A' },
  { id:'manju',        name:'Manju',        email:'manju@alubee.com',                role:ROLES.MEMBER,    dept:'fettling',    unit:'u1', shift:'A' },
  { id:'muniraj_f',    name:'Muniraj',      email:'muniraj.fettling@alubee.com',     role:ROLES.DEPT_HEAD, dept:'fettling',    unit:'u1', shift:'B' },
  { id:'chandran',     name:'Chandran',     email:'chandran@alubee.com',             role:ROLES.MEMBER,    dept:'fettling',    unit:'u1', shift:'B' },
  { id:'raja',         name:'Raja (QC)',    email:'raja@alubee.com',                 role:ROLES.MEMBER,    dept:'fettling',    unit:'u1', shift:'common' },
  // CNC/VMC
  { id:'eswaran',      name:'Eswaran',      email:'eswaran@alubee.com',              role:ROLES.DEPT_HEAD, dept:'cnc_vmc',     unit:'u1', shift:'common' },
  { id:'manivannan',   name:'Manivannan',   email:'manivannan@alubee.com',           role:ROLES.MEMBER,    dept:'cnc_vmc',     unit:'u1', shift:'common' },
  { id:'velayutham',   name:'Velayutham',   email:'velayutham@alubee.com',           role:ROLES.MEMBER,    dept:'cnc_vmc',     unit:'u1', shift:'common' },
  // Secondary
  { id:'udaykumar',    name:'Udaykumar',    email:'udaykumar@alubee.com',            role:ROLES.DEPT_HEAD, dept:'secondary',   unit:'u1', shift:'common' },
  { id:'muniraj_s',    name:'Muniraj',      email:'muniraj.secondary@alubee.com',    role:ROLES.MEMBER,    dept:'secondary',   unit:'u1', shift:'A' },
  { id:'suresh',       name:'Suresh',       email:'suresh@alubee.com',               role:ROLES.MEMBER,    dept:'secondary',   unit:'u1', shift:'B' },
  // Assembly
  { id:'vignesh',      name:'Vignesh',      email:'vignesh@alubee.com',              role:ROLES.DEPT_HEAD, dept:'assembly',    unit:'u1', shift:'A' },
  { id:'ravi',         name:'Ravi',         email:'ravi@alubee.com',                 role:ROLES.DEPT_HEAD, dept:'assembly',    unit:'u1', shift:'B' },
  // Final
  { id:'pachayappan',  name:'Pachayappan',  email:'pachayappan@alubee.com',          role:ROLES.DEPT_HEAD, dept:'final',       unit:'u1', shift:'common' },
  { id:'komathi',      name:'Komathi',      email:'komathi@alubee.com',              role:ROLES.MEMBER,    dept:'final',       unit:'u1', shift:'common' },
  // Dispatch
  { id:'mangundu',     name:'Mangundu',     email:'mangundu@alubee.com',             role:ROLES.DEPT_HEAD, dept:'dispatch',    unit:'u1', shift:'common' },
  // Maintenance
  { id:'murugesh',     name:'Murugesh',     email:'murugesh@alubee.com',             role:ROLES.DEPT_HEAD, dept:'maintenance', unit:'u1', shift:'common' },
  { id:'kandhan',      name:'Kandhan',      email:'kandhan@alubee.com',              role:ROLES.MEMBER,    dept:'maintenance', unit:'u1', shift:'common' },
  // Stores
  { id:'agilan',       name:'Agilan',       email:'agilan@alubee.com',               role:ROLES.DEPT_HEAD, dept:'stores',      unit:'u1', shift:'common' },
  { id:'parmeshwari',  name:'Parmeshwari',  email:'parmeshwari@alubee.com',          role:ROLES.MEMBER,    dept:'stores',      unit:'u1', shift:'common' },
  { id:'mohan',        name:'Mohan',        email:'mohan@alubee.com',                role:ROLES.MEMBER,    dept:'stores',      unit:'u1', shift:'common' },
  { id:'nayaz',        name:'Nayaz',        email:'nayaz@alubee.com',                role:ROLES.MEMBER,    dept:'stores',      unit:'u1', shift:'common' },
  // Toolroom
  { id:'munusamy',     name:'Munusamy',     email:'munusamy@alubee.com',             role:ROLES.DEPT_HEAD, dept:'toolroom',    unit:'u1', shift:'common' },
  { id:'durai',        name:'Durai',        email:'durai@alubee.com',                role:ROLES.MEMBER,    dept:'toolroom',    unit:'u1', shift:'common' },
  { id:'ramachandriah',name:'Ramachandriah',email:'ramachandriah@alubee.com',        role:ROLES.MEMBER,    dept:'toolroom',    unit:'u1', shift:'common' },
  { id:'arumugam',     name:'Arumugam',     email:'arumugam@alubee.com',             role:ROLES.MEMBER,    dept:'toolroom',    unit:'u1', shift:'common' },
  { id:'gowtham',      name:'Gowtham',      email:'gowtham@alubee.com',              role:ROLES.MEMBER,    dept:'toolroom',    unit:'u1', shift:'common' },
  { id:'vadivel',      name:'Vadivel',      email:'vadivel@alubee.com',              role:ROLES.MEMBER,    dept:'toolroom',    unit:'u1', shift:'common' },
  // Design
  { id:'anbu',         name:'Anbu',         email:'anbu@alubee.com',                 role:ROLES.MEMBER,    dept:'design',      unit:'u1', shift:'common' },
  { id:'murugan',      name:'Murugan',      email:'murugan@alubee.com',              role:ROLES.MEMBER,    dept:'design',      unit:'u1', shift:'common' },
  // NPD
  { id:'basha',        name:'Basha',        email:'basha@alubee.com',                role:ROLES.DEPT_HEAD, dept:'npd',         unit:'u1', shift:'common' },
  { id:'arul',         name:'Arul',         email:'arul@alubee.com',                 role:ROLES.MEMBER,    dept:'npd',         unit:'u1', shift:'common' },
  { id:'muthu',        name:'Muthu',        email:'muthu@alubee.com',                role:ROLES.MEMBER,    dept:'npd',         unit:'u1', shift:'common' },
  { id:'sampath',      name:'Sampath (CMM)',email:'sampath@alubee.com',              role:ROLES.MEMBER,    dept:'npd',         unit:'u1', shift:'common' },
  // PPC
  { id:'gopi',         name:'Gopi',         email:'gopi@alubee.com',                 role:ROLES.DEPT_HEAD, dept:'ppc',         unit:'u1', shift:'common' },
  { id:'udhay',        name:'Udhay',        email:'udhay@alubee.com',                role:ROLES.DEPT_HEAD, dept:'ppc',         unit:'u1', shift:'common' },
  // ERP
  { id:'gokila',       name:'Gokila',       email:'gokila@alubee.com',               role:ROLES.DEPT_HEAD, dept:'erp',         unit:'u1', shift:'common' },
  // Accounts
  { id:'mahadesh',     name:'Mahadesh',     email:'mahadesh@alubee.com',             role:ROLES.DEPT_HEAD, dept:'accounts',    unit:'u1', shift:'common' },
  // HR
  { id:'meena',        name:'Meena',        email:'meena@alubee.com',                role:ROLES.DEPT_HEAD, dept:'hr',          unit:'u1', shift:'common' },
  { id:'indhumathi',   name:'Indhumathi',   email:'indhumathi@alubee.com',           role:ROLES.MEMBER,    dept:'hr',          unit:'u1', shift:'common' },
  // Shotblasting
  { id:'selva',        name:'Selva',        email:'selva@alubee.com',                role:ROLES.DEPT_HEAD, dept:'shotblasting',unit:'u1', shift:'common' },
  // Fabrication
  { id:'john',         name:'John',         email:'john@alubee.com',                 role:ROLES.DEPT_HEAD, dept:'fabrication', unit:'u1', shift:'common' },
  // TE
  { id:'jmd_u1',       name:'JMD',          email:'jmd@alubee.com',                  role:ROLES.DEPT_HEAD, dept:'te',          unit:'u1', shift:'common' },
  // Mould
  { id:'sivakumar_u1', name:'Sivakumar',    email:'sivakumar@alubee.com',            role:ROLES.DEPT_HEAD, dept:'mould',       unit:'u1', shift:'common' },
  // Security
  { id:'durai_sec',    name:'Durai',        email:'durai.security@alubee.com',       role:ROLES.DEPT_HEAD, dept:'security',    unit:'u1', shift:'common' },
  { id:'nagamani',     name:'Nagamani',     email:'nagamani@alubee.com',             role:ROLES.MEMBER,    dept:'security',    unit:'u1', shift:'common' },
  { id:'bowri',        name:'Bowri',        email:'bowri@alubee.com',                role:ROLES.MEMBER,    dept:'security',    unit:'u1', shift:'common' },
];

// ─── UNIT 2 ───────────────────────────────────────────────────────────────────
export const USERS_U2 = [
  { id:'owner_u2',       name:'Owner U2',     email:'owner.u2@alubee.com',           role:ROLES.OWNER,     dept:null,          unit:'u2' },
  // PDC
  { id:'logu_pdc',       name:'Loganathan',   email:'loganathan.pdc@alubee.com',     role:ROLES.DEPT_HEAD, dept:'pdc',         unit:'u2', shift:'common' },
  { id:'rajiv_u2',       name:'Rajiv',        email:'rajiv@alubee.com',              role:ROLES.MEMBER,    dept:'pdc',         unit:'u2', shift:'A' },
  { id:'pragasam_u2',    name:'Pragasam',     email:'pragasam@alubee.com',           role:ROLES.MEMBER,    dept:'pdc',         unit:'u2', shift:'A' },
  { id:'arun_u2',        name:'Arun',         email:'arun@alubee.com',               role:ROLES.MEMBER,    dept:'pdc',         unit:'u2', shift:'B' },
  { id:'sivan_u2',       name:'Sivan',        email:'sivan@alubee.com',              role:ROLES.MEMBER,    dept:'pdc',         unit:'u2', shift:'B' },
  // PDC Maintenance
  { id:'sivakumar_u2',   name:'Sivakumar',    email:'sivakumar.u2@alubee.com',       role:ROLES.DEPT_HEAD, dept:'pdc_maint',   unit:'u2', shift:'common' },
  // Fettling
  { id:'shekar_u2',      name:'Shekar',       email:'shekar@alubee.com',             role:ROLES.DEPT_HEAD, dept:'fettling',    unit:'u2', shift:'A' },
  { id:'velu_u2',        name:'Velu',         email:'velu@alubee.com',               role:ROLES.DEPT_HEAD, dept:'fettling',    unit:'u2', shift:'B' },
  // CNC/VMC
  { id:'logu_cnc',       name:'Loganathan',   email:'loganathan.cnc@alubee.com',     role:ROLES.MEMBER,    dept:'cnc_vmc',     unit:'u2', shift:'A' },
  { id:'shagul_u2',      name:'Shagul',       email:'shagul@alubee.com',             role:ROLES.MEMBER,    dept:'cnc_vmc',     unit:'u2', shift:'A' },
  { id:'shaffi_u2',      name:'Shaffi',       email:'shaffi@alubee.com',             role:ROLES.MEMBER,    dept:'cnc_vmc',     unit:'u2', shift:'B' },
  { id:'nandakishor_u2', name:'Nandakishor',  email:'nandakishor@alubee.com',        role:ROLES.MEMBER,    dept:'cnc_vmc',     unit:'u2', shift:'B' },
  // Final
  { id:'balaji_u2',      name:'Balaji',       email:'balaji@alubee.com',             role:ROLES.DEPT_HEAD, dept:'final',       unit:'u2', shift:'common' },
  { id:'rajesh_u2',      name:'Rajesh',       email:'rajesh@alubee.com',             role:ROLES.MEMBER,    dept:'final',       unit:'u2', shift:'common' },
  { id:'kaliraj_u2',     name:'Kaliraj',      email:'kaliraj@alubee.com',            role:ROLES.MEMBER,    dept:'final',       unit:'u2', shift:'common' },
  // Maintenance
  { id:'murugesh_u2',    name:'Murugesh',     email:'murugesh.u2@alubee.com',        role:ROLES.DEPT_HEAD, dept:'maintenance', unit:'u2', shift:'common' },
  { id:'kandhan_u2',     name:'Kandhan',      email:'kandhan.u2@alubee.com',         role:ROLES.MEMBER,    dept:'maintenance', unit:'u2', shift:'common' },
  // Stores
  { id:'thilagavathi',   name:'Thilagavathi', email:'thilagavathi@alubee.com',       role:ROLES.DEPT_HEAD, dept:'stores',      unit:'u2', shift:'common' },
  // Security
  { id:'nittu_sec',      name:'Nittu',        email:'nittu.security@alubee.com',     role:ROLES.DEPT_HEAD, dept:'security',    unit:'u2', shift:'common' },
  // Toolroom
  { id:'rudresh_u2',     name:'Rudresh',      email:'rudresh@alubee.com',            role:ROLES.DEPT_HEAD, dept:'toolroom',    unit:'u2', shift:'common' },
  // PPC
  { id:'gokul_u2',       name:'Gokul',        email:'gokul@alubee.com',              role:ROLES.MEMBER,    dept:'ppc',         unit:'u2', shift:'common' },
  { id:'logu_ppc',       name:'Loganathan',   email:'loganathan.ppc@alubee.com',     role:ROLES.MEMBER,    dept:'ppc',         unit:'u2', shift:'common' },
  // ERP
  { id:'madubala_u2',    name:'Madubala',     email:'madubala@alubee.com',           role:ROLES.DEPT_HEAD, dept:'erp',         unit:'u2', shift:'common' },
  // TE
  { id:'jmd_u2',         name:'JMD',          email:'jmd.u2@alubee.com',             role:ROLES.DEPT_HEAD, dept:'te',          unit:'u2', shift:'common' },
];

export const ALL_USERS       = [...USERS_U1, ...USERS_U2];
export const getUsersByUnit  = (unit) => unit === 'u2' ? USERS_U2 : USERS_U1;
export const getUsersByDept  = (deptId, unit) => getUsersByUnit(unit).filter(u => u.dept === deptId);
export const getDeptLabel    = (deptId) => DEPARTMENTS.find(d => d.id === deptId)?.label || deptId;
export const getDeptColor    = (deptId) => DEPARTMENTS.find(d => d.id === deptId)?.color || '#666';
export const getUserByEmail  = (email)  => {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return undefined;
  return ALL_USERS.find(u => String(u.email || '').toLowerCase() === e);
};
