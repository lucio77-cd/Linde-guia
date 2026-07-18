/**
 * caminhada-real.js
 * Linde Guia — Treze Tílias
 *
 * Chama /api/tempo-caminhada.js pra trocar a estimativa de deslocamento
 * (linha reta × velocidade fixa, calculada em motor-rota.js) pelos minutos
 * reais de caminhada, vindos da Directions API — na MESMA ordem de paradas
 * já decidida (por IA ou pelo motor de pontuação). Não decide ordem
 * nenhuma, só mede.
 *
 * Se a chamada falhar, estourar o tempo, ou faltar coordenada em alguma
 * parada, devolve null — quem chamar (formulario-roteiro.js, via
 * motor-rota.js/aplicarDeslocamentosReais) mantém a estimativa padrão.
 * O tempo real nunca pode ser ponto único de falha do app.
 */
const TIMEOUT_MS = 6000;

async function obterDeslocamentosReaisMin(origem, paradas) {
  if (!origem || !Array.isArray(paradas) || paradas.length === 0) return null;

  const coordenadas = paradas.map((parada) => parada.localizacao);
  const todasComCoordenada = coordenadas.every(
    (loc) => loc && typeof loc.lat === "number" && typeof loc.lng === "number"
  );
  if (!todasComCoordenada) return null;

  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch("/api/tempo-caminhada", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ origem, paradas: coordenadas }),
      signal: controlador.signal,
    });

    if (!resposta.ok) return null;

    const dados = await resposta.json();
    return dados.deslocamentosMin || null;
  } catch (erro) {
    console.warn("[caminhada-real] Indisponível, usando estimativa:", erro);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export { obterDeslocamentosReaisMin };
