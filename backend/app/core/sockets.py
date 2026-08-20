import logging
from datetime import datetime, timezone
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask import request
from app.db.session import db_session
from app.models.chat import Channel, ChannelMember, Message, Attachment
from app.models.auth import User
from app.models.employee import Employee
from app.tasks.ai_tasks import process_bot_response_async

logger = logging.getLogger(__name__)

# Track online user presence in memory (complemented by Redis in clustered envs)
online_users = {}

# Initialize SocketIO instance with threading support for WSGI development
socketio = SocketIO(cors_allowed_origins="*", async_mode="threading")

@socketio.on("connect")
def handle_connect():
    logger.info(f"Client connected to WebSocket: {request.sid}")

@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    if sid in online_users:
        user_info = online_users.pop(sid)
        user_id = user_info.get("user_id")
        # Check if user has no remaining open connections
        user_still_online = any(u.get("user_id") == user_id for u in online_users.values())
        if not user_still_online and user_id:
            socketio.emit("chat:presence_changed", {"user_id": user_id, "status": "offline"})
    logger.info(f"Client disconnected from WebSocket: {sid}")

@socketio.on("join")
def handle_join(data):
    if not isinstance(data, dict):
        return

    user_id = data.get("user_id")
    role = data.get("role")
    dept_id = data.get("department_id")

    if user_id:
        user_room = f"user_{user_id}"
        join_room(user_room)
        online_users[request.sid] = {"user_id": user_id, "joined_at": datetime.now(timezone.utc).isoformat()}
        socketio.emit("chat:presence_changed", {"user_id": user_id, "status": "online"})

    if role:
        join_room(f"role_{role}")
    if dept_id:
        join_room(f"dept_{dept_id}")

    emit("joined", {"status": "success", "rooms": [user_id, role, dept_id]})

@socketio.on("chat:join_channel")
def handle_join_channel(data):
    """Client joins a specific chat channel room."""
    if not isinstance(data, dict):
        return
    channel_id = data.get("channel_id")
    if channel_id:
        room_name = f"channel_{channel_id}"
        join_room(room_name)
        emit("chat:channel_joined", {"channel_id": channel_id, "room": room_name})

@socketio.on("chat:leave_channel")
def handle_leave_channel(data):
    """Client leaves a specific chat channel room."""
    if not isinstance(data, dict):
        return
    channel_id = data.get("channel_id")
    if channel_id:
        room_name = f"channel_{channel_id}"
        leave_room(room_name)

@socketio.on("chat:typing")
def handle_typing(data):
    """Broadcast typing indicator to channel members."""
    if not isinstance(data, dict):
        return
    channel_id = data.get("channel_id")
    user_name = data.get("user_name", "Someone")
    is_typing = data.get("is_typing", False)
    if channel_id:
        emit(
            "chat:typing",
            {"channel_id": channel_id, "user_name": user_name, "is_typing": is_typing},
            room=f"channel_{channel_id}",
            include_self=False
        )

@socketio.on("chat:send_message")
def handle_send_message(data):
    """
    Handle real-time message submission from client:
    {
      "channel_id": "uuid",
      "sender_id": "uuid",
      "content": "Hello team!",
      "attachment_ids": ["uuid"]
    }
    """
    if not isinstance(data, dict):
        return

    channel_id = data.get("channel_id")
    sender_id = data.get("sender_id")
    content = data.get("content", "").strip()
    attachment_ids = data.get("attachment_ids", [])

    if not channel_id or (not content and not attachment_ids):
        emit("chat:error", {"message": "Invalid message payload"})
        return

    try:
        # Save message to database
        new_msg = Message(
            channel_id=channel_id,
            sender_id=sender_id,
            sender_type="user",
            content=content
        )
        db_session.add(new_msg)
        db_session.flush()

        # Associate attachments if provided
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
                    "storage_path": att.storage_path,
                    "download_url": f"/api/v1/chat/files/download/{att.id}"
                })

        db_session.commit()

        # Fetch sender info
        sender_name = "System User"
        if sender_id:
            emp = db_session.query(Employee).filter(Employee.id == sender_id).first()
            if emp:
                sender_name = f"{emp.first_name} {emp.last_name}"
            else:
                user = db_session.query(User).filter(User.id == sender_id).first()
                if user:
                    sender_name = user.email.split("@")[0].title()

        msg_payload = {
            "id": new_msg.id,
            "channel_id": channel_id,
            "sender_id": sender_id,
            "sender_type": "user",
            "sender_name": sender_name,
            "content": content,
            "created_at": new_msg.created_at.isoformat(),
            "attachments": attachments_data
        }

        # Broadcast message to channel subscribers
        socketio.emit("chat:message_received", msg_payload, room=f"channel_{channel_id}")

        # Check if channel is a DM with HRBot or contains @HRBot mention
        channel = db_session.query(Channel).filter(Channel.id == channel_id).first()
        is_hr_bot_dm = False
        if channel and channel.is_direct_message:
            hr_bot_user = db_session.query(User).filter(User.email == "hrbot@maxenius.com").first()
            if hr_bot_user:
                bot_member = db_session.query(ChannelMember).filter(
                    ChannelMember.channel_id == channel_id,
                    ChannelMember.user_id == hr_bot_user.id
                ).first()
                if bot_member:
                    is_hr_bot_dm = True

        if is_hr_bot_dm or "@hrbot" in content.lower() or "@hr bot" in content.lower():
            # Create placeholder Bot message in DB
            bot_msg = Message(
                channel_id=channel_id,
                sender_id=None,
                sender_type="bot",
                content="Thinking..."
            )
            db_session.add(bot_msg)
            db_session.commit()

            # Emit typing indicator for HRBot
            socketio.emit(
                "chat:typing",
                {"channel_id": channel_id, "user_name": "HR AI Chatbot 🤖", "is_typing": True},
                room=f"channel_{channel_id}"
            )

            # Trigger background RAG query execution
            clean_query = content.replace("@HRBot", "").replace("@hrbot", "").strip() or "Help with HR Policies"
            process_bot_response_async(
                channel_id=channel_id,
                user_id=sender_id,
                query_text=clean_query,
                bot_message_id=bot_msg.id
            )

    except Exception as e:
        db_session.rollback()
        logger.error(f"Error sending chat message: {e}")
        emit("chat:error", {"message": str(e)})

def send_user_notification(user_id, notification_data):
    socketio.emit("notification:new", notification_data, room=f"user_{user_id}")

def send_role_notification(role_name, notification_data):
    socketio.emit("notification:new", notification_data, room=f"role_{role_name}")

def send_dept_notification(dept_id, notification_data):
    socketio.emit("notification:new", notification_data, room=f"dept_{dept_id}")

def broadcast_notification(notification_data):
    socketio.emit("notification:new", notification_data)
