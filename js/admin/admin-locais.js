/**
 * admin-locais.js — js/admin/admin-locais.js
 * CRUD de POIs + filtro por categoria + dias de funcionamento
 */
import { db } from "../core/firebase-config.js";
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const NOME_COLECAO = "pois";
let poisCache = [];
let categoriaAtiva = "todos";

// O formulário usa abreviações nos botões (data-dia="seg", "ter"...), mas
// motor-rota.js e o restante do app esperam o nome completo do dia como
// chave (obterDiaSemana() devolve "segunda", "terca", etc). Sem esse mapa,
// tudo que o admin salvasse ficava com chaves que o motor nunca lia —
// o POI virava "sempre fechado" na prática, silenciosamente.
const DIA_ABREV_PARA_COMPLETO = {
  dom: "domingo",
  seg: "segunda",
  ter: "terca",
  qua: "quarta",
  qui: "quinta",
  sex: "sexta",
  sab: "sabado",
};
const DIA_COMPLETO_PARA_ABREV = Object.fromEntries(
  Object.entries(DIA_ABREV_PARA_COMPLETO).map(([abrev, completo]) => [completo, abrev])
);

function iniciarAdminLocais() {
  document.addEventListener("linde-guia:admin-autenticado", carregarLocais);
  configurarAbas();
  configurarFiltros();
  configurarDiasSemana();
  configurarPrioridadeCondicional();

  document.getElementById("btn-novo-local").addEventListener("click", () => abrirModal(null));
  document.getElementById("btn-cancelar-local").addEventListener("click", fecharModal);
  document.getElementById("btn-fechar-modal").addEventListener("click", fecharModal);
  document.getElementById("form-local").addEventListener("submit", salvarLocal);
  document.getElementById("btn-excluir-local").addEventListener("click", excluirLocalAtual);

  // Fecha modal ao clicar no backdrop
  document.getElementById("modal-local").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) fecharModal();
  });
}

document.addEventListener("DOMContentLoaded", iniciarAdminLocais);

// ============================================================
// ABAS DA SIDEBAR
// ============================================================
function configurarAbas() {
  document.querySelectorAll(".aba-nav[data-aba]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".aba-nav").forEach((b) => b.classList.remove("ativa"));
      btn.classList.add("ativa");
      document.querySelectorAll(".aba-conteudo").forEach((s) => {
        s.hidden = s.id !== btn.dataset.aba;
      });
    });
  });
}

// ============================================================
// FILTROS POR CATEGORIA
// ============================================================
function configurarFiltros() {
  document.querySelectorAll(".filtro-cat").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filtro-cat").forEach((b) => b.classList.remove("ativo"));
      btn.classList.add("ativo");
      categoriaAtiva = btn.dataset.cat;
      renderizarListaLocais();
    });
  });
}

// ============================================================
// DIAS DA SEMANA (toggle visual)
// ============================================================
function configurarDiasSemana() {
  document.querySelectorAll(".dia-toggle").forEach((btn) => {
    btn.addEventListener("click", () => btn.classList.toggle("ativo"));
  });
}

// Retorna as abreviacoes marcadas no formulario (ex: ["seg","ter"])
function getDiasSelecionados() {
  return Array.from(document.querySelectorAll(".dia-toggle.ativo")).map((b) => b.dataset.dia);
}

// Recebe abreviacoes (ex: ["seg","ter"]) e marca os botoes correspondentes
function setDiasSelecionados(diasAbrev = []) {
  document.querySelectorAll(".dia-toggle").forEach((btn) => {
    btn.classList.toggle("ativo", diasAbrev.includes(btn.dataset.dia));
  });
}

function montarHorarioFuncionamento(diasAbrev, abertura, fechamento) {
  if (!diasAbrev || diasAbrev.length === 0) return null;

  const horario = {};
  diasAbrev.forEach((abrev) => {
    const nomeCompleto = DIA_ABREV_PARA_COMPLETO[abrev];
    if (nomeCompleto) {
      horario[nomeCompleto] = { abre: abertura, fecha: fechamento };
    }
  });
  return horario;
}

function extrairHorarioParaFormulario(horarioFuncionamento) {
  if (!horarioFuncionamento || typeof horarioFuncionamento !== "object") {
    return { diasSelecionados: [], abertura: "08:00", fechamento: "18:00" };
  }

  const diasCompletos = Object.keys(horarioFuncionamento);
  const diasSelecionados = diasCompletos
    .map((completo) => DIA_COMPLETO_PARA_ABREV[completo])
    .filter(Boolean);

  const primeiraJanela = horarioFuncionamento[diasCompletos[0]] || {};

  return {
    diasSelecionados,
    abertura: primeiraJanela.abre || "08:00",
    fechamento: primeiraJanela.fecha || "18:00",
  };
}

// ============================================================
// PRIORIDADE GASTRONÔMICA — aparece só para gastronomia
// ============================================================
function configurarPrioridadeCondicional() {
  const select = document.getElementById("campo-categoria");
  const grupo  = document.getElementById("grupo-prioridade-gastronomica");
  select.addEventListener("change", () => {
    grupo.hidden = select.value !== "gastronomia";
  });
}

// ============================================================
// CARREGAR E LISTAR
// ============================================================
async function carregarLocais() {
  try {
    const snapshot = await getDocs(collection(db, NOME_COLECAO));
    poisCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderizarListaLocais();
  } catch (erro) {
    console.error("[admin-locais] Erro ao carregar locais:", erro);
  }
}

function renderizarListaLocais() {
  const container = document.getElementById("lista-locais-admin");
  container.innerHTML = "";

  const filtrados = poisCache
    .filter((p) => categoriaAtiva === "todos" || p.categoria === categoriaAtiva)
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  if (filtrados.length === 0) {
    container.innerHTML = `<p class="lista-vazia">Nenhum local encontrado nessa categoria.</p>`;
    return;
  }

  filtrados.forEach((poi) => {
    const status = poi.statusOperacional || poi.status_operacional || "ativo";
    const card = document.createElement("div");
    card.className = "local-admin-card";
    card.innerHTML = `
      <div class="local-admin-card__topo">
        <span class="local-admin-card__nome">${poi.nome}</span>
        <span class="local-admin-card__status status--${status}">${formatarStatus(status)}</span>
      </div>
      <div class="local-admin-card__rodape">
        <span class="tag-categoria tag-categoria--${poi.categoria || 'lazer'}">${poi.categoria || '—'}</span>
        <span class="local-admin-card__detalhe">${poi.duracaoMediaVisitaMin ?? poi.duracao_media_visita_min ?? 30} min · ${poi.precoEstimado > 0 ? 'R$' + poi.precoEstimado : 'Grátis'}</span>
      </div>
    `;
    card.addEventListener("click", () => abrirModal(poi));
    container.appendChild(card);
  });
}

function formatarStatus(s) {
  return { ativo:"Ativo", sazonal:"Sazonal", em_reforma:"Em reforma", fechado_temporariamente:"Fechado" }[s] || s;
}

// ============================================================
// MODAL
// ============================================================
function abrirModal(poi) {
  const modal    = document.getElementById("modal-local");
  const titulo   = document.getElementById("modal-local__titulo");
  const btnExcl  = document.getElementById("btn-excluir-local");
  const erroEl   = document.getElementById("erro-form-local");
  const grupoPrio = document.getElementById("grupo-prioridade-gastronomica");

  erroEl.hidden = true;

  if (poi) {
    titulo.textContent = "Editar local";
    document.getElementById("campo-id").value        = poi.id;
    document.getElementById("campo-nome").value      = poi.nome || "";
    document.getElementById("campo-categoria").value = poi.categoria || "gastronomia";
    document.getElementById("campo-descricao").value = poi.descricaoCurta || poi.descricao_curta || "";
    document.getElementById("campo-lat").value       = poi.localizacao?.lat ?? poi.localizacao?.latitude ?? "";
    document.getElementById("campo-lng").value       = poi.localizacao?.lng ?? poi.localizacao?.longitude ?? "";
    document.getElementById("campo-preco").value     = poi.precoEstimado ?? poi.preco_estimado ?? 0;
    document.getElementById("campo-duracao").value   = poi.duracaoMediaVisitaMin ?? poi.duracao_media_visita_min ?? 30;
    document.getElementById("campo-status").value    = poi.statusOperacional || poi.status_operacional || "ativo";

    // Horário — poi.horarioFuncionamento vem no formato { segunda: {abre,fecha}, ... }
    // (mesmo formato que motor-rota.js e pois-seed.json usam). O formulário só
    // suporta um único par abertura/fechamento pra todos os dias marcados, então
    // usamos o primeiro dia presente como referência pros dois campos de hora.
    const { diasSelecionados, abertura, fechamento } = extrairHorarioParaFormulario(
      poi.horarioFuncionamento
    );
    setDiasSelecionados(diasSelecionados);
    document.getElementById("campo-hora-abertura").value   = abertura;
    document.getElementById("campo-hora-fechamento").value = fechamento;

    // Prioridade gastronômica
    grupoPrio.hidden = poi.categoria !== "gastronomia";
    document.getElementById("campo-prioridade-gastronomica").value = poi.prioridadeGastronomica ?? 0;

    btnExcl.hidden = false;
  } else {
    titulo.textContent = "Novo local";
    document.getElementById("form-local").reset();
    document.getElementById("campo-id").value      = "";
    document.getElementById("campo-preco").value   = 0;
    document.getElementById("campo-duracao").value = 30;
    setDiasSelecionados([]);
    grupoPrio.hidden = true;
    btnExcl.hidden = true;
  }

  modal.hidden = false;
}

function fecharModal() {
  document.getElementById("modal-local").hidden = true;
}

// ============================================================
// SALVAR
// ============================================================
async function salvarLocal(e) {
  e.preventDefault();
  const erroEl = document.getElementById("erro-form-local");
  erroEl.hidden = true;

  const id       = document.getElementById("campo-id").value;
  const categoria = document.getElementById("campo-categoria").value;

  const dados = {
    nome:               document.getElementById("campo-nome").value.trim(),
    categoria,
    descricaoCurta:     document.getElementById("campo-descricao").value.trim(),
    localizacao: {
      lat: Number(document.getElementById("campo-lat").value),
      lng: Number(document.getElementById("campo-lng").value),
    },
    precoEstimado:        Number(document.getElementById("campo-preco").value),
    duracaoMediaVisitaMin: Number(document.getElementById("campo-duracao").value),
    statusOperacional:    document.getElementById("campo-status").value,
    horarioFuncionamento: montarHorarioFuncionamento(
      getDiasSelecionados(),
      document.getElementById("campo-hora-abertura").value,
      document.getElementById("campo-hora-fechamento").value
    ),
  };

  if (categoria === "gastronomia") {
    dados.prioridadeGastronomica = Number(document.getElementById("campo-prioridade-gastronomica").value);
  }

  if (!dados.nome) {
    erroEl.textContent = "O nome é obrigatório.";
    erroEl.hidden = false;
    return;
  }
  if (isNaN(dados.localizacao.lat) || isNaN(dados.localizacao.lng)) {
    erroEl.textContent = "Latitude e longitude precisam ser números válidos.";
    erroEl.hidden = false;
    return;
  }

  try {
    if (id) {
      await updateDoc(doc(db, NOME_COLECAO, id), dados);
    } else {
      await addDoc(collection(db, NOME_COLECAO), dados);
    }
    fecharModal();
    await carregarLocais();
  } catch (erro) {
    console.error("[admin-locais] Erro ao salvar:", erro);
    erroEl.textContent = "Erro ao salvar. Tente de novo.";
    erroEl.hidden = false;
  }
}

// ============================================================
// EXCLUIR
// ============================================================
async function excluirLocalAtual() {
  const id   = document.getElementById("campo-id").value;
  const nome = document.getElementById("campo-nome").value;
  if (!id) return;
  if (!confirm(`Excluir "${nome}"? Essa ação não pode ser desfeita.`)) return;
  try {
    await deleteDoc(doc(db, NOME_COLECAO, id));
    fecharModal();
    await carregarLocais();
  } catch (erro) {
    console.error("[admin-locais] Erro ao excluir:", erro);
    alert("Erro ao excluir. Tente de novo.");
  }
}
