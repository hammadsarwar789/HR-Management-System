from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.models.asset import Asset, AssetAssignment, AssetRequest
from app.core.security import get_current_user, role_required, log_activity

assets_bp = Blueprint("assets", __name__, url_prefix="/assets")

@assets_bp.route("", methods=["GET"])
@jwt_required()
def list_assets():
    user = get_current_user()
    role_name = user.role.name if user.role else "Employee"
    user_emp_id = user.employee.id if user.employee else None
    user_dept_id = user.employee.department_id if user.employee else None

    category = request.args.get("category")
    status = request.args.get("status")

    query = db_session.query(Asset)

    if category:
        query = query.filter(Asset.category == category)
    if status:
        query = query.filter(Asset.status == status)

    # RBAC Scoping:
    # Regular employees see assets assigned directly to them AND available stock hardware catalog
    # (Assets assigned to other staff remain strictly hidden for privacy)
    if role_name == "Employee":
        assigned_subq = db_session.query(AssetAssignment.asset_id).filter(
            AssetAssignment.employee_id == user_emp_id,
            AssetAssignment.returned_date == None
        ).scalar_subquery()
        query = query.filter(
            (Asset.id.in_(assigned_subq)) | (Asset.status == "available")
        )
    elif role_name == "Department Manager":
        from app.models.employee import Employee
        dept_assigned_subq = db_session.query(AssetAssignment.asset_id).join(
            Employee, Employee.id == AssetAssignment.employee_id
        ).filter(
            Employee.department_id == user_dept_id,
            AssetAssignment.returned_date == None
        ).scalar_subquery()
        query = query.filter(
            (Asset.id.in_(dept_assigned_subq)) | (Asset.status == "available")
        )

    # Order chronologically/alphabetically by Asset Tag ID (MX-LAP-101, MX-LAP-102, MX-MOB-201, MX-SIM-301)
    assets = query.order_by(Asset.asset_tag.asc()).all()
    res = []
    for a in assets:
        active_assignment = db_session.query(AssetAssignment).filter(AssetAssignment.asset_id == a.id, AssetAssignment.returned_date == None).first()
        pending_req = db_session.query(AssetRequest).filter(
            AssetRequest.asset_id == a.id,
            AssetRequest.status == "PENDING"
        ).order_by(AssetRequest.requested_at.desc()).first()

        res.append({
            "id": a.id,
            "asset_tag": a.asset_tag,
            "category": a.category,
            "model": a.model,
            "serial_number": a.serial_number,
            "status": a.status,
            "assigned_to": {
                "employee_id": active_assignment.employee_id,
                "employee_name": f"{active_assignment.employee.first_name} {active_assignment.employee.last_name}",
                "assigned_date": active_assignment.assigned_date.strftime("%Y-%m-%d")
            } if active_assignment and active_assignment.employee else None,
            "pending_request": {
                "id": pending_req.id,
                "employee_id": pending_req.employee_id,
                "employee_name": f"{pending_req.employee.first_name} {pending_req.employee.last_name}" if pending_req.employee else "",
                "notes": pending_req.notes,
                "requested_at": pending_req.requested_at.strftime("%Y-%m-%d %H:%M") if pending_req.requested_at else "",
                "requested_by_me": pending_req.employee_id == user_emp_id
            } if pending_req else None
        })
    return jsonify({"assets": res})

@assets_bp.route("/requests", methods=["GET"])
@jwt_required()
def list_asset_requests():
    user = get_current_user()
    role_name = user.role.name if user.role else "Employee"
    user_emp_id = user.employee.id if user.employee else None

    query = db_session.query(AssetRequest)
    if role_name == "Employee":
        query = query.filter(AssetRequest.employee_id == user_emp_id)
    elif role_name == "Department Manager":
        from app.models.employee import Employee
        query = query.join(Employee, Employee.id == AssetRequest.employee_id).filter(
            Employee.department_id == user.employee.department_id if user.employee else None
        )

    status_param = request.args.get("status")
    if status_param:
        query = query.filter(AssetRequest.status == status_param.upper())

    requests_list = query.order_by(AssetRequest.requested_at.desc()).all()
    res = []
    for r in requests_list:
        res.append({
            "id": r.id,
            "asset_id": r.asset_id,
            "asset_tag": r.asset.asset_tag if r.asset else "",
            "asset_category": r.asset.category if r.asset else "",
            "asset_model": r.asset.model if r.asset else "",
            "employee_id": r.employee_id,
            "employee_name": f"{r.employee.first_name} {r.employee.last_name}" if r.employee else "",
            "employee_code": r.employee.employee_code if r.employee else "",
            "notes": r.notes,
            "status": r.status,
            "requested_at": r.requested_at.strftime("%Y-%m-%d %H:%M") if r.requested_at else "",
            "rejection_reason": r.rejection_reason
        })
    return jsonify({"requests": res})

@assets_bp.route("/<string:asset_id>/request", methods=["POST"])
@jwt_required()
def request_asset(asset_id):
    user = get_current_user()
    if not user or not user.employee:
        return jsonify({"error": {"code": "bad_request", "message": "Employee profile required"}}), 400

    asset = db_session.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        return jsonify({"error": {"code": "not_found", "message": "Asset not found"}}), 404

    if asset.status != "available":
        return jsonify({"error": {"code": "conflict", "message": "Asset is not available for request"}}), 409

    # Check if there is already an open pending request for this asset
    existing_req = db_session.query(AssetRequest).filter(
        AssetRequest.asset_id == asset_id,
        AssetRequest.status == "PENDING"
    ).first()
    if existing_req:
        return jsonify({"error": {"code": "conflict", "message": "This asset already has a pending assignment request"}}), 409

    data = request.get_json() or {}
    reason = data.get("reason", "Requested by employee via portal")

    new_req = AssetRequest(
        asset_id=asset_id,
        employee_id=user.employee.id,
        notes=reason,
        status="PENDING",
        requested_at=datetime.utcnow()
    )
    db_session.add(new_req)
    db_session.commit()

    log_activity(
        "asset.requested",
        entity_type="AssetRequest",
        entity_id=new_req.id,
        extra_metadata={
            "asset_id": asset_id,
            "asset_tag": asset.asset_tag,
            "employee_id": user.employee.id,
            "employee_name": f"{user.employee.first_name} {user.employee.last_name}",
            "reason": reason
        },
        user_id=user.id
    )

    return jsonify({"message": f"Request for asset {asset.asset_tag} ({asset.model}) submitted successfully! HR Manager has been notified.", "id": new_req.id})

@assets_bp.route("/requests/<int:request_id>/approve", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def approve_asset_request(request_id):
    user = get_current_user()
    req_item = db_session.query(AssetRequest).filter(AssetRequest.id == request_id).first()
    if not req_item:
        return jsonify({"error": {"code": "not_found", "message": "Asset request not found"}}), 404

    if req_item.status != "PENDING":
        return jsonify({"error": {"code": "conflict", "message": f"Request is already {req_item.status.lower()}"}}), 409

    asset = db_session.query(Asset).filter(Asset.id == req_item.asset_id).first()
    if not asset:
        return jsonify({"error": {"code": "not_found", "message": "Asset not found"}}), 404

    if asset.status == "assigned":
        return jsonify({"error": {"code": "conflict", "message": "Asset is already assigned to another employee"}}), 409

    # 1. Update request record
    req_item.status = "APPROVED"
    req_item.actioned_by_id = user.id
    req_item.actioned_at = datetime.utcnow()

    # 2. Update asset status & create assignment record
    asset.status = "assigned"
    assignment = AssetAssignment(
        asset_id=asset.id,
        employee_id=req_item.employee_id,
        assigned_date=datetime.now().date(),
        notes=f"Approved asset request #{req_item.id}: {req_item.notes or ''}"
    )
    db_session.add(assignment)

    # 3. Close any other pending requests for this same asset
    other_pending = db_session.query(AssetRequest).filter(
        AssetRequest.asset_id == asset.id,
        AssetRequest.id != req_item.id,
        AssetRequest.status == "PENDING"
    ).all()
    for op in other_pending:
        op.status = "REJECTED"
        op.rejection_reason = "Asset assigned to another approved request"

    db_session.commit()
    log_activity("asset.request_approved", entity_type="AssetRequest", entity_id=request_id, user_id=user.id)
    return jsonify({"message": f"Asset request #{request_id} approved and asset {asset.asset_tag} assigned successfully!"})

@assets_bp.route("/requests/<int:request_id>/reject", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def reject_asset_request(request_id):
    user = get_current_user()
    data = request.get_json() or {}
    rejection_reason = data.get("rejection_reason", "Request declined by HR Manager")

    req_item = db_session.query(AssetRequest).filter(AssetRequest.id == request_id).first()
    if not req_item:
        return jsonify({"error": {"code": "not_found", "message": "Asset request not found"}}), 404

    if req_item.status != "PENDING":
        return jsonify({"error": {"code": "conflict", "message": f"Request is already {req_item.status.lower()}"}}), 409

    req_item.status = "REJECTED"
    req_item.rejection_reason = rejection_reason
    req_item.actioned_by_id = user.id
    req_item.actioned_at = datetime.utcnow()

    db_session.commit()
    log_activity("asset.request_rejected", entity_type="AssetRequest", entity_id=request_id, user_id=user.id)
    return jsonify({"message": f"Asset request #{request_id} rejected successfully."})

@assets_bp.route("", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def create_asset():
    data = request.get_json() or {}
    asset_tag = data.get("asset_tag")
    category = data.get("category")
    model = data.get("model")
    serial_number = data.get("serial_number")

    if not all([asset_tag, category, model]):
        return jsonify({"error": {"code": "bad_request", "message": "Missing asset tag, category, or model"}}), 400

    asset = Asset(
        asset_tag=asset_tag,
        category=category,
        model=model,
        serial_number=serial_number,
        status="available"
    )
    db_session.add(asset)
    db_session.commit()
    log_activity("asset.created", entity_type="Asset", entity_id=asset.id, user_id=get_current_user().id)
    return jsonify({"message": "Asset created", "id": asset.id}), 201

@assets_bp.route("/<string:asset_id>/assign", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def assign_asset(asset_id):
    data = request.get_json() or {}
    employee_id = data.get("employee_id")
    assigned_date_str = data.get("assigned_date", datetime.now().strftime("%Y-%m-%d"))

    asset = db_session.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        return jsonify({"error": {"code": "not_found", "message": "Asset not found"}}), 404

    # BUG-008 FIX: Prevent double-assignment of already-assigned assets
    if asset.status == "assigned":
        return jsonify({"error": {"code": "conflict", "message": "Asset is already assigned to another employee"}}), 409

    existing_assignment = db_session.query(AssetAssignment).filter(
        AssetAssignment.asset_id == asset_id,
        AssetAssignment.returned_date == None
    ).first()
    if existing_assignment:
        return jsonify({"error": {"code": "conflict", "message": "Asset already has an active open assignment"}}), 409

    assigned_date = datetime.strptime(assigned_date_str, "%Y-%m-%d").date()

    assignment = AssetAssignment(
        asset_id=asset_id,
        employee_id=employee_id,
        assigned_date=assigned_date,
        notes=data.get("notes")
    )
    asset.status = "assigned"
    db_session.add(assignment)
    db_session.commit()

    log_activity("asset.assigned", entity_type="Asset", entity_id=asset_id, extra_metadata={"employee_id": employee_id}, user_id=get_current_user().id)
    return jsonify({"message": "Asset assigned successfully"})

@assets_bp.route("/<string:asset_id>/return", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def return_asset(asset_id):
    assignment = db_session.query(AssetAssignment).filter(
        AssetAssignment.asset_id == asset_id,
        AssetAssignment.returned_date == None
    ).first()

    if assignment:
        assignment.returned_date = datetime.now().date()

    asset = db_session.query(Asset).filter(Asset.id == asset_id).first()
    if asset:
        asset.status = "available"

    db_session.commit()
    log_activity("asset.returned", entity_type="Asset", entity_id=asset_id, user_id=get_current_user().id)
    return jsonify({"message": "Asset returned successfully"})

@assets_bp.route("/<string:asset_id>/status", methods=["PUT"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def update_asset_status(asset_id):
    data = request.get_json() or {}
    new_status = data.get("status")
    if not new_status:
        return jsonify({"error": {"code": "bad_request", "message": "Missing status"}}), 400

    asset = db_session.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        return jsonify({"error": {"code": "not_found", "message": "Asset not found"}}), 404

    # If decommissioning or repairing an assigned asset, close open assignment
    if new_status in ["under_repair", "decommissioned"]:
        active_assignment = db_session.query(AssetAssignment).filter(
            AssetAssignment.asset_id == asset_id,
            AssetAssignment.returned_date == None
        ).first()
        if active_assignment:
            active_assignment.returned_date = datetime.now().date()

    asset.status = new_status
    db_session.commit()
    log_activity("asset.status_updated", entity_type="Asset", entity_id=asset_id, extra_metadata={"status": new_status}, user_id=get_current_user().id)
    return jsonify({"message": f"Asset status updated to {new_status}"})

