// api/tempo-caminhada.js
// Linde Guia — Treze Tílias
//
// Recebe a ordem de paradas JÁ DECIDIDA (pela curadoria por IA ou pelo
// motor de pontuação padrão) e busca o tempo real de caminhada entre elas
// via Directions API do Google — troca a estimativa por linha reta
// (Haversine × velocidade fixa) por ruas e ladeiras de verdade.
//
// Não decide ORDEM nenhuma — só mede o trajeto que já foi decidido.
//
// Variável de ambiente necessária na Vercel: GOOGLE_MAPS_API_KEY
// (habilite SÓ a "Directions API" nessa chave, no Google Cloud Console)

const TIMEOUT_SERVIDOR_MS = 6000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido" });
    return;
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.error("[tempo-caminhada] GOOGLE_MAPS_API_KEY não configurada na Vercel.");
    res.status(200).json({ deslocamentosMin: null }); // fallback silencioso, não trava o usuário
    return;
  }

  const { origem, paradas } = req.body || {};

  if (!origem || !Array.isArray(paradas) || paradas.length === 0) {
    res.status(400).json({ erro: "origem e paradas são obrigatórios" });
    return;
  }

  // Se qualquer parada não tem coordenada, não dá pra confiar que os
  // trechos devolvidos batem 1-a-1 com a ordem das paradas — melhor
  // recusar o lote inteiro e deixar o motor usar a estimativa.
  const todasComCoordenada = paradas.every(
    (p) => p && typeof p.lat === "number" && typeof p.lng === "number"
  );
  if (!todasComCoordenada) {
    res.status(200).json({ deslocamentosMin: null });
    return;
  }

  const destino = paradas[paradas.length - 1];
  const viaPontos = paradas.slice(0, -1);

  const params = new URLSearchParams({
    origin: `${origem.lat},${origem.lng}`,
    destination: `${destino.lat},${destino.lng}`,
    mode: "walking",
    key: process.env.GOOGLE_MAPS_API_KEY,
  });
  if (viaPontos.length > 0) {
    params.set("waypoints", viaPontos.map((p) => `${p.lat},${p.lng}`).join("|"));
  }

  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_SERVIDOR_MS);

  try {
    const resposta = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?${params}`,
      { signal: controlador.signal }
    );
    const dados = await resposta.json();

    if (dados.status !== "OK" || !dados.routes?.[0]?.legs) {
      // ZERO_RESULTS, OVER_QUERY_LIMIT, etc — todos tratados igual: não é
      // erro fatal do app, é sinal pra usar a estimativa.
      if (dados.status && dados.status !== "OK" && dados.status !== "ZERO_RESULTS") {
        console.warn("[tempo-caminhada] Directions status:", dados.status, dados.error_message);
      }
      res.status(200).json({ deslocamentosMin: null });
      return;
    }

    // Cada "leg" é um trecho: origem->parada1, parada1->parada2, etc.
    // O número de legs é sempre igual ao número de paradas, nessa ordem.
    const deslocamentosMin = dados.routes[0].legs.map((trecho) =>
      Math.round(trecho.duration.value / 60)
    );

    res.status(200).json({ deslocamentosMin });
  } catch (erro) {
    console.error("[tempo-caminhada] Erro:", erro.name === "AbortError" ? "timeout" : erro);
    res.status(200).json({ deslocamentosMin: null }); // nunca quebra o fluxo do usuário
  } finally {
    clearTimeout(timeoutId);
  }
}

