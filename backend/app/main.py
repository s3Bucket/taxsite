from fastapi import FastAPI, HTTPException, Request
import os
import requests
import hashlib
import jwt as pyjwt

from starlette.datastructures import UploadFile as StarletteUploadFile

app = FastAPI()

SUPABASE_URL     = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
JWT_SECRET       = os.getenv("JWT_SECRET")
N8N_WEBHOOK_URL  = os.getenv("N8N_WEBHOOK_URL", "").strip()

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is not set")


def _supabase_headers():
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey": SUPABASE_SERVICE_KEY,
    }


def verify_jwt(request: Request) -> dict:
    token = request.cookies.get("portal_session")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
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


def get_profile(user_id: str) -> dict:
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/profiles",
        params={"id": f"eq.{user_id}", "select": "email,is_approved,is_admin"},
        headers=_supabase_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=401, detail="Profile not found")
    row = rows[0]
    return {
        "email": row["email"],
        "is_approved": bool(row["is_approved"]),
        "is_admin": bool(row["is_admin"]),
    }


@app.get("/api/auth/check")
def auth_check(request: Request):
    payload = verify_jwt(request)
    profile = get_profile(payload["sub"])
    if not profile["is_approved"]:
        raise HTTPException(status_code=403, detail="Account not yet approved")
    return {
        "status": "authenticated",
        "user": profile["email"],
        "is_admin": profile["is_admin"],
    }


@app.post("/api/register")
async def register_user(request: Request):
    body = await request.json()
    email = body.get("email", "").strip()
    password = body.get("password", "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password required")

    resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        json={"email": email, "password": password, "email_confirm": True},
        headers=_supabase_headers(),
        timeout=10,
    )
    if resp.status_code == 422:
        raise HTTPException(status_code=409, detail="Email already registered")
    if not resp.ok:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    user_id = resp.json().get("id")
    if user_id:
        # Profil anlegen falls kein DB-Trigger existiert (upsert — kein Fehler wenn schon vorhanden)
        requests.post(
            f"{SUPABASE_URL}/rest/v1/profiles",
            json={"id": user_id, "email": email, "is_approved": False, "is_admin": False},
            headers={**_supabase_headers(), "Prefer": "resolution=ignore-duplicates"},
            timeout=10,
        )

    return {"status": "registered"}


@app.post("/api/forms/submit")
async def submit_form(request: Request):
    payload = verify_jwt(request)
    profile = get_profile(payload["sub"])
    if not profile["is_approved"]:
        raise HTTPException(status_code=403, detail="Account not approved")

    if not N8N_WEBHOOK_URL:
        raise HTTPException(status_code=500, detail="N8N_WEBHOOK_URL is not configured")

    form = await request.form()
    form_name = form.get("form_name")
    data = form.get("data")

    if not form_name or not data:
        raise HTTPException(status_code=400, detail="form_name or data missing")

    forward_data = {
        "form_name": str(form_name),
        "data": str(data),
        "submitted_by_user_id": str(payload["sub"]),
        "submitted_by_email": profile["email"],
    }

    forward_files = []
    seen_files = set()

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

    return {
        "status": "forwarded",
        "submitted_by": profile["email"],
        "file_count": len(forward_files),
    }
