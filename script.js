const DB = {
  users: 'pedernales_primero_users_v1',
  voters: 'pedernales_primero_records_v1',
  session: 'pedernales_primero_session_v1',
  theme: 'pedernales_primero_theme_v1',
  audit: 'pedernales_primero_audit_v1'
};
const ROLES = ['Administrador', 'Coordinador General', 'Coordinador de Zona', 'Registrador'];
const MUNICIPIOS = ['Pedernales', 'Oviedo'];
const DISTRITOS = {Pedernales:['Pedernales','José Francisco Peña Gómez'], Oviedo:['Oviedo','Juancho']};
const DEMARCACIONES = ['Pedernales','José Francisco Peña Gómez','Oviedo','Juancho'];
const PROVINCE = 'Pedernales';

const EMAILJS_CONFIG = {
  serviceId: 'service_qe268hf',
  templateId: 'template_2alexku',
  publicKey: 'SiS_aT7fhjvtowkbA',
  adminEmail: 'pedernalesprimero@hotmail.com',
  appUrl: 'https://josephperez16.github.io/Pedernales-Primero/'
};

const SUPABASE_CONFIG = {
  url: 'https://wbfbyyybktovqahoeqtu.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZmJ5eXlia3RvdnFhaG9lcXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMTY0NzgsImV4cCI6MjA5Njc5MjQ3OH0.ypSUPoYFWtLnA-5MROIqMWzf6Bu730Noipx0VIDinuA'
};
const SUPABASE_TABLES = {
  [DB.users]: 'pp_users',
  [DB.voters]: 'pp_voters',
  [DB.audit]: 'pp_audit_logs'
};
let supabaseReady = false;
let supabaseSyncing = false;
let currentUser = null;
let chartHoverIndex = -1;
let chartAreas = [];
window.getSession = () => currentUser;
const $ = id => document.getElementById(id);
const read = key => JSON.parse(localStorage.getItem(key) || '[]');
const writeLocal = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const write = (key, value) => {
  writeLocal(key, value);
  if (SUPABASE_TABLES[key] && supabaseReady && !supabaseSyncing) syncSupabaseTable(key, value);
};
async function supabaseRequest(table, options = {}){
  const headers = {
    apikey: SUPABASE_CONFIG.key,
    Authorization: `Bearer ${SUPABASE_CONFIG.key}`,
    'Content-Type': 'application/json',
    Prefer: options.prefer || 'return=minimal'
  };
  const url = `${SUPABASE_CONFIG.url}/rest/v1/${table}${options.query || ''}`;
  const response = await fetch(url, { method: options.method || 'GET', headers, body: options.body ? JSON.stringify(options.body) : undefined });
  if(!response.ok){
    const text = await response.text().catch(()=>'');
    throw new Error(`Supabase ${table}: ${response.status} ${text}`);
  }
  if(response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
function prepareSupabaseRows(key, rows){
  const list = Array.isArray(rows) ? rows : [];
  if(key === DB.audit){
    return list.map(a => ({
      id: a.id || uid(),
      action: a.action || '',
      module: a.module || '',
      detail: String(a.detail || ''),
      user_id: a.user_id || '',
      user_name: a.user_name || 'Sistema',
      user_role: a.user_role || '',
      username: a.username || '',
      created_at: a.created_at || new Date().toISOString()
    }));
  }
  return list.map(row => ({...row}));
}
function normalizeSupabaseRows(key, rows){
  const list = Array.isArray(rows) ? rows : [];
  if(key === DB.audit) return list.map(a => ({...a, kind: a.kind || auditType(a.action), agent: a.agent || ''}));
  if(key === DB.users) return list.map(u => ({...u, district: u.district || u.municipio || '', recommended_by_id: u.recommended_by_id || '', recommended_by_name: u.recommended_by_name || '', recommended_by_role: u.recommended_by_role || ''}));
  if(key === DB.voters) return list.map(v => ({...v, district: v.district || v.municipio || ''}));
  return list;
}
async function syncSupabaseTable(key, rows){
  const table = SUPABASE_TABLES[key];
  if(!table) return;
  try{
    const prepared = prepareSupabaseRows(key, rows);
    if(prepared.length){
      await supabaseRequest(table, { method: 'POST', query: '?on_conflict=id', prefer: 'resolution=merge-duplicates,return=minimal', body: prepared });
      if(key !== DB.audit){
        const ids = prepared.map(x => String(x.id)).filter(Boolean);
        await supabaseRequest(table, { method: 'DELETE', query: ids.length ? `?id=not.in.(${ids.join(',')})` : '?id=not.is.null' });
      }
    }else if(key !== DB.audit){
      await supabaseRequest(table, { method: 'DELETE', query: '?id=not.is.null' });
    }
  }catch(error){
    console.error('Error sincronizando Supabase:', error);
  }
}
async function loadSupabaseTable(key){
  const table = SUPABASE_TABLES[key];
  if(!table) return;
  const order = key === DB.audit ? 'created_at.desc' : 'created_at.asc';
  const remote = await supabaseRequest(table, { query: `?select=*&order=${order}` });
  const local = read(key);
  if(Array.isArray(remote) && remote.length){
    writeLocal(key, normalizeSupabaseRows(key, remote));
  }else if(local.length){
    await syncSupabaseTable(key, local);
  }else{
    writeLocal(key, []);
  }
}
async function loadSupabaseData(){
  try{
    supabaseSyncing = true;
    await loadSupabaseTable(DB.users);
    await loadSupabaseTable(DB.voters);
    await loadSupabaseTable(DB.audit);
    supabaseReady = true;
  }catch(error){
    console.error('No se pudo cargar Supabase. Se usará respaldo local:', error);
    supabaseReady = false;
  }finally{
    supabaseSyncing = false;
  }
}
const clean = v => String(v || '').trim();
const digits = v => String(v || '').replace(/\D/g, '');
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
function escapeHtml(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function formatCedula(v){const d=digits(v).slice(0,11); if(d.length<=3)return d; if(d.length<=10)return `${d.slice(0,3)}-${d.slice(3)}`; return `${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10)}`}
function formatPhone(v){const d=digits(v).slice(0,10); if(d.length<=3)return d; if(d.length<=6)return `${d.slice(0,3)}-${d.slice(3)}`; return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`}
function msg(el, text, type='success'){ if(!el)return; el.textContent=text; el.className=`status-message ${type} show`; setTimeout(()=>{el.textContent=''; el.className='status-message'},4200)}
function fillSelect(el, values, label){ if(!el)return; const old=el.value; el.innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join(''); if(values.includes(old))el.value=old; }
function isAdmin(){return currentUser?.role==='Administrador'}
function isGeneral(){return currentUser?.role==='Coordinador General'}
function isZone(){return currentUser?.role==='Coordinador de Zona'}
function isRegistrar(){return currentUser?.role==='Registrador'}
function canManageUsers(){return isAdmin()}
function canViewAudit(){return isAdmin()}
function auditLabel(action){return String(action||'').replaceAll('_',' ')}
function auditType(action){
  const a=String(action||'').toLowerCase();
  if(a.includes('sesión')||a.includes('login')||a.includes('salida')||a.includes('entrada')||a.includes('fallido'))return 'Acceso';
  if(a.includes('descarga')||a.includes('export'))return 'Descarga';
  if(a.includes('edit')||a.includes('actualiz')||a.includes('cread')||a.includes('elimin')||a.includes('aprob'))return 'Cambio';
  return 'General';
}
function addAudit(action,module,detail='',actor=null){
  const u=actor||currentUser;
  const logs=read(DB.audit);
  logs.unshift({id:uid(),created_at:new Date().toISOString(),user_id:u?.id||'',user_name:u?.name||'Sistema',user_role:u?.role||'',username:u?.username||'',action,kind:auditType(action),module,detail:String(detail||''),agent:navigator.userAgent});
  write(DB.audit,logs.slice(0,1500));
}
function filteredAudit(){
  const q=clean($('auditSearchInput')?.value).toLowerCase();
  const action=$('auditActionFilter')?.value||'';
  return read(DB.audit).filter(a=>{
    const hay=[a.user_name,a.username,a.user_role,a.action,a.kind,a.module,a.detail,new Date(a.created_at).toLocaleString('es-DO')].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(!action||a.action===action);
  });
}
function renderAudit(){
  const section=$('auditSection');
  if(!section)return;
  if(!canViewAudit()){
    section.classList.add('section-hidden');
    $('auditNavBtn')?.classList.add('section-hidden');
    return;
  }
  $('auditNavBtn')?.classList.remove('section-hidden');
  const logs=read(DB.audit);
  const actions=[...new Set(logs.map(a=>a.action).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const select=$('auditActionFilter');
  if(select){
    const old=select.value;
    select.innerHTML='<option value="">Todas las acciones</option>'+actions.map(a=>`<option value="${escapeHtml(a)}">${escapeHtml(auditLabel(a))}</option>`).join('');
    if(actions.includes(old))select.value=old;
  }
  const data=filteredAudit();
  const today=new Date().toDateString();
  $('auditTotalBadge') && ($('auditTotalBadge').textContent=`${logs.length} eventos`);
  $('auditTodayCount') && ($('auditTodayCount').textContent=logs.filter(a=>new Date(a.created_at).toDateString()===today).length);
  $('auditAccessCount') && ($('auditAccessCount').textContent=logs.filter(a=>a.kind==='Acceso').length);
  $('auditChangesCount') && ($('auditChangesCount').textContent=logs.filter(a=>a.kind==='Cambio').length);
  $('auditExportCount') && ($('auditExportCount').textContent=logs.filter(a=>a.kind==='Descarga').length);
  const tbody=$('auditTableBody');
  if(!tbody)return;
  tbody.innerHTML=data.length?data.map(a=>`<tr>
    <td data-label="Fecha">${new Date(a.created_at).toLocaleString('es-DO')}</td>
    <td data-label="Usuario"><strong>${escapeHtml(a.user_name)}</strong><small>${escapeHtml(a.username||'')}</small></td>
    <td data-label="Rol"><span class="badge">${escapeHtml(a.user_role||'Sistema')}</span></td>
    <td data-label="Acción"><span class="audit-pill">${escapeHtml(auditLabel(a.action))}</span></td>
    <td data-label="Módulo">${escapeHtml(a.module)}</td>
    <td data-label="Detalle">${escapeHtml(a.detail)}</td>
  </tr>`).join(''):`<tr><td colspan="6" class="empty-cell">No hay eventos de auditoría registrados.</td></tr>`;
}
function exportAudit(){
  if(!canViewAudit())return;
  const data=filteredAudit();
  if(!data.length)return alert('No hay eventos de auditoría para exportar.');
  addAudit('Descarga de auditoría','Auditoría',`${data.length} eventos exportados`);
  const rows=data.map(a=>({Fecha:new Date(a.created_at).toLocaleString('es-DO'),Usuario:a.user_name,UsuarioSistema:a.username,Rol:a.user_role,Accion:auditLabel(a.action),Tipo:a.kind,Modulo:a.module,Detalle:a.detail}));
  const ws=XLSX.utils.json_to_sheet(rows);
  ws['!cols']=[{wch:22},{wch:28},{wch:18},{wch:22},{wch:26},{wch:14},{wch:18},{wch:60}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Auditoria');
  XLSX.writeFile(wb,`Auditoria_Pedernales_Primero_${new Date().toISOString().slice(0,10)}.xlsx`);
  renderAudit();
}
function same(a,b){return clean(a).toLowerCase()===clean(b).toLowerCase()}
function recommendedUserIds(){return read(DB.users).filter(u=>u.recommended_by_id===currentUser?.id).map(u=>u.id)}
function visibleVoters(){const all=read(DB.voters); if(!currentUser)return[]; if(isAdmin()||isGeneral())return all; const recIds=recommendedUserIds(); if(isRegistrar())return all.filter(v=>v.registered_by_id===currentUser.id); return all.filter(v=>v.registered_by_id===currentUser.id||recIds.includes(v.registered_by_id)||(isZone()&&currentUser.zone&&same(v.zone,currentUser.zone)));}
function canEditVoter(v){return isAdmin()||isGeneral()||v.registered_by_id===currentUser?.id||(isZone()&&currentUser?.zone&&same(v.zone,currentUser.zone));}
function visibleUsers(){const users=read(DB.users); if(isAdmin())return users; if(isGeneral())return users.filter(u=>u.role!=='Administrador'); const recIds=recommendedUserIds(); return users.filter(u=>u.id===currentUser?.id||recIds.includes(u.id));}
function setPanel(panel){if(panel==='usuarios'&&!canManageUsers())panel='overview'; if(panel==='auditoria'&&!canViewAudit())panel='overview'; document.querySelectorAll('.content-panel').forEach(p=>p.classList.add('section-hidden')); const map={overview:'panelOverview',registro:'panelRegistro',consulta:'panelConsulta',usuarios:'usersSection',auditoria:'auditSection'}; const target=$(map[panel]||'panelOverview'); if(target)target.classList.remove('section-hidden'); document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.panel===panel)); closeSidebar(); renderAll();}
let __ppSidebarScrollY = 0;
function openSidebar(){
  const mainScroll = document.querySelector('.app-main');
  __ppSidebarScrollY = mainScroll?.scrollTop || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  if(mainScroll) mainScroll.dataset.savedScroll = String(__ppSidebarScrollY);
  const sidebar = $('appSidebar');
  const overlay = $('sidebarOverlay');
  sidebar?.classList.add('open');
  overlay?.classList.add('show');
  overlay?.classList.add('visible');
  document.body.classList.add('sidebar-open');
  document.documentElement.classList.add('sidebar-open-html');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${__ppSidebarScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  $('sidebarToggleBtn')?.setAttribute('aria-expanded','true');
  $('sidebarToggleBtn')?.classList.add('active');
}
function closeSidebar(){
  const mainScroll = document.querySelector('.app-main');
  const savedY = Number(mainScroll?.dataset.savedScroll || __ppSidebarScrollY || Math.abs(parseInt(document.body.style.top || '0', 10)) || 0);
  $('appSidebar')?.classList.remove('open');
  $('sidebarOverlay')?.classList.remove('show');
  $('sidebarOverlay')?.classList.remove('visible');
  document.body.classList.remove('sidebar-open');
  document.documentElement.classList.remove('sidebar-open-html');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  $('sidebarToggleBtn')?.setAttribute('aria-expanded','false');
  $('sidebarToggleBtn')?.classList.remove('active');
  requestAnimationFrame(() => {
    if(mainScroll){
      mainScroll.scrollTop = savedY;
      delete mainScroll.dataset.savedScroll;
    }
    window.scrollTo(0, savedY);
  });
}
function approvedUsers(){return read(DB.users).filter(u=>u.status==='Aprobado')}
function fillRecommendedSelect(el, selected=''){if(!el)return; const users=approvedUsers(); el.innerHTML='<option value="">Sin recomendador</option>'+users.map(u=>`<option value="${u.id}">${escapeHtml(u.name)} · ${escapeHtml(u.role)}</option>`).join(''); if([...el.options].some(o=>o.value===selected))el.value=selected;}
function districtValues(m=''){return m&&DISTRITOS[m]?DISTRITOS[m]:DEMARCACIONES}
function fillDistrictSelect(el, municipio='', label='Seleccione'){fillSelect(el,districtValues(municipio),label)}
function initSelects(){fillSelect($('registerRole'),ROLES,'Seleccione'); fillSelect($('editUserRole'),ROLES,'Seleccione'); fillSelect($('userRoleFilter'),ROLES,'Todos los roles'); fillSelect($('registerMunicipio'),MUNICIPIOS,'Seleccione'); fillSelect($('editUserMunicipio'),MUNICIPIOS,'Seleccione'); fillSelect($('voterMunicipio'),MUNICIPIOS,'Seleccione'); fillSelect($('filterMunicipio'),MUNICIPIOS,'Todos'); fillSelect($('filterRole'),ROLES,'Todos'); fillDistrictSelect($('registerDistrict'),$('registerMunicipio')?.value,'Seleccione'); fillDistrictSelect($('editUserDistrict'),$('editUserMunicipio')?.value,'Seleccione'); fillDistrictSelect($('voterDistrict'),$('voterMunicipio')?.value,'Seleccione'); fillSelect($('filterDistrict'),DEMARCACIONES,'Todas'); fillRecommendedSelect($('registerRecommendedBy')); fillRecommendedSelect($('editUserRecommendedBy')); firstAdminMode();}
function firstAdminMode(){const first=read(DB.users).length===0; if($('registerRole')){$('registerRole').disabled=first; if(first)$('registerRole').value='Administrador'} if($('firstUserHint'))$('firstUserHint').textContent=first?'Cree el primer administrador para iniciar el sistema.':'Los usuarios nuevos deben ser aprobados por el administrador.';}

function openForgotPasswordModal(){
  $('forgotPasswordModal')?.classList.remove('hidden');
  const input = $('forgotEmail') || $('forgotUserInput');
  if(input){
    input.value = $('loginUser')?.value || '';
    setTimeout(() => input.focus(), 80);
  }
  const message = $('forgotMessage') || $('forgotPasswordMessage');
  if(message){
    message.textContent = '';
    message.className = 'status-message';
  }
}
function closeForgotPasswordModal(){
  $('forgotPasswordModal')?.classList.add('hidden');
}
function buildResetLink(email){
  const base = EMAILJS_CONFIG.appUrl || window.location.href;
  const url = new URL(base, window.location.href);
  url.hash = '';
  url.search = '';
  url.searchParams.set('reset', '1');
  url.searchParams.set('email', email);
  return url.toString();
}
function getResetEmailFromUrl(){
  const params = new URLSearchParams(window.location.search);
  return params.get('reset') === '1' ? clean(params.get('email') || '').toLowerCase() : '';
}
function openResetPasswordModal(email){
  const modal = $('resetPasswordModal');
  if(!modal)return;
  modal.dataset.email = email;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  const accountBox = $('resetAccountBox');
  if(accountBox) accountBox.innerHTML = email ? `<strong>Cuenta:</strong> ${escapeHtml(email)}` : '';
  const message = $('resetMessage');
  if(message){
    message.textContent = '';
    message.className = 'status-message';
  }
  updateResetPasswordUi();
  setTimeout(() => $('resetPassword')?.focus(), 100);
}
function closeResetPasswordModal(){
  $('resetPasswordModal')?.classList.add('hidden');
  $('resetForm')?.reset();
  updateResetPasswordUi();
  if(!$('forgotPasswordModal') || $('forgotPasswordModal')?.classList.contains('hidden')) document.body.classList.remove('modal-open');
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('reset');
  cleanUrl.searchParams.delete('email');
  if(window.location.search.includes('reset=')) window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
}
function passwordScore(value){
  let score = 0;
  if(value.length >= 6) score++;
  if(/[A-ZÁÉÍÓÚÑ]/.test(value) && /[a-záéíóúñ]/.test(value)) score++;
  if(/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score++;
  return Math.min(score, 3);
}
function updateResetPasswordUi(){
  const pass = $('resetPassword')?.value || '';
  const pass2 = $('resetPasswordConfirm')?.value || '';
  const strength = $('resetPasswordStrength');
  if(strength){
    const score = passwordScore(pass);
    strength.dataset.score = String(score);
    [...strength.children].forEach((bar, i)=>bar.classList.toggle('active', i < score));
  }
  const hint = $('resetPasswordHint');
  if(hint){
    hint.textContent = pass.length ? (pass.length < 6 ? 'La contraseña aún es muy corta.' : (passwordScore(pass) >= 3 ? 'Contraseña fuerte.' : 'Contraseña válida, puede mejorar agregando números o símbolos.')) : 'Use mínimo 6 caracteres. Recomendado: letras, números y símbolos.';
    hint.className = `reset-helper ${pass.length && pass.length < 6 ? 'error' : pass.length >= 6 ? 'success' : ''}`;
  }
  const match = $('resetPasswordMatch');
  if(match){
    const ok = pass && pass2 && pass === pass2;
    match.textContent = !pass2 ? 'Las contraseñas deben coincidir.' : ok ? 'Las contraseñas coinciden.' : 'Las contraseñas no coinciden.';
    match.className = `reset-helper ${!pass2 ? '' : ok ? 'success' : 'error'}`;
  }
}
function handleResetLink(){
  const email = getResetEmailFromUrl();
  if(!email)return;
  $('dashboardSection')?.classList.add('hidden');
  $('authSection')?.classList.remove('hidden');
  showAuthTab('login');
  openResetPasswordModal(email);
}
async function changePasswordFromResetLink(e){
  e.preventDefault();
  const email = ($('resetPasswordModal')?.dataset.email || getResetEmailFromUrl()).toLowerCase();
  const pass = $('resetPassword')?.value || '';
  const pass2 = $('resetPasswordConfirm')?.value || '';
  const message = $('resetMessage');
  if(!email)return msg(message,'El enlace de recuperación no contiene un correo válido.','error');
  if(pass.length < 6)return msg(message,'La contraseña debe tener mínimo 6 caracteres.','error');
  if(pass !== pass2)return msg(message,'Las contraseñas no coinciden.','error');
  const users = read(DB.users);
  const index = users.findIndex(u => (u.email || '').toLowerCase() === email);
  if(index < 0)return msg(message,'No encontramos un usuario con ese correo en este dispositivo.','error');
  users[index].password_hash = await hashPassword(pass);
  users[index].updated_at = new Date().toISOString();
  write(DB.users, users);
  addAudit('Contraseña restablecida','Seguridad',`Contraseña actualizada para ${email}`,users[index]);
  $('resetForm')?.reset();
  msg(message,'Contraseña actualizada correctamente. Ya puede iniciar sesión.','success');
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('reset');
  cleanUrl.searchParams.delete('email');
  window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  setTimeout(closeResetPasswordModal, 1500);
}
async function sendPasswordRecoveryRequest(e){
  e.preventDefault();
  const inputEl = $('forgotEmail') || $('forgotUserInput');
  const messageEl = $('forgotMessage') || $('forgotPasswordMessage');
  const input = clean(inputEl?.value).toLowerCase();
  if(!input)return msg(messageEl,'Escriba el correo registrado.','error');

  const user=read(DB.users).find(u=>(u.email||'').toLowerCase()===input||(u.username||'').toLowerCase()===input);
  if(!user)return msg(messageEl,'No encontramos un usuario con ese correo.','error');

  if(!window.emailjs)return msg(messageEl,'EmailJS no cargó correctamente. Verifique su conexión a internet.','error');

  const link=buildResetLink(user.email || input);
  const params={
    to_email: user.email || input,
    reply_to: EMAILJS_CONFIG.adminEmail,
    from_name: 'Pedernales Primero',
    app_name: 'Pedernales Primero',
    subject: 'Restablecer contraseña - Pedernales Primero',
    support_email: EMAILJS_CONFIG.adminEmail,
    email: user.email||'No registrado',
    name: user.name||'Usuario',
    to_name: user.name||'Usuario',
    username: user.username||'',
    role: user.role||'',
    user_name: user.name||'Usuario',
    to_name: user.name||'Usuario',
    user_email: user.email||'No registrado',
    user_username: user.username||'',
    user_role: user.role||'',
    app_url: EMAILJS_CONFIG.appUrl,
    app_link: link,
    reset_link: link,
    link,
    year: new Date().getFullYear(),
    message:`Hola ${user.name||'Usuario'}, usa este enlace para restablecer tu contraseña de Pedernales Primero: ${link}`
  };

  const btn=$('sendForgotPasswordBtn') || document.querySelector('#forgotForm button[type="submit"]') || document.querySelector('#forgotPasswordForm button[type="submit"]');
  const originalText = btn?.textContent || 'Enviar enlace';
  if(btn){btn.disabled=true; btn.textContent='Enviando...';}
  try{
    emailjs.init({publicKey:EMAILJS_CONFIG.publicKey});
    await emailjs.send(EMAILJS_CONFIG.serviceId,EMAILJS_CONFIG.templateId,params);
    addAudit(
      'Recuperación solicitada',
      'Seguridad',
      `Solicitud enviada a ${user.email || input}`,
      {
        id: user.id || '',
        name: user.name || 'Usuario',
        role: user.role || 'Recuperación',
        username: user.username || user.email || input
      }
    );
    msg(messageEl,'Enlace de recuperación enviado correctamente.','success');
    setTimeout(closeForgotPasswordModal,1800);
  }catch(err){
    console.error('EmailJS error:',err);
    const reason = err?.text || err?.message || '';
    msg(messageEl,`No se pudo enviar la solicitud. Revise EmailJS, el servicio y la plantilla.${reason ? ' Detalle: ' + reason : ''}`,'error');
  }finally{
    if(btn){btn.disabled=false; btn.textContent=originalText;}
  }
}


function unlockAuthScroll(){
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  document.body.classList.remove('sidebar-open');
  document.documentElement.classList.remove('sidebar-open-html');
  document.body.classList.add('auth-active');
  document.documentElement.classList.add('auth-active-html');
}

function showAuthTab(type){$('loginForm')?.classList.toggle('active',type==='login'); $('registerForm')?.classList.toggle('active',type==='register'); $('showLogin')?.classList.toggle('active',type==='login'); $('showRegister')?.classList.toggle('active',type==='register'); firstAdminMode();}
async function hashPassword(p){return btoa(unescape(encodeURIComponent(p)))}
async function verifyPassword(p,h){return await hashPassword(p)===h}
function loginUser(user){currentUser=user; localStorage.setItem(DB.session,user.id); document.body.classList.remove('auth-active'); document.documentElement.classList.remove('auth-active-html'); $('authSection')?.classList.add('hidden'); $('dashboardSection')?.classList.remove('hidden'); $('manageUsersBtn')?.classList.toggle('section-hidden',!canManageUsers()); $('auditNavBtn')?.classList.toggle('section-hidden',!canViewAudit()); const initials=(user.name||'U').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(); if($('sidebarAvatar'))$('sidebarAvatar').textContent=initials; if($('sidebarUserName'))$('sidebarUserName').textContent=user.name; if($('sidebarUserRole'))$('sidebarUserRole').textContent=user.role; if($('currentUserInfo'))$('currentUserInfo').textContent=`${user.name} · ${user.role}`; addAudit('Entrada al sistema','Sesión','Inicio de sesión correcto',user); resetVoterForm(); setPanel('overview');}
function logout(){if(currentUser)addAudit('Salida del sistema','Sesión','Cierre de sesión'); currentUser=null; localStorage.removeItem(DB.session); $('dashboardSection')?.classList.add('hidden'); $('authSection')?.classList.remove('hidden'); unlockAuthScroll(); $('auditNavBtn')?.classList.add('section-hidden'); showAuthTab('login');}
function filteredVoters(){const q=clean($('searchInput')?.value).toLowerCase(); const m=$('filterMunicipio')?.value||''; const d=$('filterDistrict')?.value||''; const z=$('filterSector')?.value||''; const rec=$('filterMesa')?.value||''; const col=$('filterColegio')?.value||''; const role=$('filterRole')?.value||''; const reg=$('filterRegistrar')?.value||''; return visibleVoters().filter(v=>{const hay=[v.name,v.cedula,v.phone,v.age,v.address,v.municipio,v.district,v.zone,v.recinto,v.colegio,v.observation,v.registered_by_name,v.registered_by_role].join(' ').toLowerCase(); return (!q||hay.includes(q))&&(!m||v.municipio===m)&&(!d||(v.district||v.municipio)===d)&&(!z||v.zone===z)&&(!rec||v.recinto===rec)&&(!col||v.colegio===col)&&(!role||v.registered_by_role===role)&&(!reg||v.registered_by_name===reg);});}
function updateDynamicFilters(){const data=visibleVoters(); fillSelect($('filterSector'), [...new Set(data.map(v=>v.zone).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')), 'Todas'); fillSelect($('filterMesa'), [...new Set(data.map(v=>v.recinto).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')), 'Todos'); fillSelect($('filterColegio'), [...new Set(data.map(v=>v.colegio).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'es',{numeric:true})), 'Todos'); fillSelect($('filterRegistrar'), [...new Set(data.map(v=>v.registered_by_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')), 'Todos');}
function renderStats(){const data=visibleVoters(); const today=new Date().toDateString(); const active=municipioCounts().filter(([,c])=>c>0).length; $('totalVoters') && ($('totalVoters').textContent=data.length); $('totalUsers') && ($('totalUsers').textContent=visibleUsers().length); $('todayVoters') && ($('todayVoters').textContent=data.filter(v=>new Date(v.created_at).toDateString()===today).length); $('activeProvinces') && ($('activeProvinces').textContent=active); $('chartSummaryBadge') && ($('chartSummaryBadge').textContent=active===1?'1 demarcación activa':`${active} demarcaciones activas`);}
function municipioCounts(){const counts=Object.fromEntries(DEMARCACIONES.map(m=>[m,0])); visibleVoters().forEach(v=>{const k=DEMARCACIONES.includes(v.district)?v.district:(MUNICIPIOS.includes(v.municipio)?v.municipio:'Pedernales'); counts[k]=(counts[k]||0)+1}); return DEMARCACIONES.map(m=>[m,counts[m]||0]).sort((a,b)=>b[1]-a[1]||DEMARCACIONES.indexOf(a[0])-DEMARCACIONES.indexOf(b[0]));}
function zoneCounts(){return municipioCounts();}
function municipioColor(label, hovered=false){
  if(label==='Oviedo'||label==='Juancho')return hovered?['#7FA49C','#B8895B','rgba(184,137,91,.34)']:['#6B8F8A','#B8895B','rgba(107,143,138,.24)'];
  return hovered?['#2E6F85','#0B4A86','rgba(11,74,134,.28)']:['#0B4A86','#6B8F8A','rgba(11,74,134,.22)'];
}
function wrapText(ctx,text,maxWidth){const words=String(text||'').split(' '); const lines=[]; let line=''; words.forEach(w=>{const test=line?`${line} ${w}`:w; if(ctx.measureText(test).width>maxWidth&&line){lines.push(line); line=w;}else line=test;}); if(line)lines.push(line); return lines.slice(0,2);}
function renderChart(){
  const canvas=$('provinceChart');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const dpr=window.devicePixelRatio||1;
  const rect=canvas.getBoundingClientRect();
  const isMobile=window.innerWidth<=720;
  const w=Math.max(rect.width,300);
  const h=isMobile?430:350;
  canvas.width=w*dpr;
  canvas.height=h*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  chartAreas=[];
  const data=DEMARCACIONES.map(m=>[m,municipioCounts().find(x=>x[0]===m)?.[1]||0]);
  const total=data.reduce((a,x)=>a+x[1],0);
  const max=Math.max(...data.map(x=>x[1]),1);
  const dark=document.documentElement.dataset.theme==='dark';
  const chartX=isMobile?18:56;
  const chartY=isMobile?58:76;
  const chartW=w-chartX-(isMobile?16:56);
  const chartH=isMobile?230:160;
  ctx.strokeStyle=dark?'rgba(255,255,255,.09)':'rgba(122,31,61,.10)';
  ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=chartY+chartH-(i/4)*chartH;
    ctx.beginPath(); ctx.moveTo(chartX,y); ctx.lineTo(chartX+chartW,y); ctx.stroke();
  }
  const gap=isMobile?18:32;
  const barW=Math.max(54,Math.min(isMobile?78:82,(chartW-gap*(data.length-1))/data.length));
  const totalW=barW*data.length+gap*(data.length-1);
  const x0=chartX+(chartW-totalW)/2;
  data.forEach(([label,val],i)=>{
    const hovered=i===chartHoverIndex;
    const x=x0+i*(barW+gap);
    const barH=val>0?Math.max((val/max)*chartH,32):0;
    const y=chartY+chartH-barH;
    const colors=municipioColor(label,hovered);
    if(val>0){
      ctx.save();
      ctx.shadowColor=colors[2]; ctx.shadowBlur=hovered?22:12; ctx.shadowOffsetY=hovered?9:6;
      const grad=ctx.createLinearGradient(0,y,0,y+barH); grad.addColorStop(0,colors[0]); grad.addColorStop(1,colors[1]);
      ctx.fillStyle=grad; roundRect(ctx,x,y,barW,barH,16); ctx.fill(); ctx.restore();
    }else{
      ctx.fillStyle=dark?'rgba(255,255,255,.08)':'rgba(122,31,61,.08)';
      roundRect(ctx,x,chartY+chartH-5,barW,5,5); ctx.fill();
    }
    const valText=String(val);
    const valueFont=isMobile?'900 22px Inter, sans-serif':'900 21px Inter, sans-serif';
    ctx.font=valueFont;
    const textW=ctx.measureText(valText).width;
    const pillW=Math.max(isMobile?44:42,textW+20);
    const pillH=isMobile?32:31;
    const pillX=x+(barW-pillW)/2;
    const pillY=(val>0?y:chartY+chartH)-pillH-12;
    ctx.save();
    ctx.shadowColor=dark?'rgba(0,0,0,.22)':'rgba(15,23,42,.10)';
    ctx.shadowBlur=10;
    ctx.shadowOffsetY=4;
    ctx.fillStyle=dark?'rgba(248,250,252,.94)':'rgba(255,255,255,.96)';
    roundRect(ctx,pillX,pillY,pillW,pillH,14);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle=dark?'#111827':'#0f172a';
    ctx.fillText(valText,pillX+(pillW-textW)/2,pillY+(isMobile?23:22));
    ctx.fillStyle=dark?((label==='Oviedo'||label==='Juancho')?'#F4CF9E':'#8DD3DA'):((label==='Oviedo'||label==='Juancho')?'#B8895B':'#0B4A86'); ctx.font=isMobile?'900 13px Inter, sans-serif':'900 13px Inter, sans-serif';
    const lines=wrapText(ctx,label,isMobile?barW+18:barW+55);
    lines.forEach((line,idx)=>ctx.fillText(line,x+(barW-ctx.measureText(line).width)/2,chartY+chartH+38+(idx*17)));
    ctx.fillStyle=dark?'rgba(217,239,255,.74)':'rgba(100,116,139,.86)'; ctx.font='800 11px Inter, sans-serif';
    const sub=val===1?'registro':'registros'; ctx.fillText(sub,x+(barW-ctx.measureText(sub).width)/2,chartY+chartH+(isMobile?82:68));
    chartAreas.push({x,y:val>0?y:chartY+chartH-14,w:barW,h:val>0?barH:18,label,val});
  });
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function chartPoint(e){const c=$('provinceChart'); const r=c.getBoundingClientRect(); return {x:e.clientX-r.left,y:e.clientY-r.top};}
function chartIndexAt(e){const p=chartPoint(e); return chartAreas.findIndex(a=>p.x>=a.x&&p.x<=a.x+a.w&&p.y>=a.y&&p.y<=a.y+a.h);}
function bindChartEvents(){const c=$('provinceChart'); if(!c)return; c.addEventListener('mousemove',e=>{const i=chartIndexAt(e); if(i!==chartHoverIndex){chartHoverIndex=i; renderChart();} c.style.cursor=i>-1?'pointer':'default'; if(i>-1)c.title=`${chartAreas[i].label}: ${chartAreas[i].val} registros`;}); c.addEventListener('mouseleave',()=>{chartHoverIndex=-1; c.style.cursor='default'; c.title=''; renderChart();}); c.addEventListener('click',e=>{const i=chartIndexAt(e); if(i<0)return; if($('filterDistrict'))$('filterDistrict').value=chartAreas[i].label; if($('filterMunicipio'))$('filterMunicipio').value=MUNICIPIOS.includes(chartAreas[i].label)?chartAreas[i].label:''; setPanel('consulta'); renderAll();});}
function renderRanking(){const box=$('provinceRanking'); if(!box)return; const data=municipioCounts(); box.innerHTML=data.map(([m,c],i)=>`<div class="ranking-item municipio-rank"><span class="rank-index">${i+1}</span><div><strong>${escapeHtml(m)}</strong><small>${c===1?'1 registro':`${c} registros`}</small></div><b>${c}</b></div>`).join('');}
function searchSummaryHtml(data){
  const q=clean($('searchInput')?.value);
  const byColegio=Object.entries(data.reduce((a,v)=>{const k=v.colegio||'Sin colegio'; a[k]=(a[k]||0)+1; return a;},{})).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'es',{numeric:true})).slice(0,6);
  const byRecinto=Object.entries(data.reduce((a,v)=>{const k=v.recinto||'Sin recinto'; a[k]=(a[k]||0)+1; return a;},{})).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'es',{numeric:true})).slice(0,4);
  const title=q?`Resultado para “${escapeHtml(q)}”`:'Resumen de registros visibles';
  return `<div class="search-summary-card">
    <div><h4>${title}</h4><p>${data.length} ${data.length===1?'registro encontrado':'registros encontrados'}</p></div>
    <div class="summary-pill-grid">
      ${byColegio.map(([k,c])=>`<span><b>${escapeHtml(k)}</b><small>${c} en colegio</small></span>`).join('')||'<span><b>0</b><small>sin colegios</small></span>'}
    </div>
    <div class="summary-mini-line">${byRecinto.map(([k,c])=>`<strong>${escapeHtml(k)}:</strong> ${c}`).join(' · ')||'Sin recintos registrados'}</div>
  </div>`;
}
function renderSearchCards(){
  const box=$('searchResults');
  if(!box)return;
  const data=filteredVoters().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  box.innerHTML=data.length?data.map(v=>`<article class="mobile-voter-card">
    <div class="mobile-voter-head">
      <div>
        <span class="mobile-voter-label">Simpatizante</span>
        <h4>${escapeHtml(v.name)}</h4>
      </div>
      <span class="mobile-voter-badge">${escapeHtml(v.district||v.municipio||'Sin demarcación')}</span>
    </div>
    <div class="mobile-voter-grid">
      <p><b>Cédula</b><span>${escapeHtml(v.cedula)}</span></p>
      <p><b>Teléfono</b><span>${escapeHtml(v.phone)}</span></p>
      <p><b>Edad</b><span>${escapeHtml(v.age)}</span></p>
      <p><b>Zona</b><span>${escapeHtml(v.zone)}</span></p>
      <p><b>Recinto</b><span>${escapeHtml(v.recinto)}</span></p>
      <p><b>Mesa</b><span>${escapeHtml(v.colegio)}</span></p>
      <p class="mobile-voter-full"><b>Dirección</b><span>${escapeHtml(v.address)}</span></p>
      <p class="mobile-voter-full"><b>Registrado por</b><span>${escapeHtml(v.registered_by_name)} · ${escapeHtml(v.registered_by_role)}</span></p>
      ${v.observation?`<p class="mobile-voter-full"><b>Observación</b><span>${escapeHtml(v.observation)}</span></p>`:''}
    </div>
    <div class="mobile-voter-foot">
      <small>${new Date(v.created_at).toLocaleString('es-DO')}</small>
      ${canEditVoter(v)?`<div class="row-actions"><button class="mini-btn" data-edit-voter="${v.id}">Editar</button><button class="mini-btn danger-mini" data-delete-voter="${v.id}">Eliminar</button></div>`:''}
    </div>
  </article>`).join(''):`<div class="mobile-empty-state">No hay registros disponibles.</div>`;
}
function renderVotersTable(){const tbody=$('votersTableBody'); if(!tbody)return; const data=filteredVoters().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)); $('filteredCountBadge') && ($('filteredCountBadge').textContent=`${data.length} resultados`); $('filteredCountBadgeTop') && ($('filteredCountBadgeTop').textContent=`${data.length} resultados`); tbody.innerHTML=data.length?data.map(v=>`<tr><td>${escapeHtml(v.name)}</td><td>${escapeHtml(v.cedula)}</td><td>${escapeHtml(v.phone)}</td><td>${escapeHtml(v.age)}</td><td>${escapeHtml(v.address)}</td><td>${escapeHtml(v.municipio)}</td><td>${escapeHtml(v.district||v.municipio||'')}</td><td>${escapeHtml(v.zone)}</td><td>${escapeHtml(v.recinto)}</td><td>${escapeHtml(v.colegio)}</td><td>${escapeHtml(v.observation||'')}</td><td>${escapeHtml(v.registered_by_name)}</td><td><span class="badge">${escapeHtml(v.registered_by_role)}</span></td><td>${new Date(v.created_at).toLocaleString('es-DO')}</td><td>${canEditVoter(v)?`<div class="row-actions"><button class="mini-btn" data-edit-voter="${v.id}">Editar</button><button class="mini-btn danger-mini" data-delete-voter="${v.id}">Eliminar</button></div>`:''}</td></tr>`).join(''):`<tr><td colspan="15" class="empty-cell">No hay registros disponibles.</td></tr>`;}
function filteredUsersList(){
  const q=clean($('userSearchInput')?.value).toLowerCase();
  const role=$('userRoleFilter')?.value||'';
  const status=$('userStatusFilter')?.value||'';
  return visibleUsers().filter(u=>{
    const hay=[u.name,u.username,u.email,u.role,u.phone,u.municipio,u.district,u.zone,u.recommended_by_name,u.status].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(!role||u.role===role)&&(!status||u.status===status);
  });
}
function renderUsersTable(){
  const tbody=$('usersTableBody');
  if(!tbody)return;
  const all=visibleUsers();
  const users=filteredUsersList();
  $('usersTotalBadge')&&($('usersTotalBadge').textContent=`${all.length} ${all.length===1?'usuario':'usuarios'}`);
  $('usersApprovedBadge')&&($('usersApprovedBadge').textContent=`${all.filter(u=>u.status==='Aprobado').length} aprobados`);
  const rows=users.length?users.map(u=>`<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.email)}</td><td><span class="badge">${escapeHtml(u.role)}</span></td><td>${escapeHtml(u.phone)}</td><td>${escapeHtml(u.municipio||'')}</td><td>${escapeHtml(u.district||u.municipio||'')}</td><td>${escapeHtml(u.zone||'')}</td><td>${escapeHtml(u.recommended_by_name||'')}</td><td><span class="badge ${u.status==='Aprobado'?'status-ok':'status-pending'}">${escapeHtml(u.status)}</span></td><td>${isAdmin()?`<div class="row-actions">${u.status!=='Aprobado'?`<button class="mini-btn" data-approve-user="${u.id}">Aprobar</button>`:''}<button class="mini-btn" data-edit-user="${u.id}">Editar</button>${u.id!==currentUser?.id?`<button class="mini-btn danger-mini" data-delete-user="${u.id}">Eliminar</button>`:''}</div>`:''}</td></tr>`).join(''):`<tr><td colspan="11" class="empty-cell">No hay usuarios disponibles.</td></tr>`;
  tbody.innerHTML=rows;

  const wrap=tbody.closest('.table-wrap');
  if(wrap && !document.getElementById('usersMobileList')){
    wrap.insertAdjacentHTML('afterend','<div class="users-mobile-list" id="usersMobileList" aria-label="Lista de usuarios"></div>');
  }
  const mobile=$('usersMobileList');
  if(mobile){
    mobile.innerHTML=users.length?users.map(u=>`
      <article class="user-mobile-card">
        <div class="user-mobile-top">
          <div>
            <strong>${escapeHtml(u.name)}</strong>
            <span>@${escapeHtml(u.username)}</span>
          </div>
          <span class="badge ${u.status==='Aprobado'?'status-ok':'status-pending'}">${escapeHtml(u.status)}</span>
        </div>
        <div class="user-mobile-grid">
          <p><small>Correo</small>${escapeHtml(u.email||'—')}</p>
          <p><small>Rol</small>${escapeHtml(u.role||'—')}</p>
          <p><small>Teléfono</small>${escapeHtml(u.phone||'—')}</p>
          <p><small>Municipio</small>${escapeHtml(u.municipio||'—')}</p>
        </div>
        ${isAdmin()?`<div class="row-actions user-mobile-actions">${u.status!=='Aprobado'?`<button class="mini-btn" data-approve-user="${u.id}">Aprobar</button>`:''}<button class="mini-btn" data-edit-user="${u.id}">Editar</button>${u.id!==currentUser?.id?`<button class="mini-btn danger-mini" data-delete-user="${u.id}">Eliminar</button>`:''}</div>`:''}
      </article>`).join(''):`<div class="empty-cell users-mobile-empty">No hay usuarios disponibles.</div>`;
  }
}
function renderAll(){updateDynamicFilters(); renderStats(); renderChart(); renderRanking(); renderSearchCards(); renderVotersTable(); renderUsersTable(); renderAudit();}
function resetVoterForm(){if(!$('voterForm'))return; $('voterForm').reset(); $('editingVoterId').value=''; $('voterFormTitle').textContent='Registrar votante / simpatizante'; $('saveVoterBtn').lastChild.textContent=' Guardar registro'; $('cancelEditVoterBtn')?.classList.add('hidden'); if($('voterZone')){$('voterZone').readOnly=false;} if($('voterMunicipio')){$('voterMunicipio').disabled=false;} if($('voterDistrict')){$('voterDistrict').disabled=false;} fillSelect($('voterMunicipio'),MUNICIPIOS,'Seleccione'); fillDistrictSelect($('voterDistrict'),$('voterMunicipio')?.value,'Seleccione'); if(isZone()&&currentUser.zone){$('voterZone').value=currentUser.zone; $('voterZone').readOnly=true;} if(isZone()&&currentUser.municipio){$('voterMunicipio').value=currentUser.municipio; fillDistrictSelect($('voterDistrict'),currentUser.municipio,'Seleccione');} if(isZone()&&currentUser.district){$('voterDistrict').value=currentUser.district;} }
function editVoter(id){const v=read(DB.voters).find(x=>x.id===id); if(!v||!canEditVoter(v))return; $('editingVoterId').value=v.id; $('voterName').value=v.name; $('voterCedula').value=v.cedula; $('voterPhone').value=v.phone; $('voterAge').value=v.age; $('voterAddress').value=v.address; $('voterMunicipio').value=v.municipio; fillDistrictSelect($('voterDistrict'),v.municipio,'Seleccione'); $('voterDistrict').value=v.district||v.municipio||''; $('voterZone').value=v.zone; $('voterRecinto').value=v.recinto; $('voterColegio').value=v.colegio; $('voterObservation').value=v.observation||''; $('voterFormTitle').textContent='Editar registro'; $('saveVoterBtn').lastChild.textContent=' Actualizar registro'; $('cancelEditVoterBtn')?.classList.remove('hidden'); setPanel('registro'); window.scrollTo({top:0,behavior:'smooth'});}
function deleteVoter(id){const voters=read(DB.voters); const v=voters.find(x=>x.id===id); if(!v||!canEditVoter(v))return; if(!confirm('¿Deseas eliminar este registro?'))return; write(DB.voters,voters.filter(x=>x.id!==id)); addAudit('Registro eliminado','Registros',`${v.name||'Sin nombre'} · ${v.cedula||''}`); renderAll();}
function openUserModal(id){const u=read(DB.users).find(x=>x.id===id); if(!u||!isAdmin())return; $('editUserId').value=u.id; $('editUserName').value=u.name; $('editUserUsername').value=u.username; $('editUserEmail').value=u.email; $('editUserPhone').value=u.phone; $('editUserRole').value=u.role; $('editUserMunicipio').value=u.municipio||''; fillDistrictSelect($('editUserDistrict'),u.municipio||'','Seleccione'); $('editUserDistrict').value=u.district||u.municipio||''; $('editUserZone').value=u.zone||''; fillRecommendedSelect($('editUserRecommendedBy'),u.recommended_by_id||''); $('userEditModal').classList.remove('hidden');}
function closeUserModal(){ $('userEditModal')?.classList.add('hidden'); }
function exportExcel(){
  const rows=filteredVoters().sort((a,b)=>(a.registered_by_role||'').localeCompare(b.registered_by_role||'','es')||(a.registered_by_name||'').localeCompare(b.registered_by_name||'','es')||(a.name||'').localeCompare(b.name||'','es'));
  if(!rows.length)return alert('No hay registros para exportar.');
  addAudit('Descarga de Excel','Reportes',`${rows.length} registros exportados`);
  const users=visibleUsers().sort((a,b)=>(a.role||'').localeCompare(b.role||'','es')||(a.name||'').localeCompare(b.name||'','es'));
  const now=new Date();
  const today=now.toLocaleString('es-DO');
  const fileDate=now.toISOString().slice(0,10);
  const wb=XLSX.utils.book_new();
  const blue='001F54', blue2='003D8F', sky='2F9FD3', red='D62828', green='0F766E', gold='D97706', light='EAF4FF', soft='F8FBFF', soft2='EEF6FF', roleFill='D9E8FF', regFill='EFF6FF', border='C9D8EA', white='FFFFFF', text='0F172A', muted='64748B';
  const sanitize=n=>String(n||'General').replace(/[\\/?*\[\]:]/g,' ').slice(0,31).trim()||'General';
  const formatDate=v=>v?new Date(v).toLocaleString('es-DO'):'';
  const countBy=(data,key)=>data.reduce((acc,x)=>{const k=clean(typeof key==='function'?key(x):x[key])||'Sin especificar'; acc[k]=(acc[k]||0)+1; return acc;},{});
  const headers=['Nombre','Cédula','Teléfono','Edad','Provincia','Municipio','Distrito municipal','Zona','Dirección','Recinto','Colegio','Observación','Registrado por','Rol','Fecha'];
  const widths=[34,16,16,8,16,16,24,22,34,34,16,24,30,24,24];
  const titleStyle={font:{bold:true,sz:18,color:{rgb:white}},fill:{fgColor:{rgb:blue}},alignment:{horizontal:'left',vertical:'center'},border:{top:{style:'thin',color:{rgb:blue}},bottom:{style:'thin',color:{rgb:blue}},left:{style:'thin',color:{rgb:blue}},right:{style:'thin',color:{rgb:blue}}}};
  const subtitleStyle={font:{bold:true,sz:11,color:{rgb:blue}},fill:{fgColor:{rgb:light}},alignment:{horizontal:'left',vertical:'center'},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const headerStyle={font:{bold:true,color:{rgb:white}},fill:{fgColor:{rgb:blue2}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const roleStyle={font:{bold:true,sz:13,color:{rgb:blue}},fill:{fgColor:{rgb:roleFill}},alignment:{horizontal:'left',vertical:'center'},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const registrarStyle={font:{bold:true,sz:11,color:{rgb:text}},fill:{fgColor:{rgb:regFill}},alignment:{horizontal:'left',vertical:'center'},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const cellStyle={font:{color:{rgb:text}},alignment:{vertical:'center',wrapText:true},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const altStyle={...cellStyle,fill:{fgColor:{rgb:soft}}};
  const totalStyle={font:{bold:true,color:{rgb:white}},fill:{fgColor:{rgb:green}},alignment:{horizontal:'center',vertical:'center'},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const summaryStyle={font:{bold:true,color:{rgb:blue}},fill:{fgColor:{rgb:soft2}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const makeVoterRow=v=>[v.name||'',v.cedula||'',v.phone||'',v.age||'',v.province||PROVINCE,v.municipio||'',v.district||v.municipio||'',v.zone||'',v.address||'',v.recinto||'',v.colegio||'',v.observation||'Normal',v.registered_by_name||'',v.registered_by_role||'',formatDate(v.created_at)];
  function styleRange(ws, rowIndex, style, cols=headers.length){
    for(let c=0;c<cols;c++){
      const addr=XLSX.utils.encode_cell({r:rowIndex,c});
      if(!ws[addr])ws[addr]={t:'s',v:''};
      ws[addr].s=style;
    }
  }
  function addGroupedReport(){
    const aoa=[];
    const merges=[];
    aoa.push(['REPORTE INTERNO DE REGISTROS']);
    merges.push({s:{r:0,c:0},e:{r:0,c:headers.length-1}});
    aoa.push([`Pedernales Primero · Generado: ${today} · Total de registros: ${rows.length}`]);
    merges.push({s:{r:1,c:0},e:{r:1,c:headers.length-1}});
    aoa.push(['Total general',rows.length,'Pedernales',rows.filter(v=>(v.district||v.municipio)==='Pedernales').length,'Oviedo',rows.filter(v=>(v.district||v.municipio)==='Oviedo').length,'Usuarios visibles',users.length]);
    aoa.push(headers);
    const rowTypes=['title','subtitle','summary','header'];
    const roles=[...new Set(rows.map(v=>v.registered_by_role||'Sin rol'))].sort((a,b)=>a.localeCompare(b,'es'));
    roles.forEach(role=>{
      const byRole=rows.filter(v=>(v.registered_by_role||'Sin rol')===role);
      aoa.push([`ROL: ${role} · ${byRole.length} registros`]);
      merges.push({s:{r:aoa.length-1,c:0},e:{r:aoa.length-1,c:headers.length-1}});
      rowTypes.push('role');
      const registrars=[...new Set(byRole.map(v=>v.registered_by_name||'Sin registrador'))].sort((a,b)=>a.localeCompare(b,'es'));
      registrars.forEach(reg=>{
        const byReg=byRole.filter(v=>(v.registered_by_name||'Sin registrador')===reg);
        const sample=byReg[0]||{};
        aoa.push([`REGISTRADOR: ${reg} | ROL: ${sample.registered_by_role||'Sin rol'} | MUNICIPIO: ${sample.municipio||'No especificado'} | DISTRITO: ${sample.district||sample.municipio||'No especificado'} | ZONA: ${sample.zone||'No especificada'} | TOTAL: ${byReg.length}`]);
        merges.push({s:{r:aoa.length-1,c:0},e:{r:aoa.length-1,c:headers.length-1}});
        rowTypes.push('registrar');
        byReg.forEach(v=>{aoa.push(makeVoterRow(v)); rowTypes.push('data');});
      });
    });
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges']=merges;
    ws['!cols']=widths.map(w=>({wch:w}));
    ws['!freeze']={xSplit:0,ySplit:4};
    ws['!autofilter']={ref:`A4:${XLSX.utils.encode_col(headers.length-1)}${aoa.length}`};
    for(let r=0;r<aoa.length;r++){
      if(rowTypes[r]==='title')styleRange(ws,r,titleStyle);
      else if(rowTypes[r]==='subtitle')styleRange(ws,r,subtitleStyle);
      else if(rowTypes[r]==='summary')styleRange(ws,r,summaryStyle);
      else if(rowTypes[r]==='header')styleRange(ws,r,headerStyle);
      else if(rowTypes[r]==='role')styleRange(ws,r,roleStyle);
      else if(rowTypes[r]==='registrar')styleRange(ws,r,registrarStyle);
      else styleRange(ws,r,r%2===0?altStyle:cellStyle);
    }
    ws['!rows']=aoa.map((_,i)=>({hpt:i===0?28:i===1?22:i===3?28:22}));
    XLSX.utils.book_append_sheet(wb,ws,'Reporte Interno');
  }
  function addSimpleSheet(name,data,description){
    const aoa=[['PEDERNALES PRIMERO'],[description||`Generado: ${today}`],['Total',data.length],[],headers,...data.map(makeVoterRow)];
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:headers.length-1}},{s:{r:1,c:0},e:{r:1,c:headers.length-1}},{s:{r:2,c:0},e:{r:2,c:headers.length-1}}];
    ws['!cols']=widths.map(w=>({wch:w}));
    ws['!freeze']={xSplit:0,ySplit:5};
    ws['!autofilter']={ref:`A5:${XLSX.utils.encode_col(headers.length-1)}${aoa.length}`};
    for(let r=0;r<aoa.length;r++){
      if(r===0)styleRange(ws,r,titleStyle);
      else if(r===1||r===2)styleRange(ws,r,subtitleStyle);
      else if(r===4)styleRange(ws,r,headerStyle);
      else if(r>4)styleRange(ws,r,r%2===0?altStyle:cellStyle);
    }
    XLSX.utils.book_append_sheet(wb,ws,sanitize(name));
  }
  function addDashboard(){
    const municipioCounts=countBy(rows,v=>v.district||v.municipio);
    const roleCounts=countBy(rows,'registered_by_role');
    const registrarCounts=countBy(rows,'registered_by_name');
    const maxReg=Math.max(...Object.values(registrarCounts),1);
    const bar=(value,color)=>({v:`${'█'.repeat(Math.max(1,Math.round((value/Math.max(maxReg,1))*24)))} ${value}`,s:{font:{bold:true,color:{rgb:color}},alignment:{vertical:'center'},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}}});
    const aoa=[['PEDERNALES PRIMERO'],[`Dashboard ejecutivo · Generado: ${today}`],[],['Indicador','Valor','Detalle'],['Total de registros',rows.length,'Registros visibles exportados'],['Pedernales',municipioCounts.Pedernales||0,'Municipio Pedernales'],['José Francisco Peña Gómez',municipioCounts['José Francisco Peña Gómez']||0,'Distrito municipal'],['Oviedo',municipioCounts.Oviedo||0,'Municipio Oviedo'],['Juancho',municipioCounts.Juancho||0,'Distrito municipal'],['Usuarios visibles',users.length,'Usuarios según permisos'],[],['Registros por rol','Total','Detalle'],...Object.entries(roleCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,v,`${v} registros`]),[],['Ranking de registradores','Total','Gráfico'],...Object.entries(registrarCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,v,bar(v,k.toLowerCase().includes('oviedo')?green:gold)])];
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:2}},{s:{r:1,c:0},e:{r:1,c:2}}];
    ws['!cols']=[{wch:34},{wch:14},{wch:42}];
    for(let r=0;r<aoa.length;r++){
      for(let c=0;c<3;c++){
        const addr=XLSX.utils.encode_cell({r,c});
        if(!ws[addr])continue;
        if(ws[addr].s)continue;
        if(r===0)ws[addr].s=titleStyle;
        else if(r===1)ws[addr].s=subtitleStyle;
        else if(['Indicador','Registros por rol','Ranking de registradores'].includes(aoa[r][0]))ws[addr].s=headerStyle;
        else ws[addr].s=r%2===0?altStyle:cellStyle;
        if(c===1&&r>2)ws[addr].s={...ws[addr].s,font:{bold:true,color:{rgb:blue}},alignment:{horizontal:'center',vertical:'center'}};
      }
    }
    XLSX.utils.book_append_sheet(wb,ws,'Dashboard');
  }
  function addUsers(){
    const userHeaders=['Nombre','Usuario','Correo','Teléfono','Rol','Municipio','Distrito municipal','Zona','Recomendado por','Estado','Fecha'];
    const aoa=[['USUARIOS DEL SISTEMA'],[`Generado: ${today}`],['Total',users.length],[],userHeaders,...users.map(u=>[u.name||'',u.username||'',u.email||'',u.phone||'',u.role||'',u.municipio||'',u.district||u.municipio||'',u.zone||'',u.recommended_by_name||'',u.status||'',formatDate(u.created_at)])];
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:userHeaders.length-1}},{s:{r:1,c:0},e:{r:1,c:userHeaders.length-1}},{s:{r:2,c:0},e:{r:2,c:userHeaders.length-1}}];
    ws['!cols']=[30,18,32,16,24,18,24,22,30,14,24].map(w=>({wch:w}));
    ws['!freeze']={xSplit:0,ySplit:5};
    ws['!autofilter']={ref:`A5:${XLSX.utils.encode_col(userHeaders.length-1)}${aoa.length}`};
    for(let r=0;r<aoa.length;r++){
      for(let c=0;c<userHeaders.length;c++){
        const addr=XLSX.utils.encode_cell({r,c});
        if(!ws[addr])ws[addr]={t:'s',v:''};
        if(r===0)ws[addr].s=titleStyle;
        else if(r===1||r===2)ws[addr].s=subtitleStyle;
        else if(r===4)ws[addr].s=headerStyle;
        else if(r>4)ws[addr].s=r%2===0?altStyle:cellStyle;
      }
    }
    XLSX.utils.book_append_sheet(wb,ws,'Usuarios');
  }
  addDashboard();
  addGroupedReport();
  addSimpleSheet('Todos los registros',rows,`Tabla completa · Generado: ${today}`);
  DEMARCACIONES.forEach(m=>{const data=rows.filter(v=>(v.district||v.municipio)===m); if(data.length)addSimpleSheet(m,data,`Registros de ${m} · Total: ${data.length}`);});
  [...new Set(rows.map(v=>v.registered_by_role||'Sin rol'))].sort((a,b)=>a.localeCompare(b,'es')).forEach(role=>{const data=rows.filter(v=>(v.registered_by_role||'Sin rol')===role); if(data.length)addSimpleSheet(`Rol ${role}`,data,`Registros por rol: ${role} · Total: ${data.length}`);});
  addUsers();
  wb.Workbook={Views:[{RTL:false}]};
  XLSX.writeFile(wb,`Pedernales_Primero_Reporte_${fileDate}.xlsx`,{cellStyles:true,bookType:'xlsx'});
}

function countByField(data, field, fallback='Sin especificar', limit=6){
  return Object.entries(data.reduce((a,v)=>{const k=clean(v[field])||fallback; a[k]=(a[k]||0)+1; return a;},{})).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'es',{numeric:true})).slice(0,limit);
}
function activeFilterText(){
  const parts=[];
  const map=[['filterMunicipio','Municipio'],['filterDistrict','Distrito'],['filterSector','Zona'],['filterMesa','Recinto'],['filterColegio','Colegio'],['filterRole','Rol'],['filterRegistrar','Registrador']];
  map.forEach(([id,label])=>{const v=$(id)?.value; if(v)parts.push(`${label}: ${v}`);});
  const q=clean($('searchInput')?.value); if(q)parts.unshift(`Búsqueda: ${q}`);
  return parts.length?parts.join(' · '):'Sin filtros aplicados';
}
function searchSummaryHtml(data){
  const total=data.length;
  const q=clean($('searchInput')?.value);
  const title=q?`Resultado para “${escapeHtml(q)}”`:'Consulta general de simpatizantes';
  const colegios=countByField(data,'colegio','Sin colegio',6);
  const recintos=countByField(data,'recinto','Sin recinto',5);
  const demarcaciones=Object.entries(data.reduce((a,v)=>{const k=v.district||v.municipio||'Sin demarcación'; a[k]=(a[k]||0)+1; return a;},{})).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'es',{numeric:true})).slice(0,5);
  const registradores=countByField(data,'registered_by_name','Sin registrador',5);
  const rows=(items)=>items.length?items.map(([k,c])=>`<div class="summary-row"><strong>${escapeHtml(k)}</strong><b>${c}</b></div>`).join(''):'<div class="summary-row"><strong>Sin datos</strong><b>0</b></div>';
  return `<div class="search-summary-card">
    <div><h4>${title}</h4><p>${total} ${total===1?'registro encontrado':'registros encontrados'}</p><div class="summary-mini-line">${escapeHtml(activeFilterText())}</div></div>
    <div class="summary-pill-grid">
      <span><b>${total}</b><small>Total visible</small></span>
      <span><b>${new Set(data.map(v=>v.colegio).filter(Boolean)).size}</b><small>Colegios encontrados</small></span>
      <span><b>${new Set(data.map(v=>v.recinto).filter(Boolean)).size}</b><small>Recintos encontrados</small></span>
      <span><b>${new Set(data.map(v=>v.registered_by_name).filter(Boolean)).size}</b><small>Registradores</small></span>
    </div>
    <div class="summary-block-grid">
      <div><p class="summary-section-title">Colegios electorales</p><div class="summary-list">${rows(colegios)}</div></div>
      <div><p class="summary-section-title">Recintos</p><div class="summary-list">${rows(recintos)}</div></div>
      <div><p class="summary-section-title">Demarcaciones</p><div class="summary-list">${rows(demarcaciones)}</div></div>
      <div><p class="summary-section-title">Registradores</p><div class="summary-list">${rows(registradores)}</div></div>
    </div>
  </div>`;
}
function bindEvents(){ $('showLogin')?.addEventListener('click',()=>showAuthTab('login')); $('showRegister')?.addEventListener('click',()=>showAuthTab('register')); $('logoutBtn')?.addEventListener('click',logout); $('sidebarToggleBtn')?.addEventListener('click',()=>{$('appSidebar')?.classList.contains('open')?closeSidebar():openSidebar();}); $('sidebarOverlay')?.addEventListener('click',closeSidebar); bindChartEvents(); document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>setPanel(b.dataset.panel))); document.querySelectorAll('.nav-group-header').forEach(h=>h.addEventListener('click',()=>{h.classList.toggle('open'); const g=$(h.dataset.target); if(g)g.classList.toggle('collapsed')})); $('themeToggleBtn')?.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark'; document.documentElement.dataset.theme=next; localStorage.setItem(DB.theme,next); renderAll();}); ['voterCedula'].forEach(id=>$(id)?.addEventListener('input',e=>e.target.value=formatCedula(e.target.value))); ['voterPhone','registerPhone','editUserPhone'].forEach(id=>$(id)?.addEventListener('input',e=>e.target.value=formatPhone(e.target.value))); $('topbarSearchInput')?.addEventListener('input',e=>{if($('searchInput'))$('searchInput').value=e.target.value; setPanel('consulta'); renderAll();}); ['searchInput','filterMunicipio','filterDistrict','filterSector','filterMesa','filterColegio','filterRole','filterRegistrar'].forEach(id=>$(id)?.addEventListener('input',renderAll)); ['userSearchInput','userRoleFilter','userStatusFilter'].forEach(id=>$(id)?.addEventListener('input',renderAll)); ['auditSearchInput','auditActionFilter'].forEach(id=>$(id)?.addEventListener('input',renderAudit)); $('exportAuditBtn')?.addEventListener('click',exportAudit); $('clearAuditBtn')?.addEventListener('click',()=>{if(!isAdmin())return; if(confirm('¿Deseas limpiar el historial de auditoría? Esta acción solo conserva el evento de limpieza.')){addAudit('Auditoría limpiada','Auditoría','El administrador limpió el historial'); write(DB.audit,read(DB.audit).slice(0,1)); renderAudit();}}); $('refreshUsersBtn')?.addEventListener('click',renderAll); $('clearFiltersBtn')?.addEventListener('click',()=>{['searchInput','topbarSearchInput','filterMunicipio','filterDistrict','filterSector','filterMesa','filterColegio','filterRole','filterRegistrar'].forEach(id=>{if($(id))$(id).value=''}); renderAll();}); $('exportBtn')?.addEventListener('click',exportExcel); $('cancelEditVoterBtn')?.addEventListener('click',resetVoterForm); $('forgotPasswordBtn')?.addEventListener('click',openForgotPasswordModal); $('closeForgotPasswordModalBtn')?.addEventListener('click',closeForgotPasswordModal); $('closeForgotModalBtn')?.addEventListener('click',closeForgotPasswordModal); $('cancelForgotBtn')?.addEventListener('click',closeForgotPasswordModal); $('forgotPasswordModal')?.addEventListener('click',e=>{if(e.target===$('forgotPasswordModal'))closeForgotPasswordModal();}); $('forgotPasswordForm')?.addEventListener('submit',sendPasswordRecoveryRequest); $('forgotForm')?.addEventListener('submit',sendPasswordRecoveryRequest); $('resetForm')?.addEventListener('submit',changePasswordFromResetLink); $('closeResetModalBtn')?.addEventListener('click',closeResetPasswordModal); $('cancelResetModalBtn')?.addEventListener('click',closeResetPasswordModal); $('resetPasswordModal')?.addEventListener('click',e=>{if(e.target===$('resetPasswordModal'))closeResetPasswordModal();}); ['resetPassword','resetPasswordConfirm'].forEach(id=>$(id)?.addEventListener('input',updateResetPasswordUi)); document.querySelectorAll('[data-toggle-password]').forEach(btn=>btn.addEventListener('click',()=>{const input=$(btn.dataset.togglePassword); if(!input)return; const visible=input.type==='text'; input.type=visible?'password':'text'; btn.textContent=visible?'Mostrar':'Ocultar'; btn.setAttribute('aria-label',visible?'Mostrar contraseña':'Ocultar contraseña');})); document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('resetPasswordModal')?.classList.contains('hidden'))closeResetPasswordModal();}); $('registerMunicipio')?.addEventListener('change',e=>fillDistrictSelect($('registerDistrict'),e.target.value,'Seleccione')); $('editUserMunicipio')?.addEventListener('change',e=>fillDistrictSelect($('editUserDistrict'),e.target.value,'Seleccione')); $('voterMunicipio')?.addEventListener('change',e=>fillDistrictSelect($('voterDistrict'),e.target.value,'Seleccione'));
$('loginForm')?.addEventListener('submit',async e=>{e.preventDefault(); const id=clean($('loginUser').value).toLowerCase(); const pass=$('loginPassword').value; const user=read(DB.users).find(u=>u.username.toLowerCase()===id||u.email.toLowerCase()===id); if(!user){addAudit('Intento fallido de acceso','Sesión',`Usuario no encontrado: ${id}`,{name:id,role:'No autenticado',username:id}); return msg($('authMessage'),'Usuario no encontrado.','error');} if(user.status!=='Aprobado'){addAudit('Intento fallido de acceso','Sesión',`Usuario pendiente o no aprobado: ${id}`,user); return msg($('authMessage'),'Este usuario aún no ha sido aprobado.','error');} if(!await verifyPassword(pass,user.password_hash)){addAudit('Intento fallido de acceso','Sesión',`Contraseña incorrecta: ${id}`,user); return msg($('authMessage'),'Contraseña incorrecta.','error');} loginUser(user);});
$('registerForm')?.addEventListener('submit',async e=>{e.preventDefault(); const users=read(DB.users); const first=users.length===0; const pass=$('registerPassword').value; const pass2=$('registerPasswordConfirm').value; if(pass!==pass2)return msg($('authMessage'),'Las contraseñas no coinciden.','error'); const username=clean($('registerUsername').value); const email=clean($('registerEmail').value); if(users.some(u=>u.username.toLowerCase()===username.toLowerCase()||u.email.toLowerCase()===email.toLowerCase()))return msg($('authMessage'),'Ya existe un usuario con ese usuario o correo.','error'); const recommender=users.find(u=>u.id===$('registerRecommendedBy')?.value); const user={id:uid(),name:clean($('registerName').value),username,email,phone:clean($('registerPhone').value),role:first?'Administrador':$('registerRole').value,province:PROVINCE,municipio:clean($('registerMunicipio').value),district:clean($('registerDistrict')?.value),zone:clean($('registerZone').value),recommended_by_id:first?'':(recommender?.id||''),recommended_by_name:first?'':(recommender?.name||''),recommended_by_role:first?'':(recommender?.role||''),status:first?'Aprobado':'Pendiente',password_hash:await hashPassword(pass),created_at:new Date().toISOString()}; users.push(user); write(DB.users,users); $('registerForm').reset(); initSelects(); addAudit(first?'Administrador creado':'Usuario solicitado','Usuarios',`${user.name} · ${user.role}`, first?user:null); msg($('authMessage'),first?'Administrador creado. Ya puedes iniciar sesión.':'Usuario creado. Debe ser aprobado por el administrador.','success'); showAuthTab('login');});
$('voterForm')?.addEventListener('submit',e=>{e.preventDefault(); const voters=read(DB.voters); const id=$('editingVoterId').value; const ced=clean($('voterCedula').value); const dup=voters.find(v=>v.cedula===ced&&v.id!==id); if(dup)return msg($('voterMessage'),`Esta cédula ya está registrada por ${dup.registered_by_name}.`,'error'); const item={name:clean($('voterName').value),cedula:ced,phone:clean($('voterPhone').value),age:clean($('voterAge').value),address:clean($('voterAddress').value),province:PROVINCE,municipio:clean($('voterMunicipio').value),district:clean($('voterDistrict')?.value),zone:clean($('voterZone').value),recinto:clean($('voterRecinto').value),colegio:clean($('voterColegio').value),observation:clean($('voterObservation').value)}; if(id){const i=voters.findIndex(v=>v.id===id); if(i>-1&&canEditVoter(voters[i]))voters[i]={...voters[i],...item,updated_at:new Date().toISOString()};} else voters.push({id:uid(),...item,registered_by_id:currentUser.id,registered_by_name:currentUser.name,registered_by_role:currentUser.role,created_at:new Date().toISOString()}); write(DB.voters,voters); addAudit(id?'Registro editado':'Registro agregado','Registros',`${item.name} · ${item.cedula}`); resetVoterForm(); renderAll(); msg($('voterMessage'),id?'Registro actualizado correctamente.':'Registro guardado correctamente.','success');});
$('userEditForm')?.addEventListener('submit',e=>{e.preventDefault(); if(!isAdmin())return; const id=$('editUserId').value; const users=read(DB.users).map(u=>u.id===id?{...u,name:clean($('editUserName').value),username:clean($('editUserUsername').value),email:clean($('editUserEmail').value),phone:clean($('editUserPhone').value),role:$('editUserRole').value,province:PROVINCE,municipio:clean($('editUserMunicipio').value),district:clean($('editUserDistrict')?.value),zone:clean($('editUserZone').value),recommended_by_id:$('editUserRecommendedBy')?.value||'',recommended_by_name:approvedUsers().find(x=>x.id===$('editUserRecommendedBy')?.value)?.name||'',recommended_by_role:approvedUsers().find(x=>x.id===$('editUserRecommendedBy')?.value)?.role||''}:u); write(DB.users,users); addAudit('Usuario editado','Usuarios',`${clean($('editUserName').value)} · ${$('editUserRole').value}`); closeUserModal(); renderAll();}); $('closeUserEditModalBtn')?.addEventListener('click',closeUserModal); $('cancelUserEditBtn')?.addEventListener('click',closeUserModal);
document.body.addEventListener('click',e=>{const t=e.target; if(t.dataset.editVoter)editVoter(t.dataset.editVoter); if(t.dataset.deleteVoter)deleteVoter(t.dataset.deleteVoter); if(t.dataset.approveUser&&isAdmin()){const au=read(DB.users).find(u=>u.id===t.dataset.approveUser); write(DB.users,read(DB.users).map(u=>u.id===t.dataset.approveUser?{...u,status:'Aprobado'}:u)); addAudit('Usuario aprobado','Usuarios',`${au?.name||'Usuario'} · ${au?.role||''}`); renderAll();} if(t.dataset.editUser)openUserModal(t.dataset.editUser); if(t.dataset.deleteUser&&isAdmin()){if(confirm('¿Deseas eliminar este usuario?')){const du=read(DB.users).find(u=>u.id===t.dataset.deleteUser); write(DB.users,read(DB.users).filter(u=>u.id!==t.dataset.deleteUser)); addAudit('Usuario eliminado','Usuarios',`${du?.name||'Usuario'} · ${du?.role||''}`); renderAll();}}});}
function migrateData(){
  const users=read(DB.users).map(u=>({...u,district:u.district||u.municipio||'',recommended_by_id:u.recommended_by_id||'',recommended_by_name:u.recommended_by_name||'',recommended_by_role:u.recommended_by_role||''}));
  const voters=read(DB.voters).map(v=>({...v,district:v.district||v.municipio||''}));
  write(DB.users,users);
  write(DB.voters,voters);
  if(!localStorage.getItem(DB.audit))write(DB.audit,[]);
}
async function boot(){
  await loadSupabaseData();
  migrateData();
  document.documentElement.dataset.theme=localStorage.getItem(DB.theme)||document.documentElement.dataset.theme||'light';
  initSelects();
  bindEvents();
  const sid=localStorage.getItem(DB.session);
  const user=read(DB.users).find(u=>u.id===sid&&u.status==='Aprobado');
  if(user)loginUser(user);
  else {$('dashboardSection')?.classList.add('hidden'); $('authSection')?.classList.remove('hidden'); unlockAuthScroll(); showAuthTab('login');}
  handleResetLink();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  window.addEventListener('resize',renderChart);
}
document.addEventListener('DOMContentLoaded',boot);
