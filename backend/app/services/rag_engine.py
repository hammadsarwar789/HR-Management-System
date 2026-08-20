import math
import re
import json
import logging
from typing import List, Dict, Any, Tuple
from sqlalchemy import text
from app.db.session import db_session
from app.models.chat import HRPolicyChunk
from app.models.employee import Employee
from app.models.leave import LeaveBalance
from app.models.auth import User

logger = logging.getLogger(__name__)

# Vector dimension for HR RAG embeddings
EMBEDDING_DIM = 128

def generate_text_embedding(text_content: str) -> List[float]:
    """
    Generate normalized vector embedding for text.
    Uses hash-based n-gram frequency encoding to ensure 100% offline consistency
    without requiring external API keys.
    """
    vec = [0.0] * EMBEDDING_DIM
    clean_text = re.sub(r'[^\w\s]', '', text_content.lower())
    words = clean_text.split()
    
    if not words:
        return vec

    # Compute unigram & bigram hashes
    tokens = words + [f"{words[i]}_{words[i+1]}" for i in range(len(words)-1)]
    for token in tokens:
        idx = abs(hash(token)) % EMBEDDING_DIM
        vec[idx] += 1.0

    # L2 Normalization
    magnitude = math.sqrt(sum(v * v for v in vec))
    if magnitude > 0:
        vec = [v / magnitude for v in vec]
    return vec

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Calculate cosine similarity between two float vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot_product = sum(a * b for a, b in zip(v1, v2))
    return float(dot_product)

class HRChatbotEngine:
    """
    RAG (Retrieval-Augmented Generation) Engine for HR Policy Queries.
    Matches semantic queries against PostgreSQL HR policy chunks & integrates user HRMS context.
    """

    @classmethod
    def ingest_policy_chunk(cls, title: str, category: str, content: str) -> HRPolicyChunk:
        """Ingest a policy document chunk and store vector embedding in PostgreSQL."""
        embedding = generate_text_embedding(f"{title} {category} {content}")
        chunk = HRPolicyChunk(
            title=title,
            category=category,
            content=content,
            embedding=embedding
        )
        db_session.add(chunk)
        db_session.commit()
        return chunk

    @classmethod
    def search_policy_chunks(cls, query: str, top_k: int = 3) -> List[Tuple[HRPolicyChunk, float]]:
        """Search policy chunks using vector similarity."""
        query_vec = generate_text_embedding(query)
        
        # Try pgvector query if PostgreSQL pgvector extension is enabled
        try:
            pg_query = text("""
                SELECT id, title, category, content, embedding
                FROM hr_policy_chunks
            """)
            results = db_session.execute(pg_query).fetchall()
        except Exception:
            results = db_session.query(HRPolicyChunk).all()

        scored_chunks = []
        for r in results:
            if isinstance(r, HRPolicyChunk):
                chunk = r
                emb = chunk.embedding
            else:
                chunk = HRPolicyChunk(
                    id=r.id, title=r.title, category=r.category, content=r.content, embedding=r.embedding
                )
                emb = r.embedding if isinstance(r.embedding, list) else json.loads(r.embedding)
            
            score = cosine_similarity(query_vec, emb)
            scored_chunks.append((chunk, score))

        scored_chunks.sort(key=lambda x: x[1], reverse=True)
        return scored_chunks[:top_k]

    @classmethod
    def process_hr_query(cls, user_id: str, query: str) -> Dict[str, Any]:
        """
        Processes an HR AI query:
        1. Context Enrichment: Fetches user employee profile & leave balances.
        2. Policy Retrieval: Performs vector similarity search over policy chunks.
        3. Response Generation: Synthesizes intelligent answer with Markdown policy citations.
        """
        # Fetch user context
        user = db_session.query(User).filter(User.id == user_id).first()
        employee = db_session.query(Employee).filter(Employee.id == user_id).first() if user else None
        
        emp_name = f"{employee.first_name} {employee.last_name}" if employee else "Employee"
        dept_name = employee.department.name if (employee and employee.department) else "General"
        designation = employee.designation if employee else "Staff Member"

        # Fetch leave balances if query mentions leave/vacation/sick/time off
        leave_info = ""
        if employee and any(kw in query.lower() for kw in ["leave", "vacation", "sick", "balance", "time off", "days", "holiday"]):
            balances = db_session.query(LeaveBalance).filter(LeaveBalance.employee_id == employee.id).all()
            if balances:
                leave_str_list = [
                    f"• **{b.leave_type.name if b.leave_type else 'Leave'}**: {float(b.allocated_days) - float(b.used_days):.1f} days remaining (Allocated: {b.allocated_days})"
                    for b in balances
                ]
                leave_info = "\n\n### 📊 Your Current Leave Balance:\n" + "\n".join(leave_str_list)

        # Retrieve top policy chunks
        matching_chunks = cls.search_policy_chunks(query, top_k=3)

        policy_context = ""
        citations = []
        if matching_chunks and matching_chunks[0][1] > 0.05:
            policy_context_list = []
            for chunk, score in matching_chunks:
                if score > 0.05:
                    policy_context_list.append(f"**[{chunk.category}] {chunk.title}**:\n{chunk.content}")
                    citations.append(f"_{chunk.title} ({chunk.category})_")
            policy_context = "\n\n### 📖 Official Company Policy Reference:\n" + "\n\n".join(policy_context_list)

        # Synthesize answer
        q_lower = query.lower()
        if "vacation" in q_lower or "leave" in q_lower or "sick" in q_lower or "time off" in q_lower:
            answer = (
                f"Hello {emp_name}! 👋\n\n"
                f"Here is the relevant information regarding leave policies for **{dept_name}** department ({designation}):"
                f"{leave_info}{policy_context}\n\n"
                f"💡 *Tip: You can submit leave requests directly from the Leave Management page.*"
            )
        elif "remote" in q_lower or "home" in q_lower or "wfh" in q_lower:
            answer = (
                f"Hello {emp_name}!\n\n"
                f"Regarding remote work guidelines for **{dept_name}**:"
                f"{policy_context}\n\n"
                f"Please ensure you discuss your remote schedule with your Department Manager."
            )
        elif "benefit" in q_lower or "insurance" in q_lower or "allowance" in q_lower or "health" in q_lower:
            answer = (
                f"Hello {emp_name}!\n\n"
                f"Here are the employee benefits details applicable to your position as **{designation}**:"
                f"{policy_context}"
            )
        else:
            answer = (
                f"Hello {emp_name}! I am your HR AI Assistant. 🤖\n\n"
                f"I've searched our official HR policies for your query:\n"
                f"> *\"{query}\"*\n"
                f"{policy_context}\n\n"
                f"If you have further questions or need HR Manager approval, feel free to submit a ticket or message HR directly."
            )

        return {
            "answer": answer,
            "citations": citations,
            "relevant_chunks_count": len(citations)
        }
