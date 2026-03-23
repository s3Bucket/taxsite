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
      if (userInfo) {
        userInfo.innerText = 'Eingeloggt als: ' + auth.user;
      }
    }

    let childCounter = 0;

    window.addChild = function (prefill = {}) {
      childCounter += 1;
      const idx = childCounter;

      const container = document.getElementById('childrenContainer');
      if (!container) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'child-card';
      wrapper.id = `child-card-${idx}`;

      wrapper.innerHTML = `
        <h4>Kind ${idx}</h4>

        <label>Name</label>
        <input id="kind_name_${idx}" type="text" value="${escapeHtml(prefill.name)}">

        <label>Geburtsdatum</label>
        <input id="kind_geburt_${idx}" type="date" value="${escapeHtml(prefill.geburtsdatum)}">

        <label>Wohnort</label>
        <input id="kind_wohnort_${idx}" type="text" value="${escapeHtml(prefill.wohnort)}">

        <label>Leiblicher Vater</label>
        <input id="kind_vater_${idx}" type="text" value="${escapeHtml(prefill.leiblicher_vater)}">

        <label>Leibliche Mutter</label>
        <input id="kind_mutter_${idx}" type="text" value="${escapeHtml(prefill.leibliche_mutter)}">

        <label>Identifikationsnummer</label>
        <input id="kind_ident_${idx}" type="text" value="${escapeHtml(prefill.identifikationsnummer)}">

        <div class="form-section">
          <h4>Dokumente – Kind ${idx}</h4>
          <label>Personalausweis / Ausweisdokument Kind ${idx}</label>
          <input id="doc_kind_personalausweis_${idx}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
          <div class="upload-hint">Mehrere Dateien möglich.</div>
        </div>

        <div class="inline-actions">
          <button type="button" class="btn btn-danger" onclick="removeChildEntry(${idx})">Eintrag entfernen</button>
        </div>
      `;

      container.appendChild(wrapper);
    };

    window.removeChildEntry = function (idx) {
      const el = document.getElementById(`child-card-${idx}`);
      if (!el) return;

      el.style.transition = 'all 0.2s ease';
      el.style.opacity = '0';
      el.style.transform = 'scale(0.98)';

      setTimeout(() => {
        el.remove();
      }, 200);
    };

    window.submitPage = async function () {
      const childCards = Array.from(document.querySelectorAll('[id^="child-card-"]'));

      const children = childCards.map(card => {
        const idx = card.id.replace('child-card-', '');
        return {
          name: document.getElementById(`kind_name_${idx}`)?.value || '',
          geburtsdatum: document.getElementById(`kind_geburt_${idx}`)?.value || '',
          wohnort: document.getElementById(`kind_wohnort_${idx}`)?.value || '',
          leiblicher_vater: document.getElementById(`kind_vater_${idx}`)?.value || '',
          leibliche_mutter: document.getElementById(`kind_mutter_${idx}`)?.value || '',
          identifikationsnummer: document.getElementById(`kind_ident_${idx}`)?.value || '',
          upload_field_id: `doc_kind_personalausweis_${idx}`
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
        ...children.map((child, index) => ({
          id: child.upload_field_id,
          fieldName: `personalausweis_kind_${index + 1}`
        }))
      ];

      await submitMultipartForm('naturliche_person', fields, fileFields);
    };

    const container = document.getElementById('childrenContainer');
    if (container && container.children.length === 0) {
      window.addChild();
    }
  };

  window.portalPageInits = window.portalPageInits || {};

  window.portalPageInits["/gbr.html"] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) {
      const userInfo = document.getElementById("userInfo");
      if (userInfo) {
        userInfo.innerText = "Eingeloggt als: " + auth.user;
      }
    }

    let gesellschafterCounter = 0;

    function escapeHtml(value) {
      return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
    }

    window.addGesellschafter = function (prefill = {}) {
      gesellschafterCounter += 1;
      const idx = gesellschafterCounter;

      const container = document.getElementById("gesellschafterContainer");
      if (!container) return;

      const wrapper = document.createElement("div");
      wrapper.className = "child-card";
      wrapper.id = `gesellschafter-card-${idx}`;

      wrapper.innerHTML = `
      <h4>Gesellschafter ${idx}</h4>

      <label>Vorname</label>
      <input id="gesellschafter_vorname_${idx}" type="text" value="${escapeHtml(prefill.vorname)}">

      <label>Nachname</label>
      <input id="gesellschafter_nachname_${idx}" type="text" value="${escapeHtml(prefill.nachname)}">

      <label>E-Mail</label>
      <input id="gesellschafter_email_${idx}" type="email" value="${escapeHtml(prefill.email)}">

      <label>Telefon</label>
      <input id="gesellschafter_telefon_${idx}" type="tel" value="${escapeHtml(prefill.telefon)}">

      <label>Adresse</label>
      <input id="gesellschafter_adresse_${idx}" type="text" value="${escapeHtml(prefill.adresse)}">

      <div class="form-section">
        <h4>Dokumente – Gesellschafter ${idx}</h4>
        <label>Personalausweis</label>
        <input id="doc_personalausweis_gesellschafter_${idx}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
      </div>

      <div class="inline-actions">
        <button type="button" class="btn btn-danger" onclick="removeGesellschafter(${idx})">Eintrag entfernen</button>
      </div>
    `;

      container.appendChild(wrapper);
    };

    window.removeGesellschafter = function (idx) {
      const el = document.getElementById(`gesellschafter-card-${idx}`);
      if (!el) return;
      el.remove();
    };

    window.submitPage = async function () {
      const gesellschafterCards = Array.from(document.querySelectorAll('[id^="gesellschafter-card-"]'));

      const gesellschafter = gesellschafterCards.map(card => {
        const idx = card.id.replace("gesellschafter-card-", "");
        return {
          vorname: document.getElementById(`gesellschafter_vorname_${idx}`)?.value || "",
          nachname: document.getElementById(`gesellschafter_nachname_${idx}`)?.value || "",
          email: document.getElementById(`gesellschafter_email_${idx}`)?.value || "",
          telefon: document.getElementById(`gesellschafter_telefon_${idx}`)?.value || "",
          adresse: document.getElementById(`gesellschafter_adresse_${idx}`)?.value || "",
          upload_field_id: `doc_personalausweis_gesellschafter_${idx}`
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
        gesellschafter: gesellschafter.map(item => ({
          vorname: item.vorname,
          nachname: item.nachname,
          email: item.email,
          telefon: item.telefon,
          adresse: item.adresse
        }))
      };

      const fileFields = [
        ...gesellschafter.map((item, index) => ({
          id: item.upload_field_id,
          fieldName: `personalausweis_gesellschafter_${index + 1}`
        })),
        { id: "doc_gewerbeanmeldung", fieldName: "gewerbeanmeldung" }
      ];

      await submitMultipartForm("gbr", fields, fileFields);
    };

    const container = document.getElementById("gesellschafterContainer");
    if (container && container.children.length === 0) {
      addGesellschafter();
    }
  };

  window.portalPageInits = window.portalPageInits || {};

  window.portalPageInits["/gmbh.html"] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) {
      const userInfo = document.getElementById("userInfo");
      if (userInfo) {
        userInfo.innerText = "Eingeloggt als: " + auth.user;
      }
    }

    let geschaeftsfuehrerCounter = 0;
    let gesellschafterCounter = 0;

    function escapeHtml(value) {
      return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
    }

    window.addGeschaeftsfuehrer = function (prefill = {}) {
      geschaeftsfuehrerCounter += 1;
      const idx = geschaeftsfuehrerCounter;

      const container = document.getElementById("geschaeftsfuehrerContainer");
      if (!container) return;

      const wrapper = document.createElement("div");
      wrapper.className = "child-card";
      wrapper.id = `geschaeftsfuehrer-card-${idx}`;

      wrapper.innerHTML = `
      <h4>Geschäftsführer ${idx}</h4>

      <label>Name</label>
      <input id="geschaeftsfuehrer_name_${idx}" type="text" value="${escapeHtml(prefill.name)}">

      <label>Adresse</label>
      <input id="geschaeftsfuehrer_adresse_${idx}" type="text" value="${escapeHtml(prefill.adresse)}">

      <div class="form-section">
        <h4>Dokumente – Geschäftsführer ${idx}</h4>
        <label>Personalausweis</label>
        <input id="doc_personalausweis_geschaeftsfuehrer_${idx}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
      </div>

      <div class="inline-actions">
        <button type="button" class="btn btn-danger" onclick="removeGeschaeftsfuehrer(${idx})">Eintrag entfernen</button>
      </div>
    `;

      container.appendChild(wrapper);
    };

    window.removeGeschaeftsfuehrer = function (idx) {
      const el = document.getElementById(`geschaeftsfuehrer-card-${idx}`);
      if (!el) return;
      el.remove();
    };

    window.addGesellschafter = function (prefill = {}) {
      gesellschafterCounter += 1;
      const idx = gesellschafterCounter;

      const container = document.getElementById("gesellschafterContainer");
      if (!container) return;

      const wrapper = document.createElement("div");
      wrapper.className = "child-card";
      wrapper.id = `gesellschafter-card-${idx}`;

      wrapper.innerHTML = `
      <h4>Gesellschafter ${idx}</h4>

      <label>Name</label>
      <input id="gesellschafter_name_${idx}" type="text" value="${escapeHtml(prefill.name)}">

      <label>Adresse</label>
      <input id="gesellschafter_adresse_${idx}" type="text" value="${escapeHtml(prefill.adresse)}">

      <div class="form-section">
        <h4>Dokumente – Gesellschafter ${idx}</h4>
        <label>Personalausweis</label>
        <input id="doc_personalausweis_gesellschafter_${idx}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
      </div>

      <div class="inline-actions">
        <button type="button" class="btn btn-danger" onclick="removeGesellschafter(${idx})">Eintrag entfernen</button>
      </div>
    `;

      container.appendChild(wrapper);
    };

    window.removeGesellschafter = function (idx) {
      const el = document.getElementById(`gesellschafter-card-${idx}`);
      if (!el) return;
      el.remove();
    };

    window.submitPage = async function () {
      const geschaeftsfuehrerCards = Array.from(
          document.querySelectorAll('[id^="geschaeftsfuehrer-card-"]')
      );

      const gesellschafterCards = Array.from(
          document.querySelectorAll('[id^="gesellschafter-card-"]')
      );

      const geschaeftsfuehrer = geschaeftsfuehrerCards.map(card => {
        const idx = card.id.replace("geschaeftsfuehrer-card-", "");
        return {
          name: document.getElementById(`geschaeftsfuehrer_name_${idx}`)?.value || "",
          adresse: document.getElementById(`geschaeftsfuehrer_adresse_${idx}`)?.value || "",
          upload_field_id: `doc_personalausweis_geschaeftsfuehrer_${idx}`
        };
      });

      const gesellschafter = gesellschafterCards.map(card => {
        const idx = card.id.replace("gesellschafter-card-", "");
        return {
          name: document.getElementById(`gesellschafter_name_${idx}`)?.value || "",
          adresse: document.getElementById(`gesellschafter_adresse_${idx}`)?.value || "",
          upload_field_id: `doc_personalausweis_gesellschafter_${idx}`
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
        geschaeftsfuehrer: geschaeftsfuehrer.map(item => ({
          name: item.name,
          adresse: item.adresse
        })),
        gesellschafter: gesellschafter.map(item => ({
          name: item.name,
          adresse: item.adresse
        }))
      };

      const fileFields = [
        ...geschaeftsfuehrer.map((item, index) => ({
          id: item.upload_field_id,
          fieldName: `personalausweis_geschaeftsfuehrer_${index + 1}`
        })),
        ...gesellschafter.map((item, index) => ({
          id: item.upload_field_id,
          fieldName: `personalausweis_gesellschafter_${index + 1}`
        })),
        { id: "doc_handelsregister", fieldName: "handelsregisterauszug" },
        { id: "doc_gewerbeanmeldung", fieldName: "gewerbeanmeldung" }
      ];

      await submitMultipartForm("gmbh", fields, fileFields);
    };

    const gfContainer = document.getElementById("geschaeftsfuehrerContainer");
    const gContainer = document.getElementById("gesellschafterContainer");

    if (gfContainer && gfContainer.children.length === 0) {
      addGeschaeftsfuehrer();
    }

    if (gContainer && gContainer.children.length === 0) {
      addGesellschafter();
    }
  };

  window.portalPageInits = window.portalPageInits || {};

  window.portalPageInits["/kg-ohg.html"] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) {
      const userInfo = document.getElementById("userInfo");
      if (userInfo) {
        userInfo.innerText = "Eingeloggt als: " + auth.user;
      }
    }

    let kommanditistCounter = 0;

    function escapeHtml(value) {
      return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
    }

    window.addKommanditist = function (prefill = {}) {
      kommanditistCounter += 1;
      const idx = kommanditistCounter;

      const container = document.getElementById("kommanditistenContainer");
      if (!container) return;

      const wrapper = document.createElement("div");
      wrapper.className = "child-card";
      wrapper.id = `kommanditist-card-${idx}`;

      wrapper.innerHTML = `
      <h4>Kommanditist ${idx}</h4>

      <label>Name</label>
      <input id="kommanditist_name_${idx}" type="text" value="${escapeHtml(prefill.name)}">

      <div class="form-section">
        <h4>Dokumente – Kommanditist ${idx}</h4>
        <label>Personalausweis</label>
        <input id="doc_personalausweis_kommanditist_${idx}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
      </div>

      <div class="inline-actions">
        <button type="button" class="btn btn-danger" onclick="removeKommanditist(${idx})">Eintrag entfernen</button>
      </div>
    `;

      container.appendChild(wrapper);
    };

    window.removeKommanditist = function (idx) {
      const el = document.getElementById(`kommanditist-card-${idx}`);
      if (!el) return;
      el.remove();
    };

    window.submitPage = async function () {
      const kommanditistCards = Array.from(
          document.querySelectorAll('[id^="kommanditist-card-"]')
      );

      const kommanditisten = kommanditistCards.map(card => {
        const idx = card.id.replace("kommanditist-card-", "");
        return {
          name: document.getElementById(`kommanditist_name_${idx}`)?.value || "",
          upload_field_id: `doc_personalausweis_kommanditist_${idx}`
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
        komplementaer: {
          name: document.getElementById("komplementaer_name")?.value || ""
        },
        kommanditisten: kommanditisten.map(item => ({
          name: item.name
        }))
      };

      const fileFields = [
        { id: "doc_personalausweis_komplementaer", fieldName: "personalausweis_komplementaer" },
        ...kommanditisten.map((item, index) => ({
          id: item.upload_field_id,
          fieldName: `personalausweis_kommanditist_${index + 1}`
        })),
        { id: "doc_gewerbeanmeldung", fieldName: "gewerbeanmeldung" }
      ];

      await submitMultipartForm("kg_ohg", fields, fileFields);
    };

    const container = document.getElementById("kommanditistenContainer");
    if (container && container.children.length === 0) {
      addKommanditist();
    }
  };

  window.portalPageInits = window.portalPageInits || {};

  window.portalPageInits["/eg.html"] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) {
      const userInfo = document.getElementById("userInfo");
      if (userInfo) {
        userInfo.innerText = "Eingeloggt als: " + auth.user;
      }
    }

    let vorstandCounter = 0;

    function escapeHtml(value) {
      return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
    }

    window.addVorstand = function (prefill = {}) {
      vorstandCounter += 1;
      const idx = vorstandCounter;

      const container = document.getElementById("vorstandContainer");
      if (!container) return;

      const wrapper = document.createElement("div");
      wrapper.className = "child-card";
      wrapper.id = `vorstand-card-${idx}`;

      wrapper.innerHTML = `
      <h4>Vorstandsmitglied ${idx}</h4>

      <label>Name</label>
      <input id="vorstand_name_${idx}" type="text" value="${escapeHtml(prefill.name)}">

      <div class="form-section">
        <h4>Dokumente – Vorstandsmitglied ${idx}</h4>
        <label>Personalausweis</label>
        <input id="doc_personalausweis_vorstand_${idx}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>
        <div class="upload-hint">Mehrere Dateien möglich.</div>
      </div>

      <div class="inline-actions">
        <button type="button" class="btn btn-danger" onclick="removeVorstand(${idx})">Eintrag entfernen</button>
      </div>
    `;

      container.appendChild(wrapper);
    };

    window.removeVorstand = function (idx) {
      const el = document.getElementById(`vorstand-card-${idx}`);
      if (!el) return;
      el.remove();
    };

    window.submitPage = async function () {
      const vorstandCards = Array.from(
          document.querySelectorAll('[id^="vorstand-card-"]')
      );

      const vorstand = vorstandCards.map(card => {
        const idx = card.id.replace("vorstand-card-", "");
        return {
          name: document.getElementById(`vorstand_name_${idx}`)?.value || "",
          upload_field_id: `doc_personalausweis_vorstand_${idx}`
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
        vorstand: vorstand.map(item => ({
          name: item.name
        }))
      };

      const fileFields = [
        ...vorstand.map((item, index) => ({
          id: item.upload_field_id,
          fieldName: `personalausweis_vorstand_${index + 1}`
        })),
        { id: "doc_registerauszug", fieldName: "registerauszug" }
      ];

      await submitMultipartForm("eg", fields, fileFields);
    };

    const container = document.getElementById("vorstandContainer");
    if (container && container.children.length === 0) {
      addVorstand();
    }
  };
})();