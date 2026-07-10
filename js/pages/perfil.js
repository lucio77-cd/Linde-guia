/**
 * perfil.js
 * Linde Guia — Treze Tílias
 *
 * Lógica da tela "Meus selos" (pages/perfil.html). Lê os selos gravados
 * localmente por selos-local.js (não depende de Firestore nem de login —
 * ver comentário de arquitetura em selos-local.js).
 */
import { lerSelos } from "../core/selos-local.js";

const ICONES_CATEGORIA = {
  gastronomia: "🥨",
  historico: "🏛️",
  natureza: "🌲",
  lazer: "🎡",
  compras: "🛍️",
  evento: "🎉",
};

function iniciarPerfil() {
  const selos = [...lerSelos()].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
  );

  document.getElementById("contador-numero").textContent = String(selos.length);
  document.getElementById("contador-label").textContent =
    selos.length === 1 ? "selo coletado" : "selos coletados";

  const lista = document.getElementById("lista-selos");
  const estadoVazio = document.getElementById("estado-vazio");

  if (selos.length === 0) {
    estadoVazio.hidden = false;
    return;
  }

  selos.forEach((selo) => lista.appendChild(criarCardSelo(selo)));
}

document.addEventListener("DOMContentLoaded", iniciarPerfil);

function criarCardSelo(selo) {
  const li = document.createElement("li");
  li.className = "card-selo";

  const icone = ICONES_CATEGORIA[selo.poiCategoria] || "📍";

  li.innerHTML = `
    <div class="card-selo__icone" aria-hidden="true">${icone}</div>
    <div class="card-selo__corpo">
      <p class="card-selo__nome">${escaparHtml(selo.poiNome)}</p>
      <p class="card-selo__data">${formatarData(selo.data)}</p>
    </div>
  `;
  return li;
}

function formatarData(isoString) {
  if (!isoString) return "";
  const data = new Date(isoString);
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto || "";
  return div.innerHTML;
}
