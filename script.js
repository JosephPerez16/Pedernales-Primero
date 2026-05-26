const DB = {
  users: 'pedernales_primero_users_v1',
  voters: 'pedernales_primero_records_v1',
  session: 'pedernales_primero_session_v1',
  theme: 'pedernales_primero_theme_v1'
};
const ROLES = ['Administrador', 'Coordinador General', 'Coordinador de Zona'];
const MUNICIPIOS = ['Pedernales', 'Oviedo'];
const PROVINCE = 'Pedernales';
let currentUser = null;
let chartHoverIndex = -1;
let chartAreas = [];
window.getSession = () => currentUser;
const $ = id => document.getElementById(id);
const read = key => JSON.parse(localStorage.getItem(key) || '[]');
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const clean = v => String(v || '').trim();
const digits = v => String(v || '').replace(/\D/g, '');
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
function escapeHtml(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function formatCedula(v){const d=digits(v).slice(0,11); if(d.length<=3)return d; if(d.length<=10)return `${d.slice(0,3)}-${d.slice(3)}`; return `${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10)}`}
function formatPhone(v){const d=digits(v).slice(0,10); if(d.length<=3)return d; if(d.length<=6)return `${d.slice(0,3)}-${d.slice(3)}`; return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`}
function msg(el, text, type='success'){ if(!el)return; el.textContent=text; el.className=`status-message ${type}`; setTimeout(()=>{el.textContent=''; el.className='status-message'},3600)}
function fillSelect(el, values, label){ if(!el)return; const old=el.value; el.innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join(''); if(values.includes(old))el.value=old; }
function isAdmin(){return currentUser?.role==='Administrador'}
function isGeneral(){return currentUser?.role==='Coordinador General'}
function isZone(){return currentUser?.role==='Coordinador de Zona'}
function canManageUsers(){return isAdmin()}
function same(a,b){return clean(a).toLowerCase()===clean(b).toLowerCase()}
function visibleVoters(){const all=read(DB.voters); if(!currentUser)return[]; if(isAdmin()||isGeneral())return all; return all.filter(v=>v.registered_by_id===currentUser.id || (currentUser.zone && same(v.zone,currentUser.zone)));}
function canEditVoter(v){return isAdmin()||isGeneral()||v.registered_by_id===currentUser?.id||(isZone()&&currentUser?.zone&&same(v.zone,currentUser.zone));}
function visibleUsers(){const users=read(DB.users); if(isAdmin())return users; if(isGeneral())return users.filter(u=>u.role!=='Administrador'); return users.filter(u=>u.id===currentUser?.id);}
function setPanel(panel){document.querySelectorAll('.content-panel').forEach(p=>p.classList.add('section-hidden')); const map={overview:'panelOverview',registro:'panelRegistro',consulta:'panelConsulta',usuarios:'usersSection'}; const target=$(map[panel]||'panelOverview'); if(target)target.classList.remove('section-hidden'); document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.panel===panel)); closeSidebar(); renderAll();}
function openSidebar(){ $('appSidebar')?.classList.add('open'); $('sidebarOverlay')?.classList.add('show'); $('sidebarToggleBtn')?.setAttribute('aria-expanded','true'); $('sidebarToggleBtn')?.classList.add('active'); }
function closeSidebar(){ $('appSidebar')?.classList.remove('open'); $('sidebarOverlay')?.classList.remove('show'); $('sidebarToggleBtn')?.setAttribute('aria-expanded','false'); $('sidebarToggleBtn')?.classList.remove('active'); }
function initSelects(){fillSelect($('registerRole'),ROLES,'Seleccione'); fillSelect($('editUserRole'),ROLES,'Seleccione'); fillSelect($('registerMunicipio'),MUNICIPIOS,'Seleccione'); fillSelect($('editUserMunicipio'),MUNICIPIOS,'Seleccione'); fillSelect($('voterMunicipio'),MUNICIPIOS,'Seleccione'); fillSelect($('filterMunicipio'),MUNICIPIOS,'Todos'); fillSelect($('filterRole'),ROLES,'Todos'); firstAdminMode();}
function firstAdminMode(){const first=read(DB.users).length===0; if($('registerRole')){$('registerRole').disabled=first; if(first)$('registerRole').value='Administrador'} if($('firstUserHint'))$('firstUserHint').textContent=first?'Cree el primer administrador para iniciar el sistema.':'Los usuarios nuevos deben ser aprobados por el administrador.';}
function showAuthTab(type){$('loginForm')?.classList.toggle('active',type==='login'); $('registerForm')?.classList.toggle('active',type==='register'); $('showLogin')?.classList.toggle('active',type==='login'); $('showRegister')?.classList.toggle('active',type==='register'); firstAdminMode();}
async function hashPassword(p){return btoa(unescape(encodeURIComponent(p)))}
async function verifyPassword(p,h){return await hashPassword(p)===h}
function loginUser(user){currentUser=user; localStorage.setItem(DB.session,user.id); $('authSection')?.classList.add('hidden'); $('dashboardSection')?.classList.remove('hidden'); $('manageUsersBtn')?.classList.toggle('section-hidden',!canManageUsers()); const initials=(user.name||'U').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(); if($('sidebarAvatar'))$('sidebarAvatar').textContent=initials; if($('sidebarUserName'))$('sidebarUserName').textContent=user.name; if($('sidebarUserRole'))$('sidebarUserRole').textContent=user.role; if($('currentUserInfo'))$('currentUserInfo').textContent=`${user.name} · ${user.role}`; resetVoterForm(); setPanel('overview');}
function logout(){currentUser=null; localStorage.removeItem(DB.session); $('dashboardSection')?.classList.add('hidden'); $('authSection')?.classList.remove('hidden'); showAuthTab('login');}
function filteredVoters(){const q=clean($('searchInput')?.value).toLowerCase(); const m=$('filterMunicipio')?.value||''; const z=$('filterSector')?.value||''; const rec=$('filterMesa')?.value||''; const role=$('filterRole')?.value||''; const reg=$('filterRegistrar')?.value||''; return visibleVoters().filter(v=>{const hay=[v.name,v.cedula,v.phone,v.age,v.address,v.municipio,v.zone,v.recinto,v.colegio,v.observation,v.registered_by_name,v.registered_by_role].join(' ').toLowerCase(); return (!q||hay.includes(q))&&(!m||v.municipio===m)&&(!z||v.zone===z)&&(!rec||v.recinto===rec)&&(!role||v.registered_by_role===role)&&(!reg||v.registered_by_name===reg);});}
function updateDynamicFilters(){const data=visibleVoters(); fillSelect($('filterSector'), [...new Set(data.map(v=>v.zone).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')), 'Todas'); fillSelect($('filterMesa'), [...new Set(data.map(v=>v.recinto).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')), 'Todos'); fillSelect($('filterRegistrar'), [...new Set(data.map(v=>v.registered_by_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')), 'Todos');}
function renderStats(){const data=visibleVoters(); const today=new Date().toDateString(); const active=municipioCounts().filter(([,c])=>c>0).length; $('totalVoters') && ($('totalVoters').textContent=data.length); $('totalUsers') && ($('totalUsers').textContent=visibleUsers().length); $('todayVoters') && ($('todayVoters').textContent=data.filter(v=>new Date(v.created_at).toDateString()===today).length); $('activeProvinces') && ($('activeProvinces').textContent=active); $('chartSummaryBadge') && ($('chartSummaryBadge').textContent=`${active} municipios activos`);}
function municipioCounts(){const counts={Pedernales:0, Oviedo:0}; visibleVoters().forEach(v=>{const k=MUNICIPIOS.includes(v.municipio)?v.municipio:'Pedernales'; counts[k]=(counts[k]||0)+1}); return MUNICIPIOS.map(m=>[m,counts[m]||0]).sort((a,b)=>b[1]-a[1]||MUNICIPIOS.indexOf(a[0])-MUNICIPIOS.indexOf(b[0]));}
function zoneCounts(){return municipioCounts();}
function municipioColor(label, hovered=false){
  if(label==='Oviedo')return hovered?['#ff6b6b','#c1121f','rgba(193,18,31,.32)']:['#ef4444','#991b1b','rgba(193,18,31,.22)'];
  return hovered?['#4fd2ff','#003d8f','rgba(47,159,211,.35)']:['#2f9fd3','#001f54','rgba(0,31,84,.14)'];
}
function renderChart(){
  const canvas=$('provinceChart');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const dpr=window.devicePixelRatio||1;
  const rect=canvas.getBoundingClientRect();
  const isMobile=window.innerWidth<=720;
  const h=isMobile?300:315;
  const w=Math.max(rect.width,300);
  canvas.width=w*dpr;
  canvas.height=h*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  chartAreas=[];
  const data=municipioCounts();
  const max=Math.max(...data.map(x=>x[1]),1);
  const dark=document.documentElement.dataset.theme==='dark';
  const chartW=Math.min(w-(isMobile?46:86),isMobile?390:520);
  const chartH=isMobile?158:176;
  const chartX=(w-chartW)/2;
  const chartY=isMobile?54:58;
  ctx.strokeStyle=dark?'rgba(255,255,255,.09)':'rgba(8,42,90,.085)';
  ctx.lineWidth=1;
  ctx.setLineDash([]);
  for(let i=0;i<=4;i++){
    const y=chartY+chartH-(i/4)*chartH;
    ctx.beginPath();
    ctx.moveTo(chartX,y);
    ctx.lineTo(chartX+chartW,y);
    ctx.stroke();
    const val=Math.round((max*i)/4);
    ctx.fillStyle=dark?'rgba(217,239,255,.62)':'rgba(100,116,139,.76)';
    ctx.font='800 11px Inter, sans-serif';
    ctx.fillText(String(val),chartX-24,y+4);
  }
  const barW=Math.min(isMobile?80:92,Math.max(isMobile?58:70,chartW*.22));
  const gap=Math.min(isMobile?72:110,Math.max(isMobile?44:70,chartW*.17));
  const totalW=(barW*data.length)+(gap*(data.length-1));
  const x0=chartX+(chartW-totalW)/2;
  data.forEach(([label,val],i)=>{
    const hovered=i===chartHoverIndex;
    const x=x0+i*(barW+gap);
    const barH=val>0?Math.max((val/max)*chartH,24):12;
    const y=chartY+chartH-barH;
    const colors=municipioColor(label,hovered);
    ctx.save();
    ctx.shadowColor=colors[2];
    ctx.shadowBlur=hovered?24:13;
    ctx.shadowOffsetY=hovered?11:7;
    const grad=ctx.createLinearGradient(0,y,0,y+barH);
    grad.addColorStop(0,colors[0]);
    grad.addColorStop(1,colors[1]);
    ctx.fillStyle=grad;
    roundRect(ctx,x,y,barW,barH,18);
    ctx.fill();
    ctx.restore();
    if(hovered){
      ctx.strokeStyle='rgba(255,255,255,.82)';
      ctx.lineWidth=2;
      roundRect(ctx,x+2,y+2,barW-4,barH-4,15);
      ctx.stroke();
    }
    ctx.fillStyle=dark?'#f8fbff':'#0f172a';
    ctx.font='900 26px Inter, sans-serif';
    const valText=String(val);
    ctx.fillText(valText,x+(barW-ctx.measureText(valText).width)/2,y-12);
    ctx.fillStyle=label==='Oviedo'?'#ef4444':'#003d8f';
    ctx.font='900 14px Inter, sans-serif';
    ctx.fillText(label,x+(barW-ctx.measureText(label).width)/2,chartY+chartH+36);
    ctx.fillStyle=dark?'rgba(217,239,255,.74)':'rgba(100,116,139,.86)';
    ctx.font='800 11px Inter, sans-serif';
    const sub=val===1?'registro':'registros';
    ctx.fillText(sub,x+(barW-ctx.measureText(sub).width)/2,chartY+chartH+54);
    chartAreas.push({x,y,w:barW,h:barH,label,val});
  });
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function chartPoint(e){const c=$('provinceChart'); const r=c.getBoundingClientRect(); return {x:e.clientX-r.left,y:e.clientY-r.top};}
function chartIndexAt(e){const p=chartPoint(e); return chartAreas.findIndex(a=>p.x>=a.x&&p.x<=a.x+a.w&&p.y>=a.y&&p.y<=a.y+a.h);}
function bindChartEvents(){const c=$('provinceChart'); if(!c)return; c.addEventListener('mousemove',e=>{const i=chartIndexAt(e); if(i!==chartHoverIndex){chartHoverIndex=i; renderChart();} c.style.cursor=i>-1?'pointer':'default'; if(i>-1)c.title=`${chartAreas[i].label}: ${chartAreas[i].val} registros`;}); c.addEventListener('mouseleave',()=>{chartHoverIndex=-1; c.style.cursor='default'; c.title=''; renderChart();}); c.addEventListener('click',e=>{const i=chartIndexAt(e); if(i<0)return; if($('filterMunicipio'))$('filterMunicipio').value=chartAreas[i].label; setPanel('consulta'); renderAll();});}
function renderRanking(){const box=$('provinceRanking'); if(!box)return; const data=municipioCounts(); box.innerHTML=data.map(([m,c],i)=>`<div class="ranking-item municipio-rank"><span class="rank-index">${i+1}</span><div><strong>${escapeHtml(m)}</strong><small>${c===1?'1 registro':`${c} registros`}</small></div><b>${c}</b></div>`).join('');}
function renderSearchCards(){
  const box=$('searchResults');
  if(!box)return;
  const data=filteredVoters().slice(0,12);
  box.innerHTML=data.length?data.map(v=>{
    const municipio=escapeHtml(v.municipio||'Sin municipio');
    const tone=(v.municipio==='Oviedo')?'oviedo':'pedernales';
    return `<article class="registro-card ${tone}">
      <div class="registro-card-head">
        <div class="registro-title-box">
          <h3>${escapeHtml(v.name)}</h3>
          <b class="registro-municipio">${municipio}</b>
          <div class="registro-meta">
            <span><strong>Cédula:</strong> ${escapeHtml(v.cedula||'No especificada')}</span>
            <span><strong>Teléfono:</strong> ${escapeHtml(v.phone||'No especificado')}</span>
            ${v.age?`<span><strong>Edad:</strong> ${escapeHtml(v.age)} años</span>`:''}
          </div>
        </div>
      </div>
      <div class="registro-info-list">
        <p><strong>Dirección:</strong> ${escapeHtml(v.address||'No especificada')}</p>
        <p><strong>Zona:</strong> ${escapeHtml(v.zone||'No especificada')}</p>
        <p><strong>Recinto:</strong> ${escapeHtml(v.recinto||'No especificado')}</p>
        <p><strong>Colegio:</strong> ${escapeHtml(v.colegio||'No especificado')}</p>
        <p><strong>Observación:</strong> ${escapeHtml(v.observation||'Normal')}</p>
        <p><strong>Registrado por:</strong> ${escapeHtml(v.registered_by_name||'No especificado')}</p>
        <p><strong>Rol:</strong> ${escapeHtml(v.registered_by_role||'No especificado')}</p>
        <p><strong>Última fecha:</strong> ${new Date(v.created_at).toLocaleString('es-DO')}</p>
      </div>
      ${canEditVoter(v)?`<div class="registro-actions"><button class="mini-btn" data-edit-voter="${v.id}">Editar</button><button class="mini-btn danger-mini" data-delete-voter="${v.id}">Eliminar</button></div>`:''}
    </article>`;
  }).join(''):'<div class="empty-state">Sin resultados.</div>';
}
function renderVotersTable(){const tbody=$('votersTableBody'); if(!tbody)return; const data=filteredVoters().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)); $('filteredCountBadge') && ($('filteredCountBadge').textContent=`${data.length} resultados`); tbody.innerHTML=data.length?data.map(v=>`<tr><td>${escapeHtml(v.name)}</td><td>${escapeHtml(v.cedula)}</td><td>${escapeHtml(v.phone)}</td><td>${escapeHtml(v.age)}</td><td>${escapeHtml(v.address)}</td><td>${escapeHtml(v.municipio)}</td><td>${escapeHtml(v.zone)}</td><td>${escapeHtml(v.recinto)}</td><td>${escapeHtml(v.colegio)}</td><td>${escapeHtml(v.observation||'')}</td><td>${escapeHtml(v.registered_by_name)}</td><td><span class="badge">${escapeHtml(v.registered_by_role)}</span></td><td>${new Date(v.created_at).toLocaleString('es-DO')}</td><td>${canEditVoter(v)?`<div class="row-actions"><button class="mini-btn" data-edit-voter="${v.id}">Editar</button><button class="mini-btn danger-mini" data-delete-voter="${v.id}">Eliminar</button></div>`:''}</td></tr>`).join(''):`<tr><td colspan="14" class="empty-cell">No hay registros disponibles.</td></tr>`;}
function renderUsersTable(){const tbody=$('usersTableBody'); if(!tbody)return; const users=visibleUsers(); tbody.innerHTML=users.length?users.map(u=>`<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.email)}</td><td><span class="badge">${escapeHtml(u.role)}</span></td><td>${escapeHtml(u.phone)}</td><td>${escapeHtml(u.municipio||'')}</td><td>${escapeHtml(u.zone||'')}</td><td>${escapeHtml(u.status)}</td><td>${isAdmin()?`<div class="row-actions">${u.status!=='Aprobado'?`<button class="mini-btn" data-approve-user="${u.id}">Aprobar</button>`:''}<button class="mini-btn" data-edit-user="${u.id}">Editar</button>${u.id!==currentUser?.id?`<button class="mini-btn danger-mini" data-delete-user="${u.id}">Eliminar</button>`:''}</div>`:''}</td></tr>`).join(''):`<tr><td colspan="9" class="empty-cell">No hay usuarios disponibles.</td></tr>`;}
function renderAll(){updateDynamicFilters(); renderStats(); renderChart(); renderRanking(); renderSearchCards(); renderVotersTable(); renderUsersTable();}
function resetVoterForm(){if(!$('voterForm'))return; $('voterForm').reset(); $('editingVoterId').value=''; $('voterFormTitle').textContent='Registrar votante / simpatizante'; $('saveVoterBtn').lastChild.textContent=' Guardar registro'; $('cancelEditVoterBtn')?.classList.add('hidden'); if(isZone()&&currentUser.zone){$('voterZone').value=currentUser.zone; $('voterZone').readOnly=true;} else if($('voterZone')) {$('voterZone').readOnly=false;} }
function editVoter(id){const v=read(DB.voters).find(x=>x.id===id); if(!v||!canEditVoter(v))return; $('editingVoterId').value=v.id; $('voterName').value=v.name; $('voterCedula').value=v.cedula; $('voterPhone').value=v.phone; $('voterAge').value=v.age; $('voterAddress').value=v.address; $('voterMunicipio').value=v.municipio; $('voterZone').value=v.zone; $('voterRecinto').value=v.recinto; $('voterColegio').value=v.colegio; $('voterObservation').value=v.observation||''; $('voterFormTitle').textContent='Editar registro'; $('saveVoterBtn').lastChild.textContent=' Actualizar registro'; $('cancelEditVoterBtn')?.classList.remove('hidden'); setPanel('registro'); window.scrollTo({top:0,behavior:'smooth'});}
function deleteVoter(id){const voters=read(DB.voters); const v=voters.find(x=>x.id===id); if(!v||!canEditVoter(v))return; if(!confirm('¿Deseas eliminar este registro?'))return; write(DB.voters,voters.filter(x=>x.id!==id)); renderAll();}
function openUserModal(id){const u=read(DB.users).find(x=>x.id===id); if(!u||!isAdmin())return; $('editUserId').value=u.id; $('editUserName').value=u.name; $('editUserUsername').value=u.username; $('editUserEmail').value=u.email; $('editUserPhone').value=u.phone; $('editUserRole').value=u.role; $('editUserMunicipio').value=u.municipio||''; $('editUserZone').value=u.zone||''; $('userEditModal').classList.remove('hidden');}
function closeUserModal(){ $('userEditModal')?.classList.add('hidden'); }
function exportExcel(){
  const rows=filteredVoters().sort((a,b)=>(a.registered_by_role||'').localeCompare(b.registered_by_role||'','es')||(a.registered_by_name||'').localeCompare(b.registered_by_name||'','es')||(a.name||'').localeCompare(b.name||'','es'));
  if(!rows.length)return alert('No hay registros para exportar.');
  const users=visibleUsers().sort((a,b)=>(a.role||'').localeCompare(b.role||'','es')||(a.name||'').localeCompare(b.name||'','es'));
  const now=new Date();
  const today=now.toLocaleString('es-DO');
  const fileDate=now.toISOString().slice(0,10);
  const wb=XLSX.utils.book_new();
  const blue='001F54', blue2='003D8F', sky='2F9FD3', red='D62828', green='0F766E', gold='D97706', light='EAF4FF', soft='F8FBFF', soft2='EEF6FF', roleFill='D9E8FF', regFill='EFF6FF', border='C9D8EA', white='FFFFFF', text='0F172A', muted='64748B';
  const sanitize=n=>String(n||'General').replace(/[\\/?*\[\]:]/g,' ').slice(0,31).trim()||'General';
  const formatDate=v=>v?new Date(v).toLocaleString('es-DO'):'';
  const countBy=(data,key)=>data.reduce((acc,x)=>{const k=clean(typeof key==='function'?key(x):x[key])||'Sin especificar'; acc[k]=(acc[k]||0)+1; return acc;},{});
  const headers=['Nombre','Cédula','Teléfono','Edad','Provincia','Municipio','Zona','Dirección','Recinto','Colegio','Observación','Registrado por','Rol','Fecha'];
  const widths=[34,16,16,8,16,16,22,34,34,16,24,30,24,24];
  const titleStyle={font:{bold:true,sz:18,color:{rgb:white}},fill:{fgColor:{rgb:blue}},alignment:{horizontal:'left',vertical:'center'},border:{top:{style:'thin',color:{rgb:blue}},bottom:{style:'thin',color:{rgb:blue}},left:{style:'thin',color:{rgb:blue}},right:{style:'thin',color:{rgb:blue}}}};
  const subtitleStyle={font:{bold:true,sz:11,color:{rgb:blue}},fill:{fgColor:{rgb:light}},alignment:{horizontal:'left',vertical:'center'},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const headerStyle={font:{bold:true,color:{rgb:white}},fill:{fgColor:{rgb:blue2}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const roleStyle={font:{bold:true,sz:13,color:{rgb:blue}},fill:{fgColor:{rgb:roleFill}},alignment:{horizontal:'left',vertical:'center'},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const registrarStyle={font:{bold:true,sz:11,color:{rgb:text}},fill:{fgColor:{rgb:regFill}},alignment:{horizontal:'left',vertical:'center'},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const cellStyle={font:{color:{rgb:text}},alignment:{vertical:'center',wrapText:true},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const altStyle={...cellStyle,fill:{fgColor:{rgb:soft}}};
  const totalStyle={font:{bold:true,color:{rgb:white}},fill:{fgColor:{rgb:green}},alignment:{horizontal:'center',vertical:'center'},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const summaryStyle={font:{bold:true,color:{rgb:blue}},fill:{fgColor:{rgb:soft2}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}};
  const makeVoterRow=v=>[v.name||'',v.cedula||'',v.phone||'',v.age||'',v.province||PROVINCE,v.municipio||'',v.zone||'',v.address||'',v.recinto||'',v.colegio||'',v.observation||'Normal',v.registered_by_name||'',v.registered_by_role||'',formatDate(v.created_at)];
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
    aoa.push(['Total general',rows.length,'Pedernales',rows.filter(v=>v.municipio==='Pedernales').length,'Oviedo',rows.filter(v=>v.municipio==='Oviedo').length,'Usuarios visibles',users.length]);
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
        aoa.push([`REGISTRADOR: ${reg} | ROL: ${sample.registered_by_role||'Sin rol'} | MUNICIPIO: ${sample.municipio||'No especificado'} | ZONA: ${sample.zone||'No especificada'} | TOTAL: ${byReg.length}`]);
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
    const municipioCounts=countBy(rows,'municipio');
    const roleCounts=countBy(rows,'registered_by_role');
    const registrarCounts=countBy(rows,'registered_by_name');
    const maxReg=Math.max(...Object.values(registrarCounts),1);
    const bar=(value,color)=>({v:`${'█'.repeat(Math.max(1,Math.round((value/Math.max(maxReg,1))*24)))} ${value}`,s:{font:{bold:true,color:{rgb:color}},alignment:{vertical:'center'},border:{top:{style:'thin',color:{rgb:border}},bottom:{style:'thin',color:{rgb:border}},left:{style:'thin',color:{rgb:border}},right:{style:'thin',color:{rgb:border}}}}});
    const aoa=[['PEDERNALES PRIMERO'],[`Dashboard ejecutivo · Generado: ${today}`],[],['Indicador','Valor','Detalle'],['Total de registros',rows.length,'Registros visibles exportados'],['Pedernales',municipioCounts.Pedernales||0,'Municipio Pedernales'],['Oviedo',municipioCounts.Oviedo||0,'Municipio Oviedo'],['Usuarios visibles',users.length,'Usuarios según permisos'],[],['Registros por rol','Total','Detalle'],...Object.entries(roleCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,v,`${v} registros`]),[],['Ranking de registradores','Total','Gráfico'],...Object.entries(registrarCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,v,bar(v,k.toLowerCase().includes('oviedo')?red:blue2)])];
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
    const userHeaders=['Nombre','Usuario','Correo','Teléfono','Rol','Municipio','Zona','Estado','Fecha'];
    const aoa=[['USUARIOS DEL SISTEMA'],[`Generado: ${today}`],['Total',users.length],[],userHeaders,...users.map(u=>[u.name||'',u.username||'',u.email||'',u.phone||'',u.role||'',u.municipio||'',u.zone||'',u.status||'',formatDate(u.created_at)])];
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:userHeaders.length-1}},{s:{r:1,c:0},e:{r:1,c:userHeaders.length-1}},{s:{r:2,c:0},e:{r:2,c:userHeaders.length-1}}];
    ws['!cols']=[30,18,32,16,24,18,22,14,24].map(w=>({wch:w}));
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
  MUNICIPIOS.forEach(m=>{const data=rows.filter(v=>v.municipio===m); if(data.length)addSimpleSheet(m,data,`Registros del municipio ${m} · Total: ${data.length}`);});
  [...new Set(rows.map(v=>v.registered_by_role||'Sin rol'))].sort((a,b)=>a.localeCompare(b,'es')).forEach(role=>{const data=rows.filter(v=>(v.registered_by_role||'Sin rol')===role); if(data.length)addSimpleSheet(`Rol ${role}`,data,`Registros por rol: ${role} · Total: ${data.length}`);});
  addUsers();
  wb.Workbook={Views:[{RTL:false}]};
  XLSX.writeFile(wb,`Pedernales_Primero_Reporte_${fileDate}.xlsx`,{cellStyles:true,bookType:'xlsx'});
}
function bindEvents(){ $('showLogin')?.addEventListener('click',()=>showAuthTab('login')); $('showRegister')?.addEventListener('click',()=>showAuthTab('register')); $('logoutBtn')?.addEventListener('click',logout); $('sidebarToggleBtn')?.addEventListener('click',()=>{$('appSidebar')?.classList.contains('open')?closeSidebar():openSidebar();}); $('sidebarOverlay')?.addEventListener('click',closeSidebar); bindChartEvents(); document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>setPanel(b.dataset.panel))); document.querySelectorAll('.nav-group-header').forEach(h=>h.addEventListener('click',()=>{h.classList.toggle('open'); const g=$(h.dataset.target); if(g)g.classList.toggle('collapsed')})); $('themeToggleBtn')?.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark'; document.documentElement.dataset.theme=next; localStorage.setItem(DB.theme,next);}); ['voterCedula'].forEach(id=>$(id)?.addEventListener('input',e=>e.target.value=formatCedula(e.target.value))); ['voterPhone','registerPhone','editUserPhone'].forEach(id=>$(id)?.addEventListener('input',e=>e.target.value=formatPhone(e.target.value))); $('topbarSearchInput')?.addEventListener('input',e=>{if($('searchInput'))$('searchInput').value=e.target.value; setPanel('consulta'); renderAll();}); ['searchInput','filterMunicipio','filterSector','filterMesa','filterRole','filterRegistrar'].forEach(id=>$(id)?.addEventListener('input',renderAll)); $('clearFiltersBtn')?.addEventListener('click',()=>{['searchInput','topbarSearchInput','filterMunicipio','filterSector','filterMesa','filterRole','filterRegistrar'].forEach(id=>{if($(id))$(id).value=''}); renderAll();}); $('exportBtn')?.addEventListener('click',exportExcel); $('cancelEditVoterBtn')?.addEventListener('click',resetVoterForm); $('forgotPasswordBtn')?.addEventListener('click',()=>msg($('authMessage'),'En esta versión localStorage no está activa la recuperación por correo.','info'));
$('loginForm')?.addEventListener('submit',async e=>{e.preventDefault(); const id=clean($('loginUser').value).toLowerCase(); const pass=$('loginPassword').value; const user=read(DB.users).find(u=>u.username.toLowerCase()===id||u.email.toLowerCase()===id); if(!user)return msg($('authMessage'),'Usuario no encontrado.','error'); if(user.status!=='Aprobado')return msg($('authMessage'),'Este usuario aún no ha sido aprobado.','error'); if(!await verifyPassword(pass,user.password_hash))return msg($('authMessage'),'Contraseña incorrecta.','error'); loginUser(user);});
$('registerForm')?.addEventListener('submit',async e=>{e.preventDefault(); const users=read(DB.users); const first=users.length===0; const pass=$('registerPassword').value; const pass2=$('registerPasswordConfirm').value; if(pass!==pass2)return msg($('authMessage'),'Las contraseñas no coinciden.','error'); const username=clean($('registerUsername').value); const email=clean($('registerEmail').value); if(users.some(u=>u.username.toLowerCase()===username.toLowerCase()||u.email.toLowerCase()===email.toLowerCase()))return msg($('authMessage'),'Ya existe un usuario con ese usuario o correo.','error'); const user={id:uid(),name:clean($('registerName').value),username,email,phone:clean($('registerPhone').value),role:first?'Administrador':$('registerRole').value,province:PROVINCE,municipio:clean($('registerMunicipio').value),zone:clean($('registerZone').value),status:first?'Aprobado':'Pendiente',password_hash:await hashPassword(pass),created_at:new Date().toISOString()}; users.push(user); write(DB.users,users); $('registerForm').reset(); initSelects(); msg($('authMessage'),first?'Administrador creado. Ya puedes iniciar sesión.':'Usuario creado. Debe ser aprobado por el administrador.','success'); showAuthTab('login');});
$('voterForm')?.addEventListener('submit',e=>{e.preventDefault(); const voters=read(DB.voters); const id=$('editingVoterId').value; const ced=clean($('voterCedula').value); const dup=voters.find(v=>v.cedula===ced&&v.id!==id); if(dup)return msg($('voterMessage'),`Esta cédula ya está registrada por ${dup.registered_by_name}.`,'error'); const item={name:clean($('voterName').value),cedula:ced,phone:clean($('voterPhone').value),age:clean($('voterAge').value),address:clean($('voterAddress').value),province:PROVINCE,municipio:clean($('voterMunicipio').value),zone:clean($('voterZone').value),recinto:clean($('voterRecinto').value),colegio:clean($('voterColegio').value),observation:clean($('voterObservation').value)}; if(id){const i=voters.findIndex(v=>v.id===id); if(i>-1&&canEditVoter(voters[i]))voters[i]={...voters[i],...item,updated_at:new Date().toISOString()};} else voters.push({id:uid(),...item,registered_by_id:currentUser.id,registered_by_name:currentUser.name,registered_by_role:currentUser.role,created_at:new Date().toISOString()}); write(DB.voters,voters); resetVoterForm(); renderAll(); msg($('voterMessage'),id?'Registro actualizado correctamente.':'Registro guardado correctamente.','success');});
$('userEditForm')?.addEventListener('submit',e=>{e.preventDefault(); if(!isAdmin())return; const id=$('editUserId').value; const users=read(DB.users).map(u=>u.id===id?{...u,name:clean($('editUserName').value),username:clean($('editUserUsername').value),email:clean($('editUserEmail').value),phone:clean($('editUserPhone').value),role:$('editUserRole').value,province:PROVINCE,municipio:clean($('editUserMunicipio').value),zone:clean($('editUserZone').value)}:u); write(DB.users,users); closeUserModal(); renderAll();}); $('closeUserEditModalBtn')?.addEventListener('click',closeUserModal); $('cancelUserEditBtn')?.addEventListener('click',closeUserModal);
document.body.addEventListener('click',e=>{const t=e.target; if(t.dataset.editVoter)editVoter(t.dataset.editVoter); if(t.dataset.deleteVoter)deleteVoter(t.dataset.deleteVoter); if(t.dataset.approveUser&&isAdmin()){write(DB.users,read(DB.users).map(u=>u.id===t.dataset.approveUser?{...u,status:'Aprobado'}:u)); renderAll();} if(t.dataset.editUser)openUserModal(t.dataset.editUser); if(t.dataset.deleteUser&&isAdmin()){if(confirm('¿Deseas eliminar este usuario?')){write(DB.users,read(DB.users).filter(u=>u.id!==t.dataset.deleteUser)); renderAll();}}});}
function boot(){document.documentElement.dataset.theme=localStorage.getItem(DB.theme)||document.documentElement.dataset.theme||'light'; initSelects(); bindEvents(); const sid=localStorage.getItem(DB.session); const user=read(DB.users).find(u=>u.id===sid&&u.status==='Aprobado'); if(user)loginUser(user); else {$('dashboardSection')?.classList.add('hidden'); $('authSection')?.classList.remove('hidden'); showAuthTab('login');} if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{}); window.addEventListener('resize',renderChart);}
document.addEventListener('DOMContentLoaded',boot);
