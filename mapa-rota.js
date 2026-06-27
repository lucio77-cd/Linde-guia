/**
 * mapa-rota.js
 * Linde Guia — Treze Tílias
 *
 * Módulo compartilhado de mapa (Leaflet, via CDN — sem chave de API).
 * Usado tanto na sub-vista de resultado (mapa com a rota toda desenhada)
 * quanto na sub-vista Em Rota (mapa focado na parada atual + posição do
 * usuário). Não depende de render-rota.js nem modo-em-rota.js — só
 * recebe dados e desenha.
 */

const COR_MARCA = "#3C4A3E"; // var(--cor-lodengrun), Leaflet não lê CSS vars direto
const COR_ACAO = "#9E2B25"; // var(--cor-vermelho-tirol)
const COR_USUARIO = "#2563eb";

// ============================================================
// MAPA COMPLETO DA ROTA (sub-vista de resultado)
// ============================================================
function desenharMapaCompleto(elementoId, paradas, pontoPartida) {
  const elemento = document.getElementById(elementoId);
  if (!elemento || typeof L === "undefined") return null;

  const mapa = L.map(elementoId, { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  }).addTo(mapa);

  const pontos = [];

  if (pontoPartida) {
    L.circleMarker([pontoPartida.lat, pontoPartida.lng], {
      radius: 7,
      color: COR_USUARIO,
      fillColor: COR_USUARIO,
      fillOpacity: 1,
    })
      .addTo(mapa)
      .bindPopup("Você está aqui");
    pontos.push([pontoPartida.lat, pontoPartida.lng]);
  }

  paradas.forEach((parada, indice) => {
    if (!parada.localizacao) return;

    const marcador = criarMarcadorNumerado(parada.localizacao, indice + 1);
    marcador.addTo(mapa).bindPopup(`<strong>${indice + 1}. ${parada.nome}</strong>`);
    pontos.push([parada.localizacao.lat, parada.localizacao.lng]);
  });

  if (pontos.length > 1) {
    L.polyline(pontos, { color: COR_MARCA, weight: 3, opacity: 0.7, dashArray: "6 8" }).addTo(mapa);
  }

  ajustarVisualizacao(mapa, pontos);

  return mapa;
}

// ============================================================
// MAPA FOCADO (sub-vista Em Rota) — parada atual + usuário, atualizável
// ============================================================
function criarMapaFocado(elementoId) {
  const elemento = document.getElementById(elementoId);
  if (!elemento || typeof L === "undefined") return null;

  const mapa = L.map(elementoId, { scrollWheelZoom: false, zoomControl: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  }).addTo(mapa);

  let marcadorParada = null;
  let marcadorUsuario = null;
  let linha = null;

  function atualizar(localizacaoParada, localizacaoUsuario, nomeParada) {
    const pontos = [];

    if (localizacaoParada) {
      if (marcadorParada) mapa.removeLayer(marcadorParada);
      marcadorParada = criarMarcadorDestino(localizacaoParada);
      marcadorParada.addTo(mapa).bindPopup(nomeParada || "Próxima parada");
      pontos.push([localizacaoParada.lat, localizacaoParada.lng]);
    }

    if (localizacaoUsuario) {
      if (marcadorUsuario) mapa.removeLayer(marcadorUsuario);
      marcadorUsuario = L.circleMarker([localizacaoUsuario.lat, localizacaoUsuario.lng], {
        radius: 8,
        color: COR_USUARIO,
        fillColor: COR_USUARIO,
        fillOpacity: 1,
      });
      marcadorUsuario.addTo(mapa).bindPopup("Você está aqui");
      pontos.push([localizacaoUsuario.lat, localizacaoUsuario.lng]);
    }

    if (linha) mapa.removeLayer(linha);
    if (pontos.length === 2) {
      linha = L.polyline(pontos, { color: COR_ACAO, weight: 3, opacity: 0.7, dashArray: "6 8" }).addTo(mapa);
    }

    ajustarVisualizacao(mapa, pontos);
  }

  return { mapa, atualizar };
}

// ============================================================
// HELPERS DE MARCADOR
// ============================================================
function criarMarcadorNumerado(localizacao, numero) {
  const icone = L.divIcon({
    className: "marcador-numerado",
    html: `<span>${numero}</span>`,
    iconSize: [28, 28],
  });
  return L.marker([localizacao.lat, localizacao.lng], { icon: icone });
}

function criarMarcadorDestino(localizacao) {
  const icone = L.divIcon({
    className: "marcador-destino",
    html: `<span>📍</span>`,
    iconSize: [32, 32],
  });
  return L.marker([localizacao.lat, localizacao.lng], { icon: icone });
}

function ajustarVisualizacao(mapa, pontos) {
  if (pontos.length === 0) return;
  if (pontos.length === 1) {
    mapa.setView(pontos[0], 16);
  } else {
    mapa.fitBounds(pontos, { padding: [30, 30] });
  }
}

export { desenharMapaCompleto, criarMapaFocado };
