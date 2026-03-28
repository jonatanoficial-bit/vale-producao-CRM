function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Exportacoes") || ss.insertSheet("Exportacoes");

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Exportado em", "Versao", "Projetos", "Artistas", "Financeiro"]);
    }

    const state = data.state || {};
    sheet.appendRow([
      data.exportedAt || "",
      data.build && data.build.version ? data.build.version : "",
      state.projects ? state.projects.length : 0,
      state.users ? state.users.length : 0,
      state.finance ? state.finance.length : 0
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
