# Linde Guia

Guia turístico de Treze Tílias (SC). O visitante informa horário, refeições e interesses e o app monta um passeio a pé, com mapa, modo "em rota" e selos. Há também um painel administrativo para a Secretaria de Turismo.

- Site estático (HTML + JavaScript em módulos, Leaflet para mapas)
- Banco: Firebase Firestore (leitura pública do conteúdo, escrita só admin)
- Hospedagem: Vercel, com funções em `/api`
- IA: Gemini (curadoria da rota e relatório do painel)

## Estrutura

| Pasta | O que tem |
|---|---|
| `index.html`, `pages/` | Páginas do site (`/admin` é o painel) |
| `js/engine/` | Motor de rotas (`motor-rota.js`) e curador de IA |
| `js/data/` | Acesso ao Firestore (POIs, eventos, patrocinadores) com cache |
| `js/admin/` | Painel administrativo |
| `js/core/` | Utilitários: Firebase, favoritos, selos, estado do passeio |
| `api/` | Funções serverless da Vercel |
| `data/` | Regras do Firestore, seed de locais e script de importação |
| `banners/`, `fotos-hero/` | Imagens estáticas |
| `tests/` | Testes automáticos |

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Nome | Para quê |
|---|---|
| `GEMINI_API_KEY` | Curadoria da rota e relatório (`api/curar-capitulo`, `api/gerar-relatorio`) |
| `GOOGLE_MAPS_API_KEY` | Tempo de caminhada e geocodificação. Habilite **Directions API** e **Geocoding API** |
| `FIREBASE_PROJECT_ID` | Validação do login do admin nas funções `/api` |

Restrinja a chave do Google Maps no Google Cloud (só as APIs usadas) e crie um alerta de orçamento.

## Configuração inicial

1. **Firebase**: crie o projeto, ative Firestore e Authentication (e-mail/senha). Os dados públicos do app ficam em `js/core/firebase-config.js`. Desative o cadastro público de usuários em Authentication.
2. **Regras**: publique `data/firestore.rules` no Console do Firebase (Firestore → Regras).
3. **Conta admin**: crie um usuário com o e-mail definido em `EMAIL_ADMIN` (`js/admin/admin-auth.js`). Depois crie, no Firestore, o documento `usuarios_admin/{uid}` com o UID dessa conta (pode ser vazio). Sem esse documento, o login não dá permissão de escrita.
4. **Locais iniciais** (opcional): `data/pois-seed.json` tem apenas exemplos com coordenadas de teste. Troque pelos locais reais antes de importar. Para importar, rode `npm install firebase-admin`, baixe a chave de serviço para `data/service-account-key.json` (nunca suba esse arquivo) e execute `node importar-seed.mjs` dentro de `data/`.
5. **Vercel**: importe o repositório, configure as variáveis acima e faça o deploy. Cada push no `main` publica automaticamente.

## Banners de patrocinadores

Os banners são arquivos `banners/{número}.jpg`. No painel, o patrocinador recebe um número; envie a imagem com esse nome para a pasta `banners/` pelo GitHub. Prefira imagens leves (até ~300 KB).

## Testes

```
npm test
```

Cobrem o motor de rotas (horário de funcionamento, eventos, locais em reforma, geração de capítulo) e as funções de análise do painel. Rodam sozinhos no GitHub Actions a cada push.

## Privacidade

O turista não faz login. Favoritos, selos e andamento do passeio ficam no aparelho; só são enviados registros anônimos de uso. Detalhes em `/privacidade`.

## Observações

- O domínio usado em `sitemap.xml`, `robots.txt` e `og:image` é `linde-guia.vercel.app`. Ajuste se usar outro.
- O limite de requisições das funções `/api` é por instância (em memória). Para proteção real, ative o Vercel Firewall com rate limit.
