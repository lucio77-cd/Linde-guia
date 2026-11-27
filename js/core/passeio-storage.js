/**
 * passeio-storage.js — js/core/passeio-storage.js
 * Guarda o estado do passeio (rota, parada atual, contadores) em
 * localStorage com validade, no lugar de sessionStorage.
 * POR QUÊ: sessionStorage some quando o navegador do celular recarrega a
 * aba ou é fechado — o turista perdia a rota no meio do passeio. Com
 * validade de 12h o estado sobrevive, mas não fica "preso" pra sempre.
 * Mesma interface do Storage (getItem/setItem/removeItem); se o
 * localStorage estiver bloqueado, cai pra memória da aba.
 */
const VALIDADE_MS = 12 * 60 * 60 * 1000;
const memoria = new Map();

function armazenamento() {
  try { return window.localStorage; } catch { return null; }
}

export const passeioStorage = {
  getItem(chave) {
    const ls = armazenamento();
    if (!ls) return memoria.has(chave) ? memoria.get(chave) : null;
    try {
      const bruto = ls.getItem(chave);
      if (bruto === null) return null;
      const reg = JSON.parse(bruto);
      if (!reg || typeof reg.expiraEm !== "number" || reg.expiraEm < Date.now()) {
        ls.removeItem(chave);
        return null;
      }
      return reg.valor;
    } catch {
      return null;
    }
  },
  setItem(chave, valor) {
    const ls = armazenamento();
    if (!ls) { memoria.set(chave, String(valor)); return; }
    try {
      ls.setItem(chave, JSON.stringify({ valor: String(valor), expiraEm: Date.now() + VALIDADE_MS }));
    } catch {
      memoria.set(chave, String(valor));
    }
  },
  removeItem(chave) {
    memoria.delete(chave);
    const ls = armazenamento();
    try { ls?.removeItem(chave); } catch { /* ignora */ }
  },
};
