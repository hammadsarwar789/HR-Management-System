from datetime import datetime
from decimal import Decimal
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.models.performance import PerformanceGoal, PerformanceReview
from app.core.security import get_current_user, role_required, log_activity

performance_bp = Blueprint("performance", __name__, url_prefix="/performance")

@performance_bp.route("/goals", methods=["GET"])
@jwt_required()
def list_goals():
    current_user = get_current_user()
    query = db_session.query(PerformanceGoal)

    if current_user.role and current_user.role.name == "Employee":
        query = query.filter(PerformanceGoal.employee_id == current_user.id)

    emp_id = request.args.get("employee_id")
    if emp_id:
        query = query.filter(PerformanceGoal.employee_id == emp_id)

    goals = query.all()
    res = []
    for g in goals:
        emp_name = f"{g.employee.first_name} {g.employee.last_name}" if g.employee else "Workforce Member"
        emp_code = g.employee.employee_code if g.employee else "EMP-000"
        emp_avatar = g.employee.profile_picture_url if g.employee else None
        res.append({
            "id": g.id,
            "employee_id": g.employee_id,
            "employee_name": emp_name,
            "employee_code": emp_code,
            "employee_avatar": emp_avatar,
            "cycle": g.cycle,
            "title": g.title,
            "description": g.description,
            "status": g.status or "in_progress"
        })
    return jsonify({"goals": res})

@performance_bp.route("/goals", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def create_goal():
    user = get_current_user()
    data = request.get_json() or {}
    default_emp_id = user.employee.id if user.employee else None
    
    # Bulk or single employee assignment support
    emp_ids = data.get("employee_ids") or ([data.get("employee_id")] if data.get("employee_id") else ([default_emp_id] if default_emp_id else []))
    emp_ids = [e for e in emp_ids if e]
    
    if not emp_ids:
        return jsonify({"error": {"code": "bad_request", "message": "At least one employee_id is required"}}), 400

    cycle = data.get("cycle", "2026-Q1")
    title = data.get("title")
    description = data.get("description", "")

    if not title:
        return jsonify({"error": {"code": "bad_request", "message": "Title required"}}), 400

    created_ids = []
    for emp_id in emp_ids:
        goal = PerformanceGoal(
            employee_id=emp_id,
            cycle=cycle,
            title=title,
            description=description,
            status="in_progress"
        )
        db_session.add(goal)
        db_session.flush()
        created_ids.append(goal.id)

    db_session.commit()
    log_activity("performance_goal.created", entity_type="PerformanceGoal", extra_metadata={"count": len(created_ids)}, user_id=user.id)
    return jsonify({"message": f"Goal assigned to {len(created_ids)} employee(s)", "ids": created_ids}), 201

@performance_bp.route("/reviews", methods=["GET"])
@jwt_required()
def list_reviews():
    current_user = get_current_user()
    query = db_session.query(PerformanceReview)

    if current_user.role and current_user.role.name == "Employee":
        query = query.filter(PerformanceReview.employee_id == current_user.id)

    reviews = query.all()
    res = []
    for r in reviews:
        emp_name = f"{r.employee.first_name} {r.employee.last_name}" if r.employee else "Workforce Member"
        emp_code = r.employee.employee_code if r.employee else "EMP-001"
        emp_avatar = r.employee.profile_picture_url if r.employee else None
        
        reviewer_name = "HR Manager / System Administrator"
        if r.reviewer:
            if r.reviewer.employee:
                reviewer_name = f"{r.reviewer.employee.first_name} {r.reviewer.employee.last_name}"
            elif r.reviewer.role:
                reviewer_name = r.reviewer.role.name

        res.append({
            "id": r.id,
            "employee_id": r.employee_id,
            "employee_name": emp_name,
            "employee_code": emp_code,
            "employee_avatar": emp_avatar,
            "reviewer_id": r.reviewer_id,
            "reviewer_name": reviewer_name,
            "cycle": r.cycle,
            "kpi_score": float(r.kpi_score) if r.kpi_score else 4.5,
            "feedback": r.feedback,
            "status": "COMPLETED",
            "created_at": r.created_at.isoformat()
        })
    return jsonify({"reviews": res})

@performance_bp.route("/reviews", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def create_review():
    user = get_current_user()
    data = request.get_json() or {}
    
    emp_ids = data.get("employee_ids") or ([data.get("employee_id")] if data.get("employee_id") else [])
    emp_ids = [e for e in emp_ids if e]

    if not emp_ids:
        return jsonify({"error": {"code": "bad_request", "message": "At least one employee_id is required"}}), 400

    cycle = data.get("cycle", "2026-Q1")
    kpi_score = data.get("kpi_score", 4.5)
    feedback = data.get("feedback", "Quarterly performance evaluation completed.")

    created_ids = []
    for emp_id in emp_ids:
        review = PerformanceReview(
            employee_id=emp_id,
            reviewer_id=user.id,
            cycle=cycle,
            kpi_score=Decimal(str(kpi_score)),
            feedback=feedback
        )
        db_session.add(review)
        db_session.flush()
        created_ids.append(review.id)

    db_session.commit()
    log_activity("performance_review.created", entity_type="PerformanceReview", extra_metadata={"count": len(created_ids)}, user_id=user.id)
    return jsonify({"message": f"Performance review initialized for {len(created_ids)} employee(s)", "ids": created_ids}), 201

