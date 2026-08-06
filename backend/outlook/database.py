"""SQLAlchemy engine/session setup for the Outlook invoices database.

Built lazily, on first use - not at import time - so the rest of the app
(including the existing /api/ocr upload flow) keeps working even before
DATABASE_URL is configured; only code paths that actually touch this
database will raise, and only when they're called.
"""

from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from . import config

_engine = None
_SessionLocal = None


def _get_session_factory() -> sessionmaker:
    global _engine, _SessionLocal
    if _SessionLocal is None:
        if not config.DATABASE_URL:
            raise RuntimeError("Missing required environment variable: DATABASE_URL")
        _engine = create_engine(config.DATABASE_URL, pool_pre_ping=True)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    return _SessionLocal


@contextmanager
def get_session() -> Session:
    session = _get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
