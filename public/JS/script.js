'use strict';

/* ══════════════════════════════════════════════
   CONFIGURACIÓN  ─  cambia BASE_URL si despliegas
══════════════════════════════════════════════ */
const BASE_URL = 'https://taskflow-production-ee98.up.railway.app';   // vacío = mismo origen (Express sirve el HTML)

const getAuthHeaders = () => {
  const token = localStorage.getItem('tf_access_token');
  const headers = { 'Content-Type': 'application/json' };
  if(token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
};

// Renovar token automáticamente si expira
async function refreshTokenIfNeeded() {
  const refreshToken = localStorage.getItem('tf_refresh_token');
  if (!refreshToken) return false;
  try {
    const response = await fetch(BASE_URL + '/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    }).then(r => r.json());

    if (response.access_token) {
      localStorage.setItem('tf_access_token', response.access_token);
      return true;
    }
  } catch (ex) {
    console.warn('No se pudo renovar token:', ex);
  }
  return false;
}

// Wrapper para manejar reintentos con token renovado
async function fetchWithAuth(url, options) {
  const headers = { ...getAuthHeaders(), ...(options.headers || {}) };
  let response = await fetch(BASE_URL + url, { ...options, headers });

  // Si es 401, intentar renovar token y reintentar UNA SOLA VEZ
  if (response.status === 401) {
    const renewed = await refreshTokenIfNeeded();
    if (renewed) {
      const newHeaders = { ...getAuthHeaders(), ...(options.headers || {}) };
      response = await fetch(BASE_URL + url, { ...options, headers: newHeaders });
    } else {
      // Token no se pudo renovar, requiere login
      showAuth('login');
      toast('⚠️ Tu sesión expiró. Inicia sesión de nuevo.', 'w');
      return { error: 'Session expired' };
    }
  }
  return response.json();
}

const API = {
  get:    (url)      => fetchWithAuth(url, {method:'GET'}),
  post:   (url,body) => fetchWithAuth(url, {method:'POST',  body:JSON.stringify(body)}),
  put:    (url,body) => fetchWithAuth(url, {method:'PUT',   body:JSON.stringify(body)}),
  patch:  (url,body) => fetchWithAuth(url, {method:'PATCH', body:JSON.stringify(body)}),
  delete: (url)      => fetchWithAuth(url, {method:'DELETE'}),
};

/* ══════════════════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════════════════ */
const ST = {
  mini:false, page:'dashboard',
  dragId:null,
  // Cronómetro
  tRun:false, tPaused:false, tSec:0, tInt:null, tSes:0,
  tLogId:null,   // ID del time_log activo en BD
  tProj:null, tTask:null,
  // Datos cacheados de BD
  user: JSON.parse(localStorage.getItem('tf_user')||'null'),
  profiles: [],
  tasks: [],
  projs: [],
  logs: [],
  currentTaskId: null,  // para modal detalle
};

/* ══════════════════════════════════════════════
   HELPERS UI
══════════════════════════════════════════════ */
const PRIO_TAG  = {Alta:'t-ros',Media:'t-amb',Baja:'t-grn',alta:'t-ros',media:'t-amb',baja:'t-grn'};
const PRIO_LABEL= {Alta:'Alta',Media:'Media',Baja:'Baja',alta:'Alta',media:'Media',baja:'Baja'};
const COL_NAME  = {todo:'Por hacer',progress:'En progreso',review:'En revisión',done:'Completado'};

function avColor(initials='??'){
  const colors=['av-blue','av-amb','av-vio','av-grn','av-ros','av-teal'];
  const idx=(initials.charCodeAt(0)||0)%colors.length;
  return colors[idx];
}

function toast(msg,type='i'){
  const w=document.getElementById('toast-wrap');
  const t=document.createElement('div');
  t.className='toast t'+type; t.textContent=msg;
  w.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(20px)';t.style.transition='.3s';setTimeout(()=>t.remove(),300)},3200);
}

function openM(id){document.getElementById(id).classList.add('open')}
function closeM(id){document.getElementById(id).classList.remove('open')}
document.querySelectorAll('.modal-over').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open')}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-over.open').forEach(o=>o.classList.remove('open'))});

/* ══════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════ */
function showAuth(screen){
  const ov=document.getElementById('auth-overlay');
  ov.style.display='block'; ov.style.opacity='1';
  document.querySelectorAll('.auth-screen').forEach(s=>{s.classList.remove('show');s.style.display='none'});
  const el=document.getElementById('auth-'+screen);
  if(!el)return;
  el.style.display='flex';
  if(screen==='recover'){el.style.alignItems='center';el.style.justifyContent='center';el.style.background='var(--bg)'}
  el.classList.add('show');
}

function hideAuth(){
  const ov=document.getElementById('auth-overlay');
  ov.style.transition='opacity .4s'; ov.style.opacity='0';
  setTimeout(()=>{ov.style.display='none'},400);
}

function togglePass(id,btn){
  const inp=document.getElementById(id);
  inp.type=inp.type==='password'?'text':'password';
  btn.textContent=inp.type==='password'?'👁':'🙈';
}



//Cristina: CONTROL DE INTENTOS FALLIDOS, VALIDACIONES, LOGIN, REGISTRO

// ── CONTROL DE INTENTOS FALLIDOS ────────────────────────────
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_BLOCK_MINUTES = 15;
 
function getLoginAttempts() {
  try { return JSON.parse(localStorage.getItem('tf_login_attempts') || '{"count":0,"blockedUntil":null}'); }
  catch { return { count: 0, blockedUntil: null }; }
}
function setLoginAttempts(data) {
  localStorage.setItem('tf_login_attempts', JSON.stringify(data));
}
function resetLoginAttempts() {
  localStorage.removeItem('tf_login_attempts');
}
function isLoginBlocked() {
  const data = getLoginAttempts();
  if (!data.blockedUntil) return false;
  if (new Date() < new Date(data.blockedUntil)) return true;
  resetLoginAttempts();
  return false;
}
function registerFailedAttempt() {
  const data = getLoginAttempts();
  data.count += 1;
  if (data.count >= LOGIN_MAX_ATTEMPTS) {
    const until = new Date();
    until.setMinutes(until.getMinutes() + LOGIN_BLOCK_MINUTES);
    data.blockedUntil = until.toISOString();
  }
  setLoginAttempts(data);
  return data;
}
function getBlockTimeRemaining() {
  const data = getLoginAttempts();
  if (!data.blockedUntil) return 0;
  return Math.ceil((new Date(data.blockedUntil) - new Date()) / 60000); //minutos restantes
}

//Control de tiempo de bloqueo
let _blockInterval = null;

function startBlockCountdown(errId) {
  stopBlockCountdown();
  _blockInterval = setInterval(() => {
    if (!isLoginBlocked()) {
      stopBlockCountdown();
      hideError(errId);
      return;
    }
    const mins = getBlockTimeRemaining();
    const data = getLoginAttempts();
    const secsTotal = Math.ceil((new Date(data.blockedUntil) - new Date()) / 1000);
    const m = Math.floor(secsTotal / 60);
    const s = secsTotal % 60;
    const display = `${m}:${String(s).padStart(2,'0')}`;
    showError(errId, `🔒 Cuenta bloqueada. Tiempo restante: ${display}`);
  }, 1000);
}

function stopBlockCountdown() {
  if (_blockInterval) {
    clearInterval(_blockInterval);
    _blockInterval = null;
  }
}


// ── VALIDADORES ──────────────────────────────────────────────
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
function validatePassword(pass) {
  return pass.length >= 8 && /[a-zA-Z]/.test(pass) && /[0-9]/.test(pass);
}
function validateCedula(cedula) {
  return /^[0-9]{6,10}$/.test(cedula.trim());
}
function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
}
function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}


// ── HELPERS DE USUARIOS EN LOCALSTORAGE ─────────────────────
function getUsers() {
  try { return JSON.parse(localStorage.getItem('tf_users') || '[]'); }
  catch { return []; }
}
function saveUsers(arr) {
  localStorage.setItem('tf_users', JSON.stringify(arr));
}
function findUserByEmail(email) {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}
function findUserByCedula(cedula) {
  return getUsers().find(u => u.cedula === cedula);
}



/* ══════════════════════════════════════════════
   MODO OFFLINE — localStorage como fallback
   Cuando la BD no está disponible, los datos se
   guardan localmente y se usan para renderizar.
══════════════════════════════════════════════ */
const OFFLINE = {
  getProjs() {
    try { return JSON.parse(localStorage.getItem('tf_projs')||'[]'); } catch{ return []; }
  },
  saveProjs(arr) { localStorage.setItem('tf_projs', JSON.stringify(arr)); },
  getTasks() {
    try { return JSON.parse(localStorage.getItem('tf_tasks')||'[]'); } catch{ return []; }
  },
  saveTasks(arr) { localStorage.setItem('tf_tasks', JSON.stringify(arr)); },
  newId() { return 'loc_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
};

function getEffectiveUserId() {
  if (!ST.user) return null;
  // UUID real de BD
  if (ST.user.id && !String(ST.user.id).startsWith('local-')) return ST.user.id;
  // Perfil real cargado en memoria
  if (ST.profiles && ST.profiles.length) return ST.profiles[0].id;
  // Usuario local — devolver el id igual (las operaciones offline lo manejan)
  return ST.user.id || null;
}


// ── LOGIN CON API JWT ────────────────────────────────────────
async function doLogin(e) {
  e.preventDefault();
  hideError('login-err');

  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const btn   = e.target.querySelector('button[type="submit"]');

  // 1. Verificar bloqueo activo
  if (isLoginBlocked()) {
    const mins = getBlockTimeRemaining();
    showError('login-err', `🔒 Cuenta bloqueada. Intenta en ${mins} minuto(s).`);
    startBlockCountdown('login-err');
    return;
  }

  // 2. Validaciones básicas
  if (!email || !pass) {
    showError('login-err', 'Completa todos los campos.');
    return;
  }
  if (!validateEmail(email)) {
    showError('login-err', 'El formato del correo no es válido.');
    return;
  }
  if (pass.length < 8) {
    showError('login-err', 'La contraseña debe tener al menos 8 caracteres.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try {
    const response = await fetch(BASE_URL + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    }).then(r => r.json());

    if (!response.user) {
      // Registrar intento fallido
      const attempts = registerFailedAttempt();
      const remaining = Math.max(0, LOGIN_MAX_ATTEMPTS - attempts.count);

      if (remaining <= 0) {
        showError('login-err', `🔒 Cuenta bloqueada ${LOGIN_BLOCK_MINUTES} minutos por múltiples intentos fallidos.`);
        startBlockCountdown('login-err');
      } else if (remaining === 1) {
        showError('login-err', `⚠️ Credenciales incorrectas. ¡Último intento antes del bloqueo!`);
      } else {
        const msg = response.error === 'Usuario no encontrado'
          ? `❌ Usuario no registrado. Intentos restantes: ${remaining}.`
          : `Credenciales incorrectas. Intentos restantes: ${remaining}.`;
        showError('login-err', msg);
      }
      return;
    }

    // Login exitoso
    resetLoginAttempts();
    stopBlockCountdown();

    localStorage.setItem('tf_user', JSON.stringify(response.user));
    localStorage.setItem('tf_access_token', response.access_token);
    localStorage.setItem('tf_refresh_token', response.refresh_token);
    ST.user = response.user;
    updateUserUI(response.user);
    hideAuth();
    toast('✓ Sesión iniciada como ' + response.user.full_name, 's');
    try { await loadAll(); } catch(ex) {}
    nav(document.querySelector('[data-page=dashboard]'), 'dashboard');

  } catch (ex) {
    showError('login-err', 'Error de conexión. Intenta más tarde.');
    console.error('Login error:', ex);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Iniciar sesión';
  }
}



// ── REGISTRO ─────────────────────────────────────────────────
async function doRegister(e) {
  e.preventDefault();
  hideError('reg-err');

  const name   = document.getElementById('reg-name').value.trim();
  const cedula = document.getElementById('reg-cedula').value.trim();
  const email  = document.getElementById('reg-email').value.trim();
  const pass   = document.getElementById('reg-pass').value;
  const pass2  = document.getElementById('reg-pass2').value;
  const role   = document.getElementById('reg-role').value;
  const org    = document.getElementById('reg-org').value.trim() || 'CreativeHub';
  const btn    = e.target.querySelector('button[type="submit"]');

  // Validaciones
  if (!name || !cedula || !email || !pass || !pass2) {
    showError('reg-err', 'Todos los campos marcados con * son obligatorios.');
    return;
  }
  if (!validateCedula(cedula)) {
    showError('reg-err', 'La cédula debe contener solo números y tener entre 6 y 10 dígitos.');
    return;
  }
  if (!validateEmail(email)) {
    showError('reg-err', 'El formato del correo no es válido.');
    return;
  }
  if (!validatePassword(pass)) {
    showError('reg-err', 'La contraseña debe tener mínimo 8 caracteres, al menos una letra y un número.');
    return;
  }
  if (pass !== pass2) {
    showError('reg-err', 'Las contraseñas no coinciden.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creando cuenta...';

  try {
    const response = await fetch(BASE_URL + '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: name, cedula, email, password: pass, role, organization: org })
    }).then(r => r.json());

    if (response.error) {
      showError('reg-err', response.error);
      return;
    }

    // Guardar sesión
    localStorage.setItem('tf_user', JSON.stringify(response.user));
    localStorage.setItem('tf_access_token', response.access_token);
    localStorage.setItem('tf_refresh_token', response.refresh_token);
    ST.user = response.user;
    updateUserUI(response.user);
    hideAuth();
    toast('✓ ¡Bienvenido/a, ' + name.split(' ')[0] + '!', 's');
    renderDash();

  } catch (err) {
    showError('reg-err', 'Error de conexión. Intenta de nuevo.');
    console.error('Register error:', err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear cuenta';
  }
}

// ── RECUPERAR CONTRASEÑA ─────────────────────────────────────
function doRecover(e) {
  e.preventDefault();
  hideError('rec-err');
 
  const email = document.getElementById('rec-email').value.trim();
  const btn   = e.target.querySelector('button[type="submit"]');
 
  if (!validateEmail(email)) {
    const el = document.getElementById('rec-err');
    if (el) { el.style.display = 'block'; el.textContent = 'Ingresa un correo electrónico válido.'; }
    return;
  }
 
  btn.disabled = true;
  btn.textContent = 'Enviando...';
 
  // Simular envío (modo local)
  const user = findUserByEmail(email);
  if (user) {
    // En modo local: mostrar la contraseña en consola (solo para pruebas)
    console.info('[TaskFlow Dev] Contraseña para', email, '→', user.password);
  }
  // Siempre mostrar éxito (no revelar si el email existe o no)
  document.getElementById('rec-form').style.display = 'none';
  document.getElementById('rec-ok').style.display = 'block';
 
  setTimeout(() => {
    document.getElementById('rec-form').style.display = 'flex';
    document.getElementById('rec-ok').style.display = 'none';
    document.getElementById('rec-email').value = '';
    showAuth('login');
    btn.disabled = false;
    btn.textContent = 'Enviar enlace de recuperación';
  }, 3000);
}

function updateUserUI(u){
  if(!u)return;
  const initials=u.initials||(u.full_name||u.name||'??').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  ['sb-av','tb-av'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=initials});
  const un=document.getElementById('sb-uname');if(un)un.textContent=u.full_name||u.name||'';
  const ur=document.getElementById('sb-urole');if(ur)ur.textContent=(u.role||'Empleado')+' · '+(u.organization||'TaskFlow');
  const dg=document.getElementById('dash-greeting');
  if(dg){const firstName=(u.full_name||u.name||'').split(' ')[0]; dg.textContent='¡Buenos días, '+firstName+' 👋';}
  const pa=document.getElementById('prof-av');if(pa)pa.textContent=initials;
  const pn=document.getElementById('prof-name');if(pn)pn.textContent=u.full_name||u.name||'';
  const pr=document.getElementById('prof-role');if(pr)pr.textContent=u.role||'Empleado';
  const pe=document.getElementById('prof-email');if(pe)pe.textContent=u.email||'';
  const ppn=document.getElementById('pf-pname');if(ppn)ppn.value=u.full_name||u.name||'';
  const ppe=document.getElementById('pf-pemail');if(ppe)ppe.value=u.email||'';
  const ppr=document.getElementById('pf-prole');if(ppr)ppr.value=u.role||'Empleado';
}

/* ══════════════════════════════════════════════
   CARGA INICIAL DESDE BD
══════════════════════════════════════════════ */
async function loadAll(){
  // Cargar datos offline inmediatamente para render rápido
  const offlineProjs = OFFLINE.getProjs();
  const offlineTasks = OFFLINE.getTasks();
  if(offlineProjs.length) { ST.projs = offlineProjs; renderProjs(); renderKanban(); }
  if(offlineTasks.length) { ST.tasks = offlineTasks; renderKanban(); }

  try {
    const [projs, tasks, profiles] = await Promise.all([
      API.get('/api/proyectos'),
      API.get('/api/tareas'),
      API.get('/api/perfiles'),
    ]);
    ST.projs    = projs   || [];
    ST.tasks    = tasks   || [];
    ST.profiles = profiles|| [];
    // Sincronizar cache offline con datos de BD
    OFFLINE.saveProjs(ST.projs);
    OFFLINE.saveTasks(ST.tasks);

    const uid2 = getEffectiveUserId();
    if(ST.user?.id && uid2 && !String(uid2).startsWith('local-')){
      const logs = await API.get('/api/tiempos?profile_id='+uid2);
      ST.logs = logs||[];
      // Restaurar cronómetro activo si existía
      const activo = await API.get('/api/tiempos/activo/'+uid2);
      if(activo){
        ST.tLogId = activo.id;
        ST.tProj  = activo.project_id;
        ST.tTask  = activo.task_id;
        ST.tSec   = Math.floor((Date.now()-new Date(activo.started_at))/1000);
        tResume();
      }
    }
    populateTimerSelects();
  } catch(ex){
    console.error('loadAll error:', ex);
    toast('Error cargando datos: '+ex.message,'e');
  }
}

function populateTimerSelects(){
  const ps=document.getElementById('tmr-proj');
  const ts=document.getElementById('tmr-task');
  if(!ps||!ts)return;
  ps.innerHTML=ST.projs.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  ts.innerHTML=ST.tasks.map(t=>`<option value="${t.id}">${t.title}</option>`).join('');
  if(ST.projs.length) ST.tProj=ST.projs[0].id;
  if(ST.tasks.length) ST.tTask=ST.tasks[0].id;
  ps.onchange=()=>{ ST.tProj=ps.value; };
  ts.onchange=()=>{ ST.tTask=ts.value; };
}

/* ══════════════════════════════════════════════
   SIDEBAR / NAV
══════════════════════════════════════════════ */
document.getElementById('sb-tog').addEventListener('click',()=>{
  ST.mini=!ST.mini;
  document.getElementById('sidebar').classList.toggle('mini',ST.mini);
  document.getElementById('main').classList.toggle('wide',ST.mini);
});

const TITLES={dashboard:'Dashboard',projects:'Proyectos','create-project':'Nuevo Proyecto',
  'project-detail':'Detalle del Proyecto',kanban:'Tablero Kanban','task-detail':'Detalle de Tarea',
  timer:'Cronómetro',timelog:'Historial de Tiempo',reports:'Reportes & Usuarios',
  profile:'Mi Perfil',access:'Accesibilidad'};

function nav(el,pageId){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.remove('active'));
  const pg=document.getElementById('pg-'+pageId);
  if(pg){pg.classList.add('active');ST.page=pageId}
  if(el)el.classList.add('active');
  document.getElementById('tb-title').textContent=TITLES[pageId]||pageId;
  window.scrollTo(0,0);
  if(pageId==='dashboard')  renderDash();
  if(pageId==='projects')   renderProjs();
  if(pageId==='kanban')     renderKanban();
  if(pageId==='timelog')    renderLog();
  if(pageId==='reports')    renderRep('week');
  if(pageId==='timer')      renderTmrLog();
  if(pageId==='profile')    renderProfile();
  if(pageId==='project-detail') renderProjDetail();
}

/* ══════════════════════════════════════════════
   CRONÓMETRO
══════════════════════════════════════════════ */
const CIRC=2*Math.PI*85;
const fmt=s=>[Math.floor(s/3600),Math.floor((s%3600)/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');

function updateTmr(){
  const d=document.getElementById('tmr-dig');if(d)d.textContent=fmt(ST.tSec);
  const pct=Math.min(ST.tSec/28800,1);
  const off=CIRC-pct*CIRC;
  ['tc-prog','tc-glow'].forEach(id=>{const el=document.getElementById(id);if(el){el.style.strokeDasharray=CIRC;el.style.strokeDashoffset=off}});
  const lbl=document.getElementById('tmr-lbl');
  if(lbl)lbl.textContent=ST.tRun?'en progreso':ST.tPaused?'pausado':'detenido';
  const tod=document.getElementById('d-today');if(tod)tod.textContent=fmt(ST.tSec);
  const ses=document.getElementById('d-ses');if(ses)ses.textContent=ST.tSes;
  const dh=document.getElementById('d-hours');if(dh&&ST.tSec>0){const m=Math.floor(ST.tSec/60);dh.textContent=Math.floor(m/60)+'h '+('0'+m%60).slice(-2)+'m';}
}


function tResume(){
  if(ST.tRun)return;
  ST.tRun=true; ST.tPaused=false; ST.tSes++;
  document.getElementById('t-s').style.display='none';
  document.getElementById('t-p').style.display='';
  document.getElementById('t-x').style.display='';
  ST.tInt=setInterval(()=>{ST.tSec++;updateTmr()},1000);
}

async function tStart(){
  if(ST.tRun)return;
  if(!ST.tTask||!ST.tProj){toast('Selecciona proyecto y tarea','e');return}
  const tUid = getEffectiveUserId();
  if(!tUid){toast('Sin conexión a BD para registrar tiempo','e');return}
  try {
    const res = await API.post('/api/tiempos/iniciar',{
      task_id:    ST.tTask,
      project_id: ST.tProj,
      profile_id: tUid
    });
    ST.tLogId = res.id;
    ST.tSes++;
    tResume();
    toast('⏱ Cronómetro iniciado','i');
  } catch(ex){ toast('Error iniciando cronómetro','e'); }
}

function tPause(){
  if(!ST.tRun)return;
  clearInterval(ST.tInt); ST.tRun=false; ST.tPaused=true;
  document.getElementById('t-s').style.display='';
  document.getElementById('t-s').textContent='▶';
  document.getElementById('t-p').style.display='none';
  updateTmr(); toast('⏸ Pausado','i');
}

async function tStop(){
  clearInterval(ST.tInt); ST.tRun=false; ST.tPaused=false;
  if(ST.tSec>0 && ST.user?.id){
    try {
      const res = await API.patch('/api/tiempos/detener',{profile_id:getEffectiveUserId()||ST.user?.id});
      toast('✓ Registro guardado: '+fmt(ST.tSec),'s');
      const logs = await API.get('/api/tiempos?profile_id='+ST.user.id);
      ST.logs = logs||[];
      renderTmrLog();
    } catch(ex){ toast('Sesión guardada localmente','i'); }
  }
  ST.tSec=0; ST.tLogId=null; updateTmr();
  document.getElementById('t-s').style.display='';
  document.getElementById('t-s').textContent='▶';
  document.getElementById('t-p').style.display='none';
  document.getElementById('t-x').style.display='none';
}

function renderTmrLog(){
  const el=document.getElementById('tmr-log');if(!el)return;
  const items=ST.logs.slice(0,4);
  if(!items.length){el.innerHTML='<div style="color:var(--t2);font-size:.78rem;text-align:center;padding:12px">Sin registros aún</div>';return}
  el.innerHTML=items.map(l=>{
    const dur = l.duration_sec ? fmt(l.duration_sec) : (l.is_active?'activo…':'—');
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--bdr)">
      <div><div style="font-size:.79rem;font-weight:600">${l.task_title||l.task||''}</div>
      <div style="font-size:.64rem;color:var(--t2)">${l.project_name||l.proj||''}</div></div>
      <span style="font-family:var(--mono);font-size:.79rem;font-weight:700;color:${l.is_active?'var(--blue)':'var(--t1)'}">${dur}${l.is_active?' ●':''}</span>
    </div>`;
  }).join('');
}
async function verHistorialCronometro(){
  nav(null, 'timelog');
}

/* ══════════════════════════════════════════════
   KANBAN
══════════════════════════════════════════════ */
function renderKanban(){
  ['todo','progress','done'].forEach(col=>{
    const wrap=document.getElementById('cards-'+col);
    const cnt=document.getElementById('cnt-'+col);
    if(!wrap||!cnt)return;
    const tasks=ST.tasks.filter(t=>t.column_status===col);
    cnt.textContent=tasks.length;
    wrap.innerHTML='';
    tasks.forEach(t=>{
      const card=document.createElement('div');
      card.className='kcard '+(t.priority||'').toLowerCase();
      card.draggable=true; card.dataset.id=t.id;
      const done=col==='done';
      const prio=(t.priority||'Media');
      const initials=t.assigned_initials||'??';
      card.innerHTML=`
        <div class="kcard-t" style="${done?'text-decoration:line-through;color:var(--t2)':''}">${t.title}</div>
        <div class="row ai-c g6 wrap">
          <span class="tag ${PRIO_TAG[prio]||'t-amb'}">${PRIO_LABEL[prio]||prio}</span>
          ${t.project_name?`<span class="tag t-vio" style="font-size:.59rem">${t.project_name.split(' ')[0]}</span>`:''}
        </div>
        ${t.progress>0&&t.progress<100?`<div class="pt h4 mt8"><div class="pf" style="width:${t.progress}%;background:var(--blue)"></div></div>`:''}
        <div class="kcard-f">
          <span class="kdate">${t.due_date||'—'}</span>
          <div class="row ai-c g8">
            <div class="av av-s ${avColor(initials)}">${initials}</div>
            <button class="btn btn-g btn-xs" style="padding:2px 7px" data-eid="${t.id}">···</button>
          </div>
        </div>`;
      card.addEventListener('dragstart',ev=>{ST.dragId=t.id;card.classList.add('dragging');ev.dataTransfer.effectAllowed='move'});
      card.addEventListener('dragend',()=>card.classList.remove('dragging'));
      card.querySelector('[data-eid]').addEventListener('click',ev=>{ev.stopPropagation();editTask(t.id)});
      wrap.appendChild(card);
    });
  });
  const pen=ST.tasks.filter(t=>t.column_status!=='done').length;
  const sb=document.getElementById('sb-cnt');if(sb)sb.textContent=pen;
  const dt=document.getElementById('d-tasks');if(dt)dt.textContent=pen;
}

function initKanbanDrop(){
  ['todo','progress','done'].forEach(col=>{
    const el=document.getElementById('col-'+col);if(!el)return;
    el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('over')});
    el.addEventListener('dragleave',()=>el.classList.remove('over'));
    el.addEventListener('drop',async e=>{
      e.preventDefault(); el.classList.remove('over');
      if(ST.dragId===null)return;
      const t=ST.tasks.find(x=>x.id===ST.dragId);
      if(t && t.column_status!==col){
        try {
          await API.patch('/api/tareas/'+t.id+'/mover',{column_status:col});
          t.column_status=col;
          if(col==='done')t.progress=100;
          if(col==='todo')t.progress=0;
          // Refrescar proyectos (el trigger recalcula el progress)
          const projs = await API.get('/api/proyectos');
          ST.projs = projs||ST.projs;
          renderKanban();
          toast('Tarea → "'+COL_NAME[col]+'"','s');
        } catch(ex){ toast('Error moviendo tarea','e'); }
      }
      ST.dragId=null;
    });
  });
}

function editTask(id){
  const t=ST.tasks.find(x=>x.id===id);if(!t)return;
  document.getElementById('mt-name').value=t.title;
  document.getElementById('mt-desc').value=t.description||'';
  document.getElementById('mt-prio').value=t.priority||'Media';
  document.getElementById('mt-date').value=t.due_date||'';
  document.getElementById('mt-save').onclick=async()=>{
    const body={
      title:   document.getElementById('mt-name').value.trim()||t.title,
      description: document.getElementById('mt-desc').value,
      priority:    document.getElementById('mt-prio').value,
      due_date:    document.getElementById('mt-date').value,
    };
    try {
      const updated=await API.put('/api/tareas/'+id, body);
      Object.assign(t, updated);
      renderKanban(); closeM('m-task'); toast('Tarea actualizada','s');
    } catch(ex){ toast('Error actualizando tarea','e'); }
  };
  document.getElementById('mt-del').onclick=async()=>{
    try {
      await API.delete('/api/tareas/'+id);
      ST.tasks=ST.tasks.filter(x=>x.id!==id);
      renderKanban(); closeM('m-task'); toast('Tarea eliminada','i');
    } catch(ex){ toast('Error eliminando tarea','e'); }
  };
  openM('m-task');
}

function openNewTask(col='todo'){
  document.getElementById('nt-col').value=col;
  document.getElementById('nt-form').reset();
  openM('m-newtask');
}

async function doNewTask(e){
  e.preventDefault();
  const title=document.getElementById('nt-name').value.trim();if(!title)return;
  const col=document.getElementById('nt-col').value;
  // Usar primer proyecto disponible o el seleccionado en cronómetro
  const project_id = document.getElementById('nt-proj')?.value || ST.tProj || (ST.projs[0]?.id);
  if(!project_id){toast('Crea un proyecto primero','e');return}
  const uid = getEffectiveUserId() || ST.user?.id || 'local';
  const body={
    project_id,
    title,
    description: document.getElementById('nt-desc').value,
    column_status: col,
    priority: document.getElementById('nt-prio').value,
    due_date: document.getElementById('nt-date').value||null,
    due_date_iso: null,
    assigned_to: uid,
    created_by: uid,
  };
  const isLocalUser2 = !ST.user?.id || String(ST.user.id).startsWith('local-');
  const saveTaskLocally = () => {
    const proj = ST.projs.find(p=>p.id===body.project_id);
    const localTask = {
      ...body,
      id: OFFLINE.newId(),
      created_at: new Date().toISOString(),
      project_name: proj?.name||'',
      assigned_name: ST.user?.full_name||'',
      assigned_initials: ST.user?.initials||'??',
      progress: 0,
      _offline: true
    };
    const tasks = [...OFFLINE.getTasks(), localTask];
    OFFLINE.saveTasks(tasks);
    ST.tasks = tasks;
  };
  if (isLocalUser2) {
    saveTaskLocally();
    renderKanban(); closeM('m-newtask'); toast('✓ Tarea creada','s');
    populateTimerSelects();
  } else {
    try {
      const newT=await API.post('/api/tareas', body);
      const tasks=await API.get('/api/tareas');
      ST.tasks=tasks||ST.tasks;
      OFFLINE.saveTasks(ST.tasks);
      renderKanban(); closeM('m-newtask'); toast('✓ Tarea creada','s');
      populateTimerSelects();
    } catch(ex){
      saveTaskLocally();
      renderKanban(); closeM('m-newtask'); toast('✓ Tarea creada (local)','s');
      populateTimerSelects();
    }
  }
}

/* ══════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════ */
async function renderDash(){
  if(ST.user?.id){
    try {
      const uid4 = getEffectiveUserId();
      if(!uid4 || String(uid4).startsWith('local-')) throw new Error('local user');
      const d=await API.get('/api/dashboard/'+uid4);
      const dp=document.getElementById('d-projs');if(dp)dp.textContent=d.active_projects;
      const dt=document.getElementById('d-tasks');if(dt)dt.textContent=d.pending_tasks;
      const tb=document.getElementById('d-tbody');
      if(tb && d.recent_tasks){
        tb.innerHTML=d.recent_tasks.map(t=>`
          <tr>
            <td class="td-p">${t.title}</td>
            <td style="font-size:.75rem">${t.project_name||''}</td>
            <td><span class="tag ${PRIO_TAG[t.priority]||'t-amb'}">${t.priority||''}</span></td>
            <td style="font-family:var(--mono);font-size:.71rem">${t.due_date||'—'}</td>
            <td><span class="tag ${t.column_status==='progress'?'t-blue':'t-gray'}">${COL_NAME[t.column_status]||t.column_status}</span></td>
          </tr>`).join('');
      }
    } catch(ex){ console.warn('dashboard error', ex); }
  } else {
    // Sin sesión: mostrar datos locales cacheados
    const tb=document.getElementById('d-tbody');if(!tb)return;
    const pen=ST.tasks.filter(t=>t.column_status!=='done').slice(0,6);
    tb.innerHTML=pen.map(t=>`<tr>
      <td class="td-p">${t.title}</td><td style="font-size:.75rem">${t.project_name||''}</td>
      <td><span class="tag ${PRIO_TAG[t.priority]||'t-amb'}">${t.priority||''}</span></td>
      <td style="font-family:var(--mono);font-size:.71rem">${t.due_date||'—'}</td>
      <td><span class="tag t-gray">${COL_NAME[t.column_status]||''}</span></td></tr>`).join('');
  }
}

/* ══════════════════════════════════════════════
   PROYECTOS
══════════════════════════════════════════════ */
let pfil='all';
function filterP(f,el){
  pfil=f;
  document.querySelectorAll('#pg-projects .btn-sm').forEach(b=>{b.className='btn btn-g btn-sm'});
  if(el)el.className='btn btn-p btn-sm';
  renderProjs();
}

function renderProjs(){
  const w=document.getElementById('proj-list');if(!w)return;
  const list=pfil==='all'?ST.projs:ST.projs.filter(p=>p.status===pfil);
  if(!list.length){w.innerHTML='<div style="text-align:center;padding:40px;color:var(--t2)">Sin proyectos aún. ¡Crea el primero!</div>';return}
  w.innerHTML=list.map(p=>{
    const members=p.members||[];
    const avs=members.map(m=>`<div class="av av-s ${avColor(m.initials)}">${m.initials||'?'}</div>`).join('');
    const old=p.status==='Completado';
    return `<div class="prow" onclick="openProjDetail('${p.id}')" style="${old?'opacity:.6':''}">
      <div class="prow-color" style="background:${p.color||'#2462E9'}"></div>
      <div class="f1 mw0"><div class="prow-name">${p.name}</div>
      <div class="prow-meta">${p.start_date||''} → ${p.end_date||''} · ${members.length} miembros · ${p.priority||''} prioridad</div></div>
      <div class="prow-prog">
        <div class="row jb mb8"><span style="font-size:.69rem;color:var(--t1)">Avance</span><span style="font-size:.69rem;font-weight:700;color:${p.color||'var(--blue)'}">${p.progress||0}%</span></div>
        <div class="pt h4"><div class="pf" style="width:${p.progress||0}%;background:${p.color||'var(--blue)'}"></div></div>
      </div>
      <span class="tag ${old?'t-gray':'t-blue'}">${p.status}</span>
      <div class="av-stack">${avs}</div>
      <button class="btn btn-g btn-sm" onclick="event.stopPropagation();nav(document.querySelector('[data-page=kanban]'),'kanban')">Ver →</button>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   PROYECTO DETALLE
══════════════════════════════════════════════ */
let currentProjId = null;
function openProjDetail(projId){
  currentProjId = projId;
  nav(document.querySelector('[data-page=project-detail]'),'project-detail');
}

function renderProjDetail(){
  const proj = ST.projs.find(p=>p.id===currentProjId)||ST.projs[0];
  if(!proj)return;
  const projTasks = ST.tasks.filter(t=>t.project_id===proj.id);
  const done=projTasks.filter(t=>t.column_status==='done').length;
  const total=projTasks.length;
  const pct=total?Math.round(done/total*100):proj.progress||0;
  const pc=document.getElementById('pd-pct');if(pc)pc.textContent=pct+'%';
  const pb=document.getElementById('pd-bar');if(pb){pb.style.width=pct+'%';pb.style.background=proj.color||'var(--blue)'}
  const tc=document.getElementById('pd-tcnt');if(tc)tc.textContent=done+' / '+total;
  const tb=document.getElementById('pd-tbody');
  if(tb)tb.innerHTML=projTasks.slice(0,8).map(t=>`
    <tr>
      <td class="td-p">${t.title}</td>
      <td><div class="row ai-c g8"><div class="av av-s ${avColor(t.assigned_initials||'??')}">${t.assigned_initials||'?'}</div>${t.assigned_name||'—'}</div></td>
      <td><span class="tag ${PRIO_TAG[t.priority]||'t-amb'}">${t.priority||''}</span></td>
      <td style="font-family:var(--mono);font-size:.72rem">${t.due_date||'—'}</td>
      <td><span class="tag ${t.column_status==='done'?'t-grn':t.column_status==='progress'?'t-blue':'t-gray'}">${COL_NAME[t.column_status]||''}</span></td>
    </tr>`).join('');
}

/* ══════════════════════════════════════════════
   CREAR PROYECTO
══════════════════════════════════════════════ */
async function doNewProj(e){
  e.preventDefault();
  const name=document.getElementById('pf-name').value.trim();if(!name)return;
  const uid = getEffectiveUserId() || ST.user?.id || 'local';
  const body={
    name,
    color:       document.getElementById('pf-color').value || '#2462E9',
    status:      'Activo',
    priority:    document.getElementById('pf-prio').value,
    start_date:  document.getElementById('pf-start').value,
    end_date:    document.getElementById('pf-end').value,
    created_by:  uid,
  };
  const isLocalUser = !ST.user?.id || String(ST.user.id).startsWith('local-');
  if (isLocalUser) {
    // Usuario sin BD: guardar directo en localStorage
    const localProj = {
      ...body,
      id: OFFLINE.newId(),
      created_at: new Date().toISOString(),
      members: null,
      _offline: true
    };
    const projs = [...OFFLINE.getProjs(), localProj];
    OFFLINE.saveProjs(projs);
    ST.projs = projs;
  } else {
    try {
      const proj = await API.post('/api/proyectos', body);
      const projs = await API.get('/api/proyectos');
      ST.projs = projs || ST.projs;
      OFFLINE.saveProjs(ST.projs);
    } catch(ex){
      const localProj = {
        ...body,
        id: OFFLINE.newId(),
        created_at: new Date().toISOString(),
        members: null,
        _offline: true
      };
      const projs = [...OFFLINE.getProjs(), localProj];
      OFFLINE.saveProjs(projs);
      ST.projs = projs;
      toast('⚠️ Guardado localmente (BD no disponible)','i');
    }
  }
  renderProjs();
  populateTimerSelects();
  document.getElementById('proj-form').reset();
  toast('✓ Proyecto "'+name+'" creado','s');
  nav(document.querySelector('[data-page=projects]'),'projects');
}

/* ══════════════════════════════════════════════
   HISTORIAL DE TIEMPO
══════════════════════════════════════════════ */
function renderLog(){
  const tb=document.getElementById('log-tbody');if(!tb)return;
  if(!ST.logs.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--t2);padding:20px">Sin registros de tiempo aún</td></tr>';return}
  tb.innerHTML=ST.logs.map(l=>{
    const dur=l.duration_sec?fmt(l.duration_sec):(l.is_active?'activo':'—');
    const fecha=l.started_at?new Date(l.started_at).toLocaleDateString('es-VE',{day:'2-digit',month:'short',year:'numeric'}):'—';
    const inicio=l.started_at?new Date(l.started_at).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'}):'—';
    const fin=l.ended_at?new Date(l.ended_at).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'}):'—';
    return `<tr>
      <td style="font-family:var(--mono);font-size:.7rem">${fecha}</td>
      <td class="td-p">${l.task_title||l.task||''}</td>
      <td><span class="tag t-blue">${(l.project_name||l.proj||'').split(' ')[0]}</span></td>
      <td style="font-family:var(--mono);font-size:.7rem">${inicio}</td>
      <td style="font-family:var(--mono);font-size:.7rem">${fin}</td>
      <td><span style="font-family:var(--mono);font-size:.78rem;font-weight:700;color:${l.is_active?'var(--blue)':'var(--t1)'}">${dur}${l.is_active?' ●':''}</span></td>
      <td><button class="btn btn-g btn-xs" onclick="toast('Sin cambios permitidos en historial','i')">Ver</button></td>
    </tr>`;
  }).join('');
  const tot=document.getElementById('log-tot');if(tot)tot.textContent=ST.logs.length+' registros';
}

/* ══════════════════════════════════════════════
   REPORTES
══════════════════════════════════════════════ */
async function renderRep(period,btn){
  if(btn){document.querySelectorAll('#pg-reports .row.g6 .btn').forEach(b=>b.className='btn btn-g btn-sm');btn.className='btn btn-p btn-sm'}
  const ch=document.getElementById('rep-chart');if(!ch)return;
  const maxH=110;
  // Datos de proyectos reales
  const projs=ST.projs.slice(0,4);
  const colors=['var(--blue)','var(--vio)','var(--amb)','var(--teal)'];
  const vals=projs.map(p=>p.progress||0);
  const max=Math.max(...vals,1);
  ch.innerHTML=projs.map((p,i)=>`
    <div class="bch-item">
      <span class="bch-val">${p.progress||0}%</span>
      <div class="bch-bar" style="height:${((p.progress||0)/max)*100}%;background:${colors[i%colors.length]}"></div>
      <span class="bch-lbl">${p.name.split(' ')[0]}</span>
    </div>`).join('');

  // Productividad por usuario desde BD
  try {
    const users=await API.get('/api/reportes/usuarios');
    const cont=document.querySelector('#pg-reports .card.anim:nth-child(2) .col.g12');
    if(cont && users?.length){
      const maxT=Math.max(...users.map(u=>u.total_tasks||0),1);
      const uColors=['var(--blue)','var(--amb)','var(--vio)','var(--grn)','var(--teal)'];
      cont.innerHTML=users.slice(0,5).map((u,i)=>`
        <div>
          <div class="row jb mb8">
            <div class="row ai-c g8"><div class="av av-s ${avColor(u.initials)}">${u.initials||'?'}</div>
            <span style="font-size:.78rem;font-weight:700">${u.full_name}</span></div>
            <span style="font-size:.74rem;font-family:var(--mono);color:${uColors[i%uColors.length]}">${u.completed_tasks||0}/${u.total_tasks||0} tareas</span>
          </div>
          <div class="pt h6"><div class="pf" style="width:${((u.completed_tasks||0)/maxT)*100}%;background:${uColors[i%uColors.length]}"></div></div>
        </div>`).join('');
    }
  } catch(ex){}
}

/* ══════════════════════════════════════════════
   PERFIL
══════════════════════════════════════════════ */
function renderProfile(){
  const pc=document.getElementById('p-pcount');if(pc)pc.textContent=ST.projs.filter(p=>p.status==='Activo').length;
  const tc=document.getElementById('p-tcount');if(tc)tc.textContent=ST.tasks.filter(t=>t.column_status!=='done').length;
}

document.querySelector('#pg-profile .btn.btn-p.btn-sm')?.addEventListener('click', async ()=>{
  if(!ST.user?.id)return;
  const name=document.getElementById('pf-pname').value.trim();
  if(!name)return;
  const initials=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  try {
    await API.put('/api/perfiles/'+ST.user.id, {full_name:name, initials});
    ST.user.full_name=name; ST.user.initials=initials;
    localStorage.setItem('tf_user',JSON.stringify(ST.user));
    updateUserUI(ST.user);
    toast('Cambios guardados','s');
  } catch(ex){ toast('Error guardando perfil','e'); }
});

/* ══════════════════════════════════════════════
   COMENTARIOS
══════════════════════════════════════════════ */
async function addComment(){
  const inp=document.getElementById('cmt-in');
  const v=inp.value.trim();if(!v)return;
  if(!ST.currentTaskId){
    // Crear comentario offline
    const list=document.getElementById('cmt-list');
    const item=document.createElement('div'); item.className='cmt-item';
    const init=ST.user.initials||(ST.user.full_name||'??').slice(0,2).toUpperCase();
    item.innerHTML=`<div class="av av-s ${avColor(init)}" style="flex-shrink:0">${init}</div><div class="cmt-bub f1"><div class="cmt-txt">${v}</div><div class="cmt-meta">${ST.user.full_name||'Tú'} · ahora mismo</div></div>`;
    list.appendChild(item); inp.value=''; toast('Comentario enviado','s');
    return;
  }
  try {
    const c=await API.post('/api/tareas/'+ST.currentTaskId+'/comentarios',{author_id:ST.user.id,content:v});
    const list=document.getElementById('cmt-list');
    const item=document.createElement('div'); item.className='cmt-item';
    item.innerHTML=`<div class="av av-s ${avColor(c.author_initials)}" style="flex-shrink:0">${c.author_initials||'?'}</div><div class="cmt-bub f1"><div class="cmt-txt">${v}</div><div class="cmt-meta">${c.author_name||'Tú'} · ahora mismo</div></div>`;
    list.appendChild(item); inp.value=''; toast('Comentario guardado','s');
  } catch(ex){ toast('Error enviando comentario','e'); }
}

/* ══════════════════════════════════════════════
   ACCESIBILIDAD / TOGGLES
══════════════════════════════════════════════ */
document.querySelectorAll('.tog').forEach(t=>t.addEventListener('click',()=>t.classList.toggle('on')));
function setSz(el){document.querySelectorAll('#fsz-grp .fsz-btn').forEach(b=>b.classList.remove('on'));el.classList.add('on');toast('Tamaño actualizado','i')}
function setSpc(el){document.querySelectorAll('#spc-grp .fsz-btn').forEach(b=>b.classList.remove('on'));el.classList.add('on')}

/* ══════════════════════════════════════════════
   CHAT
══════════════════════════════════════════════ */
function toggleChat(){document.getElementById('chat-panel').classList.toggle('open')}
function setCI(el){document.getElementById('chat-in').value=el.textContent;document.getElementById('chat-in').focus()}
function sendChat(){
  const v=document.getElementById('chat-in').value.trim();if(!v)return;
  toast('🤖 Procesando...','i');
  document.getElementById('chat-in').value='';
}

/* ══════════════════════════════════════════════
   BÚSQUEDA
══════════════════════════════════════════════ */
// ════════════════════════════════════════════
// BÚSQUEDA FUNCIONAL
// ════════════════════════════════════════════
document.getElementById('s-input').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const dropdown = document.getElementById('search-dropdown');
  const results = document.getElementById('search-results');

  if(!q) {
    dropdown.style.display = 'none';
    return;
  }

  // Buscar en proyectos y tareas
  const proyectos = (ST.projs || []).filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
  const tareas = (ST.tasks || []).filter(t => t.title.toLowerCase().includes(q)).slice(0, 5);

  const html = [];

  if(proyectos.length > 0) {
    html.push('<div style="padding:8px 0"><div style="padding:8px 16px;font-size:.7rem;color:var(--t2);font-weight:700;text-transform:uppercase">Proyectos</div>');
    proyectos.forEach(p => {
      html.push(`<div style="padding:8px 16px;cursor:pointer;transition:background .2s" onmouseover="this.style.background='var(--s1)'" onmouseout="this.style.background='transparent'" onclick="nav(document.querySelector('[data-page=projects]'),'projects'); document.getElementById('s-input').value=''; document.getElementById('search-dropdown').style.display='none'">
        <div style="font-size:.8rem;font-weight:600">📁 ${p.name}</div>
      </div>`);
    });
    html.push('</div>');
  }

  if(tareas.length > 0) {
    html.push('<div style="padding:8px 0"><div style="padding:8px 16px;font-size:.7rem;color:var(--t2);font-weight:700;text-transform:uppercase">Tareas</div>');
    tareas.forEach(t => {
      html.push(`<div style="padding:8px 16px;cursor:pointer;transition:background .2s" onmouseover="this.style.background='var(--s1)'" onmouseout="this.style.background='transparent'" onclick="nav(document.querySelector('[data-page=kanban]'),'kanban'); document.getElementById('s-input').value=''; document.getElementById('search-dropdown').style.display='none'">
        <div style="font-size:.8rem;font-weight:600">☰ ${t.title}</div>
        <div style="font-size:.65rem;color:var(--t2);margin-top:2px">Prioridad: ${t.priority || 'Media'}</div>
      </div>`);
    });
    html.push('</div>');
  }

  if(!proyectos.length && !tareas.length) {
    html.push('<div style="padding:16px;text-align:center;color:var(--t2);font-size:.8rem">No se encontraron resultados</div>');
  }

  results.innerHTML = html.join('');
  dropdown.style.display = 'block';
});

// Cerrar búsqueda al hacer clic afuera
document.addEventListener('click', (e) => {
  const searchWrap = document.querySelector('.search-wrap');
  const dropdown = document.getElementById('search-dropdown');
  if(!searchWrap.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// ════════════════════════════════════════════
// NOTIFICACIONES FUNCIONALES
// ════════════════════════════════════════════
const NOTIF = {
  list: [
    {id:1, tipo:'tarea', titulo:'Tarea "Diseño de API REST" vence mañana', icon:'📌', leida:false, fecha:'hace 15 min'},
    {id:2, tipo:'asignacion', titulo:'Carlos te asignó "Testing módulo auth"', icon:'👤', leida:false, fecha:'hace 1 hora'},
    {id:3, tipo:'proyecto', titulo:'"TaskFlow MVP" alcanzó 68% de avance', icon:'📈', leida:false, fecha:'hace 3 horas'},
    {id:4, tipo:'tarea', titulo:'Completaste 5 tareas esta semana', icon:'✓', leida:true, fecha:'hace 1 día'}
  ]
};

function renderNotif() {
  const badge = document.getElementById('notif-badge');
  const list = document.getElementById('notif-list');
  const noLeidas = NOTIF.list.filter(n => !n.leida).length;

  badge.textContent = noLeidas;
  badge.style.display = noLeidas > 0 ? 'flex' : 'none';

  list.innerHTML = NOTIF.list.map(n => `
    <div class="notif-item" style="padding:12px 16px;border-bottom:1px solid var(--bdr);cursor:pointer;transition:background .2s;${!n.leida ? 'background:rgba(36,98,233,.04)' : ''}" onmouseover="this.style.background='var(--s1)'" onmouseout="this.style.background='${!n.leida ? 'rgba(36,98,233,.04)' : 'transparent'}'" onclick="markNotifRead(${n.id})">
      <div style="display:flex;gap:12px">
        <div style="font-size:1.2rem">${n.icon}</div>
        <div style="flex:1">
          <div style="font-size:.8rem;color:var(--t0);line-height:1.4;${n.leida ? 'opacity:.6' : ''}">${n.titulo}</div>
          <div style="font-size:.65rem;color:var(--t2);margin-top:4px">${n.fecha}</div>
        </div>
        ${!n.leida ? '<div style="width:8px;height:8px;background:var(--blue);border-radius:50%;flex-shrink:0;margin-top:6px"></div>' : ''}
      </div>
    </div>
  `).join('');
}

function markNotifRead(id) {
  const notif = NOTIF.list.find(n => n.id === id);
  if(notif) notif.leida = true;
  renderNotif();
}

function markAllNotifRead() {
  NOTIF.list.forEach(n => n.leida = true);
  renderNotif();
}

// Toggle dropdown notificaciones
document.getElementById('tb-notif').addEventListener('click', (e) => {
  e.stopPropagation();
  const dropdown = document.getElementById('notif-dropdown');
  const isOpen = dropdown.style.display !== 'none';
  dropdown.style.display = isOpen ? 'none' : 'block';
  if(!isOpen) renderNotif();
});

// Cerrar dropdown al hacer clic afuera
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notif-dropdown');
  const notifBtn = document.getElementById('tb-notif');
  if(!notifBtn.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// Renderizar notificaciones al iniciar
renderNotif();

/* ══════════════════════════════════════════════
   INICIALIZACIÓN
══════════════════════════════════════════════ */
(async function init(){
  initKanbanDrop();

  // Restaurar sesión guardada
  const saved=localStorage.getItem('tf_user');
  if(saved){
    const savedUser = JSON.parse(saved);
    ST.user = savedUser;   // Restaurar inmediatamente sin esperar BD
    updateUserUI(ST.user);
    document.getElementById('auth-overlay').style.display='none';
    // Intentar actualizar perfil desde BD en segundo plano
    try {
      const profiles = await API.get('/api/perfiles');
      ST.profiles = profiles;
      const match = profiles.find(p => p.id === savedUser.id);
      if(match){
        ST.user = {...match, email: savedUser.email};
        localStorage.setItem('tf_user', JSON.stringify(ST.user));
        updateUserUI(ST.user);
      }
      await loadAll();
    } catch(ex){
      // BD no disponible — sesión local válida, mostrar datos cacheados
      try{ renderDash(); renderKanban(); renderLog(); } catch(_){}
    }
  }

  renderDash();
  renderKanban();
  renderLog();
  renderRep('week');
  renderTmrLog();
  updateTmr();
})();

/* ══════════════════════════════════════════════
   ACCESIBILIDAD REAL CON PERSISTENCIA EN BD (Cristina + Eduardo)
══════════════════════════════════════════════ */

// Estado de preferencias en memoria
const PREFS = {
  alto_contraste: false,
  fuente_dyslexic: false,
  modo_enfoque: false,
  tamano_fuente: 'normal',
  espaciado_letras: 'normal',
  indicadores_foco: true
};

function applyPrefs(p) {
  document.body.classList.toggle('alto-contraste', !!p.alto_contraste);
  document.body.classList.toggle('fuente-dyslexic', !!p.fuente_dyslexic);
  document.body.classList.toggle('modo-enfoque', !!p.modo_enfoque);
  document.body.classList.toggle('sin-foco-visible', !p.indicadores_foco);

  // Aplicar tamaño de fuente
  document.body.classList.remove('font-pequeno','font-normal','font-grande','font-xl');
  document.body.classList.add('font-'+(p.tamano_fuente||'normal'));

  // Aplicar espaciado de letras
  document.body.classList.remove('spacing-normal','spacing-ampliado');
  document.body.classList.add('spacing-'+(p.espaciado_letras||'normal'));

  // Sincronizar toggles de UI
  const togContraste = document.getElementById('tog-contraste');
  const togDyslexic  = document.getElementById('tog-dyslexic');
  const togEnfoque   = document.getElementById('tog-enfoque');
  const togFoco      = document.getElementById('tog-foco');
  if(togContraste) togContraste.classList.toggle('on', !!p.alto_contraste);
  if(togDyslexic)  togDyslexic.classList.toggle('on',  !!p.fuente_dyslexic);
  if(togEnfoque)   togEnfoque.classList.toggle('on',   !!p.modo_enfoque);
  if(togFoco)      togFoco.classList.toggle('on',      p.indicadores_foco !== false);

  // Botones de tamaño
  const tamanoActual = p.tamano_fuente || 'normal';
  document.querySelectorAll('#fsz-grp .fsz-btn').forEach(b=>{
    const match = b.dataset.sz === tamanoActual;
    if(match) b.classList.add('on');
    else b.classList.remove('on');
  });

  // Botones de espaciado
  document.querySelectorAll('#spc-grp .fsz-btn').forEach(b=>{
    b.classList.toggle('on', b.textContent.toLowerCase() === (p.espaciado_letras||'normal'));
  });

  Object.assign(PREFS, p);
}

async function loadPrefs() {
  if (!ST.user || !ST.user.id) return;

  // Intentar cargar de BD primero
  try {
    const p = await API.get('/api/preferencias/'+ST.user.id);
    applyPrefs(p);
    return;
  } catch(e) {
    console.log('[loadPrefs] BD no disponible, intentando localStorage');
  }

  // Fallback a localStorage
  try {
    const saved = localStorage.getItem('taskflow_prefs_'+ST.user.id);
    if(saved) {
      const p = JSON.parse(saved);
      applyPrefs(p);
      console.log('[loadPrefs] Preferencias cargadas desde localStorage');
    }
  } catch(e) {
    console.log('[loadPrefs] Error cargando localStorage:', e.message);
  }
}

async function savePrefs(changes) {
  Object.assign(PREFS, changes);
  applyPrefs(PREFS);

  // Guardar en localStorage como fallback
  try {
    localStorage.setItem('taskflow_prefs_'+ST.user.id, JSON.stringify(PREFS));
  } catch(e) { /* localStorage lleno o desactivado */ }

  if (!ST.user || !ST.user.id) return;
  try {
    await API.put('/api/preferencias/'+ST.user.id, PREFS);
    toast('✓ Preferencias guardadas','s');
  } catch(e) {
    // Silenciar el error y usar localStorage
    console.log('[savePrefs] BD no disponible, usando localStorage');
    toast('Preferencias guardadas localmente','i');
  }
}

// Sobrescribir setSz para que use persistencia real
function setSz(el) {
  const sz = el.dataset.sz || 'normal';
  console.log('[setSz] Tamaño seleccionado:', sz);

  // Aplicar INMEDIATAMENTE en el DOM
  document.querySelectorAll('#fsz-grp .fsz-btn').forEach(b=>b.classList.remove('on'));
  el.classList.add('on');

  // Cambiar las clases del body INMEDIATAMENTE
  document.body.classList.remove('font-pequeno','font-normal','font-grande','font-xl');
  document.body.classList.add('font-'+sz);

  console.log('[setSz] Clase aplicada:', 'font-'+sz, 'body:', document.body.className);

  // Guardar en background (sin esperar)
  savePrefs({ tamano_fuente: sz });
}

// Función setSpc con funcionalidad real
function setSpc(el) {
  const spacing = el.textContent.toLowerCase() === 'normal' ? 'normal' : 'ampliado';
  console.log('[setSpc] Espaciado seleccionado:', spacing);

  // Aplicar INMEDIATAMENTE
  document.querySelectorAll('#spc-grp .fsz-btn').forEach(b=>b.classList.remove('on'));
  el.classList.add('on');

  // Cambiar clases del body INMEDIATAMENTE
  document.body.classList.remove('spacing-normal','spacing-ampliado');
  document.body.classList.add('spacing-'+spacing);

  console.log('[setSpc] Clase aplicada:', 'spacing-'+spacing);

  // Guardar en background
  savePrefs({ espaciado_letras: spacing });
  toast('Espaciado ' + (spacing === 'ampliado' ? 'ampliado' : 'normal'), 'i');
}

// Conectar toggles de accesibilidad
document.addEventListener('DOMContentLoaded', () => {
  const togContraste = document.getElementById('tog-contraste');
  const togDyslexic  = document.getElementById('tog-dyslexic');
  const togEnfoque   = document.getElementById('tog-enfoque');
  const togFoco      = document.getElementById('tog-foco');

  if(togContraste) togContraste.addEventListener('click', ()=> {
    savePrefs({ alto_contraste: !PREFS.alto_contraste });
  });
  if(togDyslexic) togDyslexic.addEventListener('click', ()=> {
    savePrefs({ fuente_dyslexic: !PREFS.fuente_dyslexic });
  });
  if(togEnfoque) togEnfoque.addEventListener('click', ()=> {
    savePrefs({ modo_enfoque: !PREFS.modo_enfoque });
  });
  if(togFoco) togFoco.addEventListener('click', ()=> {
    savePrefs({ indicadores_foco: !PREFS.indicadores_foco });
  });

  // Botón menú móvil (Eduardo — responsive)
  const mobBtn = document.getElementById('mob-menu-btn');
  const sidebar = document.getElementById('sidebar');
  if(mobBtn && sidebar) {
    mobBtn.addEventListener('click', ()=> sidebar.classList.toggle('mobile-open'));
    document.addEventListener('click', e=> {
      if(window.innerWidth <= 768 && !sidebar.contains(e.target) && e.target !== mobBtn) {
        sidebar.classList.remove('mobile-open');
      }
    });
  }

  // Actualizar visibilidad del botón TDAH cuando cambia el modo enfoque
  if(document.getElementById('tog-enfoque')) {
    document.getElementById('tog-enfoque').addEventListener('click', () => {
      setTimeout(() => {
        const toggle = document.getElementById('enfoque-toggle');
        if(toggle) toggle.style.display = document.body.classList.contains('modo-enfoque') ? 'flex' : 'none';
      }, 100);
    });
  }
});

// Función para toggle de sidebar en modo TDAH
function toggleSidebarTDAH() {
  const sidebar = document.getElementById('sidebar');
  if(sidebar) {
    sidebar.classList.toggle('visible');
  }
  // Cerrar sidebar cuando se hace clic en un item
  document.querySelectorAll('#sidebar .sb-item').forEach(item => {
    item.addEventListener('click', () => {
      setTimeout(() => sidebar.classList.remove('visible'), 300);
    }, { once: true });
  });
}

/* ══════════════════════════════════════════════
   CHAT FUNCIONAL CON BD (Cristina — Endpoint mensajes)
══════════════════════════════════════════════ */

async function loadChatHistory() {
  try {
    const msgs = await API.get('/api/mensajes?limite=30');
    const body = document.getElementById('chat-messages-list');
    if(!body) return;
    if(!msgs.length) return;
    body.innerHTML = '';
    msgs.forEach(m => appendChatMsg(m));
  } catch(e) { /* tabla puede no existir aún */ }
}

function appendChatMsg(m) {
  const body = document.getElementById('chat-messages-list');
  if(!body) return;
  const isMe = ST.user && m.usuario_id === ST.user.id;
  const div = document.createElement('div');
  div.style.cssText = `display:flex;gap:7px;align-items:flex-start;${isMe?'flex-direction:row-reverse':''}`;
  div.innerHTML = `
    <div class="av av-s av-blue" style="flex-shrink:0">${(m.autor_iniciales||'??')}</div>
    <div>
      <div style="font-size:.62rem;color:var(--t2);margin-bottom:2px;${isMe?'text-align:right':''}">${m.autor_nombre||'Usuario'}</div>
      <div class="chat-msg" style="${isMe?'background:var(--blue-l);border-color:rgba(36,98,233,.2)':''}">
        ${m.mensaje}
      </div>
    </div>
  `;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

async function sendChat() {
  const inp = document.getElementById('chat-in');
  const v = inp.value.trim();
  if(!v) return;
  inp.value = '';
  if(!ST.user || !ST.user.id) { toast('Inicia sesión para chatear','e'); return; }
  try {
    const msg = await API.post('/api/mensajes', { usuario_id: ST.user.id, mensaje: v });
    appendChatMsg(msg);
  } catch(e) {
    // Fallback visual sin BD
    appendChatMsg({ usuario_id: ST.user?.id, autor_iniciales: ST.user?.initials||'??', autor_nombre: ST.user?.full_name||'Tú', mensaje: v });
  }
}

async function toggleChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('open');
  if(panel.classList.contains('open')) {
    await loadChatHistory();
    setTimeout(()=>document.getElementById('chat-in')?.focus(), 100);
  }
}

// Enter para enviar en chat
document.addEventListener('DOMContentLoaded', ()=>{
  const chatIn = document.getElementById('chat-in');
  if(chatIn) chatIn.addEventListener('keydown', e=>{
    if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
});

/* ══════════════════════════════════════════════
   CARGAR PREFERENCIAS TRAS LOGIN (Eduardo)
══════════════════════════════════════════════ */
// Las preferencias se cargan en continueSession() y doLogin()
// Removido: redefinición de loadAll() que causaba recursión infinita



// ════════════════════════════════════════════
// KANBAN CON TECLADO (WCAG 2.1 AA)
// Flechas Izquierda/Derecha para mover tarjetas
// ════════════════════════════════════════════

// Variables para navegación por teclado
let focusedCardIndex = 0;
let focusedColumn = 'todo';

// Hacer las tarjetas seleccionables con teclado
function enableKeyboardKanban() {
  document.querySelectorAll('.kcard').forEach((card, index) => {
    // Hacer las tarjetas enfocables con Tab
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-grabbed', 'false');
    
    // Instrucciones para lectores de pantalla
    const colName = card.closest('.kbc')?.querySelector('.kbc-name')?.textContent || '';
    card.setAttribute('aria-label', `Tarea: ${card.querySelector('.kcard-t')?.textContent || ''}. Columna: ${colName}. Presiona Enter para seleccionar, flechas para mover.`);
    
    card.addEventListener('keydown', handleCardKeydown);
    card.addEventListener('focus', () => {
      card.style.outline = '3px solid var(--blue)';
      card.style.outlineOffset = '2px';
    });
    card.addEventListener('blur', () => {
      card.style.outline = '';
      card.style.outlineOffset = '';
    });
  });
}

// Manejar teclas en tarjetas
async function handleCardKeydown(e) {
  const card = e.currentTarget;
  const taskId = card.dataset.id;
  const currentCol = card.closest('.kbc').id.replace('col-', '');
  
  switch(e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      await moveTaskKeyboard(taskId, currentCol, 'left');
      break;
    case 'ArrowRight':
      e.preventDefault();
      await moveTaskKeyboard(taskId, currentCol, 'right');
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      // Abrir edición de tarea
      editTask(taskId);
      break;
    case 'Delete':
      e.preventDefault();
      if (ST.user?.role === 'Admin' || ST.user?.role === 'Gerente') {
        if (confirm('¿Eliminar esta tarea?')) {
          await API.delete('/api/tareas/' + taskId);
          ST.tasks = ST.tasks.filter(t => t.id !== taskId);
          renderKanban();
          enableKeyboardKanban();
          toast('Tarea eliminada', 'i');
        }
      }
      break;
  }
}

// Mover tarea con teclado
async function moveTaskKeyboard(taskId, currentCol, direction) {
  const columns = ['todo', 'progress', 'done'];
  const currentIndex = columns.indexOf(currentCol);
  let newCol;
  
  if (direction === 'left' && currentIndex > 0) {
    newCol = columns[currentIndex - 1];
  } else if (direction === 'right' && currentIndex < columns.length - 1) {
    newCol = columns[currentIndex + 1];
  } else {
    return; // No puede moverse más
  }
  
  const task = ST.tasks.find(t => t.id === taskId);
  if (!task) return;
  
  try {
    await API.patch('/api/tareas/' + taskId + '/mover', { column_status: newCol });
    task.column_status = newCol;
    if (newCol === 'done') task.progress = 100;
    if (newCol === 'todo') task.progress = 0;
    
    renderKanban();
    enableKeyboardKanban();
    
    // Mantener el foco en la tarjeta movida
    setTimeout(() => {
      const movedCard = document.querySelector(`.kcard[data-id="${taskId}"]`);
      if (movedCard) movedCard.focus();
    }, 100);
    
    toast(`Tarea movida → "${COL_NAME[newCol]}"`, 's');
  } catch (ex) {
    toast('Error moviendo tarea', 'e');
  }
}

// Modificar renderKanban para llamar a enableKeyboardKanban
const originalRenderKanban = renderKanban;
renderKanban = function() {
  originalRenderKanban();
  setTimeout(enableKeyboardKanban, 100);
};



// ════════════════════════════════════════════
// ATAJOS DE TECLADO GLOBALES
// ════════════════════════════════════════════

document.addEventListener('keydown', function(e) {
  // No activar atajos si se está escribiendo en un input
  const isInputFocused = document.activeElement?.tagName === 'INPUT' || 
                         document.activeElement?.tagName === 'TEXTAREA' ||
                         document.activeElement?.isContentEditable;
  
  if (isInputFocused) {
    // Escape SIEMPRE cierra modales, incluso en inputs
    if (e.key === 'Escape') {
      closeAllModals();
    }
    return;
  }
  
  switch(e.key) {
    case 'Escape':
      e.preventDefault();
      closeAllModals();
      // Cerrar chat si está abierto
      const chatPanel = document.getElementById('chat-panel');
      if (chatPanel?.classList.contains('open')) {
        toggleChat();
      }
      // Cerrar asistente virtual si está abierto
      const vaChat = document.getElementById('va-chat');
      if (vaChat?.classList.contains('va-open') && asistente) {
        asistente.cerrar();
      }
      break;
      
    case 'g':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // Ctrl+G: Ir a Kanban
        nav(document.querySelector('[data-page=kanban]'), 'kanban');
      }
      break;
      
    case 'd':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // Ctrl+D: Ir a Dashboard
        nav(document.querySelector('[data-page=dashboard]'), 'dashboard');
      }
      break;
      
    case 'n':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // Ctrl+N: Nueva tarea
        openNewTask('todo');
      }
      break;
      
    case 'h':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // Ctrl+H: Abrir asistente virtual
        if (asistente) {
          asistente.abrir();
        }
      }
      break;
      
    case '?':
      // Mostrar ayuda de atajos
      showKeyboardShortcutsHelp();
      break;
  }
});

// Cerrar todos los modales abiertos
function closeAllModals() {
  document.querySelectorAll('.modal-over.open').forEach(m => m.classList.remove('open'));
  // También cerrar notificaciones si están abiertas
  const notifDropdown = document.getElementById('notif-dropdown');
  if (notifDropdown) notifDropdown.style.display = 'none';
}

// Mostrar ayuda de atajos de teclado
function showKeyboardShortcutsHelp() {
  const shortcuts = [
    { key: 'Tab', desc: 'Navegar entre elementos' },
    { key: 'Shift + Tab', desc: 'Navegar hacia atrás' },
    { key: 'Enter / Space', desc: 'Activar botón/enlace' },
    { key: 'Escape', desc: 'Cerrar ventanas/modales' },
    { key: '← →', desc: 'Mover tarea en Kanban' },
    { key: 'Ctrl + G', desc: 'Ir a Kanban' },
    { key: 'Ctrl + D', desc: 'Ir a Dashboard' },
    { key: 'Ctrl + N', desc: 'Nueva tarea' },
    { key: 'Ctrl + H', desc: 'Abrir asistente virtual' },
    { key: 'Delete', desc: 'Eliminar tarea seleccionada' },
    { key: '?', desc: 'Mostrar esta ayuda' }
  ];
  
  const helpHtml = `
    <div class="modal-over open" id="m-shortcuts" onclick="if(event.target===this)closeM('m-shortcuts')">
      <div class="modal" style="max-width:500px">
        <div class="modal-hdr">
          <h3>⌨️ Atajos de Teclado</h3>
          <button class="modal-x" onclick="closeM('m-shortcuts')">✕</button>
        </div>
        <table class="tbl">
          <thead><tr><th>Tecla</th><th>Acción</th></tr></thead>
          <tbody>
            ${shortcuts.map(s => `
              <tr>
                <td style="font-family:var(--mono);font-size:.75rem;font-weight:700;padding:8px 12px">
                  <kbd style="background:var(--s2);padding:2px 6px;border-radius:4px;border:1px solid var(--bdr)">${s.key}</kbd>
                </td>
                <td style="font-size:.8rem;padding:8px 12px">${s.desc}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p style="font-size:.7rem;color:var(--t2);margin-top:12px;text-align:center">
          Presiona <kbd style="background:var(--s2);padding:1px 5px;border-radius:3px">?</kbd> en cualquier momento para ver esta ayuda
        </p>
      </div>
    </div>
  `;
  
  // Eliminar ayuda anterior si existe
  document.getElementById('m-shortcuts')?.remove();
  document.body.insertAdjacentHTML('beforeend', helpHtml);
}

