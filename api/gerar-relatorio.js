// api/gerar-relatorio.js
// Linde Guia — Treze Tílias
//
// Gera um relatório em texto corrido a partir dos números JÁ AGREGADOS do
// dashboard admin (contagens, médias, percentuais) — nunca recebe dado
// pessoal ou individual (nome de turista, check-in específico, etc), só
// os totais que admin-estatisticas.js já calculou pra desenhar os
// gráficos. Isso é intencional: o relatório é sobre PADRÕES de uso, não
// sobre pessoas.
//
// Usa a MESMA GEMINI_API_KEY já configurada na Vercel (Generative Language
// API) pro curador de rota.

const MODELO = "gemini-2.5-flash";
const TIMEOUT_SERVIDOR_MS = 12000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido" });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("[gerar-relatorio] GEMINI_API_KEY não configurada na Vercel.");
    res.status(500).json({ erro: "IA não configurada no servidor" });
    return;
  }

  const { resumo } = req.body || {};
  if (!resumo || typeof resumo !== "object") {
    res.status(400).json({ erro: "Resumo de estatísticas é obrigatório" });
    return;
  }

  const prompt = montarPrompt(resumo);
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
          generationConfig: { maxOutputTokens: 1536 },
        }),
        signal: controlador.signal,
      }
    );

    if (!resposta.ok) {
      const corpoErro = await resposta.text().catch(() => "");
      throw new Error(`Gemini API respondeu ${resposta.status}: ${corpoErro.slice(0, 300)}`);
    }

    const dados = await resposta.json();
    const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!texto) {
      throw new Error("Gemini não devolveu texto (possível bloqueio de safety filter)");
    }

    res.status(200).json({ relatorio: texto.trim() });
  } catch (erro) {
    console.error("[gerar-relatorio] Erro:", erro.name === "AbortError" ? "timeout" : erro);
    res.status(502).json({ erro: "Falha ao gerar relatório com IA" });
  } finally {
    clearTimeout(timeoutId);
  }
}

function montarPrompt(resumo) {
  return `Você é um analista de dados escrevendo um relatório curto pro dono de um
app de turismo (Linde Guia, guia de Treze Tílias, SC — cidade de colonização
tirolesa). O relatório serve tanto pra ele entender o próprio negócio quanto
pra usar como argumento na hora de vender espaço de patrocínio (banners
Ouro/Prata/Bronze) pra estabelecimentos locais.

Aqui estão os números do período (todos já agregados, sem dado pessoal):
${JSON.stringify(resumo, null, 2)}

Escreva um relatório em português, em 4 seções curtas, com estes títulos
exatos:

## Resumo do período
(2-3 frases gerais sobre o volume de uso)

## Pontos fortes
(o que os números mostram de positivo — cite números específicos)

## Pontos de atenção
(riscos ou quedas que os números sugerem — ex: taxa de conclusão baixa,
muitas rotas sem resultado, categoria pouco pedida)

## Argumento de venda para patrocinadores
(2-3 frases prontas pra usar numa conversa com um possível patrocinador,
citando números concretos do próprio relatório — ex: quantas pessoas
acessam por dia, qual interesse é mais pedido)

Seja direto e concreto. Não invente números que não estão nos dados
fornecidos. Se algum dado estiver zerado ou faltando, mencione isso como
"ainda sem dado suficiente" em vez de inventar uma conclusão.`;
}
