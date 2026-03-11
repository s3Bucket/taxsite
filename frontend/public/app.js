async function backendJson(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    let data = null;
    try {
        data = await response.json();
    } catch (_) {}

    return { response, data };
}

async function logout() {
    try {
        await fetch("/api/logout", {
            method: "POST",
            credentials: "include"
        });
    } catch (_) {
        // ignore
    }
    window.location.href = "/index.html";
}

async function requireAuth() {
    const res = await fetch("/api/auth/check", {
        method: "GET",
        credentials: "include"
    });

    if (!res.ok) {
        window.location.href = "/index.html";
        return null;
    }

    const data = await res.json().catch(() => null);
    return data;
}

async function submitFormData(formName, payload, msgId = "msg") {
    const msg = document.getElementById(msgId);
    if (msg) {
        msg.textContent = "";
        msg.classList.remove("success");
    }

    try {
        const res = await fetch("/api/forms/submit", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                form_name: formName,
                ...payload
            })
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
            if (msg) {
                msg.textContent = data?.detail || "Senden fehlgeschlagen.";
            }
            return false;
        }

        if (msg) {
            msg.textContent = "Daten erfolgreich gesendet.";
            msg.classList.add("success");
        }

        return true;
    } catch (err) {
        if (msg) {
            msg.textContent = "Server nicht erreichbar.";
        }
        return false;
    }
}