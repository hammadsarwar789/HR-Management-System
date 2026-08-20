import calendar
from datetime import datetime, date, timezone
from decimal import Decimal
import os
import io
from sqlalchemy.orm import Session
from app.models.employee import Employee
from app.models.payroll import SalaryStructure, PayrollRun
from app.models.attendance import Attendance, PunchCorrectionRequest
from app.models.holiday import Holiday
from app.models.leave import LeaveRequest
from app.models.expense import ExpenseRequest
from app.core.config import settings


def calculate_payroll_for_employee(
    db: Session,
    employee_id: str,
    month_year: date,
    overtime_pay: Decimal = Decimal('0.00'),
    bonus: Decimal = Decimal('0.00'),
    other_deductions: Decimal = Decimal('0.00'),
    apply_attendance_deductions: bool = False
) -> PayrollRun:
    """
    Calculates monthly payroll incorporating Attendance Deduction Rules,
    Missed Punch penalization, extreme lateness penalties, approved OT,
    and expense reimbursements.
    """
    # 1. Fetch active salary structure for employee
    structure = db.query(SalaryStructure).filter(
        SalaryStructure.employee_id == employee_id
    ).order_by(SalaryStructure.effective_from.desc()).first()

    if not structure:
        raise ValueError(f"No salary structure defined for employee {employee_id}")

    basic_salary = Decimal(str(structure.basic_salary))

    # 2. Date ranges for target month
    year = month_year.year
    month = month_year.month
    num_days = calendar.monthrange(year, month)[1]
    start_date = date(year, month, 1)
    end_date = date(year, month, num_days)

    # 3. Query holidays & approved leaves in this month
    holidays = db.query(Holiday).filter(Holiday.date >= start_date, Holiday.date <= end_date).all()
    holiday_dates = {h.date for h in holidays}

    approved_leaves = db.query(LeaveRequest).filter(
        LeaveRequest.employee_id == employee_id,
        LeaveRequest.status == "approved",
        LeaveRequest.start_date <= end_date,
        LeaveRequest.end_date >= start_date
    ).all()

    def is_on_approved_leave(d: date) -> bool:
        return any(l.start_date <= d <= l.end_date for l in approved_leaves)

    # 4. Query attendance records for employee in target month
    attendance_records = db.query(Attendance).filter(
        Attendance.employee_id == employee_id,
        Attendance.date >= start_date,
        Attendance.date <= end_date
    ).all()
    attendance_by_date = {r.date: r for r in attendance_records}

    # 5. Evaluate Attendance Breakdown
    total_working_days = 0
    attended_full_days = 0.0
    half_days = 0.0
    unpaid_absent_days = 0.0
    missed_punch_days = 0.0
    extreme_late_penalty_days = 0.0
    accumulated_ot_hours = Decimal('0.00')

    today = date.today()

    def get_record_working_hours(rec: Attendance) -> float:
        if not rec.check_in or not rec.check_out:
            return float(rec.regular_hours or 0.0)
        raw_secs = max(0.0, (rec.check_out - rec.check_in).total_seconds())
        total_break_mins = sum(b.duration_minutes or 0 for b in getattr(rec, 'breaks', []))
        net_secs = max(0.0, raw_secs - (total_break_mins * 60.0))
        return round(net_secs / 3600.0, 2)

    for day_num in range(1, num_days + 1):
        cur_date = date(year, month, day_num)
        is_weekend = cur_date.weekday() in (5, 6)  # Saturday or Sunday
        is_holiday = cur_date in holiday_dates
        record = attendance_by_date.get(cur_date)

        if is_weekend:
            if record and record.check_in:
                if (record.overtime_hours or 0) > 0:
                    accumulated_ot_hours += Decimal(str(record.overtime_hours))
            continue

        if is_holiday:
            continue

        # Mon-Fri Scheduled Working Day
        total_working_days += 1

        if record:
            if record.status == "incomplete_absent" or (record.check_in and not record.check_out and cur_date < today):
                approved_correction = db.query(PunchCorrectionRequest).filter(
                    PunchCorrectionRequest.attendance_id == record.id,
                    PunchCorrectionRequest.status == "APPROVED"
                ).first()

                if approved_correction:
                    attended_full_days += 1.0
                else:
                    unpaid_absent_days += 1.0
                    missed_punch_days += 1.0

            elif record.check_in and record.check_out:
                work_hrs = get_record_working_hours(record)
                late_mins = int(record.late_minutes or 0)

                if late_mins > 120 and not record.is_resumed:
                    half_days += 1.0
                    extreme_late_penalty_days += 0.5
                elif record.status == "half_day" or work_hrs < 7.5:
                    half_days += 1.0
                else:
                    attended_full_days += 1.0

                if (record.overtime_hours or 0) > 0:
                    accumulated_ot_hours += Decimal(str(record.overtime_hours))
            elif record.status == "absent":
                if is_on_approved_leave(cur_date):
                    attended_full_days += 1.0
                else:
                    unpaid_absent_days += 1.0
            else:
                attended_full_days += 1.0
        else:
            if is_on_approved_leave(cur_date):
                attended_full_days += 1.0
            else:
                attended_full_days += 1.0

    # 6. Financial Ledger Calculations
    working_days_count = max(total_working_days, 1)
    daily_rate = basic_salary / Decimal(str(working_days_count))
    hourly_rate = daily_rate / Decimal('8.0')
    hourly_ot_rate = hourly_rate * Decimal('1.5')

    unpaid_deduction_amount = (Decimal(str(unpaid_absent_days)) * daily_rate) + (Decimal(str(half_days)) * Decimal('0.5') * daily_rate)
    paid_days = Decimal(str(attended_full_days)) + (Decimal(str(half_days)) * Decimal('0.5'))

    earned_basic = max(Decimal('0.00'), round(paid_days * daily_rate, 2)) if apply_attendance_deductions else basic_salary

    if overtime_pay == Decimal('0.00') and accumulated_ot_hours > Decimal('0.00'):
        overtime_pay = round(accumulated_ot_hours * hourly_ot_rate, 2)

    allowances_dict = structure.allowances or {}
    total_allowances = Decimal('0.00')
    for name, val in allowances_dict.items():
        total_allowances += Decimal(str(val))

    approved_claims = db.query(ExpenseRequest).filter(
        ExpenseRequest.employee_id == employee_id,
        ExpenseRequest.status.in_(["approved", "APPROVED"])
    ).all()

    total_reimbursements = Decimal('0.00')
    for c in approved_claims:
        total_reimbursements += Decimal(str(c.amount))

    # Earned gross & Taxable base
    earned_gross = earned_basic + total_allowances + overtime_pay + bonus
    contract_gross = basic_salary + total_allowances + overtime_pay + bonus

    tax_rate = Decimal(str(structure.tax_bracket_rate or '0.00')) / Decimal('100.00')
    tax_deducted = round(earned_gross * tax_rate, 2)

    # 5% Escrow calculated on actual earned amount to prevent over-deducting
    sec_rate = Decimal(str(structure.security_deduction_rate or '5.00')) / Decimal('100.00')
    security_deduction = round(earned_basic * sec_rate, 2)

    total_other_deductions = Decimal(str(other_deductions))
    total_deductions = tax_deducted + security_deduction + total_other_deductions

    # Zero-Floor Clamping & Arrears Carry-Forward
    raw_net_payable = earned_gross + total_reimbursements - total_deductions
    if raw_net_payable < Decimal('0.00'):
        net_salary = Decimal('0.00')
        carried_forward_arrears = round(abs(raw_net_payable), 2)
        run_status = "ZERO_DISBURSEMENT_ARREARS"
    else:
        net_salary = round(raw_net_payable, 2)
        carried_forward_arrears = Decimal('0.00')
        run_status = "processed"

    attendance_summary = {
        "total_working_days": total_working_days,
        "scheduled_days": total_working_days,
        "paid_days": float(round(paid_days, 1)),
        "unpaid_days": float(round(unpaid_absent_days + (half_days * 0.5), 1)),
        "attended_full_days": float(attended_full_days),
        "half_days": float(half_days),
        "unpaid_absent_days": float(unpaid_absent_days),
        "missed_punch_days": float(missed_punch_days),
        "extreme_late_penalty_days": float(extreme_late_penalty_days),
        "contract_basic_salary": float(basic_salary),
        "earned_basic_salary": float(earned_basic),
        "unpaid_deduction_amount": float(round(unpaid_deduction_amount, 2)),
        "carried_forward_arrears": float(carried_forward_arrears),
        "approved_ot_hours": float(accumulated_ot_hours),
        "hourly_ot_rate": float(round(hourly_ot_rate, 2)),
        "daily_rate": float(round(daily_rate, 2))
    }

    # 7. Check for existing run for this month/year
    existing_run = db.query(PayrollRun).filter(
        PayrollRun.employee_id == employee_id,
        PayrollRun.month_year == month_year
    ).first()

    if existing_run:
        existing_run.basic_salary = basic_salary
        existing_run.total_allowances = total_allowances
        existing_run.overtime_pay = overtime_pay
        existing_run.bonus = bonus
        existing_run.tax_deducted = tax_deducted
        existing_run.security_deduction = security_deduction
        existing_run.unpaid_leave_deductions = round(unpaid_deduction_amount, 2)
        existing_run.other_deductions = Decimal(str(other_deductions))
        existing_run.reimbursements_total = total_reimbursements
        existing_run.attendance_summary = attendance_summary
        existing_run.net_salary = net_salary
        existing_run.status = run_status
        existing_run.generated_at = datetime.now(timezone.utc)
        run = existing_run
    else:
        run = PayrollRun(
            employee_id=employee_id,
            month_year=month_year,
            basic_salary=basic_salary,
            total_allowances=total_allowances,
            overtime_pay=overtime_pay,
            bonus=bonus,
            tax_deducted=tax_deducted,
            security_deduction=security_deduction,
            unpaid_leave_deductions=round(unpaid_deduction_amount, 2),
            other_deductions=Decimal(str(other_deductions)),
            reimbursements_total=total_reimbursements,
            attendance_summary=attendance_summary,
            net_salary=net_salary,
            status=run_status,
            generated_at=datetime.now(timezone.utc)
        )
        db.add(run)

    # Manage arrears record if carried forward
    from app.models.payroll import EmployeeArrears
    if carried_forward_arrears > Decimal('0.00'):
        existing_arrear = db.query(EmployeeArrears).filter(
            EmployeeArrears.employee_id == employee_id,
            EmployeeArrears.month_year == month_year
        ).first()
        if existing_arrear:
            existing_arrear.arrears_amount = carried_forward_arrears
            existing_arrear.payroll_run_id = run.id
        else:
            new_arrear = EmployeeArrears(
                employee_id=employee_id,
                payroll_run_id=run.id,
                month_year=month_year,
                arrears_amount=carried_forward_arrears,
                status="PENDING",
                notes="Zero-floor net pay carried forward debt"
            )
            db.add(new_arrear)

    db.commit()
    db.refresh(run)
    return run


def format_duration_str(hours: float) -> str:
    if not hours or hours <= 0:
        return "0h 0m"
    h = int(hours)
    m = int(round((hours - h) * 60))
    return f"{h}h {m}m"


def get_dynamic_payslip_breakdown(db: Session, employee_id: str, period_str: str = None) -> dict:
    """
    Computes dynamic attendance-backed payslip breakdown and day-by-day audit drilldown
    across attendances, holidays, leaves, overtime claims, and salary structures.
    """
    from app.models.auth import User
    from app.models.attendance import OvertimeClaim
    from sqlalchemy import or_

    emp = db.query(Employee).filter(
        or_(Employee.id == employee_id, Employee.employee_code == employee_id)
    ).first()
    if not emp:
        user = db.query(User).filter(User.id == employee_id).first()
        if user and user.employee:
            emp = user.employee
        else:
            raise ValueError(f"Employee not found for identifier: {employee_id}")

    structure = db.query(SalaryStructure).filter(
        SalaryStructure.employee_id == emp.id
    ).order_by(SalaryStructure.effective_from.desc()).first()

    if not structure:
        raise ValueError(f"No salary structure defined for employee {emp.employee_code}")

    basic_salary = Decimal(str(structure.basic_salary))

    today = date.today()
    if period_str:
        try:
            parts = period_str.split('-')
            year, month = int(parts[0]), int(parts[1])
        except Exception:
            year, month = today.year, today.month
    else:
        year, month = today.year, today.month

    target_period = f"{year:04d}-{month:02d}"
    is_current_month = (year == today.year and month == today.month)

    num_days = calendar.monthrange(year, month)[1]
    start_date = date(year, month, 1)
    end_date = date(year, month, num_days)

    holidays = db.query(Holiday).filter(Holiday.date >= start_date, Holiday.date <= end_date).all()
    holidays_by_date = {h.date: h for h in holidays}

    approved_leaves = db.query(LeaveRequest).filter(
        LeaveRequest.employee_id == emp.id,
        LeaveRequest.status == "approved",
        LeaveRequest.start_date <= end_date,
        LeaveRequest.end_date >= start_date
    ).all()

    def get_leave_for_date(d: date):
        return next((l for l in approved_leaves if l.start_date <= d <= l.end_date), None)

    attendance_records = db.query(Attendance).filter(
        Attendance.employee_id == emp.id,
        Attendance.date >= start_date,
        Attendance.date <= end_date
    ).all()
    attendance_by_date = {r.date: r for r in attendance_records}

    def get_record_working_hours(rec: Attendance) -> float:
        if not rec.check_in or not rec.check_out:
            return float(rec.regular_hours or 0.0)
        raw_secs = max(0.0, (rec.check_out - rec.check_in).total_seconds())
        total_break_mins = sum(b.duration_minutes or 0 for b in getattr(rec, 'breaks', []))
        net_secs = max(0.0, raw_secs - (total_break_mins * 60.0))
        return round(net_secs / 3600.0, 2)

    scheduled_days = 0
    elapsed_work_days = 0

    daily_breakdown = []
    full_present_days = 0
    half_days = 0.0
    missed_punch_days = 0.0
    past_absent_days = 0.0
    paid_leaves_count = 0.0
    approved_ot_hours_total = Decimal('0.00')

    day_names_short = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    for day_num in range(1, num_days + 1):
        cur_date = date(year, month, day_num)
        day_name = day_names_short[cur_date.weekday()]
        is_weekend = cur_date.weekday() in (5, 6)
        holiday_obj = holidays_by_date.get(cur_date)
        leave_obj = get_leave_for_date(cur_date)
        record = attendance_by_date.get(cur_date)

        is_past = (cur_date < today)
        is_today = (cur_date == today)
        is_future = (cur_date > today)

        if not is_weekend and not holiday_obj:
            scheduled_days += 1
            if is_current_month:
                if cur_date <= today:
                    elapsed_work_days += 1
            else:
                elapsed_work_days += 1

        time_in_str = None
        time_out_str = None
        work_hours_val = 0.0
        break_hours_val = 0.0
        late_mins_val = 0
        late_dev_str = "—"
        approved_ot_val = 0.0
        day_status = "ABSENT"
        payable_ratio = 0.0
        payable_status = "Unpaid (0.0)"

        if is_future:
            day_status = "WEEKEND" if is_weekend else ("HOLIDAY" if holiday_obj else "FUTURE")
            payable_ratio = 0.0 if is_weekend else (1.0 if holiday_obj else 0.0)
            payable_status = "—"
        elif is_weekend:
            if record and record.check_in:
                work_hours_val = get_record_working_hours(record)
                time_in_str = record.check_in.strftime("%H:%M:%S")
                time_out_str = record.check_out.strftime("%H:%M:%S") if record.check_out else None
                approved_ot_val = float(record.overtime_hours or 0.0)
                approved_ot_hours_total += Decimal(str(approved_ot_val))
                day_status = "WEEKEND_OT"
                payable_ratio = 1.0
                payable_status = f"Paid Weekend OT (+{approved_ot_val}h)"
            else:
                day_status = "WEEKEND"
                payable_ratio = 0.0
                payable_status = "Weekend (Off)"
        elif holiday_obj:
            day_status = "HOLIDAY"
            payable_ratio = 1.0
            payable_status = f"Paid Holiday ({holiday_obj.name})"
        elif leave_obj:
            paid_leaves_count += 1.0
            day_status = "APPROVED_LEAVE"
            payable_ratio = 1.0
            payable_status = f"Paid Leave"
        elif is_today:
            if record and record.check_in:
                time_in_str = record.check_in.strftime("%H:%M:%S")
                time_out_str = record.check_out.strftime("%H:%M:%S") if record.check_out else None
                work_hours_val = get_record_working_hours(record)
                late_mins_val = record.late_minutes or 0
                late_dev_str = f"+{late_mins_val}m" if late_mins_val > 0 else "On Time"
                active_brk = next((b for b in record.breaks if b.ended_at is None), None)

                if record.check_out:
                    if work_hours_val < 7.5:
                        day_status = "HALF_DAY"
                        half_days += 1.0
                        payable_ratio = 0.5
                        payable_status = "Half-Day (0.5)"
                    else:
                        day_status = "PRESENT"
                        full_present_days += 1
                        payable_ratio = 1.0
                        payable_status = "Paid (Full)"
                elif active_brk:
                    day_status = "ON_BREAK"
                    payable_ratio = 1.0
                    payable_status = "Paid (On Break)"
                else:
                    day_status = "IN_SHIFT"
                    payable_ratio = 1.0
                    payable_status = "Paid (In Progress)"
            else:
                day_status = "NOT_STARTED"
                payable_ratio = 1.0
                payable_status = "Today (Pending Punch)"
        elif is_past:
            if record and record.check_in:
                time_in_str = record.check_in.strftime("%H:%M:%S")
                time_out_str = record.check_out.strftime("%H:%M:%S") if record.check_out else None
                late_mins_val = record.late_minutes or 0
                late_dev_str = f"+{late_mins_val}m" if late_mins_val > 0 else "On Time"
                break_hours_val = float(record.break_duration_hours or 0.0)

                if not record.check_out:
                    approved_corr = db.query(PunchCorrectionRequest).filter(
                        PunchCorrectionRequest.attendance_id == record.id,
                        PunchCorrectionRequest.status == "APPROVED"
                    ).first()

                    if approved_corr:
                        day_status = "REGULARIZED"
                        full_present_days += 1
                        work_hours_val = float(record.regular_hours or 8.0)
                        payable_ratio = 1.0
                        payable_status = "Paid (Regularized)"
                    else:
                        day_status = "MISSED_OUT"
                        work_hours_val = 0.0
                        missed_punch_days += 1.0
                        payable_ratio = 0.0
                        payable_status = "Unpaid (Missed Punch)"
                else:
                    work_hours_val = get_record_working_hours(record)
                    approved_ot_val = float(record.overtime_hours or 0.0)
                    if approved_ot_val > 0:
                        approved_ot_hours_total += Decimal(str(approved_ot_val))

                    if late_mins_val > 120 and not record.is_resumed:
                        day_status = "HALF_DAY"
                        half_days += 1.0
                        payable_ratio = 0.5
                        payable_status = "Half-Day (Late Penalty >2h)"
                    elif record.status == "half_day" or work_hours_val < 4.0:
                        day_status = "INCOMPLETE"
                        half_days += 1.0
                        payable_ratio = 0.5
                        payable_status = f"Half-Day ({work_hours_val}h)"
                    elif work_hours_val < 7.5:
                        day_status = "HALF_DAY"
                        half_days += 1.0
                        payable_ratio = 0.5
                        payable_status = f"Half-Day ({work_hours_val}h)"
                    else:
                        day_status = "LATE_PRESENT" if late_mins_val > 0 else "PRESENT"
                        full_present_days += 1
                        payable_ratio = 1.0
                        payable_status = "Paid (Full)"
            else:
                day_status = "ABSENT"
                past_absent_days += 1.0
                payable_ratio = 0.0
                payable_status = "Unpaid (Absent)"

        daily_breakdown.append({
            "date": cur_date.strftime("%Y-%m-%d"),
            "day": day_name,
            "time_in": time_in_str,
            "time_out": time_out_str,
            "work_hours": format_duration_str(work_hours_val) if work_hours_val > 0 else ("—" if day_status in ("WEEKEND", "FUTURE", "HOLIDAY") else "0h 0m"),
            "work_hours_decimal": round(work_hours_val, 2),
            "break_hours": round(break_hours_val, 2),
            "late_minutes": late_mins_val,
            "late_deviation": late_dev_str,
            "approved_ot_hours": round(approved_ot_val, 2),
            "day_status": day_status,
            "payable_ratio": payable_ratio,
            "payable_status": payable_status
        })

    working_days_count = max(scheduled_days, 1)
    daily_rate = basic_salary / Decimal(str(working_days_count))
    hourly_rate = daily_rate / Decimal('8.0')
    hourly_ot_rate = hourly_rate * Decimal('1.5')

    unpaid_penalty_days = Decimal(str(missed_punch_days)) + Decimal(str(past_absent_days)) + (Decimal(str(half_days)) * Decimal('0.5'))
    # Scheduled working days minus unpaid penalty days
    paid_days = max(Decimal('0.0'), Decimal(str(scheduled_days)) - unpaid_penalty_days) if not is_current_month else max(Decimal('0.0'), Decimal(str(elapsed_work_days)) - unpaid_penalty_days)
    
    # 1. Earned Basic Salary & Absence Deduction
    earned_basic = max(Decimal('0.00'), round(paid_days * daily_rate, 2))
    absence_deduction = round(unpaid_penalty_days * daily_rate, 2)
    approved_ot_pay = round(approved_ot_hours_total * hourly_ot_rate, 2)

    allowances_dict = structure.allowances or {}
    total_allowances = Decimal('0.00')
    for val in allowances_dict.values():
        total_allowances += Decimal(str(val))

    approved_claims = db.query(ExpenseRequest).filter(
        ExpenseRequest.employee_id == emp.id,
        ExpenseRequest.status.in_(["approved", "APPROVED"])
    ).all()
    reimbursements_total = sum((Decimal(str(c.amount)) for c in approved_claims), Decimal('0.00'))

    # 2. Earned Gross vs Contract Nominal Gross
    contract_gross = basic_salary + total_allowances + approved_ot_pay
    earned_gross = earned_basic + total_allowances + approved_ot_pay

    # 3. Dynamic Scaled Deductions (Calculated on Earned Basic / Earned Gross to prevent over-deducting)
    sec_rate = Decimal(str(structure.security_deduction_rate or '5.00')) / Decimal('100.00')
    escrow_deduction = round(earned_basic * sec_rate, 2)

    tax_rate = Decimal(str(structure.tax_bracket_rate or '0.00')) / Decimal('100.00')
    tax_deduction = round(earned_gross * tax_rate, 2)

    total_deductions = tax_deduction + escrow_deduction

    # 4. Zero-Floor Clamping & Arrears Carry-Forward
    raw_net_payable = earned_gross + reimbursements_total - total_deductions

    if raw_net_payable < Decimal('0.00'):
        net_payable = Decimal('0.00')
        carried_forward_arrears = round(abs(raw_net_payable), 2)
        disbursement_status = "ZERO_DISBURSEMENT_ARREARS"
    else:
        net_payable = round(raw_net_payable, 2)
        carried_forward_arrears = Decimal('0.00')
        disbursement_status = "PROCESSED"

    _, last_day_of_month = calendar.monthrange(year, month)
    month_end_date = date(year, month, last_day_of_month)
    is_month_in_progress = (today <= month_end_date)

    return {
        "employee_id": emp.employee_code or emp.id,
        "employee_name": f"{emp.first_name} {emp.last_name}",
        "designation": emp.designation or "Employee",
        "department": emp.department.name if emp.department else "General",
        "pay_period": target_period,
        "is_provisional_preview": is_month_in_progress,
        "available_after": month_end_date.strftime("%Y-%m-%d"),
        "billing_month_closed": not is_month_in_progress,
        "disbursement_status": disbursement_status,
        "summary": {
            "scheduled_days": scheduled_days,
            "elapsed_work_days": elapsed_work_days,
            "paid_days": float(round(paid_days, 1)),
            "unpaid_days": float(round(unpaid_penalty_days, 1)),
            "missed_absent_days": float(round(unpaid_penalty_days, 1)),
            "full_present_days": full_present_days,
            "half_days": float(half_days),
            "missed_punch_days": float(missed_punch_days),
            "past_absent_days": float(past_absent_days),
            "paid_leaves": float(paid_leaves_count),
            "approved_ot_hours": float(round(approved_ot_hours_total, 2)),
            "basic_salary": float(basic_salary),
            "contract_basic_salary": float(basic_salary),
            "earned_basic_salary": float(earned_basic),
            "daily_rate": float(round(daily_rate, 2)),
            "daily_basic_rate": float(round(daily_rate, 2)),
            "hourly_rate": float(round(hourly_rate, 2)),
            "hourly_ot_rate": float(round(hourly_ot_rate, 2)),
            "missed_punch_deduction": float(absence_deduction),
            "missed_punch_absence_deduction": float(absence_deduction),
            "tax_deduction": float(tax_deduction),
            "escrow_deduction": float(escrow_deduction),
            "security_escrow": float(escrow_deduction),
            "total_deductions": float(total_deductions),
            "ot_pay": float(approved_ot_pay),
            "approved_ot_pay": float(approved_ot_pay),
            "total_allowances": float(total_allowances),
            "gross_earnings": float(earned_gross),
            "contract_gross": float(contract_gross),
            "earned_gross": float(earned_gross),
            "reimbursements_total": float(reimbursements_total),
            "raw_net_payable": float(raw_net_payable),
            "carried_forward_arrears": float(carried_forward_arrears),
            "net_payable": float(net_payable),
            "net_salary_disbursed": float(net_payable)
        },
        "daily_attendance_breakdown": daily_breakdown
    }


def generate_payslip_pdf_bytes(run: PayrollRun, employee: Employee, is_provisional: bool = False) -> bytes:
    """Generates an executive PDF payslip with full attendance line-item transparency"""
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    story = []
    styles = getSampleStyleSheet()

    # Paragraph Styles matching Modern Industrial palette
    style_title = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=17,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=2
    )
    style_subtitle = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=colors.HexColor("#D97706" if is_provisional else "#14B8A6"),
        spaceAfter=8
    )
    style_normal = ParagraphStyle(
        'DocNormal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#1E293B")
    )
    style_header_cell = ParagraphStyle(
        'HeaderCell',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=colors.white
    )
    style_holdback_label = ParagraphStyle(
        'HoldbackLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=colors.HexColor("#0F766E")
    )
    style_holdback_val = ParagraphStyle(
        'HoldbackVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=colors.HexColor("#0F766E")
    )
    style_deduct_label = ParagraphStyle(
        'DeductLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=colors.HexColor("#BE123C")
    )
    style_deduct_val = ParagraphStyle(
        'DeductVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=colors.HexColor("#BE123C")
    )
    style_total_label = ParagraphStyle(
        'TotalLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=colors.HexColor("#0F172A")
    )
    style_total_val = ParagraphStyle(
        'TotalVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=colors.HexColor("#0F172A")
    )

    # Document Header
    header_title = f"{settings.APP_NAME.upper()} — PROVISIONAL PAYSLIP ESTIMATE" if is_provisional else f"{settings.APP_NAME.upper()} — OFFICIAL PAYSLIP"
    sub_title = f"PROVISIONAL MID-MONTH ESTIMATE (PRE-CLOSING) • PAY PERIOD: {run.month_year.strftime('%B %Y').upper()}" if is_provisional else f"OFFICIAL SALARY DISBURSEMENT STATEMENT • PAY PERIOD: {run.month_year.strftime('%B %Y').upper()}"

    story.append(Paragraph(header_title, style_title))
    story.append(Paragraph(sub_title, style_subtitle))
    story.append(Spacer(1, 4))

    # Provisional Notice Banner
    if is_provisional:
        style_banner = ParagraphStyle(
            'ProvisionalBanner',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8,
            textColor=colors.HexColor("#92400E"),
            alignment=1
        )
        banner_table = Table([[Paragraph("⚠️ PROVISIONAL PREVIEW: The billing period is currently in-progress. Final disbursements, attendance calculations, and overtime lock after month-end.", style_banner)]], colWidths=[540])
        banner_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#FEF3C7")),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#F59E0B")),
            ('PADDING', (0,0), (-1,-1), 5),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ]))
        story.append(banner_table)
        story.append(Spacer(1, 6))

    # Employee Metadata Summary Table
    emp_info = [
        [
            Paragraph(f"<b>EMPLOYEE CODE:</b> <font color='#0D9488'><b>{employee.employee_code}</b></font>", style_normal),
            Paragraph(f"<b>PAY PERIOD:</b> {run.month_year.strftime('%B %Y')}", style_normal)
        ],
        [
            Paragraph(f"<b>FULL NAME:</b> {employee.first_name} {employee.last_name}", style_normal),
            Paragraph(f"<b>DESIGNATION:</b> {employee.designation}", style_normal)
        ],
        [
            Paragraph(f"<b>CNIC / NATIONAL ID:</b> {employee.cnic}", style_normal),
            Paragraph(f"<b>STATUS:</b> <font color='{'#D97706' if is_provisional else '#047857'}'><b>{'PROVISIONAL ESTIMATE' if is_provisional else 'OFFICIAL DISBURSED'}</b></font>", style_normal)
        ],
    ]
    t_info = Table(emp_info, colWidths=[270, 270])
    t_info.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ('PADDING', (0,0), (-1,-1), 6),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('LINELEFT', (0,0), (0,-1), 3, colors.HexColor("#14B8A6")),
    ]))
    story.append(t_info)
    story.append(Spacer(1, 10))

    # Attendance Line-Item Transparency Section
    att = run.attendance_summary or {}
    total_w_days = att.get("total_working_days", 22)
    paid_days = att.get("paid_days", total_w_days)
    unpaid_absent = att.get("unpaid_absent_days", 0)
    half_days_cnt = att.get("half_days", 0)
    ot_hrs = att.get("approved_ot_hours", 0)
    unpaid_ded_amt = Decimal(str(run.unpaid_leave_deductions or att.get("unpaid_deduction_amount", 0)))
    earned_basic = Decimal(str(att.get("earned_basic_salary", run.basic_salary)))
    carried_arrears = Decimal(str(att.get("carried_forward_arrears", 0)))

    att_summary_rows = [
        [
            Paragraph("<b>TOTAL WORKING DAYS</b>", style_header_cell),
            Paragraph("<b>PAID DAYS</b>", style_header_cell),
            Paragraph("<b>MISSED PUNCH / ABSENCE</b>", style_header_cell),
            Paragraph("<b>APPROVED OVERTIME</b>", style_header_cell)
        ],
        [
            Paragraph(f"<b>{total_w_days} Days</b>", style_normal),
            Paragraph(f"<font color='#047857'><b>{paid_days} Days</b></font>", style_normal),
            Paragraph(f"<font color='#BE123C'><b>{unpaid_absent + (half_days_cnt * 0.5)} Days</b></font>", style_normal),
            Paragraph(f"<font color='#0D9488'><b>+{ot_hrs} Hours</b></font>", style_normal)
        ]
    ]
    t_att = Table(att_summary_rows, colWidths=[135, 135, 135, 135])
    t_att.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#334155")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('PADDING', (0,0), (-1,-1), 5),
        ('BACKGROUND', (0,1), (-1,1), colors.HexColor("#F8FAFC")),
    ]))
    story.append(t_att)
    story.append(Spacer(1, 10))

    # Total calculations
    earned_gross = earned_basic + run.total_allowances + run.overtime_pay + run.bonus
    total_deductions = run.tax_deducted + run.security_deduction + (run.other_deductions or Decimal('0.00'))

    # Earnings & Deductions Breakdown Table
    breakdown = [
        [
            Paragraph("<b>EARNINGS ITEM</b>", style_header_cell),
            Paragraph("<b>AMOUNT (PKR)</b>", style_header_cell),
            Paragraph("<b>DEDUCTIONS ITEM</b>", style_header_cell),
            Paragraph("<b>AMOUNT (PKR)</b>", style_header_cell)
        ],
        [
            Paragraph(f"Earned Basic Salary <font color='#64748B'>({paid_days}d / {total_w_days}d)</font>", style_normal),
            Paragraph(f"{earned_basic:,.2f}", style_normal),
            Paragraph("Income Tax (Earned Income)", style_normal),
            Paragraph(f"{run.tax_deducted:,.2f}", style_normal)
        ],
        [
            Paragraph("Allowances (Housing/Medical/Transport)", style_normal),
            Paragraph(f"{run.total_allowances:,.2f}", style_normal),
            Paragraph("Pro-Rated 5% Security Escrow", style_holdback_label),
            Paragraph(f"{run.security_deduction:,.2f}", style_holdback_val)
        ],
        [
            Paragraph("Approved Overtime Pay", style_normal),
            Paragraph(f"{run.overtime_pay:,.2f}", style_normal),
            Paragraph("Missed Punch & Absence Deduction", style_deduct_label),
            Paragraph(f"{unpaid_ded_amt:,.2f}", style_deduct_val)
        ],
        [
            Paragraph("Performance Bonus", style_normal),
            Paragraph(f"{run.bonus:,.2f}", style_normal),
            Paragraph("Other Miscellaneous Deductions", style_normal),
            Paragraph(f"{(run.other_deductions or Decimal('0.00')):,.2f}", style_normal)
        ],
        [
            Paragraph("<b>TOTAL EARNED GROSS</b>", style_total_label),
            Paragraph(f"<b>PKR {earned_gross:,.2f}</b>", style_total_val),
            Paragraph("<b>TOTAL DEDUCTIONS</b>", style_total_label),
            Paragraph(f"<b>PKR {total_deductions:,.2f}</b>", style_total_val)
        ]
    ]

    t_breakdown = Table(breakdown, colWidths=[160, 110, 160, 110])
    t_breakdown.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('PADDING', (0,0), (-1,-1), 6),
        ('BACKGROUND', (2,2), (3,2), colors.HexColor("#CCFBF1")),  # 5% Holdback highlight
        ('BACKGROUND', (2,3), (3,3), colors.HexColor("#FFE4E6")),  # Absence deduction highlight
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#F1F5F9")),
    ]))
    story.append(t_breakdown)
    story.append(Spacer(1, 10))

    # Reimbursements & Expense Claims Section
    reimb_total = getattr(run, 'reimbursements_total', Decimal('0.00')) or Decimal('0.00')
    if reimb_total > Decimal('0.00'):
        story.append(Paragraph("<b>REIMBURSEMENTS & EXPENSE CLAIMS (TAX-EXEMPT / NON-TAXABLE)</b>", style_subtitle))
        reimb_rows = [
            [
                Paragraph("<b>DESCRIPTION / CLAIM ITEM</b>", style_header_cell),
                Paragraph("<b>TAX STATUS</b>", style_header_cell),
                Paragraph("<b>AMOUNT (PKR)</b>", style_header_cell)
            ],
            [
                Paragraph("Approved Expense Reimbursement Payout", style_normal),
                Paragraph("<font color='#0D9488'><b>Tax-Exempt / Nontaxable</b></font>", style_normal),
                Paragraph(f"<b>PKR {reimb_total:,.2f}</b>", style_holdback_val)
            ]
        ]
        t_reimb = Table(reimb_rows, colWidths=[240, 180, 120])
        t_reimb.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0D9488")),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#99F6E4")),
            ('PADDING', (0,0), (-1,-1), 5),
            ('BACKGROUND', (0,1), (-1,1), colors.HexColor("#F0FDFA")),
        ]))
        story.append(t_reimb)
        story.append(Spacer(1, 10))

    # Arrears Warning if Zero Floor Triggered
    if carried_arrears > Decimal('0.00'):
        style_arrear_text = ParagraphStyle(
            'ArrearNoticeText',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8.5,
            textColor=colors.HexColor("#991B1B"),
            alignment=1
        )
        arrear_table = Table([[Paragraph(f"⚠️ ZERO-FLOOR DEBT SAFEGUARD ACTIVE: Carried Forward Arrears = -PKR {carried_arrears:,.2f}", style_arrear_text)]], colWidths=[540])
        arrear_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#FEE2E2")),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#EF4444")),
            ('PADDING', (0,0), (-1,-1), 6),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ]))
        story.append(arrear_table)
        story.append(Spacer(1, 8))

    # Net Salary Highlight Banner
    style_net = ParagraphStyle(
        'NetSalaryStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        alignment=1,  # Center
        textColor=colors.HexColor("#047857") if run.net_salary > Decimal('0.00') else colors.HexColor("#64748B")
    )
    net_table = Table([[Paragraph(f"NET SALARY DISBURSED: PKR {run.net_salary:,.2f}", style_net)]], colWidths=[540])
    net_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#ECFDF5") if run.net_salary > Decimal('0.00') else colors.HexColor("#F1F5F9")),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('PADDING', (0,0), (-1,-1), 9),
        ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor("#10B981") if run.net_salary > Decimal('0.00') else colors.HexColor("#94A3B8")),
    ]))
    story.append(net_table)

    # Footer note
    story.append(Spacer(1, 12))
    style_formula_footer = ParagraphStyle(
        'FormulaFooterNote',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        textColor=colors.HexColor("#475569"),
        alignment=1,
        leading=10
    )
    story.append(Paragraph("<b>Calculation Formula Trace:</b> Daily Rate = Basic Salary ÷ Scheduled Days | Earned Basic = Paid Days × Daily Rate | Net Pay = max(0, Earned Gross + Reimbursements − (Tax + Pro-Rated Escrow))", style_formula_footer))
    story.append(Spacer(1, 4))
    style_footer = ParagraphStyle(
        'FooterNote',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8,
        textColor=colors.HexColor("#64748B"),
        alignment=1
    )
    story.append(Paragraph("This is an official computer-generated payslip from Maxenius HRMS Enterprise. No physical signature is required.", style_footer))

    doc.build(story)
    pdf_data = buffer.getvalue()
    buffer.close()
    return pdf_data
