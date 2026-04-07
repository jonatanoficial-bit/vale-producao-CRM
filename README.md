# Vale Produção CRM Online Real

Versão: **v27.0.1**
Build: **2026-04-07 17:46:20**

## Correções desta versão
- corrigido build exibido na tela de login e sidebar
- service worker atualizado para não prender versão antiga
- atualização do app mais confiável
- mesma configuração do Firebase preservada

## O problema encontrado
- `app.js` já estava em v27, mas `index.html` ainda mostrava v25
- `service-worker.js` ainda usava cache antigo v23
