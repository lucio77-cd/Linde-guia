/**
 * favoritos-local.js
 * Linde Guia — Treze Tílias
 *
 * "Salvar pra conhecer depois" — mesmo esquema de selos-local.js: sem login
 * de turista no projeto, então fica guardado no aparelho (localStorage).
 * Usado pelo botão de coração em explorar.js/ponto.js, e pela lista de
 * favoritos em perfil.html, que tem o botão "Começar tour" (gera uma rota
 * só com os lugares favoritados — ver gerarCapituloDeFavoritos em
 * motor-rota.js).
 */

const CHAVE_STORAGE = "linde-guia:favoritos";

function lerFavoritos() {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    return bruto ? JSON.parse(bruto) : [];
  } catch (erro) {
    console.warn("[favoritos-local] Erro ao ler favoritos:", erro);
    return [];
  }
}

function ehFavorito(poiId) {
  if (!poiId) return false;
  return lerFavoritos().some((f) => f.poiId === poiId);
}

function alternarFavorito(poi) {
  if (!poi || !poi.id) return false;

  try {
    const favoritos = lerFavoritos();
    const jaEstava = favoritos.some((f) => f.poiId === poi.id);

    const atualizados = jaEstava
      ? favoritos.filter((f) => f.poiId !== poi.id)
      : [...favoritos, { poiId: poi.id, poiNome: poi.nome, poiCategoria: poi.categoria || null, salvoEm: new Date().toISOString() }];

    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(atualizados));
    return !jaEstava; // devolve o novo estado (true = virou favorito agora)
  } catch (erro) {
    console.warn("[favoritos-local] Erro ao salvar favorito:", erro);
    return ehFavorito(poi.id);
  }
}

function removerFavorito(poiId) {
  try {
    const favoritos = lerFavoritos().filter((f) => f.poiId !== poiId);
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(favoritos));
  } catch (erro) {
    console.warn("[favoritos-local] Erro ao remover favorito:", erro);
  }
}

export { lerFavoritos, ehFavorito, alternarFavorito, removerFavorito };
