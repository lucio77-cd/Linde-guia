// api/curar-capitulo.js
// Linde Guia — Treze Tílias
//
// Função serverless (Vercel) — chamada por js/engine/curador-ia.js.
// Recebe a lista de POIs JÁ FILTRADA pelo motor-rota.js (aberto, bate com
// refeição, etc). NUNCA decide isso sozinha — só escolhe e ordena DENTRO
// do que já é viável. Se a IA inventar um id que não estava na lista
// recebida, esse id é descartado antes de responder.
//
// Variável de ambiente necessária na Vercel: ANTHROPIC_API_KEY
// (Project → Settings → Environment Variables)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido" });
    return;
  }

  const { candidatos, perfilBusca, historico, maxParadas } = req.body || {};

  if (!Array.isArray(candidatos) || candidatos.length === 0) {
    res.status(400).json({ erro: "Lista de candidatos vazia ou inválida" });
    return;
  }

  const idsValidos = new Set(candidatos.map((c) => c.id));
  const prompt = montarPrompt(candidatos, perfilBusca, historico, maxParadas || 4);

  try {
    const resposta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resposta.ok) {
      throw new Error(`Anthropic API respondeu ${resposta.status}`);
    }

    const dados = await resposta.json();
    const textoResposta = dados.content?.find((b) => b.type === "text")?.text || "";
    const parsed = JSON.parse(textoResposta.trim());

    const idsEscolhidos = (parsed.idsEscolhidos || []).filter((id) => idsValidos.has(id));

    if (idsEscolhidos.length === 0) {
      throw new Error("IA não devolveu nenhum id válido dentro dos candidatos");
    }

    res.status(200).json({
      idsEscolhidos,
      explicacao: typeof parsed.explicacao === "string" ? parsed.explicacao : "",
    });
  } catch (erro) {
    console.error("[curar-capitulo] Erro:", erro);
    res.status(502).json({ erro: "Falha ao curar com IA" });
  }
}

function montarPrompt(candidatos, perfilBusca, historico, maxParadas) {
  const listaResumida = candidatos.map((c) => ({
    id: c.id,
    nome: c.nome,
    categoria: c.categoria,
    tagsDeInteresse: c.tagsDeInteresse || [],
    avaliacao: c.avaliacao || null,
    descricaoCurta: c.descricaoCurta || "",
  }));

  return `Você é um guia local de Treze Tílias, SC (colonização tirolesa).
Escolha até ${maxParadas} lugares da lista abaixo pro próximo trecho do passeio
dessa pessoa e devolva em que ordem visitar.

Perfil da pessoa agora:
${JSON.stringify(perfilBusca, null, 2)}

Histórico dela (visitados/favoritados/rotas salvas antes — use pra variar ou
reforçar um padrão de gosto claro, a seu critério):
${JSON.stringify(historico || {}, null, 2)}

Lugares disponíveis AGORA (só pode escolher entre estes ids, não invente nenhum):
${JSON.stringify(listaResumida, null, 2)}

Responda SOMENTE com JSON válido, sem texto antes ou depois, nesse formato:
{"idsEscolhidos": ["id1","id2"], "explicacao": "frase curta e amigável em português"}`;
}
