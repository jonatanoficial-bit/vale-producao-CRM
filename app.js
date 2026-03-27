
const STORAGE_KEY = 'vale-producao-fase5';
const SETTINGS_KEY = 'vale-producao-integracoes-fase5';

const initialState = {
  projetos: [],
  lembretes: []
};

const defaultSettings = {
  appsScriptUrl: '',
  formInicial: '',
  formContrato: '',
  calendario: ''
};

let state = loadState();
let settings = loadSettings();

function loadState(){
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(initialState);
  } catch {
    return structuredClone(initialState);
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}

function loadSettings(){
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || structuredClone(defaultSettings);
  } catch {
    return structuredClone(defaultSettings);
  }
}

function saveSettings(){
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  renderIntegrationStatus();
}

function uid(){
  return 'id-' + Math.random().toString(36).slice(2, 11);
}

function formatDate(dateString){
  if(!dateString) return 'Sem data';
  const [y,m,d] = dateString.split('-');
  return `${d}/${m}/${y}`;
}

function diffDays(dateString){
  if(!dateString) return 9999;
  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(dateString + 'T00:00:00');
  return Math.round((target - today) / (1000*60*60*24));
}

function getProjectStatus(project){
  const days = diffDays(project.lancamento);
  const ck = project.checklist;
  const checklistDone = Object.values(ck).every(Boolean);

  if(days < 0) return 'ATRASADO';
  if(days <= 7 && !checklistDone) return 'EM RISCO';
  if(checklistDone) return 'PRONTO';
  return 'EM PRODUÇÃO';
}

function getStatusClass(status){
  if(status === 'PRONTO') return 'status-pronto';
  if(status === 'EM RISCO') return 'status-risco';
  if(status === 'ATRASADO') return 'status-atrasado';
  return 'status-producao';
}

function addHistory(project, action){
  project.historico.unshift({
    id: uid(),
    action,
    timestamp: new Date().toISOString()
  });
}

function projectToCsvRow(project){
  const ck = project.checklist;
  const fields = [
    project.artista,
    project.titulo,
    project.tipo,
    project.lancamento,
    getProjectStatus(project),
    ck.audio,
    ck.capa,
    ck.release,
    ck.posts,
    ck.distribuicao,
    (project.observacoes || '').replaceAll('\n',' ')
  ];
  return fields.map(v => `"${String(v).replaceAll('"','""')}"`).join(',');
}

function exportJson(){
  const blob = new Blob([JSON.stringify({version:'v5.0.0', exportedAt: new Date().toISOString(), ...state}, null, 2)], {type:'application/json'});
  downloadBlob(blob, `vale-producao-export-${new Date().toISOString().slice(0,10)}.json`);
}

function exportCsv(){
  const header = 'artista,titulo,tipo,lancamento,status,audio,capa,release,posts,distribuicao,observacoes';
  const rows = state.projetos.map(projectToCsvRow);
  const blob = new Blob([[header, ...rows].join('\n')], {type:'text/csv;charset=utf-8;'});
  downloadBlob(blob, `vale-producao-relatorio-${new Date().toISOString().slice(0,10)}.csv`);
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function generateCalendarUrl(project){
  const start = (project.lancamento || '').replaceAll('-', '');
  const endDate = new Date((project.lancamento || '') + 'T00:00:00');
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString().slice(0,10).replaceAll('-', '');
  const text = encodeURIComponent(`Lançamento - ${project.artista} | ${project.titulo}`);
  const details = encodeURIComponent(`Projeto: ${project.titulo}\nArtista: ${project.artista}\nStatus atual: ${getProjectStatus(project)}\nObservações: ${project.observacoes || ''}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}`;
}

function renderNav(){
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('view-' + btn.dataset.view).classList.add('active');
      document.getElementById('pageTitle').textContent = btn.textContent;
    };
  });
}

function renderDashboard(){
  const projetos = state.projetos;
  const statuses = projetos.map(getProjectStatus);

  byId('metricProjetos').textContent = projetos.length;
  byId('metricRisco').textContent = statuses.filter(s => s === 'EM RISCO').length;
  byId('metricAtrasado').textContent = statuses.filter(s => s === 'ATRASADO').length;
  byId('metricPronto').textContent = statuses.filter(s => s === 'PRONTO').length;

  const alertas = [];
  projetos.forEach(project => {
    const status = getProjectStatus(project);
    const days = diffDays(project.lancamento);

    if(status === 'EM RISCO'){
      alertas.push({title: `${project.artista} - ${project.titulo}`, sub: `Lançamento em ${days} dia(s) com pendências obrigatórias.`});
    }
    if(status === 'ATRASADO'){
      alertas.push({title: `${project.artista} - ${project.titulo}`, sub: `A data de lançamento já passou e o projeto exige revisão imediata.`});
    }
  });

  renderSimpleList('alertasList', alertas.length ? alertas : [{title:'Nenhum alerta crítico agora', sub:'Os projetos estão sob controle.'}], 'alert-item');

  const proximos = [...projetos]
    .sort((a,b) => (a.lancamento || '').localeCompare(b.lancamento || ''))
    .slice(0, 6)
    .map(project => ({
      title: `${formatDate(project.lancamento)} · ${project.artista}`,
      sub: `${project.titulo} · ${getProjectStatus(project)}`
    }));

  renderSimpleList('proximosList', proximos.length ? proximos : [{title:'Nenhum projeto cadastrado', sub:'Crie o primeiro projeto para ver a agenda crítica.'}], 'item');

  const pipeline = [
    {label:'Briefing / Entrada', value: projetos.filter(p => p.formInicial).length},
    {label:'Contrato / Dados', value: projetos.filter(p => p.formContrato).length},
    {label:'Produção / Captação', value: projetos.filter(p => !p.checklist.audio).length},
    {label:'Prontos para lançar', value: projetos.filter(p => getProjectStatus(p) === 'PRONTO').length}
  ];

  const pipelineBox = byId('pipelineResumo');
  pipelineBox.innerHTML = '';
  pipeline.forEach(item => {
    const div = document.createElement('div');
    div.className = 'pipeline-item';
    div.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
    pipelineBox.appendChild(div);
  });
}

function renderProjects(){
  const list = byId('projetosList');
  list.innerHTML = '';
  const query = byId('buscaProjetos').value.trim().toLowerCase();
  const template = byId('projectCardTemplate');

  const filtered = state.projetos.filter(project => {
    const target = `${project.artista} ${project.titulo}`.toLowerCase();
    return target.includes(query);
  });

  if(!filtered.length){
    list.innerHTML = '<div class="item"><div class="item-title">Nenhum projeto encontrado</div><div class="item-sub">Cadastre um projeto ou ajuste sua busca.</div></div>';
    return;
  }

  filtered
    .sort((a,b) => (a.lancamento || '').localeCompare(b.lancamento || ''))
    .forEach(project => {
      const node = template.content.firstElementChild.cloneNode(true);
      const status = getProjectStatus(project);
      node.querySelector('.project-title').textContent = `${project.artista} — ${project.titulo}`;
      node.querySelector('.project-meta').textContent = `${project.tipo} · ${project.id}`;
      const badge = node.querySelector('.status-badge');
      badge.textContent = status;
      badge.classList.add(getStatusClass(status));
      node.querySelector('.project-dates').innerHTML = `
        Lançamento: <strong>${formatDate(project.lancamento)}</strong><br>
        Form inicial: ${project.formInicial ? 'configurado' : 'não informado'} ·
        Form contrato: ${project.formContrato ? 'configurado' : 'não informado'}
      `;

      const miniGrid = node.querySelector('.mini-grid');
      const miniItems = [
        ['Áudio', project.checklist.audio],
        ['Capa', project.checklist.capa],
        ['Release', project.checklist.release],
        ['Posts', project.checklist.posts],
        ['Distribuição', project.checklist.distribuicao]
      ];
      miniGrid.innerHTML = miniItems.map(([label, ok]) => `
        <div class="mini-box">${label}<strong>${ok ? 'OK' : 'Pendente'}</strong></div>
      `).join('');

      node.querySelector('.btn-remarcar').onclick = () => remarcaProjeto(project.id);
      node.querySelector('.btn-historico').onclick = () => registrarEventoManual(project.id);
      node.querySelector('.btn-calendar').onclick = () => window.open(generateCalendarUrl(project), '_blank');
      node.querySelector('.btn-excluir').onclick = () => excluirProjeto(project.id);

      list.appendChild(node);
    });

  renderProjectSelect();
}

function renderAgenda(){
  const agenda = [];
  state.projetos.forEach(project => {
    agenda.push({
      title: `${formatDate(project.lancamento)} · Lançamento`,
      sub: `${project.artista} — ${project.titulo}`
    });

    const days = diffDays(project.lancamento);
    if(days <= 15){
      agenda.push({
        title: `Revisão crítica`,
        sub: `${project.artista} — ${project.titulo} · faltam ${days} dia(s)`
      });
    }
  });

  state.lembretes.forEach(item => {
    const projeto = state.projetos.find(p => p.id === item.projectId);
    agenda.push({
      title: `${formatDate(item.data)} · ${item.titulo}`,
      sub: `${projeto ? projeto.artista + ' — ' + projeto.titulo : 'Projeto removido'}`
    });
  });

  agenda.sort((a,b) => a.title.localeCompare(b.title));
  renderSimpleList('agendaList', agenda.length ? agenda : [{title:'Agenda vazia', sub:'Adicione projetos ou lembretes.'}], 'agenda-item');
}

function renderReports(){
  const projetos = state.projetos;
  const resumo = `
    <strong>Total de projetos:</strong> ${projetos.length}<br>
    <strong>Em produção:</strong> ${projetos.filter(p => getProjectStatus(p) === 'EM PRODUÇÃO').length}<br>
    <strong>Prontos:</strong> ${projetos.filter(p => getProjectStatus(p) === 'PRONTO').length}<br>
    <strong>Em risco:</strong> ${projetos.filter(p => getProjectStatus(p) === 'EM RISCO').length}<br>
    <strong>Atrasados:</strong> ${projetos.filter(p => getProjectStatus(p) === 'ATRASADO').length}
  `;
  byId('relatorioResumo').innerHTML = resumo;

  const bloqueados = projetos
    .filter(p => !Object.values(p.checklist).every(Boolean))
    .map(p => ({
      title: `${p.artista} — ${p.titulo}`,
      sub: `Bloqueado por checklist incompleto · status atual: ${getProjectStatus(p)}`
    }));

  renderSimpleList('relatorioBloqueados', bloqueados.length ? bloqueados : [{title:'Nenhum projeto bloqueado', sub:'Todos os checklists obrigatórios foram concluídos.'}], 'item');

  const historico = [];
  projetos.forEach(project => {
    project.historico.forEach(h => {
      historico.push({
        title: `${project.artista} — ${project.titulo}`,
        sub: `${new Date(h.timestamp).toLocaleString('pt-BR')} · ${h.action}`
      });
    });
  });
  historico.sort((a,b) => b.sub.localeCompare(a.sub));

  renderSimpleList('historicoList', historico.length ? historico : [{title:'Sem histórico', sub:'As alterações aparecerão aqui.'}], 'history-item');
}

function renderIntegrationStatus(){
  const statuses = [
    {title:'Apps Script', sub: settings.appsScriptUrl ? 'Configurado' : 'Pendente'},
    {title:'Google Form inicial', sub: settings.formInicial ? 'Configurado' : 'Pendente'},
    {title:'Google Form contratual', sub: settings.formContrato ? 'Configurado' : 'Pendente'},
    {title:'Google Calendar', sub: settings.calendario ? 'Configurado' : 'Pendente'}
  ];
  renderSimpleList('integracoesStatus', statuses, 'status-item');

  byId('appsScriptUrl').value = settings.appsScriptUrl || '';
  byId('cfgFormInicial').value = settings.formInicial || '';
  byId('cfgFormContrato').value = settings.formContrato || '';
  byId('cfgCalendario').value = settings.calendario || '';
}

function renderSimpleList(targetId, items, className='item'){
  const root = byId(targetId);
  root.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = className;
    div.innerHTML = `<div class="item-title">${item.title}</div><div class="item-sub">${item.sub}</div>`;
    root.appendChild(div);
  });
}

function renderProjectSelect(){
  const select = byId('lembreteProjeto');
  const current = select.value;
  select.innerHTML = state.projetos.map(project => `<option value="${project.id}">${project.artista} — ${project.titulo}</option>`).join('');
  if(current) select.value = current;
}

function renderAll(){
  renderDashboard();
  renderProjects();
  renderAgenda();
  renderReports();
  renderIntegrationStatus();
}

function handleProjectSubmit(event){
  event.preventDefault();
  const project = {
    id: uid(),
    artista: byId('artista').value.trim(),
    titulo: byId('titulo').value.trim(),
    tipo: byId('tipo').value,
    lancamento: byId('lancamento').value,
    formInicial: byId('formInicial').value.trim(),
    formContrato: byId('formContrato').value.trim(),
    observacoes: byId('observacoes').value.trim(),
    checklist: {
      audio: byId('ckAudio').checked,
      capa: byId('ckCapa').checked,
      release: byId('ckRelease').checked,
      posts: byId('ckPosts').checked,
      distribuicao: byId('ckDistribuicao').checked
    },
    historico: []
  };

  addHistory(project, 'Projeto criado');
  state.projetos.push(project);
  event.target.reset();
  saveState();
}

function handleReminderSubmit(event){
  event.preventDefault();
  if(!byId('lembreteProjeto').value) return alert('Cadastre um projeto antes de criar lembrete.');
  state.lembretes.push({
    id: uid(),
    projectId: byId('lembreteProjeto').value,
    titulo: byId('lembreteTitulo').value.trim(),
    data: byId('lembreteData').value,
    descricao: byId('lembreteDescricao').value.trim()
  });
  event.target.reset();
  saveState();
}

function handleIntegrationsSubmit(event){
  event.preventDefault();
  settings.appsScriptUrl = byId('appsScriptUrl').value.trim();
  settings.formInicial = byId('cfgFormInicial').value.trim();
  settings.formContrato = byId('cfgFormContrato').value.trim();
  settings.calendario = byId('cfgCalendario').value.trim();
  saveSettings();
  alert('Integrações salvas localmente neste navegador.');
}

function remarcaProjeto(projectId){
  const project = state.projetos.find(p => p.id === projectId);
  if(!project) return;
  const current = project.lancamento || '';
  const next = prompt('Nova data de lançamento (AAAA-MM-DD):', current);
  if(!next || next === current) return;
  addHistory(project, `Remarcação de ${current || 'sem data'} para ${next}`);
  project.lancamento = next;
  saveState();
}

function registrarEventoManual(projectId){
  const project = state.projetos.find(p => p.id === projectId);
  if(!project) return;
  const action = prompt('Descreva o evento a registrar no histórico:');
  if(!action) return;
  addHistory(project, action);
  saveState();
}

function excluirProjeto(projectId){
  const project = state.projetos.find(p => p.id === projectId);
  if(!project) return;
  if(!confirm(`Excluir ${project.artista} — ${project.titulo}?`)) return;
  state.projetos = state.projetos.filter(p => p.id !== projectId);
  state.lembretes = state.lembretes.filter(l => l.projectId !== projectId);
  saveState();
}

function seedExample(){
  if(state.projetos.length && !confirm('Isso vai adicionar exemplos ao que já existe. Continuar?')) return;

  const examples = [
    {
      id: uid(),
      artista: 'Ariane Mazur',
      titulo: 'Novo Amanhã',
      tipo: 'Single',
      lancamento: new Date(Date.now() + 5*24*60*60*1000).toISOString().slice(0,10),
      formInicial: 'https://forms.google.com/exemplo1',
      formContrato: 'https://forms.google.com/exemplo2',
      observacoes: 'Projeto com necessidade de reforço de divulgação em reels.',
      checklist: {audio:true, capa:false, release:true, posts:false, distribuicao:false},
      historico: []
    },
    {
      id: uid(),
      artista: 'Juh Silva',
      titulo: 'Bloqueado',
      tipo: 'Single',
      lancamento: new Date(Date.now() + 18*24*60*60*1000).toISOString().slice(0,10),
      formInicial: '',
      formContrato: '',
      observacoes: 'Verificar playlisting 15 dias após lançamento.',
      checklist: {audio:true, capa:true, release:true, posts:true, distribuicao:true},
      historico: []
    },
    {
      id: uid(),
      artista: 'Atalaia Índio',
      titulo: 'Raízes',
      tipo: 'EP',
      lancamento: new Date(Date.now() - 2*24*60*60*1000).toISOString().slice(0,10),
      formInicial: '',
      formContrato: '',
      observacoes: 'Projeto exigiu remarcação e revisão de master.',
      checklist: {audio:false, capa:true, release:false, posts:true, distribuicao:false},
      historico: []
    }
  ];

  examples.forEach(project => {
    addHistory(project, 'Projeto criado via exemplo');
    if(project.artista === 'Atalaia Índio') addHistory(project, 'Remarcado anteriormente por necessidade de regravação');
  });

  state.projetos.push(...examples);
  state.lembretes.push({
    id: uid(),
    projectId: examples[0].id,
    titulo: 'Revisar data na distribuidora',
    data: new Date(Date.now() + 2*24*60*60*1000).toISOString().slice(0,10),
    descricao: 'Conferir se a data está correta e se houve remarcação'
  });
  saveState();
}

async function sendToAppsScript(){
  if(!settings.appsScriptUrl){
    alert('Configure primeiro a URL do Apps Script na área de Integrações.');
    return;
  }

  try{
    const response = await fetch(settings.appsScriptUrl, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        source: 'Vale Producao Fase 5',
        exportedAt: new Date().toISOString(),
        projetos: state.projetos,
        lembretes: state.lembretes
      })
    });

    if(!response.ok) throw new Error('Falha ao enviar');
    alert('Projetos enviados ao Apps Script com sucesso.');
  }catch(error){
    alert('Não foi possível concluir o envio. Verifique a URL publicada do Apps Script e as permissões do deploy.');
  }
}

function bindActions(){
  byId('projetoForm').addEventListener('submit', handleProjectSubmit);
  byId('lembreteForm').addEventListener('submit', handleReminderSubmit);
  byId('integracoesForm').addEventListener('submit', handleIntegrationsSubmit);
  byId('buscaProjetos').addEventListener('input', renderProjects);

  byId('btnExportJson').onclick = exportJson;
  byId('btnExportCsv').onclick = exportCsv;
  byId('btnSeed').onclick = seedExample;
  byId('btnEnviarAppsScript').onclick = sendToAppsScript;

  byId('btnAbrirFormInicial').onclick = () => settings.formInicial ? window.open(settings.formInicial, '_blank') : alert('Configure o link do formulário inicial.');
  byId('btnAbrirFormContrato').onclick = () => settings.formContrato ? window.open(settings.formContrato, '_blank') : alert('Configure o link do formulário contratual.');
  byId('btnAbrirCalendario').onclick = () => settings.calendario ? window.open(settings.calendario, '_blank') : alert('Configure o link do calendário.');
}

function byId(id){
  return document.getElementById(id);
}

renderNav();
bindActions();
renderAll();
