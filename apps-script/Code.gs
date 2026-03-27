function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName("Projetos") || spreadsheet.insertSheet("Projetos");

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Exported At",
        "Artista",
        "Projeto",
        "Tipo",
        "Lançamento",
        "Status",
        "Audio",
        "Capa",
        "Release",
        "Posts",
        "Distribuicao",
        "Observacoes"
      ]);
    }

    const projetos = data.projetos || [];
    projetos.forEach(function(project) {
      sheet.appendRow([
        data.exportedAt || "",
        project.artista || "",
        project.titulo || "",
        project.tipo || "",
        project.lancamento || "",
        "",
        project.checklist && project.checklist.audio ? "SIM" : "NAO",
        project.checklist && project.checklist.capa ? "SIM" : "NAO",
        project.checklist && project.checklist.release ? "SIM" : "NAO",
        project.checklist && project.checklist.posts ? "SIM" : "NAO",
        project.checklist && project.checklist.distribuicao ? "SIM" : "NAO",
        project.observacoes || ""
      ]);
    });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, received: projetos.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
