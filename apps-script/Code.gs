/**
 * Vale Produção - Artist Flow Manager
 * Fase 2 - Template inicial de Google Apps Script
 * Build: v2.0.0 | 2026-03-27 11:31:09 -03:00
 *
 * Antes de usar:
 * 1. Ajuste os nomes das abas da planilha.
 * 2. Ajuste o ID do calendário.
 * 3. Configure gatilhos em tempo e/ou onFormSubmit.
 */

const CONFIG = {
  spreadsheetId: 'SUBSTITUIR_PELO_ID_DA_PLANILHA',
  calendarId: 'primary',
  sheets: {
    artists: 'Artists',
    projects: 'Projects',
    alerts: 'Alerts'
  }
};

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      app: 'Vale Produção Artist Flow Manager',
      phase: 'Fase 2',
      version: 'v2.0.0',
      build: '2026-03-27 11:31:09 -03:00'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function createCalendarEvent(title, dateString, description) {
  const calendar = CalendarApp.getCalendarById(CONFIG.calendarId);
  const date = new Date(dateString + 'T12:00:00');
  return calendar.createAllDayEvent(title, date, { description: description || '' });
}

function logAlert(projectTitle, message, level) {
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(CONFIG.sheets.alerts) || ss.insertSheet(CONFIG.sheets.alerts);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['timestamp', 'project_title', 'message', 'level']);
  }
  sheet.appendRow([new Date(), projectTitle, message, level || 'warning']);
}

function nightlyReleaseCheck() {
  // Exemplo: verificar lançamentos próximos e registrar alerta.
  // A implementação real deve ler a aba de projetos.
  logAlert('DEMO', 'Configure a leitura real da planilha para ativar esta rotina.', 'warning');
}
