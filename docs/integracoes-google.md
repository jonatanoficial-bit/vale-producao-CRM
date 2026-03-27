# Guia de integrações Google - Fase 2

## Objetivo
Conectar o painel do GitHub Pages com Google Forms, Google Sheets e Google Calendar sem custo inicial.

## Estrutura sugerida
- Formulário 1: entrada e conhecimento do artista
- Formulário 2: dados completos para contrato
- Formulário 3: briefing visual e identidade do lançamento
- Planilha Google: base operacional
- Google Calendar: agenda de gravação, arte, posts e lançamento
- Google Apps Script: automações e web app intermediário

## O que já está pronto no ZIP
- Interface com campos de links para formulários, planilha, calendar, Canva, Autentique e ONErpm
- Template de Apps Script em `apps-script/Code.gs`
- Manifesto em `apps-script/appsscript.json`

## Como configurar
1. Crie sua planilha principal no Google Sheets.
2. Crie seus formulários no Google Forms.
3. Vincule as respostas à planilha, quando fizer sentido.
4. Abra o Apps Script pela planilha ou em um projeto separado.
5. Copie o conteúdo de `apps-script/Code.gs`.
6. Ajuste IDs e nomes de abas conforme sua operação.
7. Publique o Apps Script como Web App.
8. Use a URL gerada para futuros upgrades do painel.

## Limite desta fase
Esta fase não injeta credenciais privadas nem executa sincronização automática real sozinha, porque GitHub Pages é estático. O fluxo seguro e gratuito é usar Apps Script como ponte.

## Próxima fase recomendada
- sincronizar automaticamente novos formulários em artistas/projetos
- gerar eventos no Google Calendar
- registrar remarcações de lançamento
- disparar alertas por e-mail
