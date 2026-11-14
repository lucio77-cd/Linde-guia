/**
 * admin-analise.js — js/admin/admin-analise.js
 * Linde Guia — Treze Tílias
 *
 * Cálculos do dashboard. Funções PURAS: recebem os dados já lidos e devolvem
 * números — sem Firebase, sem DOM. Isso permite testar tudo em Node e manter
 * admin-estatisticas.js só com a parte de tela.
 *
 * Limites conhecidos dos dados (para ninguém tirar conclusão errada):
 *  - A métrica atual estima aparelhos únicos por dia; os dias antigos podem contar carregamentos de página. Não comparar diretamente.
 *  - "Concluídas" não está ligada à rota que a originou; a razão
 *    concluídas/criadas é uma aproximação, não uma taxa exata.
 *  - paradasNomes = locais OFERECIDOS pelo roteiro; não diz se a pessoa
 *    foi ou pulou. Visita real = check-in.
 *  - Oferecido x visitado casa por NOME do local (rotas_criadas não guarda id).
 */

const MS_DIA = 24 * 60 * 60 * 1000;

export const LABEL_REFEICAO = { cafeDaManha: "Café da manhã", almoco: "Almoço", tarde: "Lanche da tarde", janta: "Janta" };
export const LABEL_INTERESSE = { historia: "História", natureza: "Natureza", gastronomia: "Gastronomia", compras: "Compras", familia: "Família", cultura: "Cultura austríaca" };
export const LABEL_CATEGORIA = { gastronomia: "Gastronomia", historico: "História", natureza: "Natureza", compras: "Compras", lazer: "Lazer", cultura: "Cultura" };
export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Interesse que o turista marca -> categoria do local. "Família" ~ lazer é
// uma aproximação (não existe categoria "família" nos locais).
const INTERESSE_PARA_CATEGORIA = {
  historia: "historico", natureza: "natureza", gastronomia: "gastronomia",
  compras: "compras", familia: "lazer", cultura: "cultura",
};

// ============================================================
// DATAS (sempre no horário LOCAL — toISOString() usa UTC e jogava o
// movimento da noite no dia seguinte)
// ============================================================
export function chaveDia(data) {
  return [
    data.getFullYear(),
    String(data.getMonth() + 1).padStart(2, "0"),
    String(data.getDate()).padStart(2, "0"),
  ].join("-");
}

function dataDaChave(chave) {
  const [a, m, d] = chave.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function somarDias(chave, n) {
  const d = dataDaChave(chave);
  d.setDate(d.getDate() + n);
  return chaveDia(d);
}

export function rotuloDia(chave) {
  const [, m, d] = chave.split("-");
  return `${d}/${m}`;
}

function paraData(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Janela do período e a janela anterior de mesmo tamanho (pra comparar).
 * periodo: 7 | 30 | 90 | "tudo". Para "tudo", `inicio` é null e não há anterior.
 */
export function intervaloDoPeriodo(periodo, hoje = new Date()) {
  const fim = chaveDia(hoje);
  if (periodo === "tudo") {
    return { inicio: null, fim, dias: null, anteriorInicio: null, anteriorFim: null };
  }
  const dias = Number(periodo);
  const inicio = somarDias(fim, -(dias - 1));
  return {
    inicio,
    fim,
    dias,
    anteriorInicio: somarDias(inicio, -dias),
    anteriorFim: somarDias(inicio, -1),
  };
}

function naJanela(chave, de, ate) {
  if (!chave) return false;
  if (de && chave < de) return false;
  if (ate && chave > ate) return false;
  return true;
}

// ============================================================
// NOMES — rotas_criadas guarda o nome, checkins guarda nome e id.
// ============================================================
export function normalizarNome(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function contar(lista, extrator) {
  const mapa = {};
  lista.forEach((item) => {
    const chaves = extrator(item);
    (Array.isArray(chaves) ? chaves : [chaves]).forEach((k) => {
      if (k == null || k === "") return;
      mapa[k] = (mapa[k] || 0) + 1;
    });
  });
  return mapa;
}

function ordenar(mapa) {
  return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
}

function variacao(atual, anterior) {
  if (anterior == null || anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

function percentual(parte, total) {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

// ============================================================
// ANÁLISE PRINCIPAL
// ============================================================
/**
 * dados: { acessos: [{data:'AAAA-MM-DD', total, porHora}],
 *          criacoes: [{criadoEm: Date, ...}], finalizacoes: [...],
 *          checkins: [{checkinEm: Date, ...}], pois: [...] }
 */
export function analisar(dados, periodo, hoje = new Date()) {
  const janela = intervaloDoPeriodo(periodo, hoje);
  const { inicio, fim, anteriorInicio, anteriorFim } = janela;

  const acessosTodos = dados.acessos || [];
  const diaDe = (campo) => (r) => (r[campo] ? chaveDia(r[campo]) : null);

  const daJanela = (lista, campo) => lista.filter((r) => naJanela(diaDe(campo)(r), inicio, fim));
  const daAnterior = (lista, campo) =>
    anteriorInicio ? lista.filter((r) => naJanela(diaDe(campo)(r), anteriorInicio, anteriorFim)) : [];

  const acessos = acessosTodos.filter((a) => naJanela(a.data, inicio, fim));
  const acessosAnt = anteriorInicio ? acessosTodos.filter((a) => naJanela(a.data, anteriorInicio, anteriorFim)) : [];

  const criacoes = daJanela(dados.criacoes || [], "criadoEm");
  const criacoesAnt = daAnterior(dados.criacoes || [], "criadoEm");
  const finalizacoes = daJanela(dados.finalizacoes || [], "criadoEm");
  const finalizacoesAnt = daAnterior(dados.finalizacoes || [], "criadoEm");
  const checkins = daJanela(dados.checkins || [], "checkinEm");
  const checkinsAnt = daAnterior(dados.checkins || [], "checkinEm");
  const pois = dados.pois || [];

  const somaAcessos = (lista) => lista.reduce((s, a) => s + (Number(a.total) || 0), 0);
  const totalAcessos = somaAcessos(acessos);
  const totalAcessosAnt = somaAcessos(acessosAnt);

  const comparar = anteriorInicio != null;
  const kpi = (valor, anterior) => ({ valor, anterior: comparar ? anterior : null, variacaoPct: comparar ? variacao(valor, anterior) : null });

  const vazias = criacoes.filter((r) => r.capituloVazio).length;
  const kpis = {
    acessos: kpi(totalAcessos, totalAcessosAnt),
    rotas: kpi(criacoes.length, criacoesAnt.length),
    concluidas: kpi(finalizacoes.length, finalizacoesAnt.length),
    checkins: kpi(checkins.length, checkinsAnt.length),
    conversaoPct: percentual(criacoes.length, totalAcessos),
    conclusaoPct: percentual(finalizacoes.length, criacoes.length),
    mediaParadas: criacoes.length > 0
      ? Number((criacoes.reduce((s, r) => s + (Number(r.quantidadeParadas) || 0), 0) / criacoes.length).toFixed(1))
      : 0,
    rotasVazias: vazias,
    rotasVaziasPct: percentual(vazias, criacoes.length),
  };

  // ---------- Oferecido x visitado, por local ----------
  const oferecidoPorNome = {};
  // Nome oficial do cadastro tem prioridade na exibição.
  const nomeOriginal = {};
  pois.forEach((p) => { if (p.nome) nomeOriginal[normalizarNome(p.nome)] = p.nome; });
  criacoes.forEach((r) => {
    new Set((r.paradasNomes || []).map((n) => String(n))).forEach((nome) => {
      const k = normalizarNome(nome);
      if (!k) return;
      oferecidoPorNome[k] = (oferecidoPorNome[k] || 0) + 1;
      nomeOriginal[k] = nomeOriginal[k] || nome;
    });
  });
  const visitadoPorNome = {};
  checkins.forEach((c) => {
    const k = normalizarNome(c.poiNome);
    if (!k) return;
    visitadoPorNome[k] = (visitadoPorNome[k] || 0) + 1;
    nomeOriginal[k] = nomeOriginal[k] || c.poiNome;
  });
  const nomesUnicos = new Set([...Object.keys(oferecidoPorNome), ...Object.keys(visitadoPorNome)]);
  const ofertaVisita = [...nomesUnicos]
    .map((k) => ({
      nome: nomeOriginal[k],
      oferecido: oferecidoPorNome[k] || 0,
      visitas: visitadoPorNome[k] || 0,
    }))
    .sort((a, b) => b.oferecido - a.oferecido || b.visitas - a.visitas);

  // ---------- Locais cadastrados que nunca foram sugeridos ----------
  // Só vale com amostra mínima: com 3 rotas, "nunca sugerido" é ruído.
  const AMOSTRA_MINIMA_ROTAS = 10;
  const poisAtivos = pois.filter((p) => (p.statusOperacional || "ativo") === "ativo");
  const nuncaSugeridos = criacoes.length >= AMOSTRA_MINIMA_ROTAS
    ? poisAtivos.filter((p) => !oferecidoPorNome[normalizarNome(p.nome)]).map((p) => ({ nome: p.nome, categoria: p.categoria }))
    : [];

  // ---------- Patrocinadores (locais com patrocínio) ----------
  const patrocinados = pois
    .filter((p) => p.patrocinio && p.patrocinio.nivel && p.patrocinio.ativo !== false)
    .map((p) => {
      const k = normalizarNome(p.nome);
      return {
        nome: p.nome,
        nivel: p.patrocinio.nivel,
        oferecido: oferecidoPorNome[k] || 0,
        visitas: visitadoPorNome[k] || 0,
      };
    })
    .sort((a, b) => b.oferecido - a.oferecido);

  // ---------- Mapa de calor: dia da semana x hora (rotas criadas) ----------
  const matriz = Array.from({ length: 7 }, () => new Array(24).fill(0));
  criacoes.forEach((r) => {
    const d = paraData(r.criadoEm);
    if (d) matriz[d.getDay()][d.getHours()]++;
  });
  const maxCalor = Math.max(0, ...matriz.flat());

  // ---------- Demanda (interesse marcado) x realizado (categoria visitada) ----------
  const pedidoPorCat = {};
  criacoes.forEach((r) => {
    (r.interesses || []).forEach((i) => {
      const cat = INTERESSE_PARA_CATEGORIA[i];
      if (cat) pedidoPorCat[cat] = (pedidoPorCat[cat] || 0) + 1;
    });
  });
  const visitaPorCat = contar(checkins, (c) => c.poiCategoria);
  const totalPedido = Object.values(pedidoPorCat).reduce((a, b) => a + b, 0);
  const totalVisita = Object.values(visitaPorCat).reduce((a, b) => a + b, 0);
  const categorias = [...new Set([...Object.keys(pedidoPorCat), ...Object.keys(visitaPorCat)])];
  const demanda = categorias
    .map((cat) => ({
      categoria: cat,
      rotulo: LABEL_CATEGORIA[cat] || cat,
      pedidoPct: percentual(pedidoPorCat[cat] || 0, totalPedido),
      visitadoPct: percentual(visitaPorCat[cat] || 0, totalVisita),
    }))
    .sort((a, b) => b.pedidoPct - a.pedidoPct);

  // ---------- Quando o motor falha (rotas sem resultado) ----------
  const faixas = [
    { faixa: "Manhã (até 11h)", de: 0, ate: 11 },
    { faixa: "Meio-dia e tarde (12h–17h)", de: 12, ate: 17 },
    { faixa: "Noite (18h em diante)", de: 18, ate: 23 },
  ].map((f) => ({ faixa: f.faixa, total: 0, vazias: 0, de: f.de, ate: f.ate }));
  criacoes.forEach((r) => {
    const d = paraData(r.horarioInicioEscolhido);
    if (!d) return;
    const h = d.getHours();
    const f = faixas.find((x) => h >= x.de && h <= x.ate);
    if (!f) return;
    f.total++;
    if (r.capituloVazio) f.vazias++;
  });
  const falhasPorFaixa = faixas.map(({ faixa, total, vazias: v }) => ({ faixa, total, vazias: v }));

  // ---------- Séries ----------
  const serieDia = montarSerieDia(acessos, criacoes, finalizacoes, inicio, fim);

  const acessosPorHora = new Array(24).fill(0);
  acessos.forEach((a) => {
    Object.entries(a.porHora || {}).forEach(([h, q]) => {
      const n = Number(h);
      if (n >= 0 && n < 24) acessosPorHora[n] += Number(q) || 0;
    });
  });

  const rotasPorDiaSemana = new Array(7).fill(0);
  criacoes.forEach((r) => { const d = paraData(r.criadoEm); if (d) rotasPorDiaSemana[d.getDay()]++; });

  const refeicoes = ordenar(contar(criacoes, (r) => r.refeicoesDesejadas))
    .map(([k, q]) => ({ rotulo: LABEL_REFEICAO[k] || k, valor: q }));
  const interesses = ordenar(contar(criacoes, (r) => r.interesses))
    .map(([k, q]) => ({ rotulo: LABEL_INTERESSE[k] || k, valor: q }));

  const checkinsPorOrigem = contar(checkins, (c) => c.origemDeteccao);

  const ultimosCheckins = [...checkins]
    .filter((c) => c.checkinEm)
    .sort((a, b) => b.checkinEm - a.checkinEm)
    .slice(0, 20);

  const ultimoAcesso = acessosTodos.map((a) => a.data).sort().pop() || null;

  const resultado = {
    periodo,
    janela,
    kpis,
    ofertaVisita,
    nuncaSugeridos,
    patrocinados,
    amostraMinimaRotas: AMOSTRA_MINIMA_ROTAS,
    calor: { matriz, max: maxCalor },
    demanda,
    falhasPorFaixa,
    serieDia,
    acessosPorHora,
    rotasPorDiaSemana,
    refeicoes,
    interesses,
    checkinsPorOrigem,
    ultimosCheckins,
    ultimoAcesso,
    temDados: totalAcessos + criacoes.length + checkins.length > 0,
  };

  resultado.alertas = gerarAlertas(resultado, hoje);
  return resultado;
}

// ============================================================
// SÉRIE POR DIA — dias sem registro entram com zero, senão o gráfico
// "esconde" os dias parados.
// ============================================================
function montarSerieDia(acessos, criacoes, finalizacoes, inicio, fim) {
  const acessoPorDia = {};
  acessos.forEach((a) => { acessoPorDia[a.data] = (acessoPorDia[a.data] || 0) + (Number(a.total) || 0); });
  const rotasPorDia = contar(criacoes, (r) => (r.criadoEm ? chaveDia(r.criadoEm) : null));
  const concluidasPorDia = contar(finalizacoes, (r) => (r.criadoEm ? chaveDia(r.criadoEm) : null));

  let primeiro = inicio;
  if (!primeiro) {
    const todas = [...Object.keys(acessoPorDia), ...Object.keys(rotasPorDia), ...Object.keys(concluidasPorDia)].sort();
    primeiro = todas[0] || fim;
  }

  const serie = [];
  for (let c = primeiro; c <= fim; c = somarDias(c, 1)) {
    serie.push({
      chave: c,
      acessos: acessoPorDia[c] || 0,
      rotas: rotasPorDia[c] || 0,
      concluidas: concluidasPorDia[c] || 0,
    });
    if (serie.length > 800) break; // trava de segurança
  }
  return serie;
}

/**
 * Agrupa a série em no máximo `maxBarras` barras (semanas, quinzenas...)
 * pra caber na tela do celular. Cada barra: { rotulo, acessos, rotas, concluidas }.
 */
export function agruparSerie(serie, maxBarras = 30) {
  if (serie.length <= maxBarras) {
    return serie.map((d) => ({ rotulo: rotuloDia(d.chave), acessos: d.acessos, rotas: d.rotas, concluidas: d.concluidas }));
  }
  const tamanho = Math.ceil(serie.length / maxBarras);
  const grupos = [];
  for (let i = 0; i < serie.length; i += tamanho) {
    const fatia = serie.slice(i, i + tamanho);
    grupos.push({
      rotulo: rotuloDia(fatia[0].chave),
      acessos: fatia.reduce((s, d) => s + d.acessos, 0),
      rotas: fatia.reduce((s, d) => s + d.rotas, 0),
      concluidas: fatia.reduce((s, d) => s + d.concluidas, 0),
    });
  }
  return grupos;
}

// ============================================================
// "O QUE MERECE ATENÇÃO"
// ============================================================
function diasEntre(chaveA, chaveB) {
  return Math.round((dataDaChave(chaveB) - dataDaChave(chaveA)) / MS_DIA);
}

function gerarAlertas(a, hoje) {
  const alertas = [];
  const { kpis } = a;
  const hojeChave = chaveDia(hoje);

  if (!a.temDados) {
    alertas.push({
      nivel: "info",
      titulo: "Sem dados neste período",
      texto: "Nenhum acesso, rota ou check-in registrado. Tente um período maior.",
    });
  }

  if (a.ultimoAcesso) {
    const parado = diasEntre(a.ultimoAcesso, hojeChave);
    if (parado >= 3) {
      alertas.push({
        nivel: "atencao",
        titulo: `Nenhum acesso há ${parado} dias`,
        texto: "O último acesso registrado foi em " + rotuloDia(a.ultimoAcesso) + ". Vale conferir se o site está no ar.",
      });
    }
  }

  const v = kpis.acessos.variacaoPct;
  if (v != null && v <= -30 && kpis.acessos.anterior >= 10) {
    alertas.push({
      nivel: "atencao",
      titulo: `Acessos caíram ${Math.abs(v)}%`,
      texto: `${kpis.acessos.valor} acessos contra ${kpis.acessos.anterior} no período anterior.`,
    });
  } else if (v != null && v >= 30 && kpis.acessos.anterior >= 10) {
    alertas.push({
      nivel: "bom",
      titulo: `Acessos subiram ${v}%`,
      texto: `${kpis.acessos.valor} acessos contra ${kpis.acessos.anterior} no período anterior.`,
    });
  }

  if (kpis.rotasVazias > 0 && kpis.rotasVaziasPct >= 5) {
    const pior = [...a.falhasPorFaixa].filter((f) => f.vazias > 0).sort((x, y) => y.vazias - x.vazias)[0];
    alertas.push({
      nivel: "atencao",
      titulo: `${kpis.rotasVazias} rotas sem resultado (${kpis.rotasVaziasPct}%)`,
      texto: pior
        ? `O turista pediu e não recebeu nenhuma parada. Mais comum em: ${pior.faixa}.`
        : "O turista pediu e não recebeu nenhuma parada.",
    });
  }

  const patrocinadosParados = a.patrocinados.filter((p) => p.oferecido === 0);
  if (a.nuncaSugeridos.length > 0 && patrocinadosParados.length > 0 && kpis.rotas.valor >= a.amostraMinimaRotas) {
    alertas.push({
      nivel: "atencao",
      titulo: `${patrocinadosParados.length} patrocinado(s) nunca apareceu em rota`,
      texto: patrocinadosParados.slice(0, 3).map((p) => p.nome).join(", ") + ". Quem paga e não aparece é problema na hora de renovar.",
    });
  }

  if (a.nuncaSugeridos.length > 0) {
    alertas.push({
      nivel: "info",
      titulo: `${a.nuncaSugeridos.length} local(is) ativo(s) nunca sugerido(s)`,
      texto: a.nuncaSugeridos.slice(0, 3).map((p) => p.nome).join(", ")
        + (a.nuncaSugeridos.length > 3 ? " e mais" : "")
        + ". Pode faltar horário, localização ou interesse no cadastro.",
    });
  }

  const semVisita = a.ofertaVisita.filter((l) => l.oferecido >= 8 && l.visitas === 0);
  if (semVisita.length > 0) {
    alertas.push({
      nivel: "info",
      titulo: `${semVisita.length} local(is) sugerido(s) várias vezes e nunca visitado(s)`,
      texto: semVisita.slice(0, 3).map((l) => l.nome).join(", ") + ". Ou o turista pula, ou não marca o check-in.",
    });
  }

  const gps = a.checkinsPorOrigem.gps || 0;
  const manual = a.checkinsPorOrigem.manual || 0;
  if (gps + manual >= 10 && manual / (gps + manual) > 0.5) {
    alertas.push({
      nivel: "info",
      titulo: "Maioria dos check-ins é manual",
      texto: `${percentual(manual, gps + manual)}% foram marcados no botão, não pelo GPS. O número de visitas pode estar inflado.`,
    });
  }

  if (alertas.length === 0 || alertas.every((x) => x.nivel === "bom")) {
    alertas.push({ nivel: "bom", titulo: "Nada fora do normal", texto: "Nenhum problema detectado neste período." });
  }

  const ordem = { atencao: 0, info: 1, bom: 2 };
  return alertas.sort((x, y) => ordem[x.nivel] - ordem[y.nivel]);
}

// ============================================================
// TEXTO PARA COMPARTILHAR (WhatsApp) — curto, só o que importa
// ============================================================
export function rotuloPeriodo(periodo) {
  return periodo === "tudo" ? "todo o período" : `últimos ${periodo} dias`;
}

function seta(pct) {
  if (pct == null) return "";
  return pct > 0 ? ` (▲ ${pct}%)` : pct < 0 ? ` (▼ ${Math.abs(pct)}%)` : " (=)";
}

export function montarTextoResumo(a) {
  const k = a.kpis;
  const linhas = [
    `📊 Linde Guia — ${rotuloPeriodo(a.periodo)}`,
    "",
    `Acessos registrados: ${k.acessos.valor}${seta(k.acessos.variacaoPct)}`,
    `Rotas criadas: ${k.rotas.valor}${seta(k.rotas.variacaoPct)}`,
    `Rotas concluídas: ${k.concluidas.valor}`,
    `Check-ins (visitas): ${k.checkins.valor}${seta(k.checkins.variacaoPct)}`,
  ];
  const top = a.ofertaVisita.filter((l) => l.visitas > 0).sort((x, y) => y.visitas - x.visitas).slice(0, 3);
  if (top.length) {
    linhas.push("", "Mais visitados:");
    top.forEach((l, i) => linhas.push(`${i + 1}. ${l.nome} — ${l.visitas}`));
  }
  const atencao = a.alertas.filter((x) => x.nivel === "atencao");
  if (atencao.length) {
    linhas.push("", "Atenção:");
    atencao.forEach((x) => linhas.push(`• ${x.titulo}`));
  }
  return linhas.join("\n");
}

// ============================================================
// RESUMO AGREGADO PARA O RELATÓRIO COM IA (nunca dado individual)
// ============================================================
export function montarResumoParaIA(a) {
  const k = a.kpis;
  const topVisitados = [...a.ofertaVisita].filter((l) => l.visitas > 0).sort((x, y) => y.visitas - x.visitas).slice(0, 5);
  return {
    periodo: rotuloPeriodo(a.periodo),
    totalAcessos: k.acessos.valor,
    variacaoAcessosPct: k.acessos.variacaoPct,
    totalRotasCriadas: k.rotas.valor,
    variacaoRotasPct: k.rotas.variacaoPct,
    totalRotasConcluidas: k.concluidas.valor,
    taxaConversaoAcessoParaRota: k.conversaoPct,
    taxaConclusao: k.conclusaoPct,
    totalCheckins: k.checkins.valor,
    rotasSemResultado: k.rotasVazias,
    mediaParadasPorRota: k.mediaParadas,
    refeicoesMaisPedidas: a.refeicoes.map((r) => ({ refeicao: r.rotulo, vezes: r.valor })),
    interessesMaisMarcados: a.interesses.map((r) => ({ interesse: r.rotulo, vezes: r.valor })),
    top5LocaisMaisVisitados: topVisitados.map((l) => `${l.nome} (${l.visitas})`),
    locaisNuncaSugeridos: a.nuncaSugeridos.length,
    patrocinados: a.patrocinados.map((p) => ({ nivel: p.nivel, vezesSugerido: p.oferecido, visitas: p.visitas })),
    observacao: "A contagem atual estima visitantes (aparelhos), uma vez por aparelho por dia. Dias anteriores à mudança podem contar carregamentos de página e não são diretamente comparáveis. Não chamar de pessoas. Concluídas/criadas é aproximação.",
  };
}
