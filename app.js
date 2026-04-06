
import { firebaseAppConfig, ADMIN_EMAIL } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, getDocs, where } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const BUILD = { version: 'v25.0.0', datetime: '2026-04-06 21:37:51' };
let app, auth, db, currentUser = null, currentProfile = null, unsubs = [];
let analyticsCharts = [];
let deferredInstallPrompt = null;
const live = { users: [], projects: [], schedule: [], approvals: [], finance: [], analytics: [], settings: {} };

const byId = id => document.getElementById(id);
const money = v => new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(Number(v||0));
const fmtDate = d => !d ? 'Sem data' : d.split('-').reverse().join('/');
const itemHtml = (t,s) => `<div class="item"><div class="item-title">${t}</div><div class="item-sub">${s}</div></div>`;
const metricCard = (l,v) => `<article class="metric-card glass"><span>${l}</span><strong>${v}</strong></article>`;

function setAuthMessage(text, danger=false){
  const el = byId('authMessage');
  el.textContent = text || '';
  el.style.color = danger ? '#ff9aa8' : '#aebad4';
}
function daysUntil(d){
  if(!d) return 9999;
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((new Date(d+'T00:00:00') - t) / 86400000);
}
function isAdmin(){ return currentProfile?.role === 'admin'; }
function profileByUid(uid){ return live.users.find(u => u.uid === uid) || null; }
function projectById(id){ return live.projects.find(p => p.id === id) || null; }
function visibleProjects(){ return isAdmin() ? live.projects : live.projects.filter(p => p.artistUid === currentUser?.uid); }
function projectApprovals(id){ return live.approvals.filter(a => a.projectId === id); }
function projectSchedule(id){ return live.schedule.filter(s => s.projectId === id); }
function projectFinance(id){ return live.finance.filter(f => f.projectId === id); }
function projectProfit(id){ return projectFinance(id).reduce((a,i) => a + (i.type==='Entrada' ? Number(i.value||0) : -Number(i.value||0)), 0); }
function checklistComplete(p){ return Object.values(p.pipeline || {}).every(Boolean); }
function projectStatus(p){
  const d = daysUntil(p.releaseDate);
  if(d < 0) return 'ATRASADO';
  if(d <= 7 && !checklistComplete(p)) return 'EM RISCO';
  if(checklistComplete(p)) return 'PRONTO';
  return 'EM PRODUÇÃO';
}
function statusClass(s){
  if(s==='PRONTO') return 'status-pronto';
  if(s==='EM RISCO') return 'status-risco';
  if(s==='ATRASADO') return 'status-atrasado';
  return 'status-producao';
}
function priorityScore(p){
  const d = daysUntil(p.releaseDate);
  let s = 0;
  if(projectStatus(p)==='ATRASADO') s += 100;
  if(projectStatus(p)==='EM RISCO') s += 60;
  if(!checklistComplete(p)) s += 25;
  if(p.contractStatus !== 'Assinado') s += 10;
  s += Math.max(0, 30 - Math.max(d, 0));
  s += projectApprovals(p.id).filter(a => a.status === 'Pendente').length * 8;
  return s;
}
function monthlyNet(){
  const ym = new Date().toISOString().slice(0,7);
  return live.finance.filter(i => (i.date||'').slice(0,7)===ym)
    .reduce((a,i) => a + (i.type==='Entrada' ? Number(i.value||0) : -Number(i.value||0)), 0);
}
function collectAlerts(projects){
  const alerts = [];
  projects.forEach(p => {
    const d = daysUntil(p.releaseDate);
    if(d < 0) alerts.push({title:'Projeto atrasado', text:`${profileByUid(p.artistUid)?.stageName || profileByUid(p.artistUid)?.name || 'Artista'} — ${p.title}`});
    if(d <= 5 && d >= 0) alerts.push({title:'Lançamento próximo', text:`${p.title} lança em ${d} dia(s).`});
    if(!checklistComplete(p)) alerts.push({title:'Checklist incompleto', text:`${p.title} ainda não concluiu todas as etapas.`});
    if(p.contractStatus !== 'Assinado') alerts.push({title:'Contrato pendente', text:`${p.title} está com contrato ${String(p.contractStatus||'').toLowerCase()}.`});
  });
  return alerts.slice(0, 12);
}
function recommendation(projects){
  const monthly = monthlyNet(), goal = Number(live.settings.monthlyGoal || 0);
  if(!projects.length) return 'Cadastre artistas e projetos para começar a operação.';
  if(monthly < 0) return 'Revise custos e priorize projetos com melhor margem.';
  if(goal > 0 && monthly < goal) return 'Foque em concluir lançamentos próximos e fechar novos contratos.';
  return 'Continue escalando os projetos prontos e fortaleça o pós-lançamento.';
}
function projectCalendarLink(project){
  const s = (project.releaseDate || '').replaceAll('-', '');
  const text = encodeURIComponent(`Lançamento - ${project.title}`);
  const details = encodeURIComponent(`Artista: ${profileByUid(project.artistUid)?.stageName || profileByUid(project.artistUid)?.name || ''}\nProjeto: ${project.title}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${s}/${s}&details=${details}`;
}

function showView(v){
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  byId('view-' + v).classList.add('active');
  byId('pageTitle').textContent = document.querySelector(`#navMenu button[data-view="${v}"]`)?.textContent || 'Dashboard';
}
function buildNav(){
  const items = isAdmin()
    ? [['dashboard','Dashboard'],['operacao','Operação'],['projetos','Projetos'],['artistas','Artistas'],['cronograma','Cronograma'],['aprovacoes','Aprovações'],['financeiro','Financeiro'],['analytics','Analytics'],['portal','Portal do artista'],['alertas','Alertas'],['integracoes','Integrações']]
    : [['dashboard','Dashboard'],['portal','Meu portal'],['analytics','Analytics'],['alertas','Alertas']];
  byId('navMenu').innerHTML = items.map((i,n) => `<button class="${n===0?'active':''}" data-view="${i[0]}">${i[1]}</button>`).join('');
  document.querySelectorAll('#navMenu button').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('#navMenu button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showView(btn.dataset.view);
  });
  showView(items[0][0]);
}
function updateRoleUI(){
  document.querySelectorAll('.admin-only,.admin-only-block').forEach(el => el.classList.toggle('hidden', !isAdmin()));
  byId('sessionInfo').textContent = `${isAdmin() ? 'Admin' : 'Artista'} · ${currentProfile?.stageName || currentProfile?.name || currentUser?.email || ''}`;
}
function showApp(logged){
  byId('authScreen').classList.toggle('hidden', logged);
  byId('appShell').classList.toggle('hidden', !logged);
  if(logged){ updateRoleUI(); buildNav(); renderAll(); }
}


function projectAnalytics(projectId){ return live.analytics.filter(a => a.projectId === projectId); }

function destroyAnalyticsCharts(){
  analyticsCharts.forEach(chart => { try { chart.destroy(); } catch(e) {} });
  analyticsCharts = [];
}

function parseNumberCsv(value){
  if (!value || !String(value).trim()) return [];
  return String(value).split(',').map(v => Number(String(v).trim().replace(',', '.')) || 0);
}
function parseLabelCsv(value){
  if (!value || !String(value).trim()) return [];
  return String(value).split(',').map(v => String(v).trim()).filter(Boolean);
}
function parseCountriesLines(value){
  if (!value || !String(value).trim()) return [];
  return String(value).split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split('|').map(p => p.trim());
    return {
      country: parts[0] || '',
      listeners: Number(parts[1] || 0),
      activePct: Number(parts[2] || 0),
      activeListeners: Number(parts[3] || 0)
    };
  });
}

function parseJsonSafe(value, fallback){
  if (!value || !String(value).trim()) return fallback;
  try { return JSON.parse(value); } catch(e) { return fallback; }
}
function normalizeAnalyticsRow(a){
  return {
    ...a,
    listeners: Number(a.listeners || 0),
    monthlyActiveListeners: Number(a.monthlyActiveListeners || 0),
    streams: Number(a.streams || 0),
    streamsPerListener: Number(a.streamsPerListener || 0),
    saves: Number(a.saves || 0),
    playlists: Number(a.playlists || 0),
    followers: Number(a.followers || 0),
    views: Number(a.views || 0),
    reach: Number(a.reach || 0),
    totalAudience: Number(a.totalAudience || 0),
    reactivatedListeners: Number(a.reactivatedListeners || 0),
    newActiveListeners: Number(a.newActiveListeners || 0),
    newListeners: Number(a.newListeners || 0),
    segmentMonthlyActive: Number(a.segmentMonthlyActive || 0),
    segmentPreviouslyActive: Number(a.segmentPreviouslyActive || 0),
    segmentProgrammed: Number(a.segmentProgrammed || 0),
    genderFemale: Number(a.genderFemale || 0),
    genderMale: Number(a.genderMale || 0),
    genderNonBinary: Number(a.genderNonBinary || 0),
    genderNotSpecified: Number(a.genderNotSpecified || 0),
    ageUnder18: Number(a.ageUnder18 || 0),
    age18_24: Number(a.age18_24 || 0),
    age25_34: Number(a.age25_34 || 0),
    age35_44: Number(a.age35_44 || 0),
    age45_54: Number(a.age45_54 || 0),
    age55_64: Number(a.age55_64 || 0),
    age65Plus: Number(a.age65Plus || 0),
    countries: Array.isArray(a.countries) ? a.countries : [],
    overviewTrend: Array.isArray(a.overviewTrend) ? a.overviewTrend : [],
    audienceTrend: typeof a.audienceTrend === 'object' && a.audienceTrend ? a.audienceTrend : { labels: [], totalAudience: [], monthlyActive: [], previouslyActive: [], programmed: [] }
  };
}
function initAnalyticsInteractions(rows){
  document.querySelectorAll('.analytics-tab').forEach(btn => {
    btn.onclick = () => {
      const shell = btn.closest('.analytics-shell');
      shell.querySelectorAll('.analytics-tab').forEach(b => b.classList.remove('active'));
      shell.querySelectorAll('.analytics-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      shell.querySelector(`[data-panel="${btn.dataset.target}"]`)?.classList.add('active');
    };
  });

  if (typeof Chart === 'undefined') return;
  destroyAnalyticsCharts();

  rows.forEach(raw => {
    const a = normalizeAnalyticsRow(raw);
    const id = a.id;

    const overviewCanvas = byId(`overviewChart_${id}`);
    if (overviewCanvas) {
      const values = a.overviewTrend.length ? a.overviewTrend : [a.listeners, a.listeners, a.listeners, a.listeners];
      const labels = values.map((_, i) => `P${i+1}`);
      analyticsCharts.push(new Chart(overviewCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Listeners',
            data: values,
            borderColor: '#8aa8ff',
            backgroundColor: 'rgba(138,168,255,.20)',
            tension: .35,
            fill: true,
            pointRadius: 0,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#b6c4e6' }, grid: { color: 'rgba(255,255,255,.05)' } },
            y: { ticks: { color: '#b6c4e6' }, grid: { color: 'rgba(255,255,255,.05)' }, beginAtZero: true }
          }
        }
      }));
    }

    const segmentCanvas = byId(`segmentChart_${id}`);
    if (segmentCanvas) {
      analyticsCharts.push(new Chart(segmentCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Monthly active', 'Previously active', 'Programmed'],
          datasets: [{
            data: [a.segmentMonthlyActive, a.segmentPreviouslyActive, a.segmentProgrammed],
            backgroundColor: ['#1f6fe0', '#b340f4', '#4e9b88'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: { legend: { labels: { color: '#d6e0f5' } } }
        }
      }));
    }

    const audienceCanvas = byId(`audienceTrendChart_${id}`);
    if (audienceCanvas) {
      const tr = a.audienceTrend;
      const labels = Array.isArray(tr.labels) && tr.labels.length ? tr.labels : ['Período'];
      analyticsCharts.push(new Chart(audienceCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Total audience', data: Array.isArray(tr.totalAudience) && tr.totalAudience.length ? tr.totalAudience : [a.totalAudience], borderColor: '#111111', backgroundColor: 'transparent', tension: .3, pointRadius: 0, borderWidth: 2 },
            { label: 'Monthly active', data: Array.isArray(tr.monthlyActive) && tr.monthlyActive.length ? tr.monthlyActive : [a.monthlyActiveListeners], borderColor: '#1f6fe0', backgroundColor: 'transparent', tension: .3, pointRadius: 0, borderWidth: 2 },
            { label: 'Previously active', data: Array.isArray(tr.previouslyActive) && tr.previouslyActive.length ? tr.previouslyActive : [a.segmentPreviouslyActive], borderColor: '#b340f4', backgroundColor: 'transparent', tension: .3, pointRadius: 0, borderWidth: 2 },
            { label: 'Programmed', data: Array.isArray(tr.programmed) && tr.programmed.length ? tr.programmed : [a.segmentProgrammed], borderColor: '#4e9b88', backgroundColor: 'transparent', tension: .3, pointRadius: 0, borderWidth: 2 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#d6e0f5' } } },
          scales: {
            x: { ticks: { color: '#b6c4e6' }, grid: { color: 'rgba(255,255,255,.05)' } },
            y: { ticks: { color: '#b6c4e6' }, grid: { color: 'rgba(255,255,255,.05)' }, beginAtZero: true }
          }
        }
      }));
    }

    const genderCanvas = byId(`genderChart_${id}`);
    if (genderCanvas) {
      analyticsCharts.push(new Chart(genderCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Female', 'Male', 'Non-binary', 'Not specified'],
          datasets: [{
            data: [a.genderFemale, a.genderMale, a.genderNonBinary, a.genderNotSpecified],
            backgroundColor: ['#1f6fe0', '#e1158f', '#18b38c', '#ff5a3d'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '64%',
          plugins: { legend: { labels: { color: '#d6e0f5' } } }
        }
      }));
    }

    const ageCanvas = byId(`ageChart_${id}`);
    if (ageCanvas) {
      analyticsCharts.push(new Chart(ageCanvas, {
        type: 'bar',
        data: {
          labels: ['<18', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'],
          datasets: [{
            label: 'Faixa etária %',
            data: [a.ageUnder18, a.age18_24, a.age25_34, a.age35_44, a.age45_54, a.age55_64, a.age65Plus],
            backgroundColor: ['#8aa8ff', '#8aa8ff', '#c08bff', '#8aa8ff', '#8aa8ff', '#8aa8ff', '#8aa8ff'],
            borderRadius: 10,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#b6c4e6' }, grid: { display: false } },
            y: { ticks: { color: '#b6c4e6' }, grid: { color: 'rgba(255,255,255,.05)' }, beginAtZero: true, max: 100 }
          }
        }
      }));
    }
  });
}

function latestAnalytics(projectId){
  const rows = [...projectAnalytics(projectId)].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  return rows[0] || null;
}
function riskReasons(project){
  const reasons = [];
  const d = daysUntil(project.releaseDate);
  if (d < 0) reasons.push('Lançamento vencido');
  if (d <= 7 && d >= 0) reasons.push('Lançamento em até 7 dias');
  if (!checklistComplete(project)) reasons.push('Checklist incompleto');
  if (project.contractStatus !== 'Assinado') reasons.push('Contrato pendente');
  if (projectApprovals(project.id).some(a => a.status === 'Pendente')) reasons.push('Aprovação pendente');
  if (projectSchedule(project.id).some(s => s.status !== 'Publicado' && daysUntil(s.date) <= 2)) reasons.push('Cronograma crítico');
  return reasons;
}

function renderDashboard(){
  const projects = visibleProjects();
  const alerts = collectAlerts(projects);
  const top = [...projects].sort((a,b)=>priorityScore(b)-priorityScore(a)).slice(0,6);
  const urgent = projects.filter(p => daysUntil(p.releaseDate) <= 7).length;
  byId('view-dashboard').innerHTML = `
    <div class="dashboard-grid">
      ${metricCard('Projetos', projects.length)}
      ${metricCard('Em risco', projects.filter(p=>projectStatus(p)==='EM RISCO').length)}
      ${metricCard('Urgentes 7 dias', urgent)}
      ${metricCard('Lucro do mês', money(monthlyNet()))}
    </div>
    <div class="two-col">
      <article class="panel glass">
        <div class="section-head"><h3>Prioridade operacional</h3><span class="tag">urgência real</span></div>
        <div class="stack">
          ${top.length ? top.map(p => itemHtml(`${profileByUid(p.artistUid)?.stageName || profileByUid(p.artistUid)?.name || 'Artista'} — ${p.title}`, `Prioridade ${priorityScore(p)} · ${projectStatus(p)} · lançamento ${fmtDate(p.releaseDate)}`)).join('') : itemHtml('Sem projetos', 'Cadastre projetos para gerar prioridade automática.')}
        </div>
      </article>
      <article class="panel glass">
        <div class="section-head"><h3>Alertas inteligentes</h3><span class="tag">online</span></div>
        <div class="stack">
          ${alerts.length ? alerts.map(a => itemHtml(a.title, a.text)).join('') : itemHtml('Sem alertas críticos', 'Tudo sob controle no momento.')}
        </div>
      </article>
    </div>`;
}
function renderArtists(){
  if(!isAdmin()) return;
  const artists = live.users.filter(u => u.role === 'artist');
  byId('artistList').innerHTML = artists.length
    ? artists.map(a => itemHtml(`${a.stageName || a.name || 'Artista'} · ${a.email || 'sem e-mail'}`, a.notes || 'Sem observações')).join('')
    : itemHtml('Nenhum artista cadastrado', 'O artista precisa criar conta e depois ser vinculado aqui.');
}
function renderProjects(){
  const list = byId('projectList');
  const term = (byId('projectSearch').value || '').trim().toLowerCase();
  const tpl = byId('projectTemplate');
  const projects = [...visibleProjects()].filter(p => `${profileByUid(p.artistUid)?.stageName || ''} ${p.title}`.toLowerCase().includes(term)).sort((a,b)=>priorityScore(b)-priorityScore(a));
  if(!projects.length){ list.innerHTML = itemHtml('Nenhum projeto encontrado', 'Cadastre um projeto ou refine a busca.'); return; }
  list.innerHTML = '';
  projects.forEach(p => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const artist = profileByUid(p.artistUid), status = projectStatus(p);
    node.querySelector('.project-title').textContent = `${artist?.stageName || artist?.name || 'Artista'} — ${p.title}`;
    node.querySelector('.project-meta').textContent = `${p.type} · contrato ${p.contractStatus} · prioridade ${priorityScore(p)}`;
    const badge = node.querySelector('.status-badge');
    badge.textContent = status; badge.classList.add(statusClass(status));
    node.querySelector('.project-stats').innerHTML = `Lançamento: <strong>${fmtDate(p.releaseDate)}</strong><br>Valor contratado: <strong>${money(p.value||0)}</strong> · Lucro: <strong>${money(projectProfit(p.id))}</strong><br>Aprovações: <strong>${projectApprovals(p.id).length}</strong> · Cronograma: <strong>${projectSchedule(p.id).length}</strong>`;
    node.querySelector('.mini-grid').innerHTML = [
      ['Briefing', p.pipeline.briefing],
      ['Contrato', p.pipeline.contract],
      ['Gravação', p.pipeline.recording],
      ['Arte', p.pipeline.art],
      ['Distribuição', p.pipeline.distribution]
    ].map(i => `<div class="mini-box">${i[0]}<strong>${i[1] ? 'OK' : 'Pendente'}</strong></div>`).join('');
    const actions = node.querySelector('.project-actions');
    if(isAdmin()){
      actions.innerHTML = `<button class="secondary btn-remarca">Remarcar</button><button class="secondary btn-evento">Registrar evento</button><button class="secondary btn-contrato">Contrato</button><button class="secondary btn-calendar">Calendar</button><button class="btn-launch">${checklistComplete(p)?'Confirmar lançamento':'Lançamento bloqueado'}</button><button class="danger btn-delete">Excluir</button>`;
      actions.querySelector('.btn-remarca').onclick = () => remarkProject(p.id);
      actions.querySelector('.btn-evento').onclick = () => addManualHistory(p.id);
      actions.querySelector('.btn-contrato').onclick = () => p.contractLink ? window.open(p.contractLink, '_blank') : alert('Sem link de contrato.');
      actions.querySelector('.btn-calendar').onclick = () => window.open(projectCalendarLink(p), '_blank');
      const launch = actions.querySelector('.btn-launch');
      if(!checklistComplete(p)){ launch.disabled = true; launch.classList.add('secondary'); }
      else launch.onclick = () => confirmRelease(p.id);
      actions.querySelector('.btn-delete').onclick = () => removeDocGeneric('projects', p.id);
    } else {
      actions.innerHTML = `<button class="secondary btn-contrato">Contrato</button><button class="secondary btn-calendar">Calendar</button>`;
      actions.querySelector('.btn-contrato').onclick = () => p.contractLink ? window.open(p.contractLink, '_blank') : alert('Sem link de contrato.');
      actions.querySelector('.btn-calendar').onclick = () => window.open(projectCalendarLink(p), '_blank');
    }
    node.querySelector('.history-list').innerHTML = (p.history || []).slice(0,4).map(h => `<div class="history-row">${new Date(h.ts).toLocaleString('pt-BR')} · ${h.text}</div>`).join('');
    list.appendChild(node);
  });
}
function renderSchedule(){
  const items = live.schedule.filter(i => visibleProjects().some(p => p.id === i.projectId));
  byId('scheduleList').innerHTML = items.length
    ? items.sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(i => {
        const p = projectById(i.projectId);
        return itemHtml(`${fmtDate(i.date)} · ${i.type} · ${i.status}`, `${profileByUid(p?.artistUid)?.stageName || profileByUid(p?.artistUid)?.name || 'Artista'} — ${p?.title || ''}${i.notes ? ' · ' + i.notes : ''}`);
      }).join('')
    : itemHtml('Sem cronograma', 'Cadastre cronograma editorial e operacional.');
}
function renderApprovals(){
  const items = live.approvals.filter(i => visibleProjects().some(p => p.id === i.projectId));
  byId('approvalList').innerHTML = items.length
    ? items.map(i => {
        const p = projectById(i.projectId);
        return itemHtml(`${i.type} · ${i.status}`, `${profileByUid(p?.artistUid)?.stageName || profileByUid(p?.artistUid)?.name || 'Artista'} — ${p?.title || ''}${i.link ? ' · link disponível' : ''}${i.notes ? ' · ' + i.notes : ''}`);
      }).join('')
    : itemHtml('Sem aprovações', 'Cadastre aprovações de capa, release, cronograma e master.');
}
function renderFinance(){
  const items = live.finance.filter(i => visibleProjects().some(p => p.id === i.projectId));
  byId('financeList').innerHTML = items.length
    ? items.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(i => {
        const p = projectById(i.projectId);
        return itemHtml(`${i.type} · ${money(i.value)}`, `${profileByUid(p?.artistUid)?.stageName || profileByUid(p?.artistUid)?.name || 'Artista'} — ${p?.title || ''} · ${fmtDate(i.date)}${i.notes ? ' · ' + i.notes : ''}`);
      }).join('')
    : itemHtml('Sem dados financeiros', 'Cadastre entradas e saídas por projeto.');
}
function renderPortal(){
  const projects = visibleProjects();
  byId('portalProjects').innerHTML = projects.length
    ? projects.map(p => {
        const la = latestAnalytics(p.id);
        const analyticsText = la ? `<div class="portal-highlight">Último analytics · ${fmtDate(la.date)} · listeners ${Number(la.listeners||0).toLocaleString('pt-BR')} · streams ${Number(la.streams||0).toLocaleString('pt-BR')} · followers ${Number(la.followers||0).toLocaleString('pt-BR')}</div>` : '';
        return `<div class="item">
          <div class="item-title">${profileByUid(p.artistUid)?.stageName || profileByUid(p.artistUid)?.name || 'Artista'} — ${p.title}</div>
          <div class="item-sub">Status ${projectStatus(p)} · lançamento ${fmtDate(p.releaseDate)} · contrato ${p.contractStatus}</div>
          ${analyticsText}
        </div>`;
      }).join('')
    : itemHtml('Nenhum projeto disponível', 'Quando houver projetos vinculados, eles aparecerão aqui.');
  const approvals = live.approvals.filter(a => projects.some(p => p.id === a.projectId));
  byId('portalApprovals').innerHTML = approvals.length
    ? approvals.map(i => { const p = projectById(i.projectId); return itemHtml(`${i.type} · ${i.status}`, `${p?.title || ''}${i.notes ? ' · ' + i.notes : ''}`); }).join('')
    : itemHtml('Sem aprovações', 'Aqui aparecem itens de aprovação para acompanhamento.');
}
function renderAlerts(){
  const projects = visibleProjects();
  const a = collectAlerts(projects);
  byId('alertList').innerHTML = a.length ? a.map(i => itemHtml(i.title, i.text)).join('') : itemHtml('Sem alertas', 'Nenhum alerta crítico no momento.');
  byId('recommendationList').innerHTML = itemHtml('Recomendação principal', recommendation(projects));
}

function renderOperations(){
  if(!isAdmin()) return;
  const projects = [...visibleProjects()].sort((a,b)=>priorityScore(b)-priorityScore(a));
  const urgentRows = projects.filter(p => priorityScore(p) > 20).slice(0,10);
  byId('operationsList').innerHTML = urgentRows.length
    ? urgentRows.map(p => itemHtml(
        `${profileByUid(p.artistUid)?.stageName || profileByUid(p.artistUid)?.name || 'Artista'} — ${p.title}`,
        `Prioridade ${priorityScore(p)} · ${riskReasons(p).join(' · ')}`
      )).join('')
    : itemHtml('Sem urgências críticas', 'Nenhum projeto exige ação imediata.');

  byId('riskChecklistList').innerHTML = projects.length
    ? projects.slice(0,10).map(p => {
        const reasons = riskReasons(p);
        return itemHtml(
          `${p.title} · ${fmtDate(p.releaseDate)}`,
          reasons.length ? reasons.join(' · ') : 'Sem riscos relevantes'
        );
      }).join('')
    : itemHtml('Sem projetos', 'Cadastre projetos para acompanhar risco.');
}

function renderAnalytics(){
  const projects = visibleProjects();
  const rows = live.analytics
    .filter(a => projects.some(p => p.id === a.projectId))
    .sort((a,b)=>(String(b.date||'').localeCompare(String(a.date||''))));

  byId('analyticsList').innerHTML = rows.length
    ? rows.map(raw => {
        const a = normalizeAnalyticsRow(raw);
        const p = projectById(a.projectId);
        const artistName = profileByUid(p?.artistUid)?.stageName || profileByUid(p?.artistUid)?.name || 'Artista';
        const countries = a.countries.length
          ? a.countries.map(c => `<div class="analytics-country-row"><strong>${c.country || '-'}</strong><span>${Number(c.listeners||0).toLocaleString('pt-BR')} listeners</span><span>${Number(c.activePct||0).toLocaleString('pt-BR')}% ativos</span><span>${Number(c.activeListeners||0).toLocaleString('pt-BR')} ativos</span></div>`).join('')
          : `<div class="analytics-empty">Sem países lançados neste relatório.</div>`;

        return `<div class="analytics-shell analytics-hero-card">
          <div class="analytics-top">
            <div>
              <div class="analytics-top-title">${artistName} — ${p?.title || ''}</div>
              <div class="analytics-top-sub">Relatório ${fmtDate(a.date)}${a.nextStep ? ' · próximo passo: ' + a.nextStep : ''}</div>
            </div>
            <div class="analytics-badge">${a.engagement ? 'engajamento ' + a.engagement : 'analytics manual'}</div>
          </div>

          <div class="analytics-tabs">
            <button class="analytics-tab active" data-target="overview_${a.id}">Overview</button>
            <button class="analytics-tab" data-target="segments_${a.id}">Segments</button>
            <button class="analytics-tab" data-target="demographics_${a.id}">Demographics</button>
            <button class="analytics-tab" data-target="location_${a.id}">Location</button>
          </div>

          <div class="analytics-panel active" data-panel="overview_${a.id}">
            <div class="analytics-overview-grid">
              <div class="analytics-stat"><span>Listeners</span><strong>${a.listeners.toLocaleString('pt-BR')}</strong></div>
              <div class="analytics-stat"><span>Monthly active</span><strong>${a.monthlyActiveListeners.toLocaleString('pt-BR')}</strong></div>
              <div class="analytics-stat"><span>Streams</span><strong>${a.streams.toLocaleString('pt-BR')}</strong></div>
              <div class="analytics-stat"><span>Streams / Listener</span><strong>${a.streamsPerListener.toLocaleString('pt-BR')}</strong></div>
              <div class="analytics-stat"><span>Saves</span><strong>${a.saves.toLocaleString('pt-BR')}</strong></div>
              <div class="analytics-stat"><span>Playlist adds</span><strong>${a.playlists.toLocaleString('pt-BR')}</strong></div>
              <div class="analytics-stat"><span>Followers</span><strong>${a.followers.toLocaleString('pt-BR')}</strong></div>
              <div class="analytics-stat"><span>Reach / Views</span><strong>${a.reach.toLocaleString('pt-BR')} / ${a.views.toLocaleString('pt-BR')}</strong></div>
            </div>
            <div class="analytics-chart-card">
              <canvas id="overviewChart_${a.id}"></canvas>
            </div>
            <div class="analytics-note">${a.notes || 'Sem resumo manual por enquanto.'}</div>
          </div>

          <div class="analytics-panel" data-panel="segments_${a.id}">
            <div class="analytics-split">
              <div class="analytics-chart-card">
                <canvas id="segmentChart_${a.id}"></canvas>
              </div>
              <div>
                <div class="analytics-mini-grid">
                  <div class="analytics-stat"><span>Total audience</span><strong>${a.totalAudience.toLocaleString('pt-BR')}</strong></div>
                  <div class="analytics-stat"><span>Reactivated</span><strong>${a.reactivatedListeners.toLocaleString('pt-BR')}</strong></div>
                  <div class="analytics-stat"><span>New active</span><strong>${a.newActiveListeners.toLocaleString('pt-BR')}</strong></div>
                  <div class="analytics-stat"><span>New listeners</span><strong>${a.newListeners.toLocaleString('pt-BR')}</strong></div>
                </div>
                <div class="analytics-note">Monthly active ${a.segmentMonthlyActive.toLocaleString('pt-BR')}% · Previously active ${a.segmentPreviouslyActive.toLocaleString('pt-BR')}% · Programmed ${a.segmentProgrammed.toLocaleString('pt-BR')}%</div>
              </div>
            </div>
            <div class="analytics-chart-card" style="margin-top:16px">
              <canvas id="audienceTrendChart_${a.id}"></canvas>
            </div>
          </div>

          <div class="analytics-panel" data-panel="demographics_${a.id}">
            <div class="analytics-split">
              <div class="analytics-chart-card">
                <canvas id="genderChart_${a.id}"></canvas>
              </div>
              <div class="analytics-chart-card">
                <canvas id="ageChart_${a.id}"></canvas>
              </div>
            </div>
          </div>

          <div class="analytics-panel" data-panel="location_${a.id}">
            <div class="analytics-countries">${countries}</div>
          </div>
        </div>`;
      }).join('')
    : `<div class="analytics-empty">${isAdmin() ? 'Lance o primeiro relatório manual.' : 'O produtor ainda não lançou dados de analytics.'}</div>`;

  if (byId('analyticsProject')) {
    byId('analyticsProject').innerHTML = live.projects.map(p => `<option value="${p.id}">${profileByUid(p.artistUid)?.stageName || profileByUid(p.artistUid)?.name || 'Artista'} — ${p.title}</option>`).join('');
  }

  initAnalyticsInteractions(rows);
}

function renderSettings(){
  if(!isAdmin()) return;
  byId('cfgGoal').value = live.settings.monthlyGoal || 0;
  byId('cfgFormInitial').value = live.settings.formInitial || '';
  byId('cfgFormContract').value = live.settings.formContract || '';
  byId('cfgCalendar').value = live.settings.calendar || '';
  byId('settingsStatus').innerHTML = [
    itemHtml('Banco online','Conectado ao Firebase Firestore'),
    itemHtml('Usuário atual', currentUser?.email || ''),
    itemHtml('Meta mensal', money(live.settings.monthlyGoal || 0)),
    itemHtml('Dias alerta lançamento', String(live.settings.releaseAlertDays || 7)),
    itemHtml('Google Form inicial', live.settings.formInitial ? 'Configurado' : 'Pendente'),
    itemHtml('Google Form contratual', live.settings.formContract ? 'Configurado' : 'Pendente'),
    itemHtml('Google Calendar', live.settings.calendar ? 'Configurado' : 'Pendente')
  ].join('');
}
function renderAll(){
  if(!currentUser) return;
  updateRoleUI();
  populateArtistForms();
  populateProjectSelects();
  renderDashboard();
  renderArtists();
  renderProjects();
  renderSchedule();
  renderApprovals();
  renderFinance();
  renderOperations();
  renderAnalytics();
  renderPortal();
  renderAlerts();
  renderSettings();
}

function populateArtistForms(){
  const artists = live.users.filter(u => u.role === 'artist');
  byId('projectArtist').innerHTML = artists.length ? artists.map(a => `<option value="${a.uid}">${a.stageName || a.name || a.email}</option>`).join('') : '<option value="">O artista precisa criar conta primeiro</option>';
  const nonLinked = live.users.filter(u => u.role === 'artist' && !u.stageName);
  byId('artistUserSelect').innerHTML = nonLinked.length ? nonLinked.map(a => `<option value="${a.uid}">${a.email || a.name || a.uid}</option>`).join('') : '<option value="">Sem contas novas para vincular</option>';
}
function populateProjectSelects(){
  const opts = live.projects.map(p => `<option value="${p.id}">${profileByUid(p.artistUid)?.stageName || profileByUid(p.artistUid)?.name || 'Artista'} — ${p.title}</option>`).join('');
  ['scheduleProject','approvalProject','financeProject','analyticsProject'].forEach(id => { const el = byId(id); if (el) el.innerHTML = opts; });
}

async function ensureUserProfile(user, name=''){
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, {
      uid: user.uid,
      role: user.email?.toLowerCase() === String(ADMIN_EMAIL || '').toLowerCase() ? 'admin' : 'artist',
      name: name || user.displayName || user.email || 'Usuário',
      stageName: '',
      email: user.email || '',
      notes: '',
      createdAt: serverTimestamp()
    });
  }
}
async function loadProfile(){
  const snap = await getDoc(doc(db, 'users', currentUser.uid));
  currentProfile = snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
function clearListeners(){ unsubs.forEach(fn => fn && fn()); unsubs = []; }
function listenCollection(coll, key){
  const q = query(collection(db, coll), orderBy('createdAt', 'desc'));
  const unsub = onSnapshot(q, snap => {
    live[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  });
  unsubs.push(unsub);
}
async function startData(){
  clearListeners();
  listenCollection('users', 'users');
  listenCollection('projects', 'projects');
  listenCollection('schedule', 'schedule');
  listenCollection('approvals', 'approvals');
  listenCollection('finance', 'finance');
  listenCollection('analytics', 'analytics');
  const settingsRef = doc(db, 'meta', 'settings');
  const snap = await getDoc(settingsRef);
  if(!snap.exists()) await setDoc(settingsRef, { monthlyGoal: 0, formInitial: '', formContract: '', calendar: '', updatedAt: serverTimestamp() });
  const unsub = onSnapshot(settingsRef, s => { live.settings = s.data() || {}; renderAll(); });
  unsubs.push(unsub);
}

async function appendHistory(id, text){
  const p = projectById(id);
  const history = Array.isArray(p?.history) ? [...p.history] : [];
  history.unshift({ ts: new Date().toISOString(), text });
  await updateDoc(doc(db, 'projects', id), { history });
}
async function remarkProject(id){
  const p = projectById(id);
  const next = prompt('Nova data de lançamento (AAAA-MM-DD):', p.releaseDate);
  if(!next || next === p.releaseDate) return;
  const reason = prompt('Motivo da remarcação:');
  if(!reason) return alert('Informe o motivo.');
  await updateDoc(doc(db, 'projects', id), { releaseDate: next });
  await appendHistory(id, `Remarcado de ${p.releaseDate} para ${next} · motivo: ${reason}`);
}
async function addManualHistory(id){
  const text = prompt('Descreva o evento a registrar:');
  if(!text) return;
  await appendHistory(id, text);
}
async function confirmRelease(id){
  const p = projectById(id);
  if(!checklistComplete(p)) return alert('Lançamento bloqueado: checklist incompleto.');
  if(!confirm(`Confirmar lançamento de ${p.title}?`)) return;
  const typed = prompt('Digite LANÇAR para concluir.');
  if(typed !== 'LANÇAR') return alert('Confirmação cancelada.');
  await updateDoc(doc(db, 'projects', id), { launched: true });
  await appendHistory(id, 'Lançamento confirmado com dupla validação');
}
async function removeDocGeneric(coll, id){
  if(!confirm('Tem certeza que deseja excluir este item?')) return;
  await deleteDoc(doc(db, coll, id));
}
async function exportJson(){
  const blob = new Blob([JSON.stringify({ build: BUILD, exportedAt: new Date().toISOString(), live }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vale-producao-crm-online-real.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function seedData(){
  if(!isAdmin()) return;
  if(live.projects.length && !confirm('Isso adicionará exemplos ao que já existe. Continuar?')) return;
  const artistSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'artist')));
  const first = artistSnap.docs[0];
  if(!first) return alert('Peça para pelo menos um artista criar conta primeiro e depois vincule em Artistas.');
  const artist = first.data();
  const ref = await addDoc(collection(db, 'projects'), {
    artistUid: artist.uid,
    title: 'Projeto Exemplo Online',
    type: 'Single',
    releaseDate: new Date(Date.now()+5*86400000).toISOString().slice(0,10),
    value: 1500,
    contractStatus: 'Enviado',
    contractLink: '',
    notes: 'Projeto exemplo salvo online.',
    launched: false,
    createdAt: serverTimestamp(),
    pipeline: { briefing: true, contract: true, preproduction: true, recording: true, mix: true, art: false, release: true, posts: false, distribution: false, review: false },
    history: [{ ts: new Date().toISOString(), text: 'Projeto criado via exemplo online' }]
  });
  await addDoc(collection(db, 'schedule'), { projectId: ref.id, type: 'Teaser', date: new Date(Date.now()+2*86400000).toISOString().slice(0,10), status: 'Pendente', notes: 'Teaser principal', createdAt: serverTimestamp() });
  await addDoc(collection(db, 'approvals'), { projectId: ref.id, type: 'Capa', status: 'Pendente', link: '', notes: 'Aguardando aprovação', createdAt: serverTimestamp() });
  await addDoc(collection(db, 'finance'), { projectId: ref.id, type: 'Entrada', value: 900, date: new Date().toISOString().slice(0,10), notes: 'Entrada exemplo', createdAt: serverTimestamp() });
}


function updateInstallButtonsVisibility(){
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  document.body.classList.toggle('is-standalone', standalone);
  ['btnInstallApp','sidebarInstallApp'].forEach(id => {
    const el = byId(id);
    if (!el) return;
    if (standalone) {
      el.style.display = 'none';
    } else {
      el.style.display = deferredInstallPrompt ? '' : '';
      el.disabled = false;
      el.title = '';
    }
  });
}
async function handleInstallApp(){
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone) return alert('O app já está instalado neste dispositivo.');
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      deferredInstallPrompt = null;
      updateInstallButtonsVisibility();
    }
    return;
  }
  alert('Se o botão de instalação nativa não aparecer, abra o menu do navegador e escolha "Instalar app" ou "Adicionar à tela inicial".');
}
function registerPwa(){
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    updateInstallButtonsVisibility();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButtonsVisibility();
  });
  updateInstallButtonsVisibility();
}

function bindTabs(){
  byId('tabLogin').onclick = () => {
    byId('tabLogin').classList.add('active');
    byId('tabSignup').classList.remove('active');
    byId('loginForm').classList.remove('hidden');
    byId('signupForm').classList.add('hidden');
    setAuthMessage('');
  };
  byId('tabSignup').onclick = () => {
    byId('tabSignup').classList.add('active');
    byId('tabLogin').classList.remove('active');
    byId('signupForm').classList.remove('hidden');
    byId('loginForm').classList.add('hidden');
    setAuthMessage('');
  };
}
function firebaseError(err){
  const code = err?.code || '';
  if(code.includes('invalid-credential')) return 'E-mail ou senha inválidos.';
  if(code.includes('email-already-in-use')) return 'Este e-mail já está em uso.';
  if(code.includes('weak-password')) return 'A senha é fraca.';
  if(code.includes('invalid-email')) return 'E-mail inválido.';
  return 'Não foi possível concluir a operação.';
}
function bindEvents(){
  bindTabs();

  byId('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      setAuthMessage('Entrando...');
      await signInWithEmailAndPassword(auth, byId('loginEmail').value.trim(), byId('loginPassword').value);
      setAuthMessage('');
    } catch(err) {
      setAuthMessage(firebaseError(err), true);
    }
  });

  byId('signupForm').addEventListener('submit', async e => {
    e.preventDefault();
    if(byId('signupPassword').value !== byId('signupPassword2').value) return setAuthMessage('As senhas não coincidem.', true);
    try {
      setAuthMessage('Criando conta...');
      const res = await createUserWithEmailAndPassword(auth, byId('signupEmail').value.trim(), byId('signupPassword').value);
      await ensureUserProfile(res.user, byId('signupName').value.trim());
      setAuthMessage('Conta criada com sucesso.');
    } catch(err) {
      setAuthMessage(firebaseError(err), true);
    }
  });

  byId('logoutBtn').addEventListener('click', async () => await signOut(auth));
  byId('projectSearch').addEventListener('input', renderProjects);
  byId('btnSeed').addEventListener('click', seedData);
  byId('btnExportJson').addEventListener('click', exportJson);

  byId('projectForm').addEventListener('submit', async e => {
    e.preventDefault();
    if(!isAdmin()) return;
    const artistUid = byId('projectArtist').value;
    if(!artistUid) return alert('O artista precisa criar conta primeiro.');
    await addDoc(collection(db, 'projects'), {
      artistUid,
      title: byId('projectTitle').value.trim(),
      type: byId('projectType').value,
      releaseDate: byId('projectReleaseDate').value,
      value: Number(byId('projectValue').value || 0),
      contractStatus: byId('projectContractStatus').value,
      contractLink: byId('projectContractLink').value.trim(),
      notes: byId('projectNotes').value.trim(),
      launched: false,
      createdAt: serverTimestamp(),
      pipeline: {
        briefing: byId('ckBriefing').checked,
        contract: byId('ckContrato').checked,
        preproduction: byId('ckPre').checked,
        recording: byId('ckGravacao').checked,
        mix: byId('ckMix').checked,
        art: byId('ckArte').checked,
        release: byId('ckRelease').checked,
        posts: byId('ckPosts').checked,
        distribution: byId('ckDistribuicao').checked,
        review: byId('ckRevisao').checked
      },
      history: [{ ts: new Date().toISOString(), text: 'Projeto criado' }]
    });
    e.target.reset();
  });

  byId('artistLinkForm').addEventListener('submit', async e => {
    e.preventDefault();
    if(!isAdmin()) return;
    const uid = byId('artistUserSelect').value;
    if(!uid) return alert('Sem contas novas para vincular.');
    await updateDoc(doc(db, 'users', uid), {
      stageName: byId('artistStageName').value.trim(),
      email: byId('artistEmail').value.trim(),
      goal: Number(byId('artistGoal').value || 0),
      notes: byId('artistNotes').value.trim()
    });
    e.target.reset();
  });

  byId('scheduleForm').addEventListener('submit', async e => {
    e.preventDefault();
    if(!isAdmin()) return;
    const projectId = byId('scheduleProject').value;
    await addDoc(collection(db, 'schedule'), {
      projectId,
      type: byId('scheduleType').value,
      date: byId('scheduleDate').value,
      status: byId('scheduleStatus').value,
      notes: byId('scheduleNotes').value.trim(),
      createdAt: serverTimestamp()
    });
    await appendHistory(projectId, `Cronograma: ${byId('scheduleType').value} · ${byId('scheduleStatus').value}`);
    e.target.reset();
  });

  byId('approvalForm').addEventListener('submit', async e => {
    e.preventDefault();
    if(!isAdmin()) return;
    const projectId = byId('approvalProject').value;
    await addDoc(collection(db, 'approvals'), {
      projectId,
      type: byId('approvalType').value,
      status: byId('approvalStatus').value,
      link: byId('approvalLink').value.trim(),
      notes: byId('approvalNotes').value.trim(),
      createdAt: serverTimestamp()
    });
    await appendHistory(projectId, `Aprovação: ${byId('approvalType').value} · ${byId('approvalStatus').value}`);
    e.target.reset();
  });

  byId('financeForm').addEventListener('submit', async e => {
    e.preventDefault();
    if(!isAdmin()) return;
    const projectId = byId('financeProject').value;
    const value = Number(byId('financeValue').value || 0);
    await addDoc(collection(db, 'finance'), {
      projectId,
      type: byId('financeType').value,
      value,
      date: byId('financeDate').value,
      notes: byId('financeNotes').value.trim(),
      createdAt: serverTimestamp()
    });
    await appendHistory(projectId, `Financeiro: ${byId('financeType').value} ${money(value)}`);
    e.target.reset();
  });


  byId('analyticsForm').addEventListener('submit', async e => {
    e.preventDefault();
    if(!isAdmin()) return;

    const overviewTrend = parseNumberCsv(byId('analyticsOverviewTrend').value);
    const audienceTrend = {
      labels: parseLabelCsv(byId('analyticsAudienceLabels').value),
      totalAudience: parseNumberCsv(byId('analyticsAudienceTotal').value),
      monthlyActive: parseNumberCsv(byId('analyticsAudienceMonthlyActive').value),
      previouslyActive: parseNumberCsv(byId('analyticsAudiencePreviouslyActive').value),
      programmed: parseNumberCsv(byId('analyticsAudienceProgrammed').value)
    };
    const countries = parseCountriesLines(byId('analyticsCountriesJson').value);

    await addDoc(collection(db, 'analytics'), {
      projectId: byId('analyticsProject').value,
      date: byId('analyticsDate').value,
      listeners: Number(byId('analyticsListeners').value || 0),
      monthlyActiveListeners: Number(byId('analyticsMonthlyActiveListeners').value || 0),
      streams: Number(byId('analyticsStreams').value || 0),
      streamsPerListener: Number(byId('analyticsStreamsPerListener').value || 0),
      saves: Number(byId('analyticsSaves').value || 0),
      playlists: Number(byId('analyticsPlaylists').value || 0),
      followers: Number(byId('analyticsFollowers').value || 0),
      views: Number(byId('analyticsViews').value || 0),
      reach: Number(byId('analyticsReach').value || 0),
      engagement: byId('analyticsEngagement').value.trim(),

      totalAudience: Number(byId('analyticsTotalAudience').value || 0),
      reactivatedListeners: Number(byId('analyticsReactivatedListeners').value || 0),
      newActiveListeners: Number(byId('analyticsNewActiveListeners').value || 0),
      newListeners: Number(byId('analyticsNewListeners').value || 0),
      segmentMonthlyActive: Number(byId('analyticsSegmentMonthlyActive').value || 0),
      segmentPreviouslyActive: Number(byId('analyticsSegmentPreviouslyActive').value || 0),
      segmentProgrammed: Number(byId('analyticsSegmentProgrammed').value || 0),

      genderFemale: Number(byId('analyticsGenderFemale').value || 0),
      genderMale: Number(byId('analyticsGenderMale').value || 0),
      genderNonBinary: Number(byId('analyticsGenderNonBinary').value || 0),
      genderNotSpecified: Number(byId('analyticsGenderNotSpecified').value || 0),

      ageUnder18: Number(byId('analyticsAgeUnder18').value || 0),
      age18_24: Number(byId('analyticsAge18_24').value || 0),
      age25_34: Number(byId('analyticsAge25_34').value || 0),
      age35_44: Number(byId('analyticsAge35_44').value || 0),
      age45_54: Number(byId('analyticsAge45_54').value || 0),
      age55_64: Number(byId('analyticsAge55_64').value || 0),
      age65Plus: Number(byId('analyticsAge65Plus').value || 0),

      overviewTrend,
      audienceTrend,
      countries,

      nextStep: byId('analyticsNextStep').value.trim(),
      notes: byId('analyticsNotes').value.trim(),
      createdAt: serverTimestamp()
    });
    e.target.reset();
  });

  byId('settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    if(!isAdmin()) return;
    await setDoc(doc(db, 'meta', 'settings'), {
      monthlyGoal: Number(byId('cfgGoal').value || 0),
      formInitial: byId('cfgFormInitial').value.trim(),
      formContract: byId('cfgFormContract').value.trim(),
      calendar: byId('cfgCalendar').value.trim(),
      releaseAlertDays: Number(live.settings.releaseAlertDays || 7),
      updatedAt: serverTimestamp()
    }, { merge: true });
    alert('Configurações salvas.');
  });
}

function initFirebase(){
  const empty = Object.values(firebaseAppConfig).some(v => !v || String(v).includes('PREENCHA_AQUI'));
  if(empty) {
    setAuthMessage('Preencha o arquivo firebase-config.js antes de usar online real.', true);
    return false;
  }
  app = initializeApp(firebaseAppConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  return true;
}

bindEvents();
registerPwa();
if(initFirebase()) {
  onAuthStateChanged(auth, async user => {
    if(!user) {
      currentUser = null;
      currentProfile = null;
      clearListeners();
      showApp(false);
      return;
    }
    currentUser = user;
    await ensureUserProfile(user);
    await loadProfile();
    await startData();
    showApp(true);
    setAuthMessage('');
  });
}
