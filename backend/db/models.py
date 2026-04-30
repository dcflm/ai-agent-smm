from sqlalchemy import (
    Column, String, Text, DateTime, Float, Integer,
    ForeignKey, Enum as SAEnum, JSON
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func
import uuid
import enum


class Base(DeclarativeBase):
    pass


class PostStatus(str, enum.Enum):
    draft = "draft"
    pending_review = "pending_review"
    changes_requested = "changes_requested"
    approved = "approved"
    scheduled = "scheduled"
    published = "published"
    rejected = "rejected"


class Post(Base):
    __tablename__ = "posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    text = Column(Text, nullable=False)
    image_url = Column(String(2048))
    news_source = Column(String(2048))
    news_title = Column(String(512))
    status = Column(SAEnum(PostStatus), default=PostStatus.draft, nullable=False)
    notion_page_id = Column(String(64))
    linkedin_post_id = Column(String(128))
    approved_by = Column(String(256))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    published_at = Column(DateTime(timezone=True))
    scheduled_for = Column(DateTime(timezone=True))

    kpis = relationship("PostKPI", back_populates="post", cascade="all, delete-orphan")
    edits = relationship("EditHistory", back_populates="post", cascade="all, delete-orphan")


class PostKPI(Base):
    __tablename__ = "post_kpis"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())
    impressions = Column(Integer, default=0)
    reactions = Column(Integer, default=0)
    comments = Column(Integer, default=0)
    shares = Column(Integer, default=0)
    clicks = Column(Integer, default=0)
    engagement_rate = Column(Float, default=0.0)

    post = relationship("Post", back_populates="kpis")


class KnowledgeBaseChunk(Base):
    __tablename__ = "knowledge_base"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_name = Column(String(256), nullable=False)
    chunk_text = Column(Text, nullable=False)
    # embedding stored in Supabase via pgvector - managed via raw SQL
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PostEmbedding(Base):
    __tablename__ = "post_embeddings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False)
    # embedding stored via pgvector raw SQL
    metadata_ = Column("metadata", JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class StyleRule(Base):
    __tablename__ = "style_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_text = Column(Text, nullable=False)
    source_post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class EditHistory(Base):
    __tablename__ = "edit_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False)
    original_text = Column(Text, nullable=False)
    edited_text = Column(Text, nullable=False)
    diff_summary = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    post = relationship("Post", back_populates="edits")
