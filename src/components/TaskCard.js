// src/components/TaskCard.js
import React, { useState } from 'react';
import { updateTask, deleteTask, daysOpen, formatDate, agingBucket } from '../utils/taskService';
import { getDeptLabel, getDeptColor } from '../data/orgData';
import { useAuth } from '../contexts/AuthContext';

const STATUS_COLORS = {
  'Open':        { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  'In Progress': { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  'On Hold':     { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
  'Closed':      { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  'Cancelled':   { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
};

const PRIORITY_DOT = {
  'High':   '#ef4444',
  'Medium': '#f59e0b',
  'Low':    '#22c55e',
};

const AGING_COLORS = {
  fresh:   '#22c55e',
  watch:   '#f59e0b',
  overdue: '#ef4444',
};

export default function TaskCard({ task, onEdit }) {
  const { userProfile } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const days = daysOpen(task);
  const bucket = agingBucket(days);
  const statusStyle = STATUS_COLORS[task.status] || STATUS_COLORS['Open'];
  const canEdit = userProfile?.role === 'owner' || userProfile?.id === task.raisedById ||
    userProfile?.dept === task.raisedByDept || userProfile?.dept === task.assignedToDept;
  const canDelete = userProfile?.role === 'owner' || userProfile?.id === task.raisedById;

  async function quickStatus(newStatus) {
    await updateTask(task.id, { status: newStatus });
  }

  async function handleDelete() {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    setDeleting(true);
    await deleteTask(task.id);
  }

  return (
    <div style={{ ...card.wrap, opacity: deleting ? 0.4 : 1 }}>
      {/* Top strip — aging indicator */}
      {task.status !== 'Closed' && task.status !== 'Cancelled' && (
        <div style={{ ...card.agingStrip, background: AGING_COLORS[bucket] }} />
      )}

      <div style={card.body}>
        {/* Row 1: Priority + Status + Days */}
        <div style={card.row1}>
          <span style={{ ...card.priorityDot, background: PRIORITY_DOT[task.priority] || '#ccc' }} title={task.priority} />
          <span style={{ ...card.status, background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}` }}>
            {task.status}
          </span>
          {task.status !== 'Closed' && task.status !== 'Cancelled' && (
            <span style={{ ...card.aging, color: AGING_COLORS[bucket] }}>
              {days === 0 ? 'Today' : `${days}d open`}
            </span>
          )}
          <span style={card.spacer} />
          {task.priority === 'High' && <span style={card.highBadge}>HIGH</span>}
        </div>

        {/* Task description */}
        <p style={card.desc}>{task.description}</p>

        {/* Dept tags */}
        <div style={card.deptRow}>
          <span style={{ ...card.deptTag, background: getDeptColor(task.raisedByDept) + '22', color: getDeptColor(task.raisedByDept), border: `1px solid ${getDeptColor(task.raisedByDept)}44` }}>
            From: {getDeptLabel(task.raisedByDept)}
          </span>
          {task.assignedToDept && task.assignedToDept !== task.raisedByDept && (
            <span style={{ ...card.deptTag, background: getDeptColor(task.assignedToDept) + '22', color: getDeptColor(task.assignedToDept), border: `1px solid ${getDeptColor(task.assignedToDept)}44` }}>
              → {getDeptLabel(task.assignedToDept)}
              {task.assignedToPersonName ? ` / ${task.assignedToPersonName}` : ''}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div style={card.meta}>
          <span>By {task.raisedByName}</span>
          {task.machineNumber && <span>· {task.machineNumber}</span>}
          {task.partNumber && <span>· {task.partNumber}</span>}
          {task.dueDate && <span>· Due {task.dueDate}</span>}
        </div>

        {/* Expandable details */}
        {expanded && (
          <div style={card.details}>
            {task.remarks && <p style={card.remarks}><strong>Remarks:</strong> {task.remarks}</p>}
            {task.estimatedHours && <p style={card.remarks}><strong>Est. Hours:</strong> {task.estimatedHours}</p>}
            <p style={card.remarks}><strong>Created:</strong> {formatDate(task.createdAt)}</p>
            {task.closedAt && <p style={card.remarks}><strong>Closed:</strong> {formatDate(task.closedAt)}</p>}
            {task.photoURL && (
              <img src={task.photoURL} alt="attachment" style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px' }} />
            )}
          </div>
        )}

        {/* Actions */}
        <div style={card.actions}>
          <button style={card.expandBtn} onClick={() => setExpanded(x => !x)}>
            {expanded ? 'Less ▲' : 'More ▼'}
          </button>

          {canEdit && task.status === 'Open' && (
            <button style={{ ...card.actionBtn, background: '#fffbeb', color: '#d97706' }}
              onClick={() => quickStatus('In Progress')}>▶ Start</button>
          )}
          {canEdit && task.status === 'In Progress' && (
            <button style={{ ...card.actionBtn, background: '#f0fdf4', color: '#16a34a' }}
              onClick={() => quickStatus('Closed')}>✓ Close</button>
          )}
          {canEdit && (
            <button style={{ ...card.actionBtn, background: '#f0f4ff', color: '#4f46e5' }}
              onClick={() => onEdit(task)}>✎ Edit</button>
          )}
          {canDelete && (
            <button style={{ ...card.actionBtn, background: '#fef2f2', color: '#dc2626' }}
              onClick={handleDelete}>🗑</button>
          )}
        </div>
      </div>
    </div>
  );
}

const card = {
  wrap: {
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
    border: '1px solid #f0f0f0',
    overflow: 'hidden',
    transition: 'box-shadow 0.2s',
    position: 'relative',
  },
  agingStrip: {
    height: '3px',
    width: '100%',
  },
  body: { padding: '14px 16px' },
  row1: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
  priorityDot: {
    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
  },
  status: {
    fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px',
    textTransform: 'uppercase', letterSpacing: '0.4px',
  },
  aging: { fontSize: '11px', fontWeight: '700' },
  spacer: { flex: 1 },
  highBadge: {
    background: '#fef2f2', color: '#dc2626', fontSize: '10px', fontWeight: '800',
    padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.5px',
  },
  desc: {
    margin: '0 0 10px 0', fontSize: '14px', fontWeight: '600', color: '#1a1a2e',
    lineHeight: '1.4',
  },
  deptRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' },
  deptTag: {
    fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '20px',
  },
  meta: {
    display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '11px', color: '#999', marginBottom: '10px',
  },
  details: {
    background: '#f9f9f9', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px',
  },
  remarks: { margin: '4px 0', fontSize: '13px', color: '#555' },
  actions: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  expandBtn: {
    background: '#f5f5f5', border: 'none', borderRadius: '6px', padding: '5px 10px',
    cursor: 'pointer', fontSize: '11px', color: '#666', fontFamily: 'inherit',
  },
  actionBtn: {
    border: 'none', borderRadius: '6px', padding: '5px 10px',
    cursor: 'pointer', fontSize: '11px', fontWeight: '600', fontFamily: 'inherit',
  },
};
