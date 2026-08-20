import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, ForeignKey, Date, Text, Index
from sqlalchemy.orm import relationship
from app.db.base import Base

class CompanyRevenue(Base):
    __tablename__ = "company_revenues"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    reference_no = Column(String(64), unique=True, nullable=False, index=True)
    source_type = Column(String(30), nullable=False, default="PROJECT")  # PROJECT | PRODUCT_SAAS | OTHER
    title = Column(String(255), nullable=False)
    client_name = Column(String(255), nullable=True)
    project_id = Column(String(36), nullable=True)
    gross_amount = Column(Float, nullable=False, default=0.0)
    tax_deducted = Column(Float, nullable=False, default=0.0)
    fbr_withholding_rate = Column(Float, nullable=False, default=0.0)  # FBR Withholding % (e.g. 3.0%, 10.0%)
    net_amount = Column(Float, nullable=False, default=0.0)
    currency = Column(String(10), nullable=False, default="PKR")

    # FX & Accrual Accounting Fields
    conversion_rate = Column(Float, nullable=True, default=1.0)
    booked_rate = Column(Float, nullable=False, default=1.0)  # Rate at invoice issue / accrual
    settlement_rate = Column(Float, nullable=False, default=1.0)  # Rate on settlement date
    realized_fx_gain_loss = Column(Float, nullable=False, default=0.0)  # net_amount * (settlement_rate - booked_rate) in PKR

    accrual_date = Column(Date, nullable=False)  # Date revenue was earned / invoiced
    received_date = Column(Date, nullable=False)  # Target or expected received date
    settlement_date = Column(Date, nullable=True)  # Actual date cash cleared in bank

    payment_method = Column(String(50), nullable=False, default="WIRE_TRANSFER")  # WIRE_TRANSFER | PAYONEER | STRIPE | CASH
    status = Column(String(20), nullable=False, default="CLEARED", index=True)  # PENDING | CLEARED | REFUNDED
    proof_document_url = Column(String(500), nullable=True)
    created_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    created_by = relationship("User", foreign_keys=[created_by_user_id])

    __table_args__ = (
        Index("idx_revenue_source_date", "source_type", "accrual_date"),
    )
