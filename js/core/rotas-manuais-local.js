/**
 * rotas-manuais-local.js
 * Linde Guia — Treze Tílias
 *
 * "Salvar pra outro dia" no modo manual (roteiro-manual.js) — mesmo esquema
 * de selos-local.js/favoritos-local.js: sem login de turista no projeto,
 * então fica guardado no aparelho (localStorage).
 *
 * IMPORTANTE — o que é salvo é só a ESCOLHA (ids dos POIs + quando a
 * pessoa planeja ir), nunca a rota já calculada (ordem, horário de
 * chegada). Motivo: entre o momento de salvar e o momento de "Iniciar
 * agora", o horário de funcionamento de um local pode ter sido alterado
 * no painel admin, ou o local pode ter sido removido — se guardássemos a
 * rota já calculada, o turista veria informação velha sem saber.
 * gerarCapituloDeFavoritos() (motor-rota.js) sempre recalcula em cima do
 * dado mais atual do Firestore na hora de iniciar.
 *
 * Cada rota salva tem um id gerado no cliente (não vem do Firestore — é
 * dado 100% local). Usa crypto.randomUUID() quando disponível (padrão em
 * qualquer navegador moderno em contexto HTTPS, que é o caso do site),
 * com um fallback simples só por segurança em navegador muito antigo.
 */

const CHAVE_STORAGE = "linde-guia:rotas-manuais";

function gerarId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rota-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function lerRotasSalvas() {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    return bruto ? JSON.parse(bruto) : [];
  } catch (erro) {
    console.warn("[rotas-manuais-local] Erro ao ler rotas salvas:", erro);
    return [];
  }
}

// { nome, poisIds: [...ids], dataHoraAgendada: ISOString } -> objeto rota
// criado (com id), ou null se falhar ao salvar.
function salvarRotaManual({ nome, poisIds, dataHoraAgendada }) {
  try {
    const rotas = lerRotasSalvas();

    const novaRota = {
      id: gerarId(),
      nome,
      poisIds: [...poisIds],
      dataHoraAgendada,
      salvoEm: new Date().toISOString(),
    };

    rotas.push(novaRota);
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(rotas));

    return novaRota;
  } catch (erro) {
    console.warn("[rotas-manuais-local] Erro ao salvar rota manual:", erro);
    return null;
  }
}

function removerRotaSalva(id) {
  try {
    const rotas = lerRotasSalvas().filter((r) => r.id !== id);
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(rotas));
  } catch (erro) {
    console.warn("[rotas-manuais-local] Erro ao remover rota salva:", erro);
  }
}

export { lerRotasSalvas, salvarRotaManual, removerRotaSalva };
