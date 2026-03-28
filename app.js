
let state = JSON.parse(localStorage.getItem("fase10")||'{"finance":[],"delivery":[]}');

document.getElementById("loginForm").onsubmit=(e)=>{
 e.preventDefault();
 document.getElementById("loginScreen").classList.add("hidden");
 document.getElementById("app").classList.remove("hidden");
 render();
};

document.getElementById("financeForm").onsubmit=(e)=>{
 e.preventDefault();
 state.finance.push({
  proj:proj.value,
  valor:valor.value,
  tipo:tipo.value
 });
 save();
};

document.getElementById("deliveryForm").onsubmit=(e)=>{
 e.preventDefault();
 state.delivery.push({
  proj:deliveryProj.value,
  desc:deliveryDesc.value,
  status:deliveryStatus.value
 });
 save();
};

function save(){
 localStorage.setItem("fase10",JSON.stringify(state));
 render();
}

function render(){
 document.getElementById("financeList").innerHTML=
 state.finance.map(f=>`<div>${f.proj} - ${f.tipo} R$${f.valor}</div>`).join("");

 document.getElementById("deliveryList").innerHTML=
 state.delivery.map(d=>`<div>${d.proj} - ${d.desc} (${d.status})</div>`).join("");
}
