/**
 * selos-local.js
 * Linde Guia — Treze Tílias
 *
 * Não existe sistema de login de turista no projeto (auth.js citado nos
 * comentários de pois-data.js nunca foi implementado). Por isso "Meus
 * selos" em perfil.html não pode vir do Firestore — as regras de
 * segurança (firestore.rules) só deixam o admin ler a coleção
 * "checkins", não o próprio usuário.
 *
 * Solução: guardar os selos localmente, no navegador do visitante
 * (localStorage, sobrevive entre sessões no mesmo aparelho). Cada
 * "Cheguei" confirmado em modo-em-rota.js grava aqui, além de gravar
 * o check-in real no Firestore (que alimenta as estatísticas do admin).
 *
 * Limitação conhecida: selos ficam presos ao aparelho/navegador. Se o
 * projeto evoluir para ter login de turista, isso pode migrar pra
 * Firestore em "usuarios/{uid}/selos".
 */

const CHAVE_STORAGE = "linde-guia:selos";

function lerSelos() {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    return bruto ? JSON.parse(bruto) : [];
  } catch (erro) {
    console.warn("[selos-local] Erro ao ler selos:", erro);
    return [];
  }
}

function salvarSeloLocal(poi) {
  if (!poi || !poi.nome) return;

  try {
    const selos = lerSelos();

    // Evita duplicar o mesmo local no mesmo dia (várias "Cheguei" na mesma
    // parada não devem virar vários selos iguais na coleção do visitante)
    const hoje = new Date().toISOString().slice(0, 10);
    const jaTemHoje = selos.some(
      (s) => s.poiId === poi.id && s.data?.slice(0, 10) === hoje
    );
    if (jaTemHoje) return;

    selos.push({
      poiId: poi.id || null,
      poiNome: poi.nome,
      poiCategoria: poi.categoria || null,
      data: new Date().toISOString(),
    });

    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(selos));
  } catch (erro) {
    console.warn("[selos-local] Erro ao salvar selo (não afeta o passeio):", erro);
  }
}

export { lerSelos, salvarSeloLocal };
