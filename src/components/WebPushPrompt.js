import React, { useEffect, useState } from 'react';
import {
  enableWebPushFromUserGesture,
  getWebPushPromptState,
  isNativeApp,
} from '../utils/pushNotifications';

export default function WebPushPrompt({ userProfile }) {
  const [state, setState] = useState({ show: false, message: '', canEnable: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userProfile || isNativeApp()) return;
    setState(getWebPushPromptState());
  }, [userProfile]);

  if (!userProfile || isNativeApp() || !state.show) return null;

  async function onEnable() {
    setBusy(true);
    try {
      await enableWebPushFromUserGesture(userProfile);
      setState(getWebPushPromptState());
    } catch (err) {
      setState({
        show: true,
        canEnable: true,
        message: err?.message || 'Could not enable notifications',
      });
    }
    setBusy(false);
  }

  return (
    <div style={s.bar}>
      <div style={s.text}>{state.message}</div>
      {state.canEnable && (
        <button type="button" style={s.btn} onClick={onEnable} disabled={busy}>
          {busy ? 'Please wait…' : 'Enable'}
        </button>
      )}
    </div>
  );
}

const s = {
  bar: {
    position: 'fixed',
    left: 12,
    right: 12,
    bottom: 16,
    zIndex: 4000,
    background: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid rgba(249,115,22,0.45)',
    borderRadius: 12,
    padding: '12px 14px',
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
    fontFamily: "'DM Sans',sans-serif",
  },
  text: { flex: 1, fontSize: 13, lineHeight: 1.4 },
  btn: {
    background: 'linear-gradient(135deg,#f97316,#ea580c)',
    border: 'none',
    color: '#fff',
    fontWeight: 700,
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
};
