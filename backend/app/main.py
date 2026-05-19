from fastapi import FastAPI, HTTPException, Request, Response
import os
import requests
import hashlib
import jwt as pyjwt

from starlette.datastructures import UploadFile as StarletteUploadFile

app = FastAPI()

SUPABASE_URL         = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_ANON_KEY    = os.getenv("SUPABASE_ANON_KEY", "")
JWT_SECRET           = os.getenv("JWT_SECRET")
N8N_WEBHOOK_URL      = os.getenv("N8N_WEBHOOK_URL", "").strip()

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is not set")

_COOKIE_NAME = "portal_session"
_COOKIE_OPTS = dict(httponly=True, samesite="lax", path="/")


def _service_headers():
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey": SUPABASE_SERVICE_KEY,
        "Content-Type": "application/json",
    }


def _anon_headers():
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
    }


def verify_jwt(request: Request) -> dict:
    token = request.cookies.get(_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(
            token, JWT_SECRET, algorithms=["HS256"],
            options={"verify_aud": False}
        )
        if payload.get("role") != "authenticated":
            raise HTTPException(status_code=401, detail="Invalid token role")
        return payload
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_mandant(email: str) -> str:
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/mandanten",
        params={"email": f"eq.{email}", "select": "email", "limit": "1"},
        headers=_service_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=403, detail="Kein Mandant für diese E-Mail")
    return rows[0]["email"]


# ── Auth ─────────────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login(body: dict, response: Response):
    email    = (body.get("email") or "").strip()
    password = body.get("password") or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="E-Mail und Passwort erforderlich")

    resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        json={"email": email, "password": password},
        headers=_anon_headers(),
        timeout=10,
    )
    if resp.status_code == 400:
        raise HTTPException(status_code=401, detail="Ungültige Zugangsdaten")
    if not resp.ok:
        raise HTTPException(status_code=resp.status_code, detail="Login fehlgeschlagen")

    data         = resp.json()
    access_token = data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=500, detail="Kein Token erhalten")

    # E-Mail gegen mandanten prüfen
    user_email = (data.get("user") or {}).get("email", "")
    require_mandant(user_email)

    secure = True  # in Produktion immer HTTPS
    response.set_cookie(
        _COOKIE_NAME, access_token,
        httponly=True, samesite="lax", path="/", secure=secure,
    )
    return {"status": "ok", "user": user_email}


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(_COOKIE_NAME, path="/")
    return {"status": "ok"}


@app.post("/api/auth/reset-request")
def reset_request(body: dict, request: Request):
    email = (body.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="E-Mail erforderlich")

    redirect_to = body.get("redirect_to") or ""

    resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/recover",
        json={"email": email},
        params={"redirect_to": redirect_to} if redirect_to else {},
        headers=_anon_headers(),
        timeout=10,
    )
    # Supabase antwortet immer mit 200 (verhindert E-Mail-Enumeration)
    return {"status": "ok"}


@app.post("/api/auth/set-password")
def set_password(body: dict, response: Response):
    token    = (body.get("token") or "").strip()
    password = body.get("password") or ""
    if not token or not password:
        raise HTTPException(status_code=400, detail="Token und Passwort erforderlich")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Passwort zu kurz (min. 8 Zeichen)")

    resp = requests.put(
        f"{SUPABASE_URL}/auth/v1/user",
        json={"password": password},
        headers={**_anon_headers(), "Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if not resp.ok:
        raise HTTPException(status_code=400, detail="Passwort konnte nicht gesetzt werden")

    # Direkt einloggen nach Passwort-Setzen
    user_email = (resp.json().get("email") or "").strip()
    if user_email:
        login_resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={"email": user_email, "password": password},
            headers=_anon_headers(),
            timeout=10,
        )
        if login_resp.ok:
            access_token = login_resp.json().get("access_token")
            if access_token:
                response.set_cookie(
                    _COOKIE_NAME, access_token,
                    httponly=True, samesite="lax", path="/", secure=True,
                )
                return {"status": "ok", "user": user_email}

    return {"status": "ok"}


# ── Auth-Check & Formular ────────────────────────────────────────────────────

@app.get("/api/auth/check")
def auth_check(request: Request):
    payload = verify_jwt(request)
    email   = payload.get("email", "")
    if not email:
        raise HTTPException(status_code=401, detail="E-Mail nicht im Token")
    require_mandant(email)
    return {"status": "authenticated", "user": email}


@app.post("/api/forms/submit")
async def submit_form(request: Request):
    payload = verify_jwt(request)
    email   = payload.get("email", "")
    if not email:
        raise HTTPException(status_code=401, detail="E-Mail nicht im Token")
    require_mandant(email)

    if not N8N_WEBHOOK_URL:
        raise HTTPException(status_code=500, detail="N8N_WEBHOOK_URL is not configured")

    form      = await request.form()
    form_name = form.get("form_name")
    data      = form.get("data")

    if not form_name or not data:
        raise HTTPException(status_code=400, detail="form_name or data missing")

    forward_data = {
        "form_name":           str(form_name),
        "data":                str(data),
        "submitted_by_user_id": str(payload["sub"]),
        "submitted_by_email":  email,
    }

    forward_files = []
    seen_files    = set()

    for key, value in form.multi_items():
        if isinstance(value, StarletteUploadFile):
            content = await value.read()
            sig = hashlib.sha256(
                (f"{key}|{value.filename}|{value.content_type}|".encode() + content)
            ).hexdigest()
            if sig in seen_files:
                continue
            seen_files.add(sig)
            forward_files.append(
                (key, (value.filename, content, value.content_type or "application/octet-stream"))
            )

    try:
        resp = requests.post(
            N8N_WEBHOOK_URL,
            data=forward_data,
            files=forward_files,
            timeout=60,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"n8n webhook failed: {str(exc)}")

    return {"status": "forwarded", "submitted_by": email, "file_count": len(forward_files)}
