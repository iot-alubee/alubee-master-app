import React, { useEffect, useState } from 'react';
import { getProfileMobile } from '../utils/requestService';
import {
  assignITTicket,
  closeITTicket,
  isITAssignee,
  isITRequester,
  isITSupervisorFor,
  itTicketStatus,
  listITEngineers,
  listITTeam,
  resolveITTicket,
} from '../utils/itRequestService';

export default function ITTicketActions({ req, userProfile, onDone }) {
  const [team, setTeam] = useState([]);
  const [pick, setPick] = useState(req.assignedToMobile || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const userMobile = getProfileMobile(userProfile);
  const status = itTicketStatus(req);
  const supervisor = isITSupervisorFor(req, userMobile, userProfile);
  const assignee = isITAssignee(req, userMobile);
  const requester = isITRequester(req, userMobile);
  const engineers = listITEngineers(team);

  useEffect(() => {
    if (!supervisor || status === 'Closed' || status === 'Cancelled') return;
    let cancelled = false;
    listITTeam().then((list) => {
      if (!cancelled) setTeam(list);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [supervisor, status, req.id]);

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      onDone && onDone();
    } catch (e) {
      alert(e.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'Closed' || status === 'Cancelled') return null;

  const engineer = engineers.find((u) => getProfileMobile(u) === pick) || null;

  return (
    <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
      {supervisor && (status === 'Open' || status === 'Assigned') && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', marginBottom: 6 }}>
            Assign to IT Member-Employee
          </div>
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #93c5fd', fontSize: 13, background: '#fff', color: '#111', marginBottom: 8 }}
          >
            <option value="">Select IT engineer</option>
            {engineers.map((u) => {
              const m = getProfileMobile(u);
              return (
                <option key={u.id || m} value={m}>
                  {u.name || u.employeeName} {m ? `· ${m}` : ''}
                </option>
              );
            })}
          </select>
          <button
            disabled={busy || !pick}
            onClick={() => run(() => assignITTicket(req, engineer, userProfile))}
            style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 800, fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
          >
            {busy ? '⏳ Assigning…' : status === 'Assigned' ? '🔁 Reassign' : '👤 Assign ticket'}
          </button>
        </div>
      )}

      {assignee && status === 'Assigned' && (
        <div style={{ marginTop: supervisor ? 8 : 0, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#15803d', textTransform: 'uppercase', marginBottom: 6 }}>
            Mark work done
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the requester"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: 13, boxSizing: 'border-box', marginBottom: 8 }}
          />
          <button
            disabled={busy}
            onClick={() => run(() => resolveITTicket(req, userProfile, note))}
            style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: '#15803d', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {busy ? '⏳ Saving…' : '✅ Mark resolved'}
          </button>
        </div>
      )}

      {requester && status === 'Resolved' && (
        <div style={{ marginTop: 8, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 12, color: '#92400e', fontWeight: 700, marginBottom: 8 }}>
            IT marked this resolved. Close the request if the issue is fixed.
          </div>
          <button
            disabled={busy}
            onClick={() => run(() => closeITTicket(req, userProfile))}
            style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: '#ca8a04', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {busy ? '⏳ Closing…' : '🔒 Close request'}
          </button>
        </div>
      )}
    </div>
  );
}
