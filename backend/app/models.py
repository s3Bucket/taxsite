from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from .database import Base


class SocialPost(Base):
    __tablename__ = "social_posts"

    id = Column(Integer, primary_key=True)
    topic = Column(String, nullable=True)
    hook = Column(Text, nullable=True)
    post_text = Column(Text, nullable=True)
    cta = Column(Text, nullable=True)
    image_b64 = Column(Text, nullable=True)
    status = Column(String, default="draft")
    n8n_resume_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)
