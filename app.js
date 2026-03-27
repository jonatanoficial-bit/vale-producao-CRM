const STORAGE_KEY = 'valeArtistFlowPhase1';

const defaultArtists = [];
const defaultProjects = [];

const sections = document.querySelectorAll('.section');
const menuLinks = document.querySelectorAll('.menu-link');
const artistForm = document.getElementById('artistForm');
const projectForm = document.getElementById('projectForm');
const artistList = document.getElementById('artistList');
const projectList = document.getElementById('projectList');
const artistSelect = document.getElementById('artistSelect');

const state = loadState();

menuLinks.forEach((button) => {
  button.addEventListener('click', () => activateSection(button.dataset.section));
});

document.getElementById('loadDemoBtn').addEventListener('click', loadDemoData);
document.getElementById('resetDataBtn').addEventListener('click', resetData);
document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);

artistForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(artistForm);
  const artist = {
    id: crypto.randomUUID(),
    name: formData.get('name').trim(),
    type: formData.get('type'),
    genre: formData.get('genre').trim(),
    contact: formData.get('contact').trim(),
    notes: formData.get('notes').trim(),
    createdAt: new Date().toISOString()
  };

  state.artists.unshift(artist);
  persist();
  artistForm.reset();
  renderAll();
});

projectForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(projectForm);
  const checkedSteps = formData.getAll('steps');
  const project = {
    id: crypto.randomUUID(),
    artistId: formData.get('artistId'),
    format: formData.get('format'),
    title: formData.get('title').trim(),
    releaseDate: formData.get('releaseDate'),
    status: formData.get('status'),
    checklistReady: formData.get('checklistReady') === 'sim',
    notes: formData.get('notes').trim(),
    steps: checkedSteps,
    createdAt: new Date().toISOString()
  };

  state.projects.unshift(project);
  persist();
  projectForm.reset();
  renderAll();
});

function activateSection(sectionId) {
  sections.forEach((section) => section.classList.toggle('active', section.id === sectionId));
  menuLinks.forEach((link) => link.classList.toggle('active', link.dataset.section === sectionId));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return { artists: defaultArtists, projects: defaultProjects };
  }
  return JSON.parse(saved);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderAll() {
  renderArtistSelect();
  renderArtists();
  renderProjects();
  renderDashboard();
  renderTimeline();
  renderReports();
}

function renderArtistSelect() {
  artistSelect.innerHTML = '';

  if (!state.artists.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Cadastre um artista primeiro';
    artistSelect.appendChild(option);
    return;
  }

  state.artists.forEach((artist) => {
    const option = document.createElement('option');
    option.value = artist.id;
    option.textContent = artist.name;
    artistSelect.appendChild(option);
  });
}

function renderArtists() {
  document.getElementById('artistCount').textContent = `${state.artists.length} artista${state.artists.length === 1 ? '' : 's'}`;
  artistList.innerHTML = '';

  if (!state.artists.length) {
    artistList.innerHTML = `<div class="empty-state">Nenhum artista cadastrado ainda. Use o formulário ao lado para começar.</div>`;
    return;
  }

  const template = document.getElementById('artistCardTemplate');
  state.artists.forEach((artist) => {
    const node = template.content.cloneNode(true);
    node.querySelector('.artist-name').textContent = artist.name;
    node.querySelector('.artist-meta').textContent = `${artist.type} • ${artist.genre || 'gênero não informado'} • ${artist.contact || 'contato não informado'}`;
    node.querySelector('.artist-notes').textContent = artist.notes || 'Sem observações iniciais.';
    artistList.appendChild(node);
  });
}

function renderProjects() {
  projectList.innerHTML = '';

  if (!state.projects.length) {
    projectList.innerHTML = `<div class="empty-state">Nenhum projeto cadastrado ainda. Depois de criar um artista, adicione um single, EP ou álbum.</div>`;
    return;
  }

  const template = document.getElementById('projectCardTemplate');
  state.projects.forEach((project) => {
    const artist = state.artists.find((item) => item.id === project.artistId);
    const risk = getProjectRisk(project);
    const node = template.content.cloneNode(true);
    node.querySelector('.project-title').textContent = project.title;
    node.querySelector('.project-meta').textContent = `${artist?.name || 'Artista removido'} • ${project.format} • ${formatDate(project.releaseDate)} • ${project.status}`;
    node.querySelector('.project-notes').textContent = project.notes || 'Sem observações adicionais.';

    const badge = node.querySelector('.project-risk');
    badge.textContent = risk.label;
    badge.classList.add(risk.badgeClass);

    const stepsWrap = node.querySelector('.project-steps');
    project.steps.forEach((step) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = stepLabel(step);
      stepsWrap.appendChild(chip);
    });

    projectList.appendChild(node);
  });
}

function renderDashboard() {
  const alerts = getCriticalAlerts();
  const deadlines = getUpcomingDeadlines();
  const heroStats = document.getElementById('heroStats');

  heroStats.innerHTML = `
    <div class="mini-stat"><span>Artistas</span><strong>${state.artists.length}</strong></div>
    <div class="mini-stat"><span>Projetos</span><strong>${state.projects.length}</strong></div>
    <div class="mini-stat"><span>Em risco</span><strong>${alerts.length}</strong></div>
    <div class="mini-stat"><span>Prazos próximos</span><strong>${deadlines.length}</strong></div>
  `;

  document.getElementById('criticalCount').textContent = alerts.length;
  document.getElementById('upcomingCount').textContent = deadlines.length;

  const criticalAlerts = document.getElementById('criticalAlerts');
  criticalAlerts.innerHTML = alerts.length
    ? alerts.map((alert) => `<div class="alert-item"><strong>${alert.title}</strong><span>${alert.message}</span></div>`).join('')
    : `<div class="empty-state">Nenhum alerta crítico agora.</div>`;

  const upcomingDeadlines = document.getElementById('upcomingDeadlines');
  upcomingDeadlines.innerHTML = deadlines.length
    ? deadlines.map((item) => `<div class="deadline-item"><strong>${item.title}</strong><span>${item.message}</span></div>`).join('')
    : `<div class="empty-state">Sem prazos próximos cadastrados.</div>`;

  const statuses = ['Briefing', 'Contrato', 'Pré-produção', 'Produção', 'Divulgação', 'Lançado'];
  const total = state.projects.length || 1;
  document.getElementById('statusSummary').innerHTML = statuses.map((status) => {
    const count = state.projects.filter((project) => project.status === status).length;
    const pct = Math.round((count / total) * 100);
    return `
      <div class="progress-item">
        <strong>${status}</strong>
        <span>${count} projeto(s)</span>
        <div class="progress-bar"><span style="width:${pct}%"></span></div>
      </div>
    `;
  }).join('');
}

function renderTimeline() {
  const timeline = document.getElementById('timelineList');
  const projects = [...state.projects].sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));

  timeline.innerHTML = projects.length
    ? projects.map((project) => {
        const artist = state.artists.find((item) => item.id === project.artistId);
        const days = daysUntil(project.releaseDate);
        return `
          <div class="timeline-item">
            <strong>${formatDate(project.releaseDate)} — ${project.title}</strong>
            <span>${artist?.name || 'Artista'} • ${project.status} • ${days >= 0 ? `${days} dia(s) restantes` : `atrasado há ${Math.abs(days)} dia(s)`}</span>
          </div>
        `;
      }).join('')
    : `<div class="empty-state">A agenda aparecerá aqui conforme os projetos forem cadastrados.</div>`;
}

function renderReports() {
  const risks = state.projects.filter((project) => getProjectRisk(project).level === 'danger').length;
  const missingContract = state.projects.filter((project) => !project.steps.includes('contract')).length;
  const visualPending = state.projects.filter((project) => !project.steps.includes('visual') || !project.steps.includes('posts')).length;

  document.getElementById('riskProjects').textContent = risks;
  document.getElementById('missingContract').textContent = missingContract;
  document.getElementById('visualPending').textContent = visualPending;
}

function getCriticalAlerts() {
  return state.projects
    .map((project) => {
      const artist = state.artists.find((item) => item.id === project.artistId);
      const days = daysUntil(project.releaseDate);
      const missingCore = !project.steps.includes('master') || !project.steps.includes('distribution');
      const missingPromo = !project.steps.includes('visual') || !project.steps.includes('posts') || !project.steps.includes('release');

      if (days <= 7 && !project.checklistReady) {
        return {
          title: `${project.title} em risco alto`,
          message: `${artist?.name || 'Artista'} tem lançamento em ${Math.max(days, 0)} dia(s), mas o checklist final ainda não foi marcado como concluído.`
        };
      }

      if (days <= 10 && missingCore) {
        return {
          title: `${project.title} sem entrega essencial`,
          message: `${artist?.name || 'Artista'} está perto do lançamento e ainda não marcou mix/master ou envio para plataforma.`
        };
      }

      if (days <= 14 && missingPromo) {
        return {
          title: `${project.title} com divulgação incompleta`,
          message: `${artist?.name || 'Artista'} ainda não tem arte, release ou cronograma de posts completo.`
        };
      }

      if (days < 0 && project.status !== 'Lançado') {
        return {
          title: `${project.title} passou da data`,
          message: `${artist?.name || 'Artista'} tinha data para ${formatDate(project.releaseDate)} e o projeto ainda não está como lançado.`
        };
      }

      return null;
    })
    .filter(Boolean);
}

function getUpcomingDeadlines() {
  return state.projects
    .map((project) => {
      const artist = state.artists.find((item) => item.id === project.artistId);
      const days = daysUntil(project.releaseDate);

      if (days >= 0 && days <= 21) {
        return {
          title: `${project.title} — ${formatDate(project.releaseDate)}`,
          message: `${artist?.name || 'Artista'} tem lançamento em ${days} dia(s). Revisar arte, posts, release e plataforma.`
        };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.message.localeCompare(b.message));
}

function getProjectRisk(project) {
  const days = daysUntil(project.releaseDate);
  const hasPromoGap = !project.steps.includes('visual') || !project.steps.includes('posts');
  const hasOperationGap = !project.steps.includes('master') || !project.steps.includes('distribution');

  if ((days <= 7 && !project.checklistReady) || days < 0) {
    return { label: 'Risco alto', level: 'danger', badgeClass: 'badge-danger' };
  }
  if (days <= 14 && (hasPromoGap || hasOperationGap)) {
    return { label: 'Atenção', level: 'warning', badgeClass: 'badge-warning' };
  }
  return { label: 'Controlado', level: 'ok', badgeClass: 'badge-success' };
}

function loadDemoData() {
  state.artists = [
    {
      id: crypto.randomUUID(),
      name: 'Lívia Rocha',
      type: 'Solo',
      genre: 'Gospel contemporâneo',
      contact: 'livia@exemplo.com',
      notes: 'Quer fortalecer identidade visual, cronograma de reels e playlists.',
      createdAt: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      name: 'Vozes da Colina',
      type: 'Banda',
      genre: 'Worship',
      contact: 'WhatsApp do líder',
      notes: 'Projeto com EP e agenda de gravação escalonada.',
      createdAt: new Date().toISOString()
    }
  ];

  state.projects = [
    {
      id: crypto.randomUUID(),
      artistId: state.artists[0].id,
      format: 'Single',
      title: 'Meu Refúgio',
      releaseDate: offsetDate(6),
      status: 'Divulgação',
      checklistReady: false,
      notes: 'Master entregue, mas falta revisão final da capa e cronograma de posts.',
      steps: ['briefing', 'contract', 'preproduction', 'recording', 'master', 'release', 'distribution'],
      createdAt: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      artistId: state.artists[1].id,
      format: 'EP',
      title: 'Céus Abertos',
      releaseDate: offsetDate(18),
      status: 'Produção',
      checklistReady: false,
      notes: 'Falta fechar identidade visual do EP e sequência de publicações.',
      steps: ['briefing', 'preproduction', 'recording', 'visual'],
      createdAt: new Date().toISOString()
    }
  ];

  persist();
  renderAll();
}

function resetData() {
  if (!window.confirm('Tem certeza que deseja apagar todos os dados locais desta fase?')) return;
  state.artists = [];
  state.projects = [];
  persist();
  renderAll();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'vale-producao-fase1-export.json');
}

function exportCsv() {
  const header = ['artista', 'titulo', 'formato', 'lancamento', 'status', 'checklist', 'etapas', 'observacoes'];
  const rows = state.projects.map((project) => {
    const artist = state.artists.find((item) => item.id === project.artistId);
    return [
      artist?.name || '',
      project.title,
      project.format,
      project.releaseDate,
      project.status,
      project.checklistReady ? 'sim' : 'nao',
      project.steps.map(stepLabel).join(' | '),
      safeCsv(project.notes)
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',');
  });

  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, 'vale-producao-fase1-export.csv');
}

function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function safeCsv(value = '') {
  return String(value).replace(/\n/g, ' ');
}

function formatDate(dateString) {
  if (!dateString) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(`${dateString}T12:00:00`));
}

function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateString}T00:00:00`);
  const diff = target - today;
  return Math.ceil(diff / 86400000);
}

function stepLabel(step) {
  const labels = {
    briefing: 'Briefing',
    contract: 'Contrato',
    preproduction: 'Pré-produção',
    recording: 'Captação',
    master: 'Mix/Master',
    visual: 'Arte',
    release: 'Release',
    posts: 'Posts',
    distribution: 'Plataforma',
    postlaunch: 'Pós-lançamento'
  };
  return labels[step] || step;
}

function offsetDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

renderAll();
