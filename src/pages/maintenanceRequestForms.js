import React, { useEffect, useState } from 'react';
import { createAppRequest, getProfileMobile } from '../utils/requestService';
import {
  machineTypesForDept,
  machinesFor,
  issueGroupsFor,
  flatIssuesFor,
  LINE_STOP_PRIORITIES,
  normalizeMaintUnit,
} from '../data/maintenanceMachines';

function getProfileEmail(userProfile) {
  if (!userProfile) return '';
  if (userProfile.email) return String(userProfile.email).toLowerCase();
  if (userProfile.authEmail) return String(userProfile.authEmail).toLowerCase();
  const mobile = getProfileMobile(userProfile);
  if (mobile) return `${mobile}@mobile.alubee.com`;
  return '';
}

const inpBase = {
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  background: '#fff',
  color: '#111',
};
const lblBase = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  marginBottom: 4,
  display: 'block',
};

export function MachineMaintenanceForm({ userProfile, onSubmitted, onCancel }) {
  const dept = userProfile?.dept || userProfile?.department || '';
  const unit = normalizeMaintUnit(userProfile?.unit);
  const typeOptions = machineTypesForDept(dept);
  const [machineType, setMachineType] = useState(typeOptions[0]?.id || 'pdc');
  const machineList = machinesFor(unit, machineType);
  const groups = issueGroupsFor(machineType);
  const flatIssues = flatIssuesFor(machineType);

  const [form, setForm] = useState({
    machineNumber: machineList[0] || '',
    issueGroup: groups?.[0]?.label || '',
    problemType: groups?.[0]?.issues?.[0] || flatIssues[0] || '',
    description: '',
    lineStop: 'No',
    priority: 'Medium',
  });
  const [saving, setSaving] = useState(false);

  const issueChoices = groups
    ? (groups.find((g) => g.label === form.issueGroup)?.issues || groups[0]?.issues || [])
    : flatIssues;

  useEffect(() => {
    const nextGroups = issueGroupsFor(machineType);
    const nextFlat = flatIssuesFor(machineType);
    const nextMachines = machinesFor(unit, machineType);
    const nextGroup = nextGroups?.[0]?.label || '';
    const nextIssue = nextGroups ? (nextGroups[0]?.issues?.[0] || '') : (nextFlat[0] || '');
    setForm((f) => ({
      ...f,
      machineNumber: nextMachines[0] || '',
      issueGroup: nextGroup,
      problemType: nextIssue,
      priority: f.lineStop === 'Yes' ? 'High' : f.priority,
    }));
  }, [machineType, unit]);

  useEffect(() => {
    if (!groups) return;
    const issues = groups.find((g) => g.label === form.issueGroup)?.issues || [];
    if (issues.length && !issues.includes(form.problemType)) {
      setForm((f) => ({ ...f, problemType: issues[0] }));
    }
  }, [form.issueGroup, groups, form.problemType]);

  const set = (k, v) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'lineStop') {
        if (v === 'Yes') next.priority = 'High';
        else if (!['High', 'Medium', 'Low'].includes(next.priority)) next.priority = 'Medium';
      }
      return next;
    });

  const typeLabel = typeOptions.find((t) => t.id === machineType)?.label || machineType;

  async function submit() {
    if (!machineType) return alert('Machine Type is required');
    if (!form.machineNumber) return alert('Machine Number is required');
    if (groups && !form.issueGroup) return alert('Equipment is required');
    if (!form.problemType) return alert('Issue / Problem Type is required');
    if (!form.description.trim()) return alert('Description is required');
    if (!form.lineStop) return alert('Line Stop is required');
    if (form.lineStop === 'No' && !form.priority) return alert('Priority is required');

    setSaving(true);
    try {
      const employeeMobile = getProfileMobile(userProfile);
      if (!employeeMobile) throw new Error('Your account has no mobile number. Contact Admin.');

      await createAppRequest({
        type: 'machine_maintenance',
        employeeMobile,
        employeeEmail: getProfileEmail(userProfile) || '',
        employeeName: userProfile?.name || userProfile?.employeeName || employeeMobile,
        dept,
        unit,
        machineType,
        machineTypeLabel: typeLabel,
        machineNumber: form.machineNumber,
        issueGroup: groups ? form.issueGroup : '',
        problemType: form.problemType,
        description: form.description.trim(),
        lineStop: form.lineStop === 'Yes',
        priority: form.lineStop === 'Yes' ? 'High' : form.priority,
        approvals: {},
        rejected: false,
        flow: [],
        nextApproverMobile: '',
        autoApproved: true,
        noApproval: true,
      });
      onSubmitted();
    } catch (e) {
      alert('Submit failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>🔧 Machine Maintenance</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lblBase}>Machine Type *</label>
          <select
            style={{ ...inpBase, cursor: typeOptions.length === 1 ? 'default' : 'pointer' }}
            value={machineType}
            onChange={(e) => setMachineType(e.target.value)}
            disabled={typeOptions.length === 1}
          >
            {typeOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          {typeOptions.length === 1 && (
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Locked to your department</div>
          )}
        </div>
        <div>
          <label style={lblBase}>Machine Number *</label>
          <select
            style={{ ...inpBase, cursor: 'pointer' }}
            value={form.machineNumber}
            onChange={(e) => set('machineNumber', e.target.value)}
            disabled={!machineList.length}
          >
            {!machineList.length && <option value="">No machines for this unit/type</option>}
            {machineList.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            {unit === 'u2' ? 'Unit II' : 'Unit I'} · {typeLabel}
          </div>
        </div>

        {groups && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lblBase}>Equipment *</label>
            <select style={{ ...inpBase, cursor: 'pointer' }} value={form.issueGroup} onChange={(e) => set('issueGroup', e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.label}>{g.label}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lblBase}>Issue / Problem Type *</label>
          <select style={{ ...inpBase, cursor: 'pointer' }} value={form.problemType} onChange={(e) => set('problemType', e.target.value)}>
            {issueChoices.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lblBase}>Description *</label>
          <textarea
            style={{ ...inpBase, height: 70, resize: 'vertical' }}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Describe the issue clearly..."
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lblBase}>Line Stop *</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {['Yes', 'No'].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => set('lineStop', opt)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 800,
                  fontSize: 13,
                  border: form.lineStop === opt ? `2px solid ${opt === 'Yes' ? '#dc2626' : '#1e40af'}` : '1px solid #d1d5db',
                  background: form.lineStop === opt ? (opt === 'Yes' ? '#fef2f2' : '#eff6ff') : '#fff',
                  color: form.lineStop === opt ? (opt === 'Yes' ? '#dc2626' : '#1e40af') : '#374151',
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lblBase}>Priority *</label>
          {form.lineStop === 'Yes' ? (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontWeight: 800, color: '#dc2626', fontSize: 13 }}>
              High (auto — Line Stop = Yes)
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {LINE_STOP_PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set('priority', p)}
                  style={{
                    flex: 1,
                    minWidth: 90,
                    padding: '10px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 800,
                    fontSize: 13,
                    border: form.priority === p ? '2px solid #c2410c' : '1px solid #d1d5db',
                    background: form.priority === p ? '#fff7ed' : '#fff',
                    color: form.priority === p ? '#c2410c' : '#374151',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        <button
          onClick={submit}
          disabled={saving || !machineList.length}
          style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#c2410c', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !machineList.length ? 0.7 : 1 }}
        >
          {saving ? '⏳ Submitting…' : '🔧 Submit Machine Maintenance'}
        </button>
      </div>
    </div>
  );
}

const MAINT_DEPTS = [
  'Fettling', 'CNC / VMC', 'Secondary', 'Assembly', 'Dispatch', 'Stores', 'Toolroom',
  'Shot Blasting', 'Maintenance', 'Accounts', 'HR / Admin', 'Security', 'PDC Support', 'Other',
];
const GENERAL_PROBLEM_TYPES = [
  'Electrical', 'Mechanical', 'Civil / Building', 'Pneumatic / Compressed Air',
  'Plumbing', 'Equipment Breakdown', 'Safety / Fire', 'Other',
];

export function GeneralMaintenanceForm({ userProfile, onSubmitted, onCancel }) {
  const unit = normalizeMaintUnit(userProfile?.unit);
  const unitLabel = unit === 'u2' ? 'Unit II' : 'Unit I';
  const [form, setForm] = useState({
    department: MAINT_DEPTS[0],
    problemType: GENERAL_PROBLEM_TYPES[0],
    description: '',
    priority: 'Medium',
    location: '',
    remarks: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.department) return alert('Department is required');
    if (!form.problemType) return alert('Problem Type is required');
    if (!form.description.trim()) return alert('Description is required');
    if (!form.priority) return alert('Priority is required');
    setSaving(true);
    try {
      const employeeMobile = getProfileMobile(userProfile);
      if (!employeeMobile) throw new Error('Your account has no mobile number. Contact Admin.');

      await createAppRequest({
        type: 'general_maintenance',
        employeeMobile,
        employeeEmail: getProfileEmail(userProfile) || '',
        employeeName: userProfile?.name || userProfile?.employeeName || employeeMobile,
        dept: userProfile?.dept || userProfile?.department || '',
        unit,
        unitLabel,
        department: form.department,
        problemType: form.problemType,
        description: form.description.trim(),
        priority: form.priority,
        location: form.location.trim(),
        remarks: form.remarks.trim(),
        approvals: {},
        rejected: false,
        flow: [],
        nextApproverMobile: '',
        autoApproved: true,
        noApproval: true,
      });
      onSubmitted();
    } catch (e) {
      alert('Submit failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>🛠 General Maintenance</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lblBase}>Unit *</label>
          <input style={{ ...inpBase, opacity: 0.9, cursor: 'default' }} value={unitLabel} readOnly />
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Your unit only — cannot raise for the other unit</div>
        </div>
        <div>
          <label style={lblBase}>Department *</label>
          <select style={{ ...inpBase, cursor: 'pointer' }} value={form.department} onChange={(e) => set('department', e.target.value)}>
            {MAINT_DEPTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lblBase}>Problem Type *</label>
          <select style={{ ...inpBase, cursor: 'pointer' }} value={form.problemType} onChange={(e) => set('problemType', e.target.value)}>
            {GENERAL_PROBLEM_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lblBase}>Description *</label>
          <textarea
            style={{ ...inpBase, height: 70, resize: 'vertical' }}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Describe the issue clearly..."
          />
        </div>
        <div>
          <label style={lblBase}>Location / Area</label>
          <input style={inpBase} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Bay 2, Gate, Canteen" />
        </div>
        <div>
          <label style={lblBase}>Priority *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {LINE_STOP_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set('priority', p)}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 800,
                  fontSize: 12,
                  border: form.priority === p ? '2px solid #c2410c' : '1px solid #d1d5db',
                  background: form.priority === p ? '#fff7ed' : '#fff',
                  color: form.priority === p ? '#c2410c' : '#374151',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lblBase}>
            Remarks <span style={{ fontWeight: 500, textTransform: 'none', color: '#9ca3af' }}>(optional)</span>
          </label>
          <input style={inpBase} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#c2410c', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          {saving ? '⏳ Submitting…' : '🛠 Submit General Maintenance'}
        </button>
      </div>
    </div>
  );
}

export function MaintenanceTypePicker({ onPick, onCancel }) {
  return (
    <div style={{ padding: '0 0 16px' }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 14 }}>🛠 Maintenance — choose type</div>
      {[
        { type: 'machine_maintenance', icon: '🔧', label: 'Machine Maintenance', desc: 'PDC, CNC/VMC, Secondary, Fettling — by unit & department' },
        { type: 'general_maintenance', icon: '🛠', label: 'General Maintenance', desc: 'Electrical, mechanical, civil, plumbing, equipment' },
      ].map((opt) => (
        <div
          key={opt.type}
          onClick={() => onPick(opt.type)}
          style={{ background: '#fff7ed', border: '2px solid #fdba74', borderRadius: 14, padding: '16px 18px', marginBottom: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
        >
          <div style={{ fontSize: 28 }}>{opt.icon}</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#c2410c' }}>{opt.label}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{opt.desc}</div>
          </div>
        </div>
      ))}
      <button onClick={onCancel} style={{ marginTop: 4, padding: '10px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        ← Back
      </button>
    </div>
  );
}
