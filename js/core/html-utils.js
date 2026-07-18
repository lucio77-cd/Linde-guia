/**
 * html-utils.js
 * Linde Guia — Treze Tílias
 *
 * Utilitário compartilhado pra escapar texto antes de injetar em innerHTML.
 * Antes existia uma cópia dessa mesma função só dentro de roteiro-manual.js
 * — modo-em-rota.js e mapa-rota.js interpolavam nome/categoria de POI direto
 * em innerHTML sem escapar. O dado hoje só vem do admin (risco baixo), mas
 * é boa prática defender essa camada de qualquer jeito: se um dia um campo
 * de POI passar a aceitar texto livre de outra fonte, essa proteção já
 * existe em todo lugar que injeta HTML, não só onde alguém lembrou de pôr.
 */
function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto || "";
  return div.innerHTML;
}

export { escaparHtml };
