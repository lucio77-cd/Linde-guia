/**
 * admin-parceiros.js
 * Primeira etapa: ativação e suspensão administrativa dos portais.
 */
import { buscarTodosPois } from "../data/pois-data.js";
import {
  buscarTodosPortaisParceiros,
  definirAtivacaoPortal,
} from "../data/parceiros-data.js";
import { escaparHtml } from "../core/html-utils.js";

let locais = [];
let portaisPorPoi = new Map();
let carregando = false;

function iniciar() {
  document.addEventListener("linde-guia:admin-autenticado", carregar);
  document.querySelector('[data-aba="aba-parceiros"]')?.addEventListener("click", () => {
    if (!carregando && locais.length === 0) carregar();
  });
}

async function carregar() {
  if (carregando) return;
  carregando = true;
  const lista = document.getElementById("lista-portais-parceiros");
  const status = document.getElementById("status-portais-parceiros");
  if (!lista) {
    carregando = false;
    return;
  }

  lista.innerHTML = '<p class="lista-vazia">Carregando estabelecimentos...</p>';
  status.textContent = "";

  try {
    const [pois, portais] = await Promise.all([
      buscarTodosPois({ forcarAtualizacao: true }),
      buscarTodosPortaisParceiros(),
    ]);
    locais = pois.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    portaisPorPoi = new Map(portais.map((portal) => [portal.poiId || portal.id, portal]));
    renderizar();
  } catch (erro) {
    console.error("[admin-parceiros] Falha ao carregar portais:", erro);
    lista.innerHTML = '<p class="lista-vazia">Não foi possível carregar os portais. Tente novamente.</p>';
    status.textContent = "A leitura falhou; os estabelecimentos não foram considerados desativados.";
    status.dataset.tipo = "erro";
  } finally {
    carregando = false;
  }
}

function renderizar() {
  const lista = document.getElementById("lista-portais-parceiros");
  if (!locais.length) {
    lista.innerHTML = '<p class="lista-vazia">Nenhum estabelecimento cadastrado.</p>';
    return;
  }

  lista.innerHTML = locais.map((poi) => {
    const portal = portaisPorPoi.get(poi.id);
    const ativo = portal?.ativo === true;
    const nome = escaparHtml(poi.nome || "Local sem nome");
    const categoria = escaparHtml(poi.categoria || "Sem categoria");
    const id = escaparHtml(poi.id);
    const estado = ativo ? "Ativo" : "Não ativado";
    const acao = ativo ? "Suspender portal" : "Ativar portal";
    return `
      <article class="local-admin-card" style="cursor:default;">
        <div class="local-admin-card__topo">
          <div>
            <h2 class="local-admin-card__nome">${nome}</h2>
            <p class="local-admin-card__detalhe">${categoria}</p>
          </div>
          <span class="local-admin-card__status ${ativo ? "status--ativo" : "status--fechado_temporariamente"}">${estado}</span>
        </div>
        <p class="local-admin-card__detalhe">Portal do estabelecimento · ID: ${id}</p>
        <div class="local-admin-card__rodape">
          <button type="button" class="btn ${ativo ? "btn--secundario" : "btn--principal"}"
            data-acao-portal="${ativo ? "suspender" : "ativar"}" data-poi-id="${id}">
            ${acao}
          </button>
        </div>
      </article>`;
  }).join("");

  lista.querySelectorAll("[data-acao-portal]").forEach((botao) => {
    botao.addEventListener("click", () => alterarAtivacao(botao));
  });
}

async function alterarAtivacao(botao) {
  const poiId = botao.dataset.poiId;
  const ativo = botao.dataset.acaoPortal === "ativar";
  const poi = locais.find((item) => item.id === poiId);
  if (!poi) return;

  const portalAtual = portaisPorPoi.get(poiId) || null;
  const status = document.getElementById("status-portais-parceiros");
  botao.disabled = true;
  botao.textContent = ativo ? "Ativando..." : "Suspendendo...";
  status.textContent = "";

  try {
    const salvo = await definirAtivacaoPortal(poiId, ativo, portalAtual);
    portaisPorPoi.set(poiId, salvo);
    renderizar();
    status.dataset.tipo = "ok";
    status.textContent = ativo
      ? `Portal de "${poi.nome}" ativado. O acesso do parceiro será configurado na próxima etapa.`
      : `Portal de "${poi.nome}" suspenso. A suspensão ainda não revoga sessões porque o login do parceiro será implementado na próxima etapa.`;
  } catch (erro) {
    console.error("[admin-parceiros] Falha ao alterar ativação:", erro);
    status.dataset.tipo = "erro";
    status.textContent = "Não foi possível salvar a alteração. Nenhuma mudança foi confirmada.";
    botao.disabled = false;
    botao.textContent = ativo ? "Ativar portal" : "Suspender portal";
  }
}

document.addEventListener("DOMContentLoaded", iniciar);
