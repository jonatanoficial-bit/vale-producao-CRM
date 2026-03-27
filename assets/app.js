const BUILD = {
  version: 'v2.0.0',
  datetime: '2026-03-27 11:31:09 -03:00',
  phase: 'Fase 2'
};

const STORAGE_KEY = 'valeArtistFlowData';
const CONFIG_KEY = 'valeArtistFlowConfig';

const DEFAULT_STAGES = [
  'Briefing',
  'Contrato',
  'Pré-produção',
  'Produção',
  'Arte',
  'Divulgação',
  'Distribuição',
  'Lançamento',
  'Pós-lançamento'
];

const DEFAULT_DATA = {
  artists: [],
  projects: []
};

const DEFAULT_CONFIG = {
  integrations: {
    artistIntakeForm: '',
    contractForm: '',
    visualBriefForm: '',
    sheetUrl: '',
    calendarUrl: '',
    autentiqueUrl: '',
    canvaUrl: '',
    onerpmUrl: ''
  },
  settings: {
    releaseAlertDays: 30,
    postAlertDays: 7,
    contractAlertDays: 5,
    producerName: 'Jonatan Vale'
  }
};

const state = {
  data: loadData(),
  config: loadConfig()
};

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(DEFAULT_DATA);
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || structuredClone(DEFAULT_CONFIG);
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

function saveAll() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function daysUntil(dateString) {
  if (!dateString) return null;
  const today = new Date();
  const target = new Date(`${dateString}T12:00:00`);
  return Math.ceil((target - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
}

function formatDate(dateString) {
  if (!dateString) return 'Sem data';
  return new Date(`${dateString}T12:00:00`).toLocaleDateString('pt-BR');
}

function checklistScore(project) {
  const items = Object.values(project.checklist || {});
  if (!items.length) return 0;
  return items.filter(Boolean).length / items.length;
}

function getAlerts() {
  const alerts = [];
  const { releaseAlertDays, postAlertDays, contractAlertDays } = state.config.settings;
  state.data.projects.forEach(project => {
    const releaseDelta = daysUntil(project.releaseDate);
    const postDelta = daysUntil(project.postDeadline);
    const artDelta = daysUntil(project.artDeadline);
    const contractDelta = daysUntil(project.recordingDate);
    const score = checklistScore(project);

    if (releaseDelta !== null && releaseDelta <= releaseAlertDays && score < 1) {
      alerts.push({
        level: releaseDelta < 0 ? 'danger' : 'warning',
        title: `${project.title}: lançamento com pendências`,
        text: `Data ${formatDate(project.releaseDate)}. Checklist em ${Math.round(score * 100)}%. Requer revisão antes de seguir.`,
        due: releaseDelta
      });
    }
    if (postDelta !== null && postDelta <= postAlertDays && !(project.checklist?.posts)) {
      alerts.push({
        level: 'warning',
        title: `${project.title}: posts ainda não planejados`,
        text: `Prazo de posts ${formatDate(project.postDeadline)}. Organize feed, stories, reels e cronograma.`,
        due: postDelta
      });
    }
    if (artDelta !== null && artDelta <= 5 && !(project.checklist?.cover)) {
      alerts.push({
        level: 'warning',
        title: `${project.title}: arte sem aprovação`,
        text: `Data limite da arte ${formatDate(project.artDeadline)}. Capa e identidade visual precisam ser validadas.`,
        due: artDelta
      });
    }
    if (contractDelta !== null && contractDelta <= contractAlertDays && !project.contractLink) {
      alerts.push({
        level: 'warning',
        title: `${project.title}: contrato ainda não anexado`,
        text: `A gravação está marcada para ${formatDate(project.recordingDate)} e o link do contrato não foi informado.`,
        due: contractDelta
      });
    }
    if (releaseDelta !== null && releaseDelta < 0 && score < 1) {
      alerts.push({
        level: 'danger',
        title: `${project.title}: risco confirmado / lançamento vencido`,
        text: `A data já passou e ainda existem pendências operacionais. Prioridade máxima para ação corretiva.`,
        due: releaseDelta
      });
    }
  });
  return alerts.sort((a, b) => a.due - b.due);
}

function getUpcomingItems() {
  return state.data.projects
    .flatMap(project => [
      { title: `${project.title} · Lançamento`, date: project.releaseDate, type: 'Lançamento' },
      { title: `${project.title} · Arte`, date: project.artDeadline, type: 'Arte' },
      { title: `${project.title} · Posts`, date: project.postDeadline, type: 'Posts' },
      { title: `${project.title} · Gravação`, date: project.recordingDate, type: 'Gravação' }
    ])
    .filter(item => item.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 10);
}

function renderStats() {
  const list = document.getElementById('statsGrid');
  const alerts = getAlerts();
  const projects = state.data.projects;
  const artists = state.data.artists;
  const released = projects.filter(p => p.status === 'Lançado').length;
  const pending = projects.filter(p => checklistScore(p) < 1).length;
  const cards = [
    ['Artistas cadastrados', artists.length],
    ['Projetos ativos', projects.length],
    ['Projetos com pendências', pending],
    ['Alertas críticos', alerts.filter(a => a.level === 'danger').length],
    ['Projetos lançados', released]
  ];
  list.innerHTML = cards.map(([label, value]) => `
    <div class="stat-card">
      <strong>${label}</strong>
      <span>${value}</span>
    </div>
  `).join('');
}

function renderAlerts() {
  const container = document.getElementById('criticalAlerts');
  const alerts = getAlerts();
  if (!alerts.length) {
    container.innerHTML = `<div class="alert-item"><h4>Nenhum alerta crítico no momento</h4><p>Seu fluxo está sob controle. Continue monitorando os prazos.</p></div>`;
    return;
  }
  container.innerHTML = alerts.slice(0, 8).map(alert => `
    <article class="alert-item alert-${alert.level}">
      <h4>${alert.title}</h4>
      <p>${alert.text}</p>
    </article>
  `).join('');
}

function renderUpcoming() {
  const container = document.getElementById('upcomingDeadlines');
  const items = getUpcomingItems();
  if (!items.length) {
    container.innerHTML = `<div class="calendar-item"><h4>Sem marcos cadastrados</h4><p>Adicione um projeto para começar a organizar o calendário.</p></div>`;
    return;
  }
  container.innerHTML = items.map(item => `
    <article class="calendar-item">
      <h4>${item.title}</h4>
      <p>${item.type} · ${formatDate(item.date)}</p>
    </article>
  `).join('');
}

function renderPipeline() {
  const board = document.getElementById('pipelineBoard');
  board.innerHTML = DEFAULT_STAGES.map(stage => {
    const projects = state.data.projects.filter(project => currentStage(project) === stage);
    return `
      <div class="stage-column">
        <strong>${stage} (${projects.length})</strong>
        <ul>
          ${projects.length ? projects.map(p => `<li>${p.title}</li>`).join('') : '<li>Sem itens</li>'}
        </ul>
      </div>
    `;
  }).join('');
}

function currentStage(project) {
  const map = {
    'Em briefing': 'Briefing',
    'Pré-produção': 'Pré-produção',
    'Produção': 'Produção',
    'Divulgação': 'Divulgação',
    'Lançado': 'Pós-lançamento'
  };
  if (!project.contractLink) return 'Contrato';
  if (!(project.checklist?.cover)) return 'Arte';
  return map[project.status] || 'Briefing';
}

function renderOpsChecklist() {
  const box = document.getElementById('opsChecklist');
  const allProjects = state.data.projects;
  const items = [
    ['Todos os projetos têm artista vinculado', allProjects.every(p => p.artistId)],
    ['Todos os projetos têm data de lançamento', allProjects.every(p => p.releaseDate)],
    ['Nenhum projeto próximo do lançamento sem áudio aprovado', allProjects.every(p => !isNearRelease(p) || p.checklist?.audio)],
    ['Nenhum projeto próximo do lançamento sem capa aprovada', allProjects.every(p => !isNearRelease(p) || p.checklist?.cover)],
    ['Nenhum projeto próximo do lançamento sem metadata revisada', allProjects.every(p => !isNearRelease(p) || p.checklist?.metadata)],
    ['Nenhum projeto próximo do lançamento sem posts planejados', allProjects.every(p => !isNearRelease(p) || p.checklist?.posts)]
  ];
  box.innerHTML = items.map(([text, ok]) => `
    <div class="checkline ${ok ? 'ok' : ''}">
      <span>${text}</span>
      <strong>${ok ? 'OK' : 'Revisar'}</strong>
    </div>
  `).join('');
}

function isNearRelease(project) {
  const delta = daysUntil(project.releaseDate);
  return delta !== null && delta <= Number(state.config.settings.releaseAlertDays);
}

function renderArtists() {
  const container = document.getElementById('artistList');
  if (!state.data.artists.length) {
    container.innerHTML = `<div class="artist-card"><h4>Nenhum artista cadastrado</h4><p>Use o botão acima para começar sua base operacional.</p></div>`;
    return;
  }
  container.innerHTML = state.data.artists.map(artist => `
    <article class="artist-card">
      <h4>${artist.name}</h4>
      <p>${artist.type} · ${artist.genre || 'Sem estilo definido'}</p>
      <div class="meta-row">
        ${artist.email ? `<span class="meta-chip">${artist.email}</span>` : ''}
        ${artist.phone ? `<span class="meta-chip">${artist.phone}</span>` : ''}
        ${artist.intakeForm ? `<a class="meta-chip" href="${artist.intakeForm}" target="_blank" rel="noreferrer">Formulário inicial</a>` : ''}
        ${artist.contractForm ? `<a class="meta-chip" href="${artist.contractForm}" target="_blank" rel="noreferrer">Contrato</a>` : ''}
        ${artist.visualForm ? `<a class="meta-chip" href="${artist.visualForm}" target="_blank" rel="noreferrer">Briefing visual</a>` : ''}
      </div>
      ${artist.notes ? `<div class="meta-row"><span class="meta-chip">${artist.notes}</span></div>` : ''}
    </article>
  `).join('');
}

function renderProjects() {
  const container = document.getElementById('projectList');
  if (!state.data.projects.length) {
    container.innerHTML = `<div class="project-card"><h4>Nenhum projeto cadastrado</h4><p>Adicione um single, EP, álbum ou campanha para começar o fluxo.</p></div>`;
    return;
  }
  container.innerHTML = state.data.projects
    .sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate))
    .map(project => {
      const artist = state.data.artists.find(a => a.id === project.artistId);
      const score = Math.round(checklistScore(project) * 100);
      return `
      <article class="project-card">
        <div class="project-header">
          <div>
            <h4>${project.title}</h4>
            <p>${project.format} · ${artist ? artist.name : 'Sem artista'} · ${project.status}</p>
          </div>
          <span class="pill ${score < 100 ? 'pill-danger' : ''}">Checklist ${score}%</span>
        </div>
        <div class="meta-row">
          <span class="meta-chip">Lançamento: ${formatDate(project.releaseDate)}</span>
          ${project.recordingDate ? `<span class="meta-chip">Gravação: ${formatDate(project.recordingDate)}</span>` : ''}
          ${project.artDeadline ? `<span class="meta-chip">Arte: ${formatDate(project.artDeadline)}</span>` : ''}
          ${project.postDeadline ? `<span class="meta-chip">Posts: ${formatDate(project.postDeadline)}</span>` : ''}
        </div>
        <div class="meta-row">
          ${project.canvaLink ? `<a class="meta-chip" href="${project.canvaLink}" target="_blank" rel="noreferrer">Canva</a>` : ''}
          ${project.contractLink ? `<a class="meta-chip" href="${project.contractLink}" target="_blank" rel="noreferrer">Contrato</a>` : ''}
          ${project.distributionLink ? `<a class="meta-chip" href="${project.distributionLink}" target="_blank" rel="noreferrer">Distribuição</a>` : ''}
        </div>
        <div class="timeline-mini">
          <div class="timeline-step"><strong>Áudio</strong>${project.checklist.audio ? 'Aprovado' : 'Pendente'}</div>
          <div class="timeline-step"><strong>Capa</strong>${project.checklist.cover ? 'Aprovada' : 'Pendente'}</div>
          <div class="timeline-step"><strong>Metadata</strong>${project.checklist.metadata ? 'Revisada' : 'Pendente'}</div>
          <div class="timeline-step"><strong>Release</strong>${project.checklist.release ? 'Pronto' : 'Pendente'}</div>
          <div class="timeline-step"><strong>Posts</strong>${project.checklist.posts ? 'Planejados' : 'Pendente'}</div>
          <div class="timeline-step"><strong>Pós</strong>${project.checklist.pitch ? 'Definido' : 'Pendente'}</div>
        </div>
        ${project.notes ? `<div class="meta-row"><span class="meta-chip">${project.notes}</span></div>` : ''}
      </article>`;
    }).join('');
}

function renderCalendar() {
  const container = document.getElementById('calendarList');
  const items = getUpcomingItems();
  container.innerHTML = items.length ? items.map(item => `
    <article class="calendar-item">
      <h4>${item.title}</h4>
      <p>${item.type} · ${formatDate(item.date)}</p>
    </article>
  `).join('') : `<article class="calendar-item"><h4>Sem agenda</h4><p>Os marcos aparecerão aqui quando você cadastrar projetos.</p></article>`;
}

function renderReports() {
  const box = document.getElementById('reportSummary');
  const projects = state.data.projects;
  const artistCount = state.data.artists.length;
  const avgChecklist = projects.length ? Math.round(projects.reduce((acc, p) => acc + checklistScore(p), 0) / projects.length * 100) : 0;
  const dueThisMonth = projects.filter(p => {
    if (!p.releaseDate) return false;
    const d = new Date(`${p.releaseDate}T12:00:00`);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const summary = [
    ['Base de artistas', artistCount],
    ['Projetos cadastrados', projects.length],
    ['Média de checklist', `${avgChecklist}%`],
    ['Lançamentos no mês', dueThisMonth],
    ['Alertas totais', getAlerts().length]
  ];
  box.innerHTML = summary.map(([label, value]) => `<div class="report-kpi"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function renderState() {
  const box = document.getElementById('systemState');
  const configured = Object.values(state.config.integrations).filter(Boolean).length;
  box.innerHTML = `
    <div class="state-item"><strong>Versão</strong><p>${BUILD.phase} · ${BUILD.version}</p></div>
    <div class="state-item"><strong>Build</strong><p>${BUILD.datetime}</p></div>
    <div class="state-item"><strong>Integrações preenchidas</strong><p>${configured} de ${Object.keys(state.config.integrations).length}</p></div>
    <div class="state-item"><strong>Armazenamento atual</strong><p>Local no navegador. Pronto para migrar para integrações Google na próxima configuração.</p></div>
  `;
}

function renderIntegrationForm() {
  const form = document.getElementById('integrationForm');
  Object.entries(state.config.integrations).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
}

function renderSettingsForm() {
  const form = document.getElementById('settingsForm');
  Object.entries(state.config.settings).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
}

function populateArtistSelect() {
  const select = document.getElementById('projectArtistSelect');
  select.innerHTML = state.data.artists.length
    ? state.data.artists.map(artist => `<option value="${artist.id}">${artist.name}</option>`).join('')
    : `<option value="">Cadastre um artista primeiro</option>`;
}

function exportJson() {
  const payload = { build: BUILD, config: state.config, data: state.data };
  downloadFile(`vale-producao-backup-${BUILD.version}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function exportCsv() {
  const header = ['titulo', 'artista', 'formato', 'status', 'lancamento', 'gravacao', 'arte', 'posts', 'checklist_percentual'];
  const rows = state.data.projects.map(project => {
    const artist = state.data.artists.find(a => a.id === project.artistId);
    return [
      project.title,
      artist?.name || '',
      project.format,
      project.status,
      project.releaseDate,
      project.recordingDate || '',
      project.artDeadline || '',
      project.postDeadline || '',
      Math.round(checklistScore(project) * 100)
    ].map(value => `"${String(value).replaceAll('"', '""')}"`).join(',');
  });
  downloadFile(`vale-producao-projetos-${BUILD.version}.csv`, [header.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8;');
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function seedDemo() {
  if (state.data.artists.length || state.data.projects.length) return;
  const artistA = { id: uid('artist'), name: 'Ariane Mazur', type: 'Solo', phone: '', email: '', genre: 'Pop', intakeForm: '', contractForm: '', visualForm: '', notes: 'Projeto de single romântico.' };
  const artistB = { id: uid('artist'), name: 'Banda Atalaia', type: 'Banda', phone: '', email: '', genre: 'Gospel', intakeForm: '', contractForm: '', visualForm: '', notes: 'EP ao vivo.' };
  state.data.artists.push(artistA, artistB);
  state.data.projects.push(
    {
      id: uid('project'),
      title: 'Bloqueado',
      artistId: artistA.id,
      format: 'Single',
      releaseDate: '2026-04-20',
      status: 'Divulgação',
      canvaLink: '',
      contractLink: '',
      distributionLink: '',
      recordingDate: '2026-03-28',
      artDeadline: '2026-04-05',
      postDeadline: '2026-04-12',
      notes: 'Revisar data antes de enviar para a distribuidora.',
      checklist: { audio: true, cover: false, metadata: true, release: true, posts: false, pitch: false }
    },
    {
      id: uid('project'),
      title: 'Ao Vivo no Vale',
      artistId: artistB.id,
      format: 'EP',
      releaseDate: '2026-05-10',
      status: 'Pré-produção',
      canvaLink: '',
      contractLink: 'https://example.com/contrato',
      distributionLink: '',
      recordingDate: '2026-04-02',
      artDeadline: '2026-04-25',
      postDeadline: '2026-05-01',
      notes: 'Definir repertório e identidade visual.',
      checklist: { audio: false, cover: false, metadata: false, release: false, posts: false, pitch: false }
    }
  );
  saveAll();
  renderAll();
}

function bindNavigation() {
  const sections = document.querySelectorAll('.section');
  const buttons = document.querySelectorAll('.nav-btn');
  const titles = {
    dashboard: ['Dashboard', 'Visão geral dos projetos e alertas críticos.'],
    artists: ['Artistas', 'Base central de artistas, bandas e contatos.'],
    projects: ['Projetos', 'Linha do tempo completa de singles, EPs e álbuns.'],
    calendar: ['Calendário', 'Marcos, prazos e sincronização com agenda.'],
    reports: ['Relatórios', 'Exportação e leitura rápida da operação.'],
    integrations: ['Integrações', 'Links, serviços externos e regras do fluxo.'],
    settings: ['Configurações', 'Parâmetros de alerta, reset e estado do sistema.']
  };
  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    const target = button.dataset.section;
    sections.forEach(section => section.classList.toggle('active', section.id === target));
    document.getElementById('sectionTitle').textContent = titles[target][0];
    document.getElementById('sectionSubtitle').textContent = titles[target][1];
  }));
}

function bindModals() {
  document.querySelectorAll('[data-open-modal]').forEach(button => {
    button.addEventListener('click', () => document.getElementById(button.dataset.openModal).showModal());
  });
}

function bindForms() {
  document.getElementById('artistForm').addEventListener('submit', event => {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    state.data.artists.push({ id: uid('artist'), ...data });
    saveAll();
    form.reset();
    document.getElementById('artistModal').close();
    renderAll();
  });

  document.getElementById('projectForm').addEventListener('submit', event => {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const checklist = {
      audio: !!form.elements.check_audio.checked,
      cover: !!form.elements.check_cover.checked,
      metadata: !!form.elements.check_metadata.checked,
      release: !!form.elements.check_release.checked,
      posts: !!form.elements.check_posts.checked,
      pitch: !!form.elements.check_pitch.checked
    };
    state.data.projects.push({
      id: uid('project'),
      title: data.title,
      artistId: data.artistId,
      format: data.format,
      releaseDate: data.releaseDate,
      status: data.status,
      canvaLink: data.canvaLink,
      contractLink: data.contractLink,
      distributionLink: data.distributionLink,
      recordingDate: data.recordingDate,
      artDeadline: data.artDeadline,
      postDeadline: data.postDeadline,
      notes: data.notes,
      checklist
    });
    saveAll();
    form.reset();
    document.getElementById('projectModal').close();
    renderAll();
  });

  document.getElementById('integrationForm').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    state.config.integrations = data;
    saveAll();
    renderState();
    alert('Integrações salvas localmente.');
  });

  document.getElementById('settingsForm').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    state.config.settings = {
      releaseAlertDays: Number(data.releaseAlertDays),
      postAlertDays: Number(data.postAlertDays),
      contractAlertDays: Number(data.contractAlertDays),
      producerName: data.producerName
    };
    saveAll();
    renderAll();
    alert('Configurações salvas.');
  });
}

function bindButtons() {
  document.getElementById('buildVersion').textContent = `${BUILD.phase} · ${BUILD.version}`;
  document.getElementById('buildTime').textContent = BUILD.datetime;
  document.getElementById('seedDemoBtn').addEventListener('click', seedDemo);
  document.getElementById('exportBtn').addEventListener('click', exportJson);
  document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm('Isso apagará todos os dados locais do app neste navegador.')) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CONFIG_KEY);
    state.data = structuredClone(DEFAULT_DATA);
    state.config = structuredClone(DEFAULT_CONFIG);
    renderAll();
  });
}

function renderAll() {
  renderStats();
  renderAlerts();
  renderUpcoming();
  renderPipeline();
  renderOpsChecklist();
  renderArtists();
  renderProjects();
  renderCalendar();
  renderReports();
  renderState();
  renderIntegrationForm();
  renderSettingsForm();
  populateArtistSelect();
  saveAll();
}

bindNavigation();
bindModals();
bindForms();
bindButtons();
renderAll();
