// Rete simulata per le prove: relay UDP fra un client SRT (caller) e un server (listener) che perde e ritarda i pacchetti.
// Uso: node .github/scripts/rete-simulata.mjs --ascolta <porta> --verso <host:porta> [--perdita <pct>] [--ritardo <ms>]
//        [--variazione <ms>] [--pausa <daS>:<perS>]
// Il ritardo vale per ogni direzione (RTT ≈ 2 × ritardo); durante la pausa si scarta tutto.
import dgram from 'node:dgram';

const opzioni = { perdita: 0, ritardo: 0, variazione: 0, pausa: null };
const arg = process.argv.slice(2);
for (let i = 0; i < arg.length; i += 2) opzioni[arg[i].replace(/^--/, '')] = arg[i + 1];
if (!opzioni.ascolta || !opzioni.verso) {
  console.error('Uso: node .github/scripts/rete-simulata.mjs --ascolta <porta> --verso <host:porta> [--perdita %] [--ritardo ms] [--variazione ms] [--pausa daS:perS]');
  process.exit(2);
}
const [hostVerso, portaVerso] = opzioni.verso.split(':');
const perdita = Number(opzioni.perdita), ritardo = Number(opzioni.ritardo), variazione = Number(opzioni.variazione);
const [pausaDa, pausaPer] = opzioni.pausa ? opzioni.pausa.split(':').map(Number) : [null, null];
const avvio = Date.now();
const conteggio = { inoltrati: 0, persi: 0, pausa: 0 };

function inPausa() {
  if (pausaDa === null) return false;
  const s = (Date.now() - avvio) / 1000;
  return s >= pausaDa && s < pausaDa + pausaPer;
}

function inoltra(socket, messaggio, porta, host) {
  if (inPausa()) { conteggio.pausa++; return; }
  if (Math.random() * 100 < perdita) { conteggio.persi++; return; }
  const attesa = Math.max(0, ritardo + (variazione ? (Math.random() * 2 - 1) * variazione : 0));
  conteggio.inoltrati++;
  if (attesa) setTimeout(() => socket.send(messaggio, porta, host), attesa);
  else socket.send(messaggio, porta, host);
}

const versoClient = dgram.createSocket('udp4');
const versoServer = dgram.createSocket('udp4');
let client = null;

versoClient.on('message', (m, info) => {
  client = info;
  inoltra(versoServer, m, Number(portaVerso), hostVerso);
});
versoServer.on('message', (m) => {
  if (client) inoltra(versoClient, m, client.port, client.address);
});
versoClient.bind(Number(opzioni.ascolta), '127.0.0.1', () => {
  console.log(`rete simulata: 127.0.0.1:${opzioni.ascolta} → ${opzioni.verso}, perdita ${perdita}%, ritardo ${ritardo}±${variazione} ms` + (pausaDa !== null ? `, pausa da ${pausaDa}s per ${pausaPer}s` : ''));
});
versoServer.bind(0, '127.0.0.1');

const fine = () => { console.log(`inoltrati ${conteggio.inoltrati}, persi ${conteggio.persi}, scartati in pausa ${conteggio.pausa}`); process.exit(0); };
process.on('SIGTERM', fine);
process.on('SIGINT', fine);
