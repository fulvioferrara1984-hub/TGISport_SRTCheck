# SRT Check

Portale del team TGI Sport per verificare gli stream SRT: controlla e compone le stringhe `srt://`, distribuisce lo strumento di ricezione per Mac e Windows e spiega i report del test di stabilità.

L'accesso richiede la password del team: guida e strumenti sono cifrati (AES-256-GCM, chiave PBKDF2-SHA256) e si aprono solo nel browser. Stringhe, passphrase e report non lasciano mai il computer.

Il browser non può ricevere SRT (viaggia su UDP): la ricezione e le misure avvengono sul PC dell'operatore con FFmpeg e `srt-live-transmit`; il portale prepara la stringa e interpreta i risultati.

## Struttura

- `index.html`, `app/` — la pagina (nessuna libreria esterna).
- `contenuto/` — guida e pacchetti cifrati.
- `test/` — test con `node --test "test/*.test.js"`.
- `.github/workflows/windows.yml` — compila `srt-live-transmit.exe` dal codice ufficiale SRT e prova lo strumento su Windows.

`srt-live-transmit` fa parte del progetto [SRT](https://github.com/Haivision/srt) (licenza MPL-2.0).
