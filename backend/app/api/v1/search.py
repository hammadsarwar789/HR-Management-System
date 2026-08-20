from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.core.security import get_current_user
from app.models.employee import Employee, Department
from app.models.payroll import PayrollRun, SalaryStructure
from app.models.leave import LeaveRequest
from app.models.attendance import Attendance
from app.models.asset import Asset
from app.models.expense import ExpenseRequest
from app.models.holiday import Holiday, Announcement
from app.models.audit import ActivityLog

search_bp = Blueprint("search", __name__, url_prefix="/search")

@search_bp.route("", methods=["GET"])
@jwt_required()
def global_search():
    user = get_current_user()
    if not user or not user.is_active:
        return jsonify({"error": {"code": "unauthorized", "message": "User inactive or unauthenticated"}}), 401

    query_str = request.args.get("q", "").strip()
    scope = request.args.get("scope", "global").strip().lower()
    q_lower = query_str.lower()
    role_name = user.role.name if user.role else "Employee"
    user_emp_id = user.employee.id if user.employee else None
    user_dept_id = user.employee.department_id if user.employee else None

    actions_results = []
    nav_results = []
    emp_results = []
    payroll_results = []
    leave_results = []
    asset_results = []
    expense_results = []
    notice_results = []

    # 1. NAVIGATION SHORTCUTS
    all_navs = [
        {"title": "Employees", "subtitle": "Workforce directory & salary structures", "icon": "users", "url": "/employees", "role_min": "All"},
        {"title": "Payroll & 5% Holdback", "subtitle": "Monthly Celery batch runs & escrow", "icon": "credit-card", "url": "/payroll", "role_min": "All"},
        {"title": "Attendance & Logs", "subtitle": "Punch in/out, late minutes & overtime", "icon": "clock", "url": "/attendance", "role_min": "All"},
        {"title": "Leave Management", "subtitle": "Entitlement balances & leave approvals", "icon": "calendar", "url": "/leave", "role_min": "All"},
        {"title": "Expense Claims", "subtitle": "Travel & procurement reimbursements", "icon": "receipt", "url": "/expenses", "role_min": "All"},
        {"title": "Assets Inventory", "subtitle": "Laptops, SIM cards & hardware tracking", "icon": "package", "url": "/assets", "role_min": "All"},
        {"title": "Performance & KPIs", "subtitle": "Evaluations & quarterly OKRs", "icon": "award", "url": "/performance", "role_min": "All"},
        {"title": "Holidays & Notices", "subtitle": "Official 2026 holiday calendar", "icon": "bell", "url": "/notices", "role_min": "All"},
        {"title": "Audit & Activity Logs", "subtitle": "System audit trail & security logs", "icon": "shield-check", "url": "/audit", "role_min": "Admin"},
    ]

    for n in all_navs:
        if n["role_min"] == "Admin" and role_name not in ("Super Admin", "HR Manager"):
            continue
        if not q_lower or q_lower in n["title"].lower() or q_lower in n["subtitle"].lower() or q_lower in n["url"].lower():
            nav_results.append({
                "type": "navigation",
                "title": n["title"],
                "subtitle": n["subtitle"],
                "icon": n["icon"],
                "url": n["url"]
            })

    # 2. QUICK ACTIONS
    all_actions = [
        {"title": "Add New Employee", "subtitle": "Register new workforce profile & salary", "icon": "user-plus", "url": "/employees", "action": "CREATE_EMPLOYEE", "role_min": "Admin"},
        {"title": "Run Monthly Payroll Batch", "subtitle": "Execute Celery batch payroll engine", "icon": "play", "url": "/payroll", "action": "RUN_PAYROLL", "role_min": "Admin"},
        {"title": "Approve Pending Leaves", "subtitle": "Review pending employee leave queue", "icon": "check-circle", "url": "/leave", "action": "APPROVE_LEAVES", "role_min": "Approver"},
        {"title": "Punch Check-In / Check-Out", "subtitle": "Record daily attendance punch", "icon": "user-check", "url": "/attendance", "action": "PUNCH_ATTENDANCE", "role_min": "All"},
        {"title": "Assign Company Asset", "subtitle": "Assign hardware to an employee", "icon": "package", "url": "/assets", "action": "ASSIGN_ASSET", "role_min": "Admin"},
        {"title": "File Expense Claim", "subtitle": "Submit travel or procurement claim", "icon": "receipt", "url": "/expenses", "action": "FILE_EXPENSE", "role_min": "All"},
    ]

    for a in all_actions:
        if a["role_min"] == "Admin" and role_name not in ("Super Admin", "HR Manager"):
            continue
        if a["role_min"] == "Approver" and role_name not in ("Super Admin", "HR Manager", "Department Manager"):
            continue
        if not q_lower or q_lower in a["title"].lower() or q_lower in a["subtitle"].lower() or q_lower in a["action"].lower():
            actions_results.append({
                "type": "action",
                "action_type": a["action"],
                "title": a["title"],
                "subtitle": a["subtitle"],
                "icon": a["icon"],
                "url": a["url"]
            })

    # 3. EMPLOYEES SEARCH (Strict authorization filtered)
    emp_query = db_session.query(Employee)
    if role_name == "Employee":
        emp_query = emp_query.filter(Employee.id == user_emp_id)
    elif role_name == "Department Manager":
        emp_query = emp_query.filter(Employee.department_id == user_dept_id)

    if q_lower:
        emp_query = emp_query.filter(
            (Employee.first_name.ilike(f"%{query_str}%")) |
            (Employee.last_name.ilike(f"%{query_str}%")) |
            (Employee.employee_code.ilike(f"%{query_str}%")) |
            (Employee.designation.ilike(f"%{query_str}%")) |
            (Employee.cnic.ilike(f"%{query_str}%"))
        )

    employees = emp_query.limit(5).all()
    for e in employees:
        sal_struct = db_session.query(SalaryStructure).filter(SalaryStructure.employee_id == e.id).order_by(SalaryStructure.effective_from.desc()).first()
        basic_sal = float(sal_struct.basic_salary) if sal_struct else 0.0
        sec_holdback = basic_sal * 0.05
        dept_name = e.department.name if e.department else "Engineering"
        emp_results.append({
            "type": "employee",
            "id": e.id,
            "title": f"{e.first_name} {e.last_name}",
            "subtitle": f"{e.designation} • {dept_name} • {e.employee_code} • Basic: PKR {basic_sal:,.0f} | 5% Escrow: PKR {sec_holdback:,.0f}",
            "icon": "user",
            "code": e.employee_code,
            "url": "/employees"
        })

    # 4. PAYROLL & PAYSLIPS SEARCH (Strict authorization filtered)
    pay_query = db_session.query(PayrollRun)
    if role_name == "Employee":
        pay_query = pay_query.filter(PayrollRun.employee_id == user_emp_id)
    elif role_name == "Department Manager":
        pay_query = pay_query.join(Employee).filter(Employee.department_id == user_dept_id)

    if q_lower:
        pay_query = pay_query.join(Employee).filter(
            (Employee.first_name.ilike(f"%{query_str}%")) |
            (Employee.last_name.ilike(f"%{query_str}%")) |
            (Employee.employee_code.ilike(f"%{query_str}%"))
        )

    payroll_runs = pay_query.limit(4).all()
    for p in payroll_runs:
        emp_name = f"{p.employee.first_name} {p.employee.last_name}" if p.employee else "Employee"
        emp_code = p.employee.employee_code if p.employee else "EMP"
        month_str = p.month_year.strftime('%B %Y') if p.month_year else ""
        payroll_results.append({
            "type": "payroll",
            "id": p.id,
            "title": f"Payslip — {emp_name} ({month_str})",
            "subtitle": f"{emp_code} • Net Pay: PKR {float(p.net_salary):,.2f} • 5% Holdback: PKR {float(p.security_deduction):,.2f}",
            "icon": "receipt",
            "url": "/payroll"
        })

    # 5. LEAVE REQUESTS SEARCH
    leave_query = db_session.query(LeaveRequest)
    if role_name == "Employee":
        leave_query = leave_query.filter(LeaveRequest.employee_id == user_emp_id)
    elif role_name == "Department Manager":
        leave_query = leave_query.join(Employee).filter(Employee.department_id == user_dept_id)

    if q_lower:
        leave_query = leave_query.join(Employee).filter(
            (Employee.first_name.ilike(f"%{query_str}%")) |
            (Employee.last_name.ilike(f"%{query_str}%")) |
            (LeaveRequest.status.ilike(f"%{query_str}%"))
        )

    leaves = leave_query.limit(3).all()
    for l in leaves:
        emp_name = f"{l.employee.first_name} {l.employee.last_name}" if l.employee else "Employee"
        type_name = l.leave_type.name if l.leave_type else "Leave"
        leave_results.append({
            "type": "leave",
            "id": l.id,
            "title": f"Leave Request — {emp_name} ({type_name})",
            "subtitle": f"{l.start_date} to {l.end_date} • {l.total_days} Days • Status: {l.status.upper()}",
            "icon": "calendar",
            "url": "/leave"
        })

    # Combined categorized payload
    return jsonify({
        "query": query_str,
        "scope": scope,
        "role": role_name,
        "actions": actions_results[:4],
        "navigation": nav_results[:5],
        "employees": emp_results,
        "payroll": payroll_results,
        "leaves": leave_results
    })
