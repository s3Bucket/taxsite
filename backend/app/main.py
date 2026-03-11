from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session

from .database import SessionLocal, engine
from .models import User, Base
from .auth import hash_password, verify_password

app = FastAPI()

Base.metadata.create_all(bind=engine)

def get_db():

    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()


@app.post("/register")
def register(email: str, password: str, db: Session = Depends(get_db)):

    existing = db.query(User).filter(User.email == email).first()

    if existing:
        raise HTTPException(400, "User exists")

    user = User(
        email=email,
        password_hash=hash_password(password)
    )

    db.add(user)
    db.commit()

    return {"status": "registered"}


@app.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):

    user = db.query(User).filter(User.email == email).first()

    if not user:
        raise HTTPException(401)

    if not verify_password(password, user.password_hash):
        raise HTTPException(401)

    return {"status": "ok"}