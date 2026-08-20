import uuid
from datetime import datetime, date
from sqlalchemy import Column, String, DateTime, Date, ForeignKey, Numeric, Text
from sqlalchemy.orm import relationship
from app.db.base import Base

class ExpenseRequest(Base):
    __tablename__ = "expense_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(50), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    description = Column(Text, nullable=True)
    claim_date = Column(Date, default=date.today)
    receipt_filename = Column(String(255), nullable=True)
    receipt_storage_key = Column(Text, nullable=True)
    status = Column(String(20), default="pending")  # pending | approved | rejected | reimbursed
    approved_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    payroll_run_id = Column(String(36), ForeignKey("payroll_runs.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", backref="expense_requests")
    approver = relationship("User", foreign_keys=[approved_by])
