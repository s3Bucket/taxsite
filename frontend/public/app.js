(function () {
  async function safeJson(response) {
    try {
      return await response.json();
    } catch (_) {
      return null;
    }
  }

  async function requireAuth(options = {}) {
    const { redirect = true } = options;

    try {
      const res = await fetch('/api/auth/check', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        if (redirect) {
          window.location.href = '/index.html';
        }
        return null;
      }

      return await safeJson(res);
    } catch (_) {
      if (redirect) {
        window.location.href = '/index.html';
      }
      return null;
    }
  }

  async function redirectIfAuthenticated(target = '/portal.html') {
    const auth = await requireAuth({ redirect: false });
    if (auth) {
      window.location.href = target;
    }
  }

  async function logout() {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (_) {
      // ignore
    }

    window.location.href = '/index.html';
  }

  async function submitMultipartForm(formName, fields, fileFields = [], msgId = 'msg') {
    const msg = document.getElementById(msgId);
    if (msg) {
      msg.textContent = '';
      msg.classList.remove('success');
    }

    try {
      const formData = new FormData();
      formData.append('form_name', formName);
      formData.append('data', JSON.stringify(fields || {}));

      for (const entry of fileFields) {
        const input = document.getElementById(entry.id);
        if (!input || !input.files || input.files.length === 0) continue;

        for (const file of input.files) {
          formData.append(entry.fieldName, file);
        }
      }

      const res = await fetch('/api/forms/submit', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      const data = await safeJson(res);

      if (!res.ok) {
        if (msg) {
          msg.textContent = data?.detail || data?.message || 'Senden fehlgeschlagen.';
        }
        return false;
      }

      if (msg) {
        msg.textContent = data?.message || 'Daten erfolgreich gesendet.';
        msg.classList.add('success');
      }

      return true;
    } catch (_) {
      if (msg) {
        msg.textContent = 'Server nicht erreichbar.';
      }
      return false;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
  }

  window.requireAuth = requireAuth;
  window.redirectIfAuthenticated = redirectIfAuthenticated;
  window.logout = logout;
  window.submitMultipartForm = submitMultipartForm;

  window.portalPageInits = window.portalPageInits || {};

  window.portalPageInits['/naturliche-person.html'] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) {
      const userInfo = document.getElementById('userInfo');
      if (userInfo) userInfo.innerText = 'Eingeloggt als: ' + auth.user;
    }

    // childUidCounter only ever goes up – gives each card a stable unique DOM id.
    // The visible number (Kind 1, Kind 2 …) is always recalculated from DOM position.
    let childUidCounter = 0;

    function renumberChildren() {
      document.querySelectorAll('#childrenContainer .child-card').forEach((card, i) => {
        const n = i + 1;
        const heading = card.querySelector('.child-heading');
        if (heading) heading.textContent = 'Kind ' + n;
        const fileLabel = card.querySelector('.child-file-label');
        if (fileLabel) fileLabel.textContent = 'Personalausweis / Ausweisdokument Kind ' + n;
      });
    }

    window.addChild = function (prefill = {}) {
      childUidCounter += 1;
      const uid = childUidCounter;

      const container = document.getElementById('childrenContainer');
      if (!container) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'child-card';
      wrapper.id = `child-card-${uid}`;

      wrapper.innerHTML = `
        <h4 class="child-heading">Kind</h4>
        <div class="form-row">
          <div>
            <label>Name</label>
            <input id="kind_name_${uid}" type="text" value="${escapeHtml(prefill.name)}">
          </div>
          <div>
            <label>Geburtsdatum</label>
            <input id="kind_geburt_${uid}" type="date" value="${escapeHtml(prefill.geburtsdatum)}">
          </div>
        </div>
        <div class="form-row">
          <div>
            <label>Wohnort</label>
            <input id="kind_wohnort_${uid}" type="text" value="${escapeHtml(prefill.wohnort)}">
          </div>
          <div>
            <label>Identifikationsnummer</label>
            <input id="kind_ident_${uid}" type="text" value="${escapeHtml(prefill.identifikationsnummer)}">
          </div>
        </div>
        <div class="form-row">
          <div>
            <label>Leiblicher Vater</label>
            <input id="kind_vater_${uid}" type="text" value="${escapeHtml(prefill.leiblicher_vater)}">
          </div>
          <div>
            <label>Leibliche Mutter</label>
            <input id="kind_mutter_${uid}" type="text" value="${escapeHtml(prefill.leibliche_mutter)}">
          </div>
        </div>
        <label class="child-file-label">Personalausweis / Ausweisdokument Kind</label>
        <input id="doc_kind_personalausweis_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
        <div class="inline-actions">
          <button type="button" class="btn btn-danger" onclick="removeChildEntry(${uid})">Eintrag entfernen</button>
        </div>
      `;

      container.appendChild(wrapper);
      renumberChildren();
    };

    window.removeChildEntry = function (uid) {
      const el = document.getElementById(`child-card-${uid}`);
      if (!el) return;

      el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      el.style.opacity = '0';
      el.style.transform = 'scale(0.98)';

      setTimeout(() => { el.remove(); renumberChildren(); }, 200);
    };

    window.submitPage = async function () {
      const childCards = Array.from(document.querySelectorAll('#childrenContainer .child-card'));

      const children = childCards.map((card, index) => {
        const uid = card.id.replace('child-card-', '');
        return {
          name: document.getElementById(`kind_name_${uid}`)?.value || '',
          geburtsdatum: document.getElementById(`kind_geburt_${uid}`)?.value || '',
          wohnort: document.getElementById(`kind_wohnort_${uid}`)?.value || '',
          leiblicher_vater: document.getElementById(`kind_vater_${uid}`)?.value || '',
          leibliche_mutter: document.getElementById(`kind_mutter_${uid}`)?.value || '',
          identifikationsnummer: document.getElementById(`kind_ident_${uid}`)?.value || '',
          upload_field_id: `doc_kind_personalausweis_${uid}`,
          field_index: index + 1
        };
      });

      const fields = {
        ehepartner1: {
          anrede: document.getElementById('anrede1')?.value || '',
          titel: document.getElementById('titel1')?.value || '',
          vorname: document.getElementById('vorname1')?.value || '',
          nachname: document.getElementById('nachname1')?.value || '',
          strasse_hausnummer: document.getElementById('strasse1')?.value || '',
          plz: document.getElementById('plz1')?.value || '',
          ort: document.getElementById('ort1')?.value || '',
          telefon: document.getElementById('telefon1')?.value || '',
          mobil: document.getElementById('mobil1')?.value || '',
          email: document.getElementById('email1')?.value || '',
          bankverbindung: document.getElementById('bank1')?.value || '',
          steuernummer: document.getElementById('steuer1')?.value || '',
          geburtsdatum: document.getElementById('geburt1')?.value || '',
          familienstand: document.getElementById('familienstand1')?.value || '',
          staatsangehoerigkeit: document.getElementById('staat1')?.value || '',
          religionszugehoerigkeit: document.getElementById('religion1')?.value || '',
          geschlecht: document.getElementById('geschlecht1')?.value || '',
          beruf: document.getElementById('beruf1')?.value || '',
          bundesland: document.getElementById('bundesland1')?.value || '',
          identifikationsnummer: document.getElementById('ident1')?.value || ''
        },
        ehepartner2: {
          anrede: document.getElementById('anrede2')?.value || '',
          titel: document.getElementById('titel2')?.value || '',
          vorname: document.getElementById('vorname2')?.value || '',
          nachname: document.getElementById('nachname2')?.value || '',
          strasse_hausnummer: document.getElementById('strasse2')?.value || '',
          plz: document.getElementById('plz2')?.value || '',
          ort: document.getElementById('ort2')?.value || '',
          telefon: document.getElementById('telefon2')?.value || '',
          mobil: document.getElementById('mobil2')?.value || '',
          email: document.getElementById('email2')?.value || '',
          bankverbindung: document.getElementById('bank2')?.value || '',
          steuernummer: document.getElementById('steuer2')?.value || '',
          geburtsdatum: document.getElementById('geburt2')?.value || '',
          familienstand: document.getElementById('familienstand2')?.value || '',
          staatsangehoerigkeit: document.getElementById('staat2')?.value || '',
          religionszugehoerigkeit: document.getElementById('religion2')?.value || '',
          geschlecht: document.getElementById('geschlecht2')?.value || '',
          beruf: document.getElementById('beruf2')?.value || '',
          bundesland: document.getElementById('bundesland2')?.value || '',
          identifikationsnummer: document.getElementById('ident2')?.value || ''
        },
        kinder: children.map(child => ({
          name: child.name,
          geburtsdatum: child.geburtsdatum,
          wohnort: child.wohnort,
          leiblicher_vater: child.leiblicher_vater,
          leibliche_mutter: child.leibliche_mutter,
          identifikationsnummer: child.identifikationsnummer
        }))
      };

      const fileFields = [
        { id: 'doc_personalausweis_ep1', fieldName: 'personalausweis_ehepartner_1' },
        { id: 'doc_personalausweis_ep2', fieldName: 'personalausweis_ehepartner_2' },
        ...children.map(child => ({
          id: child.upload_field_id,
          fieldName: `personalausweis_kind_${child.field_index}`
        }))
      ];

      await submitMultipartForm('naturliche_person', fields, fileFields);
    };

    const container = document.getElementById('childrenContainer');
    if (container && container.children.length === 0) {
      window.addChild();
    }
  };

  // ── Helper: builds a generic "person card" manager ───────────────────
  // config: { prefix, containerSelector, label, addFn, removeFn }
  function makePersonManager(config) {
    const { prefix, containerSelector, label, fileLabelText } = config;
    let uidCounter = 0;

    function renumber() {
      document.querySelectorAll(`${containerSelector} .child-card`).forEach((card, i) => {
        const n = i + 1;
        const h = card.querySelector('.person-heading');
        if (h) h.textContent = label + ' ' + n;
        const fl = card.querySelector('.person-file-label');
        if (fl) fl.textContent = (fileLabelText || 'Personalausweis') + ' ' + n;
      });
    }

    function add(prefill = {}, extraFields = '') {
      uidCounter += 1;
      const uid = uidCounter;
      const container = document.querySelector(containerSelector);
      if (!container) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'child-card';
      wrapper.id = `${prefix}-card-${uid}`;

      wrapper.innerHTML = `
        <h4 class="person-heading">${label}</h4>
        ${extraFields(uid, prefill)}
        <label>Personalausweis</label>
        <input id="doc_personalausweis_${prefix}_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
        <div class="inline-actions">
          <button type="button" class="btn btn-danger" onclick="${config.removeFnName}(${uid})">Eintrag entfernen</button>
        </div>
      `;

      container.appendChild(wrapper);
      renumber();
    }

    function remove(uid) {
      const el = document.getElementById(`${prefix}-card-${uid}`);
      if (!el) return;
      el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      el.style.opacity = '0';
      el.style.transform = 'scale(0.98)';
      setTimeout(() => { el.remove(); renumber(); }, 200);
    }

    function collect() {
      return Array.from(document.querySelectorAll(`${containerSelector} .child-card`))
        .map((card, index) => {
          const uid = card.id.replace(`${prefix}-card-`, '');
          return { uid, field_index: index + 1, upload_field_id: `doc_personalausweis_${prefix}_${uid}` };
        });
    }

    return { add, remove, collect, renumber };
  }

  // ── GbR ───────────────────────────────────────────────────────────────
  window.portalPageInits = window.portalPageInits || {};

  window.portalPageInits["/gbr.html"] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) {
      const el = document.getElementById("userInfo");
      if (el) el.innerText = "Eingeloggt als: " + auth.user;
    }

    let gUid = 0;

    function renumberGesellschafter() {
      document.querySelectorAll('#gesellschafterContainer .child-card').forEach((card, i) => {
        const h = card.querySelector('.person-heading');
        if (h) h.textContent = 'Gesellschafter ' + (i + 1);
      });
    }

    window.addGesellschafter = function (prefill = {}) {
      gUid += 1;
      const uid = gUid;
      const container = document.getElementById('gesellschafterContainer');
      if (!container) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'child-card';
      wrapper.id = `gesellschafter-card-${uid}`;
      wrapper.innerHTML = `
        <h4 class="person-heading">Gesellschafter</h4>
        <div class="form-row">
          <div><label>Vorname</label><input id="gesellschafter_vorname_${uid}" type="text" value="${escapeHtml(prefill.vorname)}"></div>
          <div><label>Nachname</label><input id="gesellschafter_nachname_${uid}" type="text" value="${escapeHtml(prefill.nachname)}"></div>
        </div>
        <div class="form-row">
          <div><label>E-Mail</label><input id="gesellschafter_email_${uid}" type="email" value="${escapeHtml(prefill.email)}"></div>
          <div><label>Telefon</label><input id="gesellschafter_telefon_${uid}" type="tel" value="${escapeHtml(prefill.telefon)}"></div>
        </div>
        <label>Adresse</label><input id="gesellschafter_adresse_${uid}" type="text" value="${escapeHtml(prefill.adresse)}">
        <label>Personalausweis</label>
        <input id="doc_personalausweis_gesellschafter_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
        <div class="inline-actions">
          <button type="button" class="btn btn-danger" onclick="removeGesellschafter(${uid})">Eintrag entfernen</button>
        </div>`;
      container.appendChild(wrapper);
      renumberGesellschafter();
    };

    window.removeGesellschafter = function (uid) {
      const el = document.getElementById(`gesellschafter-card-${uid}`);
      if (!el) return;
      el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      el.style.opacity = '0'; el.style.transform = 'scale(0.98)';
      setTimeout(() => { el.remove(); renumberGesellschafter(); }, 200);
    };

    window.submitPage = async function () {
      const gesellschafter = Array.from(document.querySelectorAll('#gesellschafterContainer .child-card'))
        .map((card, index) => {
          const uid = card.id.replace('gesellschafter-card-', '');
          return {
            vorname: document.getElementById(`gesellschafter_vorname_${uid}`)?.value || '',
            nachname: document.getElementById(`gesellschafter_nachname_${uid}`)?.value || '',
            email: document.getElementById(`gesellschafter_email_${uid}`)?.value || '',
            telefon: document.getElementById(`gesellschafter_telefon_${uid}`)?.value || '',
            adresse: document.getElementById(`gesellschafter_adresse_${uid}`)?.value || '',
            upload_field_id: `doc_personalausweis_gesellschafter_${uid}`,
            field_index: index + 1
          };
        });

      const fields = {
        anrede: document.getElementById("anrede")?.value || "",
        unternehmensname: document.getElementById("unternehmensname")?.value || "",
        unternehmensform: document.getElementById("unternehmensform")?.value || "",
        strasse_hausnummer: document.getElementById("strasse")?.value || "",
        plz: document.getElementById("plz")?.value || "",
        ort: document.getElementById("ort")?.value || "",
        telefon: document.getElementById("telefon")?.value || "",
        mobil: document.getElementById("mobil")?.value || "",
        email: document.getElementById("email")?.value || "",
        bankverbindung: document.getElementById("bankverbindung")?.value || "",
        steuernummer: document.getElementById("steuernummer")?.value || "",
        unternehmensgegenstand: document.getElementById("gegenstand")?.value || "",
        gruendungsdatum: document.getElementById("gruendungsdatum")?.value || "",
        ust_idnr: document.getElementById("ustid")?.value || "",
        bundesland: document.getElementById("bundesland")?.value || "",
        ist_soll_versteuerung: document.getElementById("versteuerung")?.value || "",
        voranmeldungszeitraum: document.getElementById("voranmeldung")?.value || "",
        bilanz_oder_gewinnermittler: document.getElementById("bilanz")?.value || "",
        gesellschafter: gesellschafter.map(({ vorname, nachname, email, telefon, adresse }) =>
          ({ vorname, nachname, email, telefon, adresse }))
      };

      const fileFields = [
        ...gesellschafter.map(item => ({ id: item.upload_field_id, fieldName: `personalausweis_gesellschafter_${item.field_index}` })),
        { id: "doc_gewerbeanmeldung", fieldName: "gewerbeanmeldung" }
      ];

      await submitMultipartForm("gbr", fields, fileFields);
    };

    const c = document.getElementById("gesellschafterContainer");
    if (c && c.children.length === 0) window.addGesellschafter();
  };

  // ── GmbH ──────────────────────────────────────────────────────────────
  window.portalPageInits = window.portalPageInits || {};

  window.portalPageInits["/gmbh.html"] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) {
      const el = document.getElementById("userInfo");
      if (el) el.innerText = "Eingeloggt als: " + auth.user;
    }

    let gfUid = 0, gsUid = 0;

    function renumberGf() {
      document.querySelectorAll('#geschaeftsfuehrerContainer .child-card').forEach((card, i) => {
        const h = card.querySelector('.person-heading');
        if (h) h.textContent = 'Geschäftsführer ' + (i + 1);
      });
    }
    function renumberGs() {
      document.querySelectorAll('#gesellschafterContainer .child-card').forEach((card, i) => {
        const h = card.querySelector('.person-heading');
        if (h) h.textContent = 'Gesellschafter ' + (i + 1);
      });
    }

    window.addGeschaeftsfuehrer = function (prefill = {}) {
      gfUid += 1;
      const uid = gfUid;
      const container = document.getElementById('geschaeftsfuehrerContainer');
      if (!container) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'child-card';
      wrapper.id = `geschaeftsfuehrer-card-${uid}`;
      wrapper.innerHTML = `
        <h4 class="person-heading">Geschäftsführer</h4>
        <label>Name</label><input id="geschaeftsfuehrer_name_${uid}" type="text" value="${escapeHtml(prefill.name)}">
        <label>Adresse</label><input id="geschaeftsfuehrer_adresse_${uid}" type="text" value="${escapeHtml(prefill.adresse)}">
        <label>Personalausweis</label>
        <input id="doc_personalausweis_geschaeftsfuehrer_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
        <div class="inline-actions">
          <button type="button" class="btn btn-danger" onclick="removeGeschaeftsfuehrer(${uid})">Eintrag entfernen</button>
        </div>`;
      container.appendChild(wrapper);
      renumberGf();
    };

    window.removeGeschaeftsfuehrer = function (uid) {
      const el = document.getElementById(`geschaeftsfuehrer-card-${uid}`);
      if (!el) return;
      el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      el.style.opacity = '0'; el.style.transform = 'scale(0.98)';
      setTimeout(() => { el.remove(); renumberGf(); }, 200);
    };

    window.addGesellschafter = function (prefill = {}) {
      gsUid += 1;
      const uid = gsUid;
      const container = document.getElementById('gesellschafterContainer');
      if (!container) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'child-card';
      wrapper.id = `gesellschafter-card-${uid}`;
      wrapper.innerHTML = `
        <h4 class="person-heading">Gesellschafter</h4>
        <label>Name</label><input id="gesellschafter_name_${uid}" type="text" value="${escapeHtml(prefill.name)}">
        <label>Adresse</label><input id="gesellschafter_adresse_${uid}" type="text" value="${escapeHtml(prefill.adresse)}">
        <label>Personalausweis</label>
        <input id="doc_personalausweis_gesellschafter_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
        <div class="inline-actions">
          <button type="button" class="btn btn-danger" onclick="removeGesellschafter(${uid})">Eintrag entfernen</button>
        </div>`;
      container.appendChild(wrapper);
      renumberGs();
    };

    window.removeGesellschafter = function (uid) {
      const el = document.getElementById(`gesellschafter-card-${uid}`);
      if (!el) return;
      el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      el.style.opacity = '0'; el.style.transform = 'scale(0.98)';
      setTimeout(() => { el.remove(); renumberGs(); }, 200);
    };

    window.submitPage = async function () {
      const geschaeftsfuehrer = Array.from(document.querySelectorAll('#geschaeftsfuehrerContainer .child-card'))
        .map((card, index) => {
          const uid = card.id.replace('geschaeftsfuehrer-card-', '');
          return { name: document.getElementById(`geschaeftsfuehrer_name_${uid}`)?.value || '', adresse: document.getElementById(`geschaeftsfuehrer_adresse_${uid}`)?.value || '', upload_field_id: `doc_personalausweis_geschaeftsfuehrer_${uid}`, field_index: index + 1 };
        });

      const gesellschafter = Array.from(document.querySelectorAll('#gesellschafterContainer .child-card'))
        .map((card, index) => {
          const uid = card.id.replace('gesellschafter-card-', '');
          return { name: document.getElementById(`gesellschafter_name_${uid}`)?.value || '', adresse: document.getElementById(`gesellschafter_adresse_${uid}`)?.value || '', upload_field_id: `doc_personalausweis_gesellschafter_${uid}`, field_index: index + 1 };
        });

      const fields = {
        anrede: document.getElementById("anrede")?.value || "", unternehmensname: document.getElementById("unternehmensname")?.value || "", unternehmensform: document.getElementById("unternehmensform")?.value || "", strasse_hausnummer: document.getElementById("strasse")?.value || "", plz: document.getElementById("plz")?.value || "", ort: document.getElementById("ort")?.value || "", telefon: document.getElementById("telefon")?.value || "", mobil: document.getElementById("mobil")?.value || "", email: document.getElementById("email")?.value || "", bankverbindung: document.getElementById("bankverbindung")?.value || "", steuernummer: document.getElementById("steuernummer")?.value || "", unternehmensgegenstand: document.getElementById("gegenstand")?.value || "", gruendungsdatum: document.getElementById("gruendungsdatum")?.value || "", ust_idnr: document.getElementById("ustid")?.value || "", bundesland: document.getElementById("bundesland")?.value || "", ist_soll_versteuerung: document.getElementById("versteuerung")?.value || "", voranmeldungszeitraum: document.getElementById("voranmeldung")?.value || "", bilanz_oder_gewinnermittler: document.getElementById("bilanz")?.value || "",
        geschaeftsfuehrer: geschaeftsfuehrer.map(({ name, adresse }) => ({ name, adresse })),
        gesellschafter: gesellschafter.map(({ name, adresse }) => ({ name, adresse }))
      };

      const fileFields = [
        ...geschaeftsfuehrer.map(item => ({ id: item.upload_field_id, fieldName: `personalausweis_geschaeftsfuehrer_${item.field_index}` })),
        ...gesellschafter.map(item => ({ id: item.upload_field_id, fieldName: `personalausweis_gesellschafter_${item.field_index}` })),
        { id: "doc_handelsregister", fieldName: "handelsregisterauszug" },
        { id: "doc_gewerbeanmeldung", fieldName: "gewerbeanmeldung" }
      ];

      await submitMultipartForm("gmbh", fields, fileFields);
    };

    const gfC = document.getElementById("geschaeftsfuehrerContainer");
    const gsC = document.getElementById("gesellschafterContainer");
    if (gfC && gfC.children.length === 0) window.addGeschaeftsfuehrer();
    if (gsC && gsC.children.length === 0) window.addGesellschafter();
  };

  // ── KG / OHG ─────────────────────────────────────────────────────────
  window.portalPageInits = window.portalPageInits || {};

  window.portalPageInits["/kg-ohg.html"] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) {
      const el = document.getElementById("userInfo");
      if (el) el.innerText = "Eingeloggt als: " + auth.user;
    }

    let kUid = 0;

    function renumberKommanditisten() {
      document.querySelectorAll('#kommanditistenContainer .child-card').forEach((card, i) => {
        const h = card.querySelector('.person-heading');
        if (h) h.textContent = 'Kommanditist ' + (i + 1);
      });
    }

    window.addKommanditist = function (prefill = {}) {
      kUid += 1;
      const uid = kUid;
      const container = document.getElementById('kommanditistenContainer');
      if (!container) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'child-card';
      wrapper.id = `kommanditist-card-${uid}`;
      wrapper.innerHTML = `
        <h4 class="person-heading">Kommanditist</h4>
        <label>Name</label><input id="kommanditist_name_${uid}" type="text" value="${escapeHtml(prefill.name)}">
        <label>Personalausweis</label>
        <input id="doc_personalausweis_kommanditist_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
        <div class="inline-actions">
          <button type="button" class="btn btn-danger" onclick="removeKommanditist(${uid})">Eintrag entfernen</button>
        </div>`;
      container.appendChild(wrapper);
      renumberKommanditisten();
    };

    window.removeKommanditist = function (uid) {
      const el = document.getElementById(`kommanditist-card-${uid}`);
      if (!el) return;
      el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      el.style.opacity = '0'; el.style.transform = 'scale(0.98)';
      setTimeout(() => { el.remove(); renumberKommanditisten(); }, 200);
    };

    window.submitPage = async function () {
      const kommanditisten = Array.from(document.querySelectorAll('#kommanditistenContainer .child-card'))
        .map((card, index) => {
          const uid = card.id.replace('kommanditist-card-', '');
          return { name: document.getElementById(`kommanditist_name_${uid}`)?.value || '', upload_field_id: `doc_personalausweis_kommanditist_${uid}`, field_index: index + 1 };
        });

      const fields = {
        anrede: document.getElementById("anrede")?.value || "", unternehmensname: document.getElementById("unternehmensname")?.value || "", unternehmensform: document.getElementById("unternehmensform")?.value || "", strasse_hausnummer: document.getElementById("strasse")?.value || "", plz: document.getElementById("plz")?.value || "", ort: document.getElementById("ort")?.value || "", telefon: document.getElementById("telefon")?.value || "", mobil: document.getElementById("mobil")?.value || "", email: document.getElementById("email")?.value || "", bankverbindung: document.getElementById("bankverbindung")?.value || "", steuernummer: document.getElementById("steuernummer")?.value || "", unternehmensgegenstand: document.getElementById("gegenstand")?.value || "", gruendungsdatum: document.getElementById("gruendungsdatum")?.value || "", ust_idnr: document.getElementById("ustid")?.value || "", bundesland: document.getElementById("bundesland")?.value || "", ist_soll_versteuerung: document.getElementById("versteuerung")?.value || "", voranmeldungszeitraum: document.getElementById("voranmeldung")?.value || "", bilanz_oder_gewinnermittler: document.getElementById("bilanz")?.value || "",
        komplementaer: { name: document.getElementById("komplementaer_name")?.value || "" },
        kommanditisten: kommanditisten.map(({ name }) => ({ name }))
      };

      const fileFields = [
        { id: "doc_personalausweis_komplementaer", fieldName: "personalausweis_komplementaer" },
        ...kommanditisten.map(item => ({ id: item.upload_field_id, fieldName: `personalausweis_kommanditist_${item.field_index}` })),
        { id: "doc_gewerbeanmeldung", fieldName: "gewerbeanmeldung" }
      ];

      await submitMultipartForm("kg_ohg", fields, fileFields);
    };

    const c = document.getElementById("kommanditistenContainer");
    if (c && c.children.length === 0) window.addKommanditist();
  };

  // ── eG ───────────────────────────────────────────────────────────────
  window.portalPageInits = window.portalPageInits || {};

  window.portalPageInits["/eg.html"] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) {
      const el = document.getElementById("userInfo");
      if (el) el.innerText = "Eingeloggt als: " + auth.user;
    }

    let vUid = 0;

    function renumberVorstand() {
      document.querySelectorAll('#vorstandContainer .child-card').forEach((card, i) => {
        const h = card.querySelector('.person-heading');
        if (h) h.textContent = 'Vorstandsmitglied ' + (i + 1);
      });
    }

    window.addVorstand = function (prefill = {}) {
      vUid += 1;
      const uid = vUid;
      const container = document.getElementById('vorstandContainer');
      if (!container) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'child-card';
      wrapper.id = `vorstand-card-${uid}`;
      wrapper.innerHTML = `
        <h4 class="person-heading">Vorstandsmitglied</h4>
        <label>Name</label><input id="vorstand_name_${uid}" type="text" value="${escapeHtml(prefill.name)}">
        <label>Personalausweis</label>
        <input id="doc_personalausweis_vorstand_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
        <div class="inline-actions">
          <button type="button" class="btn btn-danger" onclick="removeVorstand(${uid})">Eintrag entfernen</button>
        </div>`;
      container.appendChild(wrapper);
      renumberVorstand();
    };

    window.removeVorstand = function (uid) {
      const el = document.getElementById(`vorstand-card-${uid}`);
      if (!el) return;
      el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      el.style.opacity = '0'; el.style.transform = 'scale(0.98)';
      setTimeout(() => { el.remove(); renumberVorstand(); }, 200);
    };

    window.submitPage = async function () {
      const vorstand = Array.from(document.querySelectorAll('#vorstandContainer .child-card'))
        .map((card, index) => {
          const uid = card.id.replace('vorstand-card-', '');
          return { name: document.getElementById(`vorstand_name_${uid}`)?.value || '', upload_field_id: `doc_personalausweis_vorstand_${uid}`, field_index: index + 1 };
        });

      const fields = {
        anrede: document.getElementById("anrede")?.value || "", unternehmensname: document.getElementById("unternehmensname")?.value || "", unternehmensform: document.getElementById("unternehmensform")?.value || "", strasse_hausnummer: document.getElementById("strasse")?.value || "", plz: document.getElementById("plz")?.value || "", ort: document.getElementById("ort")?.value || "", telefon: document.getElementById("telefon")?.value || "", mobil: document.getElementById("mobil")?.value || "", email: document.getElementById("email")?.value || "", bankverbindung: document.getElementById("bankverbindung")?.value || "", steuernummer: document.getElementById("steuernummer")?.value || "", unternehmensgegenstand: document.getElementById("gegenstand")?.value || "", gruendungsdatum: document.getElementById("gruendungsdatum")?.value || "", ust_idnr: document.getElementById("ustid")?.value || "", bundesland: document.getElementById("bundesland")?.value || "", ist_soll_versteuerung: document.getElementById("versteuerung")?.value || "", voranmeldungszeitraum: document.getElementById("voranmeldung")?.value || "", bilanz_oder_gewinnermittler: document.getElementById("bilanz")?.value || "",
        vorstand: vorstand.map(({ name }) => ({ name }))
      };

      const fileFields = [
        ...vorstand.map(item => ({ id: item.upload_field_id, fieldName: `personalausweis_vorstand_${item.field_index}` })),
        { id: "doc_registerauszug", fieldName: "registerauszug" }
      ];

      await submitMultipartForm("eg", fields, fileFields);
    };

    const c = document.getElementById("vorstandContainer");
    if (c && c.children.length === 0) window.addVorstand();
  };

  // ── Stiftung ─────────────────────────────────────────────────────────
  window.portalPageInits = window.portalPageInits || {};

  window.portalPageInits["/stiftung.html"] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) {
      const el = document.getElementById("userInfo");
      if (el) el.innerText = "Eingeloggt als: " + auth.user;
    }

    let sUid = 0;

    function renumberStifter() {
      document.querySelectorAll('#stifterContainer .child-card').forEach((card, i) => {
        const h = card.querySelector('.person-heading');
        if (h) h.textContent = 'Stifter ' + (i + 1);
      });
    }

    window.addStifter = function (prefill = {}) {
      sUid += 1;
      const uid = sUid;
      const container = document.getElementById('stifterContainer');
      if (!container) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'child-card';
      wrapper.id = `stifter-card-${uid}`;
      wrapper.innerHTML = `
        <h4 class="person-heading">Stifter</h4>
        <label>Name</label><input id="stifter_name_${uid}" type="text" value="${escapeHtml(prefill.name)}">
        <label>Personalausweis</label>
        <input id="doc_personalausweis_stifter_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
        <div class="inline-actions">
          <button type="button" class="btn btn-danger" onclick="removeStifter(${uid})">Eintrag entfernen</button>
        </div>`;
      container.appendChild(wrapper);
      renumberStifter();
    };

    window.removeStifter = function (uid) {
      const el = document.getElementById(`stifter-card-${uid}`);
      if (!el) return;
      el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      el.style.opacity = '0'; el.style.transform = 'scale(0.98)';
      setTimeout(() => { el.remove(); renumberStifter(); }, 200);
    };

    window.submitPage = async function () {
      const stifter = Array.from(document.querySelectorAll('#stifterContainer .child-card'))
        .map((card, index) => {
          const uid = card.id.replace('stifter-card-', '');
          return { name: document.getElementById(`stifter_name_${uid}`)?.value || '', upload_field_id: `doc_personalausweis_stifter_${uid}`, field_index: index + 1 };
        });

      const fields = {
        anrede: document.getElementById("anrede")?.value || "", unternehmensname: document.getElementById("unternehmensname")?.value || "", unternehmensform: document.getElementById("unternehmensform")?.value || "", strasse_hausnummer: document.getElementById("strasse")?.value || "", plz: document.getElementById("plz")?.value || "", ort: document.getElementById("ort")?.value || "", telefon: document.getElementById("telefon")?.value || "", mobil: document.getElementById("mobil")?.value || "", email: document.getElementById("email")?.value || "", bankverbindung: document.getElementById("bankverbindung")?.value || "", steuernummer: document.getElementById("steuernummer")?.value || "", unternehmensgegenstand: document.getElementById("gegenstand")?.value || "", gruendungsdatum: document.getElementById("gruendungsdatum")?.value || "", ust_idnr: document.getElementById("ustid")?.value || "", bundesland: document.getElementById("bundesland")?.value || "", ist_soll_versteuerung: document.getElementById("versteuerung")?.value || "", voranmeldungszeitraum: document.getElementById("voranmeldung")?.value || "", bilanz_oder_gewinnermittler: document.getElementById("bilanz")?.value || "",
        stifter: stifter.map(({ name }) => ({ name }))
      };

      const fileFields = [
        ...stifter.map(item => ({ id: item.upload_field_id, fieldName: `personalausweis_stifter_${item.field_index}` })),
        { id: "doc_stiftungsurkunde", fieldName: "stiftungsurkunde" }
      ];

      await submitMultipartForm("stiftung", fields, fileFields);
    };

    const c = document.getElementById("stifterContainer");
    if (c && c.children.length === 0) window.addStifter();
  };
})();