/**
 * selos-local.js
 * Linde Guia — Treze Tílias
 *
 * Não existe sistema de login de turista no projeto (auth.js citado nos
 * comentários de pois-data.js nunca foi implementado). Por isso "Meus
 * selos" em perfil.html não pode vir do Firestore — as regras de
 * segurança (firestore.rules) só deixam o admin ler a coleção
 * "checkins", não o próprio usuário.
 *
 * Solução: guardar os selos localmente, no navegador do visitante
 * (localStorage, sobrevive entre sessões no mesmo aparelho). Cada
 * "Cheguei" confirmado em modo-em-rota.js grava aqui, além de gravar
 * o check-in real no Firestore (que alimenta as estatísticas do admin).
 *
 * Limitação conhecida: selos ficam presos ao aparelho/navegador. Se o
 * projeto evoluir para ter login de turista, isso pode migrar pra
 * Firestore em "usuarios/{uid}/selos".
 *
 * ------------------------------------------------------------
 * HISTÓRICO DE ALTERAÇÕES
 * ------------------------------------------------------------
 * O QUE FOI FEITO: nova função lerSelosDeHoje(); "hoje" agora é a data
 * LOCAL do aparelho (antes salvarSeloLocal usava a data em UTC); lerSelos()
 * devolve sempre um array, mesmo se o localStorage estiver corrompido.
 * POR QUÊ: formulario-roteiro.js e modo-em-rota.js usavam lerSelos() inteiro
 * pra excluir lugares "já visitados" das rotas novas — então quem voltava
 * à cidade nunca mais recebia um lugar visitado meses antes. Agora só o
 * que foi visitado HOJE é excluído. Em UTC, depois das 21h (Brasil) o
 * "dia" virava e o mesmo lugar gerava selo duplicado.
 * O QUE FALTA: nada neste arquivo. perfil.js e roteiro-manual.js
 * continuam usando lerSelos() (histórico completo) de propósito.
 */

const CHAVE_STORAGE = "linde-guia:selos";

// Chave AAAA-MM-DD no fuso do aparelho (não em UTC).
function chaveDoDiaLocal(valor) {
  const d = new Date(valor);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function lerSelos() {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch (erro) {
    console.warn("[selos-local] Erro ao ler selos:", erro);
    return [];
  }
}

// Só os selos coletados no dia de hoje (data local). Usado pra decidir o
// que já foi visitado NESTE passeio, sem bloquear lugares de visitas antigas.
function lerSelosDeHoje() {
  const hoje = chaveDoDiaLocal(new Date());
  return lerSelos().filter((s) => s && s.data && chaveDoDiaLocal(s.data) === hoje);
}

function salvarSeloLocal(poi) {
  if (!poi || !poi.nome) return;

  try {
    const selos = lerSelos();

    // Evita duplicar o mesmo local no mesmo dia (várias "Cheguei" na mesma
    // parada não devem virar vários selos iguais na coleção do visitante)
    const hoje = chaveDoDiaLocal(new Date());
    const jaTemHoje = selos.some(
      (s) => s && s.poiId === poi.id && s.data && chaveDoDiaLocal(s.data) === hoje
    );
    if (jaTemHoje) return;

    selos.push({
      poiId: poi.id || null,
      poiNome: poi.nome,
      poiCategoria: poi.categoria || null,
      data: new Date().toISOString(),
    });

    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(selos));
  } catch (erro) {
    console.warn("[selos-local] Erro ao salvar selo (não afeta o passeio):", erro);
  }
}

export { lerSelos, lerSelosDeHoje, salvarSeloLocal };
