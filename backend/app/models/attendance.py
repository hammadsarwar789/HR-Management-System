import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Numeric, Date, Time, Boolean, Text, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base

class AttendancePolicy(Base):
    __tablename__ = "attendance_policies"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    standard_hours = Column(Numeric(4, 2), default=8.0)
    min_full_day_hours = Column(Numeric(4, 2), default=7.5)
    half_day_threshold = Column(Numeric(4, 2), default=4.0)
    grace_minutes = Column(Integer, default=15)
    late_after_minutes = Column(Integer, default=15)
    overtime_after_hours = Column(Numeric(4, 2), default=8.0)
    max_daily_overtime = Column(Numeric(4, 2), default=4.0)
    break_duration_mins = Column(Integer, default=60)
    auto_deduct_break = Column(Boolean, default=False)
    weekend_overtime_enabled = Column(Boolean, default=True)
    holiday_overtime_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    shifts = relationship("Shift", back_populates="policy", cascade="all, delete-orphan")


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    policy_id = Column(String(36), ForeignKey("attendance_policies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    shift_type = Column(String(30), default="FIXED")  # FIXED | FLEXIBLE | NIGHT | REMOTE
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    is_overnight = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    policy = relationship("AttendancePolicy", back_populates="shifts")
    employee_assignments = relationship("EmployeeShift", back_populates="shift", cascade="all, delete-orphan")
    attendances = relationship("Attendance", back_populates="shift")


class EmployeeShift(Base):
    __tablename__ = "employee_shifts"
    __table_args__ = (
        UniqueConstraint("user_id", "effective_from", name="uix_employee_shift_effective"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    shift_id = Column(String(36), ForeignKey("shifts.id", ondelete="RESTRICT"), nullable=False)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", foreign_keys=[user_id])
    shift = relationship("Shift", back_populates="employee_assignments")


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint("employee_id", "date", name="unique_employee_daily_attendance"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    shift_id = Column(String(36), ForeignKey("shifts.id", ondelete="SET NULL"), nullable=True)
    date = Column(Date, nullable=False)
    check_in = Column(DateTime, nullable=True)
    check_out = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False)  # present | absent | half_day | on_leave | holiday | late_present | incomplete_absent
    calculated_status = Column(String(30), default="NOT_STARTED")  # NOT_STARTED | IN_SHIFT | ON_BREAK | PUNCHED_OUT | LATE | EARLY_LEAVING | HALF_DAY | ABSENT | REGULARIZED | OVERTIME
    work_mode = Column(String(30), default="OFFICE")  # OFFICE | REMOTE | HYBRID | FIELD
    late_minutes = Column(Integer, default=0)
    early_leaving_minutes = Column(Integer, default=0)
    regular_hours = Column(Numeric(4, 2), default=0.00)
    break_duration_hours = Column(Numeric(4, 2), default=0.00)
    unapproved_ot_hours = Column(Numeric(4, 2), default=0.00)
    claimed_ot_hours = Column(Numeric(4, 2), default=0.00)
    approved_ot_hours = Column(Numeric(4, 2), default=0.00)
    rejected_ot_hours = Column(Numeric(4, 2), default=0.00)
    overtime_hours = Column(Numeric(4, 2), default=0.00)
    ot_category = Column(String(30), default="NORMAL_OT")  # NORMAL_OT | WEEKEND_OT | HOLIDAY_OT | NIGHT_OT
    is_resumed = Column(Boolean, default=False)
    device_id = Column(String(50), nullable=True)

    employee = relationship("Employee", backref="attendances")
    shift = relationship("Shift", back_populates="attendances")
    breaks = relationship("AttendanceBreak", back_populates="attendance", cascade="all, delete-orphan", order_by="AttendanceBreak.started_at.asc()")
    events = relationship("AttendanceEvent", back_populates="attendance", cascade="all, delete-orphan", order_by="AttendanceEvent.created_at.desc()")
    overtime_claims = relationship("OvertimeClaim", back_populates="attendance", cascade="all, delete-orphan")
    punch_corrections = relationship("PunchCorrectionRequest", back_populates="attendance", cascade="all, delete-orphan")


class AttendanceBreak(Base):
    __tablename__ = "attendance_breaks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attendance_id = Column(Integer, ForeignKey("attendance.id", ondelete="CASCADE"), nullable=False)
    break_type = Column(String(30), default="LUNCH")  # LUNCH | TEA | PRAYER | PERSONAL
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, default=0)
    is_paid = Column(Boolean, default=True)

    attendance = relationship("Attendance", back_populates="breaks")


class AttendanceEvent(Base):
    __tablename__ = "attendance_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attendance_id = Column(Integer, ForeignKey("attendance.id", ondelete="CASCADE"), nullable=True)
    employee_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    actor_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_type = Column(String(50), nullable=False)  # PUNCH_IN | BREAK_START | BREAK_END | PUNCH_OUT | RESUME_REQUESTED | RESUME_APPROVED | CORRECTION_REQUESTED | CORRECTION_APPROVED | OT_CLAIMED | OT_APPROVED | REGULARIZATION_APPLIED
    source = Column(String(20), default="WEB-ESS")  # WEB-ESS | MOBILE | BIOMETRIC | ADMIN
    ip_address = Column(String(45), nullable=True)
    previous_state = Column(JSON, nullable=True)
    new_state = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    attendance = relationship("Attendance", back_populates="events")
    employee = relationship("User", foreign_keys=[employee_id])
    actor = relationship("User", foreign_keys=[actor_id])


class OvertimeClaim(Base):
    __tablename__ = "overtime_claims"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attendance_id = Column(Integer, ForeignKey("attendance.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    claimed_hours = Column(Numeric(4, 2), nullable=False)
    task_summary = Column(Text, nullable=False)
    status = Column(String(30), default="PENDING_MANAGER")  # PENDING_MANAGER | PENDING_HR | APPROVED | REJECTED
    manager_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    manager_remarks = Column(Text, nullable=True)
    hr_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    hr_remarks = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    attendance = relationship("Attendance", back_populates="overtime_claims")
    user = relationship("User", foreign_keys=[user_id])
    project = relationship("Project", foreign_keys=[project_id])
    manager = relationship("User", foreign_keys=[manager_id])
    hr = relationship("User", foreign_keys=[hr_id])


class PunchCorrectionRequest(Base):
    __tablename__ = "punch_corrections"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attendance_id = Column(Integer, ForeignKey("attendance.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    correction_type = Column(String(40), default="ACCIDENTAL_PUNCH_OUT")  # ACCIDENTAL_PUNCH_OUT | MISSING_PUNCH_IN | MISSING_PUNCH_OUT | WRONG_TIME | BIOMETRIC_FAILURE
    requested_in_time = Column(DateTime(timezone=True), nullable=True)
    requested_out_time = Column(DateTime(timezone=True), nullable=True)
    reason = Column(Text, nullable=False)
    audit_note = Column(Text, nullable=True)
    status = Column(String(20), default="PENDING")  # PENDING | APPROVED | REJECTED
    reviewed_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    attendance = relationship("Attendance", back_populates="punch_corrections")
    user = relationship("User", foreign_keys=[user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
