/**
 * motor-rota.js
 * Linde Guia — Treze Tílias
 *
 * O CÉREBRO do app. Não toca DOM, não importa HTML, não fala com Firebase direto.
 * Recebe: lista de POIs (+ eventos) e um Perfil de Busca.
 * Devolve: uma Rota (lista ordenada de paradas com horários e custo estimado).
 *
 * Etapas (na ordem que são executadas):
 *   1. filtrarCandidatos()      -> remove o que é IMPOSSÍVEL (fechado, sem orçamento, sem tempo)
 *   2. pontuarCandidatos()      -> dá nota pra cada POI restante
 *   3. montarSequencia()        -> escolhe a combinação + ordem por inserção mais barata,
 *                                   mantendo a rota sempre geograficamente coerente
 *   4. recalcularRota()         -> usado durante o passeio, quando o usuário marca "Cheguei" ou "Pula essa"
 */

// ============================================================
// 1. PESOS DO MOTOR — ajustar aqui sem tocar na lógica abaixo
// ============================================================
const PESOS = {
  distancia: 0.35,
  tempo: 0.25,
  custo: 0.15,
  avaliacao: 0.15,
  interesse: 0.10,
};

const FAIXA_ORCAMENTO = {
  economico: { max: 30 },
  moderado: { max: 80 },
  sem_limite: { max: Infinity },
};

const MARGEM_SEGURANCA_MIN = 10;

function gerarRota(pois, eventos, perfilBusca) {
  const candidatosIniciais = injetarEventosAtivos(pois, eventos, perfilBusca.data);
  const candidatosViaveis = filtrarCandidatos(candidatosIniciais, perfilBusca);
  if (candidatosViaveis.length === 0) {
    return rotaVazia(perfilBusca);
  }
  const candidatosPontuados = pontuarCandidatos(candidatosViaveis, perfilBusca);
  const rota = montarSequencia(candidatosPontuados, perfilBusca);
  return rota;
}

function recalcularRota(rotaAtual, paradaAtualIndex, acao, horarioAtual, posicaoAtual) {
  const paradasRestantes = rotaAtual.paradas.slice(paradaAtualIndex + 1);

  if (acao === "pular") {
    paradasRestantes.shift();
  }

  if (paradasRestantes.length === 0) {
    return { ...rotaAtual, paradas: rotaAtual.paradas.slice(0, paradaAtualIndex + 1), finalizada: true };
  }

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

  const paradasCompletas = [...rotaAtual.paradas.slice(0, paradaAtualIndex + 1), ...novaSequenciaRestante.paradas];

  // tempoTotalEstimadoMin precisava ser recalculado aqui — antes ele
  // vinha do spread "...rotaAtual" e ficava com o valor da rota
  // ORIGINAL (antes do recálculo), nunca refletindo o tempo real após
  // "Cheguei"/"Pular essa parada". Usa horarioInicio da rota original
  // (não o horarioAtual do recálculo) porque o resumo da rota sempre
  // se refere ao início do passeio como um todo, não ao momento do
  // recálculo.
  const tempoTotalRealMin = calcularTempoTotalReal(paradasCompletas, rotaAtual.perfilOriginal.horarioInicio);

  return {
    ...rotaAtual,
    paradas: paradasCompletas,
    tempoTotalEstimadoMin: tempoTotalRealMin,
    custoTotalEstimado: rotaAtual.custoTotalEstimado,
    alternativasDescartadas: novaSequenciaRestante.alternativasDescartadas,
  };
}

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
  if (!poi.horarioFuncionamento) return true;
  const diaSemana = obterDiaSemana(dataReferencia);
  const janela = poi.horarioFuncionamento[diaSemana];
  if (!janela || janela.fechado) return false;
  return horarioDentroDaJanela(horarioInicio, janela.abre, janela.fecha);
}

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

function normalizarEncaixeTempo(poi, tempoDisponivelMin) {
  const proporcaoUsada = poi.duracaoMediaVisitaMin / tempoDisponivelMin;
  return Math.max(0, 1 - proporcaoUsada);
}

function normalizarAdequacaoOrcamento(preco, faixa) {
  const limite = FAIXA_ORCAMENTO[faixa]?.max ?? Infinity;
  if (limite === Infinity) return 1;
  if (preco === 0) return 1;
  return Math.max(0, 1 - preco / limite);
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

// MONTAGEM POR INSERÇÃO MAIS BARATA
//
// ANTES: este algoritmo era "greedy por score" — decidia se cada POI cabia
// no tempo somando os deslocamentos NA ORDEM DE SCORE (melhor avaliado
// primeiro), e só depois reordenava geograficamente o que tinha sido
// aceito. Isso fazia a decisão de inclusão/exclusão usar uma rota
// hipotética que nunca era a entregue: dois POIs de score quase igual
// mas em direções opostas podiam ser aceitos na ordem score-A, score-B,
// gerando um deslocamento total bem maior do que a melhor ordem
// geográfica real — e por causa disso um terceiro POI que caberia
// tranquilamente na rota geográfica ótima era descartado por "falta de
// tempo" que na verdade não existia.
//
// AGORA: a rota parcial é mantida sempre na sua melhor ordem geográfica
// (vizinho mais próximo), e cada candidato (ainda priorizado por score)
// é testado pela INSERÇÃO MAIS BARATA dentro dessa rota parcial — ou
// seja, a posição que adiciona o menor deslocamento extra. A decisão de
// "cabe ou não cabe" passa a usar o custo real de inserir na rota
// geográfica, não o custo de uma sequência por score que seria
// descartada depois.
function montarSequencia(candidatosPontuados, perfilBusca) {
  const ordenadosPorScore = [...candidatosPontuados].sort((a, b) => b.score - a.score);

  const selecionados = []; // mantida sempre na ordem geográfica de visita
  const descartados = [];
  let tempoUsadoMin = 0;

  for (const candidato of ordenadosPorScore) {
    const melhorInsercao = encontrarMelhorInsercao(selecionados, candidato, perfilBusca.localizacaoPartida);
    const custoExtraMin = melhorInsercao.custoExtraMin;

    if (tempoUsadoMin + custoExtraMin <= perfilBusca.tempoDisponivelMin) {
      selecionados.splice(melhorInsercao.posicao, 0, candidato);
      tempoUsadoMin += custoExtraMin;
    } else {
      descartados.push(candidato);
    }
  }

  const sequenciaComDeslocamentos = recalcularDeslocamentos(selecionados, perfilBusca.localizacaoPartida);
  const paradasFinais = calcularERevalidarAteEstabilizar(sequenciaComDeslocamentos, perfilBusca);

  // tempoTotalEstimadoMin precisa refletir as PARADAS FINAIS, não o
  // tempoUsadoMin acumulado antes da revalidação — se
  // calcularERevalidarAteEstabilizar remover alguma parada por ela
  // estar fechada no horário calculado, tempoUsadoMin ficaria
  // desatualizado e voltaria a divergir da soma dos horários reais
  // exibidos (o mesmo problema de consistência corrigido antes, agora
  // pela porta dos fundos da revalidação por horário de funcionamento).
  const tempoTotalRealMin = calcularTempoTotalReal(paradasFinais, perfilBusca.horarioInicio);

  return {
    paradas: paradasFinais,
    tempoTotalEstimadoMin: tempoTotalRealMin,
    custoTotalEstimado: paradasFinais.reduce((soma, p) => soma + (p.precoEstimado || 0), 0),
    alternativasDescartadas: descartados,
    perfilOriginal: perfilBusca,
  };
}

// Testa inserir "candidato" em cada posição possível da rota parcial
// (que já está em ordem geográfica) e devolve a posição de menor custo
// extra de tempo (deslocamento adicional + duração da visita + margem,
// quando aplicável). Inserir no meio de duas paradas existentes
// substitui o trecho "anterior -> próxima" por
// "anterior -> candidato -> próxima", então o custo extra é o que esse
// desvio acrescenta, não o trecho inteiro.
//
// IMPORTANTE: a contagem de margem aqui precisa espelhar exatamente a
// regra usada em calcularHorariosReais (margem só existe ENTRE paradas,
// nunca antes da primeira chegada) — senão tempoTotalEstimadoMin volta a
// divergir da soma dos horários reais exibidos.
function encontrarMelhorInsercao(rotaParcial, candidato, pontoPartida) {
  const duracaoCandidato = candidato.duracaoMediaVisitaMin;

  if (rotaParcial.length === 0) {
    // Primeira parada da rota: sem margem antes dela, igual no horário real.
    const deslocamentoMin = estimarDeslocamentoMin(pontoPartida, candidato.localizacao);
    return { posicao: 0, custoExtraMin: deslocamentoMin + duracaoCandidato };
  }

  let melhorPosicao = 0;
  let melhorCustoExtra = Infinity;

  for (let posicao = 0; posicao <= rotaParcial.length; posicao++) {
    const ehInicio = posicao === 0;
    const anterior = ehInicio ? pontoPartida : rotaParcial[posicao - 1].localizacao;
    const proxima = posicao === rotaParcial.length ? null : rotaParcial[posicao].localizacao;

    const deslocamentoAteCandidato = estimarDeslocamentoMin(anterior, candidato.localizacao);
    // Margem antes do candidato: só existe se ele não for a primeira parada da rota.
    const margemAntesCandidato = ehInicio ? 0 : MARGEM_SEGURANCA_MIN;

    let custoExtra;
    if (proxima === null) {
      // Inserção no final da rota: só soma o trecho novo, nada é substituído.
      custoExtra = margemAntesCandidato + deslocamentoAteCandidato + duracaoCandidato;
    } else {
      // Inserção no meio: troca "anterior -> proxima" (com 1 margem entre
      // elas, exceto se "anterior" for o ponto de partida) por
      // "anterior -> candidato -> proxima" (com até 2 margens: antes do
      // candidato e depois dele). O custo extra é a diferença.
      const margemOriginalEntrePontos = ehInicio ? 0 : MARGEM_SEGURANCA_MIN;
      const deslocamentoOriginal = estimarDeslocamentoMin(anterior, proxima);
      const deslocamentoCandidatoProxima = estimarDeslocamentoMin(candidato.localizacao, proxima);

      custoExtra =
        margemAntesCandidato +
        deslocamentoAteCandidato +
        duracaoCandidato +
        MARGEM_SEGURANCA_MIN + // margem entre o candidato e a próxima parada
        deslocamentoCandidatoProxima -
        margemOriginalEntrePontos -
        deslocamentoOriginal;
    }

    if (custoExtra < melhorCustoExtra) {
      melhorCustoExtra = custoExtra;
      melhorPosicao = posicao;
    }
  }

  return { posicao: melhorPosicao, custoExtraMin: melhorCustoExtra };
}

// Recalcula o deslocamentoMin de cada parada a partir da ordem final —
// necessário porque encontrarMelhorInsercao só avalia custo marginal,
// sem gravar o deslocamento real de cada parada na sequência definitiva.
function recalcularDeslocamentos(paradas, pontoPartida) {
  let posicaoAtual = pontoPartida;
  return paradas.map((parada) => {
    const deslocamentoMin = estimarDeslocamentoMin(posicaoAtual, parada.localizacao);
    posicaoAtual = parada.localizacao || posicaoAtual;
    return { ...parada, deslocamentoMin };
  });
}

// Calcula horários reais e remove paradas que ficariam fechadas no
// horário calculado. Como remover uma parada do meio muda QUEM é o
// "anterior geográfico" de cada parada seguinte (e portanto o
// deslocamentoMin dela), o ciclo recalcula deslocamentos -> horários ->
// filtra a cada rodada, até nada mais precisar ser removido.
//
// BUG CORRIGIDO: antes, só os horários eram recalculados a cada rodada,
// mas o deslocamentoMin de cada parada continuava sendo o original (a
// distância da parada que foi removida, não da nova parada anterior na
// sequência). Isso fazia o horário de chegada da parada seguinte a uma
// remoção ficar calculado com a distância errada — por exemplo, se B
// fosse removida de A→B→C, o C calculava seu deslocamento como se ainda
// viesse de B, quando na verdade agora vem direto de A.
function calcularERevalidarAteEstabilizar(paradas, perfilBusca) {
  let atuais = paradas;

  // Limite de segurança: nunca mais iterações do que paradas existem,
  // já que cada iteração remove pelo menos uma parada ou estabiliza.
  for (let i = 0; i <= atuais.length; i++) {
    const comDeslocamentosAtualizados = recalcularDeslocamentos(atuais, perfilBusca.localizacaoPartida);
    const comHorario = calcularHorariosReais(comDeslocamentosAtualizados, perfilBusca.horarioInicio);
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

function calcularHorariosReais(paradas, horarioInicio) {
  let horarioCursor = new Date(horarioInicio);

  return paradas.map((parada, indice) => {
    // A margem de segurança entra como colchão ENTRE paradas (depois da
    // primeira), não antes da primeira chegada — não faz sentido ter
    // buffer antes mesmo de a pessoa ter saído do ponto de partida.
    // Sem isso, tempoTotalEstimadoMin (que inclui a margem na decisão de
    // quem cabe na rota) ficava maior do que a soma dos horários de
    // chegada/saída exibidos por parada, uma inconsistência visível pro
    // usuário se ele somasse os horários da lista manualmente.
    if (indice > 0) {
      horarioCursor = adicionarMinutos(horarioCursor, MARGEM_SEGURANCA_MIN);
    }

    horarioCursor = adicionarMinutos(horarioCursor, parada.deslocamentoMin);
    const chegada = new Date(horarioCursor);
    horarioCursor = adicionarMinutos(horarioCursor, parada.duracaoMediaVisitaMin);
    const saida = new Date(horarioCursor);

    return { ...parada, horarioChegada: chegada, horarioSaida: saida };
  });
}

// Deriva o tempo total da rota a partir do horarioSaida da ÚLTIMA
// parada, comparado ao horarioInicio — em vez de somar
// deslocamento+duração+margem manualmente outra vez. Usar a mesma fonte
// (os timestamps já calculados por calcularHorariosReais) garante que
// tempoTotalEstimadoMin nunca pode divergir do que a tela mostra,
// mesmo que paradas sejam removidas depois por estarem fechadas.
function calcularTempoTotalReal(paradas, horarioInicio) {
  if (paradas.length === 0) return 0;
  const ultimaSaida = paradas[paradas.length - 1].horarioSaida;
  const diffMs = new Date(ultimaSaida).getTime() - new Date(horarioInicio).getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

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
