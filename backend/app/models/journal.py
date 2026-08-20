import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, ForeignKey, Date, Text, JSON
from sqlalchemy.orm import relationship
from app.db.base import Base

class FinancialJournalEntry(Base):
    __tablename__ = "financial_journal_entries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    entry_date = Column(Date, nullable=False, default=datetime.utcnow)
    reference_no = Column(String(64), nullable=False, index=True)
    account_debit = Column(String(64), nullable=False)   # e.g., 1010-BANK-MAIN, 1020-PAYONEER-ESCROW
    account_credit = Column(String(64), nullable=False)  # e.g., 4010-REVENUE-SERVICES, 5010-PAYROLL-EXPENSE
    amount_pkr = Column(Float, nullable=False, default=0.0)
    description = Column(Text, nullable=True)
    created_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    created_by = relationship("User", foreign_keys=[created_by_user_id])

class RevenueAuditLog(Base):
    __tablename__ = "revenue_audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    revenue_id = Column(String(36), ForeignKey("company_revenues.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(50), nullable=False)  # CREATED | SETTLED | MODIFIED | REFUNDED
    previous_state = Column(JSON, nullable=True)
    new_state = Column(JSON, nullable=True)
    actor_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    revenue = relationship("CompanyRevenue", backref="audit_logs")
    actor = relationship("User", foreign_keys=[actor_id])
