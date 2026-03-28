function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Projetos") || ss.insertSheet("Projetos");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Exportado em","Artista","Projeto","Tipo","Lancamento","Status Contrato","Entrada","Contrato","Pre","Gravacao","Mix","Arte","Release","Posts","Distribuicao","Revisao"]);
    }
    (data.state && data.state.projects ? data.state.projects : []).forEach(function(project) {
      sheet.appendRow([
        data.exportedAt || "",
        project.artista || "",
        project.titulo || "",
        project.tipo || "",
        project.lancamento || "",
        project.contract && project.contract.status ? project.contract.status : "",
        project.pipeline && project.pipeline.entrada ? "SIM" : "NAO",
        project.pipeline && project.pipeline.contrato ? "SIM" : "NAO",
        project.pipeline && project.pipeline.pre ? "SIM" : "NAO",
        project.pipeline && project.pipeline.gravacao ? "SIM" : "NAO",
        project.pipeline && project.pipeline.mix ? "SIM" : "NAO",
        project.pipeline && project.pipeline.arte ? "SIM" : "NAO",
        project.pipeline && project.pipeline.release ? "SIM" : "NAO",
        project.pipeline && project.pipeline.posts ? "SIM" : "NAO",
        project.pipeline && project.pipeline.distribuicao ? "SIM" : "NAO",
        project.pipeline && project.pipeline.revisao ? "SIM" : "NAO"
      ]);
    });
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(error)})).setMimeType(ContentService.MimeType.JSON);
  }
}
