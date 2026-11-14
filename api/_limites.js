// api/_limites.js
//
// Primeira barreira contra abuso das APIs públicas que consomem cotas pagas.
// A memória é local à instância serverless: não substitui rate limiting
// distribuído no Firewall da Vercel nem limites de cota no Google Cloud.

const contadores = new Map();
const MAX_CHAVES_GUARDADAS = 5000;

function ipDe(req) {
  // A Vercel fornece x-real-ip com o IP observado na borda.
  const ipReal = req.headers["x-real-ip"];
  if (typeof ipReal === "string" && ipReal.trim()) return ipReal.trim();

  const encaminhado = req.headers["x-forwarded-for"];
  if (typeof encaminhado === "string" && encaminhado.trim()) {
    return encaminhado.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "desconhecido";
}

export function dentroDoLimite(req, res, { nome, maximo, janelaMs }) {
  const agora = Date.now();
  const chave = `${nome}:${ipDe(req)}`;

  if (contadores.size > MAX_CHAVES_GUARDADAS) {
    for (const [k, v] of contadores) {
      if (agora - v.inicio > janelaMs) contadores.delete(k);
    }
    if (contadores.size > MAX_CHAVES_GUARDADAS) contadores.clear();
  }

  const atual = contadores.get(chave);
  if (!atual || agora - atual.inicio > janelaMs) {
    contadores.set(chave, { inicio: agora, total: 1 });
    return true;
  }

  atual.total += 1;
  if (atual.total > maximo) {
    const esperaSeg = Math.ceil((atual.inicio + janelaMs - agora) / 1000);
    res.setHeader("Retry-After", String(Math.max(1, esperaSeg)));
    res.status(429).json({ erro: "Muitas chamadas seguidas. Tenta de novo em instantes." });
    return false;
  }
  return true;
}
