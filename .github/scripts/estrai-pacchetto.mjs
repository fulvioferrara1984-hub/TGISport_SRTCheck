// Decifra ed estrae uno dei pacchetti di contenuto/pacchetti.js per la prova su Windows (GitHub Actions).
// Uso: SRT_CHECK_PASSWORD=… node .github/scripts/estrai-pacchetto.mjs mac|windows <cartella>
// La password arriva solo dalla variabile d'ambiente (secret di GitHub) e non viene mai stampata.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cifratura = require(join(radice, 'app', 'cifratura.js'));

const [sistema, cartella] = process.argv.slice(2);
const password = process.env.SRT_CHECK_PASSWORD;
if (!['mac', 'windows'].includes(sistema) || !cartella) {
  console.error('Uso: node .github/scripts/estrai-pacchetto.mjs mac|windows <cartella>');
  process.exit(2);
}
if (!password) {
  console.error('Manca la variabile SRT_CHECK_PASSWORD.');
  process.exit(1);
}

const contesto = { self: {} };
vm.runInNewContext(readFileSync(join(process.env.SC_CONTENUTO || join(radice, 'contenuto'), 'pacchetti.js'), 'utf8'), contesto);
const pacchetti = contesto.self.SC_PACCHETTI;
const chiave = await cifratura.derivaChiave(password, pacchetti.protezione.sale, pacchetti.protezione.iterazioni);
if (!(await cifratura.chiaveValida(chiave, pacchetti.protezione))) {
  console.error('La password non apre il contenuto cifrato.');
  process.exit(1);
}
const zip = Buffer.from(await cifratura.decifraBytes(chiave, pacchetti[sistema]));
const sha = createHash('sha256').update(zip).digest('hex');
if (sha !== pacchetti.sha256[sistema]) {
  console.error('Lo zip decifrato non corrisponde allo SHA-256 registrato.');
  process.exit(1);
}
mkdirSync(cartella, { recursive: true });
const fileZip = join(cartella, pacchetti.nomi[sistema]);
writeFileSync(fileZip, zip);
if (process.platform === 'win32') execFileSync('tar', ['-xf', fileZip, '-C', cartella]);
else execFileSync('ditto', ['-x', '-k', fileZip, cartella]);
console.log(`${pacchetti.nomi[sistema]} estratto in ${cartella} (SHA-256 ${sha})`);
