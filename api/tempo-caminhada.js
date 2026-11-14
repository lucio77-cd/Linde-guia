// api/tempo-caminhada.js
// Linde Guia — Treze Tílias
//
// Mede a caminhada na ordem de paradas já decidida pelo motor. Não escolhe
// nem reordena locais. Se a Directions API falhar, o app usa a estimativa.
//
// Variável Vercel: GOOGLE_MAPS_API_KEY (habilite apenas Directions API).
// Esta rota pública tem limite básico por IP, validação de coordenadas,
// limite de paradas e raio geográfico. Configure também rate limiting
// distribuído no Firewall da Vercel e cotas no Google Cloud.

import { dentroDoLimite } from "./_limites.js";

const TIMEOUT_SERVIDOR_MS = 6000;
const LIMITE_CHAMADAS = { nome: "caminhada", maximo: 30, janelaMs: 10 * 60 * 1000 };
const MAX_PARADAS = 8;
const CENTRO_TREZE_TILIAS = { lat: -27.0026, lng: -51.4084 };
const RAIO_MAXIMO_KM = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido" });
    return;
  }

  if (!dentroDoLimite(req, res, LIMITE_CHAMADAS)) return;

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.error("[tempo-caminhada] GOOGLE_MAPS_API_KEY não configurada na Vercel.");
    res.status(200).json({ deslocamentosMin: null, polyline: null });
    return;
  }

  const { origem, paradas } = req.body || {};
  if (!origem || !Array.isArray(paradas) || paradas.length === 0) {
    res.status(400).json({ erro: "origem e paradas são obrigatórios" });
    return;
  }
  if (paradas.length > MAX_PARADAS) {
    res.status(413).json({ erro: `No máximo ${MAX_PARADAS} paradas por chamada` });
    return;
  }
  if (!coordenadaValida(origem)) {
    res.status(400).json({ erro: "origem precisa ter lat e lng numéricos" });
    return;
  }

  const todasComCoordenada = paradas.every(coordenadaValida);
  if (!todasComCoordenada) {
    res.status(200).json({ deslocamentosMin: null, polyline: null });
    return;
  }

  const todosPerto = [origem, ...paradas].every(
    (p) => distanciaKm(CENTRO_TREZE_TILIAS, p) <= RAIO_MAXIMO_KM
  );
  if (!todosPerto) {
    res.status(200).json({ deslocamentosMin: null, polyline: null });
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
      if (dados.status && dados.status !== "OK" && dados.status !== "ZERO_RESULTS") {
        console.warn("[tempo-caminhada] Directions status:", dados.status, dados.error_message);
      }
      res.status(200).json({ deslocamentosMin: null, polyline: null });
      return;
    }

    const legs = dados.routes[0].legs;
    if (legs.length !== paradas.length || legs.some((trecho) => !Number.isFinite(trecho.duration?.value))) {
      res.status(200).json({ deslocamentosMin: null, polyline: null });
      return;
    }

    const deslocamentosMin = legs.map((trecho) => Math.round(trecho.duration.value / 60));
    const polyline = dados.routes[0].overview_polyline?.points || null;
    res.status(200).json({ deslocamentosMin, polyline });
  } catch (erro) {
    console.error("[tempo-caminhada] Erro:", erro.name === "AbortError" ? "timeout" : erro);
    res.status(200).json({ deslocamentosMin: null, polyline: null });
  } finally {
    clearTimeout(timeoutId);
  }
}

function coordenadaValida(p) {
  return (
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
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
  const seguro = Math.min(1, Math.max(0, aH));
  return R * 2 * Math.atan2(Math.sqrt(seguro), Math.sqrt(1 - seguro));
}
