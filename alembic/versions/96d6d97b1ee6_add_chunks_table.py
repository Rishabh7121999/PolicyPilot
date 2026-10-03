"""add chunks table

Revision ID: 96d6d97b1ee6
Revises: a8a13e7ae477
Create Date: 2026-10-03 22:21:11.916477

"""
from typing import Sequence, Union

from alembic import op
import pgvector.sqlalchemy
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '96d6d97b1ee6'
down_revision: Union[str, Sequence[str], None] = 'a8a13e7ae477'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Not detected by autogenerate; must exist before the vector column/index.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table('chunks',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('policy_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('policy_type', sa.String(), nullable=True),
    sa.Column('source_file', sa.String(), nullable=False),
    sa.Column('page', sa.Integer(), nullable=True),
    sa.Column('section', sa.String(), nullable=True),
    sa.Column('chunk_index', sa.Integer(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=384), nullable=False),
    sa.Column('tsv', postgresql.TSVECTOR(), sa.Computed("to_tsvector('english', content)", persisted=True), nullable=True),
    sa.ForeignKeyConstraint(['policy_id'], ['policies.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_chunks_embedding', 'chunks', ['embedding'], unique=False, postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})
    op.create_index(op.f('ix_chunks_policy_id'), 'chunks', ['policy_id'], unique=False)
    op.create_index('ix_chunks_tsv', 'chunks', ['tsv'], unique=False, postgresql_using='gin')
    op.create_index(op.f('ix_chunks_user_id'), 'chunks', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_chunks_user_id'), table_name='chunks')
    op.drop_index('ix_chunks_tsv', table_name='chunks', postgresql_using='gin')
    op.drop_index(op.f('ix_chunks_policy_id'), table_name='chunks')
    op.drop_index('ix_chunks_embedding', table_name='chunks', postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})
    op.drop_table('chunks')
    # The vector extension is left installed: other tables may come to use it.
