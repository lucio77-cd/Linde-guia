/**
 * rotas-manuais-local.js
 * Linde Guia — Treze Tílias
 *
 * "Salvar roteiro manual pra outro dia" — mesmo esquema de favoritos-local.js
 * e selos-local.js: sem login de turista, guardado no aparelho.
 *
 * IMPORTANTE — o que fica salvo NÃO é a rota pronta (sequência + horários
 * calculados). Fica só a ESCOLHA da pessoa: quais locais (poisIds) e pra
 * quando (dataHoraAgendada). O motivo: entre o dia que a pessoa salva e o
 * dia que ela realmente inicia o passeio, um local pode mudar de horário,
 * fechar por reforma, etc. — confiar num cálculo antigo daria informação
 * errada. Por isso, "Iniciar" (ver roteiro-manual.js/perfil.js) sempre busca
 * o dado atual do Firestore e roda gerarCapituloDeFavoritos() na hora, só
 * usando esta lista de IDs como entrada.
 */

const CHAVE_STORAGE = "linde-guia:rotas-manuais";

function lerRotasSalvas() {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    return bruto ? JSON.parse(bruto) : [];
  } catch (erro) {
    console.warn("[rotas-manuais-local] Erro ao ler rotas salvas:", erro);
    return [];
  }
}

// nome: texto livre (ex: "Sábado com a família"). poisIds: array de ids.
// dataHoraAgendada: ISO string do horário planejado (pode ser no futuro).
function salvarRotaManual({ nome, poisIds, dataHoraAgendada }) {
  try {
    const rotas = lerRotasSalvas();
    const novaRota = {
      id: `rota-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      nome: nome?.trim() || "Meu roteiro",
      poisIds: [...poisIds],
      dataHoraAgendada: dataHoraAgendada || null,
      criadoEm: new Date().toISOString(),
    };
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify([...rotas, novaRota]));
    return novaRota;
  } catch (erro) {
    console.warn("[rotas-manuais-local] Erro ao salvar rota manual:", erro);
    return null;
  }
}

function removerRotaSalva(idRota) {
  try {
    const rotas = lerRotasSalvas().filter((r) => r.id !== idRota);
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(rotas));
  } catch (erro) {
    console.warn("[rotas-manuais-local] Erro ao remover rota salva:", erro);
  }
}

export { lerRotasSalvas, salvarRotaManual, removerRotaSalva };
