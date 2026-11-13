/**
 * admin-estatisticas.js — js/admin/admin-estatisticas.js
 * Linde Guia — Treze Tílias
 *
 * Tela do Dashboard (pensada para celular). Aqui fica só a leitura do
 * Firestore e o desenho; os cálculos estão em admin-analise.js.
 *
 *  - Carrega só o período escolhido (+ o período anterior, pra comparar),
 *    em vez de baixar as coleções inteiras a cada abertura.
 *  - Se alguma coleção falhar, mostra aviso em vez de exibir zeros como
 *    se fossem dado verdadeiro.
 *  - Gráficos são CSS puro (sem Chart.js): mais leve no celular.
 *  - "Compartilhar resumo" e "Relatório com IA" usam só números agregados.
 */
import { db, auth } from "../core/firebase-config.js";
import { escaparHtml } from "../core/html-utils.js";
import { buscarTodosPois } from "../data/pois-data.js";
import {
  collection, getDocs, query, where, documentId, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  analisar, intervaloDoPeriodo, agruparSerie, montarTextoResumo, montarResumoParaIA,
  DIAS_SEMANA,
} from "./admin-analise.js";

const CHAVE_PERIODO = "linde-guia:admin-periodo";
const PERIODOS = [
  { valor: 7, rotulo: "7 dias" },
  { valor: 30, rotulo: "30 dias" },
  { valor: 90, rotulo: "90 dias" },
  { valor: "tudo", rotulo: "Tudo" },
];

let periodoAtual = 30;
let analiseAtual = null;
let ultimoResumoParaIA = null;
// cache.desde: primeiro dia carregado (null = tudo). Evita reler ao trocar
// para um período menor.
const cache = { desde: undefined, dados: null };
let carregando = false;

function iniciarEstatisticas() {
  try {
    const salvo = localStorage.getItem(CHAVE_PERIODO);
    if (salvo === "tudo" || ["7", "30", "90"].includes(salvo)) {
      periodoAtual = salvo === "tudo" ? "tudo" : Number(salvo);
    }
  } catch { /* sem storage: usa o padrão */ }

  document.addEventListener("linde-guia:admin-autenticado", () => atualizar());

  document.getElementById("periodo-chips")?.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-periodo]");
    if (!botao) return;
    const v = botao.dataset.periodo;
    periodoAtual = v === "tudo" ? "tudo" : Number(v);
    try { localStorage.setItem(CHAVE_PERIODO, String(periodoAtual)); } catch { /* ignora */ }
    atualizar();
  });

  document.getElementById("btn-atualizar-dashboard")?.addEventListener("click", () => atualizar({ forcar: true }));
  document.getElementById("btn-compartilhar-resumo")?.addEventListener("click", compartilharResumo);
  document.getElementById("btn-gerar-relatorio-ia")?.addEventListener("click", gerarRelatorioComIA);
}
document.addEventListener("DOMContentLoaded", iniciarEstatisticas);

// ============================================================
// CARREGAMENTO
// ============================================================
function dataDaChave(chave) {
  const [a, m, d] = chave.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function normalizarTimestamps(doc) {
  const c = { ...doc };
  for (const k in c) if (c[k]?.toDate) c[k] = c[k].toDate();
  return c;
}

async function lerPorData(colecao, campo, desde) {
  try {
    const ref = collection(db, colecao);
    const consulta = desde ? query(ref, where(campo, ">=", Timestamp.fromDate(dataDaChave(desde)))) : ref;
    const snap = await getDocs(consulta);
    return { itens: snap.docs.map((d) => normalizarTimestamps(d.data())), falhou: false };
  } catch (e) {
    console.error(`[admin-estatisticas] Erro em ${colecao}:`, e);
    return { itens: [], falhou: true };
  }
}

async function lerAcessos(desde) {
  try {
    const ref = collection(db, "acessos_diarios");
    const consulta = desde ? query(ref, where(documentId(), ">=", desde)) : ref;
    const snap = await getDocs(consulta);
    return { itens: snap.docs.map((d) => ({ data: d.id, ...d.data() })), falhou: false };
  } catch (e) {
    console.error("[admin-estatisticas] Erro em acessos_diarios:", e);
    return { itens: [], falhou: true };
  }
}

async function lerPois() {
  try {
    return { itens: await buscarTodosPois(), falhou: false };
  } catch (e) {
    console.error("[admin-estatisticas] Erro em pois:", e);
    return { itens: [], falhou: true };
  }
}

function cacheCobre(desde) {
  if (!cache.dados) return false;
  if (cache.desde === null) return true;
  return desde !== null && cache.desde <= desde;
}

async function carregarDados(periodo, forcar) {
  const desde = intervaloDoPeriodo(periodo).anteriorInicio; // null = tudo
  // "Tudo" não tem período anterior: lê desde o começo.
  const desdeNecessario = periodo === "tudo" ? null : desde;
  if (!forcar && cacheCobre(desdeNecessario)) return cache.dados;

  const [rotas, checkins, acessos, pois] = await Promise.all([
    lerPorData("rotas_criadas", "criadoEm", desdeNecessario),
    lerPorData("checkins", "checkinEm", desdeNecessario),
    lerAcessos(desdeNecessario),
    lerPois(),
  ]);

  const falhas = [];
  if (rotas.falhou) falhas.push("rotas");
  if (checkins.falhou) falhas.push("check-ins");
  if (acessos.falhou) falhas.push("acessos");
  if (pois.falhou) falhas.push("locais");

  const dados = {
    acessos: acessos.itens,
    criacoes: rotas.itens.filter((r) => r.tipoEvento !== "finalizacao"),
    finalizacoes: rotas.itens.filter((r) => r.tipoEvento === "finalizacao"),
    checkins: checkins.itens,
    pois: pois.itens,
    falhas,
  };

  // Só guarda em cache se tudo carregou; senão a próxima tentativa relê.
  if (falhas.length === 0) {
    cache.desde = desdeNecessario;
    cache.dados = dados;
  } else {
    cache.dados = null;
  }
  return dados;
}

async function atualizar({ forcar = false } = {}) {
  if (carregando) return;
  carregando = true;
  const conteudo = document.getElementById("dash-conteudo");
  desenharChips();
  if (conteudo) conteudo.setAttribute("aria-busy", "true");
  definirBotaoAtualizar(true);

  try {
    const dados = await carregarDados(periodoAtual, forcar);
    analiseAtual = analisar(dados, periodoAtual);
    ultimoResumoParaIA = montarResumoParaIA(analiseAtual);
    desenharAviso(dados.falhas);
    desenharTudo(analiseAtual);
  } catch (e) {
    console.error("[admin-estatisticas] Erro ao montar o dashboard:", e);
    desenharAviso(["dashboard"]);
  } finally {
    carregando = false;
    if (conteudo) conteudo.removeAttribute("aria-busy");
    definirBotaoAtualizar(false);
  }
}

function definirBotaoAtualizar(ocupado) {
  const b = document.getElementById("btn-atualizar-dashboard");
  if (!b) return;
  b.disabled = ocupado;
  b.textContent = ocupado ? "Carregando…" : "Atualizar";
}

// ============================================================
// DESENHO
// ============================================================
function desenharChips() {
  const el = document.getElementById("periodo-chips");
  if (!el) return;
  el.innerHTML = PERIODOS.map((p) =>
    `<button type="button" class="chip-periodo${p.valor === periodoAtual ? " ativo" : ""}" data-periodo="${p.valor}" aria-pressed="${p.valor === periodoAtual}">${p.rotulo}</button>`
  ).join("");
}

function desenharAviso(falhas) {
  const el = document.getElementById("dash-aviso");
  if (!el) return;
  if (!falhas || falhas.length === 0) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false;
  el.textContent = `Não consegui carregar: ${falhas.join(", ")}. Os números abaixo estão incompletos — toque em Atualizar.`;
}

function desenharTudo(a) {
  const conteudo = document.getElementById("dash-conteudo");
  if (!conteudo) return;

  conteudo.innerHTML = [
    blocoAlertas(a),
    blocoKpis(a),
    cartao("Movimento por dia", blocoSerie(a), { aberto: true }),
    cartao("Sugerido x visitado, por local", blocoOfertaVisita(a), { aberto: true }),
    cartao("Patrocinadores", blocoPatrocinados(a), { aberto: a.patrocinados.length > 0 }),
    cartao("Locais nunca sugeridos", blocoNuncaSugeridos(a), { aberto: a.nuncaSugeridos.length > 0 }),
    cartao("Quando as pessoas montam rotas", blocoCalor(a)),
    cartao("O que pedem x o que visitam", blocoDemanda(a)),
    cartao("Rotas sem resultado", blocoFalhas(a)),
    cartao("Refeições e interesses", blocoPedidos(a)),
    cartao("Horário dos acessos", blocoAcessosPorHora(a)),
    cartao("Check-ins recentes", blocoCheckins(a)),
  ].join("");
}

function cartao(titulo, corpo, { aberto = false } = {}) {
  return `<details class="dash-cartao"${aberto ? " open" : ""}><summary>${escaparHtml(titulo)}</summary><div class="dash-cartao__corpo">${corpo}</div></details>`;
}

function vazio(texto) {
  return `<p class="dash-vazio">${escaparHtml(texto)}</p>`;
}

// ---------- Alertas ----------
function blocoAlertas(a) {
  const itens = a.alertas.map((x) =>
    `<div class="alerta alerta--${escaparHtml(x.nivel)}"><strong>${escaparHtml(x.titulo)}</strong><span>${escaparHtml(x.texto)}</span></div>`
  ).join("");
  return `<section class="dash-atencao" aria-label="O que merece atenção"><h2 class="dash-titulo">O que merece atenção</h2>${itens}</section>`;
}

// ---------- KPIs ----------
function delta(k) {
  if (k.variacaoPct == null) return "";
  const cls = k.variacaoPct > 0 ? "sobe" : k.variacaoPct < 0 ? "desce" : "igual";
  const txt = k.variacaoPct > 0 ? `▲ ${k.variacaoPct}%` : k.variacaoPct < 0 ? `▼ ${Math.abs(k.variacaoPct)}%` : "=";
  return `<span class="kpi-card__delta kpi-card__delta--${cls}">${txt}</span>`;
}

function kpiCard(rotulo, valor, extra = "", destaque = false) {
  return `<div class="kpi-card"><span class="kpi-card__label">${escaparHtml(rotulo)}</span><span class="kpi-card__valor${destaque ? " kpi-card__valor--destaque" : ""}">${valor}</span>${extra}</div>`;
}

function blocoKpis(a) {
  const k = a.kpis;
  const comparando = a.janela.anteriorInicio != null;
  return `
    <div class="kpis">
      ${kpiCard("Acessos", Number(k.acessos.valor), delta(k.acessos))}
      ${kpiCard("Rotas criadas", Number(k.rotas.valor), delta(k.rotas))}
      ${kpiCard("Check-ins", Number(k.checkins.valor), delta(k.checkins))}
      ${kpiCard("Rotas concluídas", Number(k.concluidas.valor), delta(k.concluidas))}
      ${kpiCard("Viram rota", `${Number(k.conversaoPct)}%`, `<span class="kpi-card__nota">acessos → rotas</span>`, true)}
      ${kpiCard("Concluem", `${Number(k.conclusaoPct)}%`, `<span class="kpi-card__nota">concluídas ÷ criadas</span>`, true)}
    </div>
    <p class="dash-rodape">${comparando ? "Setas comparam com os " + escaparHtml(String(a.janela.dias)) + " dias anteriores. " : ""}Acessos contam carregamentos de página, não pessoas.</p>`;
}

// ---------- Série por dia ----------
function barrasVerticais(itens, campo, cor) {
  const max = Math.max(1, ...itens.map((i) => i[campo]));
  const barras = itens.map((i) => {
    const altura = i[campo] > 0 ? Math.max(4, Math.round((i[campo] / max) * 100)) : 0;
    return `<span class="vbar" style="height:${altura}%;background:${cor}" title="${escaparHtml(i.rotulo)}: ${Number(i[campo])}"></span>`;
  }).join("");
  return `<div class="vbars" role="img" aria-label="Gráfico de barras por dia">${barras}</div>`;
}

function blocoSerie(a) {
  const itens = agruparSerie(a.serieDia, 30);
  if (itens.length === 0 || (a.kpis.acessos.valor === 0 && a.kpis.rotas.valor === 0)) return vazio("Sem movimento neste período.");
  const agrupado = a.serieDia.length > 30;
  const eixo = `<div class="vbars-eixo"><span>${escaparHtml(itens[0].rotulo)}</span><span>${escaparHtml(itens[itens.length - 1].rotulo)}</span></div>`;
  return `
    <p class="dash-sub">Acessos${agrupado ? " (cada barra soma vários dias)" : ""} — total ${Number(a.kpis.acessos.valor)}</p>
    ${barrasVerticais(itens, "acessos", "#4A6B9E")}${eixo}
    <p class="dash-sub">Rotas criadas — total ${Number(a.kpis.rotas.valor)}</p>
    ${barrasVerticais(itens, "rotas", "#3C4A3E")}${eixo}`;
}

// ---------- Sugerido x visitado ----------
const LIMITE_LISTA = 8;

function linhaOfertaVisita(l, max) {
  const wo = Math.round((l.oferecido / max) * 100);
  const wv = Math.round((l.visitas / max) * 100);
  return `
    <li class="rank-item">
      <span class="rank-item__nome">${escaparHtml(l.nome)}</span>
      <span class="rank-item__linha"><span class="rank-item__rotulo">Sugerido</span><span class="rank-barra"><span style="width:${wo}%;background:#8B6B1A"></span></span><b>${Number(l.oferecido)}</b></span>
      <span class="rank-item__linha"><span class="rank-item__rotulo">Visitas</span><span class="rank-barra"><span style="width:${wv}%;background:#2D7A3A"></span></span><b>${Number(l.visitas)}</b></span>
    </li>`;
}

function blocoOfertaVisita(a) {
  const lista = a.ofertaVisita;
  if (lista.length === 0) return vazio("Nenhuma rota ou check-in neste período.");
  const max = Math.max(1, ...lista.map((l) => Math.max(l.oferecido, l.visitas)));
  const primeiros = lista.slice(0, LIMITE_LISTA).map((l) => linhaOfertaVisita(l, max)).join("");
  const resto = lista.slice(LIMITE_LISTA).map((l) => linhaOfertaVisita(l, max)).join("");
  return `
    <p class="dash-sub">"Sugerido" = vezes que o roteiro incluiu o local. "Visitas" = check-ins. Visitas maiores que sugestões vêm de quem foi ao local fora de uma rota.</p>
    <ul class="rank">${primeiros}</ul>
    ${resto ? `<details class="dash-mais"><summary>Ver mais ${lista.length - LIMITE_LISTA} locais</summary><ul class="rank">${resto}</ul></details>` : ""}`;
}

// ---------- Patrocinadores ----------
function blocoPatrocinados(a) {
  if (a.patrocinados.length === 0) return vazio("Nenhum local com patrocínio ativo cadastrado.");
  const linhas = a.patrocinados.map((p) => `
    <li class="rank-item">
      <span class="rank-item__nome">${escaparHtml(p.nome)} <span class="selo-patrocinio selo-patrocinio--${escaparHtml(p.nivel)}">${escaparHtml(p.nivel)}</span></span>
      <span class="rank-item__resumo">Sugerido em <b>${Number(p.oferecido)}</b> rota(s) · <b>${Number(p.visitas)}</b> visita(s)</span>
      ${p.oferecido === 0 ? `<span class="rank-item__aviso">Ainda não apareceu em nenhuma rota neste período.</span>` : ""}
    </li>`).join("");
  return `<p class="dash-sub">Quanto cada local patrocinado apareceu nas rotas e foi visitado. Serve de prova na renovação.</p><ul class="rank">${linhas}</ul>`;
}

// ---------- Nunca sugeridos ----------
function blocoNuncaSugeridos(a) {
  if (a.janela && a.kpis.rotas.valor < a.amostraMinimaRotas) {
    return vazio(`Só dá para avaliar com pelo menos ${a.amostraMinimaRotas} rotas no período (hoje: ${a.kpis.rotas.valor}).`);
  }
  if (a.nuncaSugeridos.length === 0) return vazio("Todo local ativo apareceu em alguma rota.");
  const linhas = a.nuncaSugeridos.map((p) =>
    `<li class="chip-lista">${escaparHtml(p.nome)} <small>${escaparHtml(p.categoria || "")}</small></li>`
  ).join("");
  return `<p class="dash-sub">Locais ativos que o roteiro não escolheu nenhuma vez. Confira horário, localização e interesses no cadastro.</p><ul class="chips-lista">${linhas}</ul>`;
}

// ---------- Mapa de calor ----------
function blocoCalor(a) {
  const { matriz, max } = a.calor;
  if (max === 0) return vazio("Sem rotas neste período.");
  const cab = ['<span></span>'];
  for (let h = 0; h < 24; h++) cab.push(`<span class="calor__hora">${h % 6 === 0 ? h : ""}</span>`);
  let pico = { v: 0, d: 0, h: 0 };
  const linhas = matriz.map((linha, d) => {
    const celulas = linha.map((v, h) => {
      if (v > pico.v) pico = { v, d, h };
      const alpha = v === 0 ? 0 : 0.18 + 0.82 * (v / max);
      const estilo = v === 0 ? "" : ` style="background:rgba(139,26,26,${alpha.toFixed(2)})"`;
      return `<span class="calor__cel"${estilo} title="${DIAS_SEMANA[d]} ${h}h: ${v}"></span>`;
    }).join("");
    return `<span class="calor__dia">${DIAS_SEMANA[d]}</span>${celulas}`;
  }).join("");
  return `
    <div class="calor" role="img" aria-label="Mapa de calor de rotas por dia da semana e hora">${cab.join("")}${linhas}</div>
    <p class="dash-sub">Horas de 0 a 23, da esquerda para a direita. Mais forte = mais rotas. Pico: <b>${DIAS_SEMANA[pico.d]} às ${pico.h}h</b> (${pico.v} rota${pico.v > 1 ? "s" : ""}).</p>`;
}

// ---------- Demanda x realizado ----------
function blocoDemanda(a) {
  if (a.demanda.length === 0) return vazio("Sem interesses nem check-ins neste período.");
  const linhas = a.demanda.map((d) => `
    <li class="rank-item">
      <span class="rank-item__nome">${escaparHtml(d.rotulo)}</span>
      <span class="rank-item__linha"><span class="rank-item__rotulo">Pedem</span><span class="rank-barra"><span style="width:${Number(d.pedidoPct)}%;background:#C8943A"></span></span><b>${Number(d.pedidoPct)}%</b></span>
      <span class="rank-item__linha"><span class="rank-item__rotulo">Visitam</span><span class="rank-barra"><span style="width:${Number(d.visitadoPct)}%;background:#2D7A3A"></span></span><b>${Number(d.visitadoPct)}%</b></span>
    </li>`).join("");
  return `<p class="dash-sub">Parte dos interesses marcados no formulário contra parte dos check-ins por categoria. "Família" conta como Lazer. Diferença grande = oferta que não acompanha o desejo.</p><ul class="rank">${linhas}</ul>`;
}

// ---------- Rotas sem resultado ----------
function blocoFalhas(a) {
  const total = a.kpis.rotasVazias;
  if (a.kpis.rotas.valor === 0) return vazio("Sem rotas neste período.");
  if (total === 0) return vazio("Nenhuma rota saiu vazia neste período.");
  const linhas = a.falhasPorFaixa.map((f) => `
    <li class="rank-item">
      <span class="rank-item__nome">${escaparHtml(f.faixa)}</span>
      <span class="rank-item__resumo"><b>${Number(f.vazias)}</b> sem resultado de ${Number(f.total)} rota(s)${f.total ? ` (${Math.round((f.vazias / f.total) * 100)}%)` : ""}</span>
    </li>`).join("");
  return `<p class="dash-sub">${Number(total)} rota(s) (${Number(a.kpis.rotasVaziasPct)}%) em que a pessoa não recebeu nenhuma parada, por horário de saída escolhido.</p><ul class="rank">${linhas}</ul>`;
}

// ---------- Refeições e interesses ----------
function barrasHorizontais(itens, cor) {
  if (itens.length === 0) return vazio("Sem dados.");
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return `<ul class="rank">${itens.map((i) => `
    <li class="rank-item">
      <span class="rank-item__linha"><span class="rank-item__rotulo rank-item__rotulo--largo">${escaparHtml(i.rotulo)}</span><span class="rank-barra"><span style="width:${Math.round((i.valor / max) * 100)}%;background:${cor}"></span></span><b>${Number(i.valor)}</b></span>
    </li>`).join("")}</ul>`;
}

function blocoPedidos(a) {
  return `<p class="dash-sub">Refeições pedidas</p>${barrasHorizontais(a.refeicoes, "#C8943A")}
    <p class="dash-sub">Interesses marcados</p>${barrasHorizontais(a.interesses, "#2D7A3A")}`;
}

// ---------- Acessos por horário ----------
function blocoAcessosPorHora(a) {
  const itens = a.acessosPorHora.map((v, h) => ({ rotulo: `${String(h).padStart(2, "0")}h`, acessos: v }));
  if (itens.every((i) => i.acessos === 0)) return vazio("Sem acessos neste período.");
  const eixo = `<div class="vbars-eixo"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>`;
  return `${barrasVerticais(itens, "acessos", "#8B6B1A")}${eixo}`;
}

// ---------- Check-ins recentes ----------
function blocoCheckins(a) {
  if (a.ultimosCheckins.length === 0) return vazio("Nenhum check-in neste período.");
  const dd = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const hh = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `<ul class="rank">${a.ultimosCheckins.map((c) => `
    <li class="rank-item rank-item--linha">
      <span class="rank-item__nome">${escaparHtml(c.poiNome || "—")}</span>
      <span class="rank-item__resumo">${escaparHtml(c.poiCategoria || "—")} · ${dd(c.checkinEm)} ${hh(c.checkinEm)} · ${escaparHtml(c.origemDeteccao || "—")}</span>
    </li>`).join("")}</ul>`;
}

// ============================================================
// COMPARTILHAR RESUMO
// ============================================================
async function compartilharResumo() {
  const status = document.getElementById("compartilhar-status");
  if (!analiseAtual) { if (status) status.textContent = "Aguarde o painel carregar."; return; }
  const texto = montarTextoResumo(analiseAtual);
  try {
    if (navigator.share) {
      await navigator.share({ text: texto });
      if (status) status.textContent = "";
      return;
    }
  } catch (e) {
    if (e?.name === "AbortError") return; // a pessoa fechou a folha de compartilhar
  }
  try {
    await navigator.clipboard.writeText(texto);
    if (status) status.textContent = "Resumo copiado. É só colar no WhatsApp.";
  } catch {
    if (status) status.textContent = "Não consegui copiar automaticamente.";
  }
}

// ============================================================
// RELATÓRIO COM IA — manda só o resumo agregado (nunca dado individual)
// ============================================================
async function gerarRelatorioComIA() {
  const botao = document.getElementById("btn-gerar-relatorio-ia");
  const statusEl = document.getElementById("relatorio-ia-status");
  const resultadoEl = document.getElementById("relatorio-ia-resultado");

  if (!ultimoResumoParaIA) {
    statusEl.textContent = "Aguarde o painel carregar antes de gerar o relatório.";
    statusEl.dataset.tipo = "erro";
    return;
  }

  botao.disabled = true;
  statusEl.textContent = "Gerando relatório...";
  statusEl.dataset.tipo = "";
  resultadoEl.hidden = true;

  try {
    // O endpoint exige login de admin: manda o ID token do Firebase.
    const token = await auth.currentUser?.getIdToken();
    const resposta = await fetch("/api/gerar-relatorio", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ resumo: ultimoResumoParaIA }),
    });

    const dados = await resposta.json();
    if (!resposta.ok || !dados.relatorio) throw new Error(dados.erro || "Falha desconhecida");

    resultadoEl.textContent = dados.relatorio;
    resultadoEl.hidden = false;
    statusEl.textContent = "";
  } catch (erro) {
    console.error("[admin-estatisticas] Erro ao gerar relatório:", erro);
    statusEl.textContent = "Não consegui gerar o relatório agora. Tenta de novo em instante.";
    statusEl.dataset.tipo = "erro";
  } finally {
    botao.disabled = false;
  }
}

