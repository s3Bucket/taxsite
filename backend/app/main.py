from fastapi import FastAPI, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
import os
import requests
import hashlib
import jwt as pyjwt

from starlette.datastructures import UploadFile as StarletteUploadFile
from .database import SessionLocal, engine, Base

app = FastAPI()
Base.metadata.create_all(bind=engine)

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is not set")

N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL", "").strip()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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


def get_profile(user_id: str, db: Session) -> dict:
    row = db.execute(
        text("SELECT email, is_approved, is_admin FROM profiles WHERE id = :uid"),
        {"uid": user_id}
    ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Profile not found")
    return {
        "email": row.email,
        "is_approved": bool(row.is_approved),
        "is_admin": bool(row.is_admin),
    }


@app.get("/api/auth/check")
def auth_check(request: Request, db: Session = Depends(get_db)):
    payload = verify_jwt(request)
    profile = get_profile(payload["sub"], db)
    if not profile["is_approved"]:
        raise HTTPException(status_code=403, detail="Account not yet approved")
    return {
        "status": "authenticated",
        "user": profile["email"],
        "is_admin": profile["is_admin"],
    }


@app.post("/api/forms/submit")
async def submit_form(request: Request, db: Session = Depends(get_db)):
    payload = verify_jwt(request)
    profile = get_profile(payload["sub"], db)
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
            file_signature = hashlib.sha256(
                (f"{key}|{value.filename}|{value.content_type}|".encode("utf-8") + content)
            ).hexdigest()
            if file_signature in seen_files:
                continue
            seen_files.add(file_signature)
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
