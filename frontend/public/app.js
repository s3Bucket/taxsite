async function requireAuth() {
    const res = await fetch("/api/auth/check", {
        method: "GET",
        credentials: "include"
    });

    if (!res.ok) {
        window.location.href = "/index.html";
        return null;
    }

    try {
        return await res.json();
    } catch (_) {
        return null;
    }
}

async function logout() {
    try {
        await fetch("/api/logout", {
            method: "POST",
            credentials: "include"
        });
    } catch (_) {}

    window.location.href = "/index.html";
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
                data: payload
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