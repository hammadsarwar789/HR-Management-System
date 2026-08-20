import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Numeric, Date, Text, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base

class SalaryStructure(Base):
    __tablename__ = "salary_structures"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    basic_salary = Column(Numeric(12, 2), nullable=False)
    allowances = Column(JSON, default=dict)
    security_deduction_rate = Column(Numeric(5, 2), default=5.00)  # 5% Security holdback
    tax_bracket_rate = Column(Numeric(5, 2), default=0.00)
    effective_from = Column(Date, nullable=False)

    employee = relationship("Employee", back_populates="salary_structures")

class PayrollRun(Base):
    __tablename__ = "payroll_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False)
    month_year = Column(Date, nullable=False)
    basic_salary = Column(Numeric(12, 2), nullable=False)
    total_allowances = Column(Numeric(12, 2), default=0.00)
    overtime_pay = Column(Numeric(12, 2), default=0.00)
    bonus = Column(Numeric(12, 2), default=0.00)
    tax_deducted = Column(Numeric(12, 2), default=0.00)
    security_deduction = Column(Numeric(12, 2), default=0.00)  # 5% holdback calculation
    unpaid_leave_deductions = Column(Numeric(12, 2), default=0.00)  # Missed punches & unpaid absence deductions
    other_deductions = Column(Numeric(12, 2), default=0.00)
    reimbursements_total = Column(Numeric(12, 2), default=0.00)  # Non-taxable expense reimbursements
    attendance_summary = Column(JSON, default=dict)  # Structured attendance metrics breakdown
    net_salary = Column(Numeric(12, 2), nullable=False)
    payslip_storage_key = Column(Text, nullable=True)
    status = Column(String(20), default="processed")  # pending | processed | failed
    generated_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("employee_id", "month_year", name="unique_employee_monthly_payroll"),
    )

    employee = relationship("Employee", back_populates="payroll_runs")


class EmployeeArrears(Base):
    __tablename__ = "employee_arrears"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    payroll_run_id = Column(String(36), ForeignKey("payroll_runs.id", ondelete="SET NULL"), nullable=True)
    month_year = Column(Date, nullable=False)
    arrears_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    cleared_amount = Column(Numeric(12, 2), default=0.00)
    status = Column(String(30), default="PENDING")  # PENDING | CLEARED | DEDUCTED
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", backref="arrears_records")

