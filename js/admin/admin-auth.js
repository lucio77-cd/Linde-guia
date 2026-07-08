/**
 * admin-auth.js — js/admin/admin-auth.js
 */
const SENHA_ADMIN = "281223";
const CHAVE_SESSAO = "linde-guia:linden";

function iniciarAuth() {
  if (sessionStorage.getItem(CHAVE_SESSAO) === "true") {
    liberarAcesso();
    return;
  }
  const form      = document.getElementById("form-senha");
  const inputSenha = document.getElementById("input-senha");
  const erroEl    = document.getElementById("erro-senha");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (inputSenha.value === SENHA_ADMIN) {
      sessionStorage.setItem(CHAVE_SESSAO, "true");
      liberarAcesso();
    } else {
      erroEl.hidden = false;
      inputSenha.value = "";
      inputSenha.focus();
    }
  });
}

function liberarAcesso() {
  document.getElementById("tela-senha").hidden = true;
  document.getElementById("conteudo-admin").hidden = false;
  document.dispatchEvent(new CustomEvent("linde-guia:admin-autenticado"));
}

document.addEventListener("DOMContentLoaded", iniciarAuth);

