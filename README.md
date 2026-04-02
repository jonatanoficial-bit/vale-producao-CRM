# Vale Produção CRM Online Real

Versão: **v19.1.0**  
Build: **2026-03-31 21:08:49**

## Esta é a versão online real completa
- login real com Firebase Auth
- banco compartilhado com Firestore
- admin e artistas acessando o mesmo sistema
- projetos, cronograma, aprovações e financeiro em nuvem
- portal do artista filtrado pelo login
- visual corrigido e pronto para GitHub Pages

## Como fica o acesso geral online
1. você publica no GitHub Pages
2. todo mundo entra no mesmo link
3. cada pessoa faz login com e-mail e senha
4. os dados ficam online no Firestore
5. o admin vê tudo
6. o artista vê apenas os projetos vinculados ao UID dele

## Fluxo correto
1. preencher `firebase-config.js`
2. definir o e-mail do admin em `ADMIN_EMAIL`
3. publicar
4. criar a conta admin com esse e-mail
5. pedir para os artistas criarem conta
6. entrar como admin e vincular as contas em Artistas
7. criar projetos apontando para o artista correto
