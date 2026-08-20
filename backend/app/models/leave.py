import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Numeric, Date, Text, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base

class LeaveType(Base):
    __tablename__ = "leave_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False)
    allowed_days_per_year = Column(Integer, nullable=False)
    requires_hr_approval = Column(Boolean, default=False)

class LeaveBalance(Base):
    __tablename__ = "leave_balances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    leave_type_id = Column(Integer, ForeignKey("leave_types.id"), nullable=False)
    year = Column(Integer, nullable=False)
    allocated_days = Column(Numeric(4, 1), nullable=False)
    used_days = Column(Numeric(4, 1), default=0.0)

    __table_args__ = (
        UniqueConstraint("employee_id", "leave_type_id", "year", name="unique_employee_leave_balance"),
    )

    employee = relationship("Employee", backref="leave_balances")
    leave_type = relationship("LeaveType")

class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    leave_type_id = Column(Integer, ForeignKey("leave_types.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    total_days = Column(Numeric(4, 1), nullable=False)
    is_half_day = Column(Boolean, default=False)
    reason = Column(Text, nullable=True)
    status = Column(String(20), default="pending")  # pending | approved | rejected | cancelled
    approved_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", backref="leave_requests")
    leave_type = relationship("LeaveType")
    approver = relationship("User", foreign_keys=[approved_by])
