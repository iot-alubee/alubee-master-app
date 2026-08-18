/** Machine numbers + issue catalogs for Machine Maintenance requests */

export const MACHINE_TYPE_OPTIONS = [
  { id: 'pdc', label: 'PDC' },
  { id: 'cnc_vmc', label: 'CNC / VMC' },
  { id: 'secondary', label: 'Secondary' },
  { id: 'fettling', label: 'Fettling' },
];

/** Unit I / Unit II machine numbers by type (from plant list) */
export const MACHINES_BY_UNIT = {
  u1: {
    pdc: [
      '125T-1', '125T-2', '125T-3', '125T-4', '125T-5', '125T-6', '125T-7',
      '250T-1',
      '350T-1', '350T-2', '350T-3', '350T-4',
    ],
    cnc_vmc: [
      'CNC-1', 'CNC-2', 'CNC-3', 'CNC-4', 'CNC-5', 'CNC-6', 'CNC-7', 'CNC-8', 'CNC-9',
      'VMC-1', 'VMC-2', 'VMC-3', 'VMC-4', 'VMC-5', 'VMC-6', 'VMC-7', 'VMC-8',
    ],
    fettling: [
      'TM-2', 'TM-3', 'TM-4', 'TM-5', 'TM-6', 'TM-8', 'TM-9', 'TM-10', 'TM-11', 'TM-12', 'TM-13', 'TM-14', 'TM-15',
      'DM-1', 'DM-2',
      'MM-1', 'MM-2',
      'SB-1', 'SB-2',
    ],
    secondary: [
      'DM-1', 'DM-2', 'DM-3', 'DM-4', 'DM-5', 'DM-6', 'DM-7', 'DM-8', 'DM-9', 'DM-10',
      'DM-11', 'DM-12', 'DM-13', 'DM-14', 'DM-15', 'DM-16', 'DM-17', 'DM-18', 'DM-19', 'DM-20', 'DM-21', 'DM-22',
      'TM-1', 'TM-2', 'TM-3', 'TM-4', 'TM-5', 'TM-6', 'TM-7', 'TM-8', 'TM-9', 'TM-10', 'TM-11', 'TM-12', 'TM-13', 'TM-14',
      'GDM-1', 'GDM-2', 'GDM-3', 'GDM-4', 'GDM-5', 'GDM-6', 'GDM-7', 'GDM-8', 'GDM-9', 'GDM-10',
      'GM-1', 'GM-2', 'MM-1',
    ],
  },
  u2: {
    pdc: [
      '125T-1', '125T-2',
      '250T-1', '250T-2',
      '350T-1', '350T-2', '350T-3', '350T-4',
      '500T-1',
      '650T-1', '650T-2',
      '800T-1',
    ],
    cnc_vmc: [
      'CNC-1', 'CNC-2', 'CNC-3', 'CNC-4', 'CNC-5', 'CNC-6',
      'VMC-1', 'VMC-2', 'VMC-3', 'VMC-4', 'VMC-5', 'VMC-6', 'VMC-7', 'VMC-8',
      'VMC-9', 'VMC-10', 'VMC-11', 'VMC-12', 'VMC-13', 'VMC-14', 'VMC-15',
    ],
    fettling: ['TM-1', 'TM-2', 'TM-3', 'TM-4', 'TM-5', 'TM-6', 'TM-7'],
    secondary: [], // not listed for Unit II
  },
};

/** Flat issue list for PDC (from issue screenshot) */
export const PDC_ISSUES = [
  'Motor', 'Ladle', 'Furnace', 'Pump', 'Extractor', 'Sprayer', 'Accumulator',
  'Hand Control Box', 'Panel Box', 'Lubrication', 'Toggle Link', 'Shut', 'Shut Bush',
  'Ladle Encoder', 'Hydraulic Valve', 'Injection Piston', 'Ejector Piston', 'Die Close Piston',
];

/** CNC/VMC issue categories (from plant alarm / issue list) */
export const CNC_VMC_ISSUES = [
  'Turret not clamped',
  'Turret index timeout',
  'Chuck not unclamped',
  'Chuck not clamped',
  'Chuck clamping pressure low',
  'Hydraulic pressure down',
  'Insufficient lubrication oil',
  'Lubrication pressure still down',
  'Illegal current loop',
  'Illegal gear ratio parameter',
  'APC alarm',
  'Spindle alarm',
  'X-Axis VRDY off',
  'Z-Axis VRDY off',
  'Axis turret inch on',
  'Axis excess error',
  'Inverter IPM alarm',
  'Emergency stop alarm',
  'Servo alarm',
  'Hydraulic pump overheat',
  'Spindle motor overheat',
  'Drive overload',
  'Safety interlock',
  'Overcurrent power circuit',
  'Chuck active overtime',
  'Tool change cycle interrupted',
  'AC control cabinet temp high',
  'Cooling fan failure',
];

/** Secondary — grouped by sub-machine (from issue screenshot) */
export const SECONDARY_ISSUE_GROUPS = [
  {
    id: 'drilling',
    label: 'Drilling Machine',
    issues: ['Gearbox', 'Motor Issue', 'Spindle Problem', 'Electrical Issue'],
  },
  {
    id: 'gang_drilling',
    label: 'Gang Drilling Machine',
    issues: ['Sensor Issue', 'Auto Mode Issue', 'Job Clamping Issue'],
  },
  {
    id: 'tapping',
    label: 'Tapping Machine',
    issues: ['Spindle Issue', 'Contactor Problem', 'Motor Problem', 'Limit Switch', 'Gearbox', 'Pulley Motor'],
  },
  {
    id: 'milling',
    label: 'Milling Machine',
    issues: ['Gearbox Problem', 'Bed Movement Issue', 'Motor Issue'],
  },
  {
    id: 'grooving',
    label: 'Grooving Machine',
    issues: ['Hydraulic Power Pack', 'Motor Problem', 'Pulley', 'Electrical Issue', 'Spindle Issue'],
  },
];

/** Fettling — grouped by sub-machine (from issue screenshot) */
export const FETTLING_ISSUE_GROUPS = [
  {
    id: 'trimming',
    label: 'Trimming Machine',
    issues: ['Power Pack Hydraulic', 'Limit Switch', 'Hydraulic Cylinder'],
  },
  {
    id: 'milling',
    label: 'Milling Machine',
    issues: ['Gearbox Problem', 'Bed Movement Issue', 'Motor Issue'],
  },
  {
    id: 'sand_blast',
    label: 'Sand Blast',
    issues: ['General Issue', 'Other'],
  },
];

export const LINE_STOP_PRIORITIES = ['High', 'Medium', 'Low'];

export function normalizeMaintUnit(unit) {
  return unit === 'u2' || unit === 'Unit II' ? 'u2' : 'u1';
}

/** Limit machine types by user's department */
export function machineTypesForDept(dept) {
  const d = String(dept || '').toLowerCase();
  if (d === 'pdc' || d === 'pdc_maint') return MACHINE_TYPE_OPTIONS.filter((t) => t.id === 'pdc');
  if (d === 'cnc_vmc') return MACHINE_TYPE_OPTIONS.filter((t) => t.id === 'cnc_vmc');
  if (d === 'secondary') return MACHINE_TYPE_OPTIONS.filter((t) => t.id === 'secondary');
  if (d === 'fettling' || d === 'shotblasting') return MACHINE_TYPE_OPTIONS.filter((t) => t.id === 'fettling');
  // Maintenance / other roles can raise for any shop
  return [...MACHINE_TYPE_OPTIONS];
}

export function machinesFor(unit, machineType) {
  const u = normalizeMaintUnit(unit);
  const list = MACHINES_BY_UNIT[u]?.[machineType] || [];
  return list;
}

export function issueGroupsFor(machineType) {
  if (machineType === 'secondary') return SECONDARY_ISSUE_GROUPS;
  if (machineType === 'fettling') return FETTLING_ISSUE_GROUPS;
  return null;
}

export function flatIssuesFor(machineType) {
  if (machineType === 'pdc') return PDC_ISSUES;
  if (machineType === 'cnc_vmc') return CNC_VMC_ISSUES;
  return [];
}
