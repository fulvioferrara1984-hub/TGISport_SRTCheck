// Statistiche dal vivo: righe sintetiche di srt-live-transmit (-f -pf:json) e lettura della tabella che gli script
// stampano con --stats-table / -StatsTable. Usato dai test node e dalle prove su Windows (prova-windows.mjs).

function due(n) { return String(n).padStart(2, '0'); }

// Ora della riga: 2026-10-25 09:00:00 + t secondi, nel formato di srt-live-transmit (fuso senza i due punti).
function timepoint(t) {
  const intero = Math.floor(t);
  const totale = 9 * 3600 + intero;
  const frazione = String(Math.round((t - intero) * 1e6)).padStart(6, '0');
  return `2026-10-25T${due(Math.floor(totale / 3600))}:${due(Math.floor(totale / 60) % 60)}:${due(totale % 60)}.${frazione}+0100`;
}

// segmenti: [{ sid, da, a, passo, pacchetti, eventi? }] → righe JSONL con i contatori totali per connessione.
function genera(segmenti) {
  const inizio = {}, conti = {};
  const righe = [];
  for (const s of segmenti) {
    if (!(s.sid in inizio)) { inizio[s.sid] = s.da; conti[s.sid] = { packets: 0, lost: 0, retr: 0, dropped: 0 }; }
    const c = conti[s.sid];
    const fatti = new Set();
    for (let k = 0; s.da + k * s.passo < s.a; k++) {
      const t = s.da + k * s.passo;
      c.packets += s.pacchetti;
      const secondo = Math.floor(t);
      const e = s.eventi && s.eventi[secondo];
      if (e && !fatti.has(secondo)) {
        fatti.add(secondo);
        c.lost += e.persi || 0; c.retr += e.ritrasmessi || 0; c.dropped += e.scartati || 0;
      }
      righe.push(JSON.stringify({
        sid: s.sid, timepoint: timepoint(t), time: Math.round((t - inizio[s.sid]) * 1000),
        window: { flow: 8192, congestion: 8192, flight: 0 },
        link: { rtt: 4.27, bandwidth: 12.168, maxBandwidth: 1000 },
        send: { packets: 0, packetsUnique: 0, packetsLost: 0, packetsDropped: 0, packetsRetransmitted: 0, packetsFilterExtra: 0, bytes: 0, bytesUnique: 0, bytesDropped: 0, byteAvailBuf: 12288000, msBuf: 0, mbitRate: 0, sendPeriod: 12 },
        recv: { packets: c.packets, packetsUnique: c.packets, packetsLost: c.lost, packetsDropped: c.dropped, packetsRetransmitted: c.retr, packetsBelated: 0, packetsFilterExtra: 0, packetsFilterSupply: 0, packetsFilterLoss: 0, bytes: c.packets * 1316, bytesUnique: c.packets * 1316, bytesLost: 0, bytesDropped: 0, byteAvailBuf: 12000000, msBuf: 198, mbitRate: 4, msTsbPdDelay: 200 },
      }));
    }
  }
  return righe.join('\n') + '\n';
}

const ETICHETTE = ['Bitrate (Mb/s)', 'Packets received', 'Lost', 'Retransmitted', 'Dropped (too late)', 'Reconnections'];
const STATI = /^(OK: |Losses recovered|Packets dropped|No data)/;

// Ultima tabella del testo (l'uscita dal vivo ne contiene una al secondo): valori come stringhe.
function leggiTabella(testo) {
  const righe = String(testo).split(/\r?\n/);
  let i = -1;
  righe.forEach((r, n) => { if (r.startsWith('Connected ') || r.startsWith('Not connected yet')) i = n; });
  const t = { connesso: null, latenza: null, rtt: null, buffer: null, righe: {}, storico: null, stato: null, ultimoMessaggio: null, ultimoScarto: null };
  if (i < 0) return t;
  const prima = righe[i];
  const m = (re) => { const x = re.exec(prima); return x ? x[1] : null; };
  t.connesso = m(/^Connected (\S+)/);
  t.latenza = m(/Latency (\S+) ms/);
  t.rtt = m(/RTT (\S+) ms/);
  t.buffer = m(/Buffer (\S+) ms/);
  for (const r of righe.slice(i + 1)) {
    const pulita = r.replace(/\s+$/, '');
    if (r.startsWith('Last 60 s  ')) { t.storico = r.slice(11).padEnd(60).slice(0, 60); continue; }
    const pezzi = pulita.split(/ {2,}/);
    if (ETICHETTE.includes(pezzi[0])) { t.righe[pezzi[0]] = pezzi.slice(1); continue; }
    if (STATI.test(pulita)) { t.stato = pulita; continue; }
    if (pulita.startsWith('Last message: ')) { t.ultimoMessaggio = pulita.slice(14); continue; }
    if (pulita.startsWith('Last dropped packets: ') || pulita === 'No dropped packets so far') { t.ultimoScarto = pulita; break; }
  }
  return t;
}

function numero(s) { return Number(String(s).replace(/ /g, '')); }

const RIGHE_ATTESE = { bitrate: 'Bitrate (Mb/s)', ricevuti: 'Packets received', persi: 'Lost', ritrasmessi: 'Retransmitted', scartati: 'Dropped (too late)' };

// Differenze leggibili fra la tabella letta e i valori attesi (vuoto = uguali).
function confronta(t, atteso) {
  const diff = [];
  const controlla = (nome, letto, voluto) => {
    if (JSON.stringify(letto) !== JSON.stringify(voluto)) diff.push(`${nome}: atteso ${JSON.stringify(voluto)}, letto ${JSON.stringify(letto)}`);
  };
  for (const [chiave, voluto] of Object.entries(atteso)) {
    if (chiave in RIGHE_ATTESE) controlla(chiave, t.righe[RIGHE_ATTESE[chiave]] || null, voluto);
    else if (chiave === 'riconnessioni') controlla(chiave, (t.righe.Reconnections || [])[0] || null, voluto);
    else controlla(chiave, t[chiave], voluto);
  }
  return diff;
}

module.exports = { genera, leggiTabella, numero, confronta, timepoint };
