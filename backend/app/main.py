from fastapi import FastAPI, HTTPException, Request
import os
import requests
import hashlib
import jwt as pyjwt

from starlette.datastructures import UploadFile as StarletteUploadFile

app = FastAPI()

SUPABASE_URL         = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
JWT_SECRET           = os.getenv("JWT_SECRET")
N8N_WEBHOOK_URL      = os.getenv("N8N_WEBHOOK_URL", "").strip()

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


def require_mandant(email: str) -> str:
    """Verify email exists in mandanten table and return it."""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/mandanten",
        params={"email": f"eq.{email}", "select": "email", "limit": "1"},
        headers=_supabase_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=403, detail="Kein Mandant für diese E-Mail gefunden")
    return rows[0]["email"]


@app.get("/api/auth/check")
def auth_check(request: Request):
    payload = verify_jwt(request)
    email = payload.get("email", "")
    if not email:
        raise HTTPException(status_code=401, detail="E-Mail nicht im Token")
    require_mandant(email)
    return {"status": "authenticated", "user": email}


@app.post("/api/forms/submit")
async def submit_form(request: Request):
    payload = verify_jwt(request)
    email = payload.get("email", "")
    if not email:
        raise HTTPException(status_code=401, detail="E-Mail nicht im Token")
    require_mandant(email)

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
        "submitted_by_email": email,
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
        "submitted_by": email,
        "file_count": len(forward_files),
    }
