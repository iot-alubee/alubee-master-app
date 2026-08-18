import {
  collection, addDoc, updateDoc, doc, query,
  where, onSnapshot, limit, serverTimestamp, writeBatch, getDocs
} from 'firebase/firestore';
import { db } from '../firebase';

// Notifications scoped by unit: notifications_u1 / notifications (u1 legacy)
const nCol = (unit) => collection(db, unit === 'u2' ? 'notifications_u2' : 'notifications_u1');

export const NOTIF_TYPES = {
  DELETE_REQUESTED: 'delete_requested',
  TASK_ASSIGNED:   'task_assigned',
  TASK_COMPLETED:  'task_completed',
  TASK_UPDATED:    'task_updated',
  TASK_CANCELLED:  'task_cancelled',
  TASK_DELETED:    'task_deleted',
  TASK_OVERDUE:    'task_overdue',
  TASK_REOPENED:   'task_reopened',
  MOBILEBOX:       'mobilebox',
  PERMISSION:      'permission',
  VISITOR:         'visitor',
  VEHICLE:         'vehicle',
  POWER:           'power',
  STORES:          'stores',
  ERP:             'erp',
  INTERNAL:        'internal',
  TRANSFER:        'transfer',
  OVERSTAY:        'overstay',
  TEA:             'tea',
  MANPOWER:        'manpower',
  REVENUE:         'revenue',
  MAINTENANCE:     'maintenance',
  REQUEST:         'request',
  DC:              'dc',
  CUSTOMER_DISPATCH:  'customer_dispatch',
  CUSTOMER_SCHEDULE:  'customer_schedule',
  BINS_SHORTAGE:      'bins_shortage',
  SUPPLIER_INWARD:    'supplier_inward',
  SUPPLIER_RAG:       'supplier_rag',
  STORES_CHECKLIST:   'stores_checklist',
  STORES_ALLOY:       'stores_alloy',
  STORES_TRANSFER:    'stores_transfer',
};

export const NOTIF_ICONS = {
  task_assigned:   '📋',
  task_completed:  '✅',
  task_updated:    '✏️',
  task_cancelled:  '🚫',
  task_deleted:    '🗑️',
  task_overdue:    '⚠️',
  task_reopened:   '🔄',
  delete_requested:'🗑️',
  mobilebox:       '📱',
  permission:      '🔐',
  visitor:         '👤',
  vehicle:         '🚗',
  power:           '⚡',
  stores:          '🏪',
  erp:             '📊',
  internal:        '🏭',
  transfer:        '🔄',
  overstay:        '⏱️',
  tea:             '☕',
  manpower:        '👷',
  revenue:           '📈',
  dc:               '📄',
  supplier_inward:  '📦',
  supplier_rag:     '🚨',
  customer_dispatch:'🚚',
  customer_schedule:'📅',
  stores_checklist: '✅',
  stores_alloy:     '⚗️',
  stores_transfer:  '🔄',
  bins_shortage:    '📭',
  dispatch:         '🚚',
  request:          '📝',
  maintenance:      '🔧',
};

export const NOTIF_COLORS = {
  task_assigned:   '#3b82f6',
  task_completed:  '#f59e0b',
  task_updated:    '#8b5cf6',
  task_cancelled:  '#ef4444',
  task_deleted:    '#ef4444',
  task_overdue:    '#ef4444',
  task_reopened:   '#06b6d4',
  delete_requested:'#ef4444',
  mobilebox:       '#22c55e',
  permission:      '#f59e0b',
  visitor:         '#8b5cf6',
  vehicle:         '#3b82f6',
  power:           '#ef4444',
  stores:          '#16a34a',
  erp:             '#f97316',
  internal:        '#f97316',
  transfer:        '#f97316',
  overstay:        '#ef4444',
  tea:             '#a855f7',
  manpower:        '#0ea5e9',
  revenue:           '#10b981',
  dc:               '#1e40af',
  maintenance:      '#dc2626',
  supplier_inward:  '#6366f1',
  supplier_rag:     '#ef4444',
  customer_dispatch:'#22c55e',
  customer_schedule:'#8b5cf6',
  stores_checklist: '#16a34a',
  stores_alloy:     '#f59e0b',
  stores_transfer:  '#f97316',
  bins_shortage:    '#ef4444',
  dispatch:         '#22c55e',
  request:          '#6366f1',
};

export async function createNotification(unit, type, data) {
  try {
    const col = unit === 'u2' ? 'notifications_u2' : 'notifications_u1';
    console.log('createNotification:', col, type, data?.title);
    const result = await addDoc(collection(db, col), {
      type,
      ...data,
      read: false,
      createdAt: serverTimestamp(),
    });
    console.log('notification written:', result.id);
  } catch (e) {
    console.error('createNotification FAILED:', e.message, e.code);
  }
}

export function subscribeNotifications(unit, callback) {
  // Fetch ALL notifications — no limit, no orderBy (avoids index requirement)
  // Sort client-side by createdAt
  const q = query(nCol(unit), limit(500));
  return onSnapshot(q, snap => {
    const docs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || (a.createdAt?.seconds || 0) * 1000;
        const tb = b.createdAt?.toMillis?.() || (b.createdAt?.seconds || 0) * 1000;
        return tb - ta;
      });
    callback(docs);
  });
}

export async function markAllRead(unit) {
  const q = query(nCol(unit), where('read', '==', false));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.update(doc(db, unit === 'u2' ? 'notifications_u2' : 'notifications_u1', d.id), { read: true }));
  await batch.commit();
}

export async function markOneRead(unit, notifId) {
  const colName = unit === 'u2' ? 'notifications_u2' : 'notifications_u1';
  await updateDoc(doc(db, colName, notifId), { read: true });
}

export async function acknowledgeCompletion(unit, notifId, taskId, taskUnit) {
  // Mark notification read
  await markOneRead(unit, notifId);
  // Task stays Closed — just acknowledged
}

export async function reopenTask(unit, notifId, taskId, taskUnit) {
  const { updateTask } = await import('./taskService');
  await updateTask(taskId, { status: 'Open', closedAt: null }, taskUnit);
  await markOneRead(unit, notifId);
  await createNotification(unit, NOTIF_TYPES.TASK_REOPENED, {
    title: 'Task Reopened',
    message: `Owner reopened a task for review`,
    taskId,
  });
}

export async function requestDeletion(unit, taskId, taskDesc, requestedBy) {
  await createNotification(unit, 'delete_requested', {
    title: '🗑 Delete Request',
    message: `${requestedBy} requested deletion of: "${taskDesc?.slice(0,60)}"`,
    taskId,
    requestedBy,
    pendingApproval: false,
    deleteRequest: true,
  });
}
