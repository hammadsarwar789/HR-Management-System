import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Date, Text
from sqlalchemy.orm import relationship
from app.db.base import Base

class Holiday(Base):
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    date = Column(Date, nullable=False)
    type = Column(String(20), default="public")  # public | company

class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    category = Column(String(20), default="general")  # general | event | birthday | holiday
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    author = relationship("User", foreign_keys=[created_by])
