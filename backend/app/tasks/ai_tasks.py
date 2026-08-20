import time
import logging
from concurrent.futures import ThreadPoolExecutor
from app.services.rag_engine import HRChatbotEngine
from app.db.session import db_session
from app.models.chat import Message

logger = logging.getLogger(__name__)

# Dedicated thread pool for async AI workloads
ai_executor = ThreadPoolExecutor(max_workers=4)

def process_bot_response_async(channel_id: str, user_id: str, query_text: str, bot_message_id: str):
    """
    Executes RAG pipeline asynchronously and streams response back over WebSockets.
    """
    def task():
        try:
            # Short delay simulating streaming AI response
            time.sleep(0.5)

            # Process RAG query
            result = HRChatbotEngine.process_hr_query(user_id=user_id, query=query_text)
            final_answer = result["answer"]

            # Update Bot Message in Database
            msg = db_session.query(Message).filter(Message.id == bot_message_id).first()
            if msg:
                msg.content = final_answer
                db_session.commit()

            # Broadcast completed bot response via SocketIO
            from app.core.sockets import socketio
            socketio.emit(
                "chat:message_received",
                {
                    "id": bot_message_id,
                    "channel_id": channel_id,
                    "sender_id": None,
                    "sender_type": "bot",
                    "sender_name": "HR AI Chatbot 🤖",
                    "content": final_answer,
                    "created_at": msg.created_at.isoformat() if msg and msg.created_at else None,
                    "attachments": []
                },
                room=f"channel_{channel_id}"
            )
            
            # Emit typing stop
            socketio.emit(
                "chat:typing",
                {"channel_id": channel_id, "user_name": "HR AI Chatbot", "is_typing": False},
                room=f"channel_{channel_id}"
            )

        except Exception as e:
            logger.error(f"Error in async HR Bot task: {e}")
            from app.core.sockets import socketio
            socketio.emit(
                "chat:message_received",
                {
                    "id": bot_message_id,
                    "channel_id": channel_id,
                    "sender_id": None,
                    "sender_type": "bot",
                    "sender_name": "HR AI Chatbot 🤖",
                    "content": "Sorry, I encountered an issue processing your HR request. Please try again or contact HR support.",
                    "attachments": []
                },
                room=f"channel_{channel_id}"
            )
        finally:
            db_session.remove()

    ai_executor.submit(task)
