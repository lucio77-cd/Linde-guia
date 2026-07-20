/**
 * numeracao-banners.js — js/admin/numeracao-banners.js
 * Linde Guia — Treze Tílias
 *
 * Compartilhado entre admin-locais.js (patrocínio por nível, dentro do
 * cadastro de um Local) e admin-patrocinadores.js (banner avulso, sem
 * precisar ser um Local cadastrado) — os dois escrevem arte estática na
 * MESMA pasta banners/ do repositório, então a checagem de "número já em
 * uso" precisa enxergar as duas fontes juntas. Se cada admin checasse só
 * a própria coleção, dava pra colidir sem ninguém perceber: um Local usa
 * banners/3.jpg, um anúncio avulso escolhe 3 também sem saber, e as duas
 * artes viram uma só na prática.
 */
const PASTA_BANNERS = "/banners";
const EXTENSAO_BANNER = ".jpg";
const REGEX_BANNER = new RegExp(`^${PASTA_BANNERS}/(\\d+)${EXTENSAO_BANNER.replace(".", "\\.")}$`);

function montarCaminhoBanner(numero) {
  return `${PASTA_BANNERS}/${numero}${EXTENSAO_BANNER}`;
}

function extrairNumeroDoCaminho(url) {
  const match = url?.match(REGEX_BANNER);
  return match ? match[1] : null;
}

// pois: array de POIs (usa poi.patrocinio.imagemBannerUrl)
// patrocinadores: array de patrocinadores avulsos (usa p.imagemBannerUrl)
// idsIgnorar: { poiId, patrocinadorId } — exclui o registro que está sendo
// editado agora, senão ele "colidiria" consigo mesmo toda vez que reabrir.
// Devolve { numero: "descrição de onde está em uso" }.
function numerosDeBannerEmUso(pois, patrocinadores, idsIgnorar = {}) {
  const emUso = {};

  (pois || []).forEach((poi) => {
    if (poi.id === idsIgnorar.poiId) return;
    const numero = extrairNumeroDoCaminho(poi.patrocinio?.imagemBannerUrl);
    if (numero) emUso[numero] = `Local: ${poi.nome}`;
  });

  (patrocinadores || []).forEach((p) => {
    if (p.id === idsIgnorar.patrocinadorId) return;
    const numero = extrairNumeroDoCaminho(p.imagemBannerUrl);
    if (numero) emUso[numero] = `Anúncio: ${p.nome}`;
  });

  return emUso;
}

export { montarCaminhoBanner, extrairNumeroDoCaminho, numerosDeBannerEmUso, PASTA_BANNERS, EXTENSAO_BANNER };
