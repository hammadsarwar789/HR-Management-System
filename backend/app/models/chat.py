import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Text, BigInteger, JSON, Index
from sqlalchemy.orm import relationship
from app.db.base import Base

class Channel(Base):
    __tablename__ = "channels"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=True)  # NULL for 1-on-1 Direct Messages
    is_direct_message = Column(Boolean, default=False)
    is_private = Column(Boolean, default=False)
    created_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    invite_code = Column(String(50), unique=True, nullable=True, default=lambda: str(uuid.uuid4())[:8])
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    creator = relationship("User", foreign_keys=[created_by])
    members = relationship("ChannelMember", back_populates="channel", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="channel", cascade="all, delete-orphan")

class ChannelMember(Base):
    __tablename__ = "channel_members"

    channel_id = Column(String(36), ForeignKey("channels.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role = Column(String(20), default="member")  # 'admin', 'member'
    joined_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_read_at = Column(DateTime(timezone=True), nullable=True, default=lambda: datetime.now(timezone.utc))

    channel = relationship("Channel", back_populates="members")
    user = relationship("User")

class Message(Base):
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    channel_id = Column(String(36), ForeignKey("channels.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True) # NULL for System/Bot
    sender_type = Column(String(20), default="user")  # 'user', 'system', 'bot'
    content = Column(Text, nullable=True)
    is_edited = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    channel = relationship("Channel", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])
    attachments = relationship("Attachment", back_populates="message", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_messages_channel_created", "channel_id", "created_at"),
    )

class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    message_id = Column(String(36), ForeignKey("messages.id", ondelete="CASCADE"), nullable=True)
    file_name = Column(String(255), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)
    storage_path = Column(Text, nullable=False)
    uploaded_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    message = relationship("Message", back_populates="attachments")
    uploader = relationship("User", foreign_keys=[uploaded_by])

class HRPolicyChunk(Base):
    __tablename__ = "hr_policy_chunks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)  # e.g., 'Leave Entitlement', 'Code of Conduct'
    content = Column(Text, nullable=False)
    embedding = Column(JSON, nullable=False)  # List of floats for cosine similarity calculation
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
