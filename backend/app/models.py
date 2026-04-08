from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True)
    password_hash = Column(String)
    is_approved = Column(Boolean, nullable=False, default=False)
    is_admin    = Column(Boolean, nullable=False, default=False)


class SocialPost(Base):
    __tablename__ = "social_posts"

    id = Column(Integer, primary_key=True)
    topic = Column(String, nullable=True)
    hook = Column(Text, nullable=True)
    post_text = Column(Text, nullable=True)
    cta = Column(Text, nullable=True)
    image_b64 = Column(Text, nullable=True)   # base64-encoded PNG
    status = Column(String, default="draft")  # draft | approved | rejected
    n8n_resume_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)