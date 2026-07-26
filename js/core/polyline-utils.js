/**
 * polyline-utils.js — js/core/polyline-utils.js
 * Linde Guia — Treze Tílias
 *
 * Decodifica o "encoded polyline" que a Directions API do Google devolve
 * (texto compacto representando uma sequência de coordenadas) pra uma
 * lista normal de [lat, lng], pronta pra desenhar no Leaflet.
 *
 * É o algoritmo padrão do Google (Encoded Polyline Algorithm Format,
 * documentado publicamente) — não precisa de nenhuma biblioteca externa
 * pra isso, é só umas dezenas de linhas.
 */
function decodificarPolyline(codificado) {
  if (!codificado) return [];

  const pontos = [];
  let indice = 0;
  let lat = 0;
  let lng = 0;

  while (indice < codificado.length) {
    let resultado = 0;
    let shift = 0;
    let byte;

    do {
      byte = codificado.charCodeAt(indice++) - 63;
      resultado |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (resultado & 1) ? ~(resultado >> 1) : (resultado >> 1);

    resultado = 0;
    shift = 0;
    do {
      byte = codificado.charCodeAt(indice++) - 63;
      resultado |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (resultado & 1) ? ~(resultado >> 1) : (resultado >> 1);

    pontos.push([lat / 1e5, lng / 1e5]);
  }

  return pontos;
}

export { decodificarPolyline };

