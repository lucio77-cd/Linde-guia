// api/curar-capitulo.js
// Linde Guia — Treze Tílias
//
// Função serverless (Vercel) — chamada por js/engine/curador-ia.js.
// Recebe a lista de POIs JÁ FILTRADA pelo motor-rota.js (aberto, bate com
// refeição, etc). NUNCA decide isso sozinha — só escolhe e ordena DENTRO
// do que já é viável. responseSchema garante o formato de saída; mesmo
// assim os ids são revalidados contra a lista original antes de responder
// — defesa em profundidade, não confia cegamente no schema.
//
// Variável de ambiente necessária na Vercel: GEMINI_API_KEY
// (Project → Settings → Environment Variables — habilite SÓ a
// "Generative Language API" nessa chave, no Google Cloud Console)

const MODELO = "gemini-2.5-flash";
const TIMEOUT_SERVIDOR_MS = 8000; // abaixo do limite de execução da função serverless

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    idsEscolhidos: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "ids dos POIs escolhidos, na ordem sugerida de visita",
    },
    explicacao: {
      type: "STRING",
      description: "frase curta e amigável em português explicando a escolha",
    },
  },
  required: ["idsEscolhidos", "explicacao"],
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido" });
    return;
  }

  // Erro #4 do mapa de riscos: chave esquecida na Vercel. Sem essa
  // checagem, o erro só aparece como "fetch falhou" genérico — difícil de
  // diagnosticar sem terminal. Com ela, o log da função diz exatamente
  // o que falta configurar.
  if (!process.env.GEMINI_API_KEY) {
    console.error("[curar-capitulo] GEMINI_API_KEY não configurada na Vercel.");
    res.status(500).json({ erro: "IA não configurada no servidor" });
    return;
  }

  const { candidatos, perfilBusca, historico, maxParadas } = req.body || {};

  if (!Array.isArray(candidatos) || candidatos.length === 0) {
    res.status(400).json({ erro: "Lista de candidatos vazia ou inválida" });
    return;
  }

  const idsValidos = new Set(candidatos.map((c) => c.id));
  const prompt = montarPrompt(candidatos, perfilBusca, historico, maxParadas || 4);

  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_SERVIDOR_MS);

  try {
    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            maxOutputTokens: 1024,
          },
        }),
        signal: controlador.signal,
      }
    );

    if (!resposta.ok) {
      const corpoErro = await resposta.text().catch(() => "");
      throw new Error(`Gemini API respondeu ${resposta.status}: ${corpoErro.slice(0, 300)}`);
    }

    const dados = await resposta.json();
    const textoResposta = dados.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!textoResposta) {
      throw new Error("Gemini não devolveu texto (possível bloqueio de safety filter)");
    }

    const parsed = JSON.parse(textoResposta.trim());
    const idsEscolhidos = (parsed.idsEscolhidos || []).filter((id) => idsValidos.has(id));

    if (idsEscolhidos.length === 0) {
      throw new Error("Gemini não devolveu nenhum id válido dentro dos candidatos");
    }

    res.status(200).json({
      idsEscolhidos,
      explicacao: typeof parsed.explicacao === "string" ? parsed.explicacao : "",
    });
  } catch (erro) {
    console.error("[curar-capitulo] Erro:", erro.name === "AbortError" ? "timeout" : erro);
    res.status(502).json({ erro: "Falha ao curar com IA" });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Contexto de cidade fica FIXO no prompt (não é buscado toda vez) — é
// história, não muda entre requisições, e economiza uma chamada de API.
const CONTEXTO_CIDADE = `Treze Tílias, SC, foi colonizada em 1933 por imigrantes
tiroleses (região dos Alpes austríacos), trazidos pelo governo do Tirol depois
da 1ª Guerra Mundial. A cidade preserva arquitetura, gastronomia e tradições
tirolesas até hoje — chalés de madeira entalhada, cucos, música alpina,
comida com influência austríaca (strudel, salsichas, cerveja artesanal).`;

function montarPrompt(candidatos, perfilBusca, historico, maxParadas) {
  const listaResumida = candidatos.map((c) => ({
    id: c.id,
    nome: c.nome,
    categoria: c.categoria,
    tagsDeInteresse: c.tagsDeInteresse || [],
    avaliacao: c.avaliacao || null,
    descricaoCurta: c.descricaoCurta || "",
  }));

  return `Você é um guia local especialista em Treze Tílias, SC.

${CONTEXTO_CIDADE}

Escolha até ${maxParadas} lugares da lista abaixo pro próximo trecho do
passeio dessa pessoa e devolva em que ordem visitar. Case a ordem com o
que faz sentido narrativamente (ex: um lugar que conta a história da
colonização antes de um restaurante temático) e geograficamente (evite
zigue-zague óbvio, mesmo sem saber a distância exata — use o bom senso de
que o centro histórico é compacto e caminhável).

Perfil da pessoa agora:
${JSON.stringify(perfilBusca, null, 2)}

Histórico dela (visitados/favoritados/rotas salvas antes — use pra variar ou
reforçar um padrão de gosto claro, a seu critério):
${JSON.stringify(historico || {}, null, 2)}

Lugares disponíveis AGORA (só pode escolher entre estes ids, não invente nenhum):
${JSON.stringify(listaResumida, null, 2)}`;
}
