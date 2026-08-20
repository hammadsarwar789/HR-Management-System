import json
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.core.security import get_current_user
from app.models.leave import LeaveRequest
from app.models.expense import ExpenseRequest
from app.models.holiday import Announcement, Holiday
from app.models.payroll import PayrollRun
from app.models.asset import AssetRequest
from app.models.employee import DocumentShare

notifications_bp = Blueprint("notifications", __name__, url_prefix="/notifications")

@notifications_bp.route("", methods=["GET"])
@jwt_required()
def get_notifications():
    user = get_current_user()
    if not user or not user.is_active:
        return jsonify({"error": {"code": "unauthorized", "message": "User inactive or unauthenticated"}}), 401

    role_name = user.role.name if user.role else "Employee"
    user_emp_id = user.employee.id if user.employee else None
    user_dept_id = user.employee.department_id if user.employee else None

    notifications = []

    # 1. Pending Leave Requests (For Approvers)
    if role_name in ("Super Admin", "HR Manager", "Department Manager"):
        leave_q = db_session.query(LeaveRequest).filter(LeaveRequest.status == "pending")
        if role_name == "Department Manager" and user_dept_id:
            leave_q = leave_q.join(LeaveRequest.employee).filter(LeaveRequest.employee.has(department_id=user_dept_id))
        
        pending_leaves = leave_q.all()
        for l in pending_leaves:
            emp_name = f"{l.employee.first_name} {l.employee.last_name}" if l.employee else "Employee"
            type_name = l.leave_type.name if l.leave_type else "Leave"
            notifications.append({
                "id": f"leave-{l.id}",
                "type": "leave_approval",
                "title": f"Leave Request Pending Approval",
                "message": f"{emp_name} requested {l.total_days} day(s) {type_name}.",
                "url": "/leave",
                "timestamp": l.created_at.isoformat() if hasattr(l, 'created_at') and l.created_at else "Today",
                "unread": True,
                "badge_color": "amber"
            })
    else:
        # For employee: show recent leave status updates
        if user_emp_id:
            emp_leaves = db_session.query(LeaveRequest).filter(LeaveRequest.employee_id == user_emp_id).order_by(LeaveRequest.id.desc()).limit(3).all()
            for l in emp_leaves:
                type_name = l.leave_type.name if l.leave_type else "Leave"
                notifications.append({
                    "id": f"leave-status-{l.id}",
                    "type": "leave_status",
                    "title": f"Leave Application Status: {l.status.upper()}",
                    "message": f"Your {l.total_days} day(s) {type_name} request is {l.status}.",
                    "url": "/leave",
                    "timestamp": "Recent",
                    "unread": l.status == "pending",
                    "badge_color": "teal" if l.status == "approved" else "rose" if l.status == "rejected" else "amber"
                })

    # 2. Pending Expenses (For HR / Admins)
    if role_name in ("Super Admin", "HR Manager"):
        pending_expenses = db_session.query(ExpenseRequest).filter(ExpenseRequest.status == "pending").all()
        for e in pending_expenses:
            emp_name = f"{e.employee.first_name} {e.employee.last_name}" if e.employee else "Employee"
            notifications.append({
                "id": f"expense-{e.id}",
                "type": "expense_approval",
                "title": "Expense Claim Awaiting Review",
                "message": f"{emp_name} submitted PKR {float(e.amount):,.2f} for {e.category}.",
                "url": "/expenses",
                "timestamp": e.created_at.isoformat() if hasattr(e, 'created_at') and e.created_at else "Today",
                "unread": True,
                "badge_color": "amber"
            })

    # 3. Pending Asset Requests (For HR / Admins)
    if role_name in ("Super Admin", "HR Manager"):
        pending_asset_reqs = db_session.query(AssetRequest).filter(AssetRequest.status == "PENDING").all()
        for ar in pending_asset_reqs:
            emp_name = f"{ar.employee.first_name} {ar.employee.last_name}" if ar.employee else "Employee"
            asset_tag = ar.asset.asset_tag if ar.asset else "Asset"
            model = ar.asset.model if ar.asset else ""
            notifications.append({
                "id": f"asset-request-{ar.id}",
                "type": "asset_approval",
                "title": "Hardware Asset Request Awaiting Review",
                "message": f"{emp_name} requested asset {asset_tag} ({model}).",
                "url": "/assets",
                "timestamp": ar.requested_at.strftime("%Y-%m-%d") if ar.requested_at else "Today",
                "unread": True,
                "badge_color": "amber"
            })

    # 3. Recent Company Announcements
    announcements = db_session.query(Announcement).order_by(Announcement.created_at.desc()).limit(3).all()
    for a in announcements:
        notifications.append({
            "id": f"announcement-{a.id}",
            "type": "announcement",
            "title": a.title,
            "message": a.body[:100] + ("..." if len(a.body) > 100 else ""),
            "url": "/notices",
            "timestamp": a.created_at.strftime("%Y-%m-%d") if hasattr(a, 'created_at') and a.created_at else "Recent",
            "unread": False,
            "badge_color": "teal"
        })

    # 4. Upcoming Holidays
    holidays = db_session.query(Holiday).order_by(Holiday.date.asc()).limit(2).all()
    for h in holidays:
        notifications.append({
            "id": f"holiday-{h.id}",
            "type": "holiday",
            "title": f"Upcoming Holiday: {h.name}",
            "message": f"Scheduled for {h.date.strftime('%B %d, %Y')}.",
            "url": "/notices",
            "timestamp": h.date.strftime("%Y-%m-%d"),
            "unread": False,
            "badge_color": "sky"
        })

    # 5. Shared Documents Notifications
    shared_docs = db_session.query(DocumentShare).filter(
        (DocumentShare.recipient_id == user.id) |
        (DocumentShare.target_role == role_name) |
        (DocumentShare.target_role == "ALL") |
        ((DocumentShare.target_department_id != None) & (DocumentShare.target_department_id == user_dept_id))
    ).order_by(DocumentShare.shared_at.desc()).limit(10).all()

    for s in shared_docs:
        if not s.document:
            continue
        uploader_name = "Team Colleague"
        if s.uploader:
            if s.uploader.employee:
                uploader_name = f"{s.uploader.employee.first_name} {s.uploader.employee.last_name}"
            else:
                uploader_name = s.uploader.email

        doc_title = s.document.doc_type or "Document"
        raw_key = s.document.storage_key or ""
        if raw_key.startswith("{") and ("title" in raw_key or "document_title" in raw_key):
            try:
                p = json.loads(raw_key)
                doc_title = p.get("title") or p.get("document_title") or p.get("document_name") or doc_title
            except Exception:
                pass

        is_unread = (s.viewed_at is None)
        notifications.append({
            "id": f"doc-share-{s.id}",
            "type": "document_share",
            "title": "📄 New Document Shared",
            "message": f"{uploader_name} shared a document with you: '{doc_title}'",
            "url": "/documents",
            "timestamp": s.shared_at.strftime("%Y-%m-%d %H:%M") if s.shared_at else "Recent",
            "unread": is_unread,
            "badge_color": "amber" if is_unread else "teal"
        })

    # 6. Unread Chat & Direct Messages
    from app.models.chat import ChannelMember, Message, Channel
    from app.models.employee import Employee
    user_memberships = db_session.query(ChannelMember).filter(ChannelMember.user_id == user.id).all()
    ch_ids = [m.channel_id for m in user_memberships]
    if ch_ids:
        recent_chat_msgs = db_session.query(Message).filter(
            Message.channel_id.in_(ch_ids),
            Message.sender_id != user.id
        ).order_by(Message.created_at.desc()).limit(5).all()

        for msg in recent_chat_msgs:
            sender_name = "Team Member"
            if msg.sender_type == "bot":
                sender_name = "HR AI Chatbot 🤖"
            elif msg.sender_id:
                sender_emp = db_session.query(Employee).filter(Employee.id == msg.sender_id).first()
                if sender_emp:
                    sender_name = f"{sender_emp.first_name} {sender_emp.last_name}"
            
            ch = db_session.query(Channel).filter(Channel.id == msg.channel_id).first()
            ch_label = f"#{ch.name}" if (ch and ch.name) else ("Direct Message" if (ch and ch.is_direct_message) else "Chat")

            notifications.append({
                "id": f"chat-msg-{msg.id}",
                "type": "chat_message",
                "title": f"💬 New Message in {ch_label}",
                "message": f"{sender_name}: {msg.content[:80]}" if msg.content else f"{sender_name} sent an attachment",
                "url": "/chat",
                "timestamp": msg.created_at.strftime("%H:%M") if (hasattr(msg, 'created_at') and msg.created_at) else "Recent",
                "unread": True,
                "badge_color": "teal"
            })

    # 7. Filter out notifications that the user has already read or dismissed
    from app.models.auth import UserReadNotification
    read_records = db_session.query(UserReadNotification.notification_id).filter(UserReadNotification.user_id == user.id).all()
    read_ids = set(r[0] for r in read_records)

    unread_notifications = [n for n in notifications if n["id"] not in read_ids]
    unread_count = len(unread_notifications)

    return jsonify({
        "notifications": unread_notifications,
        "unread_count": unread_count
    })

@notifications_bp.route("/unread-count", methods=["GET"])
@jwt_required()
def get_notifications_unread_count():
    """Lightweight endpoint performing fast count for unread notifications."""
    user = get_current_user()
    if not user or not user.is_active:
        return jsonify({"unread_count": 0}), 200

    from app.models.auth import UserReadNotification
    from app.models.employee import DocumentShare

    unviewed_shares = db_session.query(DocumentShare.id).filter(
        DocumentShare.recipient_id == user.id,
        DocumentShare.viewed_at == None
    ).count()

    return jsonify({"unread_count": unviewed_shares}), 200

@notifications_bp.route("/mark-read", methods=["POST"])
@notifications_bp.route("/mark-all-read", methods=["POST"])
@jwt_required()
def mark_notifications_read():
    user = get_current_user()
    if not user:
        return jsonify({"error": {"message": "User unauthenticated"}}), 401

    from app.models.auth import UserReadNotification
    from datetime import datetime, timezone

    # Fetch current notification items and save their IDs as read
    current_res = get_notifications().get_json()
    items = current_res.get("notifications", [])

    for n in items:
        nid = n["id"]
        existing = db_session.query(UserReadNotification).filter(
            UserReadNotification.user_id == user.id,
            UserReadNotification.notification_id == nid
        ).first()
        if not existing:
            db_session.add(UserReadNotification(user_id=user.id, notification_id=nid))

    # Mark document shares as viewed
    db_session.query(DocumentShare).filter(
        DocumentShare.recipient_id == user.id
    ).update({"viewed_at": datetime.now(timezone.utc)}, synchronize_session=False)

    db_session.commit()

    return jsonify({"success": True, "message": "All notifications marked as read", "unread_count": 0})

@notifications_bp.route("/<notif_id>/read", methods=["PATCH", "POST"])
@jwt_required()
def mark_single_notification_read(notif_id):
    from datetime import datetime, timezone
    from app.models.auth import UserReadNotification

    user = get_current_user()
    if not user:
        return jsonify({"error": {"message": "User unauthenticated"}}), 401

    existing = db_session.query(UserReadNotification).filter(
        UserReadNotification.user_id == user.id,
        UserReadNotification.notification_id == notif_id
    ).first()
    if not existing:
        db_session.add(UserReadNotification(user_id=user.id, notification_id=notif_id))

    if notif_id.startswith("doc-share-"):
        share_id = notif_id.replace("doc-share-", "")
        s = db_session.query(DocumentShare).filter(DocumentShare.id == share_id).first()
        if s:
            s.viewed_at = datetime.now(timezone.utc)

    db_session.commit()

    return jsonify({"success": True, "message": "Notification marked as read", "id": notif_id}), 200

@notifications_bp.route("/<notif_id>", methods=["DELETE"])
@jwt_required()
def delete_single_notification(notif_id):
    from datetime import datetime, timezone
    from app.models.auth import UserReadNotification

    user = get_current_user()
    if not user:
        return jsonify({"error": {"message": "User unauthenticated"}}), 401

    existing = db_session.query(UserReadNotification).filter(
        UserReadNotification.user_id == user.id,
        UserReadNotification.notification_id == notif_id
    ).first()
    if not existing:
        db_session.add(UserReadNotification(user_id=user.id, notification_id=notif_id))

    if notif_id.startswith("doc-share-"):
        share_id = notif_id.replace("doc-share-", "")
        s = db_session.query(DocumentShare).filter(DocumentShare.id == share_id).first()
        if s:
            s.status = "DISMISSED"
            s.viewed_at = datetime.now(timezone.utc)

    db_session.commit()

    return jsonify({"success": True, "message": "Notification dismissed", "id": notif_id}), 200
