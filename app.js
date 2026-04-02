
import { firebaseAppConfig, ADMIN_EMAIL } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, getDocs, where } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const BUILD = { version: 'v20.1.0', datetime: '2026-04-02 00:00:00' };
let app, auth, db, currentUser = null, currentProfile = null, unsubs = [];
const live = { users: [], projects: [], schedule: [], approvals: [], finance: [], analytics: [], settings: {} };
const LOCAL_REMINDER_KEY = 'vale_producao_notified_v2010';

const byId = id => document.getElementById(id);
const money = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
const fmtDate = d => !d ? 'Sem data' : d.split('-').reverse().join('/');
const itemHtml = (t, s) => `<div class="item"><div class="item-title">${t}</div><div class="item-sub">${s}</div></div>`;
const metricCard = (l, v) => `<article class="metric-card glass"><span>${l}</span><strong>${v}</strong></article>`;

function setAuthMessage(text, danger = false) {
  const el = byId('authMessage');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = danger ? '#ff9aa8' : '#aebad4';
}
function daysUntil(d) {
  if (!d) return 9999;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((new Date(d + 'T00:00:00') - t) / 86400000);
}
function isAdmin() { return currentProfile?.role === 'admin'; }
function profileByUid(uid) { return live.users.find(u => u.uid === uid) || null; }
function projectById(id) { return live.projects.find(p => p.id === id) || null; }
function visibleProjects() { return isAdmin() ? live.projects : live.projects.filter(p => p.artistUid === currentUser?.uid); }
function projectApprovals(id) { return live.approvals.filter(a => a.projectId === id); }
function projectSchedule(id) { return live.schedule.filter(s => s.projectId === id); }
function projectFinance(id) { return live.finance.filter(f => f.projectId === id); }
function projectAnalytics(id) { return live.analytics.filter(a => a.projectId === id); }
function projectProfit(id) { return projectFinance(id).reduce((a, i) => a + (i.type === 'Entrada' ? Number(i.value || 0) : -Number(i.value || 0)), 0); }
function checklistComplete(p) { return Object.values(p.pipeline || {}).every(Boolean); }
function alertDays() { return Number(live.settings.releaseAlertDays || 7); }
function projectStatus(p) {
  const d = daysUntil(p.releaseDate);
  if (d < 0) return 'ATRASADO';
  if (d <= alertDays() && !checklistComplete(p)) return 'EM RISCO';
  if (checklistComplete(p)) return 'PRONTO';
  return 'EM PRODUÇÃO';
}
function statusClass(s) {
  if (s === 'PRONTO') return 'status-pronto';
  if (s === 'EM RISCO') return 'status-risco';
  if (s === 'ATRASADO') return 'status-atrasado';
  return 'status-producao';
}
function priorityScore(p) {
  const d = daysUntil(p.releaseDate);
  let s = 0;
  if (projectStatus(p) === 'ATRASADO') s += 100;
  if (projectStatus(p) === 'EM RISCO') s += 60;
  if (!checklistComplete(p)) s += 25;
  if (p.contractStatus !== 'Assinado') s += 10;
  s += Math.max(0, 30 - Math.max(d, 0));
  s += projectApprovals(p.id).filter(a => a.status === 'Pendente').length * 8;
  s += projectSchedule(p.id).filter(i => i.status !== 'Publicado').length * 4;
  return s;
}
function monthlyNet() {
  const ym = new Date().toISOString().slice(0, 7);
  return live.finance
    .filter(i => (i.date || '').slice(0, 7) === ym)
    .reduce((a, i) => a + (i.type === 'Entrada' ? Number(i.value || 0) : -Number(i.value || 0)), 0);
}
function latestAnalytics(projectId) {
  return [...projectAnalytics(projectId)].sort((a, b) => String(b.createdAt?.seconds || 0).localeCompare(String(a.createdAt?.seconds || 0)))[0] || null;
}
function collectAlerts(projects) {
  const alerts = [];
  projects.forEach(p => {
    const d = daysUntil(p.releaseDate);
    if (d < 0) alerts.push({ title: 'Projeto atrasado', text: `${profileByUid(p.artistUid)?.stageName || profileByUid(p.artistUid)?.name || 'Artista'} — ${p.title}` });
    if (d <= alertDays() && d >= 0) alerts.push({ title: 'Lançamento próximo', text: `${p.title} lança em ${d} dia(s).` });
    if (!checklistComplete(p)) alerts.push({ title: 'Checklist incompleto', text: `${p.title} ainda não concluiu todas as etapas.` });
    if (p.contractStatus !== 'Assinado') alerts.push({ title: 'Contrato pendente', text: `${p.title} está com contrato ${String(p.contractStatus || '').toLowerCase()}.` });
  });
  return alerts.slice(0, 20);
}
function recommendation(projects) {
  const monthly = monthlyNet();
  const goal = Number(live.settings.monthlyGoal || 0);
  if (!projects.length) return 'Cadastre artistas e projetos para começar a operação.';
  if (monthly < 0) return 'Revise custos e priorize projetos com melhor margem.';
  if (goal > 0 && monthly < goal) return 'Foque em concluir lançamentos próximos e fechar novos contratos.';
  return 'Continue escalando os projetos prontos e fortaleça o pós-lançamento.';
}
function projectCalendarLink(project) {
  const start = (project.releaseDate || '').replaceAll('-', '');
  const endDate = new Date((project.releaseDate || '') + 'T00:00:00');
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString().slice(0, 10).replaceAll('-', '');
  const text = encodeURIComponent(`Lançamento - ${project.title}`);
  const details = encodeURIComponent(`Artista: ${profileByUid(project.artistUid)?.stageName || profileByUid(project.artistUid)?.name || ''}\nProjeto: ${project.title}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}`;
}
function buildIcs(project) {
  const dt = (project.releaseDate || '').replaceAll('-', '');
  const endDate = new Date((project.releaseDate || '') + 'T00:00:00');
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString().slice(0, 10).replaceAll('-', '');
  const title = `Lançamento - ${project.title}`;
  const desc = `Artista: ${profileByUid(project.artistUid)?.stageName || profileByUid(project.artistUid)?.name || ''}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vale Producao//CRM//PT-BR',
    'BEGIN:VEVENT',
    `UID:${project.id}@valeproducao`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z')}`,
    `DTSTART;VALUE=DATE:${dt}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${desc}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\n');
}
function downloadIcs(project) {
  const blob = new Blob([buildIcs(project)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function getReminderMemory() {
  try { return JSON.parse(localStorage.getItem(LOCAL_REMINDER_KEY) || '{}'); }
  catch { return {}; }
}
function setReminderMemory(data) { localStorage.setItem(LOCAL_REMINDER_KEY, JSON.stringify(data)); }
function updateNotificationStatus() {
  const el = byId('notificationStatus');
  if (!el || !('Notification' in window)) return;
  const map = { granted: 'Ativadas', denied: 'Bloqueadas pelo navegador', default: 'Ainda não permitido' };
  el.textContent = map[Notification.permission] || Notification.permission;
}
async function requestNotificationPermission() {
  if (!('Notification' in window)) return alert('Seu navegador não suporta notificações.');
  const result = await Notification.requestPermission();
  updateNotificationStatus();
  if (result === 'granted') alert('Notificações ativadas.');
}
function runReminderScan(manual = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    if (manual) alert('Ative as notificações do navegador primeiro.');
    return;
  }
  const memory = getReminderMemory();
  visibleProjects().forEach(project => {
    const key = `${project.id}_${project.releaseDate}`;
    const reasons = [];
    const d = daysUntil(project.releaseDate);
    if (d >= 0 && d <= alertDays()) reasons.push(`Lançamento em ${d} dia(s)`);
    if (!checklistComplete(project)) reasons.push('Checklist incompleto');
    if (project.contractStatus !== 'Assinado') reasons.push('Contrato pendente');
    if (!reasons.length || memory[key]) return;
    new Notification(`Vale Produção: ${project.title}`, { body: reasons.join(' · ') });
    memory[key] = new Date().toISOString();
  });
  setReminderMemory(memory);
  updateNotificationStatus();
  if (manual) alert('Verificação concluída.');
}

function showView(v) {
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  byId('view-' + v).classList.add('active');
  byId('pageTitle').textContent = document.querySelector(`#navMenu button[data-view="${v}"]`)?.textContent || 'Dashboard';
}
function buildNav() {
  const items = isAdmin()
    ? [['dashboard','Dashboard'],['projetos','Projetos'],['artistas','Artistas'],['cronograma','Cronograma'],['aprovacoes','Aprovações'],['financeiro','Financeiro'],['agenda','Agenda'],['calendario','Calendário'],['analytics','Analytics'],['portal','Portal do artista'],['alertas','Alertas'],['integracoes','Integrações']]
    : [['dashboard','Dashboard'],['agenda','Agenda'],['calendario','Calendário'],['portal','Meu portal'],['alertas','Alertas']];
  byId('navMenu').innerHTML = items.map((i, n) => `<button class="${n===0?'active':''}" data-view="${i[0]}">${i[1]}</button>`).join('');
  document.querySelectorAll('#navMenu button').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('#navMenu button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showView(btn.dataset.view);
  });
  showView(items[0][0]);
}
function updateRoleUI() {
  document.querySelectorAll('.admin-only,.admin-only-block').forEach(el => el.classList.toggle('hidden', !isAdmin()));
  byId('sessionInfo').textContent = `${isAdmin() ? 'Admin' : 'Artista'} · ${currentProfile?.stageName || currentProfile?.name || currentUser?.email || ''}`;
}
function showApp(logged) {
  byId('authScreen').classList.toggle('hidden', logged);
  byId('appShell').classList.toggle('hidden', !logged);
  if (logged) { updateRoleUI(); buildNav(); renderAll(); }
}

function renderDashboard() {
  const projects = visibleProjects();
  const alerts = collectAlerts(projects);
  const top = [...projects].sort((a,b) => priorityScore(b) - priorityScore(a)).slice(0, 6);
  const analytics = [...live.analytics]
    .filter(a => visibleProjects().some(p => p.id === a.projectId))
    .sort((a,b) => Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0))
    .slice(0, 4);

  byId('view-dashboard').innerHTML = `
    <div class="dashboard-grid">
      ${metricCard('Projetos', projects.length)}
      ${metricCard('Em risco', projects.filter(p => projectStatus(p)==='EM RISCO').length)}
      ${metricCard('Atrasados', projects.filter(p => projectStatus(p)==='ATRASADO').length)}
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
    </div>
    <div class="panel glass" style="margin-top:18px">
      <div class="section-head"><h3>Analytics manual</h3><span class="tag">lançado pelo admin</span></div>
      <div class="stack" id="dashboardAnalyticsList">
        ${analytics.length ? analytics.map(a => {
          const p = projectById(a.projectId);
          return itemHtml(`${profileByUid(p?.artistUid)?.stageName || 'Artista'} — ${p?.title || 'Projeto'} · ${a.platform}`, `Período ${a.period} · streams/views ${Number(a.streams || 0).toLocaleString('pt-BR')} · alcance ${Number(a.reach || 0).toLocaleString('pt-BR')} · playlists ${Number(a.playlists || 0).toLocaleString('pt-BR')} · resumo: ${a.summary || 'Sem resumo'}`);
        }).join('') : itemHtml('Sem analytics manuais', 'O admin pode lançar resultados manualmente e eles aparecem aqui.')}
      </div>
    </div>`;
}
function renderArtists() {
  if (!isAdmin()) return;
  const artists = live.users.filter(u => u.role === 'artist');
  byId('artistList').innerHTML = artists.length
    ? artists.map(a => itemHtml(`${a.stageName || a.name || 'Artista'} · ${a.email || 'sem e-mail'}`, a.notes || 'Sem observações')).join('')
    : itemHtml('Nenhum artista cadastrado', 'O artista precisa criar conta e depois ser vinculado aqui.');
}
function renderProjects() {
  const list = byId('projectList');
  const term = (byId('projectSearch').value || '').trim().toLowerCase();
  const tpl = byId('projectTemplate');
  const projects = [...visibleProjects()]
    .filter(p => `${profileByUid(p.artistUid)?.stageName || ''} ${p.title}`.toLowerCase().includes(term))
    .sort((a,b) => priorityScore(b) - priorityScore(a));
  if (!projects.length) { list.innerHTML = itemHtml('Nenhum projeto encontrado', 'Cadastre um projeto ou refine a busca.'); return; }
  list.innerHTML = '';
  projects.forEach(p => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const artist = profileByUid(p.artistUid), status = projectStatus(p);
    node.querySelector('.project-title').textContent = `${artist?.stageName || artist?.name || 'Artista'} — ${p.title}`;
    node.querySelector('.project-meta').textContent = `${p.type} · contrato ${p.contractStatus} · prioridade ${priorityScore(p)}`;
    const badge = node.querySelector('.status-badge');
    badge.textContent = status;
    badge.classList.add(statusClass(status));
    const lastA = latestAnalytics(p.id);
    node.querySelector('.project-stats').innerHTML =
      `Lançamento: <strong>${fmtDate(p.releaseDate)}</strong><br>` +
      `Valor contratado: <strong>${money(p.value||0)}</strong> · Lucro: <strong>${money(projectProfit(p.id))}</strong><br>` +
      `Aprovações: <strong>${projectApprovals(p.id).length}</strong> · Cronograma: <strong>${projectSchedule(p.id).length}</strong>` +
      `${lastA ? `<br>Último analytics: <strong>${lastA.platform}</strong> · ${Number(lastA.streams||0).toLocaleString('pt-BR')} views/streams` : ''}`;
    node.querySelector('.mini-grid').innerHTML = [
      ['Briefing', p.pipeline.briefing],
      ['Contrato', p.pipeline.contract],
      ['Gravação', p.pipeline.recording],
      ['Arte', p.pipeline.art],
      ['Distribuição', p.pipeline.distribution]
    ].map(i => `<div class="mini-box">${i[0]}<strong>${i[1] ? 'OK' : 'Pendente'}</strong></div>`).join('');
    const actions = node.querySelector('.project-actions');
    if (isAdmin()) {
      actions.innerHTML = `<button class="secondary btn-remarca">Remarcar</button><button class="secondary btn-evento">Registrar evento</button><button class="secondary btn-contrato">Contrato</button><button class="secondary btn-calendar">Google Calendar</button><button class="secondary btn-ics">Baixar ICS</button><button class="btn-launch">${checklistComplete(p)?'Confirmar lançamento':'Lançamento bloqueado'}</button><button class="danger btn-delete">Excluir</button>`;
      actions.querySelector('.btn-remarca').onclick = () => remarkProject(p.id);
      actions.querySelector('.btn-evento').onclick = () => addManualHistory(p.id);
      actions.querySelector('.btn-contrato').onclick = () => p.contractLink ? window.open(p.contractLink, '_blank') : alert('Sem link de contrato.');
      actions.querySelector('.btn-calendar').onclick = () => window.open(projectCalendarLink(p), '_blank');
      actions.querySelector('.btn-ics').onclick = () => downloadIcs(p);
      const launch = actions.querySelector('.btn-launch');
      if (!checklistComplete(p)) { launch.disabled = true; launch.classList.add('secondary'); }
      else launch.onclick = () => confirmRelease(p.id);
      actions.querySelector('.btn-delete').onclick = () => removeDocGeneric('projects', p.id);
    } else {
      actions.innerHTML = `<button class="secondary btn-contrato">Contrato</button><button class="secondary btn-calendar">Google Calendar</button><button class="secondary btn-ics">Baixar ICS</button>`;
      actions.querySelector('.btn-contrato').onclick = () => p.contractLink ? window.open(p.contractLink, '_blank') : alert('Sem link de contrato.');
      actions.querySelector('.btn-calendar').onclick = () => window.open(projectCalendarLink(p), '_blank');
      actions.querySelector('.btn-ics').onclick = () => downloadIcs(p);
    }
    node.querySelector('.history-list').innerHTML = (p.history || []).slice(0, 4).map(h => `<div class="history-row">${new Date(h.ts).toLocaleString('pt-BR')} · ${h.text}</div>`).join('');
    list.appendChild(node);
  });
}
function renderSchedule() {
  const items = live.schedule.filter(i => visibleProjects().some(p => p.id === i.projectId));
  byId('scheduleList').innerHTML = items.length
    ? items.sort((a,b) => (a.date||'').localeCompare(b.date||'')).map(i => {
        const p = projectById(i.projectId);
        return itemHtml(`${fmtDate(i.date)} · ${i.type} · ${i.status}`, `${profileByUid(p?.artistUid)?.stageName || profileByUid(p?.artistUid)?.name || 'Artista'} — ${p?.title || ''}${i.notes ? ' · ' + i.notes : ''}`);
      }).join('')
    : itemHtml('Sem cronograma', 'Cadastre cronograma editorial e operacional.');
}
function renderApprovals() {
  const items = live.approvals.filter(i => visibleProjects().some(p => p.id === i.projectId));
  byId('approvalList').innerHTML = items.length
    ? items.map(i => {
        const p = projectById(i.projectId);
        return itemHtml(`${i.type} · ${i.status}`, `${profileByUid(p?.artistUid)?.stageName || profileByUid(p?.artistUid)?.name || 'Artista'} — ${p?.title || ''}${i.link ? ' · link disponível' : ''}${i.notes ? ' · ' + i.notes : ''}`);
      }).join('')
    : itemHtml('Sem aprovações', 'Cadastre aprovações de capa, release, cronograma e master.');
}
function renderFinance() {
  const items = live.finance.filter(i => visibleProjects().some(p => p.id === i.projectId));
  byId('financeList').innerHTML = items.length
    ? items.sort((a,b) => (b.date||'').localeCompare(a.date||'')).map(i => {
        const p = projectById(i.projectId);
        return itemHtml(`${i.type} · ${money(i.value)}`, `${profileByUid(p?.artistUid)?.stageName || profileByUid(p?.artistUid)?.name || 'Artista'} — ${p?.title || ''} · ${fmtDate(i.date)}${i.notes ? ' · ' + i.notes : ''}`);
      }).join('')
    : itemHtml('Sem dados financeiros', 'Cadastre entradas e saídas por projeto.');
}
function renderPortal() {
  const projects = visibleProjects();
  byId('portalProjects').innerHTML = projects.length
    ? projects.map(p => itemHtml(`${profileByUid(p.artistUid)?.stageName || profileByUid(p.artistUid)?.name || 'Artista'} — ${p.title}`, `Status ${projectStatus(p)} · lançamento ${fmtDate(p.releaseDate)} · contrato ${p.contractStatus}`)).join('')
    : itemHtml('Nenhum projeto disponível', 'Quando houver projetos vinculados, eles aparecerão aqui.');
  const approvals = live.approvals.filter(a => projects.some(p => p.id === a.projectId));
  byId('portalApprovals').innerHTML = approvals.length
    ? approvals.map(i => { const p = projectById(i.projectId); return itemHtml(`${i.type} · ${i.status}`, `${p?.title || ''}${i.notes ? ' · ' + i.notes : ''}`); }).join('')
    : itemHtml('Sem aprovações', 'Aqui aparecem itens de aprovação para acompanhamento.');
  const analytics = live.analytics.filter(a => projects.some(p => p.id === a.projectId)).sort((a,b) => Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0));
  byId('portalAnalytics').innerHTML = analytics.length
    ? analytics.map(a => { const p = projectById(a.projectId); return itemHtml(`${p?.title || 'Projeto'} · ${a.platform} · ${a.period}`, `Streams/views ${Number(a.streams||0).toLocaleString('pt-BR')} · alcance ${Number(a.reach||0).toLocaleString('pt-BR')} · playlists ${Number(a.playlists||0).toLocaleString('pt-BR')} · resumo: ${a.summary || 'Sem resumo'} · próximo passo: ${a.nextStep || 'Sem próximo passo'}`); }).join('')
    : itemHtml('Sem analytics manuais', 'O admin pode lançar resultados manualmente e eles aparecerão aqui.');
}
function renderAlerts() {
  const projects = visibleProjects();
  const a = collectAlerts(projects);
  byId('alertList').innerHTML = a.length ? a.map(i => itemHtml(i.title, i.text)).join('') : itemHtml('Sem alertas', 'Nenhum alerta crítico no momento.');
  byId('recommendationList').innerHTML = itemHtml('Recomendação principal', recommendation(projects));
}
function renderAgenda() {
  const projects = [...visibleProjects()].filter(p => daysUntil(p.releaseDate) <= alertDays()).sort((a,b) => daysUntil(a.releaseDate) - daysUntil(b.releaseDate));
  byId('agendaList').innerHTML = projects.length
    ? projects.map(p => {
        const days = daysUntil(p.releaseDate);
        return `<div class="item">
          <div class="item-title">${profileByUid(p.artistUid)?.stageName || profileByUid(p.artistUid)?.name || 'Artista'} — ${p.title}</div>
          <div class="item-sub">Lançamento ${fmtDate(p.releaseDate)} · faltam ${days} dia(s) · status ${projectStatus(p)}</div>
          <div class="item-actions">
            <button class="secondary" data-gcal="${p.id}">Google Calendar</button>
            <button class="secondary" data-ics="${p.id}">Baixar ICS</button>
          </div>
        </div>`;
      }).join('')
    : itemHtml('Sem agenda crítica', `Nenhum lançamento nos próximos ${alertDays()} dias.`);
  document.querySelectorAll('[data-gcal]').forEach(btn => btn.onclick = () => { const p = projectById(btn.dataset.gcal); if (p) window.open(projectCalendarLink(p), '_blank'); });
  document.querySelectorAll('[data-ics]').forEach(btn => btn.onclick = () => { const p = projectById(btn.dataset.ics); if (p) downloadIcs(p); });
  updateNotificationStatus();
}
function renderCalendar() {
  const projects = [...visibleProjects()].sort((a,b) => String(a.releaseDate).localeCompare(String(b.releaseDate)));
  byId('calendarExportList').innerHTML = projects.length
    ? projects.map(p => `<div class="item">
        <div class="item-title">${profileByUid(p.artistUid)?.stageName || profileByUid(p.artistUid)?.name || 'Artista'} — ${p.title}</div>
        <div class="item-sub">Lançamento ${fmtDate(p.releaseDate)} · ${projectStatus(p)}</div>
        <div class="item-actions">
          <button class="secondary" data-gcal2="${p.id}">Abrir no Google Calendar</button>
          <button class="secondary" data-ics2="${p.id}">Baixar ICS</button>
        </div>
      </div>`).join('')
    : itemHtml('Sem projetos', 'Cadastre projetos para exportar calendário.');
  document.querySelectorAll('[data-gcal2]').forEach(btn => btn.onclick = () => { const p = projectById(btn.dataset.gcal2); if (p) window.open(projectCalendarLink(p), '_blank'); });
  document.querySelectorAll('[data-ics2]').forEach(btn => btn.onclick = () => { const p = projectById(btn.dataset.ics2); if (p) downloadIcs(p); });
}
function renderAnalytics() {
  const list = byId('analyticsList');
  if (!list) return;
  const items = live.analytics.filter(a => visibleProjects().some(p => p.id === a.projectId)).sort((a,b) => Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0));
  list.innerHTML = items.length
    ? items.map(a => {
        const p = projectById(a.projectId);
        return itemHtml(`${profileByUid(p?.artistUid)?.stageName || 'Artista'} — ${p?.title || 'Projeto'} · ${a.platform} · ${a.period}`, `Streams/views ${Number(a.streams||0).toLocaleString('pt-BR')} · alcance ${Number(a.reach||0).toLocaleString('pt-BR')} · playlists ${Number(a.playlists||0).toLocaleString('pt-BR')} · posts ${Number(a.posts||0).toLocaleString('pt-BR')} · engajamento ${Number(a.engagement||0).toLocaleString('pt-BR')}% · resumo: ${a.summary || 'Sem resumo'} · próximo passo: ${a.nextStep || 'Sem próximo passo'}`);
      }).join('')
    : itemHtml('Sem analytics manuais', 'O admin pode lançar analytics manualmente para mostrar resultados ao cantor.');
}
function renderSettings() {
  if (!isAdmin()) return;
  byId('cfgGoal').value = live.settings.monthlyGoal || 0;
  byId('cfgFormInitial').value = live.settings.formInitial || '';
  byId('cfgFormContract').value = live.settings.formContract || '';
  byId('cfgCalendar').value = live.settings.calendar || '';
  if (byId('cfgAlertDays')) byId('cfgAlertDays').value = live.settings.releaseAlertDays || 7;
  byId('settingsStatus').innerHTML = [
    itemHtml('Banco online', 'Conectado ao Firebase Firestore'),
    itemHtml('Usuário atual', currentUser?.email || ''),
    itemHtml('Meta mensal', money(live.settings.monthlyGoal || 0)),
    itemHtml('Dias para alerta', String(live.settings.releaseAlertDays || 7)),
    itemHtml('Google Form inicial', live.settings.formInitial ? 'Configurado' : 'Pendente'),
    itemHtml('Google Form contratual', live.settings.formContract ? 'Configurado' : 'Pendente'),
    itemHtml('Google Calendar', live.settings.calendar ? 'Configurado' : 'Pendente')
  ].join('');
}
function renderAll() {
  if (!currentUser) return;
  updateRoleUI();
  populateArtistForms();
  populateProjectSelects();
  renderDashboard();
  renderArtists();
  renderProjects();
  renderSchedule();
  renderApprovals();
  renderFinance();
  renderAgenda();
  renderCalendar();
  renderAnalytics();
  renderPortal();
  renderAlerts();
  renderSettings();
  updateNotificationStatus();
}

function populateArtistForms() {
  const artists = live.users.filter(u => u.role === 'artist');
  byId('projectArtist').innerHTML = artists.length ? artists.map(a => `<option value="${a.uid}">${a.stageName || a.name || a.email}</option>`).join('') : '<option value="">O artista precisa criar conta primeiro</option>';
  const nonLinked = live.users.filter(u => u.role === 'artist' && !u.stageName);
  byId('artistUserSelect').innerHTML = nonLinked.length ? nonLinked.map(a => `<option value="${a.uid}">${a.email || a.name || a.uid}</option>`).join('') : '<option value="">Sem contas novas para vincular</option>';
}
function populateProjectSelects() {
  const opts = live.projects.map(p => `<option value="${p.id}">${profileByUid(p.artistUid)?.stageName || profileByUid(p.artistUid)?.name || 'Artista'} — ${p.title}</option>`).join('');
  ['scheduleProject','approvalProject','financeProject','analyticsProject'].forEach(id => { const el = byId(id); if (el) el.innerHTML = opts; });
}

async function ensureUserProfile(user, name='') {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
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
async function loadProfile() {
  const snap = await getDoc(doc(db, 'users', currentUser.uid));
  currentProfile = snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
function clearListeners() { unsubs.forEach(fn => fn && fn()); unsubs = []; }
function listenCollection(coll, key) {
  const q = query(collection(db, coll), orderBy('createdAt', 'desc'));
  const unsub = onSnapshot(q, snap => {
    live[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  });
  unsubs.push(unsub);
}
async function startData() {
  clearListeners();
  listenCollection('users', 'users');
  listenCollection('projects', 'projects');
  listenCollection('schedule', 'schedule');
  listenCollection('approvals', 'approvals');
  listenCollection('finance', 'finance');
  listenCollection('analytics', 'analytics');
  const settingsRef = doc(db, 'meta', 'settings');
  const snap = await getDoc(settingsRef);
  if (!snap.exists()) {
    await setDoc(settingsRef, { monthlyGoal: 0, formInitial: '', formContract: '', calendar: '', releaseAlertDays: 7, updatedAt: serverTimestamp() });
  }
  const unsub = onSnapshot(settingsRef, s => {
    live.settings = s.data() || {};
    renderAll();
    runReminderScan(false);
  });
  unsubs.push(unsub);
}

async function appendHistory(id, text) {
  const p = projectById(id);
  const history = Array.isArray(p?.history) ? [...p.history] : [];
  history.unshift({ ts: new Date().toISOString(), text });
  await updateDoc(doc(db, 'projects', id), { history });
}
async function remarkProject(id) {
  const p = projectById(id);
  const next = prompt('Nova data de lançamento (AAAA-MM-DD):', p.releaseDate);
  if (!next || next === p.releaseDate) return;
  const reason = prompt('Motivo da remarcação:');
  if (!reason) return alert('Informe o motivo.');
  await updateDoc(doc(db, 'projects', id), { releaseDate: next });
  await appendHistory(id, `Remarcado de ${p.releaseDate} para ${next} · motivo: ${reason}`);
}
async function addManualHistory(id) {
  const text = prompt('Descreva o evento a registrar:');
  if (!text) return;
  await appendHistory(id, text);
}
async function confirmRelease(id) {
  const p = projectById(id);
  if (!checklistComplete(p)) return alert('Lançamento bloqueado: checklist incompleto.');
  if (!confirm(`Confirmar lançamento de ${p.title}?`)) return;
  const typed = prompt('Digite LANÇAR para concluir.');
  if (typed !== 'LANÇAR') return alert('Confirmação cancelada.');
  await updateDoc(doc(db, 'projects', id), { launched: true });
  await appendHistory(id, 'Lançamento confirmado com dupla validação');
}
async function removeDocGeneric(coll, id) {
  if (!confirm('Tem certeza que deseja excluir este item?')) return;
  await deleteDoc(doc(db, coll, id));
}
function exportJson() {
  const blob = new Blob([JSON.stringify({ build: BUILD, exportedAt: new Date().toISOString(), live }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vale-producao-crm-online-real.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function seedData() {
  if (!isAdmin()) return;
  if (live.projects.length && !confirm('Isso adicionará exemplos ao que já existe. Continuar?')) return;
  const artistSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'artist')));
  const first = artistSnap.docs[0];
  if (!first) return alert('Peça para pelo menos um artista criar conta primeiro e depois vincule em Artistas.');
  const artist = first.data();
  const ref = await addDoc(collection(db, 'projects'), {
    artistUid: artist.uid,
    title: 'Projeto Exemplo Online',
    type: 'Single',
    releaseDate: new Date(Date.now() + 5*86400000).toISOString().slice(0,10),
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
  await addDoc(collection(db, 'analytics'), { projectId: ref.id, period: 'Semana 1', platform: 'Spotify', streams: 1200, reach: 5400, playlists: 2, posts: 4, engagement: 5.8, summary: 'Boa resposta inicial para lançamento independente.', nextStep: 'Intensificar reels e buscar mais playlists.', createdAt: serverTimestamp() });
}

function bindTabs() {
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
function firebaseError(err) {
  const code = err?.code || '';
  if (code.includes('invalid-credential')) return 'E-mail ou senha inválidos.';
  if (code.includes('email-already-in-use')) return 'Este e-mail já está em uso.';
  if (code.includes('weak-password')) return 'A senha é fraca.';
  if (code.includes('invalid-email')) return 'E-mail inválido.';
  return 'Não foi possível concluir a operação.';
}
function bindEvents() {
  bindTabs();

  byId('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      setAuthMessage('Entrando...');
      await signInWithEmailAndPassword(auth, byId('loginEmail').value.trim(), byId('loginPassword').value);
      setAuthMessage('');
    } catch (err) {
      setAuthMessage(firebaseError(err), true);
    }
  });
  byId('signupForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (byId('signupPassword').value !== byId('signupPassword2').value) return setAuthMessage('As senhas não coincidem.', true);
    try {
      setAuthMessage('Criando conta...');
      const res = await createUserWithEmailAndPassword(auth, byId('signupEmail').value.trim(), byId('signupPassword').value);
      await ensureUserProfile(res.user, byId('signupName').value.trim());
      setAuthMessage('Conta criada com sucesso.');
    } catch (err) {
      setAuthMessage(firebaseError(err), true);
    }
  });

  byId('logoutBtn').addEventListener('click', async () => await signOut(auth));
  byId('projectSearch').addEventListener('input', renderProjects);
  byId('btnSeed').addEventListener('click', seedData);
  byId('btnExportJson').addEventListener('click', exportJson);
  document.addEventListener('click', e => {
    if (e.target?.id === 'btnEnableNotifications') requestNotificationPermission();
    if (e.target?.id === 'btnRunReminderScan') runReminderScan(true);
  });

  byId('projectForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!isAdmin()) return;
    const artistUid = byId('projectArtist').value;
    if (!artistUid) return alert('O artista precisa criar conta primeiro.');
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
    if (!isAdmin()) return;
    const uid = byId('artistUserSelect').value;
    if (!uid) return alert('Sem contas novas para vincular.');
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
    if (!isAdmin()) return;
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
    if (!isAdmin()) return;
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
    if (!isAdmin()) return;
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
    if (!isAdmin()) return;
    await addDoc(collection(db, 'analytics'), {
      projectId: byId('analyticsProject').value,
      period: byId('analyticsPeriod').value.trim(),
      platform: byId('analyticsPlatform').value,
      streams: Number(byId('analyticsStreams').value || 0),
      reach: Number(byId('analyticsReach').value || 0),
      playlists: Number(byId('analyticsPlaylists').value || 0),
      posts: Number(byId('analyticsPosts').value || 0),
      engagement: Number(byId('analyticsEngagement').value || 0),
      summary: byId('analyticsSummary').value.trim(),
      nextStep: byId('analyticsNextStep').value.trim(),
      createdAt: serverTimestamp()
    });
    e.target.reset();
    alert('Analytics salvo.');
  });

  byId('settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!isAdmin()) return;
    await setDoc(doc(db, 'meta', 'settings'), {
      monthlyGoal: Number(byId('cfgGoal').value || 0),
      formInitial: byId('cfgFormInitial').value.trim(),
      formContract: byId('cfgFormContract').value.trim(),
      calendar: byId('cfgCalendar').value.trim(),
      releaseAlertDays: Number(byId('cfgAlertDays')?.value || 7),
      updatedAt: serverTimestamp()
    }, { merge: true });
    alert('Configurações salvas.');
  });
}

function initFirebase() {
  const empty = Object.values(firebaseAppConfig).some(v => !v || String(v).includes('PREENCHA_AQUI'));
  if (empty) {
    setAuthMessage('Preencha o arquivo firebase-config.js antes de usar online real.', true);
    return false;
  }
  app = initializeApp(firebaseAppConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  return true;
}

bindEvents();
if (initFirebase()) {
  onAuthStateChanged(auth, async user => {
    if (!user) {
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
    setTimeout(() => runReminderScan(false), 1200);
  });
}
