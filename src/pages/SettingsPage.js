import React, { useEffect, useState } from 'react';
import { getProfileMobile } from '../utils/requestService';
import {
  canAccessSettings,
  subscribeAvailability,
  setApproverAvailability,
  subscribeNotifPrefs,
  setNotifPref,
  NOTIF_TOGGLE_MODULES,
  availabilityConflict,
} from '../utils/settingsService';
import { getRoleLabel } from '../data/appRoles';

const ROLES = [
  { id: 'jmd_1', label: 'JMD 1', hint: 'Unit I approvals' },
  { id: 'jmd_2', label: 'JMD 2', hint: 'Unit II approvals' },
  { id: 'md', label: 'MD', hint: 'Final approval · both units' },
];

export default function SettingsPage({ dark = true, userProfile, onBack }) {
  const appRole = userProfile?.appRole || '';
  const mobile = getProfileMobile(userProfile);
  const allowed = canAccessSettings(appRole);
  const [tab, setTab] = useState('notifications');
  const [avail, setAvail] = useState({ md: 'Online', jmd_1: 'Online', jmd_2: 'Online' });
  const [prefs, setPrefs] = useState({});
  const [savingRole, setSavingRole] = useState('');
  const [savingMod, setSavingMod] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!allowed) return;
    return subscribeAvailability(setAvail);
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !mobile) return;
    return subscribeNotifPrefs(mobile, setPrefs);
  }, [allowed, mobile]);

  if (!allowed) {
    return (
      <div style={wrap(dark)}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <h2 style={{ color: dark ? '#fff' : '#111' }}>Access denied</h2>
        <p style={{ color: '#94a3b8' }}>Settings is for JMD, MD, and Admin only.</p>
      </div>
    );
  }

  const canToggleRole = (roleId) => appRole === 'admin' || appRole === roleId;

  async function toggleAvail(roleId) {
    const current = avail[roleId] === 'Offline' ? 'Offline' : 'Online';
    const next = current === 'Online' ? 'Offline' : 'Online';
    const preview = { ...avail, [roleId]: next };
    const conflict = availabilityConflict(preview);
    if (conflict) {
      setError(conflict);
      return;
    }
    setError('');
    setSavingRole(roleId);
    try {
      await setApproverAvailability(roleId, next, avail);
    } catch (e) {
      setError(e?.message || 'Could not update availability');
    }
    setSavingRole('');
  }

  async function toggleModule(modId) {
    const on = prefs[modId] !== false;
    setSavingMod(modId);
    setError('');
    try {
      const next = await setNotifPref(mobile, modId, !on);
      setPrefs(next);
    } catch (e) {
      setError(e?.message || 'Could not save notification setting');
    }
    setSavingMod('');
  }

  return (
    <div style={wrap(dark)}>
      <button onClick={onBack} style={backBtn}>← Back</button>
      <h1 style={{ margin: '8px 0 4px', color: dark ? '#fff' : '#0f172a', fontSize: 22 }}>Settings</h1>
      <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: 13 }}>
        {userProfile?.name} · {getRoleLabel(appRole)}
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { id: 'notifications', label: 'Notification' },
          { id: 'availability', label: 'Availability' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setError(''); }}
            style={{
              border: tab === t.id ? '1px solid #f97316' : '1px solid rgba(148,163,184,0.35)',
              background: tab === t.id ? 'rgba(249,115,22,0.18)' : 'transparent',
              color: tab === t.id ? '#fb923c' : '#94a3b8',
              borderRadius: 999,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      {tab === 'notifications' && (
        <div style={card(dark)}>
          <div style={{ fontWeight: 800, color: dark ? '#fff' : '#0f172a', marginBottom: 6 }}>Module alerts</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
            Turn off alerts you do not want. Approval notifications cannot be switched off.
          </div>

          <div style={row(dark, true)}>
            <div>
              <div style={{ fontWeight: 700, color: dark ? '#e2e8f0' : '#0f172a' }}>Approvals</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>OD, visitor, leave, and any request waiting on you</div>
            </div>
            <LockedOn />
          </div>

          {NOTIF_TOGGLE_MODULES.map((m) => {
            const on = prefs[m.id] !== false;
            return (
              <div key={m.id} style={row(dark)}>
                <div style={{ fontWeight: 700, color: dark ? '#e2e8f0' : '#0f172a' }}>{m.label}</div>
                <Toggle on={on} disabled={savingMod === m.id} onClick={() => toggleModule(m.id)} />
              </div>
            );
          })}
        </div>
      )}

      {tab === 'availability' && (
        <div style={card(dark)}>
          <div style={{ fontWeight: 800, color: dark ? '#fff' : '#0f172a', marginBottom: 6 }}>Approver availability</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
            MD offline → JMD approval is final. JMD offline → that unit goes straight to MD.
          </div>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#fbbf24',
            background: 'rgba(245,158,11,0.12)',
            border: '1px solid rgba(245,158,11,0.35)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 14,
          }}>
            JMD and MD cannot be offline at the same time. If MD is offline, both JMDs stay online. If any JMD is offline, MD stays online.
          </div>
          {ROLES.map((r) => {
            const online = avail[r.id] !== 'Offline';
            const mine = canToggleRole(r.id);
            const nextWouldConflict = online ? availabilityConflict({ ...avail, [r.id]: 'Offline' }) : '';
            return (
              <div key={r.id} style={{
                ...row(dark),
                borderColor: online ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
                background: online ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
              }}>
                <div>
                  <div style={{ fontWeight: 800, color: dark ? '#fff' : '#0f172a' }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{r.hint}</div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800, color: online ? '#22c55e' : '#ef4444' }}>
                    {online ? 'Online' : 'Offline'}
                  </div>
                  {nextWouldConflict ? (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#fbbf24', maxWidth: 260 }}>{nextWouldConflict}</div>
                  ) : null}
                </div>
                {mine ? (
                  <button
                    type="button"
                    disabled={!!savingRole || !!nextWouldConflict}
                    title={nextWouldConflict || ''}
                    onClick={() => toggleAvail(r.id)}
                    style={{
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px 14px',
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: savingRole || nextWouldConflict ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      background: nextWouldConflict ? '#475569' : (online ? '#dc2626' : '#16a34a'),
                      color: '#fff',
                      opacity: savingRole === r.id ? 0.7 : 1,
                    }}
                  >
                    {savingRole === r.id ? 'Saving…' : nextWouldConflict ? 'Blocked' : online ? 'Go Offline' : 'Go Online'}
                  </button>
                ) : (
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>View only</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      style={{
        width: 48,
        height: 28,
        borderRadius: 999,
        border: 'none',
        background: on ? '#16a34a' : '#64748b',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        padding: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: on ? 23 : 3,
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.15s',
      }} />
    </button>
  );
}

function LockedOn() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#86efac', fontSize: 12, fontWeight: 700 }}>
      <Toggle on disabled onClick={() => {}} />
      Always on
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
  padding: 16,
});
const row = (dark, first) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 4px',
  borderBottom: first ? '1px solid rgba(148,163,184,0.2)' : '1px solid rgba(148,163,184,0.12)',
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
