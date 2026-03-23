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
      // ignore network errors on logout and still redirect
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
        if (!input || !input.files || input.files.length === 0) {
          continue;
        }

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

  window.requireAuth = requireAuth;
  window.redirectIfAuthenticated = redirectIfAuthenticated;
  window.logout = logout;
  window.submitMultipartForm = submitMultipartForm;
})();
