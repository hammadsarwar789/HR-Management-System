import uuid
import json
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text, JSON, Date
from sqlalchemy.orm import relationship
from app.db.base import Base

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    manager_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    manager = relationship("User", foreign_keys=[manager_id])
    employees = relationship("Employee", back_populates="department")

class Employee(Base):
    __tablename__ = "employees"

    id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    employee_code = Column(String(30), unique=True, nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    cnic = Column(String(20), unique=True, nullable=False)
    phone = Column(String(20), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    designation = Column(String(100), nullable=False)
    location = Column(String(100), default="Main Office")
    employment_type = Column(String(30), nullable=False)  # full_time | part_time | contract
    joining_date = Column(Date, nullable=False)
    resignation_date = Column(Date, nullable=True)
    emergency_contact = Column(JSON, default=dict)
    status = Column(String(20), default="active")  # active | resigned | terminated
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="employee")
    department = relationship("Department", back_populates="employees")
    documents = relationship("EmployeeDocument", back_populates="employee", cascade="all, delete-orphan")
    salary_structures = relationship("SalaryStructure", back_populates="employee", cascade="all, delete-orphan")
    payroll_runs = relationship("PayrollRun", back_populates="employee")

class EmployeeDocument(Base):
    __tablename__ = "employee_documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    doc_type = Column(String(50), nullable=False)  # cnic | cv | certificate | contract | offer_letter
    storage_key = Column(Text, nullable=False)
    uploaded_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="documents")
    shares = relationship("DocumentShare", back_populates="document", cascade="all, delete-orphan")


class DocumentShare(Base):
    __tablename__ = "document_shares"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String(36), ForeignKey("employee_documents.id", ondelete="CASCADE"), nullable=False)
    uploader_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipient_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    target_role = Column(String(50), nullable=True)  # LINE_MANAGER | HR_ADMIN | ALL
    target_department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    permission = Column(String(20), default="VIEW")  # VIEW | DOWNLOAD | APPROVE
    status = Column(String(20), default="SHARED")  # SHARED | ACKNOWLEDGED | REVOKED
    note = Column(Text, nullable=True)
    shared_at = Column(DateTime, default=datetime.utcnow)
    viewed_at = Column(DateTime, nullable=True)

    document = relationship("EmployeeDocument", back_populates="shares")
    uploader = relationship("User", foreign_keys=[uploader_id])
    recipient = relationship("User", foreign_keys=[recipient_id])
    target_department = relationship("Department")
