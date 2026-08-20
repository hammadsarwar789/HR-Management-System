import os
import uuid
import json
import re
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from werkzeug.utils import secure_filename
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.models.employee import Employee, EmployeeDocument, DocumentShare, Department
from app.models.auth import User, Role
from app.core.security import get_current_user

documents_bp = Blueprint("documents", __name__, url_prefix="/documents")

@documents_bp.route("/share", methods=["POST"])
@jwt_required()
def share_document():
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"code": "unauthorized", "message": "User session invalid"}}), 401

    uploader_emp = current_user.employee
    uploader_id = current_user.id

    uploaded_file = request.files.get("file") or request.files.get("document")
    doc_id = request.form.get("document_id") or (request.json.get("document_id") if request.is_json else None)
    recipient_id = request.form.get("recipient_id") or (request.json.get("recipient_id") if request.is_json else None)
    target_role = request.form.get("target_role") or (request.json.get("target_role") if request.is_json else None)
    target_department_id = request.form.get("target_department_id") or (request.json.get("target_department_id") if request.is_json else None)
    permission = request.form.get("permission") or (request.json.get("permission") if request.is_json else "VIEW")
    title = request.form.get("title") or request.form.get("document_title") or (request.json.get("title") if request.is_json else None)
    category = request.form.get("category") or (request.json.get("category") if request.is_json else "general")
    note = request.form.get("note") or (request.json.get("note") if request.is_json else None)

    doc = None
    if doc_id:
        doc = db_session.query(EmployeeDocument).filter(EmployeeDocument.id == doc_id).first()
        if not doc:
            return jsonify({"error": {"code": "not_found", "message": "Target document not found"}}), 404
    elif uploaded_file and uploaded_file.filename:
        filename = secure_filename(uploaded_file.filename)
        ext = filename.rsplit(".", 1)[1].lower() if "." in filename else "pdf"
        unique_name = f"doc_{uploader_id[:8]}_{uuid.uuid4().hex[:8]}.{ext}"
        
        upload_folder = os.path.abspath(os.path.join(current_app.root_path, "uploads", "documents"))
        os.makedirs(upload_folder, exist_ok=True)
        file_path = os.path.join(upload_folder, unique_name)
        uploaded_file.save(file_path)

        file_url = f"/uploads/documents/{unique_name}"
        if not title:
            title = filename.rsplit(".", 1)[0].replace("_", " ").title()

        storage_payload = json.dumps({
            "title": title,
            "document_title": title,
            "document_name": title,
            "name": title,
            "original_filename": filename,
            "file_url": file_url
        })

        emp_id = uploader_emp.id if uploader_emp else uploader_id
        doc = EmployeeDocument(
            employee_id=emp_id,
            doc_type=category,
            storage_key=storage_payload,
            uploaded_by=uploader_id
        )
        db_session.add(doc)
        db_session.commit()
    else:
        return jsonify({"error": {"code": "bad_request", "message": "Please attach a document file or specify document_id"}}), 400

    share = DocumentShare(
        document_id=doc.id,
        uploader_id=uploader_id,
        recipient_id=recipient_id if recipient_id and recipient_id != "all" else None,
        target_role=target_role if target_role != "NONE" else None,
        target_department_id=int(target_department_id) if target_department_id and str(target_department_id) != "0" else None,
        permission=permission.upper(),
        status="SHARED",
        note=note
    )
    db_session.add(share)
    db_session.commit()

    # Real-time WebSocket Notification
    try:
        uploader_name = f"{uploader_emp.first_name} {uploader_emp.last_name}" if uploader_emp else current_user.email
        doc_title = title or doc.doc_type or "Document"
        notif_payload = {
            "id": f"doc-share-{share.id}",
            "type": "document_share",
            "title": "📄 New Document Shared",
            "message": f"{uploader_name} shared a document: '{doc_title}'",
            "url": "/documents",
            "badge_color": "amber",
            "unread": True
        }
        from app.core.sockets import send_user_notification, send_role_notification, send_dept_notification, broadcast_notification
        if share.recipient_id:
            send_user_notification(share.recipient_id, notif_payload)
        elif share.target_role and share.target_role != "ALL":
            send_role_notification(share.target_role, notif_payload)
        elif share.target_department_id:
            send_dept_notification(share.target_department_id, notif_payload)
        else:
            broadcast_notification(notif_payload)
    except Exception as socket_err:
        current_app.logger.warning(f"Socket emit notice: {socket_err}")

    return jsonify({
        "message": "Document shared successfully",
        "share": {
            "id": share.id,
            "document_id": doc.id,
            "shared_at": share.shared_at.strftime("%Y-%m-%d %H:%M"),
            "permission": share.permission,
            "note": share.note
        }
    }), 201



@documents_bp.route("/shared-with-me", methods=["GET"])
@jwt_required()
def get_shared_with_me():
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"code": "unauthorized", "message": "User session invalid"}}), 401

    user_role_name = current_user.role.name if current_user.role else ""
    user_dept_id = current_user.employee.department_id if current_user.employee else None

    shares = db_session.query(DocumentShare).filter(
        (DocumentShare.recipient_id == current_user.id) |
        (DocumentShare.target_role == user_role_name) |
        (DocumentShare.target_role == "ALL") |
        ((DocumentShare.target_department_id != None) & (DocumentShare.target_department_id == user_dept_id))
    ).order_by(DocumentShare.shared_at.desc()).all()

    result = []
    for s in shares:
        doc = s.document
        if not doc:
            continue
        raw_key = doc.storage_key or "Document"
        title = "Shared Document"
        file_url = ""

        if raw_key.startswith("{") and ("file_url" in raw_key or "title" in raw_key):
            try:
                payload = json.loads(raw_key)
                title = payload.get("title") or payload.get("document_title") or payload.get("document_name") or "Shared Document"
                file_url = payload.get("file_url") or ""
            except Exception:
                title = raw_key
        elif raw_key.startswith("/uploads/") or raw_key.startswith("http"):
            file_url = raw_key
            title = (doc.doc_type or "SHARED").replace("_", " ").title() + " Document"

        uploader_name = "System / HR"
        if s.uploader:
            if s.uploader.employee:
                uploader_name = f"{s.uploader.employee.first_name} {s.uploader.employee.last_name}"
            else:
                uploader_name = s.uploader.email

        result.append({
            "share_id": s.id,
            "document_id": doc.id,
            "title": title,
            "document_title": title,
            "category": (doc.doc_type or "GENERAL").upper(),
            "file_url": file_url,
            "permission": s.permission,
            "status": s.status,
            "note": s.note,
            "uploader_name": uploader_name,
            "shared_at": s.shared_at.strftime("%Y-%m-%d %H:%M") if s.shared_at else "",
            "viewed_at": s.viewed_at.strftime("%Y-%m-%d %H:%M") if s.viewed_at else None
        })

    return jsonify({"shared_documents": result})


@documents_bp.route("/sent-by-me", methods=["GET"])
@jwt_required()
def get_sent_by_me():
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"code": "unauthorized", "message": "User session invalid"}}), 401

    shares = db_session.query(DocumentShare).filter(
        DocumentShare.uploader_id == current_user.id
    ).order_by(DocumentShare.shared_at.desc()).all()

    result = []
    for s in shares:
        doc = s.document
        if not doc:
            continue
        raw_key = doc.storage_key or "Document"
        title = "Shared Document"
        file_url = ""

        if raw_key.startswith("{") and ("file_url" in raw_key or "title" in raw_key):
            try:
                payload = json.loads(raw_key)
                title = payload.get("title") or payload.get("document_title") or payload.get("document_name") or "Shared Document"
                file_url = payload.get("file_url") or ""
            except Exception:
                title = raw_key
        elif raw_key.startswith("/uploads/") or raw_key.startswith("http"):
            file_url = raw_key
            title = (doc.doc_type or "SHARED").replace("_", " ").title() + " Document"

        recipient_name = "Everyone (Broadcast)"
        if s.recipient:
            if s.recipient.employee:
                recipient_name = f"{s.recipient.employee.first_name} {s.recipient.employee.last_name}"
            else:
                recipient_name = s.recipient.email
        elif s.target_role:
            recipient_name = f"Role: {s.target_role}"
        elif s.target_department:
            recipient_name = f"Department: {s.target_department.name}"

        result.append({
            "share_id": s.id,
            "document_id": doc.id,
            "title": title,
            "document_title": title,
            "category": (doc.doc_type or "GENERAL").upper(),
            "file_url": file_url,
            "permission": s.permission,
            "status": s.status,
            "note": s.note,
            "recipient_name": recipient_name,
            "shared_at": s.shared_at.strftime("%Y-%m-%d %H:%M") if s.shared_at else "",
            "viewed_at": s.viewed_at.strftime("%Y-%m-%d %H:%M") if s.viewed_at else None
        })

    return jsonify({"sent_documents": result})


@documents_bp.route("/<string:doc_id>/download", methods=["GET"])
@jwt_required(optional=True)
def download_document(doc_id):
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"code": "unauthorized", "message": "User session invalid"}}), 401

    doc = db_session.query(EmployeeDocument).filter(EmployeeDocument.id == doc_id).first()
    if not doc:
        return jsonify({"error": {"code": "not_found", "message": "Document not found"}}), 404

    user_role_name = current_user.role.name if current_user.role else ""
    user_dept_id = current_user.employee.department_id if current_user.employee else None
    is_owner = (doc.uploaded_by == current_user.id or (current_user.employee and doc.employee_id == current_user.employee.id))
    is_admin = (user_role_name in ["Super Admin", "HR Manager"])

    share_record = db_session.query(DocumentShare).filter(
        (DocumentShare.document_id == doc_id) &
        (
            (DocumentShare.recipient_id == current_user.id) |
            (DocumentShare.target_role == user_role_name) |
            (DocumentShare.target_role == "ALL") |
            ((DocumentShare.target_department_id != None) & (DocumentShare.target_department_id == user_dept_id))
        )
    ).first()

    if not is_owner and not is_admin and not share_record:
        return jsonify({"error": {"code": "forbidden", "message": "Access denied. You do not have permission to view or download this document."}}), 403

    if share_record and not share_record.viewed_at:
        share_record.viewed_at = datetime.utcnow()
        share_record.status = "ACKNOWLEDGED"
        db_session.commit()

    raw_key = doc.storage_key or ""
    file_url = ""
    if raw_key.startswith("{") and "file_url" in raw_key:
        try:
            file_url = json.loads(raw_key).get("file_url", "")
        except Exception:
            pass
    elif raw_key.startswith("/uploads/"):
        file_url = raw_key

    if not file_url:
        return jsonify({"error": {"code": "not_found", "message": "Document storage path missing"}}), 404

    filename = file_url.replace("/uploads/", "")
    uploads_dir = os.path.abspath(os.path.join(current_app.root_path, "uploads"))
    return send_from_directory(uploads_dir, filename)


@documents_bp.route("/shares/<string:share_id>", methods=["DELETE"])
@jwt_required()
def revoke_share(share_id):
    current_user = get_current_user()
    share = db_session.query(DocumentShare).filter(DocumentShare.id == share_id).first()
    if not share:
        return jsonify({"error": {"code": "not_found", "message": "Share record not found"}}), 404

    if share.uploader_id != current_user.id and (not current_user.role or current_user.role.name != "Super Admin"):
        return jsonify({"error": {"code": "forbidden", "message": "Only the uploader can revoke sharing"}}), 403

    share.status = "REVOKED"
    db_session.delete(share)
    db_session.commit()

    return jsonify({"message": "Document share revoked successfully"})


@documents_bp.route("/shares/<string:share_id>/view", methods=["POST", "PATCH"])
@jwt_required(optional=True)
def mark_share_viewed(share_id):
    current_user = get_current_user()
    share = db_session.query(DocumentShare).filter(DocumentShare.id == share_id).first()
    if not share:
        return jsonify({"error": {"code": "not_found", "message": "Share record not found"}}), 404

    share.viewed_at = datetime.utcnow()
    share.status = "ACKNOWLEDGED"
    db_session.commit()

    return jsonify({
        "message": "Document share acknowledged",
        "share_id": share.id,
        "status": "ACKNOWLEDGED",
        "viewed_at": share.viewed_at.strftime("%Y-%m-%d %H:%M")
    })
