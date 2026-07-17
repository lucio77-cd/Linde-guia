/**
 * curador-ia.js
 * Linde Guia — Treze Tílias
 *
 * Chama /api/curar-capitulo.js pra pedir uma seleção curada por IA, dentro
 * dos candidatos já filtrados pelo motor-rota.js (obterCandidatosViaveis).
 *
 * Se a chamada falhar, estourar o tempo, ou a IA não devolver nada válido,
 * devolve null — quem chamar cai de volta pro gerarCapitulo() de sempre.
 * A IA nunca pode ser ponto único de falha do app.
 */
const TIMEOUT_MS = 8000;

async function curarCapituloComIA(candidatosViaveis, perfilBusca, historico, maxParadas) {
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch("/api/curar-capitulo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidatos: candidatosViaveis,
        perfilBusca,
        historico,
        maxParadas,
      }),
      signal: controlador.signal,
    });

    if (!resposta.ok) return null;

    const dados = await resposta.json();
    if (!dados.idsEscolhidos || dados.idsEscolhidos.length === 0) return null;

    return dados; // { idsEscolhidos, explicacao }
  } catch (erro) {
    console.warn("[curador-ia] Indisponível, usando pontuação padrão:", erro);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export { curarCapituloComIA };
