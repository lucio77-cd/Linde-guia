/**
 * motor-rota.js
 * Linde Guia — Treze Tílias
 *
 * O CÉREBRO do app. Não toca DOM, não importa HTML, não fala com Firebase direto.
 * Recebe: lista de POIs (+ eventos) e um Perfil de Busca.
 * Devolve: um CAPÍTULO da rota (não o "dia inteiro") — ver nota de arquitetura abaixo.
 *
 * ============================================================
 * POR QUE "CAPÍTULO" E NÃO MAIS "TEMPO DISPONÍVEL / ORÇAMENTO / GRUPO"
 * ============================================================
 * Versão anterior deste motor recebia duração total (ex: "meio dia" = 240min),
 * orçamento e horário de término, e tentava montar o DIA INTEIRO de uma vez.
 * Isso quebrava sempre que a combinação de campos era fisicamente impossível
 * (ex: pedir "janta" numa janela de 4h que termina às 13h) — o motor tentava
 * reservar slot pra algo inviável, gastava esforço nisso, e o resultado final
 * podia ficar vazio ou incoerente.
 *
 * A decisão (registrada em conversa com o cliente) foi trocar pelo modelo que
 * apps de navegação e itinerário de referência usam: nunca promete o dia
 * inteiro de uma vez. Gera um CAPÍTULO — um grupo curto e coerente de
 * paradas — e pergunta se a pessoa quer continuar. Cada capítulo:
 *   - fecha quando bate a próxima refeição desejada (fronteira natural), OU
 *   - fecha ao atingir MAX_PARADAS_POR_CAPITULO, OU
 *   - fecha por falta de candidato viável.
 * Isso elimina a classe inteira de bug de "não achei nada" por conflito de
 * horário, porque nunca tenta prometer mais do que cabe fisicamente.
 *
 * Etapas (na ordem que são executadas):
 *   1. filtrarCandidatos()          -> remove o que é IMPOSSÍVEL (fechado, já visitado, refeição não bate)
 *   2. garantias de refeição/interesse -> reserva slots pros itens mais importantes deste capítulo
 *   3. pontuarCandidatos()          -> dá nota pra cada POI restante (distância, avaliação, interesse)
 *   4. montarCapitulo()             -> escolhe a combinação + ordem, fecha o capítulo na fronteira certa
 *   5. recalcularRota()             -> usado durante o passeio, quando o usuário marca "Cheguei" ou "Pula essa"
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

// Tamanho máximo de um capítulo quando não há refeição marcando a fronteira
// natural. Não é um número arbitrário: é o range que estudos de memória de
// curto prazo (regra de Miller, 7±2, com trabalhos mais recentes apontando
// 3-5 como o ponto ideal pra sensação de "grupo completo") apontam como o
// tamanho que uma pessoa processa como um bloco fechado sem se perder.
const MAX_PARADAS_POR_CAPITULO = 4;

// Nível mínimo de prioridade gastronômica (definido no admin, escala 1-5)
// que GARANTE o lugar no capítulo — não é só um bônus de pontuação, é uma
// reserva de slot.
const NIVEL_MINIMO_GARANTIA_GASTRONOMICA = 4;

// Janelas de horário aproximadas de cada refeição — usadas tanto pra achar
// qual é a "próxima fronteira" quanto pra casar o horário real de chegada
// com a refeição que a parada deveria satisfazer.
const REFEICAO_JANELAS = {
  cafeDaManha: { inicio: "06:00", fim: "10:30" },
  almoco:      { inicio: "11:00", fim: "14:30" },
  tarde:       { inicio: "14:30", fim: "18:00" },
  janta:       { inicio: "18:00", fim: "22:30" },
};

// ============================================================
// FUNÇÃO PRINCIPAL — chamada pela tela "Criar Roteiro" e também pra gerar
// cada capítulo seguinte (a tela "Minha Rota" chama de novo com uma nova
// posição/horário/lista de refeições restantes — ver comentário no topo).
// ============================================================
// perfilBusca esperado:
//   localizacaoPartida: { lat, lng }
//   horarioInicio: ISO datetime (agora, ou o horário agendado pelo turista)
//   data: ISO date (pra checar dia da semana e eventos ativos)
//   refeicoesDesejadas: array de refeições AINDA NÃO atendidas (o chamador
//     é responsável por tirar da lista o que já foi satisfeito em capítulos
//     anteriores)
//   interesses: array de tags de interesse marcadas (não muda entre capítulos)
//   idsExcluidos: array de ids de POI que NÃO podem entrar — já visitados
//     nesta rota (capítulos anteriores) ou já visitados historicamente no
//     aparelho (ver core/selos-local.js)
function gerarCapitulo(pois, eventos, perfilBusca) {
  const candidatosIniciais = injetarEventosAtivos(pois, eventos, perfilBusca.data);
  const idsExcluidos = new Set(perfilBusca.idsExcluidos || []);
  const candidatosDisponiveis = candidatosIniciais.filter((poi) => !idsExcluidos.has(poi.id));

  const candidatosViaveis = filtrarCandidatos(candidatosDisponiveis, perfilBusca);

  if (candidatosViaveis.length === 0) {
    return capituloVazio(perfilBusca);
  }

  const refeicaoFronteira = proximaRefeicaoFronteira(perfilBusca.refeicoesDesejadas);

  const idsReservados = new Set();
  const experienciasGastronomicas = escolherExperienciasGastronomicasGarantidas(
    candidatosViaveis,
    refeicaoFronteira ? [refeicaoFronteira] : [],
    idsReservados
  );
  const experienciasDeInteresse = escolherExperienciasDeInteresseGarantidas(
    candidatosViaveis,
    perfilBusca.interesses,
    idsReservados
  );
  const experienciasGarantidas = [...experienciasGastronomicas, ...experienciasDeInteresse];

  const candidatosPontuados = pontuarCandidatos(candidatosViaveis, perfilBusca);

  return montarCapitulo(candidatosPontuados, perfilBusca, experienciasGarantidas, refeicaoFronteira);
}

// Entre as refeições ainda não atendidas, qual é a próxima cronologicamente
// (pela janela de horário)? É essa que vai fechar o capítulo atual quando
// for satisfeita. null se não sobrou nenhuma refeição desejada.
function proximaRefeicaoFronteira(refeicoesDesejadas) {
  if (!refeicoesDesejadas || refeicoesDesejadas.length === 0) return null;
  return [...refeicoesDesejadas].sort(
    (a, b) => REFEICAO_JANELAS[a].inicio.localeCompare(REFEICAO_JANELAS[b].inicio)
  )[0];
}

// ============================================================
// FUNÇÃO DE RECÁLCULO — chamada pelo "modo Em Rota" (Cheguei / Pular)
// ============================================================
// Diferente da versão que tentava um dia inteiro, capítulos são curtos
// (no máximo 4 paradas) — então recalcular não precisa reotimizar do zero
// nem trazer candidatos de reserva. Só reordena geograficamente a partir
// da posição atual e revalida horário de funcionamento.
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
// Sem orçamento e sem "tempo disponível" nesta versão — o único corte duro
// agora é: está aberto? bate com a refeição pedida (se pedida)? Já foi
// excluído por já ter sido visitado? (exclusão acontece antes de chamar
// esta função, ver gerarCapitulo)
function filtrarCandidatos(pois, perfilBusca) {
  return pois.filter((poi) => {
    if (poi.statusOperacional === "fechado_temporariamente") return false;
    if (!estaAbertoNoHorario(poi, perfilBusca.horarioInicio, perfilBusca.data)) return false;
    if (!candidatoCombinaComRefeicoesDesejadas(poi, perfilBusca.refeicoesDesejadas)) return false;
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
// ETAPA 2 — GARANTIA DE EXPERIÊNCIA GASTRONÔMICA (definida no admin)
// ============================================================
// Só tenta garantir a refeição-FRONTEIRA deste capítulo (a próxima
// cronologicamente), nunca todas as refeições restantes de uma vez — é
// isso que evita o motor tentar (inutilmente) encaixar janta num capítulo
// que só tem tempo físico pra ir até o almoço.
function escolherExperienciasGastronomicasGarantidas(candidatosViaveis, refeicoesFronteira, idsReservados) {
  if (!refeicoesFronteira || refeicoesFronteira.length === 0) return [];

  const garantidas = [];

  for (const refeicao of refeicoesFronteira) {
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
// ETAPA 2b — GARANTIA DE EXPERIÊNCIA POR INTERESSE (história, natureza...)
// ============================================================
// Reserva 1 slot por interesse marcado, entre os candidatos deste capítulo.
// Critério de escolha: melhor avaliação (nota) — não existe campo de
// "prioridade" pra história/natureza/etc como existe pra gastronomia.
function escolherExperienciasDeInteresseGarantidas(candidatosViaveis, interesses, idsReservados) {
  if (!interesses || interesses.length === 0) return [];

  const garantidas = [];

  for (const interesse of interesses) {
    const candidatosDoInteresse = candidatosViaveis.filter(
      (poi) => !idsReservados.has(poi.id) && (poi.tagsDeInteresse || []).includes(interesse)
    );

    if (candidatosDoInteresse.length === 0) continue;

    const melhor = [...candidatosDoInteresse].sort(
      (a, b) => (b.avaliacao || 0) - (a.avaliacao || 0)
    )[0];

    garantidas.push({ ...melhor, interesseReservadoPara: interesse });
    idsReservados.add(melhor.id);
  }

  return garantidas;
}

// Sem dado de refeições cadastrado no admin (local antigo, ainda não
// preenchido), assume que serve qualquer refeição — não pune cadastro
// incompleto escondendo o local da rota.
function poiServeRefeicao(poi, refeicao) {
  if (!poi.refeicoesServidas || poi.refeicoesServidas.length === 0) return true;
  return poi.refeicoesServidas.includes(refeicao);
}

function candidatoCombinaComRefeicoesDesejadas(poi, refeicoesDesejadas) {
  if (poi.categoria !== "gastronomia") return true; // filtro de refeição só vale pra gastronomia
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
// ETAPA 4 — MONTAGEM DO CAPÍTULO
// ============================================================
// Fecha o capítulo em uma das 3 condições, o que vier primeiro:
//   a) acabou de incluir a parada que satisfaz a refeição-fronteira
//   b) atingiu MAX_PARADAS_POR_CAPITULO
//   c) não sobrou candidato viável
function montarCapitulo(candidatosPontuados, perfilBusca, experienciasGarantidas, refeicaoFronteira) {
  const selecionados = [];
  let posicaoAtual = perfilBusca.localizacaoPartida;
  let fechouPelaFronteira = false;

  // Reservas (refeição-fronteira + interesses) entram primeiro, sempre —
  // mesmo que um lugar mais conveniente perdesse pra elas numa disputa por
  // pontuação. Ainda respeitam o teto de paradas do capítulo.
  for (const experiencia of experienciasGarantidas || []) {
    if (selecionados.length >= MAX_PARADAS_POR_CAPITULO) break;

    const deslocamento = estimarDeslocamentoMin(posicaoAtual, experiencia.localizacao);
    selecionados.push({ ...experiencia, deslocamentoMin: deslocamento });
    posicaoAtual = experiencia.localizacao || posicaoAtual;

    if (refeicaoFronteira && experiencia.refeicaoReservadaPara === refeicaoFronteira) {
      fechouPelaFronteira = true;
    }
  }

  const idsJaSelecionados = new Set(selecionados.map((p) => p.id));
  const ordenadosPorScore = [...candidatosPontuados]
    .filter((c) => !idsJaSelecionados.has(c.id))
    .sort((a, b) => b.score - a.score);

  for (const candidato of ordenadosPorScore) {
    if (fechouPelaFronteira) break;
    if (selecionados.length >= MAX_PARADAS_POR_CAPITULO) break;

    const deslocamento = estimarDeslocamentoMin(posicaoAtual, candidato.localizacao);
    selecionados.push({ ...candidato, deslocamentoMin: deslocamento });
    posicaoAtual = candidato.localizacao || posicaoAtual;

    if (refeicaoFronteira && candidato.categoria === "gastronomia" && poiServeRefeicao(candidato, refeicaoFronteira)) {
      fechouPelaFronteira = true;
    }
  }

  const sequenciaOtimizada = ordenarPorProximidadeGeografica(selecionados, perfilBusca.localizacaoPartida);
  const paradasFinais = calcularERevalidarAteEstabilizar(sequenciaOtimizada, perfilBusca);

  return montarResultadoCapitulo(paradasFinais, perfilBusca);
}

// Monta o objeto de retorno do capítulo: paradas + o que precisa pro
// PRÓXIMO capítulo (refeições ainda restantes, de onde e que horas
// continuar) — ver comentário de arquitetura no topo do arquivo.
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

  const refeicoesRestantes = (perfilBusca.refeicoesDesejadas || []).filter(
    (r) => !refeicoesAtendidas.has(r)
  );

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

// ============================================================
// Calcula horários reais e remove paradas inválidas (fechada no horário
// real de chegada, ou fora da janela da refeição que deveria satisfazer).
// Como remover uma parada do meio muda o horário de TODAS as que vêm
// depois dela, repete o ciclo (calcular -> filtrar) até nada mais precisar
// ser removido.
// ============================================================
function calcularERevalidarAteEstabilizar(paradas, perfilBusca) {
  let atuais = paradas;

  for (let i = 0; i <= atuais.length; i++) {
    const comHorario = calcularHorariosReais(atuais, perfilBusca.horarioInicio);
    const validas = comHorario.filter((parada) =>
      estaAbertoNoHorario(parada, parada.horarioChegada, perfilBusca.data) &&
      respeitaJanelaDeRefeicao(parada, perfilBusca.refeicoesDesejadas)
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

// Confere se o HORÁRIO REAL de chegada da parada bate com a janela de tempo
// da refeição que ela deveria satisfazer. Sem essa checagem, um restaurante
// marcado como "reservado pro almoço" podia acabar virando a primeira
// parada do capítulo de manhã cedo — serve almoço, mas ninguém almoça às 9h.
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
  // Algoritmo simples do "vizinho mais próximo" — suficiente pra cidade pequena com poucas paradas por capítulo
  const restantes = [...paradas];
  const ordenadas = [];
  let posicaoAtual = pontoPartida;

  while (restantes.length > 0) {
    restantes.sort(
      (a, b) =>
        calcularDistanciaKm(posicaoAtual, a.localizacao) - calcularDistanciaKm(posicaoAtual, b.localizacao)
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

// ============================================================
// EXPORTAÇÃO
// ============================================================
export {
  gerarCapitulo,
  recalcularRota,
  PESOS,
  MAX_PARADAS_POR_CAPITULO,
  estaAbertoNoHorario,
};
