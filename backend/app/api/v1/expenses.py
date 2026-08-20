import os
import base64
from datetime import datetime, date
from decimal import Decimal
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.models.expense import ExpenseRequest
from app.core.security import get_current_user, role_required, log_activity

expenses_bp = Blueprint("expenses", __name__, url_prefix="/expenses")

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "receipts")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@expenses_bp.route("", methods=["GET"])
@jwt_required()
def list_expenses():
    current_user = get_current_user()
    user_emp_id = current_user.employee.id if current_user.employee else None
    role_name = current_user.role.name if current_user.role else "Employee"

    query = db_session.query(ExpenseRequest)

    if role_name == "Employee":
        query = query.filter(ExpenseRequest.employee_id == user_emp_id)
    elif role_name == "Department Manager":
        from app.models.employee import Employee
        dept_id = current_user.employee.department_id if current_user.employee else None
        query = query.join(Employee, Employee.id == ExpenseRequest.employee_id).filter(
            Employee.department_id == dept_id
        )

    status = request.args.get("status")
    if status:
        query = query.filter(ExpenseRequest.status == status.lower())

    expenses = query.order_by(ExpenseRequest.created_at.desc()).all()
    res = []
    for e in expenses:
        emp_name = f"{e.employee.first_name} {e.employee.last_name}" if e.employee else "Unknown"
        emp_code = e.employee.employee_code if e.employee else ""
        res.append({
            "id": e.id,
            "employee_id": e.employee_id,
            "employee_name": emp_name,
            "employee_code": emp_code,
            "category": e.category,
            "amount": float(e.amount),
            "description": e.description,
            "claim_date": e.claim_date.strftime("%Y-%m-%d") if e.claim_date else e.created_at.strftime("%Y-%m-%d"),
            "receipt_filename": e.receipt_filename,
            "status": e.status,
            "approved_by": e.approved_by,
            "rejection_reason": e.rejection_reason,
            "created_at": e.created_at.isoformat()
        })
    return jsonify({"expenses": res})

@expenses_bp.route("", methods=["POST"])
@jwt_required()
def submit_expense():
    user = get_current_user()
    if not user.employee:
        return jsonify({"error": {"code": "bad_request", "message": "User has no employee profile"}}), 400

    # Support JSON or Multipart Form-Data
    if request.is_json:
        data = request.get_json() or {}
    else:
        data = request.form.to_dict()

    category = data.get("category")
    amount = data.get("amount")
    description = data.get("description", "")
    claim_date_str = data.get("claim_date")
    receipt_filename = data.get("receipt_filename")
    receipt_base64 = data.get("receipt_data")

    if not category or not amount:
        return jsonify({"error": {"code": "bad_request", "message": "Category and amount are required"}}), 400

    claim_date_obj = date.today()
    if claim_date_str:
        try:
            claim_date_obj = datetime.strptime(claim_date_str, "%Y-%m-%d").date()
        except Exception:
            claim_date_obj = date.today()

    saved_filename = None
    if receipt_filename and receipt_base64:
        try:
            filename_clean = f"{user.employee.employee_code}_{int(datetime.utcnow().timestamp())}_{receipt_filename}"
            filepath = os.path.join(UPLOAD_DIR, filename_clean)
            if "," in receipt_base64:
                receipt_base64 = receipt_base64.split(",", 1)[1]
            file_bytes = base64.b64decode(receipt_base64)
            with open(filepath, "wb") as f:
                f.write(file_bytes)
            saved_filename = filename_clean
        except Exception as err:
            print(f"Error saving receipt file: {err}")
            saved_filename = receipt_filename
    elif receipt_filename:
        saved_filename = receipt_filename

    exp = ExpenseRequest(
        employee_id=user.employee.id,
        category=category,
        amount=Decimal(str(amount)),
        description=description,
        claim_date=claim_date_obj,
        receipt_filename=saved_filename,
        status="pending"
    )
    db_session.add(exp)
    db_session.commit()

    log_activity("expense.submitted", entity_type="ExpenseRequest", entity_id=exp.id, user_id=user.id)
    return jsonify({"message": "Expense claim submitted successfully", "id": exp.id}), 201

@expenses_bp.route("/<string:exp_id>/approve", methods=["PUT"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def approve_expense(exp_id):
    user = get_current_user()
    exp = db_session.query(ExpenseRequest).filter(ExpenseRequest.id == exp_id).first()
    if not exp:
        return jsonify({"error": {"code": "not_found", "message": "Expense record not found"}}), 404

    if exp.status != "pending":
        return jsonify({"error": {"code": "conflict", "message": f"Cannot approve expense with status: {exp.status}"}}), 409

    exp.status = "approved"
    exp.approved_by = user.id
    db_session.commit()

    log_activity("expense.approved", entity_type="ExpenseRequest", entity_id=exp_id, user_id=user.id)
    return jsonify({"message": "Expense approved successfully"})

@expenses_bp.route("/<string:exp_id>/reject", methods=["PUT"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def reject_expense(exp_id):
    user = get_current_user()
    exp = db_session.query(ExpenseRequest).filter(ExpenseRequest.id == exp_id).first()
    if not exp:
        return jsonify({"error": {"code": "not_found", "message": "Expense record not found"}}), 404

    if exp.status != "pending":
        return jsonify({"error": {"code": "conflict", "message": f"Cannot reject expense with status: {exp.status}"}}), 409

    data = request.get_json() or {}
    reason = data.get("reason", "Declined by HR / Finance")
    exp.status = "rejected"
    exp.rejection_reason = reason
    exp.approved_by = user.id
    db_session.commit()

    log_activity("expense.rejected", entity_type="ExpenseRequest", entity_id=exp_id,
                 extra_metadata={"reason": reason}, user_id=user.id)
    return jsonify({"message": "Expense claim rejected"})

@expenses_bp.route("/<string:exp_id>/reimburse", methods=["PUT"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def reimburse_expense(exp_id):
    user = get_current_user()
    exp = db_session.query(ExpenseRequest).filter(ExpenseRequest.id == exp_id).first()
    if not exp:
        return jsonify({"error": {"code": "not_found", "message": "Expense record not found"}}), 404

    if exp.status not in ("approved", "pending"):
        return jsonify({"error": {"code": "conflict", "message": f"Cannot mark expense as reimbursed with status: {exp.status}"}}), 409

    exp.status = "reimbursed"
    exp.approved_by = user.id
    db_session.commit()

    log_activity("expense.reimbursed_direct", entity_type="ExpenseRequest", entity_id=exp_id, user_id=user.id)
    return jsonify({"message": "Expense marked as reimbursed directly"})

@expenses_bp.route("/<string:exp_id>", methods=["PUT"])
@jwt_required()
def update_expense(exp_id):
    user = get_current_user()
    exp = db_session.query(ExpenseRequest).filter(ExpenseRequest.id == exp_id).first()
    if not exp:
        return jsonify({"error": {"code": "not_found", "message": "Expense record not found"}}), 404

    role_name = user.role.name if user.role else "Employee"
    if role_name == "Employee" and user.employee and exp.employee_id != user.employee.id:
        return jsonify({"error": {"code": "forbidden", "message": "Access restricted"}}), 403

    # State Lifecycle Guard: APPROVED and REIMBURSED claims are read-only and locked
    if exp.status in ("approved", "reimbursed"):
        return jsonify({"error": {"code": "conflict", "message": f"Cannot edit or resubmit an expense claim with status {exp.status.upper()} (READ-ONLY)"}}), 409

    if request.is_json:
        data = request.get_json() or {}
    else:
        data = request.form.to_dict()

    category = data.get("category", exp.category)
    amount = data.get("amount", float(exp.amount))
    description = data.get("description", exp.description)
    claim_date_str = data.get("claim_date")
    receipt_filename = data.get("receipt_filename")
    receipt_base64 = data.get("receipt_data")

    if claim_date_str:
        try:
            exp.claim_date = datetime.strptime(claim_date_str, "%Y-%m-%d").date()
        except Exception:
            pass

    if receipt_filename and receipt_base64:
        try:
            emp_code = user.employee.employee_code if user.employee else "EMP"
            filename_clean = f"{emp_code}_{int(datetime.utcnow().timestamp())}_{receipt_filename}"
            filepath = os.path.join(UPLOAD_DIR, filename_clean)
            if "," in receipt_base64:
                receipt_base64 = receipt_base64.split(",", 1)[1]
            file_bytes = base64.b64decode(receipt_base64)
            with open(filepath, "wb") as f:
                f.write(file_bytes)
            exp.receipt_filename = filename_clean
        except Exception as err:
            print(f"Error saving receipt file: {err}")
            exp.receipt_filename = receipt_filename
    elif receipt_filename:
        exp.receipt_filename = receipt_filename

    exp.category = category
    exp.amount = Decimal(str(amount))
    exp.description = description

    was_rejected = exp.status == "rejected"
    # Transition status back to PENDING for re-evaluation
    exp.status = "pending"
    exp.rejection_reason = None
    exp.approved_by = None

    db_session.commit()

    log_activity("expense.resubmitted" if was_rejected else "expense.updated",
                 entity_type="ExpenseRequest", entity_id=exp.id, user_id=user.id)

    return jsonify({"message": "Expense claim updated and resubmitted for evaluation", "id": exp.id, "status": "pending"})

