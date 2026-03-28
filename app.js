
const STORAGE='vale-producao-fase9', SETTINGS='vale-producao-settings-fase9', SESSION='vale-producao-session-fase9';
const defaultState={users:[{id:'u-admin',role:'admin',name:'Administrador',username:'admin',password:'1234',notes:'Acesso padrão'}],projects:[],approvals:[],schedule:[]};
const defaultSettings={apps:'',inicial:'',contrato:'',calendar:''};
let state=loadJson(STORAGE,defaultState), settings=loadJson(SETTINGS,defaultSettings), session=loadJson(SESSION,null);

function loadJson(k,f){try{const r=localStorage.getItem(k);return r?JSON.parse(r):structuredClone(f);}catch{return structuredClone(f);}}
function saveState(){localStorage.setItem(STORAGE,JSON.stringify(state));renderAll();}
function saveSettings(){localStorage.setItem(SETTINGS,JSON.stringify(settings));renderSettings();}
function saveSession(){if(session)localStorage.setItem(SESSION,JSON.stringify(session));else localStorage.removeItem(SESSION);updateShellVisibility();}
function uid(){return 'id-'+Math.random().toString(36).slice(2,10);}
function byId(id){return document.getElementById(id);}
function itemHtml(t,s){return `<div class="item"><div class="item-title">${t}</div><div class="item-sub">${s}</div></div>`;}
function formatDate(v){if(!v)return 'Sem data';const p=v.split('-');return `${p[2]}/${p[1]}/${p[0]}`;}
function diffDays(v){if(!v)return 9999;const t=new Date();t.setHours(0,0,0,0);const d=new Date(v+'T00:00:00');return Math.round((d-t)/86400000);}
function addHistory(p,a){p.history.unshift({id:uid(),action:a,ts:new Date().toISOString()});}
function pipelineComplete(p){return Object.values(p.pipeline).every(Boolean);}
function getStatus(p){const d=diffDays(p.lancamento);if(d<0)return 'ATRASADO';if(d<=7&&!pipelineComplete(p))return 'EM RISCO';if(pipelineComplete(p))return 'PRONTO';return 'EM PRODUÇÃO';}
function badgeClass(s){if(s==='PRONTO')return 'badge-pronto';if(s==='EM RISCO')return 'badge-risco';if(s==='ATRASADO')return 'badge-atrasado';return 'badge-producao';}
function priorityScore(p){const d=diffDays(p.lancamento);let s=0;if(getStatus(p)==='ATRASADO')s+=100;if(getStatus(p)==='EM RISCO')s+=60;if(p.contract.status!=='Assinado')s+=12;if(!pipelineComplete(p))s+=25;s+=Math.max(0,30-Math.max(d,0));return s;}
function getCurrentUser(){return session?state.users.find(u=>u.id===session.userId)||null:null;}
function getVisibleProjects(){const u=getCurrentUser();if(!u)return[];return u.role==='admin'?state.projects:state.projects.filter(p=>p.artistUserId===u.id);}
function calendarUrl(p){const start=(p.lancamento||'').replaceAll('-','');const endDate=new Date((p.lancamento||'')+'T00:00:00');endDate.setDate(endDate.getDate()+1);const end=endDate.toISOString().slice(0,10).replaceAll('-','');const text=encodeURIComponent(`Lançamento - ${p.artista} | ${p.titulo}`);const details=encodeURIComponent(`Projeto: ${p.titulo}\nArtista: ${p.artista}\nContrato: ${p.contract.status}\nStatus: ${getStatus(p)}`);return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}`;}

function updateShellVisibility(){
  const logged=!!getCurrentUser();
  byId('loginScreen').classList.toggle('hidden',logged);
  byId('appShell').classList.toggle('hidden',!logged);
  if(logged){
    const u=getCurrentUser();
    byId('sessionInfo').textContent=`${u.role==='admin'?'Admin':'Artista'} · ${u.name}`;
    buildNav(); renderAll();
  }
}
function buildNav(){
  const u=getCurrentUser(), nav=byId('navMenu');
  const items=u.role==='admin'
    ? [['dashboard','Dashboard'],['projetos','Projetos'],['aprovacoes','Aprovações'],['cronograma','Cronograma'],['artistas','Artistas'],['contratos','Contratos'],['portal','Portal'],['integracoes','Integrações']]
    : [['dashboard','Dashboard'],['portal','Meu Portal']];
  nav.innerHTML=items.map((it,i)=>`<button class="nav-btn ${i===0?'active':''}" data-view="${it[0]}">${it[1]}</button>`).join('');
  document.querySelectorAll('.nav-btn').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');showView(btn.dataset.view);});
  showView(items[0][0]);
}
function showView(id){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));byId('view-'+id).classList.add('active');byId('pageTitle').textContent=document.querySelector(`.nav-btn[data-view="${id}"]`)?.textContent||'Painel';}

function renderDashboard(){
  const projects=getVisibleProjects(), dashboard=byId('view-dashboard');
  const total=projects.length, prontos=projects.filter(p=>getStatus(p)==='PRONTO').length, risco=projects.filter(p=>getStatus(p)==='EM RISCO').length, atrasado=projects.filter(p=>getStatus(p)==='ATRASADO').length;
  const tops=[...projects].sort((a,b)=>priorityScore(b)-priorityScore(a)).slice(0,6);
  const pendingApprovals=state.approvals.filter(a=>projectVisible(a.projectId) && a.status==='Pendente').length;
  const pendingSchedule=state.schedule.filter(s=>projectVisible(s.projectId) && s.status!=='Publicado').length;
  dashboard.innerHTML=`<div class="cards-grid">
  <article class="metric-card"><span>Total</span><strong>${total}</strong></article>
  <article class="metric-card"><span>Prontos</span><strong>${prontos}</strong></article>
  <article class="metric-card"><span>Aprovações pendentes</span><strong>${pendingApprovals}</strong></article>
  <article class="metric-card"><span>Cronograma ativo</span><strong>${pendingSchedule}</strong></article></div>
  <div class="panel-grid">
    <section class="panel"><div class="panel-header"><h3>Prioridade operacional</h3></div><div class="stack-list">${tops.length?tops.map(p=>itemHtml(`${p.artista} — ${p.titulo}`,`Prioridade ${priorityScore(p)} · ${getStatus(p)} · lançamento ${formatDate(p.lancamento)}`)).join(''):itemHtml('Sem projetos','Cadastre projetos para iniciar.')}</div></section>
    <section class="panel"><div class="panel-header"><h3>Gargalos identificados</h3></div><div class="stack-list">
      ${itemHtml('Contratos pendentes',`${projects.filter(p=>p.contract.status!=='Assinado').length} projeto(s)`)}
      ${itemHtml('Aprovações pendentes',`${pendingApprovals} item(ns)`)}
      ${itemHtml('Posts não publicados',`${state.schedule.filter(s=>projectVisible(s.projectId) && s.status!=='Publicado').length} item(ns)`)}
      ${itemHtml('Projetos em risco',`${risco + atrasado} projeto(s)`)}
    </div></section>
  </div>`;
}
function projectVisible(projectId){return !!getVisibleProjects().find(p=>p.id===projectId);}
function renderProjects(){
  const u=getCurrentUser();
  byId('projectFormPanel').style.display=u.role==='admin'?'':'none';
  const list=byId('projectList'), q=(byId('buscaProjetos').value||'').trim().toLowerCase();
  const template=byId('projectTemplate'); list.innerHTML='';
  const projects=[...getVisibleProjects()].filter(p=>`${p.artista} ${p.titulo}`.toLowerCase().includes(q)).sort((a,b)=>priorityScore(b)-priorityScore(a));
  if(!projects.length){list.innerHTML=itemHtml('Nenhum projeto encontrado','Cadastre um projeto ou ajuste a busca.'); return;}
  projects.forEach(project=>{
    const node=template.content.firstElementChild.cloneNode(true), status=getStatus(project);
    const approvals=state.approvals.filter(a=>a.projectId===project.id);
    const schedule=state.schedule.filter(s=>s.projectId===project.id);
    node.querySelector('.p-title').textContent=`${project.artista} — ${project.titulo}`;
    node.querySelector('.p-meta').textContent=`${project.tipo} · contrato ${project.contract.status} · prioridade ${priorityScore(project)}`;
    const badge=node.querySelector('.badge'); badge.textContent=status; badge.classList.add(badgeClass(status));
    node.querySelector('.p-dates').innerHTML=`Lançamento: <strong>${formatDate(project.lancamento)}</strong><br>Contrato: ${project.contract.status}${project.contract.link?' · link disponível':' · sem link'} · Aprovações: ${approvals.length} · Cronograma: ${schedule.length}`;
    node.querySelector('.mini-grid').innerHTML=[['Entrada',project.pipeline.entrada],['Contrato',project.pipeline.contrato],['Mix',project.pipeline.mix],['Arte',project.pipeline.arte],['Distribuição',project.pipeline.distribuicao]].map(it=>`<div class="mini-box">${it[0]}<strong>${it[1]?'OK':'Pendente'}</strong></div>`).join('');
    const admin=u.role==='admin';
    const br=node.querySelector('.btn-remarcar'), be=node.querySelector('.btn-evento'), bx=node.querySelector('.btn-excluir'), bc=node.querySelector('.btn-contrato'), bcal=node.querySelector('.btn-calendar'), bl=node.querySelector('.btn-lancar');
    if(!admin){br.style.display='none';be.style.display='none';bx.style.display='none';bl.style.display='none';}
    else {
      br.onclick=()=>remarca(project.id); be.onclick=()=>registrarEvento(project.id); bx.onclick=()=>excluirProjeto(project.id);
      if(!pipelineComplete(project)){bl.textContent='Lançamento bloqueado'; bl.disabled=true;} else {bl.onclick=()=>confirmarLancamento(project.id);}
    }
    bc.onclick=()=>project.contract.link?window.open(project.contract.link,'_blank'):alert('Sem link de contrato neste projeto.');
    bcal.onclick=()=>window.open(calendarUrl(project),'_blank');
    project.history.slice(0,4).forEach(h=>{const div=document.createElement('div'); div.className='history-row'; div.textContent=`${new Date(h.ts).toLocaleString('pt-BR')} · ${h.action}`; node.querySelector('.history-box').appendChild(div);});
    list.appendChild(node);
  });
  populateProjectSelects();
}
function populateProjectSelects(){
  const options=getVisibleProjects().map(p=>`<option value="${p.id}">${p.artista} — ${p.titulo}</option>`).join('');
  if(byId('approvalProject')) byId('approvalProject').innerHTML=options;
  if(byId('scheduleProject')) byId('scheduleProject').innerHTML=options;
}
function renderApprovals(){
  const u=getCurrentUser();
  if(u.role!=='admin'){ byId('approvalFormPanel').style.display='none'; return; }
  const approvals=state.approvals.filter(a=>projectVisible(a.projectId));
  byId('approvalList').innerHTML=approvals.length
    ? approvals.map(a=>{const p=state.projects.find(x=>x.id===a.projectId); return itemHtml(`${a.type} · ${a.status}`, `${p ? p.artista + ' — ' + p.titulo : 'Projeto'}${a.link ? ' · link disponível' : ''}`);}).join('')
    : itemHtml('Sem aprovações', 'Crie solicitações de aprovação para capa, release, cronograma ou master.');
}
function renderSchedule(){
  const u=getCurrentUser();
  if(u.role!=='admin'){ byId('scheduleFormPanel').style.display='none'; return; }
  const items=state.schedule.filter(s=>projectVisible(s.projectId)).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  byId('scheduleList').innerHTML=items.length
    ? items.map(s=>{const p=state.projects.find(x=>x.id===s.projectId); return itemHtml(`${formatDate(s.date)} · ${s.type} · ${s.status}`, `${p ? p.artista + ' — ' + p.titulo : 'Projeto'} · ${s.notes || 'Sem descrição'}`);}).join('')
    : itemHtml('Sem cronograma', 'Adicione teasers, reels, pré-save, lançamento e pós-lançamento.');
}
function renderArtists(){if(getCurrentUser().role!=='admin')return; const artists=state.users.filter(u=>u.role==='artist'); byId('artistList').innerHTML=artists.length?artists.map(a=>itemHtml(`${a.name} · usuário ${a.username}`,a.notes||'Sem observações')).join(''):itemHtml('Nenhum artista cadastrado','Crie acessos para liberar o portal.');}
function renderContracts(){if(getCurrentUser().role!=='admin')return; const ps=state.projects; byId('contractSummary').innerHTML=[itemHtml('Pendentes',`${ps.filter(p=>p.contract.status==='Pendente').length} projeto(s)`),itemHtml('Enviados',`${ps.filter(p=>p.contract.status==='Enviado').length} projeto(s)`),itemHtml('Assinados',`${ps.filter(p=>p.contract.status==='Assinado').length} projeto(s)`)].join(''); byId('contractProjects').innerHTML=ps.length?ps.map(p=>itemHtml(`${p.artista} — ${p.titulo}`,`Contrato ${p.contract.status}${p.contract.link?' · link cadastrado':''}`)).join(''):itemHtml('Sem projetos','Os contratos aparecerão aqui.');}
function renderPortal(){
  const user=getCurrentUser();
  const ps=getVisibleProjects();
  byId('portalList').innerHTML=ps.length?ps.map(p=>itemHtml(`${p.artista} — ${p.titulo}`,`Status ${getStatus(p)} · lançamento ${formatDate(p.lancamento)} · contrato ${p.contract.status}`)).join(''):itemHtml('Nenhum projeto disponível','Quando houver projetos vinculados, eles aparecerão aqui.');
  const approvals=state.approvals.filter(a=>projectVisible(a.projectId));
  byId('portalApprovals').innerHTML=approvals.length
    ? approvals.map(a=>{const p=state.projects.find(x=>x.id===a.projectId); return itemHtml(`${a.type} · ${a.status}`, `${p ? p.titulo : 'Projeto'}${a.notes ? ' · ' + a.notes : ''}`);}).join('')
    : itemHtml('Sem aprovações', user.role==='artist' ? 'Aqui aparecerão seus itens para aprovação e acompanhamento.' : 'Sem itens cadastrados.');
}
function renderSettings(){if(getCurrentUser().role!=='admin')return; byId('cfgApps').value=settings.apps||''; byId('cfgInicial').value=settings.inicial||''; byId('cfgContrato').value=settings.contrato||''; byId('cfgCalendar').value=settings.calendar||''; byId('settingsStatus').innerHTML=[itemHtml('Apps Script',settings.apps?'Configurado':'Pendente'),itemHtml('Google Form inicial',settings.inicial?'Configurado':'Pendente'),itemHtml('Google Form contratual',settings.contrato?'Configurado':'Pendente'),itemHtml('Google Calendar',settings.calendar?'Configurado':'Pendente')].join('');}
function renderAll(){const u=getCurrentUser(); if(!u)return; renderDashboard(); renderProjects(); renderApprovals(); renderSchedule(); renderArtists(); renderContracts(); renderPortal(); renderSettings();}

function handleLogin(e){e.preventDefault(); const role=byId('loginRole').value, user=byId('loginUser').value.trim(), pass=byId('loginPass').value.trim(); const found=state.users.find(u=>u.role===role&&u.username===user&&u.password===pass); if(!found)return alert('Credenciais inválidas.'); session={userId:found.id}; saveSession();}
function handleProjectSubmit(e){e.preventDefault(); const artistName=byId('artista').value.trim(); const artistUser=state.users.find(u=>u.role==='artist'&&u.name.toLowerCase()===artistName.toLowerCase()); const p={id:uid(),artistUserId:artistUser?artistUser.id:null,artista:artistName,titulo:byId('titulo').value.trim(),tipo:byId('tipo').value,lancamento:byId('lancamento').value,observacoes:byId('observacoes').value.trim(),contract:{status:byId('contratoStatus').value,link:byId('contratoLink').value.trim()},pipeline:{entrada:byId('stEntrada').checked,contrato:byId('stContrato').checked,pre:byId('stPre').checked,gravacao:byId('stGravacao').checked,mix:byId('stMix').checked,arte:byId('stArte').checked,release:byId('stRelease').checked,posts:byId('stPosts').checked,distribuicao:byId('stDistribuicao').checked,revisao:byId('stRevisao').checked},launched:false,history:[]}; addHistory(p,'Projeto criado'); state.projects.push(p); e.target.reset(); saveState();}
function handleArtistSubmit(e){e.preventDefault(); const username=byId('artistUser').value.trim(); if(state.users.some(u=>u.username===username))return alert('Este usuário já existe.'); state.users.push({id:uid(),role:'artist',name:byId('artistName').value.trim(),username,password:byId('artistPass').value.trim(),notes:byId('artistObs').value.trim()}); e.target.reset(); saveState();}
function handleApprovalSubmit(e){e.preventDefault(); const projectId=byId('approvalProject').value; if(!projectId) return alert('Cadastre projeto primeiro.'); state.approvals.push({id:uid(),projectId,type:byId('approvalType').value,status:byId('approvalStatus').value,link:byId('approvalLink').value.trim(),notes:byId('approvalNotes').value.trim()}); const p=state.projects.find(x=>x.id===projectId); if(p) addHistory(p, `Aprovação registrada: ${byId('approvalType').value} · ${byId('approvalStatus').value}`); e.target.reset(); saveState();}
function handleScheduleSubmit(e){e.preventDefault(); const projectId=byId('scheduleProject').value; if(!projectId) return alert('Cadastre projeto primeiro.'); state.schedule.push({id:uid(),projectId,type:byId('scheduleType').value,date:byId('scheduleDate').value,status:byId('scheduleStatus').value,notes:byId('scheduleNotes').value.trim()}); const p=state.projects.find(x=>x.id===projectId); if(p) addHistory(p, `Cronograma atualizado: ${byId('scheduleType').value} · ${byId('scheduleStatus').value}`); e.target.reset(); saveState();}
function handleSettingsSubmit(e){e.preventDefault(); settings.apps=byId('cfgApps').value.trim(); settings.inicial=byId('cfgInicial').value.trim(); settings.contrato=byId('cfgContrato').value.trim(); settings.calendar=byId('cfgCalendar').value.trim(); saveSettings(); alert('Integrações salvas localmente.');}
function remarca(id){const p=state.projects.find(x=>x.id===id); if(!p)return; const nova=prompt('Nova data (AAAA-MM-DD):',p.lancamento); if(!nova||nova===p.lancamento)return; const motivo=prompt('Motivo da remarcação:'); if(!motivo)return alert('Informe o motivo.'); addHistory(p,`Remarcação de ${p.lancamento} para ${nova} · motivo: ${motivo}`); p.lancamento=nova; saveState();}
function registrarEvento(id){const p=state.projects.find(x=>x.id===id); if(!p)return; const text=prompt('Descreva o evento:'); if(!text)return; addHistory(p,text); saveState();}
function confirmarLancamento(id){const p=state.projects.find(x=>x.id===id); if(!p)return; if(!pipelineComplete(p))return alert('Lançamento bloqueado.'); if(!confirm(`Confirmar lançamento de ${p.artista} — ${p.titulo}?`))return; const phrase=prompt('Digite LANÇAR para concluir:'); if(phrase!=='LANÇAR')return alert('Confirmação cancelada.'); p.launched=true; addHistory(p,'Lançamento confirmado com dupla validação'); saveState();}
function excluirProjeto(id){const p=state.projects.find(x=>x.id===id); if(!p)return; if(!confirm(`Excluir ${p.artista} — ${p.titulo}?`))return; state.projects=state.projects.filter(x=>x.id!==id); state.approvals=state.approvals.filter(x=>x.projectId!==id); state.schedule=state.schedule.filter(x=>x.projectId!==id); saveState();}
function exportJson(){const blob=new Blob([JSON.stringify({version:'v9.0.0',exportedAt:new Date().toISOString(),state,settings},null,2)],{type:'application/json'}); download(blob,`vale-producao-fase9-${new Date().toISOString().slice(0,10)}.json`);}
function exportCsv(){const header='artista,titulo,tipo,lancamento,status,contrato_status,aprovacoes,cronograma\n'; const rows=state.projects.map(p=>[p.artista,p.titulo,p.tipo,p.lancamento,getStatus(p),p.contract.status,state.approvals.filter(a=>a.projectId===p.id).length,state.schedule.filter(s=>s.projectId===p.id).length].map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'); const blob=new Blob([header+rows],{type:'text/csv;charset=utf-8;'}); download(blob,`vale-producao-fase9-${new Date().toISOString().slice(0,10)}.csv`);}
function download(blob,filename){const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
async function sendApps(){if(!settings.apps)return alert('Configure a URL do Apps Script.'); try{const res=await fetch(settings.apps,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'Vale Produção Fase 9',exportedAt:new Date().toISOString(),state,settings})}); if(!res.ok)throw new Error('Falha'); alert('Dados enviados com sucesso.');}catch{alert('Falha no envio. Verifique a URL e as permissões do Apps Script.');}}
function seed(){if(state.projects.length&&!confirm('Isso adicionará exemplos ao que já existe. Continuar?'))return; let artist=state.users.find(u=>u.role==='artist'&&u.username==='juh'); if(!artist){artist={id:uid(),role:'artist',name:'Juh Silva',username:'juh',password:'1234',notes:'Exemplo de artista'}; state.users.push(artist);} const p1={id:uid(),artistUserId:artist.id,artista:'Juh Silva',titulo:'Bloqueado',tipo:'Single',lancamento:new Date(Date.now()+5*86400000).toISOString().slice(0,10),observacoes:'Reforçar reels e confirmar distribuição.',contract:{status:'Enviado',link:'https://autentique.com.br/exemplo'},pipeline:{entrada:true,contrato:true,pre:true,gravacao:true,mix:true,arte:false,release:true,posts:false,distribuicao:false,revisao:false},launched:false,history:[]}; const p2={id:uid(),artistUserId:null,artista:'Ariane Mazur',titulo:'Novo Amanhã',tipo:'Single',lancamento:new Date(Date.now()+15*86400000).toISOString().slice(0,10),observacoes:'Projeto praticamente pronto.',contract:{status:'Assinado',link:'https://autentique.com.br/exemplo2'},pipeline:{entrada:true,contrato:true,pre:true,gravacao:true,mix:true,arte:true,release:true,posts:true,distribuicao:true,revisao:true},launched:false,history:[]}; [p1,p2].forEach(p=>addHistory(p,'Projeto criado via dados de exemplo')); state.projects.push(p1,p2); state.approvals.push({id:uid(),projectId:p1.id,type:'Capa',status:'Pendente',link:'',notes:'Aguardando aprovação da artista'}); state.schedule.push({id:uid(),projectId:p1.id,type:'Teaser',date:new Date(Date.now()+2*86400000).toISOString().slice(0,10),status:'Pendente',notes:'Publicar teaser principal'}); saveState();}

byId('loginForm').addEventListener('submit',handleLogin);
byId('logoutBtn').addEventListener('click',()=>{session=null;saveSession();});
byId('projectForm').addEventListener('submit',handleProjectSubmit);
byId('artistForm').addEventListener('submit',handleArtistSubmit);
byId('approvalForm').addEventListener('submit',handleApprovalSubmit);
byId('scheduleForm').addEventListener('submit',handleScheduleSubmit);
byId('settingsForm').addEventListener('submit',handleSettingsSubmit);
byId('buscaProjetos').addEventListener('input',renderProjects);
byId('btnExportJson').addEventListener('click',exportJson);
byId('btnExportCsv').addEventListener('click',exportCsv);
byId('btnSeed').addEventListener('click',seed);
byId('btnSendApps').addEventListener('click',sendApps);
updateShellVisibility();
