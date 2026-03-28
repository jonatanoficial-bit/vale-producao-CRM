
const DB_KEY="vale-producao-fase12";

let db=JSON.parse(localStorage.getItem(DB_KEY)||'{"projects":[],"timeline":[],"finance":[]}');

function save(){localStorage.setItem(DB_KEY,JSON.stringify(db));render();}

function daysDiff(d){
  const now=new Date();const t=new Date(d);
  return Math.floor((t-now)/(1000*60*60*24));
}

function render(){
  renderProjects();
  renderTimeline();
  renderFinance();
  renderAlerts();
  renderDashboard();
  populateSelects();
}

function renderProjects(){
  const el=document.getElementById("projectList");
  el.innerHTML=db.projects.map(p=>{
    const d=daysDiff(p.date);
    let status=d<0?"ATRASADO":d<7?"URGENTE":"OK";
    return `<div class="card"><b>${p.name}</b><br>${p.date} (${status})<br>R$${p.value||0}</div>`;
  }).join("");
}

function renderTimeline(){
  const el=document.getElementById("timelineList");
  el.innerHTML=db.timeline.map(t=>{
    return `<div class="card">${t.proj} - ${t.desc} - ${t.date}</div>`;
  }).join("");
}

function renderFinance(){
  const el=document.getElementById("financeList");
  el.innerHTML=db.finance.map(f=>{
    return `<div class="card">${f.proj} - ${f.tipo} R$${f.valor}</div>`;
  }).join("");
}

function renderAlerts(){
  const el=document.getElementById("alertList");
  const alerts=[];
  db.projects.forEach(p=>{
    const d=daysDiff(p.date);
    if(d<0) alerts.push(`Projeto atrasado: ${p.name}`);
    else if(d<5) alerts.push(`Projeto próximo: ${p.name}`);
  });
  el.innerHTML=alerts.map(a=>`<div class="alert">${a}</div>`).join("") || "Sem alertas";
}

function renderDashboard(){
  const el=document.getElementById("view-dashboard");
  const total=db.projects.length;
  const atrasados=db.projects.filter(p=>daysDiff(p.date)<0).length;
  el.innerHTML=`<div class="panel">
    <h2>Resumo</h2>
    Total projetos: ${total}<br>
    Atrasados: ${atrasados}
  </div>`;
}

function populateSelects(){
  const opts=db.projects.map(p=>`<option>${p.name}</option>`).join("");
  document.getElementById("tProj").innerHTML=opts;
  document.getElementById("fProj").innerHTML=opts;
}

document.querySelectorAll(".nav").forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll(".nav").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    document.getElementById("view-"+btn.dataset.view).classList.add("active");
  };
});

document.getElementById("projectForm").onsubmit=e=>{
  e.preventDefault();
  db.projects.push({
    name:pNome.value,
    date:pData.value,
    value:pValor.value
  });
  save();
};

document.getElementById("timelineForm").onsubmit=e=>{
  e.preventDefault();
  db.timeline.push({
    proj:tProj.value,
    desc:tDesc.value,
    date:tData.value
  });
  save();
};

document.getElementById("financeForm").onsubmit=e=>{
  e.preventDefault();
  db.finance.push({
    proj:fProj.value,
    valor:fValor.value,
    tipo:fTipo.value
  });
  save();
};

document.getElementById("btnExport").onclick=()=>{
  const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="vale-producao.json";
  a.click();
};

render();
