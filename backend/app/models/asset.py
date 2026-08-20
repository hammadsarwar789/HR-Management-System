import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Date, Text
from sqlalchemy.orm import relationship
from app.db.base import Base

class Asset(Base):
    __tablename__ = "assets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    asset_tag = Column(String(50), unique=True, nullable=False)
    category = Column(String(50), nullable=False)  # laptop | mobile | sim | equipment
    model = Column(String(100), nullable=False)
    serial_number = Column(String(100), unique=True, nullable=True)
    status = Column(String(20), default="available")  # available | assigned | retired | lost

    assignments = relationship("AssetAssignment", back_populates="asset", cascade="all, delete-orphan")

class AssetAssignment(Base):
    __tablename__ = "asset_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    asset_id = Column(String(36), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False)
    assigned_date = Column(Date, nullable=False)
    returned_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)

    asset = relationship("Asset", back_populates="assignments")
    employee = relationship("Employee", backref="asset_assignments")

class AssetRequest(Base):
    __tablename__ = "asset_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    asset_id = Column(String(36), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False)
    requested_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)
    status = Column(String(20), default="PENDING")  # PENDING | APPROVED | REJECTED | CANCELLED
    actioned_by_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    actioned_at = Column(DateTime, nullable=True)
    rejection_reason = Column(Text, nullable=True)

    asset = relationship("Asset", backref="requests")
    employee = relationship("Employee", backref="asset_requests")
