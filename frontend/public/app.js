(function () {
  // ── Supabase client (needed for login, register, logout) ─────────────────────
  const SUPABASE_ANON_KEY =
    'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc1ODczNDc2MCwiZXhwIjo0OTE0NDA4' +
      'MzYwLCJyb2xlIjoiYW5vbiJ9.D5U5-2zAxTj9cVsgh1PGu4kmZFz6aHcKa72f5LjvSq4';

  const _sb = window.supabase
    ? window.supabase.createClient(window.location.origin, SUPABASE_ANON_KEY)
    : null;

  function _setSessionCookie(token) {
    const secure = location.protocol === 'https:' ? '; secure' : '';
    if (token) {
      document.cookie = `portal_session=${token}; path=/; samesite=lax${secure}`;
    } else {
      document.cookie = `portal_session=; path=/; max-age=0${secure}`;
    }
  }

  if (_sb) {
    _sb.auth.onAuthStateChange((_event, session) => {
      _setSessionCookie(session ? session.access_token : null);
    });
  }

  // ── Auth helpers ──────────────────────────────────────────────────────────────

  async function requireAuth(options = {}) {
    const { redirect = true } = options;
    try {
      const resp = await fetch('/api/auth/check', { credentials: 'include' });
      if (!resp.ok) {
        if (redirect) window.location.href = '/index.html';
        return null;
      }
      const data = await resp.json();
      return { status: 'authenticated', user: data.user, is_admin: data.is_admin };
    } catch (_) {
      if (redirect) window.location.href = '/index.html';
      return null;
    }
  }

  async function redirectIfAuthenticated(target = '/portal.html') {
    const auth = await requireAuth({ redirect: false });
    if (auth) window.location.href = target;
  }

  async function logout() {
    if (_sb) {
      await _sb.auth.signOut({ scope: 'global' }).catch(() => {});
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') || key.startsWith('supabase.')) localStorage.removeItem(key);
      }
      sessionStorage.clear();
    }
    _setSessionCookie(null);
    window.location.href = '/index.html?loggedout=1';
  }

  window._sb = _sb;
  window._setSessionCookie = _setSessionCookie;

  // ── Upload zones ──────────────────────────────────────────────────────────────

  function _fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function _fileExt(name) {
    const m = name.match(/\.([^.]+)$/);
    return m ? m[1].toUpperCase().slice(0, 4) : 'FILE';
  }

  function initFileDropZones(scope) {
    const root = (scope && scope.querySelectorAll) ? scope : document;
    root.querySelectorAll('input[type="file"]:not([data-fz])').forEach(input => {
      input.setAttribute('data-fz', '1');

      const zone = document.createElement('div');
      zone.className = 'upload-zone';
      zone.innerHTML = `
        <div class="upload-zone-body">
          <div class="upload-zone-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div class="upload-zone-text">
            Datei hier ablegen oder <span class="upload-zone-link">auswählen</span>
            <span class="upload-zone-hint">PDF, JPG, PNG · Max. 5 MB${input.multiple ? ' · Mehrere Dateien möglich' : ''}</span>
          </div>
        </div>
        <ul class="file-list"></ul>`;

      input.style.display = 'none';
      input.parentNode.insertBefore(zone, input);
      zone.appendChild(input);

      const fileList = zone.querySelector('.file-list');

      function renderFiles() {
        fileList.innerHTML = '';
        const files = Array.from(input.files || []);
        fileList.style.display = files.length ? 'flex' : 'none';
        files.forEach((file, i) => {
          const li = document.createElement('li');
          li.className = 'file-item';
          li.innerHTML = `
            <div class="file-item-icon">${_fileExt(file.name)}</div>
            <div class="file-item-info">
              <div class="file-item-name">${escapeHtml(file.name)}</div>
              <div class="file-item-size">${_fmtBytes(file.size)}</div>
            </div>
            <button type="button" class="file-item-remove" title="Entfernen">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>`;
          li.querySelector('.file-item-remove').addEventListener('click', e => {
            e.stopPropagation();
            const dt = new DataTransfer();
            files.forEach((f, j) => { if (j !== i) dt.items.add(f); });
            input.files = dt.files;
            renderFiles();
          });
          fileList.appendChild(li);
        });
      }

      zone.addEventListener('click', e => {
        if (!e.target.closest('.file-item-remove')) input.click();
      });
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', e => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
      });
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const dt = new DataTransfer();
        if (input.multiple) {
          Array.from(input.files || []).forEach(f => dt.items.add(f));
          Array.from(e.dataTransfer.files).forEach(f => dt.items.add(f));
        } else {
          if (e.dataTransfer.files[0]) dt.items.add(e.dataTransfer.files[0]);
        }
        input.files = dt.files;
        renderFiles();
      });
      input.addEventListener('change', renderFiles);
      renderFiles();
    });
  }

  window.initFileDropZones = initFileDropZones;

  // ── Form submission ───────────────────────────────────────────────────────────

  async function safeJson(response) {
    try { return await response.json(); } catch (_) { return null; }
  }

  async function submitMultipartForm(formName, fields, fileFields = [], msgId = 'msg') {
    const msg = document.getElementById(msgId);
    const btn = document.getElementById('submitBtn');
    if (msg) { msg.textContent = ''; msg.classList.remove('success'); }
    if (btn) btn.setAttribute('data-loading', '');

    const MAX = 5 * 1024 * 1024;
    try {
      for (const entry of fileFields) {
        const input = document.getElementById(entry.id);
        if (!input || !input.files) continue;
        for (const file of input.files) {
          if (file.size > MAX) {
            if (msg) msg.textContent = `"${file.name}" ist zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Max. 5 MB.`;
            return false;
          }
        }
      }
      const formData = new FormData();
      formData.append('form_name', formName);
      formData.append('data', JSON.stringify(fields || {}));
      for (const entry of fileFields) {
        const input = document.getElementById(entry.id);
        if (!input || !input.files || !input.files.length) continue;
        for (const file of input.files) formData.append(entry.fieldName, file);
      }
      const res = await fetch('/api/forms/submit', { method: 'POST', credentials: 'include', body: formData });
      const data = await safeJson(res);
      if (!res.ok) {
        if (msg) msg.textContent = data?.detail || data?.message || 'Senden fehlgeschlagen.';
        return false;
      }
      if (msg) { msg.textContent = data?.message || 'Daten erfolgreich gesendet.'; msg.classList.add('success'); }
      return true;
    } catch (_) {
      if (msg) msg.textContent = 'Server nicht erreichbar.';
      return false;
    } finally {
      if (btn) btn.removeAttribute('data-loading');
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.requireAuth = requireAuth;
  window.redirectIfAuthenticated = redirectIfAuthenticated;
  window.logout = logout;
  window.submitMultipartForm = submitMultipartForm;
  window.escapeHtml = escapeHtml;

  // ── X-Button SVG helper ───────────────────────────────────────────────────────
  const _xBtn = (fn) =>
    `<button type="button" class="card-remove-btn" onclick="${fn}" title="Entfernen">` +
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">` +
    `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;

  window.portalPageInits = window.portalPageInits || {};

  // ── Natürliche Person ─────────────────────────────────────────────────────────

  window.portalPageInits['/naturliche-person.html'] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) {
      const el = document.getElementById('userInfo');
      if (el) el.innerText = 'Eingeloggt als: ' + auth.user;
    }

    let childUid = 0;

    function renumberChildren() {
      document.querySelectorAll('#childrenContainer .child-card').forEach((card, i) => {
        const h = card.querySelector('.person-heading');
        if (h) h.textContent = 'Kind ' + (i + 1);
      });
    }

    window.addChild = function (prefill = {}) {
      childUid += 1;
      const uid = childUid;
      const container = document.getElementById('childrenContainer');
      if (!container) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'child-card';
      wrapper.id = `child-card-${uid}`;
      wrapper.innerHTML = `
        <div class="card-header">
          <h4 class="card-title person-heading">Kind</h4>
          ${_xBtn(`removeChildEntry(${uid})`)}
        </div>
        <div class="form-row">
          <div><label>Name</label><input id="kind_name_${uid}" type="text" value="${escapeHtml(prefill.name)}"></div>
          <div><label>Geburtsdatum</label><input id="kind_geburt_${uid}" type="date" value="${escapeHtml(prefill.geburtsdatum)}"></div>
        </div>
        <div class="form-row">
          <div><label>Wohnort</label><input id="kind_wohnort_${uid}" type="text" value="${escapeHtml(prefill.wohnort)}"></div>
          <div><label>Identifikationsnummer</label><input id="kind_ident_${uid}" type="text" value="${escapeHtml(prefill.identifikationsnummer)}"></div>
        </div>
        <div class="form-row">
          <div><label>Leiblicher Vater</label><input id="kind_vater_${uid}" type="text" value="${escapeHtml(prefill.leiblicher_vater)}"></div>
          <div><label>Leibliche Mutter</label><input id="kind_mutter_${uid}" type="text" value="${escapeHtml(prefill.leibliche_mutter)}"></div>
        </div>
        <label class="child-file-label">Ausweisdokument</label>
        <input id="doc_kind_personalausweis_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>`;
      container.appendChild(wrapper);
      renumberChildren();
      initFileDropZones(wrapper);
    };

    window.removeChildEntry = function (uid) {
      const el = document.getElementById(`child-card-${uid}`);
      if (!el) return;
      el.style.transition = 'opacity 0.2s, transform 0.2s';
      el.style.opacity = '0'; el.style.transform = 'scale(0.98)';
      setTimeout(() => { el.remove(); renumberChildren(); }, 200);
    };

    window.submitPage = async function () {
      const children = Array.from(document.querySelectorAll('#childrenContainer .child-card'))
        .map((card, index) => {
          const uid = card.id.replace('child-card-', '');
          return {
            name: document.getElementById(`kind_name_${uid}`)?.value || '',
            geburtsdatum: document.getElementById(`kind_geburt_${uid}`)?.value || '',
            wohnort: document.getElementById(`kind_wohnort_${uid}`)?.value || '',
            leiblicher_vater: document.getElementById(`kind_vater_${uid}`)?.value || '',
            leibliche_mutter: document.getElementById(`kind_mutter_${uid}`)?.value || '',
            identifikationsnummer: document.getElementById(`kind_ident_${uid}`)?.value || '',
            upload_field_id: `doc_kind_personalausweis_${uid}`,
            field_index: index + 1,
          };
        });
      const fields = {
        ehepartner1: {
          anrede: document.getElementById('anrede1')?.value || '', titel: document.getElementById('titel1')?.value || '',
          vorname: document.getElementById('vorname1')?.value || '', nachname: document.getElementById('nachname1')?.value || '',
          strasse_hausnummer: document.getElementById('strasse1')?.value || '', plz: document.getElementById('plz1')?.value || '',
          ort: document.getElementById('ort1')?.value || '', telefon: document.getElementById('telefon1')?.value || '',
          mobil: document.getElementById('mobil1')?.value || '', email: document.getElementById('email1')?.value || '',
          bankverbindung: document.getElementById('bank1')?.value || '', steuernummer: document.getElementById('steuer1')?.value || '',
          geburtsdatum: document.getElementById('geburt1')?.value || '', familienstand: document.getElementById('familienstand1')?.value || '',
          staatsangehoerigkeit: document.getElementById('staat1')?.value || '', religionszugehoerigkeit: document.getElementById('religion1')?.value || '',
          geschlecht: document.getElementById('geschlecht1')?.value || '', beruf: document.getElementById('beruf1')?.value || '',
          bundesland: document.getElementById('bundesland1')?.value || '', identifikationsnummer: document.getElementById('ident1')?.value || '',
        },
        ehepartner2: {
          anrede: document.getElementById('anrede2')?.value || '', titel: document.getElementById('titel2')?.value || '',
          vorname: document.getElementById('vorname2')?.value || '', nachname: document.getElementById('nachname2')?.value || '',
          strasse_hausnummer: document.getElementById('strasse2')?.value || '', plz: document.getElementById('plz2')?.value || '',
          ort: document.getElementById('ort2')?.value || '', telefon: document.getElementById('telefon2')?.value || '',
          mobil: document.getElementById('mobil2')?.value || '', email: document.getElementById('email2')?.value || '',
          bankverbindung: document.getElementById('bank2')?.value || '', steuernummer: document.getElementById('steuer2')?.value || '',
          geburtsdatum: document.getElementById('geburt2')?.value || '', familienstand: document.getElementById('familienstand2')?.value || '',
          staatsangehoerigkeit: document.getElementById('staat2')?.value || '', religionszugehoerigkeit: document.getElementById('religion2')?.value || '',
          geschlecht: document.getElementById('geschlecht2')?.value || '', beruf: document.getElementById('beruf2')?.value || '',
          bundesland: document.getElementById('bundesland2')?.value || '', identifikationsnummer: document.getElementById('ident2')?.value || '',
        },
        kinder: children.map(({ name, geburtsdatum, wohnort, leiblicher_vater, leibliche_mutter, identifikationsnummer }) =>
          ({ name, geburtsdatum, wohnort, leiblicher_vater, leibliche_mutter, identifikationsnummer })),
      };
      const fileFields = [
        { id: 'doc_personalausweis_ep1', fieldName: 'personalausweis_ehepartner_1' },
        { id: 'doc_personalausweis_ep2', fieldName: 'personalausweis_ehepartner_2' },
        ...children.map(c => ({ id: c.upload_field_id, fieldName: `personalausweis_kind_${c.field_index}` })),
      ];
      await submitMultipartForm('naturliche_person', fields, fileFields);
    };

    if (!document.querySelector('#childrenContainer .child-card')) window.addChild();
    initFileDropZones();
  };

  // ── GbR ───────────────────────────────────────────────────────────────────────

  window.portalPageInits['/gbr.html'] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) { const el = document.getElementById('userInfo'); if (el) el.innerText = 'Eingeloggt als: ' + auth.user; }

    let gUid = 0;
    function renumberGesellschafter() {
      document.querySelectorAll('#gesellschafterContainer .child-card').forEach((c, i) => {
        const h = c.querySelector('.person-heading'); if (h) h.textContent = 'Gesellschafter ' + (i + 1);
      });
    }
    window.addGesellschafter = function (prefill = {}) {
      gUid += 1; const uid = gUid;
      const container = document.getElementById('gesellschafterContainer');
      if (!container) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'child-card'; wrapper.id = `gesellschafter-card-${uid}`;
      wrapper.innerHTML = `
        <div class="card-header"><h4 class="card-title person-heading">Gesellschafter</h4>${_xBtn(`removeGesellschafter(${uid})`)}</div>
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
        <input id="doc_personalausweis_gesellschafter_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>`;
      container.appendChild(wrapper); renumberGesellschafter(); initFileDropZones(wrapper);
    };
    window.removeGesellschafter = function (uid) {
      const el = document.getElementById(`gesellschafter-card-${uid}`); if (!el) return;
      el.style.transition = 'opacity 0.2s, transform 0.2s'; el.style.opacity = '0'; el.style.transform = 'scale(0.98)';
      setTimeout(() => { el.remove(); renumberGesellschafter(); }, 200);
    };
    window.submitPage = async function () {
      const gs = Array.from(document.querySelectorAll('#gesellschafterContainer .child-card')).map((c, i) => {
        const uid = c.id.replace('gesellschafter-card-', '');
        return { vorname: document.getElementById(`gesellschafter_vorname_${uid}`)?.value||'', nachname: document.getElementById(`gesellschafter_nachname_${uid}`)?.value||'', email: document.getElementById(`gesellschafter_email_${uid}`)?.value||'', telefon: document.getElementById(`gesellschafter_telefon_${uid}`)?.value||'', adresse: document.getElementById(`gesellschafter_adresse_${uid}`)?.value||'', upload_field_id: `doc_personalausweis_gesellschafter_${uid}`, field_index: i+1 };
      });
      const f = { anrede: document.getElementById('anrede')?.value||'', unternehmensname: document.getElementById('unternehmensname')?.value||'', unternehmensform: document.getElementById('unternehmensform')?.value||'', strasse_hausnummer: document.getElementById('strasse')?.value||'', plz: document.getElementById('plz')?.value||'', ort: document.getElementById('ort')?.value||'', telefon: document.getElementById('telefon')?.value||'', mobil: document.getElementById('mobil')?.value||'', email: document.getElementById('email')?.value||'', bankverbindung: document.getElementById('bankverbindung')?.value||'', steuernummer: document.getElementById('steuernummer')?.value||'', unternehmensgegenstand: document.getElementById('gegenstand')?.value||'', gruendungsdatum: document.getElementById('gruendungsdatum')?.value||'', ust_idnr: document.getElementById('ustid')?.value||'', bundesland: document.getElementById('bundesland')?.value||'', ist_soll_versteuerung: document.getElementById('versteuerung')?.value||'', voranmeldungszeitraum: document.getElementById('voranmeldung')?.value||'', bilanz_oder_gewinnermittler: document.getElementById('bilanz')?.value||'', gesellschafter: gs.map(({vorname,nachname,email,telefon,adresse})=>({vorname,nachname,email,telefon,adresse})) };
      await submitMultipartForm('gbr', f, [...gs.map(g=>({id:g.upload_field_id,fieldName:`personalausweis_gesellschafter_${g.field_index}`})),{id:'doc_gewerbeanmeldung',fieldName:'gewerbeanmeldung'}]);
    };
    if (!document.querySelector('#gesellschafterContainer .child-card')) window.addGesellschafter();
    initFileDropZones();
  };

  // ── GmbH ──────────────────────────────────────────────────────────────────────

  window.portalPageInits['/gmbh.html'] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) { const el = document.getElementById('userInfo'); if (el) el.innerText = 'Eingeloggt als: ' + auth.user; }

    let gfUid = 0, gsUid = 0;
    function renumberGf() { document.querySelectorAll('#geschaeftsfuehrerContainer .child-card').forEach((c,i)=>{ const h=c.querySelector('.person-heading'); if(h) h.textContent='Geschäftsführer '+(i+1); }); }
    function renumberGs() { document.querySelectorAll('#gesellschafterContainer .child-card').forEach((c,i)=>{ const h=c.querySelector('.person-heading'); if(h) h.textContent='Gesellschafter '+(i+1); }); }

    window.addGeschaeftsfuehrer = function (prefill = {}) {
      gfUid += 1; const uid = gfUid;
      const container = document.getElementById('geschaeftsfuehrerContainer'); if (!container) return;
      const wrapper = document.createElement('div'); wrapper.className = 'child-card'; wrapper.id = `geschaeftsfuehrer-card-${uid}`;
      wrapper.innerHTML = `<div class="card-header"><h4 class="card-title person-heading">Geschäftsführer</h4>${_xBtn(`removeGeschaeftsfuehrer(${uid})`)}</div>
        <label>Name</label><input id="geschaeftsfuehrer_name_${uid}" type="text" value="${escapeHtml(prefill.name)}">
        <label>Adresse</label><input id="geschaeftsfuehrer_adresse_${uid}" type="text" value="${escapeHtml(prefill.adresse)}">
        <label>Personalausweis</label><input id="doc_personalausweis_geschaeftsfuehrer_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>`;
      container.appendChild(wrapper); renumberGf(); initFileDropZones(wrapper);
    };
    window.removeGeschaeftsfuehrer = function (uid) {
      const el = document.getElementById(`geschaeftsfuehrer-card-${uid}`); if (!el) return;
      el.style.transition='opacity 0.2s,transform 0.2s'; el.style.opacity='0'; el.style.transform='scale(0.98)';
      setTimeout(()=>{ el.remove(); renumberGf(); },200);
    };
    window.addGesellschafter = function (prefill = {}) {
      gsUid += 1; const uid = gsUid;
      const container = document.getElementById('gesellschafterContainer'); if (!container) return;
      const wrapper = document.createElement('div'); wrapper.className = 'child-card'; wrapper.id = `gesellschafter-card-${uid}`;
      wrapper.innerHTML = `<div class="card-header"><h4 class="card-title person-heading">Gesellschafter</h4>${_xBtn(`removeGesellschafter(${uid})`)}</div>
        <label>Name</label><input id="gesellschafter_name_${uid}" type="text" value="${escapeHtml(prefill.name)}">
        <label>Adresse</label><input id="gesellschafter_adresse_${uid}" type="text" value="${escapeHtml(prefill.adresse)}">
        <label>Personalausweis</label><input id="doc_personalausweis_gesellschafter_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>`;
      container.appendChild(wrapper); renumberGs(); initFileDropZones(wrapper);
    };
    window.removeGesellschafter = function (uid) {
      const el = document.getElementById(`gesellschafter-card-${uid}`); if (!el) return;
      el.style.transition='opacity 0.2s,transform 0.2s'; el.style.opacity='0'; el.style.transform='scale(0.98)';
      setTimeout(()=>{ el.remove(); renumberGs(); },200);
    };
    window.submitPage = async function () {
      const gf = Array.from(document.querySelectorAll('#geschaeftsfuehrerContainer .child-card')).map((c,i)=>{ const uid=c.id.replace('geschaeftsfuehrer-card-',''); return {name:document.getElementById(`geschaeftsfuehrer_name_${uid}`)?.value||'',adresse:document.getElementById(`geschaeftsfuehrer_adresse_${uid}`)?.value||'',upload_field_id:`doc_personalausweis_geschaeftsfuehrer_${uid}`,field_index:i+1}; });
      const gs = Array.from(document.querySelectorAll('#gesellschafterContainer .child-card')).map((c,i)=>{ const uid=c.id.replace('gesellschafter-card-',''); return {name:document.getElementById(`gesellschafter_name_${uid}`)?.value||'',adresse:document.getElementById(`gesellschafter_adresse_${uid}`)?.value||'',upload_field_id:`doc_personalausweis_gesellschafter_${uid}`,field_index:i+1}; });
      const f = { anrede:document.getElementById('anrede')?.value||'', unternehmensname:document.getElementById('unternehmensname')?.value||'', unternehmensform:document.getElementById('unternehmensform')?.value||'', strasse_hausnummer:document.getElementById('strasse')?.value||'', plz:document.getElementById('plz')?.value||'', ort:document.getElementById('ort')?.value||'', telefon:document.getElementById('telefon')?.value||'', mobil:document.getElementById('mobil')?.value||'', email:document.getElementById('email')?.value||'', bankverbindung:document.getElementById('bankverbindung')?.value||'', steuernummer:document.getElementById('steuernummer')?.value||'', unternehmensgegenstand:document.getElementById('gegenstand')?.value||'', gruendungsdatum:document.getElementById('gruendungsdatum')?.value||'', ust_idnr:document.getElementById('ustid')?.value||'', bundesland:document.getElementById('bundesland')?.value||'', ist_soll_versteuerung:document.getElementById('versteuerung')?.value||'', voranmeldungszeitraum:document.getElementById('voranmeldung')?.value||'', bilanz_oder_gewinnermittler:document.getElementById('bilanz')?.value||'', geschaeftsfuehrer:gf.map(({name,adresse})=>({name,adresse})), gesellschafter:gs.map(({name,adresse})=>({name,adresse})) };
      await submitMultipartForm('gmbh', f, [...gf.map(g=>({id:g.upload_field_id,fieldName:`personalausweis_geschaeftsfuehrer_${g.field_index}`})),...gs.map(g=>({id:g.upload_field_id,fieldName:`personalausweis_gesellschafter_${g.field_index}`})),{id:'doc_handelsregister',fieldName:'handelsregisterauszug'},{id:'doc_gewerbeanmeldung',fieldName:'gewerbeanmeldung'}]);
    };
    if (!document.querySelector('#geschaeftsfuehrerContainer .child-card')) window.addGeschaeftsfuehrer();
    if (!document.querySelector('#gesellschafterContainer .child-card')) window.addGesellschafter();
    initFileDropZones();
  };

  // ── KG / OHG ─────────────────────────────────────────────────────────────────

  window.portalPageInits['/kg-ohg.html'] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) { const el = document.getElementById('userInfo'); if (el) el.innerText = 'Eingeloggt als: ' + auth.user; }

    let kUid = 0;
    function renumberK() { document.querySelectorAll('#kommanditistenContainer .child-card').forEach((c,i)=>{ const h=c.querySelector('.person-heading'); if(h) h.textContent='Kommanditist '+(i+1); }); }

    window.addKommanditist = function (prefill = {}) {
      kUid += 1; const uid = kUid;
      const container = document.getElementById('kommanditistenContainer'); if (!container) return;
      const wrapper = document.createElement('div'); wrapper.className = 'child-card'; wrapper.id = `kommanditist-card-${uid}`;
      wrapper.innerHTML = `<div class="card-header"><h4 class="card-title person-heading">Kommanditist</h4>${_xBtn(`removeKommanditist(${uid})`)}</div>
        <label>Name</label><input id="kommanditist_name_${uid}" type="text" value="${escapeHtml(prefill.name)}">
        <label>Personalausweis</label><input id="doc_personalausweis_kommanditist_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>`;
      container.appendChild(wrapper); renumberK(); initFileDropZones(wrapper);
    };
    window.removeKommanditist = function (uid) {
      const el = document.getElementById(`kommanditist-card-${uid}`); if (!el) return;
      el.style.transition='opacity 0.2s,transform 0.2s'; el.style.opacity='0'; el.style.transform='scale(0.98)';
      setTimeout(()=>{ el.remove(); renumberK(); },200);
    };
    window.submitPage = async function () {
      const ks = Array.from(document.querySelectorAll('#kommanditistenContainer .child-card')).map((c,i)=>{ const uid=c.id.replace('kommanditist-card-',''); return {name:document.getElementById(`kommanditist_name_${uid}`)?.value||'',upload_field_id:`doc_personalausweis_kommanditist_${uid}`,field_index:i+1}; });
      const f = { anrede:document.getElementById('anrede')?.value||'', unternehmensname:document.getElementById('unternehmensname')?.value||'', unternehmensform:document.getElementById('unternehmensform')?.value||'', strasse_hausnummer:document.getElementById('strasse')?.value||'', plz:document.getElementById('plz')?.value||'', ort:document.getElementById('ort')?.value||'', telefon:document.getElementById('telefon')?.value||'', mobil:document.getElementById('mobil')?.value||'', email:document.getElementById('email')?.value||'', bankverbindung:document.getElementById('bankverbindung')?.value||'', steuernummer:document.getElementById('steuernummer')?.value||'', unternehmensgegenstand:document.getElementById('gegenstand')?.value||'', gruendungsdatum:document.getElementById('gruendungsdatum')?.value||'', ust_idnr:document.getElementById('ustid')?.value||'', bundesland:document.getElementById('bundesland')?.value||'', ist_soll_versteuerung:document.getElementById('versteuerung')?.value||'', voranmeldungszeitraum:document.getElementById('voranmeldung')?.value||'', bilanz_oder_gewinnermittler:document.getElementById('bilanz')?.value||'', komplementaer:{name:document.getElementById('komplementaer_name')?.value||''}, kommanditisten:ks.map(({name})=>({name})) };
      await submitMultipartForm('kg_ohg', f, [{id:'doc_personalausweis_komplementaer',fieldName:'personalausweis_komplementaer'},...ks.map(k=>({id:k.upload_field_id,fieldName:`personalausweis_kommanditist_${k.field_index}`})),{id:'doc_gewerbeanmeldung',fieldName:'gewerbeanmeldung'}]);
    };
    if (!document.querySelector('#kommanditistenContainer .child-card')) window.addKommanditist();
    initFileDropZones();
  };

  // ── eG ────────────────────────────────────────────────────────────────────────

  window.portalPageInits['/eg.html'] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) { const el = document.getElementById('userInfo'); if (el) el.innerText = 'Eingeloggt als: ' + auth.user; }

    let vUid = 0;
    function renumberV() { document.querySelectorAll('#vorstandContainer .child-card').forEach((c,i)=>{ const h=c.querySelector('.person-heading'); if(h) h.textContent='Vorstandsmitglied '+(i+1); }); }

    window.addVorstand = function (prefill = {}) {
      vUid += 1; const uid = vUid;
      const container = document.getElementById('vorstandContainer'); if (!container) return;
      const wrapper = document.createElement('div'); wrapper.className = 'child-card'; wrapper.id = `vorstand-card-${uid}`;
      wrapper.innerHTML = `<div class="card-header"><h4 class="card-title person-heading">Vorstandsmitglied</h4>${_xBtn(`removeVorstand(${uid})`)}</div>
        <label>Name</label><input id="vorstand_name_${uid}" type="text" value="${escapeHtml(prefill.name)}">
        <label>Personalausweis</label><input id="doc_personalausweis_vorstand_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>`;
      container.appendChild(wrapper); renumberV(); initFileDropZones(wrapper);
    };
    window.removeVorstand = function (uid) {
      const el = document.getElementById(`vorstand-card-${uid}`); if (!el) return;
      el.style.transition='opacity 0.2s,transform 0.2s'; el.style.opacity='0'; el.style.transform='scale(0.98)';
      setTimeout(()=>{ el.remove(); renumberV(); },200);
    };
    window.submitPage = async function () {
      const vs = Array.from(document.querySelectorAll('#vorstandContainer .child-card')).map((c,i)=>{ const uid=c.id.replace('vorstand-card-',''); return {name:document.getElementById(`vorstand_name_${uid}`)?.value||'',upload_field_id:`doc_personalausweis_vorstand_${uid}`,field_index:i+1}; });
      const f = { anrede:document.getElementById('anrede')?.value||'', unternehmensname:document.getElementById('unternehmensname')?.value||'', unternehmensform:document.getElementById('unternehmensform')?.value||'', strasse_hausnummer:document.getElementById('strasse')?.value||'', plz:document.getElementById('plz')?.value||'', ort:document.getElementById('ort')?.value||'', telefon:document.getElementById('telefon')?.value||'', mobil:document.getElementById('mobil')?.value||'', email:document.getElementById('email')?.value||'', bankverbindung:document.getElementById('bankverbindung')?.value||'', steuernummer:document.getElementById('steuernummer')?.value||'', unternehmensgegenstand:document.getElementById('gegenstand')?.value||'', gruendungsdatum:document.getElementById('gruendungsdatum')?.value||'', ust_idnr:document.getElementById('ustid')?.value||'', bundesland:document.getElementById('bundesland')?.value||'', ist_soll_versteuerung:document.getElementById('versteuerung')?.value||'', voranmeldungszeitraum:document.getElementById('voranmeldung')?.value||'', bilanz_oder_gewinnermittler:document.getElementById('bilanz')?.value||'', vorstand:vs.map(({name})=>({name})) };
      await submitMultipartForm('eg', f, [...vs.map(v=>({id:v.upload_field_id,fieldName:`personalausweis_vorstand_${v.field_index}`})),{id:'doc_registerauszug',fieldName:'registerauszug'}]);
    };
    if (!document.querySelector('#vorstandContainer .child-card')) window.addVorstand();
    initFileDropZones();
  };

  // ── Stiftung ──────────────────────────────────────────────────────────────────

  window.portalPageInits['/stiftung.html'] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) { const el = document.getElementById('userInfo'); if (el) el.innerText = 'Eingeloggt als: ' + auth.user; }

    let sUid = 0;
    function renumberS() { document.querySelectorAll('#stifterContainer .child-card').forEach((c,i)=>{ const h=c.querySelector('.person-heading'); if(h) h.textContent='Stifter '+(i+1); }); }

    window.addStifter = function (prefill = {}) {
      sUid += 1; const uid = sUid;
      const container = document.getElementById('stifterContainer'); if (!container) return;
      const wrapper = document.createElement('div'); wrapper.className = 'child-card'; wrapper.id = `stifter-card-${uid}`;
      wrapper.innerHTML = `<div class="card-header"><h4 class="card-title person-heading">Stifter</h4>${_xBtn(`removeStifter(${uid})`)}</div>
        <label>Name</label><input id="stifter_name_${uid}" type="text" value="${escapeHtml(prefill.name)}">
        <label>Personalausweis</label><input id="doc_personalausweis_stifter_${uid}" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>`;
      container.appendChild(wrapper); renumberS(); initFileDropZones(wrapper);
    };
    window.removeStifter = function (uid) {
      const el = document.getElementById(`stifter-card-${uid}`); if (!el) return;
      el.style.transition='opacity 0.2s,transform 0.2s'; el.style.opacity='0'; el.style.transform='scale(0.98)';
      setTimeout(()=>{ el.remove(); renumberS(); },200);
    };
    window.submitPage = async function () {
      const ss = Array.from(document.querySelectorAll('#stifterContainer .child-card')).map((c,i)=>{ const uid=c.id.replace('stifter-card-',''); return {name:document.getElementById(`stifter_name_${uid}`)?.value||'',upload_field_id:`doc_personalausweis_stifter_${uid}`,field_index:i+1}; });
      const f = { anrede:document.getElementById('anrede')?.value||'', unternehmensname:document.getElementById('unternehmensname')?.value||'', unternehmensform:document.getElementById('unternehmensform')?.value||'', strasse_hausnummer:document.getElementById('strasse')?.value||'', plz:document.getElementById('plz')?.value||'', ort:document.getElementById('ort')?.value||'', telefon:document.getElementById('telefon')?.value||'', mobil:document.getElementById('mobil')?.value||'', email:document.getElementById('email')?.value||'', bankverbindung:document.getElementById('bankverbindung')?.value||'', steuernummer:document.getElementById('steuernummer')?.value||'', unternehmensgegenstand:document.getElementById('gegenstand')?.value||'', gruendungsdatum:document.getElementById('gruendungsdatum')?.value||'', ust_idnr:document.getElementById('ustid')?.value||'', bundesland:document.getElementById('bundesland')?.value||'', ist_soll_versteuerung:document.getElementById('versteuerung')?.value||'', voranmeldungszeitraum:document.getElementById('voranmeldung')?.value||'', bilanz_oder_gewinnermittler:document.getElementById('bilanz')?.value||'', stifter:ss.map(({name})=>({name})) };
      await submitMultipartForm('stiftung', f, [...ss.map(s=>({id:s.upload_field_id,fieldName:`personalausweis_stifter_${s.field_index}`})),{id:'doc_stiftungsurkunde',fieldName:'stiftungsurkunde'}]);
    };
    if (!document.querySelector('#stifterContainer .child-card')) window.addStifter();
    initFileDropZones();
  };

  // ── EU / Freier Beruf ─────────────────────────────────────────────────────────

  window.portalPageInits['/eu.html'] = async function () {
    const auth = await requireAuth({ redirect: false });
    if (auth && auth.user) { const el = document.getElementById('userInfo'); if (el) el.innerText = 'Eingeloggt als: ' + auth.user; }
    window.submitPage = async function () {
      const f = { anrede:document.getElementById('anrede')?.value||'', unternehmensname:document.getElementById('unternehmensname')?.value||'', unternehmensform:document.getElementById('unternehmensform')?.value||'', strasse_hausnummer:document.getElementById('strasse')?.value||'', plz:document.getElementById('plz')?.value||'', ort:document.getElementById('ort')?.value||'', telefon:document.getElementById('telefon')?.value||'', mobil:document.getElementById('mobil')?.value||'', email:document.getElementById('email')?.value||'', bankverbindung:document.getElementById('bankverbindung')?.value||'', steuernummer:document.getElementById('steuernummer')?.value||'', unternehmensgegenstand:document.getElementById('gegenstand')?.value||'', gruendungsdatum:document.getElementById('gruendungsdatum')?.value||'', ust_idnr:document.getElementById('ustid')?.value||'', bundesland:document.getElementById('bundesland')?.value||'', ist_soll_versteuerung:document.getElementById('versteuerung')?.value||'', voranmeldungszeitraum:document.getElementById('voranmeldung')?.value||'', bilanz_oder_gewinnermittler:document.getElementById('bilanz')?.value||'' };
      await submitMultipartForm('eu', f, [{id:'doc_personalausweis_inhaber',fieldName:'personalausweis_inhaber'},{id:'doc_gewerbeanmeldung',fieldName:'gewerbeanmeldung'}]);
    };
    initFileDropZones();
  };
  // ── Admin: Benutzerverwaltung ─────────────────────────────────────────────

  const _N8N_LIST_URL   = 'https://n8n.agentsmithery.de/webhook/admin-list-users';
  const _N8N_ACTION_URL = 'https://n8n.agentsmithery.de/webhook/admin-user-action';
  const _N8N_CREATE_URL = 'https://n8n.agentsmithery.de/webhook/admin-create-user';

  async function _adminGetToken() {
    if (!window._sb) return null;
    const { data: { session } } = await window._sb.auth.getSession();
    return session ? session.access_token : null;
  }

  async function _adminLoadUsers() {
    const wrap = document.getElementById('tableWrap');
    const msg  = document.getElementById('msg');
    if (!wrap) return;
    if (msg) { msg.textContent = ''; msg.classList.remove('success'); }
    try {
      const token = await _adminGetToken();
      const res   = await fetch(_N8N_LIST_URL, { headers: { 'Authorization': 'Bearer ' + token } });
      const data  = await res.json().catch(() => null);
      if (!res.ok || !data || data.length === 0) {
        wrap.innerHTML = '<p class="admin-empty">' + (!res.ok ? 'Fehler beim Laden.' : 'Keine Benutzer vorhanden.') + '</p>';
        return;
      }
      wrap.innerHTML = `<table class="admin-table"><thead><tr>
        <th>E-Mail</th><th>Status</th><th>Rolle</th><th>Aktionen</th>
      </tr></thead><tbody id="userTableBody"></tbody></table>`;
      const tbody = document.getElementById('userTableBody');
      data.forEach(u => tbody.appendChild(_adminBuildRow(u)));
    } catch (_) {
      if (wrap) wrap.innerHTML = '<p class="admin-empty">Server nicht erreichbar.</p>';
    }
  }

  function _adminBuildRow(user) {
    const tr = document.createElement('tr');
    tr.id = 'row-' + user.id;
    const statusBadge = user.is_approved
      ? '<span class="badge badge-approved">✓ Freigegeben</span>'
      : '<span class="badge badge-pending">⏳ Ausstehend</span>';
    const adminBadge = user.is_admin ? '<span class="badge badge-admin">Admin</span>' : '';
    const approveBtn = user.is_approved
      ? `<button class="btn btn-revoke btn-sm" onclick="window._adminAction('${user.id}','revoke')">Sperren</button>`
      : `<button class="btn btn-approve btn-sm" onclick="window._adminAction('${user.id}','approve')">Freigeben</button>`;
    const adminBtn = user.is_admin
      ? `<button class="btn btn-admin-off btn-sm" onclick="window._adminAction('${user.id}','toggle-admin')">Admin entziehen</button>`
      : `<button class="btn btn-admin-on btn-sm"  onclick="window._adminAction('${user.id}','toggle-admin')">Zum Admin machen</button>`;
    tr.innerHTML = `
      <td style="font-weight:500">${escapeHtml(user.email)}</td>
      <td>${statusBadge}</td><td>${adminBadge}</td>
      <td><div class="row-actions">${approveBtn}${adminBtn}</div></td>`;
    return tr;
  }

  window._adminAction = async function (userId, type) {
    const msg = document.getElementById('msg');
    if (msg) { msg.textContent = ''; msg.classList.remove('success'); }
    try {
      const token = await _adminGetToken();
      const res   = await fetch(_N8N_ACTION_URL, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: type })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { if (msg) msg.textContent = data?.detail || data?.message || 'Aktion fehlgeschlagen.'; return; }
      if (msg) { msg.textContent = 'Gespeichert.'; msg.classList.add('success'); }
      await _adminLoadUsers();
    } catch (_) { if (msg) msg.textContent = 'Server nicht erreichbar.'; }
  };

  window._adminCreateUser = async function () {
    const email    = document.getElementById('newEmail')?.value.trim();
    const password = document.getElementById('newPassword')?.value;
    const msg      = document.getElementById('createMsg');
    if (msg) { msg.textContent = ''; msg.classList.remove('success'); }
    if (!email || !password) { if (msg) msg.textContent = 'Bitte E-Mail und Passwort eingeben.'; return; }
    if (password.length < 8) { if (msg) msg.textContent = 'Passwort muss mindestens 8 Zeichen haben.'; return; }
    try {
      const token = await _adminGetToken();
      const res   = await fetch(_N8N_CREATE_URL, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { if (msg) msg.textContent = data?.message || data?.detail || 'Fehler beim Anlegen.'; return; }
      if (msg) { msg.textContent = 'Benutzer erfolgreich angelegt.'; msg.classList.add('success'); }
      const emailEl = document.getElementById('newEmail');
      const pwdEl   = document.getElementById('newPassword');
      if (emailEl) emailEl.value = '';
      if (pwdEl)   pwdEl.value   = '';
      await _adminLoadUsers();
    } catch (_) { if (msg) msg.textContent = 'Server nicht erreichbar.'; }
  };

  window.portalPageInits['/admin.html'] = async function () {
    await _adminLoadUsers();
  };

})();
