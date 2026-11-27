/**
 * cache-persistente.js — js/core/cache-persistente.js
 * Cache de leitura do Firestore em sessionStorage com validade (TTL).
 * POR QUÊ: o cache só em memória some a cada troca de página (o site é
 * multipágina), então cada tela relia a coleção inteira e a cota gratuita
 * do Firestore acabava rápido. Aqui o dado sobrevive entre páginas da
 * mesma visita. Se o storage estiver bloqueado ou cheio, simplesmente
 * não faz cache — nunca quebra o app.
 */
const PREFIXO = "linde-guia:cache:";

export function lerCache(nome, validadeMs) {
  try {
    const bruto = sessionStorage.getItem(PREFIXO + nome);
    if (!bruto) return null;
    const { t, dados } = JSON.parse(bruto);
    if (typeof t !== "number" || Date.now() - t >= validadeMs) return null;
    return dados;
  } catch {
    return null;
  }
}

export function gravarCache(nome, dados) {
  try {
    sessionStorage.setItem(PREFIXO + nome, JSON.stringify({ t: Date.now(), dados }));
  } catch { /* cheio ou bloqueado: segue sem cache */ }
}

export function limparCache(nome) {
  try { sessionStorage.removeItem(PREFIXO + nome); } catch { /* ignora */ }
}
