import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveDia, intervaloDoPeriodo, normalizarNome, agruparSerie } from "../js/admin/admin-analise.js";

test("chaveDia usa a data local, com zeros à esquerda", () => {
  assert.equal(chaveDia(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});

test("intervaloDoPeriodo: 7 dias termina hoje e compara com os 7 anteriores", () => {
  const r = intervaloDoPeriodo("7", new Date(2026, 11, 10, 12));
  assert.equal(r.fim, "2026-12-10");
  assert.equal(r.inicio, "2026-12-04");
  assert.equal(r.anteriorFim, "2026-12-03");
  assert.equal(r.anteriorInicio, "2026-11-27");
});

test("intervaloDoPeriodo: 'tudo' não tem início nem período anterior", () => {
  const r = intervaloDoPeriodo("tudo", new Date(2026, 11, 10));
  assert.equal(r.inicio, null);
  assert.equal(r.anteriorInicio, null);
});

test("normalizarNome ignora acento e caixa", () => {
  assert.equal(normalizarNome("  Café Tirolês "), normalizarNome("cafe tirolês"));
});

test("agruparSerie não devolve mais barras que o limite", () => {
  const serie = Array.from({ length: 90 }, (_, i) => ({ chave: `d${i}`, acessos: 1, criacoes: 0, finalizacoes: 0 }));
  assert.ok(agruparSerie(serie, 30).length <= 30);
});
