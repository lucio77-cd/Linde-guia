/**
 * mapa.js — js/pages/mapa.js
 * Linde Guia — Treze Tílias
 *
 * Mapa real (Leaflet + OpenStreetMap) com todos os POIs cadastrados,
 * cada um com um marcador colorido pela categoria (mesmas cores que
 * já aparecem em explorar.html e no admin). Clicar no marcador abre um
 * popup com nome + categoria + link pra página do local.
 *
 * O "clima tirolês" do mapa vem só de CSS (filter: sepia/hue-rotate/
 * saturate no container dos tiles, ver mapa.html) — decisão consciente
 * de começar sem contratar um provedor de estilo de mapa customizado
 * (MapTiler, Stadia), que exigiria conta nova e chave nova. Se o
 * resultado visual não convencer, é o próximo passo a considerar.
 */
import { buscarPoisAtivos } from "../data/pois-data.js";

const CENTRO_TREZE_TILIAS = { lat: -27.0026, lng: -51.4084 };
const ZOOM_INICIAL = 15;

const COR_CATEGORIA = {
  gastronomia: "#8B4A1A",
  historico:   "#1A2D8B",
  natureza:    "#1A6B2D",
  compras:     "#6B1A8B",
  lazer:       "#8B6B1A",
  cultura:     "#8B3A1A",
};

const EMOJI_CATEGORIA = {
  gastronomia: "🍽️",
  historico:   "🏛️",
  natureza:    "🌲",
  compras:     "🛍️",
  lazer:       "🎡",
  cultura:     "🎭",
};

async function iniciarMapa() {
  const mapa = L.map("mapa", { zoomControl: true }).setView(
    [CENTRO_TREZE_TILIAS.lat, CENTRO_TREZE_TILIAS.lng],
    ZOOM_INICIAL
  );

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(mapa);

  let pois;
  try {
    pois = await buscarPoisAtivos();
  } catch (erro) {
    console.error("[mapa] Erro ao carregar locais:", erro);
    mostrarErroCarregamento();
    return;
  }

  const poisComLocalizacao = pois.filter((poi) => poi.localizacao?.lat && poi.localizacao?.lng);

  poisComLocalizacao.forEach((poi) => {
    const marcador = criarMarcadorPoi(poi);
    marcador.addTo(mapa);
  });

  esconderCarregamento();
  document.getElementById("legenda-mapa").hidden = false;

  // Se não há nenhum POI com coordenada, ainda mostra o mapa (melhor que
  // travar), só sem marcador nenhum — sinal silencioso de que o cadastro
  // precisa de atenção, não um erro pro turista.
  if (poisComLocalizacao.length === 0) {
    console.warn("[mapa] Nenhum POI com localização cadastrada.");
  }
}

function criarMarcadorPoi(poi) {
  const cor = COR_CATEGORIA[poi.categoria] || "#4A3F38";
  const emoji = EMOJI_CATEGORIA[poi.categoria] || "📍";

  const icone = L.divIcon({
    className: "",
    html: `<div class="marcador-poi" style="background:${cor}"><span class="marcador-poi__emoji">${emoji}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });

  const marcador = L.marker([poi.localizacao.lat, poi.localizacao.lng], { icon: icone });

  marcador.bindPopup(`
    <div class="popup-poi">
      <p class="popup-poi__nome">${escaparHtml(poi.nome)}</p>
      <p class="popup-poi__categoria">${escaparHtml(poi.categoria || "")}</p>
      <a class="popup-poi__link" href="ponto.html?id=${encodeURIComponent(poi.id)}">Ver detalhes</a>
    </div>
  `);

  return marcador;
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto || "";
  return div.innerHTML;
}

function esconderCarregamento() {
  document.getElementById("estado-carregando-mapa").hidden = true;
}

function mostrarErroCarregamento() {
  const el = document.getElementById("estado-carregando-mapa");
  el.textContent = "Não consegui carregar os locais agora. Tenta recarregar a página.";
}

document.addEventListener("DOMContentLoaded", iniciarMapa);
