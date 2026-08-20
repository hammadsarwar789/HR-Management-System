import calendar
from datetime import datetime, date
from decimal import Decimal
from flask import Blueprint, request, jsonify, make_response
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.models.payroll import PayrollRun, SalaryStructure
from app.models.employee import Employee
from app.services.payroll_service import calculate_payroll_for_employee, generate_payslip_pdf_bytes
from app.tasks.payroll_tasks import process_monthly_payroll_batch
from app.core.security import get_current_user, role_required, log_activity

payroll_bp = Blueprint("payroll", __name__, url_prefix="/payroll")

@payroll_bp.route("/runs", methods=["GET"])
@jwt_required()
def list_payroll_runs():
    current_user = get_current_user()
    query = db_session.query(PayrollRun)

    if current_user.role and current_user.role.name == "Employee":
        query = query.filter(PayrollRun.employee_id == current_user.id)

    emp_id = request.args.get("employee_id")
    month = request.args.get("month")
    year = request.args.get("year")

    if emp_id:
        query = query.filter(PayrollRun.employee_id == emp_id)
    if month and year:
        target_date = date(int(year), int(month), 1)
        query = query.filter(PayrollRun.month_year == target_date)

    runs = query.order_by(PayrollRun.generated_at.desc()).all()
    res = []
    for r in runs:
        res.append({
            "id": r.id,
            "employee_id": r.employee_id,
            "employee_code": r.employee.employee_code if r.employee else None,
            "employee_name": f"{r.employee.first_name} {r.employee.last_name}" if r.employee else "Unknown",
            "month_year": r.month_year.strftime("%Y-%m"),
            "basic_salary": float(r.basic_salary),
            "total_allowances": float(r.total_allowances),
            "overtime_pay": float(r.overtime_pay),
            "bonus": float(r.bonus),
            "tax_deducted": float(r.tax_deducted),
            "security_deduction": float(r.security_deduction),  # 5% holdback
            "unpaid_leave_deductions": float(getattr(r, 'unpaid_leave_deductions', 0) or 0),
            "other_deductions": float(r.other_deductions),
            "reimbursements_total": float(getattr(r, 'reimbursements_total', 0) or 0),
            "attendance_summary": getattr(r, 'attendance_summary', {}) or {},
            "net_salary": float(r.net_salary),
            "status": r.status,
            "generated_at": r.generated_at.isoformat()
        })

    return jsonify({"payroll_runs": res})

@payroll_bp.route("/runs", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def trigger_payroll_run():
    data = request.get_json() or {}
    year = data.get("year", datetime.now().year)
    month = data.get("month", datetime.now().month)

    # Trigger Celery task (executes synchronously under eager mode)
    task_res = process_monthly_payroll_batch.delay(int(year), int(month))

    # BUG-005 FIX: Expire scoped session to avoid stale reads after eager task
    # The task uses its own SessionLocal(); this ensures Flask's db_session refreshes.
    db_session.expire_all()
    
    log_activity("payroll.run_triggered", entity_type="PayrollRun", extra_metadata={"year": year, "month": month}, user_id=get_current_user().id)


    return jsonify({
        "message": "Payroll processing batch triggered successfully",
        "task_id": str(task_res.id) if hasattr(task_res, "id") else None,
        "result": task_res.get() if hasattr(task_res, "get") else None
    }), 202  # BUG-022 FIX: 202 Accepted is correct for batch-triggered resource creation

@payroll_bp.route("/runs/<string:run_id>/payslip-pdf", methods=["GET"])
@jwt_required()
def download_payslip_pdf(run_id):
    current_user = get_current_user()
    run = db_session.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not run:
        return jsonify({"error": {"code": "not_found", "message": "Payroll run record not found"}}), 404

    if current_user.role and current_user.role.name == "Employee" and current_user.id != run.employee_id:
        return jsonify({"error": {"code": "forbidden", "message": "Access restricted"}}), 403

    today = date.today()
    period_year = run.month_year.year
    period_month = run.month_year.month
    _, last_day_of_month = calendar.monthrange(period_year, period_month)
    month_end_date = date(period_year, period_month, last_day_of_month)

    is_month_open = (today <= month_end_date)
    is_official_mode = (request.args.get('mode') == 'official_disbursement')

    if is_month_open and is_official_mode:
        return jsonify({
            "error": "Official payslips can only be generated after the billing month has closed.",
            "available_after": month_end_date.strftime("%Y-%m-%d")
        }), 400

    pdf_bytes = generate_payslip_pdf_bytes(run, run.employee, is_provisional=is_month_open)
    response = make_response(pdf_bytes)
    response.headers['Content-Type'] = 'application/pdf'
    status_prefix = "provisional_estimate_" if is_month_open else "official_payslip_"
    response.headers['Content-Disposition'] = f'attachment; filename={status_prefix}{run.employee.employee_code}_{run.month_year.strftime("%Y_%m")}.pdf'
    return response

@payroll_bp.route("/salary-structures/<string:emp_id>", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def create_salary_structure(emp_id):
    data = request.get_json() or {}
    basic_salary = data.get("basic_salary")
    allowances = data.get("allowances", {})
    security_deduction_rate = data.get("security_deduction_rate", 5.0)
    tax_bracket_rate = data.get("tax_bracket_rate", 0.0)
    effective_from_str = data.get("effective_from", datetime.now().strftime("%Y-%m-%d"))

    if basic_salary is None:
        return jsonify({"error": {"code": "bad_request", "message": "basic_salary is required"}}), 400

    eff_date = datetime.strptime(effective_from_str, "%Y-%m-%d").date()

    structure = SalaryStructure(
        employee_id=emp_id,
        basic_salary=Decimal(str(basic_salary)),
        allowances=allowances,
        security_deduction_rate=Decimal(str(security_deduction_rate)),
        tax_bracket_rate=Decimal(str(tax_bracket_rate)),
        effective_from=eff_date
    )
    db_session.add(structure)
    db_session.commit()

    log_activity("salary_structure.updated", entity_type="SalaryStructure", entity_id=structure.id, user_id=get_current_user().id)
    return jsonify({"message": "Salary structure updated successfully", "id": structure.id}), 201


@payroll_bp.route("/payslips/<string:employee_id>", methods=["GET"])
@jwt_required()
def get_employee_dynamic_payslip(employee_id):
    """
    Returns dynamic attendance-backed payslip aggregation and daily punch audit drilldown.
    Query param: period=YYYY-MM (defaults to current month).
    """
    from app.services.payroll_service import get_dynamic_payslip_breakdown

    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"code": "unauthorized", "message": "Unauthenticated"}}), 401

    is_admin_or_hr = current_user.role and current_user.role.name in ("Super Admin", "HR Manager", "Admin")
    is_self = (current_user.id == employee_id or (current_user.employee and current_user.employee.employee_code == employee_id))

    if not is_admin_or_hr and not is_self:
        return jsonify({"error": {"code": "forbidden", "message": "Access restricted to own payslip"}}), 403

    period = request.args.get("period")

    try:
        data = get_dynamic_payslip_breakdown(db_session, employee_id, period)
        return jsonify(data), 200
    except ValueError as e:
        return jsonify({"error": {"code": "not_found", "message": str(e)}}), 404
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error computing payslip for {employee_id}: {e}")
        return jsonify({"error": {"code": "internal_error", "message": str(e)}}), 500

