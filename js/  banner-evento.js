/**
 * banner-evento.js
 * Linde Guia — Treze Tílias
 *
 * Mostra o banner de evento na Home SE houver algo ativo agora
 * (ex: Tirolerfest, Natal Iluminado). Se não houver, o banner
 * continua oculto (atributo "hidden" do HTML nunca é removido).
 */

import { buscarEventoAtivoAgora } from "./eventos-data.js";

async function iniciarBannerEvento() {
  const banner = document.getElementById("banner-evento");
  const textoEl = document.getElementById("banner-evento__texto");
  const linkEl = document.getElementById("banner-evento__link");

  if (!banner) return;

  const evento = await buscarEventoAtivoAgora();

  if (!evento) {
    return; // mantém hidden
  }

  textoEl.textContent = `Acontecendo agora: ${evento.nome}`;
  linkEl.href = `eventos.html?id=${evento.id}`;
  banner.hidden = false;
}

document.addEventListener("DOMContentLoaded", iniciarBannerEvento);

export { iniciarBannerEvento };
