// Prove dello strumento Windows su GitHub Actions (Windows PowerShell 5.1).
// Uso: node .github/scripts/prova-windows.mjs conversione <cartella "SRT Check">
//      node .github/scripts/prova-windows.mjs report <cartella dei report> <giudizio atteso>
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [azione, cartella, atteso] = process.argv.slice(2);
let falliti = 0;
const esito = (ok, testo) => { console.log(`${ok ? 'OK      ' : 'FALLITO '} ${testo}`); if (!ok) falliti++; };

if (azione === 'conversione') {
  const casi = JSON.parse(readFileSync(join(radice, 'test', 'dati', 'conversioni.json'), 'utf8'));
  const ps1 = join(cartella, 'SRT-Check.ps1');
  for (const [ffmpeg, slt] of casi) {
    const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-ConvertOnly', ffmpeg], { encoding: 'utf8' });
    esito(r.status === 0 && r.stdout.trim() === slt, `${ffmpeg} → ${r.stdout.trim()}${r.stderr ? ' ' + r.stderr.trim() : ''}`);
  }
  // il .bat inoltra gli argomenti allo script (stringa senza & perché passa da cmd)
  const bat = spawnSync('cmd', ['/d', '/c', join(cartella, 'SRT-Check.bat'), '-ConvertOnly', 'srt://203.0.113.10:9000?latency=2000000'], { encoding: 'utf8' });
  esito(bat.stdout.trim() === 'srt://203.0.113.10:9000?latency=2000', `SRT-Check.bat → ${bat.stdout.trim()}`);
} else if (azione === 'report') {
  const report = require(join(radice, 'app', 'report.js'));
  const file = readdirSync(cartella).filter((f) => f.endsWith('.jsonl'));
  esito(file.length === 1, `un report in ${cartella} (${file.length})`);
  if (file.length === 1) {
    const testo = readFileSync(join(cartella, file[0]), 'utf8');
    const rep = report.leggi(testo);
    const a = report.analizza(rep);
    console.log(JSON.stringify({ giudizio: a.giudizio, frasi: a.frasi.map((f) => f.codice), collegatoS: a.misure.collegatoS, bitrate: a.misure.bitrate, motivo: rep.fine && rep.fine.motivo, eventi: rep.eventi.length }));
    for (const e of rep.eventi) console.log(`  evento ${e.evento}: ${e.dettaglio}`); // già senza passphrase
    if (atteso === 'interrotto') {
      // finestra chiusa di colpo: il report c'e' gia' (senza riga "fine") e si analizza
      esito(rep.fine === null, 'report senza riga "fine"');
      esito(a.giudizio === 'stable' && a.misure.collegatoS >= 8, `giudizio ${a.giudizio}, collegato ${a.misure.collegatoS} s`);
    } else {
      esito(a.giudizio === atteso, `giudizio ${a.giudizio} (atteso ${atteso})`);
    }
    esito(rep.intestazione.sistema === 'windows', 'intestazione del report Windows');
    esito(rep.eventi.length > 0 && rep.eventi.every((e) => e.ora !== null), 'eventi presenti, tutti con l\'ora');
    esito(!/passphrase=(?!\*\*\*)/.test(testo), 'nessuna passphrase nel report');
  }
} else {
  console.error('Uso: prova-windows.mjs conversione <cartella> | report <cartella> <giudizio>');
  process.exit(2);
}
process.exit(falliti ? 1 : 0);
