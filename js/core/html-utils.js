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
  // Escapa também aspas, pra ser seguro dentro de atributos (class="...",
  // href="...") e não só em conteúdo de tag. Preserva o número 0.
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export { escaparHtml };
