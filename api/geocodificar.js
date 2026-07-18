// api/geocodificar.js
// Linde Guia — Treze Tílias
//
// Geocodificação via Google Geocoding API — troca o Nominatim (OSM) no
// admin, que estava casando endereços com ruas de mesmo nome em outras
// cidades por falta de precisão. Usa a MESMA GOOGLE_MAPS_API_KEY já
// configurada na Vercel pro tempo de caminhada — só precisa habilitar
// "Geocoding API" nela também, no Google Cloud Console.
//
// Sempre devolve, além de lat/lng, a distância até o centro de Treze
// Tílias — quem chama decide se avisa o admin ou não, mas a medição já
// vem pronta daqui, pra não duplicar essa conta em vários lugares.

const CENTRO_TREZE_TILIAS = { lat: -27.0026, lng: -51.4084 };
const TIMEOUT_SERVIDOR_MS = 6000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido" });
    return;
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.error("[geocodificar] GOOGLE_MAPS_API_KEY não configurada na Vercel.");
    res.status(500).json({ erro: "Geocodificação não configurada no servidor" });
    return;
  }

  const { endereco } = req.body || {};
  if (!endereco || !endereco.trim()) {
    res.status(400).json({ erro: "Endereço é obrigatório" });
    return;
  }

  // "region" enviesa o resultado pro Brasil sem excluir tudo fora dele;
  // apendar ", Treze Tílias, SC, Brasil" no texto de busca é o que de
  // fato ancora o resultado na cidade certa — é o mesmo texto que o
  // Google Maps normal usaria se você digitasse manualmente.
  const params = new URLSearchParams({
    address: `${endereco.trim()}, Treze Tílias, SC, Brasil`,
    region: "br",
    language: "pt-BR",
    key: process.env.GOOGLE_MAPS_API_KEY,
  });

  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_SERVIDOR_MS);

  try {
    const resposta = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params}`,
      { signal: controlador.signal }
    );
    const dados = await resposta.json();

    if (dados.status !== "OK" || !dados.results?.[0]) {
      // ZERO_RESULTS é resultado válido de "não achei", não erro de sistema.
      if (dados.status !== "ZERO_RESULTS") {
        console.warn("[geocodificar] Geocoding status:", dados.status, dados.error_message);
      }
      res.status(200).json({ encontrado: false });
      return;
    }

    const resultado = dados.results[0];
    const lat = resultado.geometry.location.lat;
    const lng = resultado.geometry.location.lng;
    const distanciaKmDoCentro = distanciaKm(CENTRO_TREZE_TILIAS, { lat, lng });

    res.status(200).json({
      encontrado: true,
      lat,
      lng,
      enderecoFormatado: resultado.formatted_address,
      distanciaKmDoCentro,
    });
  } catch (erro) {
    console.error("[geocodificar] Erro:", erro.name === "AbortError" ? "timeout" : erro);
    res.status(200).json({ encontrado: false }); // fallback silencioso, admin cai pra digitação manual
  } finally {
    clearTimeout(timeoutId);
  }
}

function distanciaKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aH = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(aH), Math.sqrt(1 - aH));
}
