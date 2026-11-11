# Linde Guia

Guia turístico web de Treze Tílias (SC), com páginas públicas, criação de roteiros, mapa, eventos e painel administrativo.

## Tecnologias

- HTML, CSS e JavaScript com módulos ES.
- Firebase Authentication, Cloud Firestore e Cloud Storage.
- Vercel para hospedagem e funções serverless em `/api`.
- Leaflet / OpenStreetMap para mapas.
- Google Maps Directions/Geocoding e Gemini para recursos opcionais.

## Estrutura principal

- `pages/`: páginas HTML.
- `js/core/`: inicialização Firebase e utilitários compartilhados.
- `js/data/`: leitura e escrita dos dados.
- `js/engine/`: regras de seleção e montagem de roteiros.
- `js/pages/`: lógica das páginas públicas.
- `js/admin/`: autenticação e painel administrativo.
- `api/`: funções serverless reconhecidas pela Vercel.
- `styles/`: folhas de estilo.
- `data/firestore.rules`: regras do Firestore.
- `storage.rules`: regras do Storage.

## Configuração

### Firebase

O projeto Firebase utilizado pelo cliente é `linde-guia`.

1. Ative o provedor E-mail/senha no Firebase Authentication.
2. Cadastre a conta administrativa indicada em `js/admin/admin-auth.js`.
3. Crie manualmente em `usuarios_admin` um documento cujo ID seja o UID dessa conta.
4. Configure as regras em `data/firestore.rules` e `storage.rules`.
5. Ao publicar as regras do Storage que consultam Firestore, habilite a integração/permissão solicitada pelo Firebase Console.

A configuração de deploy do Firebase CLI está em `firebase.json` na raiz.

### Vercel

Variáveis de ambiente usadas pelas funções:

- `GEMINI_API_KEY`: curadoria de roteiros e relatório administrativo.
- `GOOGLE_MAPS_API_KEY`: tempos reais de caminhada e geocodificação.

As funções serverless devem permanecer em `api/` na raiz do projeto.

## Cuidados com dados

- Os POIs, eventos, patrocinadores e registros históricos existentes devem ser preservados.
- Não execute `data/importar-seed.mjs` contra o banco de produção sem revisão explícita, backup e confirmação do conjunto de documentos que será alterado.
- A página de diagnóstico é somente leitura; a importação foi desativada para evitar alterações acidentais.
- Alterações de regras devem ser testadas com usuário visitante, usuário autenticado comum e administrador antes de publicar.

## Testes e validação

Não há suíte automatizada de testes configurada no repositório neste momento. Antes de publicar alterações, validar:

1. Leitura pública de POIs, eventos e patrocinadores.
2. Login e bloqueio de conta que não esteja em `usuarios_admin`.
3. CRUD administrativo de POIs e patrocinadores.
4. Upload de banner com imagem válida, formato inválido e usuário não administrador.
5. Salvamento de configurações e incremento de acessos diários.
6. Geração de roteiro com POIs, com eventos, sem IA e sem API de caminhada.
7. Geração do relatório IA apenas com sessão administrativa válida.
8. Navegação em celular e desktop, sem erros no console.

## Publicação

O fluxo recomendado é validar a branch de correções em preview, executar os testes acima e só então integrar à branch principal. A publicação das regras Firebase é uma etapa separada do deploy Vercel.
