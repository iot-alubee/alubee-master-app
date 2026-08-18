import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDevicePhoneNumbers, isAndroidApp } from '../utils/phoneNumbers';
import {
  checkBiometricAvailability,
  biometryLabel,
  isBiometricEnabledLocally,
  enableBiometricLogin,
  loginWithBiometrics,
} from '../utils/biometricAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [simNumbers, setSimNumbers] = useState([]);
  const [showSimPicker, setShowSimPicker] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioLabel, setBioLabel] = useState('Biometric login');
  const [bioEnabled, setBioEnabled] = useState(false);
  const [offerEnableBio, setOfferEnableBio] = useState(false);
  const android = isAndroidApp();

  useEffect(() => {
    if (!android) return;
    (async () => {
      setSimLoading(true);
      const nums = await getDevicePhoneNumbers();
      setSimNumbers(nums);
      setSimLoading(false);
    })();
  }, [android]);

  useEffect(() => {
    (async () => {
      const avail = await checkBiometricAvailability();
      setBioAvailable(!!avail.available);
      setBioLabel(biometryLabel(avail.biometryType));
      setBioEnabled(isBiometricEnabledLocally());
    })();
  }, []);

  async function openMobileField() {
    setError('');
    if (!android) return;
    setShowSimPicker(true);
    if (simNumbers.length === 0) {
      setSimLoading(true);
      const nums = await getDevicePhoneNumbers();
      setSimNumbers(nums);
      setSimLoading(false);
    }
  }

  async function finishLogin(m, p, { promptBio } = { promptBio: true }) {
    await login(m, p);
    if (android && promptBio && !isBiometricEnabledLocally()) {
      setOfferEnableBio(true);
      setMobile(m);
      setPin(p);
      return;
    }
    if (android && isBiometricEnabledLocally()) {
      try {
        await enableBiometricLogin(m, p);
      } catch (_) {}
    }
    navigate('/dashboard');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits');
      await finishLogin(mobile, pin);
    } catch (err) {
      setError(err?.message || 'Incorrect mobile number or PIN.');
    }
    setLoading(false);
  }

  async function handleBiometricLogin() {
    setError('');
    setLoading(true);
    try {
      const creds = await loginWithBiometrics();
      await finishLogin(creds.mobile, creds.pin, { promptBio: false });
    } catch (err) {
      setError(err?.message || 'Biometric login failed');
    }
    setLoading(false);
  }

  async function confirmEnableBio(enable) {
    setOfferEnableBio(false);
    if (enable) {
      try {
        await enableBiometricLogin(mobile, pin);
        setBioEnabled(true);
      } catch (err) {
        setError(err?.message || 'Could not enable biometric login');
      }
    }
    navigate('/dashboard');
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.brand}>
          <div style={s.logoMark}>A</div>
          <div>
            <div style={s.brandName}>ALUBEE</div>
            <div style={s.brandSub}>Task Management System</div>
          </div>
        </div>
        <div style={s.divider} />

        <h2 style={s.title}>Sign in</h2>
        <p style={s.subtitle}>
          {android
            ? 'Select your SIM mobile number, then enter your 4-digit PIN'
            : 'Enter your mobile number and 4-digit PIN'}
        </p>

        <form onSubmit={handleSubmit} style={s.form} autoComplete="off">
          <div style={s.field}>
            <label style={s.label}>Mobile Number</label>
            {android ? (
              <button type="button" style={s.simTrigger} onClick={openMobileField}>
                {mobile ? `📱 ${mobile}` : 'Tap to select SIM number'}
              </button>
            ) : (
              <input
                style={s.input}
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                required
                name="alubee-mobile"
                autoComplete="off"
              />
            )}
          </div>

          <div style={s.field}>
            <label style={s.label}>4-Digit PIN</label>
            <input
              style={{ ...s.input, letterSpacing: 8, fontSize: 20, textAlign: 'center' }}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              required
              name="alubee-pin"
              autoComplete="one-time-code"
            />
          </div>

          {error && <div style={s.error}>{error}</div>}

          <button
            style={{ ...s.btn, opacity: loading || (android && !mobile) || pin.length !== 4 ? 0.7 : 1 }}
            type="submit"
            disabled={loading || (android && !mobile) || pin.length !== 4}
          >
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>

        {android && (
          <button type="button" style={s.bioBtn} onClick={handleBiometricLogin} disabled={loading}>
            🔐 Use {bioLabel}
          </button>
        )}

        {android && !bioEnabled && (
          <p style={s.footer}>Sign in with PIN once. Then enable fingerprint / face on the next popup.</p>
        )}

        <p style={s.footer}>App build 110 · Android users + biometric</p>
        {!android && <p style={s.footer}>Forgot PIN? Contact your system administrator.</p>}
      </div>

      {showSimPicker && (
        <div style={s.overlay} onClick={() => setShowSimPicker(false)}>
          <div style={s.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={s.sheetTitle}>Select SIM number</div>
            {simLoading && <div style={s.muted}>Reading SIM cards…</div>}
            {!simLoading && simNumbers.length === 0 && (
              <div style={s.muted}>
                No SIM numbers were available from the device. Check that phone permissions are granted, then try again.
              </div>
            )}
            {simNumbers.map((n) => (
              <button
                key={n.number}
                type="button"
                style={s.simOption}
                onClick={() => {
                  setMobile(n.number);
                  setShowSimPicker(false);
                }}
              >
                <div style={{ fontWeight: 700 }}>{n.label}</div>
                <div style={{ color: '#fb923c', marginTop: 4 }}>{n.display || n.number}</div>
              </button>
            ))}
            <button type="button" style={s.cancelBtn} onClick={() => setShowSimPicker(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {offerEnableBio && (
        <div style={s.overlay}>
          <div style={s.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={s.sheetTitle}>Enable {bioLabel}?</div>
            <div style={s.muted}>
              Next time you can unlock Alubee with fingerprint or face instead of typing your PIN.
            </div>
            <button type="button" style={s.bioBtn} onClick={() => confirmEnableBio(true)}>
              Enable {bioLabel}
            </button>
            <button type="button" style={s.cancelBtn} onClick={() => confirmEnableBio(false)}>
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'DM Sans',sans-serif",
    padding: 20,
  },
  card: {
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: '44px 40px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 },
  logoMark: {
    width: 52,
    height: 52,
    borderRadius: 14,
    background: 'linear-gradient(135deg,#f97316,#ea580c)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 26,
    fontWeight: 900,
    color: '#fff',
    flexShrink: 0,
    boxShadow: '0 8px 20px rgba(249,115,22,0.4)',
  },
  brandName: { fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: 3 },
  brandSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginTop: 2 },
  divider: { height: 1, background: 'rgba(255,255,255,0.1)', marginBottom: 24 },
  title: { color: '#fff', fontSize: 20, fontWeight: 700, margin: '0 0 6px' },
  subtitle: { color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '0 0 24px' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  input: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10,
    padding: '12px 16px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
  },
  simTrigger: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(249,115,22,0.45)',
    borderRadius: 10,
    padding: '14px 16px',
    color: '#fff',
    fontSize: 14,
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  error: {
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.4)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#fca5a5',
    fontSize: 13,
  },
  btn: {
    background: 'linear-gradient(135deg,#f97316,#ea580c)',
    border: 'none',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 8,
    boxShadow: '0 8px 20px rgba(249,115,22,0.35)',
    fontFamily: 'inherit',
  },
  bioBtn: {
    width: '100%',
    marginTop: 14,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  footer: { color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', marginTop: 24, marginBottom: 0 },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    background: '#1e1b4b',
    borderRadius: 16,
    padding: 18,
    border: '1px solid rgba(255,255,255,0.12)',
  },
  sheetTitle: { color: '#fff', fontWeight: 800, fontSize: 16, marginBottom: 12 },
  muted: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 12, lineHeight: 1.4 },
  simOption: {
    width: '100%',
    textAlign: 'left',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    marginBottom: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  cancelBtn: {
    width: '100%',
    marginTop: 4,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 12,
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
