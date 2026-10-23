/* SRT Check — accesso con la password del team. */
(function (SC) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const CHIAVE_RICORDATA = 'chiave-team';

  // La chiave (non esportabile) può restare nel browser, così la password si scrive una volta sola.
  async function chiaveRicordata(protezione) {
    const r = await SC.archivio.leggi(CHIAVE_RICORDATA);
    if (r && r.chiave && r.sale === protezione.sale && (await SC.cifratura.chiaveValida(r.chiave, protezione))) return r.chiave;
    return null;
  }

  async function ricorda(chiave, protezione, si) {
    await SC.archivio.scrivi(CHIAVE_RICORDATA, si ? { chiave, sale: protezione.sale } : null);
  }

  function chiediPassword(protezione) {
    return new Promise((fatto) => {
      const box = $('accesso'), form = $('accesso-form'), campo = $('accesso-password');
      const errore = $('accesso-errore'), bottone = $('accesso-entra');
      box.hidden = false;
      box.classList.remove('in-attesa');
      requestAnimationFrame(() => campo.focus());
      const invio = async (e) => {
        e.preventDefault();
        if (!campo.value) return;
        bottone.disabled = true;
        bottone.textContent = 'Checking…';
        errore.hidden = true;
        try {
          const chiave = await SC.cifratura.derivaChiave(campo.value, protezione.sale, protezione.iterazioni);
          if (!(await SC.cifratura.chiaveValida(chiave, protezione))) {
            errore.textContent = 'Wrong password.';
            errore.hidden = false;
            campo.select();
            return;
          }
          await ricorda(chiave, protezione, $('accesso-ricorda').checked);
          form.removeEventListener('submit', invio);
          campo.value = '';
          box.hidden = true;
          fatto(chiave);
        } catch (err) {
          errore.textContent = 'Sign-in failed: ' + err.message;
          errore.hidden = false;
        } finally {
          bottone.disabled = false;
          bottone.textContent = 'Sign in';
        }
      };
      form.addEventListener('submit', invio);
    });
  }

  function blocca(messaggio) {
    $('accesso').classList.remove('in-attesa');
    $('accesso-form').innerHTML = '';
    const p = document.createElement('p');
    p.className = 'errore';
    p.textContent = messaggio;
    $('accesso-form').appendChild(p);
    return new Promise(() => {});
  }

  // Si risolve con la chiave del team quando si può usare il portale.
  async function sblocca() {
    const protezione = SC.contenuto.protezione();
    if (!protezione) return blocca('The protected content is missing: SRT Check cannot start.');
    if (!SC.cifratura.disponibile()) return blocca('This browser cannot open the protected content. Please use an up-to-date browser.');
    let chiave = null;
    try { chiave = await chiaveRicordata(protezione); } catch (e) { chiave = null; }
    if (chiave) $('accesso').hidden = true;
    else chiave = await chiediPassword(protezione);
    return chiave;
  }

  async function esci() {
    await SC.archivio.scrivi(CHIAVE_RICORDATA, null);
    location.reload();
  }

  SC.accesso = { sblocca, esci };
})(window.SC = window.SC || {});
