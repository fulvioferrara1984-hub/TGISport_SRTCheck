// Genera report di stabilità sintetici, nello stesso formato degli script (righe JSON di srt-live-transmit -f -pf:json).
const PACCHETTO = 1316 * 8 / 1e6; // Mb per pacchetto SRT con TS

function due(n) { return String(n).padStart(2, '0'); }

// Ora locale nel formato di srt-live-transmit: 2026-10-23T14:00:01.000000+0200
function timepoint(ms) {
  const d = new Date(ms);
  const off = -d.getTimezoneOffset();
  const segno = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${due(d.getHours())}:${due(d.getMinutes())}:${due(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}000${segno}${due(Math.floor(a / 60))}${due(a % 60)}`;
}

function rigaStatistiche(sid, ms, t, cum, campione) {
  return {
    sid, timepoint: timepoint(ms), time: t,
    window: { flow: 8192, congestion: 8192, flight: 0 },
    link: { rtt: campione.rtt, bandwidth: 50, maxBandwidth: 1000 },
    send: { packets: 0, packetsUnique: 0, packetsLost: 0, packetsDropped: 0, packetsRetransmitted: 0, packetsFilterExtra: 0, bytes: 0, bytesUnique: 0, bytesDropped: 0, byteAvailBuf: 12288000, msBuf: 0, mbitRate: 0, sendPeriod: 12 },
    recv: {
      packets: cum.pacchetti, packetsUnique: cum.unici, packetsLost: cum.persi, packetsDropped: cum.scartati, packetsRetransmitted: cum.ritrasmessi,
      packetsBelated: 0, packetsFilterExtra: 0, packetsFilterSupply: 0, packetsFilterLoss: 0, bytes: cum.unici * 1316, bytesUnique: cum.unici * 1316,
      bytesLost: cum.persi * 1316, bytesDropped: cum.scartati * 1316, byteAvailBuf: 12000000, msBuf: campione.bufMs,
      mbitRate: t > 0 ? Math.round(cum.unici * 1316 * 8 / (t / 1000) / 1e6 * 1e5) / 1e5 : 0, msTsbPdDelay: campione.latenzaMs, // con -f: media dall'inizio
    },
  };
}

/**
 * opzioni: durataS, intervalloS, mbit, rtt, rttPicchi (RTT di un campione su dieci), perditaPct, scartatiAl (secondi),
 * cadute [{dopoS, perS}] (nuovo sid dopo la caduta), buchi [{dopoS, perS, conPerdite}] (nessuna riga, stesso sid),
 * zeroDa {dopoS, perS} (righe con zero pacchetti), righeFinoA (secondo dell'ultima riga), latenzaMs, senzaFine, senzaCampioni,
 * senzaDati, eventi (default true), modalita ('caller' | 'listener'), erroreEvento (dettaglio di un evento error)
 */
function creaReport(opzioni = {}) {
  const o = { durataS: 300, intervalloS: 1, mbit: 4, rtt: 30, perditaPct: 0, scartatiAl: [], cadute: [], buchi: [], latenzaMs: 200, eventi: true, ...opzioni };
  const inizio = Date.parse('2026-10-23T12:00:00Z');
  const righe = [{
    formato: 'srt-check-report', versione: 1, sistema: 'mac', inizio: timepoint(inizio), durataPrevista: o.durataS,
    stream: { host: '203.0.113.10', porta: 9000, modalita: o.modalita || 'caller', latenzaMs: o.latenzaMs, cifrato: true, pbkeylen: null, streamId: false },
  }];
  if (o.erroreEvento) righe.push({ evento: 'error', ora: timepoint(inizio + 1000), dettaglio: o.erroreEvento });
  const evento = (nome, s) => { if (o.eventi) righe.push({ evento: nome, ora: timepoint(inizio + s * 1000), dettaglio: '' }); };
  if (!o.senzaCampioni) {
    let sid = 1000, inizioConnessione = 0, cum = null, indice = 0;
    const nuovaConnessione = (s) => { sid++; inizioConnessione = s; cum = { pacchetti: 0, unici: 0, persi: 0, scartati: 0, ritrasmessi: 0 }; evento('connected', s); };
    nuovaConnessione(0);
    let inCaduta = false;
    for (let s = o.intervalloS; s <= o.durataS + 1e-9; s += o.intervalloS) {
      const caduta = o.cadute.find((c) => s > c.dopoS && s <= c.dopoS + c.perS);
      if (caduta) {
        if (!inCaduta) evento('disconnected', caduta.dopoS);
        inCaduta = true;
        continue;
      }
      if (inCaduta) { nuovaConnessione(s - o.intervalloS); inCaduta = false; }
      if (o.righeFinoA !== undefined && s > o.righeFinoA) break;
      const buco = o.buchi.find((b) => s > b.dopoS && s <= b.dopoS + b.perS);
      if (buco) continue;
      const dopoBuco = o.buchi.find((b) => b.conPerdite && s - o.intervalloS <= b.dopoS + b.perS && s > b.dopoS + b.perS);
      const zero = o.zeroDa && s > o.zeroDa.dopoS && s <= o.zeroDa.dopoS + o.zeroDa.perS;
      const pacchetti = o.senzaDati || zero ? 0 : Math.round(o.mbit * o.intervalloS / PACCHETTO);
      const persi = Math.round(pacchetti * o.perditaPct / 100) + (dopoBuco ? 200 : 0);
      const scartati = (o.scartatiAl.includes(Math.round(s)) ? 5 : 0) + (dopoBuco ? 150 : 0);
      cum.pacchetti += pacchetti + persi - scartati;
      cum.unici += pacchetti;
      cum.persi += persi;
      cum.scartati += scartati;
      cum.ritrasmessi += persi - scartati;
      indice++;
      const rtt = o.rttPicchi && indice % 10 === 0 ? o.rttPicchi : o.rtt;
      const mbit = o.senzaDati || zero ? 0 : o.mbit;
      righe.push(rigaStatistiche(sid, inizio + s * 1000, Math.round((s - inizioConnessione) * 1000), { ...cum }, { rtt, mbit, bufMs: o.latenzaMs - 20, latenzaMs: o.latenzaMs }));
    }
  }
  if (!o.senzaFine) righe.push({ fine: timepoint(inizio + o.durataS * 1000), motivo: 'time' });
  return { testo: righe.map((r) => JSON.stringify(r)).join('\n') + '\n', inizio };
}

module.exports = { creaReport, timepoint };
