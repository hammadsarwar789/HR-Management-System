import re
import hmac
import hashlib
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required
from sqlalchemy import func, or_
from app.db.session import db_session
from app.core.config import settings
from app.core.security import get_current_user, role_required, log_activity
from app.models.revenue import CompanyRevenue
from app.models.journal import FinancialJournalEntry, RevenueAuditLog
from app.models.payroll import SalaryStructure
from app.models.expense import ExpenseRequest
from app.models.employee import Employee

finance_bp = Blueprint("finance", __name__)

def generate_next_revenue_ref():
    """Generate sequential reference number like INV-2026-001."""
    year = datetime.utcnow().year
    prefix = f"INV-{year}-"
    last_rev = db_session.query(CompanyRevenue).filter(
        CompanyRevenue.reference_no.like(f"{prefix}%")
    ).order_by(CompanyRevenue.created_at.desc()).first()

    if not last_rev or not last_rev.reference_no:
        return f"{prefix}001"

    try:
        seq = int(last_rev.reference_no.split("-")[-1]) + 1
        return f"{prefix}{seq:03d}"
    except Exception:
        count = db_session.query(CompanyRevenue).count() + 1
        return f"{prefix}{count:03d}"

def post_journal_entry(ref_no, debit_account, credit_account, amount_pkr, description, user_id, entry_date=None):
    """Record an immutable double-entry transaction in FinancialJournalEntry."""
    journal = FinancialJournalEntry(
        entry_date=entry_date or datetime.utcnow().date(),
        reference_no=ref_no,
        account_debit=debit_account,
        account_credit=credit_account,
        amount_pkr=amount_pkr,
        description=description,
        created_by_user_id=user_id
    )
    db_session.add(journal)
    return journal

@finance_bp.route("/revenues", methods=["GET"])
@jwt_required()
@role_required("Super Admin", "HR Manager", "Finance Admin")
def get_revenues():
    """Retrieve itemized company revenues with filtering & pagination."""
    source_type = request.args.get("source_type")
    status = request.args.get("status")
    currency = request.args.get("currency")
    search = request.args.get("search", "").strip()
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 50))

    query = db_session.query(CompanyRevenue)

    if source_type:
        query = query.filter(CompanyRevenue.source_type == source_type.upper())
    if status:
        query = query.filter(CompanyRevenue.status == status.upper())
    if currency:
        query = query.filter(CompanyRevenue.currency == currency.upper())
    if search:
        query = query.filter(
            or_(
                CompanyRevenue.reference_no.ilike(f"%{search}%"),
                CompanyRevenue.title.ilike(f"%{search}%"),
                CompanyRevenue.client_name.ilike(f"%{search}%")
            )
        )

    total_count = query.count()
    revenues = query.order_by(CompanyRevenue.accrual_date.desc(), CompanyRevenue.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    items = []
    for r in revenues:
        items.append({
            "id": r.id,
            "reference_no": r.reference_no,
            "source_type": r.source_type,
            "title": r.title,
            "client_name": r.client_name or "N/A",
            "project_id": r.project_id,
            "gross_amount": float(r.gross_amount),
            "tax_deducted": float(r.tax_deducted),
            "fbr_withholding_rate": float(r.fbr_withholding_rate or 0.0),
            "net_amount": float(r.net_amount),
            "currency": r.currency,
            "booked_rate": float(r.booked_rate or 1.0),
            "settlement_rate": float(r.settlement_rate or 1.0),
            "conversion_rate": float(r.settlement_rate if r.status == "CLEARED" else r.booked_rate),
            "realized_fx_gain_loss": float(r.realized_fx_gain_loss or 0.0),
            "booked_amount_pkr": float(r.net_amount * (r.booked_rate or 1.0)),
            "settled_amount_pkr": float(r.net_amount * (r.settlement_rate or 1.0)) if r.status == "CLEARED" else 0.0,
            "accrual_date": r.accrual_date.strftime("%Y-%m-%d") if r.accrual_date else None,
            "received_date": r.received_date.strftime("%Y-%m-%d") if r.received_date else None,
            "settlement_date": r.settlement_date.strftime("%Y-%m-%d") if r.settlement_date else None,
            "payment_method": r.payment_method,
            "status": r.status,
            "proof_document_url": r.proof_document_url,
            "created_at": r.created_at.isoformat() if r.created_at else None
        })

    return jsonify({
        "revenues": items,
        "total": total_count,
        "page": page,
        "limit": limit
    })

@finance_bp.route("/revenues", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager", "Finance Admin")
def create_revenue():
    """Log an incoming revenue entry with FX rates & Accrual date."""
    current_user = get_current_user()
    data = request.get_json() or {}

    title = data.get("title")
    if not title:
        return jsonify({"error": {"code": "bad_request", "message": "Revenue title is required"}}), 400

    try:
        gross = float(data.get("gross_amount", 0))
        tax = float(data.get("tax_deducted", 0))
        fbr_rate = float(data.get("fbr_withholding_rate", 0.0))
        booked_rate = float(data.get("booked_rate", data.get("conversion_rate", 1.0)))
    except (ValueError, TypeError):
        return jsonify({"error": {"code": "bad_request", "message": "Invalid numeric input"}}), 400

    if gross <= 0:
        return jsonify({"error": {"code": "bad_request", "message": "Gross amount must be strictly greater than 0"}}), 400
    if tax < 0:
        return jsonify({"error": {"code": "bad_request", "message": "Tax deducted cannot be negative"}}), 400
    if tax > gross:
        return jsonify({"error": {"code": "bad_request", "message": "Tax deducted cannot exceed gross amount"}}), 400

    net_amount = gross - tax
    ref_no = data.get("reference_no") or generate_next_revenue_ref()

    existing_ref = db_session.query(CompanyRevenue).filter(CompanyRevenue.reference_no == ref_no).first()
    if existing_ref:
        return jsonify({"error": {"code": "duplicate", "message": f"Reference number {ref_no} already exists"}}), 400

    accrual_date_str = data.get("accrual_date") or data.get("received_date") or datetime.utcnow().strftime("%Y-%m-%d")
    received_date_str = data.get("received_date") or accrual_date_str
    try:
        accrual_date = datetime.strptime(accrual_date_str, "%Y-%m-%d").date()
        received_date = datetime.strptime(received_date_str, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": {"code": "bad_request", "message": "Invalid date format. Expected YYYY-MM-DD"}}), 400

    status = data.get("status", "CLEARED").upper()
    settlement_rate = float(data.get("settlement_rate", booked_rate))
    settlement_date = None
    fx_gain_loss = 0.0

    if status == "CLEARED":
        settlement_date = received_date
        fx_gain_loss = net_amount * (settlement_rate - booked_rate)

    new_rev = CompanyRevenue(
        reference_no=ref_no,
        source_type=data.get("source_type", "PROJECT").upper(),
        title=title,
        client_name=data.get("client_name"),
        project_id=data.get("project_id"),
        gross_amount=gross,
        tax_deducted=tax,
        fbr_withholding_rate=fbr_rate,
        net_amount=net_amount,
        currency=data.get("currency", "PKR").upper(),
        booked_rate=booked_rate,
        settlement_rate=settlement_rate,
        conversion_rate=settlement_rate,
        realized_fx_gain_loss=fx_gain_loss,
        accrual_date=accrual_date,
        received_date=received_date,
        settlement_date=settlement_date,
        payment_method=data.get("payment_method", "WIRE_TRANSFER").upper(),
        status=status,
        proof_document_url=data.get("proof_document_url"),
        created_by_user_id=current_user.id
    )
    db_session.add(new_rev)
    db_session.flush()

    # Append Audit Log
    audit = RevenueAuditLog(
        revenue_id=new_rev.id,
        action="CREATED",
        previous_state=None,
        new_state={
            "reference_no": ref_no,
            "status": status,
            "net_amount": net_amount,
            "currency": new_rev.currency,
            "booked_rate": booked_rate
        },
        actor_id=current_user.id
    )
    db_session.add(audit)

    # If Cleared, post Double-Entry Journal
    if status == "CLEARED":
        total_pkr = net_amount * settlement_rate
        post_journal_entry(
            ref_no=ref_no,
            debit_account="1010-BANK-CLEARING",
            credit_account="4010-REVENUE-SERVICES",
            amount_pkr=total_pkr,
            description=f"Revenue Settlement - {title} ({ref_no})",
            user_id=current_user.id,
            entry_date=settlement_date
        )

    db_session.commit()
    log_activity("revenue.created", entity_type="CompanyRevenue", entity_id=new_rev.id, user_id=current_user.id)

    return jsonify({
        "message": "Revenue entry created successfully",
        "revenue": {
            "id": new_rev.id,
            "reference_no": ref_no,
            "net_amount": net_amount,
            "realized_fx_gain_loss": fx_gain_loss,
            "settled_amount_pkr": net_amount * settlement_rate
        }
    }), 201

@finance_bp.route("/revenues/<string:rev_id>/settle", methods=["PATCH"])
@jwt_required()
@role_required("Super Admin", "HR Manager", "Finance Admin")
def settle_revenue(rev_id):
    """Settle invoice & calculate Realized FX Gain/Loss with Double-Entry Journal Entry."""
    current_user = get_current_user()
    rev = db_session.query(CompanyRevenue).filter(CompanyRevenue.id == rev_id).first()
    if not rev:
        return jsonify({"error": {"code": "not_found", "message": "Revenue entry not found"}}), 404

    data = request.get_json() or {}
    try:
        settlement_rate = float(data.get("settlement_rate", rev.settlement_rate or rev.booked_rate))
    except (ValueError, TypeError):
        return jsonify({"error": {"code": "bad_request", "message": "Invalid settlement_rate numeric value"}}), 400

    settlement_date_str = data.get("settlement_date") or datetime.utcnow().strftime("%Y-%m-%d")
    try:
        settlement_date = datetime.strptime(settlement_date_str, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": {"code": "bad_request", "message": "Invalid settlement_date format. Expected YYYY-MM-DD"}}), 400

    old_state = {
        "status": rev.status,
        "settlement_rate": rev.settlement_rate,
        "settlement_date": rev.settlement_date.strftime("%Y-%m-%d") if rev.settlement_date else None,
        "realized_fx_gain_loss": rev.realized_fx_gain_loss
    }

    # Compute Realized FX Gain/Loss: net_amount * (settlement_rate - booked_rate)
    fx_gain_loss = rev.net_amount * (settlement_rate - rev.booked_rate)

    rev.status = "CLEARED"
    rev.settlement_rate = settlement_rate
    rev.settlement_date = settlement_date
    rev.realized_fx_gain_loss = fx_gain_loss
    if data.get("payment_method"):
        rev.payment_method = data["payment_method"].upper()

    # Append Audit Log
    audit = RevenueAuditLog(
        revenue_id=rev.id,
        action="SETTLED",
        previous_state=old_state,
        new_state={
            "status": "CLEARED",
            "settlement_rate": settlement_rate,
            "settlement_date": settlement_date.strftime("%Y-%m-%d"),
            "realized_fx_gain_loss": fx_gain_loss
        },
        actor_id=current_user.id
    )
    db_session.add(audit)

    # Post Double-Entry Journal Entry
    settled_pkr = rev.net_amount * settlement_rate
    post_journal_entry(
        ref_no=rev.reference_no,
        debit_account="1010-BANK-MAIN",
        credit_account="4010-REVENUE-SERVICES",
        amount_pkr=settled_pkr,
        description=f"Bank Settlement Clear ({rev.reference_no}) - FX Rate: {settlement_rate}",
        user_id=current_user.id,
        entry_date=settlement_date
    )

    db_session.commit()
    log_activity("revenue.settled", entity_type="CompanyRevenue", entity_id=rev.id, user_id=current_user.id)

    return jsonify({
        "message": f"Revenue invoice {rev.reference_no} settled successfully",
        "revenue": {
            "id": rev.id,
            "reference_no": rev.reference_no,
            "status": "CLEARED",
            "settlement_rate": settlement_rate,
            "realized_fx_gain_loss": fx_gain_loss,
            "settled_amount_pkr": settled_pkr
        }
    })

@finance_bp.route("/summary", methods=["GET"])
@jwt_required()
@role_required("Super Admin", "HR Manager", "Finance Admin")
def get_financial_summary():
    """
    Executive Financial Breakdown: Accrual vs. Cash Basis Accounting, FX Gain/Loss & Tax Withholding
    """
    all_revs = db_session.query(CompanyRevenue).all()

    # 1. Accrual Basis (Booked Revenue using booked_rate)
    accrual_booked_revenue = sum(r.net_amount * r.booked_rate for r in all_revs)

    # 2. Cash Basis (Cleared Realized Revenue using settlement_rate)
    cleared_revs = [r for r in all_revs if r.status == "CLEARED"]
    cash_realized_revenue = sum(r.net_amount * (r.settlement_rate or r.booked_rate) for r in cleared_revs)

    # 3. Realized FX Gain / Loss Total
    total_fx_gain_loss = sum(r.realized_fx_gain_loss or 0.0 for r in cleared_revs)

    # 4. FBR Tax Withheld Total (PKR)
    total_tax_withheld = sum(r.tax_deducted * r.booked_rate for r in all_revs)

    project_inflow = sum(r.net_amount * (r.settlement_rate or r.booked_rate) for r in cleared_revs if r.source_type == "PROJECT")
    saas_inflow = sum(r.net_amount * (r.settlement_rate or r.booked_rate) for r in cleared_revs if r.source_type == "PRODUCT_SAAS")
    other_inflow = sum(r.net_amount * (r.settlement_rate or r.booked_rate) for r in cleared_revs if r.source_type == "OTHER")

    now = datetime.utcnow()
    current_month_revs = [
        r for r in cleared_revs
        if r.accrual_date and r.accrual_date.year == now.year and r.accrual_date.month == now.month
    ]
    monthly_inflow = sum(r.net_amount * (r.settlement_rate or r.booked_rate) for r in current_month_revs)

    # 5. Outflow Calculation (Payroll + Approved Expense Claims)
    active_emp_ids = [e.id for e in db_session.query(Employee).filter(Employee.status == "active").all()]
    salary_structures = db_session.query(SalaryStructure).filter(SalaryStructure.employee_id.in_(active_emp_ids)).all() if active_emp_ids else []

    monthly_payroll_outflow = 0.0
    for s in salary_structures:
        b_sal = float(s.basic_salary or 0.0)
        allowance_total = sum(float(v or 0) for v in (s.allowances or {}).values()) if isinstance(s.allowances, dict) else 0.0
        monthly_payroll_outflow += (b_sal + allowance_total)

    approved_expenses = db_session.query(ExpenseRequest).filter(
        ExpenseRequest.status.in_(["APPROVED", "REIMBURSED", "approved", "reimbursed"])
    ).all()
    total_expense_outflow = sum(float(e.amount or 0.0) for e in approved_expenses)

    total_outflow = monthly_payroll_outflow + total_expense_outflow

    # Cash Margin vs Accrual Margin
    cash_net_margin = cash_realized_revenue - total_outflow
    accrual_net_margin = accrual_booked_revenue - total_outflow

    return jsonify({
        "summary": {
            "cash_realized_revenue_pkr": round(cash_realized_revenue, 2),
            "accrual_booked_revenue_pkr": round(accrual_booked_revenue, 2),
            "total_fx_gain_loss_pkr": round(total_fx_gain_loss, 2),
            "total_tax_withheld_pkr": round(total_tax_withheld, 2),
            "monthly_inflow_pkr": round(monthly_inflow, 2),
            "project_inflow_pkr": round(project_inflow, 2),
            "saas_inflow_pkr": round(saas_inflow, 2),
            "other_inflow_pkr": round(other_inflow, 2),
            "total_outflow_pkr": round(total_outflow, 2),
            "monthly_payroll_outflow_pkr": round(monthly_payroll_outflow, 2),
            "total_expense_outflow_pkr": round(total_expense_outflow, 2),
            "cash_net_margin_pkr": round(cash_net_margin, 2),
            "accrual_net_margin_pkr": round(accrual_net_margin, 2),
            "is_profitable": cash_net_margin >= 0
        }
    })

@finance_bp.route("/revenues/<string:rev_id>/attachment-signed-url", methods=["GET"])
@jwt_required()
@role_required("Super Admin", "HR Manager", "Finance Admin")
def get_attachment_signed_url(rev_id):
    """Generate a time-limited HMAC-SHA256 signed URL for proof attachments (valid 15 mins)."""
    current_user = get_current_user()
    rev = db_session.query(CompanyRevenue).filter(CompanyRevenue.id == rev_id).first()
    if not rev or not rev.proof_document_url:
        return jsonify({"error": {"code": "not_found", "message": "Attachment document not found for this revenue entry"}}), 404

    exp_timestamp = int((datetime.utcnow() + timedelta(minutes=15)).timestamp())
    msg = f"{rev.id}:{current_user.id}:{exp_timestamp}".encode('utf-8')
    sig = hmac.new(settings.SECRET_KEY.encode('utf-8'), msg, hashlib.sha256).hexdigest()

    signed_url = f"/api/v1/finance/download-attachment?rev_id={rev.id}&exp={exp_timestamp}&sig={sig}"
    return jsonify({
        "signed_url": signed_url,
        "expires_at": datetime.fromtimestamp(exp_timestamp).isoformat()
    })

@finance_bp.route("/download-attachment", methods=["GET"])
@jwt_required()
def download_attachment():
    """Verify HMAC signature & expiration before granting access to payment proof attachments."""
    current_user = get_current_user()
    rev_id = request.args.get("rev_id")
    exp_str = request.args.get("exp")
    sig = request.args.get("sig")

    if not rev_id or not exp_str or not sig:
        return jsonify({"error": {"code": "bad_request", "message": "Missing required signature parameters"}}), 400

    try:
        exp_timestamp = int(exp_str)
    except ValueError:
        return jsonify({"error": {"code": "bad_request", "message": "Invalid timestamp format"}}), 400

    if int(datetime.utcnow().timestamp()) > exp_timestamp:
        return jsonify({"error": {"code": "unauthorized", "message": "Signed URL has expired"}}), 401

    msg = f"{rev_id}:{current_user.id}:{exp_str}".encode('utf-8')
    expected_sig = hmac.new(settings.SECRET_KEY.encode('utf-8'), msg, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(sig, expected_sig):
        return jsonify({"error": {"code": "forbidden", "message": "Invalid HMAC signature"}}), 403

    rev = db_session.query(CompanyRevenue).filter(CompanyRevenue.id == rev_id).first()
    if not rev or not rev.proof_document_url:
        return jsonify({"error": {"code": "not_found", "message": "Attachment not found"}}), 404

    return jsonify({"proof_document_url": rev.proof_document_url})

@finance_bp.route("/export/csv", methods=["GET"])
@jwt_required()
@role_required("Super Admin", "HR Manager", "Finance Admin")
def export_reconciliation_csv():
    """Generate watermarked CSV financial reconciliation report."""
    current_user = get_current_user()
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    revenues = db_session.query(CompanyRevenue).order_by(CompanyRevenue.accrual_date.desc()).all()

    watermark = f"# CONFIDENTIAL - MAXENIUS FINANCIAL RECONCILIATION REPORT\n# EXPORTED BY: {current_user.email} (ID: {current_user.id})\n# GENERATED AT: {now_str}\n\n"

    headers = "Reference No,Source Type,Title,Client Name,Gross Amount,Tax Deducted,Net Amount,Currency,Booked Rate,Settlement Rate,Settled Amount (PKR),FX Gain/Loss (PKR),Accrual Date,Settlement Date,Status\n"
    rows = []
    for r in revenues:
        settled_pkr = r.net_amount * (r.settlement_rate or r.booked_rate) if r.status == "CLEARED" else 0.0
        rows.append(
            f'"{r.reference_no}","{r.source_type}","{r.title}","{r.client_name or ""}","{r.gross_amount}","{r.tax_deducted}","{r.net_amount}","{r.currency}","{r.booked_rate}","{r.settlement_rate}","{settled_pkr:.2f}","{r.realized_fx_gain_loss:.2f}","{r.accrual_date}","{r.settlement_date or ""}","{r.status}"'
        )

    csv_content = watermark + headers + "\n".join(rows)

    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=financial_reconciliation_{datetime.utcnow().strftime('%Y%m%d')}.csv"}
    )
