/**
 * admin-auth.js — js/admin/admin-auth.js
 *
 * ATUALIZADO: login real via Firebase Auth (antes era só senha local em
 * sessionStorage, o que fazia toda chamada do painel cair em
 * "permission-denied" — ver histórico em firestore.rules).
 *
 * Estratégia: uma ÚNICA conta de e-mail/senha do Firebase Auth,
 * compartilhada pela Secretaria de Turismo / ASTURTILIAS. O e-mail é fixo
 * aqui no código (não é segredo — quem protege o acesso é a senha da
 * conta, guardada só no Firebase Auth). O painel continua pedindo só a
 * senha, pra manter a mesma UX de antes.
 *
 * SETUP NECESSÁRIO (uma vez só, no Firebase Console):
 *   1. Authentication > Sign-in method > ativar "E-mail/senha".
 *   2. Authentication > Users > Add user, com o e-mail definido em
 *      EMAIL_ADMIN abaixo e a senha que a Secretaria vai usar.
 *   3. Copiar o UID gerado para esse usuário.
 *   4. Firestore > criar coleção "usuarios_admin" > documento com ID
 *      igual a esse UID (o conteúdo do documento pode ficar vazio, só a
 *      existência dele já libera ehAdmin() nas regras).
 *
 * Se precisar trocar a senha depois, isso é feito direto no Firebase
 * Console (Authentication > Users), sem precisar editar código.
 */
import { auth } from "../core/firebase-config.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// TODO: trocar pelo e-mail real criado no passo 2 do setup acima.
const EMAIL_ADMIN = "admin@linde-guia.app";

function iniciarAuth() {
  const form = document.getElementById("form-senha");
  const inputSenha = document.getElementById("input-senha");
  const erroEl = document.getElementById("erro-senha");
  const btnSubmit = form.querySelector("button[type=submit]");

  // Fonte da verdade é o Firebase Auth, não mais o sessionStorage: se já
  // existe uma sessão válida (login anterior, ainda não expirado), libera
  // direto sem pedir senha de novo. Se não tem sessão, fica na tela de
  // senha até o submit abaixo logar com sucesso.
  onAuthStateChanged(auth, (usuario) => {
    if (usuario) {
      liberarAcesso();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    erroEl.hidden = true;
    btnSubmit.disabled = true;

    try {
      // onAuthStateChanged acima dispara liberarAcesso() assim que o login
      // for confirmado — não precisa chamar de novo aqui.
      await signInWithEmailAndPassword(auth, EMAIL_ADMIN, inputSenha.value);
    } catch (erro) {
      console.error("[admin-auth] Falha no login:", erro);
      erroEl.hidden = false;
      inputSenha.value = "";
      inputSenha.focus();
    } finally {
      btnSubmit.disabled = false;
    }
  });
}

function liberarAcesso() {
  document.getElementById("tela-senha").hidden = true;
  document.getElementById("conteudo-admin").hidden = false;
  document.dispatchEvent(new CustomEvent("linde-guia:admin-autenticado"));
}

// Exportado pra um eventual botão "Sair" no painel (não existe ainda na
// tela). Chamar isso desloga de verdade do Firebase Auth.
function sair() {
  return signOut(auth);
}

document.addEventListener("DOMContentLoaded", iniciarAuth);

export { sair };
