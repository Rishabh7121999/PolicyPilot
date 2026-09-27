from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend.config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def sync_columns():
    """Add any model columns missing from the live SQLite tables.

    There's no Alembic here (single-table personal app) and
    `Base.metadata.create_all` only creates missing tables, not missing
    columns on existing ones -- so a model change like adding a nullable
    column needs this instead of a real migration.
    """
    inspector = inspect(engine)

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue

            existing = {col["name"] for col in inspector.get_columns(table.name)}

            for column in table.columns:
                if column.name in existing:
                    continue

                col_type = column.type.compile(dialect=engine.dialect)
                conn.execute(
                    text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}')
                )
