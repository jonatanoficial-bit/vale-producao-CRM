function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const projetos = ss.getSheetByName("Projetos") || ss.insertSheet("Projetos");
    const aprovacoes = ss.getSheetByName("Aprovacoes") || ss.insertSheet("Aprovacoes");
    const cronograma = ss.getSheetByName("Cronograma") || ss.insertSheet("Cronograma");

    if (projetos.getLastRow() === 0) {
      projetos.appendRow(["Exportado em","Artista","Projeto","Tipo","Lancamento","Status Contrato","Aprovacoes","Cronograma"]);
    }
    if (aprovacoes.getLastRow() === 0) {
      aprovacoes.appendRow(["Projeto","Tipo","Status","Link","Observacoes"]);
    }
    if (cronograma.getLastRow() === 0) {
      cronograma.appendRow(["Projeto","Etapa","Data","Status","Observacoes"]);
    }

    const state = data.state || {};
    (state.projects || []).forEach(function(project) {
      const approvalsCount = (state.approvals || []).filter(function(a){ return a.projectId === project.id; }).length;
      const scheduleCount = (state.schedule || []).filter(function(s){ return s.projectId === project.id; }).length;
      projetos.appendRow([data.exportedAt || "", project.artista || "", project.titulo || "", project.tipo || "", project.lancamento || "", project.contract && project.contract.status ? project.contract.status : "", approvalsCount, scheduleCount]);
    });

    (state.approvals || []).forEach(function(a) {
      aprovacoes.appendRow([a.projectId || "", a.type || "", a.status || "", a.link || "", a.notes || ""]);
    });

    (state.schedule || []).forEach(function(s) {
      cronograma.appendRow([s.projectId || "", s.type || "", s.date || "", s.status || "", s.notes || ""]);
    });

    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(error)})).setMimeType(ContentService.MimeType.JSON);
  }
}
