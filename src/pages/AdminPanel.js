import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DEPARTMENTS, getDeptLabel } from '../data/orgData';
import {
  APP_ROLES,
  APP_UNITS,
  APP_SCREENS,
  autoReportingTo,
  roleHasFullAccess,
  roleNeedsPageAccess,
  isJmdRole,
  roleNeedsUnit,
  roleNeedsReportingTo,
  unitForAppRole,
  unitLabelForUser,
  getRoleLabel,
  canAccessScreen,
  suggestFromWorkEmail,
} from '../data/appRoles';
import { createAppUser, updateAppUser, deleteAppUser, subscribeAppUsers } from '../utils/userService';

const emptyForm = {
  unit: '',
  department: '',
  employeeId: '',
  employeeName: '',
  role: '',
  reportingTo: '',
  mobile: '',
  linkedEmail: '',
  pin: '',
  pageAccess: [],
};

export default function AdminPanel({ dark = true, onBack }) {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [mapHint, setMapHint] = useState('');

  const allowed = canAccessScreen(userProfile, 'admin') || roleHasFullAccess(userProfile?.appRole);

  useEffect(() => {
    if (!allowed) return;
    const unsub = subscribeAppUsers((list) => {
      setUsers((prev) => {
        // Avoid re-render if identity list is unchanged
        if (
          prev.length === list.length &&
          prev.every(
            (u, i) =>
              u.id === list[i].id &&
              u.updatedAt === list[i].updatedAt &&
              u.name === list[i].name &&
              u.mobile === list[i].mobile &&
              u.linkedEmail === list[i].linkedEmail
          )
        ) {
          return prev;
        }
        return list;
      });
    });
    return () => unsub && unsub();
  }, [allowed]);

  const activeUsers = useMemo(
    () => (users || []).filter((u) => u.active !== false),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeUsers;
    return activeUsers.filter((u) =>
      [u.name, u.employeeId, u.mobile, u.linkedEmail, u.dept, getRoleLabel(u.appRole), u.reportingTo]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [activeUsers, search]);

  // Mark page busy while Add/Edit modal is open so version-check never wipes the form
  useEffect(() => {
    if (modalOpen) document.body.dataset.alubeeAdminBusy = '1';
    else delete document.body.dataset.alubeeAdminBusy;
    return () => { delete document.body.dataset.alubeeAdminBusy; };
  }, [modalOpen]);

  const needsPageAccess = roleNeedsPageAccess(form.role);
  const reportingLocked = form.role === 'member_supervisor' || isJmdRole(form.role);
  const isEmployee = form.role === 'member_employee';
  const isMd = form.role === 'md';
  const isJmd = isJmdRole(form.role);
  const isEdit = !!editingId;

  // MD: no unit / reporting. JMD 1 → Unit I, JMD 2 → Unit II. JMD → MD. Supervisor → JMD by unit.
  useEffect(() => {
    if (!modalOpen) return;
    setForm((f) => {
      const unit = unitForAppRole(f.role, f.unit);
      let reportingTo = f.reportingTo;
      if (!roleNeedsReportingTo(f.role)) reportingTo = '';
      else if (isJmdRole(f.role)) reportingTo = 'MD';
      else if (f.role === 'member_supervisor' && unit) reportingTo = autoReportingTo(f.role, unit);
      if (unit === f.unit && reportingTo === f.reportingTo) return f;
      return { ...f, unit, reportingTo };
    });
  }, [form.role, form.unit, modalOpen]);

  // Admin role always has every screen
  useEffect(() => {
    if (!modalOpen) return;
    if (roleHasFullAccess(form.role)) {
      setForm((f) => ({ ...f, pageAccess: APP_SCREENS.map((s) => s.id) }));
    }
  }, [form.role, modalOpen]);

  const supervisorOptions = useMemo(() => {
    if (!form.unit) return [];
    const wantUnit = String(form.unit).toLowerCase().trim();
    return activeUsers
      .filter((u) => {
        const role = u.appRole || u.role || '';
        if (role !== 'member_supervisor') return false;
        if (editingId && u.id === editingId) return false;
        const uUnit = String(u.unit || '').toLowerCase().trim();
        return uUnit === wantUnit;
      })
      .map((u) => {
        const name = (u.employeeName || u.name || '').trim();
        const empId = String(u.employeeId || '').trim();
        const label = empId ? `${name} (${empId})` : name;
        return { value: label, label, name, empId };
      })
      .filter((o) => o.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeUsers, form.unit, editingId]);

  const reportingOptions = useMemo(() => {
    if (isEmployee) return supervisorOptions;
    // Full-access roles: fixed titles + same-unit supervisors (with employee ID)
    const base = ['MD', 'JMD 1', 'JMD 2', 'Admin'].map((name) => ({ value: name, label: name }));
    return [...base, ...supervisorOptions];
  }, [isEmployee, supervisorOptions]);

  function setField(key, value) {
    setError('');
    setSuccess('');
    if (key === 'linkedEmail') setMapHint('');
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'unit' || key === 'department' || key === 'role') {
        next.unit = unitForAppRole(next.role, next.unit);
        if (!roleNeedsReportingTo(next.role)) {
          next.reportingTo = '';
        } else if (next.role === 'member_employee' && key === 'role') {
          next.reportingTo = '';
        } else if (next.role === 'member_supervisor' && next.unit) {
          next.reportingTo = autoReportingTo(next.role, next.unit);
        } else if (isJmdRole(next.role)) {
          next.reportingTo = 'MD';
        }
        if (key === 'role') {
          if (roleHasFullAccess(next.role)) {
            next.pageAccess = APP_SCREENS.map((s) => s.id);
          } else if (roleHasFullAccess(f.role)) {
            next.pageAccess = [];
          }
        }
      }
      return next;
    });
  }

  /** Apply Work Email → unit/dept/role/screens from org chart (mobile still entered by Admin). */
  function applyWorkEmailMapping(rawEmail) {
    const email = String(rawEmail || '').trim().toLowerCase();
    setMapHint('');
    if (!email) return;
    const sug = suggestFromWorkEmail(email);
    if (!sug.found) {
      setMapHint(`No org directory match for ${email}. You can still save — set role & screens manually.`);
      return;
    }
    setForm((f) => {
      const next = {
        ...f,
        linkedEmail: sug.email,
        employeeName: f.employeeName || sug.name,
        unit: sug.unit || f.unit,
        department: sug.department || f.department || (roleHasFullAccess(sug.role) ? 'it' : ''),
        role: sug.role || f.role,
        pageAccess: roleHasFullAccess(sug.role)
          ? APP_SCREENS.map((s) => s.id)
          : (Array.isArray(sug.pageAccess) ? sug.pageAccess : f.pageAccess),
      };
      next.unit = unitForAppRole(next.role, next.unit);
      if (!roleNeedsReportingTo(next.role)) {
        next.reportingTo = '';
      } else if (isJmdRole(next.role)) {
        next.reportingTo = 'MD';
      } else if (next.role === 'member_supervisor' && next.unit) {
        next.reportingTo = autoReportingTo(next.role, next.unit);
      } else if (sug.reportingTo && !f.reportingTo) {
        next.reportingTo = sug.reportingTo;
      }
      return next;
    });
    const screenLabels = (sug.pageAccess || [])
      .map((id) => APP_SCREENS.find((s) => s.id === id)?.label || id)
      .join(', ');
    setMapHint(
      `Mapped ${sug.name}: ${getRoleLabel(sug.role)} · screens: ${
        roleHasFullAccess(sug.role) ? 'Full access' : screenLabels || '—'
      }. Enter mobile + PIN, then save.`
    );
  }

  function toggleScreen(id) {
    setForm((f) => {
      const set = new Set(f.pageAccess || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...f, pageAccess: Array.from(set) };
    });
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setSuccess('');
    setMapHint('');
    setModalOpen(true);
  }

  function openEdit(u) {
    setEditingId(u.id);
    setForm({
      unit: u.unit || '',
      department: u.dept || u.department || '',
      employeeId: u.employeeId || '',
      employeeName: u.employeeName || u.name || '',
      role: u.appRole || '',
      reportingTo: u.reportingTo || '',
      mobile: u.mobile || '',
      linkedEmail: u.linkedEmail || '',
      pin: '', // leave blank unless resetting
      pageAccess: Array.isArray(u.pageAccess) ? [...u.pageAccess] : [],
    });
    setError('');
    setSuccess('');
    setMapHint('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setMapHint('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const required = [
      ...(roleNeedsUnit(form.role) ? [['unit', 'Unit']] : []),
      ['department', 'Department'],
      ['employeeId', 'Employee ID'],
      ['employeeName', 'Employee Name'],
      ['role', 'Role'],
      ...(roleNeedsReportingTo(form.role) ? [['reportingTo', 'Reporting to']] : []),
      ['mobile', 'Mobile Number'],
    ];
    for (const [key, label] of required) {
      if (!String(form[key] || '').trim()) {
        setError(`${label} is mandatory`);
        return;
      }
    }
    if (!isEdit && !/^\d{4}$/.test(form.pin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }
    if (isEdit && form.pin && !/^\d{4}$/.test(form.pin)) {
      setError('PIN must be exactly 4 digits (or leave blank to keep current)');
      return;
    }
    if (needsPageAccess && (!form.pageAccess || form.pageAccess.length === 0)) {
      setError('Select at least one screen');
      return;
    }
    if (isEmployee && supervisorOptions.length === 0) {
      setError('No Member - Supervisor found for this Unit. Add a supervisor first.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await updateAppUser(editingId, {
          unit: unitForAppRole(form.role, form.unit),
          department: form.department,
          employeeId: form.employeeId.trim(),
          employeeName: form.employeeName.trim(),
          role: form.role,
          reportingTo: roleNeedsReportingTo(form.role) ? form.reportingTo.trim() : '',
          linkedEmail: form.linkedEmail.trim().toLowerCase(),
          pageAccess: form.pageAccess,
          pin: form.pin || undefined,
        });
        setSuccess(`Updated ${form.employeeName.trim()}`);
        closeModal();
      } else {
        const createdName = form.employeeName.trim();
        await createAppUser({
          unit: unitForAppRole(form.role, form.unit),
          department: form.department,
          employeeId: form.employeeId.trim(),
          employeeName: createdName,
          role: form.role,
          reportingTo: roleNeedsReportingTo(form.role) ? form.reportingTo.trim() : '',
          mobile: form.mobile,
          linkedEmail: form.linkedEmail.trim().toLowerCase(),
          pin: form.pin,
          pageAccess: form.pageAccess,
        });
        // Stay on Admin Panel — clear only per-user fields so next Excel row is fast
        setSuccess(`Created ${createdName}. Add the next user when ready.`);
        setEditingId(null);
        setMapHint('');
        setForm((f) => ({
          ...emptyForm,
          unit: unitForAppRole(f.role, f.unit),
          department: f.department,
          role: f.role,
          reportingTo: !roleNeedsReportingTo(f.role)
            ? ''
            : autoReportingTo(f.role, f.unit) || '',
          pageAccess: roleHasFullAccess(f.role) ? APP_SCREENS.map((s) => s.id) : [],
        }));
        setModalOpen(true);
      }
    } catch (err) {
      setError(err?.message || 'Failed to save user');
    }
    setSaving(false);
  }

  async function handleDelete(u) {
    if (!window.confirm(`Delete user ${u.name} (${u.employeeId})?\nThey will be deactivated and can no longer log in.`)) {
      return;
    }
    try {
      await deleteAppUser(u.id);
      setSuccess(`Deleted ${u.name}`);
    } catch (err) {
      setError(err?.message || 'Failed to delete user');
    }
  }

  if (!allowed) {
    return (
      <div style={wrap(dark)}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <h2 style={{ color: dark ? '#fff' : '#111' }}>Access denied</h2>
        <p style={{ color: '#94a3b8' }}>You need Admin screen access to manage users.</p>
      </div>
    );
  }

  return (
    <div style={wrap(dark)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <button onClick={onBack} style={backBtn}>← Back</button>
          <h1 style={{ margin: '8px 0 4px', color: dark ? '#fff' : '#0f172a', fontSize: 22 }}>Admin Panel</h1>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
            {activeUsers.length} users · {userProfile?.name} · {getRoleLabel(userProfile?.appRole)}
          </p>
        </div>
        <button type="button" onClick={openAdd} style={addBtn}>
          + Add User
        </button>
      </div>

      {success && !modalOpen && <div style={{ ...okBox, marginBottom: 12 }}>{success}</div>}
      {error && !modalOpen && <div style={{ ...errBox, marginBottom: 12 }}>{error}</div>}

      <div style={card(dark)}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...input(dark), maxWidth: 320, flex: 1 }}
            placeholder="Search name, employee ID, mobile, role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{filteredUsers.length} shown</div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {['Employee ID', 'Name', 'Unit', 'Department', 'Role', 'Reporting to', 'Mobile', 'Screens', 'Actions'].map((h) => (
                  <th key={h} style={th(dark)}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...td(dark), textAlign: 'center', color: '#94a3b8', padding: 28 }}>
                    No users yet. Click <strong>+ Add User</strong> to create one.
                  </td>
                </tr>
              )}
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td style={td(dark)}>{u.employeeId || '—'}</td>
                  <td style={td(dark)}>
                    <div style={{ fontWeight: 700 }}>{u.name}</div>
                  </td>
                  <td style={td(dark)}>{unitLabelForUser(u.unit, u.appRole)}</td>
                  <td style={td(dark)}>{getDeptLabel(u.dept) || '—'}</td>
                  <td style={td(dark)}>
                    <span style={rolePill}>{getRoleLabel(u.appRole)}</span>
                  </td>
                  <td style={td(dark)}>{u.reportingTo || '—'}</td>
                  <td style={td(dark)}>{u.mobile || '—'}</td>
                  <td style={{ ...td(dark), fontSize: 11, maxWidth: 160 }}>
                    {roleHasFullAccess(u.appRole)
                      ? 'All'
                      : (u.pageAccess || []).slice(0, 3).join(', ') + ((u.pageAccess || []).length > 3 ? '…' : '') || '—'}
                  </td>
                  <td style={td(dark)}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        style={actionBtn('#3b82f6')}
                        onClick={() => openEdit(u)}
                      >
                        Update
                      </button>
                      <button
                        type="button"
                        style={actionBtn('#ef4444')}
                        onClick={() => handleDelete(u)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div style={overlay} onClick={closeModal}>
          <div style={modal(dark)} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, color: dark ? '#fff' : '#0f172a', fontSize: 18 }}>
                {isEdit ? 'Update User' : 'Add User'}
              </h3>
              <button type="button" onClick={closeModal} style={closeX}>✕</button>
            </div>

            <form onSubmit={handleSubmit} autoComplete="off">
              <div style={formGrid}>
                <Field label="Role *">
                  <select style={input(dark)} value={form.role} onChange={(e) => setField('role', e.target.value)} required>
                    <option value="">Select role</option>
                    {APP_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </Field>

                {isMd ? (
                  <div style={{ gridColumn: '1 / -1', ...hint, marginBottom: 4 }}>
                    MD handles both Unit I and Unit II requests. Unit and Reporting to are not used.
                  </div>
                ) : (
                <Field label="Unit *">
                  <select
                    style={{ ...input(dark), opacity: isJmd ? 0.85 : 1 }}
                    value={form.unit}
                    onChange={(e) => setField('unit', e.target.value)}
                    required
                    disabled={isJmd}
                  >
                    <option value="">Select unit</option>
                    {APP_UNITS.map((u) => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                  {isJmd && (
                    <div style={hint}>
                      {form.role === 'jmd_1' ? 'JMD 1 works in Unit I' : 'JMD 2 works in Unit II'}
                    </div>
                  )}
                </Field>
                )}

                <Field label="Department *">
                  <select style={input(dark)} value={form.department} onChange={(e) => setField('department', e.target.value)} required>
                    <option value="">Select department</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Employee ID *">
                  <input
                    style={input(dark)}
                    value={form.employeeId}
                    onChange={(e) => setField('employeeId', e.target.value)}
                    placeholder="e.g. EMP-1024"
                    required
                    name="alubee-employee-id"
                    autoComplete="off"
                  />
                </Field>

                <Field label="Employee Name *">
                  <input
                    style={input(dark)}
                    value={form.employeeName}
                    onChange={(e) => setField('employeeName', e.target.value)}
                    placeholder="Full name"
                    required
                    name="alubee-employee-name"
                    autoComplete="off"
                  />
                </Field>

                {!isMd && (
                <Field label="Reporting to *">
                  {isJmd ? (
                    <>
                      <input style={{ ...input(dark), opacity: 0.85 }} value={form.reportingTo || 'MD'} readOnly required />
                      <div style={hint}>Auto-filled: JMD reports to MD</div>
                    </>
                  ) : reportingLocked ? (
                    <>
                      <input style={{ ...input(dark), opacity: 0.85 }} value={form.reportingTo} readOnly required />
                      <div style={hint}>
                        Auto-filled: {form.unit === 'u1' ? 'Unit I → JMD 1' : form.unit === 'u2' ? 'Unit II → JMD 2' : 'select unit'}
                      </div>
                    </>
                  ) : isEmployee ? (
                    <>
                      <select
                        style={input(dark)}
                        value={form.reportingTo}
                        onChange={(e) => setField('reportingTo', e.target.value)}
                        required
                        disabled={!form.unit}
                      >
                        <option value="">
                          {!form.unit
                            ? 'Select unit first'
                            : supervisorOptions.length
                              ? 'Select supervisor'
                              : 'No Member-Supervisors in this unit'}
                        </option>
                        {supervisorOptions.map((s) => (
                          <option key={`${s.value}-${s.empId}`} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      <div style={hint}>
                        Only Member - Supervisors from <b>{form.unit === 'u1' ? 'Unit I' : form.unit === 'u2' ? 'Unit II' : 'selected unit'}</b>
                        {' '}· shown as Name (Employee ID)
                      </div>
                    </>
                  ) : (
                    <select
                      style={input(dark)}
                      value={form.reportingTo}
                      onChange={(e) => setField('reportingTo', e.target.value)}
                      required
                    >
                      <option value="">Select reporting manager</option>
                      {reportingOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                </Field>
                )}

                <Field label="Mobile Number *">
                  <input
                    style={input(dark)}
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.mobile}
                    onChange={(e) => setField('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit mobile"
                    required
                    disabled={isEdit}
                    name="alubee-user-mobile"
                    autoComplete="off"
                  />
                  {isEdit && <div style={hint}>Mobile cannot be changed after create</div>}
                </Field>

                <Field label="Work Email (map old login)">
                  <input
                    style={input(dark)}
                    type="email"
                    value={form.linkedEmail}
                    onChange={(e) => setField('linkedEmail', e.target.value.trim())}
                    onBlur={(e) => applyWorkEmailMapping(e.target.value)}
                    placeholder="e.g. prabha@alubee.com"
                    name="alubee-user-linked-email"
                    autoComplete="off"
                  />
                  <div style={hint}>
                    Enter old @alubee.com mail → auto-fills unit, dept, role & screens. Mobile + PIN are entered here (not hardcoded in app).
                  </div>
                  {mapHint && (
                    <div style={{
                      marginTop: 8,
                      fontSize: 12,
                      lineHeight: 1.4,
                      color: mapHint.startsWith('No org') ? '#fbbf24' : '#4ade80',
                      background: mapHint.startsWith('No org') ? 'rgba(251,191,36,0.1)' : 'rgba(34,197,94,0.1)',
                      border: `1px solid ${mapHint.startsWith('No org') ? 'rgba(251,191,36,0.35)' : 'rgba(34,197,94,0.25)'}`,
                      borderRadius: 8,
                      padding: '8px 10px',
                    }}>
                      {mapHint}
                    </div>
                  )}
                </Field>

                <Field label={isEdit ? '4-Digit PIN (optional reset)' : '4-Digit PIN *'}>
                  <input
                    style={{ ...input(dark), letterSpacing: 6 }}
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={form.pin}
                    onChange={(e) => setField('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    required={!isEdit}
                    name="alubee-user-pin"
                    autoComplete="new-password"
                  />
                  <div style={hint}>
                    {isEdit ? 'Leave blank to keep current PIN' : 'User logs in with mobile + this PIN'}
                  </div>
                </Field>
              </div>

              {(needsPageAccess || roleHasFullAccess(form.role)) && (
                <div style={{ marginTop: 4, marginBottom: 12 }}>
                  <label style={labelStyle}>Screens they can access *</label>
                  {roleHasFullAccess(form.role) ? (
                    <div style={{ fontSize: 12, color: '#4ade80', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '10px 12px', marginTop: 8 }}>
                      Full access — all screens included.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      {(isJmd || isMd ? APP_SCREENS : APP_SCREENS.filter((s) => s.id !== 'admin')).map((s) => {
                        const on = form.pageAccess?.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleScreen(s.id)}
                            style={{
                              border: on ? '1px solid #f97316' : '1px solid rgba(148,163,184,0.35)',
                              background: on ? 'rgba(249,115,22,0.2)' : 'transparent',
                              color: on ? '#fb923c' : '#94a3b8',
                              borderRadius: 999,
                              padding: '6px 12px',
                              fontSize: 12,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            {on ? '✓ ' : ''}{s.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {needsPageAccess && (
                    <div style={hint}>Select the pages this person can open. Settings stays available for JMD, MD, and Admin.</div>
                  )}
                </div>
              )}

              {error && <div style={errBox}>{error}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button type="button" onClick={closeModal} style={cancelBtn}>Cancel</button>
                <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1, marginTop: 0 }}>
                  {saving ? 'Saving...' : isEdit ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const wrap = (dark) => ({
  minHeight: 'calc(100vh - 48px)',
  background: dark ? 'transparent' : '#f8fafc',
  padding: '4px 0 40px',
  fontFamily: "'DM Sans', sans-serif",
});
const card = (dark) => ({
  background: dark ? 'rgba(255,255,255,0.04)' : '#fff',
  border: '1px solid rgba(148,163,184,0.2)',
  borderRadius: 14,
  padding: 18,
});
const labelStyle = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 };
const hint = { fontSize: 11, color: '#94a3b8', marginTop: 4 };
const input = (dark) => ({
  background: dark ? 'rgba(15,23,42,0.8)' : '#fff',
  border: '1px solid rgba(148,163,184,0.35)',
  borderRadius: 10,
  padding: '11px 12px',
  color: dark ? '#fff' : '#0f172a',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
});
const backBtn = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  cursor: 'pointer',
  fontSize: 13,
  padding: 0,
  fontFamily: 'inherit',
};
const addBtn = {
  background: 'linear-gradient(135deg,#f97316,#ea580c)',
  border: 'none',
  borderRadius: 10,
  padding: '12px 18px',
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: '0 8px 20px rgba(249,115,22,0.3)',
};
const primaryBtn = {
  flex: 1,
  background: 'linear-gradient(135deg,#f97316,#ea580c)',
  border: 'none',
  borderRadius: 12,
  padding: 13,
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const cancelBtn = {
  flex: 1,
  background: 'transparent',
  border: '1px solid rgba(148,163,184,0.35)',
  borderRadius: 12,
  padding: 13,
  color: '#94a3b8',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const errBox = {
  background: 'rgba(239,68,68,0.12)',
  border: '1px solid rgba(239,68,68,0.35)',
  color: '#fca5a5',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  marginTop: 8,
};
const okBox = {
  background: 'rgba(34,197,94,0.12)',
  border: '1px solid rgba(34,197,94,0.35)',
  color: '#86efac',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
};
const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 920,
};
const th = (dark) => ({
  textAlign: 'left',
  fontSize: 11,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  padding: '10px 8px',
  borderBottom: '1px solid rgba(148,163,184,0.25)',
  whiteSpace: 'nowrap',
  background: dark ? 'rgba(15,23,42,0.5)' : '#f8fafc',
});
const td = (dark) => ({
  padding: '12px 8px',
  borderBottom: '1px solid rgba(148,163,184,0.12)',
  color: dark ? '#e2e8f0' : '#0f172a',
  fontSize: 13,
  verticalAlign: 'top',
});
const rolePill = {
  display: 'inline-block',
  background: 'rgba(249,115,22,0.15)',
  color: '#fb923c',
  borderRadius: 999,
  padding: '3px 8px',
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: 'nowrap',
};
const actionBtn = (color) => ({
  background: 'transparent',
  border: `1px solid ${color}`,
  color,
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
});
const overlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  zIndex: 2000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};
const modal = (dark) => ({
  width: '100%',
  maxWidth: 720,
  maxHeight: '92vh',
  overflowY: 'auto',
  background: dark ? '#0f172a' : '#fff',
  border: '1px solid rgba(148,163,184,0.25)',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 25px 50px rgba(0,0,0,0.45)',
});
const formGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 12,
};
const closeX = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  fontSize: 18,
  cursor: 'pointer',
};




