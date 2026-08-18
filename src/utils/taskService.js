import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, where, onSnapshot, orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

const col = (unit) => collection(db, unit === 'u2' ? 'tasks_u2' : 'tasks');

export async function createTask(data, userProfile) {
  const ref = await addDoc(col(userProfile.unit), {
    ...data,
    raisedById:   userProfile.id,
    raisedByName: userProfile.name,
    raisedByDept: userProfile.dept,
    unit:         userProfile.unit,
    status:       'Open',
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
    closedAt:     null,
    photoURL:     null,
    pendingApproval: false,
  });

  // Notify owner
  const { createNotification, NOTIF_TYPES } = await import('./notificationService');
  await createNotification(userProfile.unit, NOTIF_TYPES.TASK_ASSIGNED, {
    title: `📋 New Task by ${userProfile.name}`,
    message: `${userProfile.name} → ${data.assignedToPersonName || data.assignedToDept || 'General'}: ${data.description?.slice(0, 60)}`,
    taskId:  ref.id,
    raisedBy: userProfile.name,
    assignedTo: data.assignedToPersonName || '',
    dept: data.assignedToDept || userProfile.dept,
  });
  return ref;
}

export async function updateTask(taskId, updates, unit = 'u1') {
  const safeUnit = unit || 'u1';
  const colName = safeUnit === 'u2' ? 'tasks_u2' : 'tasks';
  const payload = { ...updates, updatedAt: serverTimestamp() };
  if (updates.status === 'Closed') {
    payload.closedAt = serverTimestamp();
    payload.pendingApproval = true;
  }
  if (updates.status && updates.status !== 'Closed') {
    payload.closedAt = null;
    payload.pendingApproval = false;
  }
  await updateDoc(doc(db, colName, taskId), payload);

  const byName = updates.lastUpdatedByName || updates.closedByName || '';
  const by = byName ? ` by ${byName}` : '';
  const desc = updates._taskDesc ? `"${updates._taskDesc?.slice(0,55)}"` : 'A task';

  const { createNotification, NOTIF_TYPES } = await import('./notificationService');
  if (updates.status === 'Closed') {
    await createNotification(safeUnit, NOTIF_TYPES.TASK_COMPLETED, {
      title: `✅ Task Closed${by}`,
      message: `${desc} was marked complete${by} — pending your approval`,
      taskId, pendingApproval: true,
      raisedById: updates._raisedById, // notify raiser via Cloud Function
    });
  } else if (updates.status === 'Cancelled') {
    await createNotification(safeUnit, NOTIF_TYPES.TASK_CANCELLED, {
      title: `🚫 Task Cancelled${by}`,
      message: `${desc} was cancelled${by}`,
      taskId,
    });
  } else if (updates.status) {
    await createNotification(safeUnit, NOTIF_TYPES.TASK_UPDATED, {
      title: `✏️ Status → ${updates.status}${by}`,
      message: `${desc} changed to "${updates.status}"${by}`,
      taskId,
    });
  }
}

export async function deleteTask(taskId, unit = 'u1', taskDesc = '') {
  const safeUnit = unit || 'u1';
  const colName = safeUnit === 'u2' ? 'tasks_u2' : 'tasks';
  await deleteDoc(doc(db, colName, taskId));
  const { createNotification, NOTIF_TYPES } = await import('./notificationService');
  await createNotification(safeUnit, NOTIF_TYPES.TASK_DELETED, {
    title: '🗑 Task Deleted',
    message: taskDesc ? `"${taskDesc.slice(0,60)}" was deleted` : 'A task was deleted',
    taskId,
  });
}

export function subscribeAllTasks(unit, callback) {
  const q = query(col(unit), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export function subscribeDeptTasks(deptId, unit, callback) {
  const results = { raised: [], assigned: [], related: [] };
  const merge = () => {
    const map = {};
    [...results.raised, ...results.assigned, ...results.related].forEach(t => { map[t.id] = t; });
    callback(Object.values(map).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
  };
  // Tasks raised BY this dept
  const u1 = onSnapshot(query(col(unit), where('raisedByDept','==',deptId), orderBy('createdAt','desc')),
    snap => { results.raised = snap.docs.map(d => ({ id:d.id, ...d.data() })); merge(); });
  // Tasks assigned TO this dept
  const u2 = onSnapshot(query(col(unit), where('assignedToDept','==',deptId), orderBy('createdAt','desc')),
    snap => { results.assigned = snap.docs.map(d => ({ id:d.id, ...d.data() })); merge(); });
  // Maintenance/cross-dept tasks tagged as related to this dept
  const u3 = onSnapshot(query(col(unit), where('relatedDepts','array-contains',deptId), orderBy('createdAt','desc')),
    snap => { results.related = snap.docs.map(d => ({ id:d.id, ...d.data() })); merge(); });
  return () => { u1(); u2(); u3(); };
}

// Dept Head tasks: all tasks assigned TO this person (across all depts) + tasks raised by their dept
export function subscribeDeptHeadTasks(userName, deptId, unit, callback) {
  const results = { assignedToMe: [], raisedByDept: [], assignedToDept: [], related: [] };
  const merge = () => {
    const map = {};
    [...results.assignedToMe, ...results.raisedByDept, ...results.assignedToDept, ...results.related]
      .forEach(t => { map[t.id] = t; });
    callback(Object.values(map).sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
  };
  // Tasks assigned TO this person by name (cross-dept)
  const q1 = onSnapshot(query(col(unit), where('assignedToPersonName','==',userName), orderBy('createdAt','desc')),
    snap => { results.assignedToMe = snap.docs.map(d=>({id:d.id,...d.data()})); merge(); });
  // Tasks raised BY their dept
  const q2 = onSnapshot(query(col(unit), where('raisedByDept','==',deptId), orderBy('createdAt','desc')),
    snap => { results.raisedByDept = snap.docs.map(d=>({id:d.id,...d.data()})); merge(); });
  // Tasks assigned TO their dept
  const q3 = onSnapshot(query(col(unit), where('assignedToDept','==',deptId), orderBy('createdAt','desc')),
    snap => { results.assignedToDept = snap.docs.map(d=>({id:d.id,...d.data()})); merge(); });
  // Related dept tasks
  const q4 = onSnapshot(query(col(unit), where('relatedDepts','array-contains',deptId), orderBy('createdAt','desc')),
    snap => { results.related = snap.docs.map(d=>({id:d.id,...d.data()})); merge(); });
  return () => { q1(); q2(); q3(); q4(); };
}


export function subscribeMyTasks(userName, userId, unit, callback) {
  const results = { byName: [], byId: [] };
  const merge = () => {
    const map = {};
    [...results.byName, ...results.byId].forEach(t => { map[t.id] = t; });
    callback(Object.values(map).sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
  };
  // Query by name (covers migrated tasks)
  const q1 = onSnapshot(
    query(col(unit), where('raisedByName','==',userName), orderBy('createdAt','desc')),
    snap => { results.byName = snap.docs.map(d=>({id:d.id,...d.data()})); merge(); }
  );
  // Query by assignedToPersonName (tasks assigned TO this person)
  const q2 = onSnapshot(
    query(col(unit), where('assignedToPersonName','==',userName), orderBy('createdAt','desc')),
    snap => { results.byId = snap.docs.map(d=>({id:d.id,...d.data()})); merge(); }
  );
  return () => { q1(); q2(); };
}

export const daysOpen = (task) => {
  if (!task.createdAt) return 0;
  if (task.status === 'Closed' && task.closedAt) return 0;
  const d = task.createdAt?.toDate ? task.createdAt.toDate() : new Date(task.createdAt);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};
export const agingBucket = (d) => d < 1 ? 'fresh' : d < 3 ? 'watch' : 'overdue';
export const formatDate = (ts) => {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
};
