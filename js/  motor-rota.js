/**
 * motor-rota.js
 * Linde Guia — Treze Tílias
 *
 * O CÉREBRO do app. Não toca DOM, não importa HTML, não fala com Firebase direto.
 * Recebe: lista de POIs (+ eventos) e um Perfil de Busca.
 * Devolve: uma Rota (lista ordenada de paradas com horários e custo estimado).
 *
 * Etapas (na ordem que são executadas):
 *   1. filtrarCandidatos()          -> remove o que é IMPOSSÍVEL (fechado, sem orçamento, sem tempo)
 *   2. garantirExperienciaGastronomica() -> reserva um slot pro restaurante de alta prioridade (admin)
 *   3. pontuarCandidatos()          -> dá nota pra cada POI restante
 *   4. montarSequencia()            -> escolhe a combinação + ordem que cabe no tempo e flui geograficamente
 *   5. recalcularRota()             -> usado durante o passeio, quando o usuário marca "Cheguei" ou "Pula essa"
 */

// ============================================================
// 1. PESOS DO MOTOR — ajustar aqui sem tocar na lógica abaixo
// ============================================================
const PESOS = {
  distancia: 0.35,    // cidade pequena: o que está mais perto pesa MUITO
  tempo: 0.25,         // encaixar bem no tempo restante do dia
  custo: 0.15,         // aderência ao orçamento escolhido
  avaliacao: 0.15,     // nota/qualidade do lugar
  interesse: 0.10,     // match com interesses marcados (se o usuário preencheu)
};

const FAIXA_ORCAMENTO = {
  economico: { max: 30 },     // R$ por pessoa, por parada
  moderado: { max: 80 },
  sem_limite: { max: Infinity },
};

const MARGEM_SEGURANCA_MIN = 10; // minutos de "colchão" entre paradas, pra não estourar horário por atraso

// Nível mínimo de prioridade gastronômica (definido no admin, escala 1-5)
// que GARANTE o lugar na rota — não é só um bônus de pontuação, é uma
// reserva de slot. Critério combinado nesta sessão: nível 4 ou 5 entra
// quase sempre, desde que já tenha passado pelo filtro duro (aberto,
// dentro do orçamento, cabe no tempo).
const NIVEL_MINIMO_GARANTIA_GASTRONOMICA = 4;

// ============================================================
// FUNÇÃO PRINCIPAL — chamada pela tela "Criar Roteiro"
// ============================================================
function gerarRota(pois, eventos, perfilBusca) {
  const candidatosIniciais = injetarEventosAtivos(pois, eventos, perfilBusca.data);

  const candidatosViaveis = filtrarCandidatos(candidatosIniciais, perfilBusca);

  if (candidatosViaveis.length === 0) {
    return rotaVazia(perfilBusca);
  }

  const experienciaGarantida = escolherExperienciaGastronomicaGarantida(candidatosViaveis);

  const candidatosPontuados = pontuarCandidatos(candidatosViaveis, perfilBusca);

  const rota = montarSequencia(candidatosPontuados, perfilBusca, experienciaGarantida);

  return rota;
}

// ============================================================
// FUNÇÃO DE RECÁLCULO — chamada pelo "modo Em Rota"
// ============================================================
function recalcularRota(rotaAtual, paradaAtualIndex, acao, horarioAtual, posicaoAtual) {
  // acao: "chegou" | "pular"
  const paradasRestantes = rotaAtual.paradas.slice(paradaAtualIndex + 1);

  if (acao === "pular") {
    paradasRestantes.shift(); // remove a próxima parada da lista
  }

  if (paradasRestantes.length === 0) {
    return { ...rotaAtual, paradas: rotaAtual.paradas.slice(0, paradaAtualIndex + 1), finalizada: true };
  }

  // Reaproveita os candidatos descartados na geração original (não refaz pontuação do zero)
  const candidatosDeReserva = rotaAtual.alternativasDescartadas || [];

  const perfilAtualizado = {
    ...rotaAtual.perfilOriginal,
    localizacaoPartida: posicaoAtual,
    horarioInicio: horarioAtual,
    tempoDisponivelMin: calcularTempoRestante(rotaAtual.perfilOriginal, horarioAtual),
  };

  const todosCandidatos = [...paradasRestantes, ...candidatosDeReserva];
  const candidatosViaveis = filtrarCandidatos(todosCandidatos, perfilAtualizado);
  const candidatosPontuados = pontuarCandidatos(candidatosViaveis, perfilAtualizado);
  const novaSequenciaRestante = montarSequencia(candidatosPontuados, perfilAtualizado);

  return {
    ...rotaAtual,
    paradas: [...rotaAtual.paradas.slice(0, paradaAtualIndex + 1), ...novaSequenciaRestante.paradas],
    custoTotalEstimado: rotaAtual.custoTotalEstimado, // recalculado de fato na renderização
    alternativasDescartadas: novaSequenciaRestante.alternativasDescartadas,
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
    avaliacao: 5, // eventos institucionais entram com nota alta por padrão
    tagsDeInteresse: evento.tagsDeInteresse || ["cultura"],
    statusOperacional: "ativo",
    pesoInstitucional: evento.pesoInstitucional ?? 1, // eventos puxam peso institucional máximo
  }));

  return [...pois, ...eventosComoPoi];
}

// ============================================================
// ETAPA 1 — FILTRO DURO
// ============================================================
// ============================================================
// ETAPA 2 — GARANTIA DE EXPERIÊNCIA GASTRONÔMICA (definida no admin)
// ============================================================
// Entre os candidatos JÁ VIÁVEIS (abertos, no orçamento, cabem no tempo),
// procura o restaurante/bar/café com maior nível de prioridade gastronômica
// (campo "prioridadeGastronomica", 1-5, definido no painel admin). Se houver
// um com nível >= NIVEL_MINIMO_GARANTIA_GASTRONOMICA, ele é RESERVADO —
// monstarSequencia() vai garantir um lugar pra ele antes de otimizar o resto.
function escolherExperienciaGastronomicaGarantida(candidatosViaveis) {
  const candidatosGastronomicos = candidatosViaveis.filter(
    (poi) => poi.categoria === "gastronomia" && (poi.prioridadeGastronomica || 0) >= NIVEL_MINIMO_GARANTIA_GASTRONOMICA
  );

  if (candidatosGastronomicos.length === 0) return null;

  // Em caso de múltiplos candidatos de alta prioridade, prioriza o nível
  // mais alto primeiro; em empate, não há critério de distância aqui
  // ainda (a função não recebe a posição do usuário) — fica para
  // montarSequencia, que já lida com ordenação geográfica do que sobrar.
  const ordenados = [...candidatosGastronomicos].sort(
    (a, b) => (b.prioridadeGastronomica || 0) - (a.prioridadeGastronomica || 0)
  );

  return ordenados[0];
}

function filtrarCandidatos(pois, perfilBusca) {
  return pois.filter((poi) => {
    if (poi.statusOperacional === "fechado_temporariamente") return false;

    if (!estaAbertoNoHorario(poi, perfilBusca.horarioInicio, perfilBusca.data)) return false;

    const limitePreco = FAIXA_ORCAMENTO[perfilBusca.orcamentoFaixa]?.max ?? Infinity;
    if (poi.precoEstimado > limitePreco) return false;

    const tempoNecessario =
      poi.duracaoMediaVisitaMin + estimarDeslocamentoMin(perfilBusca.localizacaoPartida, poi.localizacao);
    if (tempoNecessario > perfilBusca.tempoDisponivelMin) return false;

    return true;
  });
}

function estaAbertoNoHorario(poi, horarioInicio, dataReferencia) {
  if (!poi.horarioFuncionamento) return true; // sem dado de horário, assume aberto (POI 24h, ex: praça)

  const diaSemana = obterDiaSemana(dataReferencia);
  const janela = poi.horarioFuncionamento[diaSemana];

  if (!janela || janela.fechado) return false;

  return horarioDentroDaJanela(horarioInicio, janela.abre, janela.fecha);
}

// ============================================================
// ETAPA 2 — PONTUAÇÃO
// ============================================================
function pontuarCandidatos(pois, perfilBusca) {
  return pois.map((poi) => {
    const distanciaScore = normalizarProximidade(poi.localizacao, perfilBusca.localizacaoPartida);
    const tempoScore = normalizarEncaixeTempo(poi, perfilBusca.tempoDisponivelMin);
    const custoScore = normalizarAdequacaoOrcamento(poi.precoEstimado, perfilBusca.orcamentoFaixa);
    const avaliacaoScore = normalizarAvaliacao(poi.avaliacao);
    const interesseScore = normalizarMatchInteresse(poi.tagsDeInteresse, perfilBusca.interesses);

    const score =
      PESOS.distancia * distanciaScore +
      PESOS.tempo * tempoScore +
      PESOS.custo * custoScore +
      PESOS.avaliacao * avaliacaoScore +
      PESOS.interesse * interesseScore +
      (poi.pesoInstitucional || 0) * 0.05; // bônus pequeno, não domina o score

    return { ...poi, score };
  });
}

function normalizarProximidade(localizacaoPoi, localizacaoPartida) {
  if (!localizacaoPoi) return 0.5; // sem coordenada, nota neutra
  const distanciaKm = calcularDistanciaKm(localizacaoPartida, localizacaoPoi);
  const distanciaMaximaRelevanteKm = 5; // Treze Tílias é pequena, 5km já é "longe" no contexto local
  return Math.max(0, 1 - distanciaKm / distanciaMaximaRelevanteKm);
}

function normalizarEncaixeTempo(poi, tempoDisponivelMin) {
  const proporcaoUsada = poi.duracaoMediaVisitaMin / tempoDisponivelMin;
  // penaliza paradas que sozinhas consomem quase todo o tempo disponível
  return Math.max(0, 1 - proporcaoUsada);
}

function normalizarAdequacaoOrcamento(preco, faixa) {
  const limite = FAIXA_ORCAMENTO[faixa]?.max ?? Infinity;
  if (limite === Infinity) return 1;
  if (preco === 0) return 1; // grátis sempre pontua bem
  return Math.max(0, 1 - preco / limite);
}

function normalizarAvaliacao(avaliacao) {
  if (!avaliacao) return 0.5;
  return Math.min(1, avaliacao / 5);
}

function normalizarMatchInteresse(tagsPoi, interessesUsuario) {
  if (!interessesUsuario || interessesUsuario.length === 0) return 0.5; // sem preferência, neutro
  if (!tagsPoi || tagsPoi.length === 0) return 0;
  const intersecao = tagsPoi.filter((tag) => interessesUsuario.includes(tag));
  return intersecao.length / interessesUsuario.length;
}

// ============================================================
// ETAPA 3 — MONTAGEM DA SEQUÊNCIA (combinação + ordem)
// ============================================================
function montarSequencia(candidatosPontuados, perfilBusca, experienciaGarantida) {
  const selecionados = [];
  const descartados = [];
  let tempoUsadoMin = 0;
  let posicaoAtual = perfilBusca.localizacaoPartida;

  // Reserva o slot da experiência gastronômica garantida ANTES de rodar a
  // seleção normal por score — ela entra quase sempre, mesmo que um lugar
  // mais conveniente perdesse para ela numa disputa por pontuação.
  if (experienciaGarantida) {
    const deslocamentoGarantido = estimarDeslocamentoMin(posicaoAtual, experienciaGarantida.localizacao);
    const custoTempoGarantido = deslocamentoGarantido + experienciaGarantida.duracaoMediaVisitaMin + MARGEM_SEGURANCA_MIN;

    if (custoTempoGarantido <= perfilBusca.tempoDisponivelMin) {
      selecionados.push({ ...experienciaGarantida, deslocamentoMin: deslocamentoGarantido });
      tempoUsadoMin += custoTempoGarantido;
      posicaoAtual = experienciaGarantida.localizacao || posicaoAtual;
    }
    // Se nem reservando o slot sozinho ela couber no tempo total, é
    // simplesmente impossível — sem alarde, ela não entra e o resto da
    // rota segue normal (já passou pelo filtro duro, então isso só
    // aconteceria com tempo disponível muito curto).
  }

  const idsJaSelecionados = new Set(selecionados.map((p) => p.id));
  const ordenadosPorScore = [...candidatosPontuados]
    .filter((c) => !idsJaSelecionados.has(c.id))
    .sort((a, b) => b.score - a.score);

  for (const candidato of ordenadosPorScore) {
    const deslocamentoMin = estimarDeslocamentoMin(posicaoAtual, candidato.localizacao);
    const custoTempoTotal = deslocamentoMin + candidato.duracaoMediaVisitaMin + MARGEM_SEGURANCA_MIN;

    if (tempoUsadoMin + custoTempoTotal <= perfilBusca.tempoDisponivelMin) {
      selecionados.push({ ...candidato, deslocamentoMin });
      tempoUsadoMin += custoTempoTotal;
      posicaoAtual = candidato.localizacao || posicaoAtual;
    } else {
      descartados.push(candidato);
    }
  }

  const sequenciaOtimizada = ordenarPorProximidadeGeografica(selecionados, perfilBusca.localizacaoPartida);

  const paradasFinais = calcularERevalidarAteEstabilizar(sequenciaOtimizada, perfilBusca);

  return {
    paradas: paradasFinais,
    tempoTotalEstimadoMin: tempoUsadoMin,
    custoTotalEstimado: paradasFinais.reduce((soma, p) => soma + (p.precoEstimado || 0), 0),
    alternativasDescartadas: descartados,
    perfilOriginal: perfilBusca,
  };
}

// Calcula horários reais e remove paradas que ficariam fechadas no horário
// calculado. Como remover uma parada do meio muda o horário de TODAS as
// que vêm depois dela, repete o ciclo (calcular -> filtrar) até nada mais
// precisar ser removido. Isso evita o "buraco" de horário que aparecia
// quando uma parada cortada no meio deixava o cursor de tempo desalinhado
// para as paradas seguintes.
function calcularERevalidarAteEstabilizar(paradas, perfilBusca) {
  let atuais = paradas;

  // Limite de segurança: nunca mais iterações do que paradas existem,
  // já que cada iteração remove pelo menos uma parada ou estabiliza.
  for (let i = 0; i <= atuais.length; i++) {
    const comHorario = calcularHorariosReais(atuais, perfilBusca.horarioInicio);
    const validas = comHorario.filter((parada) =>
      estaAbertoNoHorario(parada, parada.horarioChegada, perfilBusca.data)
    );

    if (validas.length === comHorario.length) {
      return validas; // nada foi removido nesta rodada, já estabilizou
    }

    atuais = validas;

    if (atuais.length === 0) {
      return [];
    }
  }

  return atuais;
}

function ordenarPorProximidadeGeografica(paradas, pontoPartida) {
  // Algoritmo simples do "vizinho mais próximo" — suficiente pra cidade pequena com poucas paradas por rota
  const restantes = [...paradas];
  const ordenadas = [];
  let posicaoAtual = pontoPartida;

  while (restantes.length > 0) {
    restantes.sort(
      (a, b) =>
        calcularDistanciaKm(posicaoAtual, a.localizacao) - calcularDistanciaKm(posicaoAtual, b.localizacao)
    );
    const proxima = restantes.shift();

    // CORREÇÃO: o deslocamentoMin calculado em montarSequencia() reflete a
    // ordem por SCORE, não a ordem geográfica final. Sem recalcular aqui,
    // o horário da parada herda a distância de uma posição anterior errada,
    // criando saltos artificiais de horas entre paradas vizinhas no mapa.
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

// Recheck final: evita o caso "a 3ª parada fecha antes da rota chegar lá"
// (substituída por calcularERevalidarAteEstabilizar, que recalcula o
// cursor de horário a cada remoção em vez de só filtrar no final)

// ============================================================
// ROTA VAZIA (nenhum candidato viável)
// ============================================================
function rotaVazia(perfilBusca) {
  return {
    paradas: [],
    tempoTotalEstimadoMin: 0,
    custoTotalEstimado: 0,
    alternativasDescartadas: [],
    perfilOriginal: perfilBusca,
    vazia: true,
  };
}

// ============================================================
// UTILITÁRIOS PUROS (sem Firebase, sem DOM)
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
  const VELOCIDADE_CAMINHADA_KMH = 4.5; // Treze Tílias: roteiro pensado a pé no centro histórico
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

function calcularTempoRestante(perfilOriginal, horarioAtual) {
  const fimPrevisto = adicionarMinutos(new Date(perfilOriginal.horarioInicio), perfilOriginal.tempoDisponivelMin);
  const diffMs = fimPrevisto.getTime() - new Date(horarioAtual).getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

// ============================================================
// EXPORTAÇÃO
// ============================================================
export {
  gerarRota,
  recalcularRota,
  PESOS,
  FAIXA_ORCAMENTO,
};
