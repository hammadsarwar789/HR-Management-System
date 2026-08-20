import os
import uuid
import time
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import or_, and_
from app.db.session import db_session
from app.models.chat import Channel, ChannelMember, Message, Attachment, HRPolicyChunk
from app.models.auth import User
from app.models.employee import Employee
from app.services.s3_storage import S3StorageService
from app.services.rag_engine import HRChatbotEngine
from app.tasks.ai_tasks import process_bot_response_async

chat_bp = Blueprint("chat", __name__)

@chat_bp.route("/channels", methods=["GET"])
@jwt_required()
def get_channels():
    """Fetch user's channels (group channels & direct messages). Auto-joins public channels."""
    current_user_id = get_jwt_identity()

    # 1. Auto-join user to all public group channels
    public_channels = db_session.query(Channel).filter(
        Channel.is_private == False,
        Channel.is_direct_message == False
    ).all()

    for pc in public_channels:
        existing_m = db_session.query(ChannelMember).filter(
            ChannelMember.channel_id == pc.id,
            ChannelMember.user_id == current_user_id
        ).first()
        if not existing_m:
            db_session.add(ChannelMember(channel_id=pc.id, user_id=current_user_id, role="member"))
    db_session.commit()

    # 2. Fetch all channels where user is a member
    memberships = db_session.query(ChannelMember).filter(ChannelMember.user_id == current_user_id).all()
    channel_ids = [m.channel_id for m in memberships]

    channels = db_session.query(Channel).filter(Channel.id.in_(channel_ids)).all()
    
    res = []
    for ch in channels:
        display_name = ch.name
        recipient_user_id = None

        # Fetch channel members info
        ch_memberships = db_session.query(ChannelMember).filter(ChannelMember.channel_id == ch.id).all()
        members_data = []
        for cm in ch_memberships:
            u = db_session.query(User).filter(User.id == cm.user_id).first()
            if u:
                emp = db_session.query(Employee).filter(Employee.id == u.id).first()
                is_bot = (u.email == "hrbot@maxenius.com")
                full_name = "HR AI Chatbot 🤖" if is_bot else (f"{emp.first_name} {emp.last_name}" if emp else u.email.split("@")[0].title())
                members_data.append({
                    "user_id": u.id,
                    "email": u.email,
                    "full_name": full_name,
                    "job_title": "AI HR Assistant" if is_bot else (emp.designation if emp else "Employee"),
                    "department": "HR Systems" if is_bot else (emp.department.name if (emp and emp.department) else "General"),
                    "role": cm.role,
                    "is_bot": is_bot
                })

        if ch.is_direct_message:
            other_member_data = next((m for m in members_data if m["user_id"] != current_user_id), None)
            if other_member_data:
                display_name = other_member_data["full_name"]
                recipient_user_id = other_member_data["user_id"]
            else:
                display_name = "Direct Message"

        # Fetch last message
        last_msg = db_session.query(Message).filter(Message.channel_id == ch.id).order_by(Message.created_at.desc()).first()

        if not ch.invite_code:
            ch.invite_code = str(uuid.uuid4())[:8]
            db_session.commit()

        res.append({
            "id": ch.id,
            "name": display_name,
            "is_direct_message": ch.is_direct_message,
            "is_private": ch.is_private,
            "created_by": ch.created_by,
            "invite_code": ch.invite_code,
            "created_at": ch.created_at.isoformat() if ch.created_at else None,
            "recipient_user_id": recipient_user_id,
            "member_count": len(members_data),
            "members": members_data,
            "last_message": {
                "content": last_msg.content if last_msg else None,
                "sender_type": last_msg.sender_type if last_msg else None,
                "created_at": last_msg.created_at.isoformat() if (last_msg and last_msg.created_at) else None
            } if last_msg else None
        })

    return jsonify({"channels": res}), 200

@chat_bp.route("/channels", methods=["POST"])
@jwt_required()
def create_channel():
    """Create a new group channel or 1-on-1 Direct Message."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}

    name = data.get("name")
    is_direct_message = data.get("is_direct_message", False)
    is_private = data.get("is_private", False)
    recipient_id = data.get("recipient_id")  # User ID for DM

    if is_direct_message:
        if not recipient_id:
            return jsonify({"error": {"message": "recipient_id is required for direct messages"}}), 400

        # Check if DM channel already exists between these 2 users
        dm_channels = db_session.query(Channel).filter(Channel.is_direct_message == True).all()
        for ch in dm_channels:
            m_ids = [m.user_id for m in ch.members]
            if len(m_ids) == 2 and current_user_id in m_ids and recipient_id in m_ids:
                return jsonify({"channel_id": ch.id, "created": False}), 200

        # Create new DM channel
        new_channel = Channel(
            is_direct_message=True,
            is_private=True,
            created_by=current_user_id
        )
        db_session.add(new_channel)
        db_session.flush()

        # Add both members
        db_session.add(ChannelMember(channel_id=new_channel.id, user_id=current_user_id, role="admin"))
        db_session.add(ChannelMember(channel_id=new_channel.id, user_id=recipient_id, role="member"))
        db_session.commit()

        return jsonify({"channel_id": new_channel.id, "created": True}), 201

    # Group Channel Creation
    if not name:
        return jsonify({"error": {"message": "Channel name is required"}}), 400

    new_channel = Channel(
        name=name,
        is_direct_message=False,
        is_private=is_private,
        created_by=current_user_id
    )
    db_session.add(new_channel)
    db_session.flush()

    # Creator is Admin
    db_session.add(ChannelMember(channel_id=new_channel.id, user_id=current_user_id, role="admin"))

    # Optionally add invited member IDs
    member_ids = data.get("member_ids", [])
    for m_id in member_ids:
        if m_id != current_user_id:
            db_session.add(ChannelMember(channel_id=new_channel.id, user_id=m_id, role="member"))

    db_session.commit()

    return jsonify({"channel_id": new_channel.id, "created": True}), 201

@chat_bp.route("/channels/<channel_id>/members", methods=["GET"])
@jwt_required()
def get_channel_members(channel_id):
    """Fetch member details for a specific channel or direct message."""
    current_user_id = get_jwt_identity()

    channel = db_session.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        return jsonify({"error": {"message": "Channel not found"}}), 404

    ch_memberships = db_session.query(ChannelMember).filter(ChannelMember.channel_id == channel_id).all()
    res = []
    for cm in ch_memberships:
        u = db_session.query(User).filter(User.id == cm.user_id).first()
        if u:
            emp = db_session.query(Employee).filter(Employee.id == u.id).first()
            is_bot = (u.email == "hrbot@maxenius.com")
            full_name = "HR AI Chatbot 🤖" if is_bot else (f"{emp.first_name} {emp.last_name}" if emp else u.email.split("@")[0].title())
            res.append({
                "user_id": u.id,
                "email": u.email,
                "full_name": full_name,
                "job_title": "AI HR Assistant" if is_bot else (emp.designation if emp else "Employee"),
                "department": "HR Systems" if is_bot else (emp.department.name if (emp and emp.department) else "General"),
                "role": cm.role,
                "is_bot": is_bot
            })

    return jsonify({"members": res}), 200

@chat_bp.route("/channels/<channel_id>/messages", methods=["GET"])
@jwt_required()
def get_channel_messages(channel_id):
    """Fetch paginated message history for channel."""
    current_user_id = get_jwt_identity()

    channel = db_session.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        return jsonify({"error": {"message": "Channel not found"}}), 404

    # Verify channel membership (auto-join public channel)
    membership = db_session.query(ChannelMember).filter(
        ChannelMember.channel_id == channel_id,
        ChannelMember.user_id == current_user_id
    ).first()

    if not membership:
        if not channel.is_private and not channel.is_direct_message:
            membership = ChannelMember(channel_id=channel_id, user_id=current_user_id, role="member")
            db_session.add(membership)
            db_session.commit()
        else:
            return jsonify({"error": {"message": "Access denied to channel"}}), 403

    limit = request.args.get("limit", 100, type=int)

    messages = db_session.query(Message).filter(
        Message.channel_id == channel_id
    ).order_by(Message.created_at.asc()).limit(limit).all()

    res = []
    for msg in messages:
        sender_name = "System User"
        if msg.sender_type == "bot":
            sender_name = "HR AI Chatbot 🤖"
        elif msg.sender_id:
            emp = db_session.query(Employee).filter(Employee.id == msg.sender_id).first()
            if emp:
                sender_name = f"{emp.first_name} {emp.last_name}"
            else:
                usr = db_session.query(User).filter(User.id == msg.sender_id).first()
                if usr:
                    sender_name = usr.email.split("@")[0].title()

        att_list = []
        for att in msg.attachments:
            att_list.append({
                "id": att.id,
                "file_name": att.file_name,
                "file_size_bytes": att.file_size_bytes,
                "mime_type": att.mime_type,
                "download_url": f"/api/v1/chat/files/download/{att.id}"
            })

        res.append({
            "id": msg.id,
            "channel_id": msg.channel_id,
            "sender_id": msg.sender_id,
            "sender_type": msg.sender_type,
            "sender_name": sender_name,
            "content": msg.content,
            "is_edited": msg.is_edited,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
            "attachments": att_list
        })

    return jsonify({"messages": res}), 200

@chat_bp.route("/channels/<channel_id>/messages", methods=["POST"])
@jwt_required()
def post_channel_message(channel_id):
    """Send a message to a channel via REST API with Socket.IO broadcast."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}

    content = data.get("content", "").strip()
    attachment_ids = data.get("attachment_ids", [])

    if not content and not attachment_ids:
        return jsonify({"error": {"message": "Message content or attachment is required"}}), 400

    channel = db_session.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        return jsonify({"error": {"message": "Channel not found"}}), 404

    # Verify channel membership (auto-join if public channel)
    membership = db_session.query(ChannelMember).filter(
        ChannelMember.channel_id == channel_id,
        ChannelMember.user_id == current_user_id
    ).first()
    if not membership:
        if not channel.is_private and not channel.is_direct_message:
            membership = ChannelMember(channel_id=channel_id, user_id=current_user_id, role="member")
            db_session.add(membership)
            db_session.flush()
        else:
            return jsonify({"error": {"message": "Access denied to channel"}}), 403

    # Save message to DB
    new_msg = Message(
        channel_id=channel_id,
        sender_id=current_user_id,
        sender_type="user",
        content=content
    )
    db_session.add(new_msg)
    db_session.flush()

    attachments_data = []
    if attachment_ids:
        attachments = db_session.query(Attachment).filter(Attachment.id.in_(attachment_ids)).all()
        for att in attachments:
            att.message_id = new_msg.id
            attachments_data.append({
                "id": att.id,
                "file_name": att.file_name,
                "file_size_bytes": att.file_size_bytes,
                "mime_type": att.mime_type,
                "download_url": f"/api/v1/chat/files/download/{att.id}"
            })

    db_session.commit()

    # Sender Name
    emp = db_session.query(Employee).filter(Employee.id == current_user_id).first()
    if emp:
        sender_name = f"{emp.first_name} {emp.last_name}"
    else:
        usr = db_session.query(User).filter(User.id == current_user_id).first()
        sender_name = usr.email.split("@")[0].title() if usr else "User"

    msg_payload = {
        "id": new_msg.id,
        "channel_id": channel_id,
        "sender_id": current_user_id,
        "sender_type": "user",
        "sender_name": sender_name,
        "content": content,
        "created_at": new_msg.created_at.isoformat(),
        "attachments": attachments_data
    }

    # Broadcast message over Socket.IO
    from app.core.sockets import socketio
    socketio.emit("chat:message_received", msg_payload, room=f"channel_{channel_id}")

    # Parse @mentions and dispatch real-time notifications to tagged users
    try:
        ch_members = db_session.query(ChannelMember).filter(ChannelMember.channel_id == channel_id).all()
        for cm in ch_members:
            if cm.user_id == current_user_id:
                continue
            m_user = db_session.query(User).filter(User.id == cm.user_id).first()
            if not m_user:
                continue

            m_emp = db_session.query(Employee).filter(Employee.id == m_user.id).first()
            names_to_check = []
            if m_emp:
                names_to_check.append(f"{m_emp.first_name} {m_emp.last_name}".lower())
                names_to_check.append(m_emp.first_name.lower())
            names_to_check.append(m_user.email.split("@")[0].lower())

            content_lower = content.lower()
            is_tagged = any(f"@{name}" in content_lower for name in names_to_check) or "@channel" in content_lower or "@here" in content_lower or "@everyone" in content_lower

            if is_tagged:
                ch_title = channel.name or "Direct Message"
                notif_payload = {
                    "id": f"chat-mention-{msg.id}-{cm.user_id}",
                    "type": "chat_mention",
                    "title": f"💬 Mentioned in #{ch_title}",
                    "message": f"{sender_name} mentioned you: \"{content[:80]}\"",
                    "url": "/chat",
                    "timestamp": datetime.now(timezone.utc).strftime("%H:%M"),
                    "unread": True,
                    "badge_color": "teal"
                }
                socketio.emit("notification:new", notif_payload, room=f"user_{cm.user_id}")
    except Exception as e:
        print("Mention notification dispatch error:", e)

    # Check for @HRBot or Bot DM
    is_hr_bot_dm = False
    if channel.is_direct_message:
        hr_bot_user = db_session.query(User).filter(User.email == "hrbot@maxenius.com").first()
        if hr_bot_user:
            bot_member = db_session.query(ChannelMember).filter(
                ChannelMember.channel_id == channel_id,
                ChannelMember.user_id == hr_bot_user.id
            ).first()
            if bot_member:
                is_hr_bot_dm = True

    if is_hr_bot_dm or "@hrbot" in content.lower() or "@hr bot" in content.lower():
        bot_msg = Message(
            channel_id=channel_id,
            sender_id=None,
            sender_type="bot",
            content="Thinking..."
        )
        db_session.add(bot_msg)
        db_session.commit()

        socketio.emit(
            "chat:typing",
            {"channel_id": channel_id, "user_name": "HR AI Chatbot 🤖", "is_typing": True},
            room=f"channel_{channel_id}"
        )

        clean_query = content.replace("@HRBot", "").replace("@hrbot", "").strip() or "Help with HR Policies"
        process_bot_response_async(
            channel_id=channel_id,
            user_id=current_user_id,
            query_text=clean_query,
            bot_message_id=bot_msg.id
        )

    return jsonify({"message": msg_payload}), 201

@chat_bp.route("/files/presigned-url", methods=["POST"])
@jwt_required()
def request_presigned_upload_url():
    """Client requests pre-signed upload URL for document sharing."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}

    channel_id = data.get("channel_id")
    file_name = data.get("file_name")
    mime_type = data.get("mime_type")
    file_size_bytes = data.get("file_size_bytes")

    if not channel_id or not file_name or not mime_type or not file_size_bytes:
        return jsonify({"error": {"message": "Missing required file metadata"}}), 400

    # Verify channel membership
    membership = db_session.query(ChannelMember).filter(
        ChannelMember.channel_id == channel_id,
        ChannelMember.user_id == current_user_id
    ).first()
    if not membership:
        return jsonify({"error": {"message": "Access denied to channel"}}), 403

    try:
        url_data = S3StorageService.generate_presigned_upload_url(
            channel_id=channel_id,
            user_id=current_user_id,
            file_name=file_name,
            mime_type=mime_type,
            file_size_bytes=file_size_bytes
        )

        # Create pending attachment record in DB
        new_att = Attachment(
            file_name=file_name,
            file_size_bytes=file_size_bytes,
            mime_type=mime_type,
            storage_path=url_data["storage_path"],
            uploaded_by=current_user_id
        )
        db_session.add(new_att)
        db_session.commit()

        url_data["attachment_id"] = new_att.id
        return jsonify(url_data), 200
    except ValueError as ve:
        return jsonify({"error": {"message": str(ve)}}), 400

@chat_bp.route("/files/download/<attachment_id>", methods=["GET"])
@jwt_required()
def get_presigned_download_url(attachment_id):
    """Generate time-limited pre-signed download URL after verifying channel membership."""
    current_user_id = get_jwt_identity()

    attachment = db_session.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not attachment:
        return jsonify({"error": {"message": "Attachment not found"}}), 404

    # Verify user membership in attachment's channel
    if attachment.message_id:
        msg = db_session.query(Message).filter(Message.id == attachment.message_id).first()
        if msg:
            membership = db_session.query(ChannelMember).filter(
                ChannelMember.channel_id == msg.channel_id,
                ChannelMember.user_id == current_user_id
            ).first()
            if not membership:
                return jsonify({"error": {"message": "Access denied to file"}}), 403

    download_url = S3StorageService.generate_presigned_download_url(
        attachment_id=attachment.id,
        storage_path=attachment.storage_path,
        file_name=attachment.file_name,
        mime_type=attachment.mime_type
    )

    return jsonify({
        "download_url": download_url,
        "file_name": attachment.file_name,
        "mime_type": attachment.mime_type,
        "file_size_bytes": attachment.file_size_bytes
    }), 200

@chat_bp.route("/files/upload-vault/<token>", methods=["PUT", "POST"])
def local_vault_upload(token):
    """Local fallback endpoint handling pre-signed uploads when S3 is unconfigured."""
    payload = S3StorageService.verify_token(token)
    if not payload:
        return jsonify({"error": {"message": "Invalid or expired pre-signed upload token"}}), 403

    file_obj = request.files.get("file") or request.data
    storage_path = payload.get("storage_path")

    uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
    dest_path = os.path.abspath(os.path.join(uploads_dir, storage_path))
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

    if hasattr(file_obj, "save"):
        file_obj.save(dest_path)
    else:
        with open(dest_path, "wb") as f:
            f.write(file_obj)

    return jsonify({"status": "success", "storage_path": storage_path}), 200

@chat_bp.route("/files/download-vault/<token>", methods=["GET"])
def local_vault_download(token):
    """Local fallback endpoint handling pre-signed downloads."""
    payload = S3StorageService.verify_token(token)
    if not payload:
        return jsonify({"error": {"message": "Invalid or expired pre-signed download token"}}), 403

    storage_path = payload.get("storage_path")
    file_name = payload.get("file_name", "download")

    uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
    file_path = os.path.abspath(os.path.join(uploads_dir, storage_path))

    if not os.path.exists(file_path):
        # Create minimal placeholder file if missing
        with open(file_path, "wb") as f:
            f.write(b"Maxenius HRMS Encrypted Attachment File")

    return send_file(file_path, download_name=file_name, as_attachment=False)

@chat_bp.route("/users", methods=["GET"])
@jwt_required()
def get_chat_users():
    """Fetch list of users and employees for starting direct messages."""
    current_user_id = get_jwt_identity()

    users = db_session.query(User).filter(User.id != current_user_id, User.is_active == True).all()

    res = []
    for u in users:
        emp = db_session.query(Employee).filter(Employee.id == u.id).first()
        is_bot = (u.email == "hrbot@maxenius.com")

        res.append({
            "user_id": u.id,
            "email": u.email,
            "full_name": "HR AI Chatbot 🤖" if is_bot else (f"{emp.first_name} {emp.last_name}" if emp else u.email.split("@")[0].title()),
            "job_title": "AI HR Assistant" if is_bot else (emp.designation if emp else "Employee"),
            "department": "HR Systems" if is_bot else (emp.department.name if (emp and emp.department) else "General"),
            "is_bot": is_bot
        })

    return jsonify({"users": res}), 200

@chat_bp.route("/hr-policies/ingest", methods=["POST"])
@jwt_required()
def ingest_hr_policy():
    """Admin endpoint to ingest company policy document chunks into RAG vector store."""
    data = request.get_json() or {}
    title = data.get("title")
    category = data.get("category", "General HR Policy")
    content = data.get("content")

    if not title or not content:
        return jsonify({"error": {"message": "Title and content are required"}}), 400

    chunk = HRChatbotEngine.ingest_policy_chunk(title=title, category=category, content=content)

    return jsonify({
        "status": "success",
        "chunk_id": chunk.id,
        "title": chunk.title,
        "category": chunk.category
    }), 201

@chat_bp.route("/unread-count", methods=["GET"])
@jwt_required()
def get_unread_count():
    """Calculate exact unread message counts per channel and overall total for authenticated user."""
    current_user_id = get_jwt_identity()

    user_memberships = db_session.query(ChannelMember).filter(ChannelMember.user_id == current_user_id).all()

    by_channel = {}
    total_unread = 0

    for cm in user_memberships:
        last_read = cm.last_read_at or cm.joined_at
        query = db_session.query(Message).filter(
            Message.channel_id == cm.channel_id,
            Message.sender_id != current_user_id
        )
        if last_read:
            query = query.filter(Message.created_at > last_read)

        count = query.count()
        if count > 0:
            by_channel[cm.channel_id] = count
            total_unread += count

    return jsonify({
        "total_unread": total_unread,
        "by_channel": by_channel
    }), 200

@chat_bp.route("/mark-read", methods=["POST"])
@jwt_required()
def mark_channel_read():
    """Mark all messages in a specific channel or direct message as read for authenticated user."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    channel_id = data.get("channel_id")
    dm_user_id = data.get("dm_user_id")

    if not channel_id and dm_user_id:
        dm_channels = db_session.query(Channel).filter(Channel.is_direct_message == True).all()
        for ch in dm_channels:
            m_users = [m.user_id for m in ch.members]
            if current_user_id in m_users and dm_user_id in m_users:
                channel_id = ch.id
                break

    if not channel_id:
        return jsonify({"error": {"message": "channel_id or dm_user_id is required"}}), 400

    cm = db_session.query(ChannelMember).filter(
        ChannelMember.channel_id == channel_id,
        ChannelMember.user_id == current_user_id
    ).first()

    now = datetime.now(timezone.utc)
    if cm:
        cm.last_read_at = now
    else:
        cm = ChannelMember(channel_id=channel_id, user_id=current_user_id, role="member", last_read_at=now)
        db_session.add(cm)

    db_session.commit()

    return jsonify({
        "success": True,
        "channel_id": channel_id,
        "last_read_at": now.isoformat()
    }), 200

@chat_bp.route("/channels/<channel_id>/invite-link", methods=["GET"])
@jwt_required()
def get_channel_invite_link(channel_id):
    current_user_id = get_jwt_identity()
    ch = db_session.query(Channel).filter(Channel.id == channel_id).first()
    if not ch:
        return jsonify({"error": {"message": "Channel not found"}}), 404

    if not ch.invite_code:
        ch.invite_code = str(uuid.uuid4())[:8]
        db_session.commit()

    return jsonify({
        "invite_code": ch.invite_code,
        "invite_url": f"http://localhost:5173/chat?invite={ch.invite_code}"
    }), 200

@chat_bp.route("/channels/join-by-invite", methods=["POST"])
@jwt_required()
def join_channel_by_invite():
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    code = data.get("invite_code")

    if not code:
        return jsonify({"error": {"message": "Invite code required"}}), 400

    ch = db_session.query(Channel).filter(Channel.invite_code == code).first()
    if not ch:
        return jsonify({"error": {"message": "Invalid or expired invite link"}}), 404

    cm = db_session.query(ChannelMember).filter(
        ChannelMember.channel_id == ch.id,
        ChannelMember.user_id == current_user_id
    ).first()

    if not cm:
        cm = ChannelMember(channel_id=ch.id, user_id=current_user_id, role="member")
        db_session.add(cm)
        db_session.commit()

    return jsonify({
        "success": True,
        "channel_id": ch.id,
        "channel_name": ch.name
    }), 200
