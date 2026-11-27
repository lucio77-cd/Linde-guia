import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estaAbertoNoHorario,
  dataEstaNoIntervalo,
  gerarCapitulo,
  gerarCapituloDeFavoritos,
  obterCandidatosViaveis,
} from "../js/engine/motor-rota.js";

// Horários SEM "Z" = horário local, igual ao app (independe do fuso da máquina).
const SEXTA_10H = "2026-12-04T10:00:00"; // 4/12/2026 é sexta-feira
const SEXTA_23H = "2026-12-04T23:00:00";
const DATA = "2026-12-04";

const poi = (id, extra = {}) => ({
  id,
  nome: `Local ${id}`,
  categoria: "historico",
  localizacao: { lat: -27.0026, lng: -51.4084 },
  statusOperacional: "ativo",
  duracaoMediaVisitaMin: 30,
  precoEstimado: 0,
  avaliacao: 4,
  tagsDeInteresse: ["historia"],
  ...extra,
});

const perfil = (extra = {}) => ({
  localizacaoPartida: { lat: -27.0026, lng: -51.4084 },
  horarioInicio: SEXTA_10H,
  data: DATA,
  refeicoesDesejadas: [],
  interesses: [],
  idsExcluidos: [],
  ...extra,
});

test("estaAbertoNoHorario: sem horário cadastrado conta como aberto", () => {
  assert.equal(estaAbertoNoHorario(poi("a"), SEXTA_10H, DATA), true);
});

test("estaAbertoNoHorario: respeita janela, dia fechado e pausa de almoço", () => {
  const p = poi("a", { horarioFuncionamento: { sexta: { abre: "09:00", fecha: "18:00" } } });
  assert.equal(estaAbertoNoHorario(p, SEXTA_10H, DATA), true);
  assert.equal(estaAbertoNoHorario(p, SEXTA_23H, DATA), false);

  const fechado = poi("b", { horarioFuncionamento: { sexta: { fechado: true } } });
  assert.equal(estaAbertoNoHorario(fechado, SEXTA_10H, DATA), false);

  const comPausa = poi("c", {
    horarioFuncionamento: { sexta: { abre: "08:00", fecha: "18:00", pausaAlmoco: { inicio: "09:30", fim: "10:30" } } },
  });
  assert.equal(estaAbertoNoHorario(comPausa, SEXTA_10H, DATA), false);
});

test("estaAbertoNoHorario: janela que vira a meia-noite", () => {
  const bar = poi("bar", { horarioFuncionamento: { sexta: { abre: "18:00", fecha: "02:00" } } });
  assert.equal(estaAbertoNoHorario(bar, SEXTA_23H, DATA), true);
  assert.equal(estaAbertoNoHorario(bar, SEXTA_10H, DATA), false);
});

test("dataEstaNoIntervalo: sem dataFim o evento continua ativo", () => {
  assert.equal(dataEstaNoIntervalo("2026-12-04", "2026-12-01", null), true);
  assert.equal(dataEstaNoIntervalo("2026-12-04", "2026-12-10", null), false);
});

test("dataEstaNoIntervalo: sem dataInicio vale desde sempre", () => {
  assert.equal(dataEstaNoIntervalo("2026-12-04", null, "2026-12-31"), true);
  assert.equal(dataEstaNoIntervalo("2027-01-02", null, "2026-12-31"), false);
});

test("dataEstaNoIntervalo: dia final inclui o dia inteiro", () => {
  assert.equal(dataEstaNoIntervalo("2026-12-31T20:00:00", "2026-12-01", "2026-12-31"), true);
});

test("dataEstaNoIntervalo: data de referência inválida não ativa nada", () => {
  assert.equal(dataEstaNoIntervalo(undefined, "2026-12-01", "2026-12-31"), false);
});

test("obterCandidatosViaveis: remove em_reforma e fechado_temporariamente", () => {
  const pois = [
    poi("ok"),
    poi("reforma", { statusOperacional: "em_reforma" }),
    poi("fechado", { statusOperacional: "fechado_temporariamente" }),
  ];
  const ids = obterCandidatosViaveis(pois, [], perfil()).map((p) => p.id);
  assert.deepEqual(ids, ["ok"]);
});

test("obterCandidatosViaveis: evento ativo entra como evento-<id>; evento sem dataFim também", () => {
  const eventos = [
    { id: "festa", nome: "Festa", dataInicio: "2026-12-01", dataFim: "2026-12-31" },
    { id: "feira", nome: "Feira", dataInicio: "2026-11-01", dataFim: null },
    { id: "velho", nome: "Velho", dataInicio: "2026-01-01", dataFim: "2026-01-05" },
  ];
  const ids = obterCandidatosViaveis([], eventos, perfil()).map((p) => p.id).sort();
  assert.deepEqual(ids, ["evento-feira", "evento-festa"]);
});

test("gerarCapituloDeFavoritos: descarta em_reforma, excluídos e ids desconhecidos", () => {
  const pois = [
    poi("a"),
    poi("reforma", { statusOperacional: "em_reforma" }),
    poi("excluido"),
  ];
  const r = gerarCapituloDeFavoritos(pois, perfil({ idsExcluidos: ["excluido"] }), ["a", "reforma", "excluido", "nao-existe"]);
  assert.deepEqual([...r.idsDescartados].sort(), ["excluido", "nao-existe", "reforma"]);
  assert.equal(r.paradas.length, 1);
  assert.equal(r.paradas[0].id ?? r.paradas[0].poi?.id, "a");
});

test("gerarCapituloDeFavoritos: aceita evento-* quando ele está na lista de candidatos", () => {
  const eventos = [{ id: "feira", nome: "Feira", dataInicio: "2026-11-01", dataFim: null }];
  const candidatos = obterCandidatosViaveis([poi("a")], eventos, perfil());
  const r = gerarCapituloDeFavoritos(candidatos, perfil(), ["evento-feira"]);
  assert.equal(r.idsDescartados.length, 0);
  assert.equal(r.paradas.length, 1);
});

test("gerarCapitulo: não passa de 4 paradas e não repete local", () => {
  const pois = Array.from({ length: 10 }, (_, i) => poi(`p${i}`));
  const r = gerarCapitulo(pois, [], perfil());
  assert.ok(r.paradas.length >= 1 && r.paradas.length <= 4);
  const ids = r.paradas.map((p) => p.id ?? p.poi?.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("gerarCapitulo: sem candidatos devolve capítulo vazio", () => {
  const r = gerarCapitulo([poi("x", { statusOperacional: "em_reforma" })], [], perfil());
  assert.equal(r.paradas.length, 0);
});
