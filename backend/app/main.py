from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
from itsdangerous import URLSafeSerializer, BadSignature
import os
import json
import requests

from .database import SessionLocal, engine, Base
from .models import User

app = FastAPI()

Base.metadata.create_all(bind=engine)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is not set")

COOKIE_NAME = "portal_session"
serializer = URLSafeSerializer(SECRET_KEY, salt="auth-session")

N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL")
if not N8N_WEBHOOK_URL:
    raise RuntimeError("N8N_WEBHOOK_URL is not set")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def read_session_cookie(cookie_value: str):
    try:
        return serializer.loads(cookie_value)
    except BadSignature:
        return None


def get_current_user(request: Request, db: Session) -> User:
    cookie_value = request.cookies.get(COOKIE_NAME)

    if not cookie_value:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session_data = read_session_cookie(cookie_value)
    if not session_data:
        raise HTTPException(status_code=401, detail="Invalid session")

    user_id = session_data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


@app.post("/api/forms/submit")
async def submit_form(
        request: Request,
        form_name: str = Form(...),
        data: str = Form(...),
        files: list[UploadFile] = File(default=[]),
        db: Session = Depends(get_db)
):
    user = get_current_user(request, db)

    # FormData für n8n vorbereiten
    forward_data = {
        "form_name": form_name,
        "data": data,
        "submitted_by_user_id": str(user.id),
        "submitted_by_email": user.email,
    }

    forward_files = []
    for file in files:
        content = await file.read()
        forward_files.append(
            (
                "files",
                (file.filename, content, file.content_type or "application/octet-stream")
            )
        )

    try:
        response = requests.post(
            N8N_WEBHOOK_URL,
            data=forward_data,
            files=forward_files,
            timeout=60
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"n8n webhook failed: {str(exc)}")

    return {
        "status": "forwarded",
        "submitted_by": user.email
    }