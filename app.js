
const BUILD = { version: 'v18.0.0', datetime: '2026-03-28 16:39:22' };
const STORAGE_KEY = 'vale-producao-crm-final-v18';
const SESSION_KEY = 'vale-producao-crm-final-session-v18';

const DEFAULT_STATE = {
  users: [
    { id: 'u_admin', role: 'admin', name: 'Administrador', username: 'admin', password: '1234', email: '', notes: 'Acesso padrão do sistema' }
  ],
  projects: [],
  schedule: [],
  approvals: [],
  finance: [],
  settings: {
    appsScript: '',
    formInitial: '',
    formContract: '',
    calendar: '',
    monthlyGoal: 0
  }
};

let state = loadJson(STORAGE_KEY, DEFAULT_STATE);
let session = loadJson(SESSION_KEY, null);

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}
function saveSession() {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
  updateShell();
}
function uid(prefix='id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 10);
}
function byId(id) { return document.getElementById(id); }

function currentUser() {
  return session ? state.users.find(u => u.id === session.userId) || null : null;
}
function visibleProjects() {
  const user = currentUser();
  if (!user) return [];
  if (user.role === 'admin') return state.projects;
  return state.projects.filter(p => p.artistId === user.id);
}
function projectById(id) {
  return state.projects.find(p => p.id === id) || null;
}
function artistById(id) {
  return state.users.find(u => u.id === id) || null;
}
function formatDate(date) {
  if (!date) return 'Sem data';
  const [y,m,d] = date.split('-');
  return `${d}/${m}/${y}`;
}
function daysUntil(date) {
  if (!date) return 9999;
  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(date + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}
function projectStatus(project) {
  const d = daysUntil(project.releaseDate);
  if (d < 0) return 'ATRASADO';
  if (d <= 7 && !checklistComplete(project)) return 'EM RISCO';
  if (checklistComplete(project)) return 'PRONTO';
  return 'EM PRODUÇÃO';
}
function statusClass(status) {
  if (status === 'PRONTO') return 'status-pronto';
  if (status === 'EM RISCO') return 'status-risco';
  if (status === 'ATRASADO') return 'status-atrasado';
  return 'status-producao';
}
function checklistComplete(project) {
  return Object.values(project.pipeline).every(Boolean);
}
function addHistory(project, text) {
  project.history.unshift({ id: uid('h'), ts: new Date().toISOString(), text });
}
function projectApprovals(projectId) {
  return state.approvals.filter(a => a.projectId === projectId);
}
function projectSchedule(projectId) {
  return state.schedule.filter(s => s.projectId === projectId);
}
function projectFinance(projectId) {
  return state.finance.filter(f => f.projectId === projectId);
}
function projectProfit(projectId) {
  return projectFinance(projectId).reduce((acc, item) => acc + (item.type === 'Entrada' ? item.value : -item.value), 0);
}
function priorityScore(project) {
  const d = daysUntil(project.releaseDate);
  let score = 0;
  if (projectStatus(project) === 'ATRASADO') score += 100;
  if (projectStatus(project) === 'EM RISCO') score += 60;
  if (!checklistComplete(project)) score += 25;
  if (project.contractStatus !== 'Assinado') score += 10;
  score += Math.max(0, 30 - Math.max(d, 0));
  score += projectApprovals(project.id).filter(a => a.status === 'Pendente').length * 8;
  score += projectSchedule(project.id).filter(s => s.status !== 'Publicado' && daysUntil(s.date) <= 2).length * 6;
  return score;
}
function monthlyNet() {
  const now = new Date();
  const ym = now.toISOString().slice(0,7);
  return state.finance
    .filter(f => (f.date || '').slice(0,7) === ym)
    .reduce((acc, f) => acc + (f.type === 'Entrada' ? f.value : -f.value), 0);
}
function calendarLink(project) {
  const start = (project.releaseDate || '').replaceAll('-', '');
  const endDate = new Date((project.releaseDate || '') + 'T00:00:00');
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString().slice(0,10).replaceAll('-', '');
  const text = encodeURIComponent(`Lançamento - ${project.title}`);
  const details = encodeURIComponent(`Artista: ${artistById(project.artistId)?.name || ''}\nProjeto: ${project.title}\nStatus: ${projectStatus(project)}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}`;
}

function buildNav() {
  const user = currentUser();
  const items = user.role === 'admin'
    ? [
      ['dashboard','Dashboard'],
      ['projetos','Projetos'],
      ['artistas','Artistas'],
      ['cronograma','Cronograma'],
      ['aprovacoes','Aprovações'],
      ['financeiro','Financeiro'],
      ['relatorios','Relatórios'],
      ['portal','Portal do artista'],
      ['integracoes','Integrações']
    ]
    : [
      ['dashboard','Dashboard'],
      ['portal','Meu portal']
    ];
  byId('navMenu').innerHTML = items.map((item, idx) => `<button class="${idx===0 ? 'active' : ''}" data-view="${item[0]}">${item[1]}</button>`).join('');
  document.querySelectorAll('#navMenu button').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#navMenu button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showView(btn.dataset.view);
    };
  });
  showView(items[0][0]);
}
function showView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  byId('view-' + view).classList.add('active');
  byId('pageTitle').textContent = document.querySelector(`#navMenu button[data-view="${view}"]`)?.textContent || 'Dashboard';
}
function updateShell() {
  const user = currentUser();
  byId('loginScreen').classList.toggle('hidden', !!user);
  byId('appShell').classList.toggle('hidden', !user);
  if (user) {
    byId('sessionInfo').textContent = `${user.role === 'admin' ? 'Admin' : 'Artista'} · ${user.name}`;
    buildNav();
    renderAll();
  }
}

function renderDashboard() {
  const projects = visibleProjects();
  const dashboard = byId('view-dashboard');
  const alerts = collectAlerts(projects);
  const top = [...projects].sort((a,b) => priorityScore(b) - priorityScore(a)).slice(0,6);

  dashboard.innerHTML = `
    <div class="dashboard-grid">
      ${metricCard('Projetos', projects.length)}
      ${metricCard('Em risco', projects.filter(p => projectStatus(p) === 'EM RISCO').length)}
      ${metricCard('Atrasados', projects.filter(p => projectStatus(p) === 'ATRASADO').length)}
      ${metricCard('Lucro do mês', formatCurrency(monthlyNet()))}
    </div>

    <div class="two-col">
      <article class="panel glass">
        <div class="section-head"><h3>Prioridade operacional</h3><span class="tag">urgência real</span></div>
        <div class="stack">
          ${top.length ? top.map(project => itemHtml(
            `${artistById(project.artistId)?.name || 'Artista'} — ${project.title}`,
            `Prioridade ${priorityScore(project)} · ${projectStatus(project)} · lançamento ${formatDate(project.releaseDate)}`
          )).join('') : itemHtml('Sem projetos', 'Cadastre projetos para gerar prioridade automática.')}
        </div>
      </article>

      <article class="panel glass">
        <div class="section-head"><h3>Alertas inteligentes</h3><span class="tag">anti-erro humano</span></div>
        <div class="stack">
          ${alerts.length ? alerts.map(a => itemHtml(a.title, a.text)).join('') : itemHtml('Sem alertas críticos', 'Tudo sob controle no momento.')}
        </div>
      </article>
    </div>
  `;
}

function renderArtists() {
  const user = currentUser();
  if (user.role !== 'admin') return;
  const list = byId('artistList');
  const artists = state.users.filter(u => u.role === 'artist');
  list.innerHTML = artists.length
    ? artists.map(artist => itemHtml(
        `${artist.name} · usuário ${artist.username}`,
        `${artist.email || 'sem e-mail'}${artist.notes ? ' · ' + artist.notes : ''}`
      )).join('')
    : itemHtml('Nenhum artista cadastrado', 'Cadastre artistas para liberar o portal.');
}

function renderProjects() {
  const list = byId('projectList');
  const user = currentUser();
  const query = (byId('projectSearch')?.value || '').trim().toLowerCase();
  const template = byId('projectTemplate');
  const projects = [...visibleProjects()]
    .filter(p => (`${artistById(p.artistId)?.name || ''} ${p.title}`).toLowerCase().includes(query))
    .sort((a,b) => priorityScore(b) - priorityScore(a));

  byId('projectFormPanel').style.display = user.role === 'admin' ? '' : 'none';

  if (!projects.length) {
    list.innerHTML = itemHtml('Nenhum projeto encontrado', 'Cadastre um projeto ou refine a busca.');
    return;
  }

  list.innerHTML = '';
  projects.forEach(project => {
    const node = template.content.firstElementChild.cloneNode(true);
    const artist = artistById(project.artistId);
    node.querySelector('.project-title').textContent = `${artist?.name || 'Artista'} — ${project.title}`;
    node.querySelector('.project-meta').textContent = `${project.type} · contrato ${project.contractStatus} · prioridade ${priorityScore(project)}`;
    const badge = node.querySelector('.status-badge');
    const status = projectStatus(project);
    badge.textContent = status;
    badge.classList.add(statusClass(status));

    node.querySelector('.project-stats').innerHTML = `
      Lançamento: <strong>${formatDate(project.releaseDate)}</strong><br>
      Valor contratado: <strong>${formatCurrency(project.value || 0)}</strong> · Lucro: <strong>${formatCurrency(projectProfit(project.id))}</strong><br>
      Aprovações: <strong>${projectApprovals(project.id).length}</strong> · Itens de cronograma: <strong>${projectSchedule(project.id).length}</strong>
    `;

    const miniRoot = node.querySelector('.mini-grid');
    const mini = [
      ['Briefing', project.pipeline.briefing],
      ['Contrato', project.pipeline.contract],
      ['Gravação', project.pipeline.recording],
      ['Arte', project.pipeline.art],
      ['Distribuição', project.pipeline.distribution]
    ];
    miniRoot.innerHTML = mini.map(i => `<div class="mini-box">${i[0]}<strong>${i[1] ? 'OK' : 'Pendente'}</strong></div>`).join('');

    const actions = node.querySelector('.project-actions');
    if (user.role === 'admin') {
      actions.innerHTML = `
        <button class="secondary btn-remarca">Remarcar</button>
        <button class="secondary btn-evento">Registrar evento</button>
        <button class="secondary btn-contrato">Contrato</button>
        <button class="secondary btn-calendar">Calendar</button>
        <button class="btn-launch">${checklistComplete(project) ? 'Confirmar lançamento' : 'Lançamento bloqueado'}</button>
        <button class="danger btn-delete">Excluir</button>
      `;
      actions.querySelector('.btn-remarca').onclick = () => remarkProject(project.id);
      actions.querySelector('.btn-evento').onclick = () => manualHistory(project.id);
      actions.querySelector('.btn-contrato').onclick = () => project.contractLink ? window.open(project.contractLink, '_blank') : alert('Sem link de contrato.');
      actions.querySelector('.btn-calendar').onclick = () => window.open(calendarLink(project), '_blank');
      actions.querySelector('.btn-delete').onclick = () => deleteProject(project.id);
      const launchBtn = actions.querySelector('.btn-launch');
      if (!checklistComplete(project)) {
        launchBtn.disabled = true;
        launchBtn.classList.add('secondary');
      } else {
        launchBtn.onclick = () => confirmRelease(project.id);
      }
    } else {
      actions.innerHTML = `
        <button class="secondary btn-contrato">Contrato</button>
        <button class="secondary btn-calendar">Calendar</button>
      `;
      actions.querySelector('.btn-contrato').onclick = () => project.contractLink ? window.open(project.contractLink, '_blank') : alert('Sem link de contrato.');
      actions.querySelector('.btn-calendar').onclick = () => window.open(calendarLink(project), '_blank');
    }

    const history = node.querySelector('.history-list');
    history.innerHTML = project.history.slice(0,4).map(h => `<div class="history-row">${new Date(h.ts).toLocaleString('pt-BR')} · ${h.text}</div>`).join('');
    list.appendChild(node);
  });
}

function renderSchedule() {
  const user = currentUser();
  if (user.role !== 'admin') return;
  const items = state.schedule
    .filter(item => visibleProjects().some(p => p.id === item.projectId))
    .sort((a,b) => (a.date || '').localeCompare(b.date || ''));
  byId('scheduleList').innerHTML = items.length
    ? items.map(item => {
        const p = projectById(item.projectId);
        return itemHtml(
          `${formatDate(item.date)} · ${item.type} · ${item.status}`,
          `${artistById(p?.artistId)?.name || 'Artista'} — ${p?.title || ''}${item.notes ? ' · ' + item.notes : ''}`
        );
      }).join('')
    : itemHtml('Sem cronograma', 'Cadastre reels, stories, pré-save, gravação, entrega de arte e pós-lançamento.');
}

function renderApprovals() {
  const approvals = state.approvals.filter(a => visibleProjects().some(p => p.id === a.projectId));
  byId('approvalList').innerHTML = approvals.length
    ? approvals.map(item => {
        const p = projectById(item.projectId);
        return itemHtml(
          `${item.type} · ${item.status}`,
          `${artistById(p?.artistId)?.name || 'Artista'} — ${p?.title || ''}${item.link ? ' · link disponível' : ''}${item.notes ? ' · ' + item.notes : ''}`
        );
      }).join('')
    : itemHtml('Sem aprovações', 'Cadastre aprovações de capa, release, cronograma e master.');
}

function renderFinance() {
  const items = state.finance.filter(f => visibleProjects().some(p => p.id === f.projectId));
  byId('financeList').innerHTML = items.length
    ? items.sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(item => {
        const p = projectById(item.projectId);
        return itemHtml(
          `${item.type} · ${formatCurrency(item.value)}`,
          `${artistById(p?.artistId)?.name || 'Artista'} — ${p?.title || ''} · ${formatDate(item.date)}${item.notes ? ' · ' + item.notes : ''}`
        );
      }).join('')
    : itemHtml('Sem lançamentos financeiros', 'Cadastre entradas e saídas por projeto.');
}

function renderReports() {
  const projects = visibleProjects();
  const profits = projects.map(p => projectProfit(p.id));
  const signed = projects.filter(p => p.contractStatus === 'Assinado').length;
  const monthly = monthlyNet();
  const goal = Number(state.settings.monthlyGoal || 0);
  const remaining = Math.max(goal - monthly, 0);

  byId('reportsGrid').innerHTML = `
    ${metricCard('Lucro total', formatCurrency(profits.reduce((a,b) => a+b, 0)))}
    ${metricCard('Contratos assinados', signed)}
    ${metricCard('Meta do mês', formatCurrency(goal))}
    ${metricCard('Falta para meta', formatCurrency(remaining))}
    <article class="panel glass" style="grid-column:1/-1">
      <div class="section-head"><h3>Leitura executiva</h3><span class="tag">estratégico</span></div>
      <div class="stack">
        ${itemHtml('Resultado do mês', monthly < 0 ? 'Você está no prejuízo no mês.' : monthly < goal ? 'Ainda falta faturamento para alcançar a meta mensal.' : 'Meta mensal atingida ou superada.')}
        ${itemHtml('Projeto com maior urgência', projects.length ? `${artistById([...projects].sort((a,b) => priorityScore(b)-priorityScore(a))[0].artistId)?.name || ''} — ${[...projects].sort((a,b) => priorityScore(b)-priorityScore(a))[0].title}` : 'Nenhum projeto cadastrado.')}
        ${itemHtml('Recomendação', recommendationText(projects, monthly, goal))}
      </div>
    </article>
  `;
}

function renderPortal() {
  const projects = visibleProjects();
  byId('portalProjects').innerHTML = projects.length
    ? projects.map(project => itemHtml(
        `${artistById(project.artistId)?.name || 'Artista'} — ${project.title}`,
        `Status ${projectStatus(project)} · lançamento ${formatDate(project.releaseDate)} · contrato ${project.contractStatus}`
      )).join('')
    : itemHtml('Nenhum projeto disponível', 'Quando houver projetos vinculados, eles aparecerão aqui.');

  const approvals = state.approvals.filter(a => projects.some(p => p.id === a.projectId));
  byId('portalApprovals').innerHTML = approvals.length
    ? approvals.map(item => {
        const p = projectById(item.projectId);
        return itemHtml(`${item.type} · ${item.status}`, `${p?.title || ''}${item.notes ? ' · ' + item.notes : ''}`);
      }).join('')
    : itemHtml('Sem aprovações', 'Aqui aparecem itens de capa, release, cronograma ou master.');
}

function renderSettings() {
  const user = currentUser();
  if (user.role !== 'admin') return;
  byId('cfgAppsScript').value = state.settings.appsScript || '';
  byId('cfgFormInitial').value = state.settings.formInitial || '';
  byId('cfgFormContract').value = state.settings.formContract || '';
  byId('cfgCalendar').value = state.settings.calendar || '';
  byId('cfgGoal').value = state.settings.monthlyGoal || 0;

  byId('settingsStatus').innerHTML = [
    itemHtml('Apps Script', state.settings.appsScript ? 'Configurado' : 'Pendente'),
    itemHtml('Google Form inicial', state.settings.formInitial ? 'Configurado' : 'Pendente'),
    itemHtml('Google Form contratual', state.settings.formContract ? 'Configurado' : 'Pendente'),
    itemHtml('Google Calendar', state.settings.calendar ? 'Configurado' : 'Pendente'),
    itemHtml('Meta mensal', formatCurrency(Number(state.settings.monthlyGoal || 0)))
  ].join('');
}

function collectAlerts(projects) {
  const alerts = [];
  projects.forEach(project => {
    const d = daysUntil(project.releaseDate);
    if (d < 0) alerts.push({ title: 'Projeto atrasado', text: `${artistById(project.artistId)?.name || 'Artista'} — ${project.title}` });
    if (d <= 5 && d >= 0) alerts.push({ title: 'Lançamento próximo', text: `${project.title} lança em ${d} dia(s).` });
    if (!checklistComplete(project)) alerts.push({ title: 'Checklist incompleto', text: `${project.title} ainda não concluiu todas as etapas.` });
    if (project.contractStatus !== 'Assinado') alerts.push({ title: 'Contrato pendente', text: `${project.title} está com contrato ${project.contractStatus.toLowerCase()}.` });
    if (projectApprovals(project.id).some(a => a.status === 'Pendente')) alerts.push({ title: 'Aprovação pendente', text: `${project.title} possui aprovação aguardando retorno.` });
    if (projectSchedule(project.id).some(s => s.status !== 'Publicado' && daysUntil(s.date) <= 2)) alerts.push({ title: 'Cronograma crítico', text: `${project.title} possui item próximo do prazo sem publicar.` });
  });
  return alerts.slice(0, 12);
}

function recommendationText(projects, monthly, goal) {
  if (!projects.length) return 'Cadastre artistas e projetos para começar a operação.';
  if (monthly < 0) return 'Revise custos, priorize projetos de maior margem e segure saídas não essenciais.';
  if (goal > 0 && monthly < goal) return 'Foque em concluir projetos próximos do lançamento e fechar novos contratos nesta semana.';
  return 'Continue escalando os projetos prontos, fortaleça o pós-lançamento e repita o processo nos artistas mais rentáveis.';
}

function metricCard(label, value) {
  return `<article class="metric-card glass"><span>${label}</span><strong>${value}</strong></article>`;
}
function itemHtml(title, text) {
  return `<div class="item"><div class="item-title">${title}</div><div class="item-sub">${text}</div></div>`;
}
function formatCurrency(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
}

function populateArtistSelect() {
  const artists = state.users.filter(u => u.role === 'artist');
  const options = artists.length ? artists.map(a => `<option value="${a.id}">${a.name}</option>`).join('') : '<option value="">Cadastre um artista primeiro</option>';
  byId('projectArtist').innerHTML = options;
}
function populateProjectSelects() {
  const options = state.projects.map(p => `<option value="${p.id}">${artistById(p.artistId)?.name || 'Artista'} — ${p.title}</option>`).join('');
  ['scheduleProject','approvalProject','financeProject'].forEach(id => byId(id).innerHTML = options);
}

function handleLogin(e) {
  e.preventDefault();
  const role = byId('loginRole').value;
  const username = byId('loginUser').value.trim();
  const password = byId('loginPass').value.trim();
  const user = state.users.find(u => u.role === role && u.username === username && u.password === password);
  if (!user) return alert('Credenciais inválidas.');
  session = { userId: user.id };
  saveSession();
}
function handleArtistSubmit(e) {
  e.preventDefault();
  const username = byId('artistUsername').value.trim();
  if (state.users.some(u => u.username === username)) return alert('Este usuário já existe.');
  state.users.push({
    id: uid('artist'),
    role: 'artist',
    name: byId('artistName').value.trim(),
    username,
    password: byId('artistPassword').value.trim(),
    email: byId('artistEmail').value.trim(),
    notes: byId('artistNotes').value.trim()
  });
  e.target.reset();
  saveState();
}
function handleProjectSubmit(e) {
  e.preventDefault();
  const artistId = byId('projectArtist').value;
  if (!artistId) return alert('Cadastre um artista primeiro.');
  const project = {
    id: uid('proj'),
    artistId,
    title: byId('projectTitle').value.trim(),
    type: byId('projectType').value,
    releaseDate: byId('projectReleaseDate').value,
    value: Number(byId('projectValue').value || 0),
    contractStatus: byId('projectContractStatus').value,
    contractLink: byId('projectContractLink').value.trim(),
    notes: byId('projectNotes').value.trim(),
    launched: false,
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
    history: []
  };
  addHistory(project, 'Projeto criado');
  state.projects.push(project);
  e.target.reset();
  saveState();
}
function handleScheduleSubmit(e) {
  e.preventDefault();
  const projectId = byId('scheduleProject').value;
  if (!projectId) return alert('Cadastre um projeto primeiro.');
  state.schedule.push({
    id: uid('sch'),
    projectId,
    type: byId('scheduleType').value,
    date: byId('scheduleDate').value,
    status: byId('scheduleStatus').value,
    notes: byId('scheduleNotes').value.trim()
  });
  const p = projectById(projectId);
  if (p) addHistory(p, `Cronograma: ${byId('scheduleType').value} · ${byId('scheduleStatus').value}`);
  e.target.reset();
  saveState();
}
function handleApprovalSubmit(e) {
  e.preventDefault();
  const projectId = byId('approvalProject').value;
  if (!projectId) return alert('Cadastre um projeto primeiro.');
  state.approvals.push({
    id: uid('apr'),
    projectId,
    type: byId('approvalType').value,
    status: byId('approvalStatus').value,
    link: byId('approvalLink').value.trim(),
    notes: byId('approvalNotes').value.trim()
  });
  const p = projectById(projectId);
  if (p) addHistory(p, `Aprovação: ${byId('approvalType').value} · ${byId('approvalStatus').value}`);
  e.target.reset();
  saveState();
}
function handleFinanceSubmit(e) {
  e.preventDefault();
  const projectId = byId('financeProject').value;
  if (!projectId) return alert('Cadastre um projeto primeiro.');
  state.finance.push({
    id: uid('fin'),
    projectId,
    type: byId('financeType').value,
    value: Number(byId('financeValue').value || 0),
    date: byId('financeDate').value,
    notes: byId('financeNotes').value.trim()
  });
  const p = projectById(projectId);
  if (p) addHistory(p, `Financeiro: ${byId('financeType').value} ${formatCurrency(byId('financeValue').value || 0)}`);
  e.target.reset();
  saveState();
}
function handleSettingsSubmit(e) {
  e.preventDefault();
  state.settings.appsScript = byId('cfgAppsScript').value.trim();
  state.settings.formInitial = byId('cfgFormInitial').value.trim();
  state.settings.formContract = byId('cfgFormContract').value.trim();
  state.settings.calendar = byId('cfgCalendar').value.trim();
  state.settings.monthlyGoal = Number(byId('cfgGoal').value || 0);
  saveState();
  alert('Configurações salvas.');
}
function remarkProject(projectId) {
  const project = projectById(projectId);
  const next = prompt('Nova data de lançamento (AAAA-MM-DD):', project.releaseDate);
  if (!next || next === project.releaseDate) return;
  const reason = prompt('Motivo da remarcação:');
  if (!reason) return alert('Informe o motivo da remarcação.');
  addHistory(project, `Remarcado de ${project.releaseDate} para ${next} · motivo: ${reason}`);
  project.releaseDate = next;
  saveState();
}
function manualHistory(projectId) {
  const project = projectById(projectId);
  const text = prompt('Descreva o evento a registrar no histórico:');
  if (!text) return;
  addHistory(project, text);
  saveState();
}
function confirmRelease(projectId) {
  const project = projectById(projectId);
  if (!checklistComplete(project)) return alert('Lançamento bloqueado: checklist incompleto.');
  if (!confirm(`Confirmar lançamento de ${project.title}?`)) return;
  const typed = prompt('Digite LANÇAR para concluir a dupla validação.');
  if (typed !== 'LANÇAR') return alert('Confirmação cancelada.');
  project.launched = true;
  addHistory(project, 'Lançamento confirmado com dupla validação');
  saveState();
}
function deleteProject(projectId) {
  const project = projectById(projectId);
  if (!confirm(`Excluir ${project.title}?`)) return;
  state.projects = state.projects.filter(p => p.id !== projectId);
  state.schedule = state.schedule.filter(i => i.projectId !== projectId);
  state.approvals = state.approvals.filter(i => i.projectId !== projectId);
  state.finance = state.finance.filter(i => i.projectId !== projectId);
  saveState();
}
function exportJson() {
  const blob = new Blob([JSON.stringify({ build: BUILD, exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vale-producao-crm-final.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function sendAppsScript() {
  if (!state.settings.appsScript) return alert('Configure a URL do Apps Script primeiro.');
  try {
    const response = await fetch(state.settings.appsScript, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ build: BUILD, exportedAt: new Date().toISOString(), state })
    });
    if (!response.ok) throw new Error();
    alert('Dados enviados com sucesso.');
  } catch {
    alert('Falha ao enviar. Verifique a URL e as permissões do Apps Script.');
  }
}
function seedData() {
  if (state.projects.length && !confirm('Isso adicionará exemplos ao que já existe. Continuar?')) return;
  let artist = state.users.find(u => u.role === 'artist' && u.username === 'juh');
  if (!artist) {
    artist = { id: uid('artist'), role: 'artist', name: 'Juh Silva', username: 'juh', password: '1234', email: '', notes: 'Exemplo de artista' };
    state.users.push(artist);
  }
  let artist2 = state.users.find(u => u.role === 'artist' && u.username === 'ariane');
  if (!artist2) {
    artist2 = { id: uid('artist'), role: 'artist', name: 'Ariane Mazur', username: 'ariane', password: '1234', email: '', notes: 'Exemplo de artista' };
    state.users.push(artist2);
  }
  const p1 = {
    id: uid('proj'),
    artistId: artist.id,
    title: 'Bloqueado',
    type: 'Single',
    releaseDate: new Date(Date.now() + 5*86400000).toISOString().slice(0,10),
    value: 1200,
    contractStatus: 'Enviado',
    contractLink: '',
    notes: 'Projeto em fase crítica de lançamento.',
    launched: false,
    pipeline: { briefing:true, contract:true, preproduction:true, recording:true, mix:true, art:false, release:true, posts:false, distribution:false, review:false },
    history: []
  };
  const p2 = {
    id: uid('proj'),
    artistId: artist2.id,
    title: 'Novo Amanhã',
    type: 'Single',
    releaseDate: new Date(Date.now() + 16*86400000).toISOString().slice(0,10),
    value: 1800,
    contractStatus: 'Assinado',
    contractLink: '',
    notes: 'Projeto quase pronto.',
    launched: false,
    pipeline: { briefing:true, contract:true, preproduction:true, recording:true, mix:true, art:true, release:true, posts:true, distribution:true, review:true },
    history: []
  };
  [p1, p2].forEach(p => addHistory(p, 'Projeto criado via exemplo'));
  state.projects.push(p1, p2);
  state.schedule.push({ id: uid('sch'), projectId: p1.id, type: 'Teaser', date: new Date(Date.now() + 2*86400000).toISOString().slice(0,10), status: 'Pendente', notes: 'Teaser principal' });
  state.approvals.push({ id: uid('apr'), projectId: p1.id, type: 'Capa', status: 'Pendente', link: '', notes: 'Aguardando aprovação da artista' });
  state.finance.push({ id: uid('fin'), projectId: p1.id, type: 'Entrada', value: 800, date: new Date().toISOString().slice(0,10), notes: 'Entrada inicial' });
  state.finance.push({ id: uid('fin'), projectId: p1.id, type: 'Saída', value: 200, date: new Date().toISOString().slice(0,10), notes: 'Arte' });
  saveState();
}

function renderAll() {
  const user = currentUser();
  if (!user) return;
  document.querySelectorAll('.admin-only-block').forEach(el => el.style.display = user.role === 'admin' ? '' : 'none');
  populateArtistSelect();
  populateProjectSelects();
  renderDashboard();
  renderArtists();
  renderProjects();
  renderSchedule();
  renderApprovals();
  renderFinance();
  renderReports();
  renderPortal();
  renderSettings();
}

document.querySelectorAll('.admin-only-block').forEach(()=>{{}});

byId('loginForm').addEventListener('submit', handleLogin);
byId('logoutBtn').addEventListener('click', () => { session = null; saveSession(); });
byId('artistForm').addEventListener('submit', handleArtistSubmit);
byId('projectForm').addEventListener('submit', handleProjectSubmit);
byId('scheduleForm').addEventListener('submit', handleScheduleSubmit);
byId('approvalForm').addEventListener('submit', handleApprovalSubmit);
byId('financeForm').addEventListener('submit', handleFinanceSubmit);
byId('settingsForm').addEventListener('submit', handleSettingsSubmit);
byId('projectSearch').addEventListener('input', renderProjects);
byId('btnExportJson').addEventListener('click', exportJson);
byId('btnSeed').addEventListener('click', seedData);
byId('btnSendAppsScript').addEventListener('click', sendAppsScript);

updateShell();
