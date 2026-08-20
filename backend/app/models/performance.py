import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Numeric, Text
from sqlalchemy.orm import relationship
from app.db.base import Base

class PerformanceGoal(Base):
    __tablename__ = "performance_goals"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    cycle = Column(String(20), nullable=False)  # e.g. '2026-H1'
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="in_progress")

    employee = relationship("Employee", backref="performance_goals")

class PerformanceReview(Base):
    __tablename__ = "performance_reviews"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    reviewer_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    cycle = Column(String(20), nullable=False)
    kpi_score = Column(Numeric(4, 2), nullable=True)
    feedback = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    employee = relationship("Employee", backref="performance_reviews")
    reviewer = relationship("User", foreign_keys=[reviewer_id])
