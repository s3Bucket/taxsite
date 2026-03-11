from fastapi import FastAPI, Depends, HTTPException, Response, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from itsdangerous import URLSafeSerializer, BadSignature
import os

from .database import SessionLocal, engine, Base
from .models import User
from .schemas import UserCreate, UserLogin
from .auth import hash_password, verify_password

app = FastAPI()

Base.metadata.create_all(bind=engine)

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-please")
COOKIE_NAME = "portal_session"

serializer = URLSafeSerializer(SECRET_KEY, salt="auth-session")


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
        secure=True,      # bei HTTPS
        samesite="Lax",
        max_age=60 * 60 * 8,  # 8 Stunden
        path="/"
    )

    return {"status": "ok", "user": db_user.email}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"status": "logged_out"}


@app.get("/api/auth/check")
def auth_check(request: Request, db: Session = Depends(get_db)):
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

    return {"status": "authenticated", "user": user.email}