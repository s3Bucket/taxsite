from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File, Form
from sqlalchemy.orm import Session
from itsdangerous import URLSafeSerializer, BadSignature
import os
import requests

from .database import SessionLocal, engine, Base
from .models import User
from .schemas import UserCreate, UserLogin
from .auth import hash_password, verify_password

app = FastAPI()

Base.metadata.create_all(bind=engine)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is not set")

COOKIE_NAME = "portal_session"
serializer = URLSafeSerializer(SECRET_KEY, salt="auth-session")

# Darf leer sein; dann funktioniert Auth weiter, nur Submit nicht
N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL", "").strip()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_session_cookie(user_id: int) -> str:
    return serializer.dumps({"user_id": user_id})


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


@app.post("/api/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    new_user = User(
        email=user.email,
        password_hash=hash_password(user.password)
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"status": "registered"}


@app.post("/api/login")
def login(user: UserLogin, response: Response, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()

    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    session_value = create_session_cookie(db_user.id)

    response.set_cookie(
        key=COOKIE_NAME,
        value=session_value,
        httponly=True,
        secure=True,
        samesite="Lax",
        max_age=60 * 60 * 8,
        path="/"
    )

    return {
        "status": "ok",
        "user": db_user.email
    }


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"status": "logged_out"}


@app.get("/api/auth/check")
def auth_check(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    return {
        "status": "authenticated",
        "user": user.email
    }


@app.post("/api/forms/submit")
async def submit_form(
        request: Request,
        db: Session = Depends(get_db)
):
    user = get_current_user(request, db)

    if not N8N_WEBHOOK_URL:
        raise HTTPException(
            status_code=500,
            detail="N8N_WEBHOOK_URL is not configured"
        )

    form = await request.form()

    form_name = form.get("form_name")
    data = form.get("data")

    if not form_name or not data:
        raise HTTPException(
            status_code=400,
            detail="form_name or data missing"
        )

    # Normale Felder für n8n
    forward_data = {
        "form_name": str(form_name),
        "data": str(data),
        "submitted_by_user_id": str(user.id),
        "submitted_by_email": user.email,
    }

    # Alle Upload-Felder einsammeln
    forward_files = []

    for key, value in form.multi_items():
        if isinstance(value, UploadFile):
            content = await value.read()

            forward_files.append(
                (
                    key,   # <-- echter Feldname, z.B. "gesellschaftsvertrag"
                    (
                        value.filename,
                        content,
                        value.content_type or "application/octet-stream"
                    )
                )
            )

    try:
        print("FORWARD DATA:", forward_data)
        print("FORWARD FILE COUNT:", len(forward_files))
        print("FORWARD FILE FIELDS:", [item[0] for item in forward_files])
        response = requests.post(
            N8N_WEBHOOK_URL,
            data=forward_data,
            files=forward_files,
            timeout=60
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"n8n webhook failed: {str(exc)}"
        )

    return {
        "status": "forwarded",
        "submitted_by": user.email,
        "file_count": len(forward_files)
    }