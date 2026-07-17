/**
 * historico-data.js
 * Linde Guia — Treze Tílias
 *
 * Junta os sinais de gosto do usuário guardados neste aparelho — selos,
 * favoritos, rotas manuais salvas — num objeto único pra mandar pro
 * curador-ia.js, que por sua vez manda pra IA como contexto de curadoria.
 *
 * Cada fonte é lida de forma DEFENSIVA: se um módulo ainda não existir ou
 * a função tiver outro nome no seu projeto, essa fonte fica vazia — nunca
 * quebra a geração do roteiro por causa disso.
 *
 * IMPORTANTE: confirme os caminhos de import e os nomes de função abaixo
 * contra os arquivos reais do seu projeto antes de usar:
 *   - lerSelos()          -> já confirmado, existe em core/selos-local.js
 *   - lerFavoritos()      -> AJUSTE se o seu arquivo/função tiver outro nome
 *   - lerRotasManuais()   -> AJUSTE se o seu arquivo/função tiver outro nome
 *     (sabemos que existe salvarRotaManual em core/rotas-manuais-local.js;
 *     se a função de leitura correspondente tiver outro nome, troque aqui)
 */
import { lerSelos } from "../core/selos-local.js";

async function montarHistoricoDoUsuario() {
  const historico = {
    selosLocais: [],
    favoritos: [],
    rotasManuaisSalvas: [],
  };

  // Selos (locais já visitados neste aparelho)
  try {
    historico.selosLocais = lerSelos().map((s) => ({
      poiId: s.poiId,
      categoria: s.categoria || null,
    }));
  } catch (erro) {
    console.warn("[historico-data] Não consegui ler selos:", erro);
  }

  // Favoritos — ajuste o caminho/nome da função se o seu arquivo real for
  // diferente (ex: core/favoritos-local.js -> lerFavoritos()).
  try {
    const modulo = await import("../core/favoritos-local.js");
    if (typeof modulo.lerFavoritos === "function") {
      historico.favoritos = modulo.lerFavoritos().map((f) => ({
        poiId: f.poiId || f.id,
        categoria: f.categoria || null,
        tagsDeInteresse: f.tagsDeInteresse || [],
      }));
    }
  } catch (erro) {
    console.warn("[historico-data] Favoritos não disponíveis:", erro);
  }

  // Rotas manuais salvas
  try {
    const modulo = await import("../core/rotas-manuais-local.js");
    if (typeof modulo.lerRotasManuais === "function") {
      historico.rotasManuaisSalvas = modulo.lerRotasManuais().map((r) => ({
        nome: r.nome,
        poisIds: r.poisIds || [],
      }));
    }
  } catch (erro) {
    console.warn("[historico-data] Rotas manuais não disponíveis:", erro);
  }

  return historico;
}

export { montarHistoricoDoUsuario };
