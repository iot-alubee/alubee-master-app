import React, { useState } from 'react';
import { DEPARTMENTS, getUsersByUnit } from '../data/orgData';
import { createTask, updateTask } from '../utils/taskService';
import { useAuth } from '../contexts/AuthContext';

const PRIORITIES = ['High', 'Medium', 'Low'];
const STATUSES = ['Open', 'In Progress', 'On Hold', 'Closed', 'Cancelled', 'Outside Support / Service Required', 'Need Clarity from Team Engine (MD)'];

// Maintenance depts — their tasks can be tagged to a related dept
const MAINTENANCE_DEPTS = ['maintenance', 'pdc_maint'];

// Map: which dept sees which related dept's maintenance tasks
const RELATED_DEPT_OPTIONS = [
  { id:'pdc',         label:'PDC' },
  { id:'pdc_maint',   label:'PDC Maintenance' },
  { id:'maintenance', label:'Maintenance (General)' },
  { id:'cnc_vmc',     label:'CNC / VMC Machining' },
  { id:'fettling',    label:'Fettling' },
  { id:'secondary',   label:'Secondary Operations' },
  { id:'assembly',    label:'Assembly' },
  { id:'final',       label:'Final' },
  { id:'toolroom',    label:'Toolroom' },
  { id:'stores',      label:'Stores' },
  { id:'npd',         label:'NPD / Quality' },
  { id:'ppc',         label:'PPC' },
  { id:'erp',         label:'ERP' },
  { id:'accounts',    label:'Accounts' },
  { id:'hr',          label:'HR' },
  { id:'dispatch',    label:'Dispatch' },
  { id:'shotblasting',label:'Shotblasting' },
  { id:'fabrication', label:'Fabrication' },
  { id:'design',      label:'Design' },
  { id:'mould',       label:'Mould Maintenance' },
];

export default function TaskFormModal({ onClose, existingTask }) {
  const { userProfile } = useAuth();
  const isEdit = !!existingTask;
  const isMaintenance = MAINTENANCE_DEPTS.includes(userProfile?.dept);

  const [form, setForm] = useState({
    description: existingTask?.description || '',
    assignedToDept: existingTask?.assignedToDept || '',
    assignedToPersonId: existingTask?.assignedToPersonId || '',
    assignedToPersonName: existingTask?.assignedToPersonName || '',
    relatedDept: existingTask?.relatedDept || '',        // keep for backward compat
    relatedDepts: existingTask?.relatedDepts || [],      // new multi-select
    priority: existingTask?.priority || 'Medium',
    status: existingTask?.status || 'Open',
    dueDate: existingTask?.dueDate || '',
    machineNumber: existingTask?.machineNumber || '',
    partNumber: existingTask?.partNumber || '',
    estimatedHours: existingTask?.estimatedHours || '',
    remarks: existingTask?.remarks || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState(null);
  const [taskPhotos, setTaskPhotos] = useState([]);
  const [taskPhotoPreviews, setTaskPhotoPreviews] = useState(existingTask?.taskPhotoURLs || (existingTask?.taskPhotoURL ? [existingTask.taskPhotoURL] : []));
  const [closurePhoto, setClosurePhoto] = useState(null);
  const [closurePhotoPreview, setClosurePhotoPreview] = useState(existingTask?.closurePhotoURL || null);

  function compressImage(file, onDone) {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 800;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        onDone(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function handleTaskPhoto(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    files.forEach(file => {
      compressImage(file, compressed => {
        setTaskPhotos(prev => [...prev, compressed]);
        setTaskPhotoPreviews(prev => [...prev, compressed]);
      });
    });
    e.target.value = ''; // allow re-selecting same file
  }
  function removeTaskPhoto(idx) {
    setTaskPhotos(prev => prev.filter((_,i)=>i!==idx));
    setTaskPhotoPreviews(prev => prev.filter((_,i)=>i!==idx));
  }

  function handlePhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file, compressed => { setClosurePhotoPreview(compressed); setClosurePhoto(compressed); });
  }

  const unitUsers = getUsersByUnit(userProfile?.unit||'u1');
  const deptUsers = form.assignedToDept ? unitUsers.filter(u => u.dept === form.assignedToDept) : [];

  function handleChange(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'assignedToDept') { next.assignedToPersonId = ''; next.assignedToPersonName = ''; }
      if (field === 'assignedToPersonId') {
        const person = unitUsers.find(u => u.id === value);
        next.assignedToPersonName = person?.name || '';
      }
      return next;
    });
  }

  function startVoice(field) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input not supported. Please use Chrome.');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'ta-IN';
    recognition.interimResults = false;
    setListening(true);
    setVoiceTarget(field);
    recognition.start();
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      handleChange(field, (form[field] ? form[field] + ' ' : '') + transcript);
      setListening(false); setVoiceTarget(null);
    };
    recognition.onerror = () => { setListening(false); setVoiceTarget(null); };
    recognition.onend = () => { setListening(false); setVoiceTarget(null); };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.description.trim()) return setError('Task description is required.');
    setSaving(true); setError('');
    try {
      let closurePhotoURL = existingTask?.closurePhotoURL || null;
      // closurePhoto is already a compressed base64 string from handlePhotoSelect
      if (form.status === 'Closed' && closurePhoto && typeof closurePhoto === 'string') {
        closurePhotoURL = closurePhoto;
      }
      const payload = {
        ...form,
        taskPhotoURLs: taskPhotos.length > 0 ? taskPhotos : (existingTask?.taskPhotoURLs || []),
        taskPhotoURL: taskPhotos[0] || existingTask?.taskPhotoURL || null,
        closurePhotoURL,
        _taskDesc: form.description,
        _raisedById: existingTask?.raisedById || '',
        ...(form.status === 'Closed' ? { closedByName: userProfile?.name, closedAt_display: new Date().toLocaleDateString('en-IN') } : {}),
        ...(form.status !== existingTask?.status ? { lastUpdatedByName: userProfile?.name, lastUpdatedStatus: form.status } : {}),
      };
      const taskUnit = existingTask?.unit || userProfile?.unit || 'u1'; // never undefined
      if (isEdit) { await updateTask(existingTask.id, payload, taskUnit); }
      else { await createTask(payload, userProfile); }
      onClose();
    } catch (err) {
      setError('Failed to save task. Please try again.');
      console.error(err);
    }
    setSaving(false);
  }

  return (
    <div style={ov.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={ov.modal}>
        <div style={ov.header}>
          <h2 style={ov.title}>{isEdit ? 'Edit Task' : 'New Task'}</h2>
          <button style={ov.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={ov.form}>
          <div style={ov.row}>
            <label style={ov.label}>Task Description *</label>
            <div style={{ position: 'relative' }}>
              <textarea style={ov.textarea} value={form.description}
                onChange={e => handleChange('description', e.target.value)}
                placeholder="Describe the task..." rows={3} />
              <button type="button" style={{ ...ov.voiceBtn, ...(voiceTarget === 'description' && listening ? ov.voiceBtnActive : {}) }}
                onClick={() => startVoice('description')} title="Voice input (Tamil/English)">🎙</button>
            </div>
          </div>

          <div style={ov.grid2}>
            <div>
              <label style={ov.label}>Assign to Department</label>
              <select style={ov.select} value={form.assignedToDept} onChange={e => handleChange('assignedToDept', e.target.value)}>
                <option value="">— Own Dept —</option>
                {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label style={ov.label}>Assign to Person</label>
              <select style={ov.select} value={form.assignedToPersonId}
                onChange={e => handleChange('assignedToPersonId', e.target.value)} disabled={!form.assignedToDept}>
                <option value="">— Anyone —</option>
                {deptUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div style={ov.grid2}>
            <div>
              <label style={ov.label}>Priority</label>
              <select style={ov.select} value={form.priority} onChange={e => handleChange('priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={ov.label}>Status</label>
              <select style={ov.select} value={form.status} onChange={e => handleChange('status', e.target.value)}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={ov.grid2}>
            <div>
              <label style={ov.label}>Due Date</label>
              <input style={ov.input} type="date" value={form.dueDate} onChange={e => handleChange('dueDate', e.target.value)} />
            </div>
            <div>
              <label style={ov.label}>Est. Hours</label>
              <input style={ov.input} type="number" min="0" step="0.5" value={form.estimatedHours}
                onChange={e => handleChange('estimatedHours', e.target.value)} placeholder="e.g. 2.5" />
            </div>
          </div>

          <div style={ov.grid2}>
            <div>
              <label style={ov.label}>Machine No.</label>
              <input style={ov.input} value={form.machineNumber} onChange={e => handleChange('machineNumber', e.target.value)}
                placeholder="e.g. 125-7, VMC-3" />
            </div>
            <div>
              <label style={ov.label}>Part / Job Ref</label>
              <input style={ov.input} value={form.partNumber} onChange={e => handleChange('partNumber', e.target.value)}
                placeholder="e.g. 603, IMB306" />
            </div>
          </div>

          {/* Task photo — gallery + camera both always visible */}
          <div style={ov.row}>
            <label style={ov.label}>📷 Attach Photo (Optional)</label>
            {/* Photo previews */}
            {taskPhotoPreviews.length > 0 && (
              <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:10}}>
                {taskPhotoPreviews.map((src,idx)=>(
                  <div key={idx} style={{position:'relative',display:'inline-block'}}>
                    <img src={src} alt={`Photo ${idx+1}`} style={{width:80,height:80,objectFit:'cover',borderRadius:8,border:'1px solid #e8e8e8'}}/>
                    <button type="button" onClick={()=>removeTaskPhoto(idx)}
                      style={{position:'absolute',top:-6,right:-6,background:'#ef4444',border:'none',borderRadius:'50%',width:20,height:20,color:'#fff',cursor:'pointer',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:'flex',gap:10}}>
              <label style={{flex:1,cursor:'pointer',background:'#f8f9fc',border:'2px dashed #e8e8e8',borderRadius:10,padding:'10px',textAlign:'center',display:'block'}}>
                <div style={{fontSize:18,marginBottom:3}}>🖼️</div>
                <div style={{fontSize:11,color:'#888',fontWeight:600}}>Gallery{taskPhotoPreviews.length>0?` (+${taskPhotoPreviews.length})`:''}</div>
                <input type="file" accept="image/*" multiple style={{display:'none'}} onChange={handleTaskPhoto}/>
              </label>
              <label style={{flex:1,cursor:'pointer',background:'#f8f9fc',border:'2px dashed #e8e8e8',borderRadius:10,padding:'10px',textAlign:'center',display:'block'}}>
                <div style={{fontSize:18,marginBottom:3}}>📸</div>
                <div style={{fontSize:11,color:'#888',fontWeight:600}}>Camera</div>
                <input type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={handleTaskPhoto}/>
              </label>
            </div>
          </div>

          {/* Related depts — multi-select checkboxes for maintenance teams */}
          {true && (
            <div style={ov.row}>
              <label style={ov.label}>
                Related Departments
                <span style={{color:'#94a3b8',fontWeight:400,textTransform:'none',marginLeft:6}}>(select all depts that should see this task)</span>
              </label>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:6}}>
                {RELATED_DEPT_OPTIONS.map(d => {
                  const checked = (form.relatedDepts||[]).includes(d.id);
                  return (
                    <label key={d.id} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',
                      background: checked ? 'rgba(249,115,22,0.15)' : 'rgba(0,0,0,0.04)',
                      border: `1px solid ${checked ? '#f97316' : '#e8e8e8'}`,
                      borderRadius:20, padding:'5px 12px', fontSize:12, fontWeight: checked?700:400,
                      color: checked ? '#f97316' : '#555', userSelect:'none',
                      transition:'all 0.15s'}}>
                      <input type="checkbox" checked={checked} style={{display:'none'}}
                        onChange={e => {
                          const cur = form.relatedDepts||[];
                          handleChange('relatedDepts', e.target.checked ? [...cur, d.id] : cur.filter(x=>x!==d.id));
                        }}/>
                      {checked ? '✓ ' : ''}{d.label}
                    </label>
                  );
                })}
              </div>
              {(form.relatedDepts||[]).length > 0 && (
                <div style={{fontSize:11,color:'#f97316',marginTop:6}}>
                  ✓ Visible in: {(form.relatedDepts||[]).map(id=>RELATED_DEPT_OPTIONS.find(d=>d.id===id)?.label).join(', ')}
                </div>
              )}
            </div>
          )}

          <div style={ov.row}>
            <label style={ov.label}>Remarks</label>
            <div style={{ position: 'relative' }}>
              <textarea style={ov.textarea} value={form.remarks}
                onChange={e => handleChange('remarks', e.target.value)}
                placeholder="Additional notes..." rows={2} />
              <button type="button" style={{ ...ov.voiceBtn, ...(voiceTarget === 'remarks' && listening ? ov.voiceBtnActive : {}) }}
                onClick={() => startVoice('remarks')} title="Voice input">🎙</button>
            </div>
          </div>

          {/* Evidence photo — shown when closing a task */}
          {form.status === 'Closed' && (
            <div style={ov.row}>
              <label style={ov.label}>📷 Closure Evidence (Photo)</label>
              <div style={{border:'2px dashed #e8e8e8',borderRadius:10,padding:12,textAlign:'center',background:'#fafafa'}}>
                {closurePhotoPreview ? (
                  <div>
                    <img src={closurePhotoPreview} alt="Closure evidence" style={{maxWidth:'100%',maxHeight:180,borderRadius:8,marginBottom:8}}/>
                    <br/>
                    <button type="button" onClick={()=>{setClosurePhoto(null);setClosurePhotoPreview(null);}}
                      style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,padding:'4px 12px',color:'#dc2626',cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
                      ✕ Remove
                    </button>
                  </div>
                ) : (
                  <div style={{display:'flex',gap:10}}>
                    <label style={{flex:1,cursor:'pointer',background:'#f0fdf4',border:'2px dashed #bbf7d0',borderRadius:10,padding:'12px',textAlign:'center',display:'block'}}>
                      <div style={{fontSize:20,marginBottom:4}}>🖼️</div>
                      <div style={{fontSize:11,color:'#16a34a',fontWeight:600}}>Gallery</div>
                      <input type="file" accept="image/*" style={{display:'none'}} onChange={handlePhotoSelect}/>
                    </label>
                    <label style={{flex:1,cursor:'pointer',background:'#f0fdf4',border:'2px dashed #bbf7d0',borderRadius:10,padding:'12px',textAlign:'center',display:'block'}}>
                      <div style={{fontSize:20,marginBottom:4}}>📸</div>
                      <div style={{fontSize:11,color:'#16a34a',fontWeight:600}}>Camera</div>
                      <input type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={handlePhotoSelect}/>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {listening && <div style={ov.voiceIndicator}>🎙 Listening... speak now (Tamil / English)</div>}
          {error && <div style={ov.error}>{error}</div>}

          <div style={ov.actions}>
            <button type="button" style={ov.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={ov.submitBtn} disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Update Task' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const ov = {
  overlay: { position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',backdropFilter:'blur(4px)' },
  modal: { background:'#fff',borderRadius:'16px',width:'100%',maxWidth:'600px',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 25px 60px rgba(0,0,0,0.3)' },
  header: { display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px 16px',borderBottom:'1px solid #f0f0f0',position:'sticky',top:0,background:'#fff',zIndex:1 },
  title: { margin:0,fontSize:'18px',fontWeight:'700',color:'#1a1a2e' },
  closeBtn: { background:'#f5f5f5',border:'none',borderRadius:'8px',width:'32px',height:'32px',cursor:'pointer',fontSize:'14px',color:'#666' },
  form: { padding:'20px 24px',display:'flex',flexDirection:'column',gap:'16px' },
  row: { display:'flex',flexDirection:'column',gap:'6px' },
  grid2: { display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px' },
  label: { fontSize:'12px',fontWeight:'600',color:'#555',textTransform:'uppercase',letterSpacing:'0.4px' },
  input: { border:'1.5px solid #e8e8e8',borderRadius:'8px',padding:'10px 12px',fontSize:'14px',color:'#1a1a2e',outline:'none',width:'100%',boxSizing:'border-box',fontFamily:'inherit' },
  select: { border:'1.5px solid #e8e8e8',borderRadius:'8px',padding:'10px 12px',fontSize:'14px',color:'#1a1a2e',outline:'none',width:'100%',boxSizing:'border-box',background:'#fff',fontFamily:'inherit' },
  textarea: { border:'1.5px solid #e8e8e8',borderRadius:'8px',padding:'10px 12px',fontSize:'14px',color:'#1a1a2e',outline:'none',width:'100%',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit',paddingRight:'40px' },
  voiceBtn: { position:'absolute',right:'8px',top:'8px',background:'#f5f5f5',border:'none',borderRadius:'6px',padding:'4px 8px',cursor:'pointer',fontSize:'16px' },
  voiceBtnActive: { background:'#fee2e2' },
  voiceIndicator: { background:'#fef3c7',border:'1px solid #f59e0b',borderRadius:'8px',padding:'10px 14px',fontSize:'13px',color:'#92400e',textAlign:'center' },
  error: { background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'8px',padding:'10px 14px',fontSize:'13px',color:'#dc2626' },
  actions: { display:'flex',gap:'10px',justifyContent:'flex-end',paddingTop:'4px' },
  cancelBtn: { background:'#f5f5f5',border:'none',borderRadius:'10px',padding:'11px 22px',cursor:'pointer',fontSize:'14px',fontWeight:'600',color:'#555',fontFamily:'inherit' },
  submitBtn: { background:'linear-gradient(135deg, #f97316, #ea580c)',border:'none',borderRadius:'10px',padding:'11px 24px',cursor:'pointer',fontSize:'14px',fontWeight:'700',color:'#fff',fontFamily:'inherit',boxShadow:'0 4px 12px rgba(249,115,22,0.3)' },
};
