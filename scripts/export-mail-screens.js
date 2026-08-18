const fs = require('fs');
const path = require('path');

const DEPTS = {
  pdc: 'PDC',
  pdc_maint: 'PDC Maintenance',
  fettling: 'Fettling',
  cnc_vmc: 'CNC / VMC',
  secondary: 'Secondary Ops',
  assembly: 'Assembly',
  final: 'Final',
  dispatch: 'Dispatch',
  maintenance: 'Maintenance',
  stores: 'Stores',
  toolroom: 'Toolroom',
  design: 'Design',
  npd: 'NPD / Quality',
  ppc: 'PPC',
  erp: 'ERP',
  accounts: 'Accounts',
  hr: 'HR',
  shotblasting: 'Shotblasting',
  fabrication: 'Fabrication',
  security: 'Security',
  te: 'TE',
  mould: 'Mould',
};

const U1 = [
  ['Owner', 'owner@alubee.com', 'owner', null, 'u1'],
  ['MD', 'md@alubee.com', 'owner', null, 'u1'],
  ['Natesan', 'natesan@alubee.com', 'viewer', null, 'u1'],
  ['Prabhakaran', 'prabha@alubee.com', 'dept_head', 'pdc', 'u1'],
  ['Vijay', 'vijay@alubee.com', 'member', 'pdc', 'u1'],
  ['Singaravelu', 'singaravelu@alubee.com', 'member', 'pdc', 'u1'],
  ['Murali', 'murali@alubee.com', 'member', 'pdc', 'u1'],
  ['Sivaprakasam', 'sivaprakasam@alubee.com', 'member', 'pdc', 'u1'],
  ['Mahendhiran', 'mahendhiran@alubee.com', 'dept_head', 'pdc_maint', 'u1'],
  ['Kalaivanan', 'kalaivanan@alubee.com', 'member', 'pdc_maint', 'u1'],
  ['Nagaraj', 'nagaraj@alubee.com', 'dept_head', 'fettling', 'u1'],
  ['Manju', 'manju@alubee.com', 'member', 'fettling', 'u1'],
  ['Muniraj', 'muniraj.fettling@alubee.com', 'dept_head', 'fettling', 'u1'],
  ['Chandran', 'chandran@alubee.com', 'member', 'fettling', 'u1'],
  ['Raja (QC)', 'raja@alubee.com', 'member', 'fettling', 'u1'],
  ['Eswaran', 'eswaran@alubee.com', 'dept_head', 'cnc_vmc', 'u1'],
  ['Manivannan', 'manivannan@alubee.com', 'member', 'cnc_vmc', 'u1'],
  ['Velayutham', 'velayutham@alubee.com', 'member', 'cnc_vmc', 'u1'],
  ['Udaykumar', 'udaykumar@alubee.com', 'dept_head', 'secondary', 'u1'],
  ['Muniraj', 'muniraj.secondary@alubee.com', 'member', 'secondary', 'u1'],
  ['Suresh', 'suresh@alubee.com', 'member', 'secondary', 'u1'],
  ['Vignesh', 'vignesh@alubee.com', 'dept_head', 'assembly', 'u1'],
  ['Ravi', 'ravi@alubee.com', 'dept_head', 'assembly', 'u1'],
  ['Pachayappan', 'pachayappan@alubee.com', 'dept_head', 'final', 'u1'],
  ['Komathi', 'komathi@alubee.com', 'member', 'final', 'u1'],
  ['Mangundu', 'mangundu@alubee.com', 'dept_head', 'dispatch', 'u1'],
  ['Murugesh', 'murugesh@alubee.com', 'dept_head', 'maintenance', 'u1'],
  ['Kandhan', 'kandhan@alubee.com', 'member', 'maintenance', 'u1'],
  ['Agilan', 'agilan@alubee.com', 'dept_head', 'stores', 'u1'],
  ['Parmeshwari', 'parmeshwari@alubee.com', 'member', 'stores', 'u1'],
  ['Mohan', 'mohan@alubee.com', 'member', 'stores', 'u1'],
  ['Nayaz', 'nayaz@alubee.com', 'member', 'stores', 'u1'],
  ['Munusamy', 'munusamy@alubee.com', 'dept_head', 'toolroom', 'u1'],
  ['Durai', 'durai@alubee.com', 'member', 'toolroom', 'u1'],
  ['Ramachandriah', 'ramachandriah@alubee.com', 'member', 'toolroom', 'u1'],
  ['Arumugam', 'arumugam@alubee.com', 'member', 'toolroom', 'u1'],
  ['Gowtham', 'gowtham@alubee.com', 'member', 'toolroom', 'u1'],
  ['Vadivel', 'vadivel@alubee.com', 'member', 'toolroom', 'u1'],
  ['Anbu', 'anbu@alubee.com', 'member', 'design', 'u1'],
  ['Murugan', 'murugan@alubee.com', 'member', 'design', 'u1'],
  ['Basha', 'basha@alubee.com', 'dept_head', 'npd', 'u1'],
  ['Arul', 'arul@alubee.com', 'member', 'npd', 'u1'],
  ['Muthu', 'muthu@alubee.com', 'member', 'npd', 'u1'],
  ['Sampath (CMM)', 'sampath@alubee.com', 'member', 'npd', 'u1'],
  ['Gopi', 'gopi@alubee.com', 'dept_head', 'ppc', 'u1'],
  ['Udhay', 'udhay@alubee.com', 'dept_head', 'ppc', 'u1'],
  ['Gokila', 'gokila@alubee.com', 'dept_head', 'erp', 'u1'],
  ['Mahadesh', 'mahadesh@alubee.com', 'dept_head', 'accounts', 'u1'],
  ['Meena', 'meena@alubee.com', 'dept_head', 'hr', 'u1'],
  ['Indhumathi', 'indhumathi@alubee.com', 'member', 'hr', 'u1'],
  ['Selva', 'selva@alubee.com', 'dept_head', 'shotblasting', 'u1'],
  ['John', 'john@alubee.com', 'dept_head', 'fabrication', 'u1'],
  ['JMD', 'jmd@alubee.com', 'dept_head', 'te', 'u1'],
  ['Sivakumar', 'sivakumar@alubee.com', 'dept_head', 'mould', 'u1'],
  ['Durai', 'durai.security@alubee.com', 'dept_head', 'security', 'u1'],
  ['Nagamani', 'nagamani@alubee.com', 'member', 'security', 'u1'],
  ['Bowri', 'bowri@alubee.com', 'member', 'security', 'u1'],
];

const U2 = [
  ['Owner U2', 'owner.u2@alubee.com', 'owner', null, 'u2'],
  ['Loganathan', 'loganathan.pdc@alubee.com', 'dept_head', 'pdc', 'u2'],
  ['Rajiv', 'rajiv@alubee.com', 'member', 'pdc', 'u2'],
  ['Pragasam', 'pragasam@alubee.com', 'member', 'pdc', 'u2'],
  ['Arun', 'arun@alubee.com', 'member', 'pdc', 'u2'],
  ['Sivan', 'sivan@alubee.com', 'member', 'pdc', 'u2'],
  ['Sivakumar', 'sivakumar.u2@alubee.com', 'dept_head', 'pdc_maint', 'u2'],
  ['Shekar', 'shekar@alubee.com', 'dept_head', 'fettling', 'u2'],
  ['Velu', 'velu@alubee.com', 'dept_head', 'fettling', 'u2'],
  ['Loganathan', 'loganathan.cnc@alubee.com', 'member', 'cnc_vmc', 'u2'],
  ['Shagul', 'shagul@alubee.com', 'member', 'cnc_vmc', 'u2'],
  ['Shaffi', 'shaffi@alubee.com', 'member', 'cnc_vmc', 'u2'],
  ['Nandakishor', 'nandakishor@alubee.com', 'member', 'cnc_vmc', 'u2'],
  ['Balaji', 'balaji@alubee.com', 'dept_head', 'final', 'u2'],
  ['Rajesh', 'rajesh@alubee.com', 'member', 'final', 'u2'],
  ['Kaliraj', 'kaliraj@alubee.com', 'member', 'final', 'u2'],
  ['Murugesh', 'murugesh.u2@alubee.com', 'dept_head', 'maintenance', 'u2'],
  ['Kandhan', 'kandhan.u2@alubee.com', 'member', 'maintenance', 'u2'],
  ['Thilagavathi', 'thilagavathi@alubee.com', 'dept_head', 'stores', 'u2'],
  ['Nittu', 'nittu.security@alubee.com', 'dept_head', 'security', 'u2'],
  ['Rudresh', 'rudresh@alubee.com', 'dept_head', 'toolroom', 'u2'],
  ['Gokul', 'gokul@alubee.com', 'member', 'ppc', 'u2'],
  ['Loganathan', 'loganathan.ppc@alubee.com', 'member', 'ppc', 'u2'],
  ['Madubala', 'madubala@alubee.com', 'dept_head', 'erp', 'u2'],
  ['JMD', 'jmd.u2@alubee.com', 'dept_head', 'te', 'u2'],
];

const CP = new Set([
  'owner@alubee.com',
  'md@alubee.com',
  'agilan@alubee.com',
  'mohan@alubee.com',
  'pachayappan@alubee.com',
  'gopi@alubee.com',
  'udhay@alubee.com',
]);

const ROLE_L = {
  owner: 'Owner',
  dept_head: 'Dept Head',
  member: 'Member',
  viewer: 'Viewer',
};

function screens(email, role, dept) {
  const isOwner = role === 'owner';
  const isDH = role === 'dept_head';
  const isPPC = dept === 'ppc';
  const s = ['Tasks', 'Requests', 'Maintenance', 'Logistics'];
  if (isOwner || isDH || isPPC) s.push('Dashboard');
  if (isOwner || isDH) s.push('Ageing');
  if (
    isOwner ||
    email === 'gokila@alubee.com' ||
    email === 'madubala@alubee.com' ||
    dept === 'pdc'
  ) {
    s.push('ERP');
  }
  if (
    isOwner ||
    email === 'agilan@alubee.com' ||
    email === 'thilagavathi@alubee.com'
  ) {
    s.push('Stores');
  }
  if (isOwner || isPPC) s.push('Exec Summary', 'Revenue', 'Supplier', 'Customers');
  if (isOwner || CP.has(email)) s.push('Child Parts');
  if (isOwner) s.push('MWS', 'Admin');
  if (isOwner || dept === 'security') s.push('Security');
  return s.join('; ');
}

function csvEscape(v) {
  return '"' + String(v).replace(/"/g, '""') + '"';
}

const rows = [['Name', 'Mail ID', 'Unit', 'Department', 'Role', 'Screens']];
for (const [name, email, role, dept, unit] of [...U1, ...U2]) {
  rows.push([
    name,
    email,
    unit === 'u2' ? 'Unit II' : 'Unit I',
    dept ? DEPTS[dept] : '—',
    ROLE_L[role],
    screens(email, role, dept),
  ]);
}

const out = path.join(__dirname, '..', 'user-mail-screen-access.csv');
fs.writeFileSync(out, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'utf8');
console.log('Wrote', rows.length - 1, 'rows to', out);
