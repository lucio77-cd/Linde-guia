/**
 * caminhada-real.js
 * Linde Guia — Treze Tílias
 *
 * Chama /api/tempo-caminhada.js pra trocar a estimativa por linha reta do
 * motor-rota.js (Haversine × velocidade fixa) pelo tempo real de
 * caminhada entre as paradas, na ordem em que elas já foram decididas
 * (pela IA ou pelo motor de pontuação padrão — esse arquivo não decide
 * ordem nenhuma, só mede).
 *
 * TAMBÉM devolve o "polyline" (traçado da rota seguindo rua de verdade,
 * usado por js/pages/mapa-rota.js pra desenhar a linha real no mapa, em
 * vez da linha reta pontilhada).
 *
 * Se a chamada falhar, estourar o tempo, ou não vier dado válido, devolve
 * null — quem chamar mantém a estimativa que o motor já calculou. Nunca é
 * ponto único de falha.
 */
const TIMEOUT_MS = 6000;

async function obterDeslocamentosReaisMin(origem, paradas) {
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const pontos = paradas.map((p) => p.localizacao || null);

    const resposta = await fetch("/api/tempo-caminhada", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ origem, paradas: pontos }),
      signal: controlador.signal,
    });

    if (!resposta.ok) return null;

    const dados = await resposta.json();
    if (!dados.deslocamentosMin || dados.deslocamentosMin.length !== paradas.length) return null;

    return { deslocamentosMin: dados.deslocamentosMin, polyline: dados.polyline || null };
  } catch (erro) {
    console.warn("[caminhada-real] Indisponível, usando estimativa:", erro);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export { obterDeslocamentosReaisMin };
