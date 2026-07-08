/**
 * admin-estatisticas.js — js/admin/admin-estatisticas.js
 */
import { db } from "../core/firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function iniciarEstatisticas() {
  document.addEventListener("linde-guia:admin-autenticado", carregarEstatisticas);
}
document.addEventListener("DOMContentLoaded", iniciarEstatisticas);

async function carregarEstatisticas() {
  const [rotasCriadas, checkins] = await Promise.all([
    buscarTodos("rotas_criadas"),
    buscarTodos("checkins"),
  ]);

  const criacoes     = rotasCriadas.filter((r) => r.tipoEvento !== "finalizacao");
  const finalizacoes = rotasCriadas.filter((r) => r.tipoEvento === "finalizacao");

  desenharKPIs(criacoes, finalizacoes, checkins);
  desenharRotasPorDia(criacoes);
  desenharRotasPorHorario(criacoes);
  desenharConclusao(criacoes, finalizacoes);
  desenharLocaisVisitados(checkins);
  desenharTabelaCheckins(checkins);
}

async function buscarTodos(colecao) {
  try {
    const snap = await getDocs(collection(db, colecao));
    return snap.docs.map((d) => normalizarTimestamps(d.data()));
  } catch (e) {
    console.error(`[admin-estatisticas] Erro em ${colecao}:`, e);
    return [];
  }
}

function normalizarTimestamps(doc) {
  const c = { ...doc };
  for (const k in c) if (c[k]?.toDate) c[k] = c[k].toDate();
  return c;
}

// KPIs
function desenharKPIs(criacoes, finalizacoes, checkins) {
  const taxa = criacoes.length > 0 ? Math.round((finalizacoes.length / criacoes.length) * 100) : 0;
  document.getElementById("cartoes-resumo").innerHTML = `
    <div class="kpi-card"><span class="kpi-card__label">Rotas criadas</span><span class="kpi-card__valor">${criacoes.length}</span></div>
    <div class="kpi-card"><span class="kpi-card__label">Concluídas</span><span class="kpi-card__valor">${finalizacoes.length}</span></div>
    <div class="kpi-card"><span class="kpi-card__label">Taxa de conclusão</span><span class="kpi-card__valor kpi-card__valor--destaque">${taxa}%</span></div>
    <div class="kpi-card"><span class="kpi-card__label">Check-ins</span><span class="kpi-card__valor">${checkins.length}</span></div>
  `;
}

function desenharRotasPorDia(criacoes) {
  const map = {};
  criacoes.forEach((r) => { if (r.criadoEm) { const k = diaChave(r.criadoEm); map[k] = (map[k]||0)+1; } });
  const dias = Object.keys(map).sort();
  grafico("grafico-rotas-por-dia","bar",dias.map(diaExibicao),[{label:"Rotas criadas",data:dias.map(d=>map[d]),backgroundColor:"#3C4A3E",borderRadius:6}]);
}

function desenharRotasPorHorario(criacoes) {
  const arr = new Array(24).fill(0);
  criacoes.forEach((r) => { if (r.criadoEm) arr[r.criadoEm.getHours()]++; });
  grafico("grafico-rotas-por-horario","bar",arr.map((_,h)=>`${String(h).padStart(2,"0")}h`),[{label:"Rotas",data:arr,backgroundColor:"#9E2B25",borderRadius:4}]);
}

function desenharConclusao(criacoes, finalizacoes) {
  const c={},f={};
  criacoes.forEach(r=>{if(r.criadoEm){const k=diaChave(r.criadoEm);c[k]=(c[k]||0)+1;}});
  finalizacoes.forEach(r=>{if(r.criadoEm){const k=diaChave(r.criadoEm);f[k]=(f[k]||0)+1;}});
  const dias=[...new Set([...Object.keys(c),...Object.keys(f)])].sort();
  grafico("grafico-conclusao","line",dias.map(diaExibicao),[
    {label:"Criadas",data:dias.map(d=>c[d]||0),borderColor:"#3C4A3E",backgroundColor:"transparent",tension:.3},
    {label:"Concluídas",data:dias.map(d=>f[d]||0),borderColor:"#9E2B25",backgroundColor:"transparent",tension:.3},
  ]);
}

function desenharLocaisVisitados(checkins) {
  const map={};
  checkins.forEach(c=>{const n=c.poiNome||"Desconhecido";map[n]=(map[n]||0)+1;});
  const ord=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,10);
  grafico("grafico-locais-visitados","bar",ord.map(([n])=>n),[{label:"Check-ins",data:ord.map(([,q])=>q),backgroundColor:"#B8924A",borderRadius:6}],{indexAxis:"y"});
}

function desenharTabelaCheckins(checkins) {
  const tbody = document.querySelector("#tabela-checkins tbody");
  tbody.innerHTML = "";
  [...checkins].filter(c=>c.checkinEm).sort((a,b)=>b.checkinEm-a.checkinEm).slice(0,30).forEach(c=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${c.poiNome||"—"}</td><td>${c.poiCategoria||"—"}</td><td>${diaExibicao(diaChave(c.checkinEm))}</td><td>${String(c.checkinEm.getHours()).padStart(2,"0")}:${String(c.checkinEm.getMinutes()).padStart(2,"0")}</td><td>${c.origemDeteccao||"—"}</td>`;
    tbody.appendChild(tr);
  });
}

function grafico(id, tipo, labels, datasets, extra={}) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart==="undefined") return;
  new Chart(canvas,{type:tipo,data:{labels,datasets},options:{responsive:true,plugins:{legend:{display:datasets.length>1}},...extra}});
}

function diaChave(d) { return d.toISOString().slice(0,10); }
function diaExibicao(k) { const [,m,d]=k.split("-"); return `${d}/${m}`; }
