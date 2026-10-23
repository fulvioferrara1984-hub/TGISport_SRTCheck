/* SRT Check — grafici SVG della scheda Statistics (testo SVG, nessuna libreria; colori dalle classi CSS). */
(function (radice, fabbrica) {
  const m = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (radice.SC = radice.SC || {})[m.NOME] = m;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const MARGINI = { sinistra: 46, destra: 12, sopra: 12, sotto: 24 };

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function due(n) { return String(n).padStart(2, '0'); }
  function ora(ms) { const d = new Date(ms); return `${due(d.getHours())}:${due(d.getMinutes())}:${due(d.getSeconds())}`; }
  const f1 = (n) => (Math.round(n * 10) / 10).toString();

  // Massimo "tondo" dell'asse: 1, 2, 2.5, 5 × 10^k
  function massimoTondo(v) {
    if (!(v > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
    return 10 * p;
  }

  function svg(o) {
    const W = o.larghezza || 720, H = o.altezza || 180;
    const serie = o.serie || [];
    const tutti = serie.flatMap((s) => s.punti || []);
    const etichetta = esc(serie.map((s) => s.nome).join(', ') + (o.unita ? ` (${o.unita})` : ''));
    const apertura = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="grafico" role="img" aria-label="${etichetta}">`;
    if (!tutti.length) return `${apertura}<text x="${W / 2}" y="${H / 2}" class="vuoto" text-anchor="middle">No data</text></svg>`;

    const tempi = tutti.map((p) => p[0]);
    const t0 = o.inizio !== undefined ? o.inizio : Math.min(...tempi);
    const t1 = o.fine !== undefined ? o.fine : Math.max(...tempi);
    const durata = Math.max(t1 - t0, 1000);
    const valori = tutti.map((p) => p[1]).filter((v) => typeof v === 'number' && isFinite(v));
    const vmax = massimoTondo(Math.max(0, ...valori, ...(o.linee || []).map((l) => l.valore)) * 1.05);
    const larghezza = W - MARGINI.sinistra - MARGINI.destra, altezza = H - MARGINI.sopra - MARGINI.sotto;
    const x = (t) => MARGINI.sinistra + (t - t0) / durata * larghezza;
    const y = (v) => MARGINI.sopra + altezza - Math.max(0, v) / vmax * altezza;

    const parti = [apertura];
    for (let i = 0; i <= 2; i++) {
      const v = vmax * i / 2, yy = f1(y(v));
      parti.push(`<line class="griglia" x1="${MARGINI.sinistra}" x2="${W - MARGINI.destra}" y1="${yy}" y2="${yy}"/>`);
      parti.push(`<text class="asse" x="${MARGINI.sinistra - 6}" y="${yy}" text-anchor="end" dominant-baseline="middle">${esc(f1(v))}</text>`);
    }
    [t0, t0 + durata / 2, t0 + durata].forEach((t, i) => {
      parti.push(`<text class="asse" x="${f1(x(t))}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${ora(t)}</text>`);
    });
    for (const s of serie) {
      const punti = (s.punti || []).filter((p) => typeof p[1] === 'number' && isFinite(p[1]));
      if (o.barre) {
        const w = Math.max(1.5, larghezza / (durata / 1000) * 0.8);
        for (const [t, v] of punti) {
          if (v <= 0) continue;
          parti.push(`<rect class="barra ${esc(s.classe || '')}" x="${f1(x(t) - w / 2)}" y="${f1(y(v))}" width="${f1(w)}" height="${f1(y(0) - y(v))}"><title>${esc(s.nome)}: ${esc(v)} at ${ora(t)}</title></rect>`);
        }
      } else if (punti.length) {
        // dove mancano i dati (interruzioni) la linea si spezza invece di attraversare il buco
        const passi = punti.slice(1).map((p, i) => p[0] - punti[i][0]).sort((a, b) => a - b);
        const buco = Math.max(3000, 3 * (passi.length ? passi[Math.floor(passi.length / 2)] : 1000));
        let tratto = [punti[0]];
        const disegna = () => parti.push(`<polyline class="serie ${esc(s.classe || '')}" fill="none" points="${tratto.map(([t, v]) => `${f1(x(t))},${f1(y(v))}`).join(' ')}"/>`);
        for (let i = 1; i < punti.length; i++) {
          if (punti[i][0] - punti[i - 1][0] > buco) { disegna(); tratto = []; }
          tratto.push(punti[i]);
        }
        disegna();
      }
    }
    for (const l of o.linee || []) {
      const yy = f1(y(l.valore));
      parti.push(`<line class="linea-rif" x1="${MARGINI.sinistra}" x2="${W - MARGINI.destra}" y1="${yy}" y2="${yy}"/>`);
      parti.push(`<text class="etichetta-rif" x="${W - MARGINI.destra - 4}" y="${f1(y(l.valore) - 4)}" text-anchor="end">${esc(l.etichetta)}</text>`);
    }
    for (const t of o.segni || []) {
      const xx = f1(x(t));
      parti.push(`<line class="segno" x1="${xx}" x2="${xx}" y1="${MARGINI.sopra}" y2="${MARGINI.sopra + altezza}"><title>Interruption at ${ora(t)}</title></line>`);
    }
    parti.push('</svg>');
    return parti.join('');
  }

  return { NOME: 'grafici', svg };
});
