/**
 * eventos.js
 * Linde Guia — Treze Tílias
 *
 * Lógica da tela "Eventos" (pages/eventos.html). Lista todos os eventos
 * cadastrados via eventos-data.js, ordenados por data de início, com
 * destaque visual pros que estão acontecendo agora. Suporta abrir a
 * página com ?id=... (usado pelo banner-evento.js da Home) — se vier,
 * dá scroll até o card daquele evento.
 */
import { buscarTodosEventos } from "../data/eventos-data.js";

async function iniciarEventos() {
  const estadoCarregando = document.getElementById("estado-carregando");
  const estadoVazio = document.getElementById("estado-vazio");
  const lista = document.getElementById("lista-eventos");

  let eventos = [];
  try {
    eventos = await buscarTodosEventos();
  } catch (erro) {
    console.error("[eventos] Erro ao carregar eventos:", erro);
  }
  estadoCarregando.hidden = true;

  if (eventos.length === 0) {
    estadoVazio.hidden = false;
    return;
  }

  const agora = Date.now();
  const ordenados = [...eventos].sort(
    (a, b) => (a.dataInicio?.getTime() || 0) - (b.dataInicio?.getTime() || 0)
  );

  ordenados.forEach((evento) => lista.appendChild(criarCardEvento(evento, agora)));

  const idFocado = new URLSearchParams(window.location.search).get("id");
  if (idFocado) {
    document.getElementById(`evento-${idFocado}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

document.addEventListener("DOMContentLoaded", iniciarEventos);

function criarCardEvento(evento, agoraMs) {
  const inicioMs = evento.dataInicio?.getTime() ?? 0;
  const fimMs = evento.dataFim?.getTime() ?? Infinity;
  const estaAtivo = agoraMs >= inicioMs && agoraMs <= fimMs;

  const li = document.createElement("li");
  li.id = `evento-${evento.id}`;
  li.className = "card-evento" + (estaAtivo ? " card-evento--ativo" : "");

  const { dia, mes } = formatarDataCurta(evento.dataInicio);

  li.innerHTML = `
    <div class="card-evento__data">
      <div class="card-evento__dia">${dia}</div>
      <div class="card-evento__mes">${mes}</div>
    </div>
    <div class="card-evento__corpo">
      ${estaAtivo ? '<span class="card-evento__selo">Acontecendo agora</span>' : ""}
      <h2 class="card-evento__nome">${escaparHtml(evento.nome)}</h2>
      <p class="card-evento__descricao">${escaparHtml(evento.descricao || "")}</p>
    </div>
  `;
  return li;
}

function formatarDataCurta(data) {
  if (!data) return { dia: "—", mes: "" };
  const meses = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
  return { dia: String(data.getDate()).padStart(2, "0"), mes: meses[data.getMonth()] };
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}
