/* ═══════════════════════════════════════════════════════════════
   ALUBEE — SHARED DESIGN COMPONENTS v1.0
   All sub-components defined at module level.
   ═══════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef } from 'react';

// ── useTheme ─────────────────────────────────────────────────────
export function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('alubee_theme');
    return saved ? saved === 'dark' : true;
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('alubee_theme', dark ? 'dark' : 'light');
  }, [dark]);
  return { dark, toggle: () => setDark(d => !d) };
}

// ── TOKEN HELPERS ─────────────────────────────────────────────────
export const C = {
  get: (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
};

// ── CARD ─────────────────────────────────────────────────────────
export function Card({ children, style, glass = false, elevated = 2, hover = true, accent, onClick }) {
  const [hovered, setHovered] = useState(false);
  const elev = hovered && hover ? Math.min(elevated + 1, 4) : elevated;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: glass
          ? 'var(--glass-2)'
          : 'var(--bg-raised)',
        backdropFilter: glass ? 'blur(12px)' : undefined,
        WebkitBackdropFilter: glass ? 'blur(12px)' : undefined,
        border: `1px solid ${accent ? 'var(--glass-border-accent)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: `var(--shadow-${elev})${accent ? ', 0 0 20px rgba(0,212,255,0.08)' : ''}`,
        transition: `all var(--t-base) var(--ease-out)`,
        transform: hovered && hover ? 'translateY(-1px)' : 'translateY(0)',
        cursor: onClick ? 'pointer' : undefined,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── STAT CARD ─────────────────────────────────────────────────────
export function StatCard({ label, value, unit, sub, color, icon, trend, bg, style }) {
  const col = color || 'var(--accent)';
  return (
    <Card style={{ padding: '16px', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        {icon && <span style={{ fontSize: 16, opacity: 0.7 }}>{icon}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 900, color: col, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 500 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: trend >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>vs yesterday</span>
        </div>
      )}
    </Card>
  );
}

// ── BADGE ─────────────────────────────────────────────────────────
export function Badge({ children, color = 'accent', size = 'sm', dot = false }) {
  const configs = {
    accent: { bg: 'var(--accent-glass)', border: 'var(--glass-border-accent)', text: 'var(--accent)' },
    green:  { bg: 'var(--green-bg)',     border: 'rgba(34,197,94,0.2)',        text: 'var(--green)' },
    amber:  { bg: 'var(--amber-bg)',     border: 'rgba(245,158,11,0.2)',       text: 'var(--amber)' },
    red:    { bg: 'var(--red-bg)',       border: 'rgba(239,68,68,0.2)',        text: 'var(--red)' },
    purple: { bg: 'var(--purple-bg)',    border: 'rgba(168,85,247,0.2)',       text: 'var(--purple)' },
    muted:  { bg: 'var(--glass-1)',      border: 'var(--border-subtle)',       text: 'var(--text-secondary)' },
  };
  const cfg = configs[color] || configs.muted;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: size === 'sm' ? '2px 8px' : '4px 12px',
      borderRadius: 'var(--radius-full)',
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      color: cfg.text,
      fontSize: size === 'sm' ? 10 : 11,
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.text, display: 'inline-block' }}/>}
      {children}
    </span>
  );
}

// ── BUTTON ─────────────────────────────────────────────────────────
export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, icon, loading, style, fullWidth }) {
  const [pressed, setPressed] = useState(false);
  const variants = {
    primary:   { bg: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)', color: '#000', border: 'none', shadow: 'var(--shadow-accent)' },
    secondary: { bg: 'var(--glass-2)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', shadow: 'none' },
    danger:    { bg: 'linear-gradient(135deg, var(--red) 0%, var(--red-dim) 100%)', color: '#fff', border: 'none', shadow: 'var(--shadow-red)' },
    success:   { bg: 'linear-gradient(135deg, var(--green) 0%, var(--green-dim) 100%)', color: '#fff', border: 'none', shadow: 'var(--shadow-green)' },
    ghost:     { bg: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent', shadow: 'none' },
  };
  const sizes = {
    sm: { padding: '6px 12px', fontSize: 11, height: 28, radius: 'var(--radius-sm)' },
    md: { padding: '9px 18px', fontSize: 13, height: 36, radius: 'var(--radius-md)' },
    lg: { padding: '12px 24px', fontSize: 14, height: 44, radius: 'var(--radius-md)' },
  };
  const v = variants[variant] || variants.secondary;
  const s = sizes[size] || sizes.md;
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: s.padding, height: s.height,
        borderRadius: s.radius,
        background: (disabled || loading) ? 'var(--glass-1)' : v.bg,
        color: (disabled || loading) ? 'var(--text-muted)' : v.color,
        border: v.border,
        boxShadow: (disabled || loading) ? 'none' : v.shadow,
        fontSize: s.fontSize, fontWeight: 700, fontFamily: 'var(--font-sans)',
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        transition: 'all var(--t-fast) var(--ease-out)',
        width: fullWidth ? '100%' : undefined,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...style,
      }}
    >
      {loading ? <Spinner size={s.fontSize}/> : icon && <span>{icon}</span>}
      {children}
    </button>
  );
}

// ── SPINNER ─────────────────────────────────────────────────────────
export function Spinner({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round"/>
    </svg>
  );
}

// ── INPUT ─────────────────────────────────────────────────────────
export function Input({ label, value, onChange, placeholder, type = 'text', error, icon, style, inputMode }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label && <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {icon && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.5, pointerEvents: 'none' }}>{icon}</span>}
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: icon ? '9px 12px 9px 32px' : '9px 12px',
            borderRadius: 'var(--radius-md)',
            background: focused ? 'var(--glass-2)' : 'var(--glass-1)',
            border: `1px solid ${error ? 'var(--red)' : focused ? 'var(--glass-border-accent)' : 'var(--border-default)'}`,
            color: 'var(--text-primary)',
            fontSize: 'var(--text-base)',
            fontFamily: 'var(--font-sans)',
            outline: 'none',
            transition: 'all var(--t-fast) var(--ease-out)',
            boxShadow: focused ? '0 0 0 3px var(--accent-glass)' : 'none',
          }}
        />
      </div>
      {error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--red)' }}>{error}</span>}
    </div>
  );
}

// ── SELECT ─────────────────────────────────────────────────────────
export function Select({ label, value, onChange, options, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label && <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>}
      <select
        value={value}
        onChange={onChange}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '9px 12px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-raised)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-base)',
          fontFamily: 'var(--font-sans)',
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%238496b8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          paddingRight: 32,
        }}
      >
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
    </div>
  );
}

// ── SECTION HEADER ─────────────────────────────────────────────────
export function SectionHeader({ title, sub, action, icon, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{title}</h2>
            {badge}
          </div>
          {sub && <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ── SKELETON ─────────────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 16, radius = 8, style }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, var(--glass-1) 25%, var(--glass-3) 50%, var(--glass-1) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      ...style,
    }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}

// ── DIVIDER ─────────────────────────────────────────────────────────
export function Divider({ style }) {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0', ...style }}/>;
}

// ── PILL TABS ─────────────────────────────────────────────────────────
export function PillTabs({ tabs, active, onChange, style }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--glass-1)', borderRadius: 'var(--radius-md)', padding: 3, border: '1px solid var(--border-subtle)', ...style }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            flex: 1, padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)', fontWeight: active === t.id ? 700 : 400,
            color: active === t.id ? '#000' : 'var(--text-secondary)',
            background: active === t.id ? 'var(--accent)' : 'transparent',
            boxShadow: active === t.id ? 'var(--shadow-accent)' : 'none',
            transition: 'all var(--t-fast) var(--ease-out)',
            whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          {t.icon && <span style={{ fontSize: 13 }}>{t.icon}</span>}
          {t.label}
          {t.count != null && (
            <span style={{ background: active === t.id ? 'rgba(0,0,0,0.2)' : 'var(--glass-2)', borderRadius: 10, padding: '1px 5px', fontSize: 9, fontWeight: 800 }}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── STATUS INDICATOR ─────────────────────────────────────────────────
export function StatusDot({ status, label }) {
  const colors = {
    live:     'var(--green)',
    warning:  'var(--amber)',
    error:    'var(--red)',
    offline:  'var(--slate-500)',
    accent:   'var(--accent)',
  };
  const col = colors[status] || colors.accent;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ position: 'relative', width: 7, height: 7 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: col }}/>
        <div style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: col, opacity: 0.3, animation: 'pulse 2s infinite' }}/>
        <style>{`@keyframes pulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:0;transform:scale(2)}}`}</style>
      </div>
      {label && <span style={{ fontSize: 10, fontWeight: 700, color: col, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>}
    </div>
  );
}

// ── TOAST ─────────────────────────────────────────────────────────────
let _toastSetFn = null;
export const toast = {
  show: (msg, type = 'info', duration = 3500) => {
    if (_toastSetFn) _toastSetFn(p => [...p, { id: Date.now(), msg, type }]);
  },
  success: (msg) => toast.show(msg, 'success'),
  error:   (msg) => toast.show(msg, 'error'),
  info:    (msg) => toast.show(msg, 'info'),
};

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  _toastSetFn = setToasts;
  const remove = (id) => setToasts(p => p.filter(t => t.id !== id));
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const colors = { success: 'var(--green)', error: 'var(--red)', info: 'var(--accent)', warning: 'var(--amber)' };
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 'var(--z-toast)', display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-raised)',
          border: `1px solid ${colors[t.type]}30`,
          boxShadow: 'var(--shadow-4)',
          backdropFilter: 'blur(12px)',
          fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
          pointerEvents: 'all',
          animation: 'slideUp 0.25s var(--ease-out)',
          maxWidth: 320,
          borderLeft: `3px solid ${colors[t.type]}`,
        }}>
          <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
          <span>{icons[t.type]}</span>
          <span style={{ flex: 1 }}>{t.msg}</span>
          <button onClick={() => remove(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, pointerEvents: 'all' }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ── MODAL ─────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 500, footer }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
        background: 'rgba(3,7,18,0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        animation: 'fadeIn 0.2s var(--ease-out)',
      }}
    >
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}} @keyframes scaleIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}`}</style>
      <div style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-5)',
        width: '100%', maxWidth: width,
        animation: 'scaleIn 0.2s var(--ease-spring)',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'var(--glass-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 16, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        <div style={{ padding: '20px' }}>{children}</div>
        {footer && <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}

// ── PANEL (glass card with header) ───────────────────────────────────
export function Panel({ title, badge, icon, children, action, style }) {
  return (
    <Card style={{ marginBottom: 14, ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{title}</span>
            {badge != null && (
              <span style={{ background: 'var(--accent)', color: '#000', fontSize: 10, fontWeight: 800, borderRadius: 10, padding: '1px 7px', minWidth: 18, textAlign: 'center' }}>{badge}</span>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}

// ── SIDEBAR NAV BUTTON ─────────────────────────────────────────────
export function NavButton({ icon, label, active, onClick, badge, collapsed }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={collapsed ? label : undefined}
      style={{
        width: '100%', display: 'flex', alignItems: 'center',
        gap: collapsed ? 0 : 10,
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '10px 0' : '9px 14px',
        border: 'none', borderRadius: 'var(--radius-md)',
        background: active
          ? 'linear-gradient(135deg, var(--accent-glass), var(--glass-2))'
          : hov ? 'var(--glass-1)' : 'transparent',
        borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
        color: active ? 'var(--accent)' : hov ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: collapsed ? 18 : 'var(--text-sm)',
        fontWeight: active ? 700 : 400,
        cursor: 'pointer', fontFamily: 'var(--font-sans)',
        transition: 'all var(--t-fast) var(--ease-out)',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: collapsed ? 18 : 15, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
      {!collapsed && <span style={{ fontSize: 12, whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>{label}</span>}
      {!collapsed && badge != null && badge > 0 && (
        <span style={{ background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 10, padding: '1px 5px', minWidth: 16, textAlign: 'center' }}>{badge}</span>
      )}
      {collapsed && badge != null && badge > 0 && (
        <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', border: '1.5px solid var(--bg-base)' }}/>
      )}
    </button>
  );
}

export default {
  Card, StatCard, Badge, Button, Spinner, Input, Select,
  SectionHeader, Skeleton, Divider, PillTabs, StatusDot,
  ToastContainer, toast, Modal, Panel, NavButton, useTheme,
};
