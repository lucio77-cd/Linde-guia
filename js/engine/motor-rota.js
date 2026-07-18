/**
 * motor-rota.js
 * Linde Guia — Treze Tílias
 *
 * O CÉREBRO do app. Não toca DOM, não importa HTML, não fala com Firebase
 * nem com nenhuma API externa direto (isso é feito pelos endpoints em
 * /api, chamados pelos módulos em js/engine/curador-ia.js e
 * js/engine/caminhada-real.js).
 *
 * Recebe: lista de POIs (+ eventos) e um Perfil de Busca.
 * Devolve: um CAPÍTULO da rota (não o "dia inteiro") — ver nota de
 * arquitetura abaixo.
 *
 * ============================================================
 * POR QUE "CAPÍTULO" E NÃO MAIS "TEMPO DISPONÍVEL / ORÇAMENTO / GRUPO"
 * ============================================================
 * Versão anterior deste motor recebia duração total, orçamento e horário
 * de término, e tentava montar o DIA INTEIRO de uma vez. Isso quebrava
 * sempre que a combinação de campos era fisicamente impossível (ex: pedir
 * "janta" numa janela que termina às 13h) — o motor tentava reservar slot
 * pra algo inviável e o resultado final podia ficar vazio ou incoerente.
 *
 * A troca foi pelo modelo que apps de navegação e itinerário de referência
 * usam: nunca promete o dia inteiro de uma vez. Gera um CAPÍTULO — um
 * grupo curto e coerente de paradas — e pergunta se a pessoa quer
 * continuar. Cada capítulo fecha ao atingir MAX_PARADAS_POR_CAPITULO ou
 * por falta de candidato viável.
 *
 * Etapas (na ordem que são executadas):
 *   1. filtrarCandidatos()          -> remove o que é IMPOSSÍVEL (fechado, já visitado, refeição não bate)
 *   2. garantias de refeição/interesse -> reserva slots pros itens mais importantes deste capítulo
 *   3. pontuarCandidatos()          -> dá nota pra cada POI restante (distância, avaliação, interesse)
 *   4. montarCapitulo()             -> escolhe a combinação + ordem
 *   5. recalcularRota()             -> usado durante o passeio, quando o usuário marca "Cheguei" ou "Pula essa"
 *
 * ============================================================
 * CURADORIA POR IA E TEMPO REAL (opcional, camadas externas)
 * ============================================================
 * obterCandidatosViaveis() expõe o resultado do filtro duro (etapa 1) pro
 * curador de IA (js/engine/curador-ia.js) escolher/ordenar dentro dela —
 * a IA nunca vê POI fora desse conjunto, e o chamador valida os ids
 * devolvidos contra essa mesma lista.
 *
 * aplicarDeslocamentosReais() troca a estimativa por linha reta pelos
 * minutos reais de caminhada (js/engine/caminhada-real.js, via Directions
 * API) — na MESMA ordem já decidida, sem reordenar nada.
 *
 * As duas camadas são OPCIONAIS por design: se qualquer uma falhar, o
 * capítulo continua válido com o motor de pontuação e a estimativa padrão.
 */

// ============================================================
// 1. CONSTANTES DO MOTOR
// ============================================================
const PESOS = {
  distancia: 0.5,     // cidade pequena: o que está mais perto pesa MUITO
  avaliacao: 0.3,      // nota/qualidade do lugar
  interesse: 0.2,      // match com interesses marcados (se o usuário preencheu)
};

const MARGEM_SEGURANCA_MIN = 10; // minutos de "colchão" entre paradas, pra não estourar horário por atraso

// Tamanho máximo de um capítulo. Range que estudos de memória de curto
// prazo (regra de Miller, 7±2, com trabalhos mais recentes apontando 3-5
// como o ponto ideal) apontam como o tamanho que uma pessoa processa como
// um bloco fechado sem se perder.
const MAX_PARADAS_POR_CAPITULO = 4;

// Nível mínimo de prioridade gastronômica (definido no admin, escala 1-5)
// que GARANTE o lugar no capítulo — não é só um bônus de pontuação, é uma
// reserva de slot.
const NIVEL_MINIMO_GARANTIA_GASTRONOMICA = 4;

// Janelas de horário aproximadas de cada refeição.
const REFEICAO_JANELAS = {
  cafeDaManha: { inicio: "06:00", fim: "10:30" },
  almoco:      { inicio: "11:00", fim: "14:30" },
  tarde:       { inicio: "14:30", fim: "18:00" },
  janta:       { inicio: "18:00", fim: "22:30" },
};

// ============================================================
// FUNÇÃO PRINCIPAL — chamada pela tela "Criar Roteiro" e também pra gerar
// cada capítulo seguinte.
// ============================================================
// perfilBusca esperado:
//   localizacaoPartida: { lat, lng }
//   horarioInicio: ISO datetime
//   data: ISO date
//   refeicoesDesejadas: array de refeições AINDA NÃO atendidas
//   interesses: array de tags de interesse marcadas
//   idsExcluidos: array de ids de POI que NÃO podem entrar (já visitados)
function gerarCapitulo(pois, eventos, perfilBusca) {
  const candidatosViaveis = obterCandidatosViaveis(pois, eventos, perfilBusca);

  if (candidatosViaveis.length === 0) {
    return capituloVazio(perfilBusca);
  }

  const refeicaoFronteira = proximaRefeicaoFronteira(perfilBusca.refeicoesDesejadas);

  const idsReservados = new Set();
  const experienciasGastronomicas = escolherExperienciasGastronomicasGarantidas(
    candidatosViaveis,
    refeicaoFronteira ? [refeicaoFronteira] : [],
    idsReservados,
    perfilBusca.horarioInicio
  );
  const experienciasDeInteresse = escolherExperienciasDeInteresseGarantidas(
    candidatosViaveis,
    perfilBusca.interesses,
    idsReservados
  );
  const experienciasGarantidas = [...experienciasGastronomicas, ...experienciasDeInteresse];

  const candidatosPontuados = pontuarCandidatos(candidatosViaveis, perfilBusca);

  return montarCapitulo(candidatosPontuados, perfilBusca, experienciasGarantidas);
}

// ============================================================
// CANDIDATOS VIÁVEIS — expõe só o filtro duro (etapa 1). Usado por
// gerarCapitulo() internamente, e pelo curador de IA.
// ============================================================
function obterCandidatosViaveis(pois, eventos, perfilBusca) {
  const candidatosIniciais = injetarEventosAtivos(pois, eventos, perfilBusca.data);
  const idsExcluidos = new Set(perfilBusca.idsExcluidos || []);
  const candidatosDisponiveis = candidatosIniciais.filter((poi) => !idsExcluidos.has(poi.id));

  return filtrarCandidatos(candidatosDisponiveis, perfilBusca);
}

// ============================================================
// MODO MANUAL / IA — a escolha (usuário ou IA) já foi feita por fora.
// ============================================================
// Diferente de gerarCapitulo(), aqui a ESCOLHA já foi feita — esta função
// nunca pontua nem decide quem entra. Resolve ids -> POIs reais, descarta
// o que não está mais viável, ordena geograficamente e calcula horário
// real. Devolve `idsDescartados`: ids escolhidos que não entraram, pra
// quem chamou poder avisar o usuário em vez de a rota encolher sem
// explicação.
function gerarCapituloDeFavoritos(pois, perfilBusca, idsSelecionados) {
  const idsUnicos = [...new Set(idsSelecionados || [])];
  const mapaPois = new Map(pois.map((poi) => [poi.id, poi]));
  const idsExcluidos = new Set(perfilBusca.idsExcluidos || []);

  const idsDescartados = [];
  const viaveis = [];

  for (const id of idsUnicos) {
    const poi = mapaPois.get(id);

    if (!poi) { idsDescartados.push(id); continue; }
    if (idsExcluidos.has(id)) { idsDescartados.push(id); continue; }
    if (poi.statusOperacional === "fechado_temporariamente") { idsDescartados.push(id); continue; }
    if (!estaAbertoNoHorario(poi, perfilBusca.horarioInicio, perfilBusca.data)) { idsDescartados.push(id); continue; }

    viaveis.push(poi);
  }

  if (viaveis.length === 0) {
    return { ...capituloVazio(perfilBusca), idsDescartados };
  }

  const sequenciaOtimizada = ordenarPorProximidadeGeografica(viaveis, perfilBusca.localizacaoPartida);
  const paradasFinais = calcularERevalidarAteEstabilizar(sequenciaOtimizada, perfilBusca);

  const idsQueSobraram = new Set(paradasFinais.map((p) => p.id));
  const idsRevalidacaoDescartou = viaveis.map((p) => p.id).filter((id) => !idsQueSobraram.has(id));

  return {
    ...montarResultadoCapitulo(paradasFinais, perfilBusca),
    idsDescartados: [...idsDescartados, ...idsRevalidacaoDescartou],
  };
}

// ============================================================
// TEMPO REAL DE CAMINHADA — troca a estimativa (Haversine) pelos minutos
// reais devolvidos pela Directions API (js/engine/caminhada-real.js), na
// MESMA ordem de paradas já decidida. Não reordena nada. Se não vier dado
// real, devolve o capítulo como já estava, com a estimativa.
// ============================================================
function aplicarDeslocamentosReais(paradas, deslocamentosReaisMin, perfilBusca) {
  if (!deslocamentosReaisMin || deslocamentosReaisMin.length !== paradas.length) {
    return montarResultadoCapitulo(paradas, perfilBusca);
  }

  const comDeslocamentoReal = paradas.map((parada, i) => ({
    ...parada,
    deslocamentoMin: deslocamentosReaisMin[i],
  }));

  const paradasFinais = calcularERevalidarAteEstabilizar(comDeslocamentoReal, perfilBusca);
  return montarResultadoCapitulo(paradasFinais, perfilBusca);
}

function proximaRefeicaoFronteira(refeicoesDesejadas) {
  if (!refeicoesDesejadas || refeicoesDesejadas.length === 0) return null;
  return [...refeicoesDesejadas].sort(
    (a, b) => REFEICAO_JANELAS[a].inicio.localeCompare(REFEICAO_JANELAS[b].inicio)
  )[0];
}

// ============================================================
// FUNÇÃO DE RECÁLCULO — chamada pelo "modo Em Rota" (Cheguei / Pular)
// ============================================================
function recalcularRota(rotaAtual, paradaAtualIndex, acao, horarioAtual, posicaoAtual) {
  const paradasRestantes = rotaAtual.paradas.slice(paradaAtualIndex + 1);

  if (acao === "pular") {
    paradasRestantes.shift();
  }

  if (paradasRestantes.length === 0) {
    return { ...rotaAtual, paradas: rotaAtual.paradas.slice(0, paradaAtualIndex + 1), finalizada: true };
  }

  const reordenadas = ordenarPorProximidadeGeografica(paradasRestantes, posicaoAtual);
  const comHorario = calcularHorariosReais(reordenadas, horarioAtual);
  const validas = comHorario.filter((p) =>
    estaAbertoNoHorario(p, p.horarioChegada, rotaAtual.perfilOriginal.data)
  );

  return {
    ...rotaAtual,
    paradas: [...rotaAtual.paradas.slice(0, paradaAtualIndex + 1), ...validas],
    finalizada: validas.length === 0,
  };
}

// ============================================================
// ETAPA 0 — injeta eventos sazonais ativos como candidatos
// ============================================================
function injetarEventosAtivos(pois, eventos, dataReferencia) {
  const eventosAtivos = (eventos || []).filter((evento) =>
    dataEstaNoIntervalo(dataReferencia, evento.dataInicio, evento.dataFim)
  );

  const eventosComoPoi = eventosAtivos.map((evento) => ({
    id: `evento-${evento.id}`,
    nome: evento.nome,
    categoria: "evento",
    descricaoCurta: evento.descricao,
    localizacao: evento.localizacao || null,
    horarioFuncionamento: evento.horarioFuncionamento,
    precoEstimado: evento.precoEstimado || 0,
    duracaoMediaVisitaMin: evento.duracaoMediaVisitaMin || 60,
    avaliacao: 5,
    tagsDeInteresse: evento.tagsDeInteresse || ["cultura"],
    statusOperacional: "ativo",
    pesoInstitucional: evento.pesoInstitucional ?? 1,
  }));

  return [...pois, ...eventosComoPoi];
}

// ============================================================
// ETAPA 1 — FILTRO DURO
// ============================================================
function filtrarCandidatos(pois, perfilBusca) {
  return pois.filter((poi) => {
    if (poi.statusOperacional === "fechado_temporariamente") return false;
    if (!estaAbertoNoHorario(poi, perfilBusca.horarioInicio, perfilBusca.data)) return false;
    if (!candidatoCombinaComRefeicoesDesejadas(poi, perfilBusca.refeicoesDesejadas)) return false;
    return true;
  });
}

function estaAbertoNoHorario(poi, horarioInicio, dataReferencia) {
  if (!poi.horarioFuncionamento) return true;

  const diaSemana = obterDiaSemana(dataReferencia);
  const janela = poi.horarioFuncionamento[diaSemana];

  if (!janela || janela.fechado) return false;
  if (!horarioDentroDaJanela(horarioInicio, janela.abre, janela.fecha)) return false;

  if (janela.pausaAlmoco && horarioDentroDaJanela(horarioInicio, janela.pausaAlmoco.inicio, janela.pausaAlmoco.fim)) {
    return false;
  }

  return true;
}

// ============================================================
// ETAPA 2 — GARANTIA DE EXPERIÊNCIA GASTRONÔMICA
// ============================================================
function escolherExperienciasGastronomicasGarantidas(candidatosViaveis, refeicoesFronteira, idsReservados, horarioInicio) {
  if (!refeicoesFronteira || refeicoesFronteira.length === 0) return [];

  const garantidas = [];

  for (const refeicao of refeicoesFronteira) {
    const janela = REFEICAO_JANELAS[refeicao];
    if (!horarioDentroDaJanela(horarioInicio, janela.inicio, janela.fim)) continue;

    const candidatosDaRefeicao = candidatosViaveis.filter(
      (poi) =>
        poi.categoria === "gastronomia" &&
        !idsReservados.has(poi.id) &&
        (poi.prioridadeGastronomica || 0) >= NIVEL_MINIMO_GARANTIA_GASTRONOMICA &&
        poiServeRefeicao(poi, refeicao)
    );

    if (candidatosDaRefeicao.length === 0) continue;

    const melhor = [...candidatosDaRefeicao].sort(
      (a, b) => (b.prioridadeGastronomica || 0) - (a.prioridadeGastronomica || 0)
    )[0];

    garantidas.push({ ...melhor, refeicaoReservadaPara: refeicao });
    idsReservados.add(melhor.id);
  }

  return garantidas;
}

// ============================================================
// ETAPA 2b — GARANTIA DE EXPERIÊNCIA POR INTERESSE
// ============================================================
function escolherExperienciasDeInteresseGarantidas(candidatosViaveis, interesses, idsReservados) {
  if (!interesses || interesses.length === 0) return [];

  const garantidas = [];

  for (const interesse of interesses) {
    const candidatosDoInteresse = candidatosViaveis.filter(
      (poi) => !idsReservados.has(poi.id) && (poi.tagsDeInteresse || []).includes(interesse)
    );

    if (candidatosDoInteresse.length === 0) continue;

    const melhor = [...candidatosDoInteresse].sort((a, b) => (b.avaliacao || 0) - (a.avaliacao || 0))[0];

    garantidas.push({ ...melhor, interesseReservadoPara: interesse });
    idsReservados.add(melhor.id);
  }

  return garantidas;
}

function poiServeRefeicao(poi, refeicao) {
  if (!poi.refeicoesServidas || poi.refeicoesServidas.length === 0) return true;
  return poi.refeicoesServidas.includes(refeicao);
}

function candidatoCombinaComRefeicoesDesejadas(poi, refeicoesDesejadas) {
  if (poi.categoria !== "gastronomia") return true;
  if (!refeicoesDesejadas || refeicoesDesejadas.length === 0) return true;
  return refeicoesDesejadas.some((refeicao) => poiServeRefeicao(poi, refeicao));
}

// ============================================================
// ETAPA 3 — PONTUAÇÃO
// ============================================================
function pontuarCandidatos(pois, perfilBusca) {
  return pois.map((poi) => {
    const distanciaScore = normalizarProximidade(poi.localizacao, perfilBusca.localizacaoPartida);
    const avaliacaoScore = normalizarAvaliacao(poi.avaliacao);
    const interesseScore = normalizarMatchInteresse(poi.tagsDeInteresse, perfilBusca.interesses);

    const score =
      PESOS.distancia * distanciaScore +
      PESOS.avaliacao * avaliacaoScore +
      PESOS.interesse * interesseScore +
      (poi.pesoInstitucional || 0) * 0.05;

    return { ...poi, score };
  });
}

function normalizarProximidade(localizacaoPoi, localizacaoPartida) {
  if (!localizacaoPoi) return 0.5;
  const distanciaKm = calcularDistanciaKm(localizacaoPartida, localizacaoPoi);
  const distanciaMaximaRelevanteKm = 5;
  return Math.max(0, 1 - distanciaKm / distanciaMaximaRelevanteKm);
}

function normalizarAvaliacao(avaliacao) {
  if (!avaliacao) return 0.5;
  return Math.min(1, avaliacao / 5);
}

function normalizarMatchInteresse(tagsPoi, interessesUsuario) {
  if (!interessesUsuario || interessesUsuario.length === 0) return 0.5;
  if (!tagsPoi || tagsPoi.length === 0) return 0;
  const intersecao = tagsPoi.filter((tag) => interessesUsuario.includes(tag));
  return intersecao.length / interessesUsuario.length;
}

// ============================================================
// ETAPA 4 — MONTAGEM DO CAPÍTULO
// ============================================================
function montarCapitulo(candidatosPontuados, perfilBusca, experienciasGarantidas) {
  const selecionados = [];
  let posicaoAtual = perfilBusca.localizacaoPartida;

  for (const experiencia of experienciasGarantidas || []) {
    if (selecionados.length >= MAX_PARADAS_POR_CAPITULO) break;

    const deslocamento = estimarDeslocamentoMin(posicaoAtual, experiencia.localizacao);
    selecionados.push({ ...experiencia, deslocamentoMin: deslocamento });
    posicaoAtual = experiencia.localizacao || posicaoAtual;
  }

  const idsJaSelecionados = new Set(selecionados.map((p) => p.id));
  const ordenadosPorScore = [...candidatosPontuados]
    .filter((c) => !idsJaSelecionados.has(c.id))
    .sort((a, b) => b.score - a.score);

  for (const candidato of ordenadosPorScore) {
    if (selecionados.length >= MAX_PARADAS_POR_CAPITULO) break;

    const deslocamento = estimarDeslocamentoMin(posicaoAtual, candidato.localizacao);
    selecionados.push({ ...candidato, deslocamentoMin: deslocamento });
    posicaoAtual = candidato.localizacao || posicaoAtual;
  }

  const sequenciaOtimizada = ordenarPorProximidadeGeografica(selecionados, perfilBusca.localizacaoPartida);
  const paradasFinais = calcularERevalidarAteEstabilizar(sequenciaOtimizada, perfilBusca);

  return montarResultadoCapitulo(paradasFinais, perfilBusca);
}

function montarResultadoCapitulo(paradasFinais, perfilBusca) {
  const refeicoesAtendidas = new Set();
  for (const parada of paradasFinais) {
    if (parada.categoria !== "gastronomia") continue;
    for (const refeicao of perfilBusca.refeicoesDesejadas || []) {
      if (
        poiServeRefeicao(parada, refeicao) &&
        horarioDentroDaJanela(parada.horarioChegada, REFEICAO_JANELAS[refeicao].inicio, REFEICAO_JANELAS[refeicao].fim)
      ) {
        refeicoesAtendidas.add(refeicao);
      }
    }
  }

  const refeicoesRestantes = (perfilBusca.refeicoesDesejadas || []).filter((r) => !refeicoesAtendidas.has(r));
  const ultimaParada = paradasFinais[paradasFinais.length - 1];

  return {
    paradas: paradasFinais,
    refeicoesAtendidas: [...refeicoesAtendidas],
    refeicoesRestantes,
    horarioFinal: ultimaParada ? ultimaParada.horarioSaida : new Date(perfilBusca.horarioInicio),
    posicaoFinal: ultimaParada ? ultimaParada.localizacao || perfilBusca.localizacaoPartida : perfilBusca.localizacaoPartida,
    custoTotalEstimado: paradasFinais.reduce((soma, p) => soma + (p.precoEstimado || 0), 0),
    perfilOriginal: perfilBusca,
    vazio: paradasFinais.length === 0,
  };
}

function capituloVazio(perfilBusca) {
  return {
    paradas: [],
    refeicoesAtendidas: [],
    refeicoesRestantes: perfilBusca.refeicoesDesejadas || [],
    horarioFinal: new Date(perfilBusca.horarioInicio),
    posicaoFinal: perfilBusca.localizacaoPartida,
    custoTotalEstimado: 0,
    perfilOriginal: perfilBusca,
    vazio: true,
  };
}

function calcularERevalidarAteEstabilizar(paradas, perfilBusca) {
  let atuais = paradas;

  for (let i = 0; i <= atuais.length; i++) {
    const comHorario = calcularHorariosReais(atuais, perfilBusca.horarioInicio);
    const validas = comHorario.filter((parada) =>
      estaAbertoNoHorario(parada, parada.horarioChegada, perfilBusca.data) &&
      respeitaJanelaDeRefeicao(parada, perfilBusca.refeicoesDesejadas)
    );

    if (validas.length === comHorario.length) {
      return validas;
    }

    atuais = validas;

    if (atuais.length === 0) {
      return [];
    }
  }

  return atuais;
}

function respeitaJanelaDeRefeicao(parada, refeicoesDesejadas) {
  if (parada.categoria !== "gastronomia") return true;

  if (parada.refeicaoReservadaPara) {
    return horarioDentroDaJanela(
      parada.horarioChegada,
      REFEICAO_JANELAS[parada.refeicaoReservadaPara].inicio,
      REFEICAO_JANELAS[parada.refeicaoReservadaPara].fim
    );
  }

  if (refeicoesDesejadas && refeicoesDesejadas.length > 0) {
    const refeicoesRelevantes = refeicoesDesejadas.filter((refeicao) => poiServeRefeicao(parada, refeicao));
    if (refeicoesRelevantes.length === 0) return true;
    return refeicoesRelevantes.some((refeicao) =>
      horarioDentroDaJanela(parada.horarioChegada, REFEICAO_JANELAS[refeicao].inicio, REFEICAO_JANELAS[refeicao].fim)
    );
  }

  return true;
}

function ordenarPorProximidadeGeografica(paradas, pontoPartida) {
  const restantes = [...paradas];
  const ordenadas = [];
  let posicaoAtual = pontoPartida;

  while (restantes.length > 0) {
    restantes.sort(
      (a, b) => calcularDistanciaKm(posicaoAtual, a.localizacao) - calcularDistanciaKm(posicaoAtual, b.localizacao)
    );
    const proxima = restantes.shift();
    const deslocamentoMinReal = estimarDeslocamentoMin(posicaoAtual, proxima.localizacao);

    ordenadas.push({ ...proxima, deslocamentoMin: deslocamentoMinReal });
    posicaoAtual = proxima.localizacao || posicaoAtual;
  }

  return ordenadas;
}

function calcularHorariosReais(paradas, horarioInicio) {
  let horarioCursor = new Date(horarioInicio);

  return paradas.map((parada) => {
    horarioCursor = adicionarMinutos(horarioCursor, parada.deslocamentoMin);
    const chegada = new Date(horarioCursor);
    horarioCursor = adicionarMinutos(horarioCursor, parada.duracaoMediaVisitaMin);
    const saida = new Date(horarioCursor);

    return { ...parada, horarioChegada: chegada, horarioSaida: saida };
  });
}

// ============================================================
// UTILITÁRIOS PUROS (sem Firebase, sem DOM, sem rede)
// ============================================================
function calcularDistanciaKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = grauParaRad(b.lat - a.lat);
  const dLon = grauParaRad(b.lng - a.lng);
  const lat1 = grauParaRad(a.lat);
  const lat2 = grauParaRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aHaversine = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(aHaversine), Math.sqrt(1 - aHaversine));

  return R * c;
}

function grauParaRad(graus) {
  return (graus * Math.PI) / 180;
}

function estimarDeslocamentoMin(origem, destino) {
  const km = calcularDistanciaKm(origem, destino);
  const VELOCIDADE_CAMINHADA_KMH = 4.5;
  return Math.round((km / VELOCIDADE_CAMINHADA_KMH) * 60);
}

function adicionarMinutos(data, minutos) {
  return new Date(data.getTime() + minutos * 60000);
}

function obterDiaSemana(data) {
  const dias = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  return dias[new Date(data).getDay()];
}

function horarioDentroDaJanela(horario, abre, fecha) {
  const h = new Date(horario);
  const minutosAtuais = h.getHours() * 60 + h.getMinutes();
  const [abreH, abreM] = abre.split(":").map(Number);
  const [fechaH, fechaM] = fecha.split(":").map(Number);
  const minutosAbre = abreH * 60 + abreM;
  const minutosFecha = fechaH * 60 + fechaM;
  return minutosAtuais >= minutosAbre && minutosAtuais <= minutosFecha;
}

function dataEstaNoIntervalo(data, inicio, fim) {
  const d = new Date(data).getTime();
  return d >= new Date(inicio).getTime() && d <= new Date(fim).getTime();
}

// ============================================================
// EXPORTAÇÃO
// ============================================================
export {
  gerarCapitulo,
  gerarCapituloDeFavoritos,
  obterCandidatosViaveis,
  aplicarDeslocamentosReais,
  recalcularRota,
  PESOS,
  MAX_PARADAS_POR_CAPITULO,
  estaAbertoNoHorario,
};
