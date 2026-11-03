"""Keep one consistent previous database, never accumulate snapshot history."""
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import tempfile

from .caravan_store import APPLICATION_ID, MAX_DB_BYTES


def backup(directory):
    root = Path(directory).absolute()
    source, target = root / "players.db", root / "players.previous.db"
    if root.is_symlink() or source.is_symlink() or target.is_symlink():
        raise RuntimeError("Unsafe backup path")
    if not source.exists():
        return False
    temporary = None
    try:
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=2)) as db:
            if db.execute("PRAGMA application_id").fetchone()[0] != APPLICATION_ID:
                raise RuntimeError("Unsupported database")
            pages = db.execute("PRAGMA page_count").fetchone()[0]
            size = db.execute("PRAGMA page_size").fetchone()[0]
            if pages * size > MAX_DB_BYTES:
                raise RuntimeError("Database exceeds backup limit")
            descriptor, temporary = tempfile.mkstemp(prefix=".players-backup-", dir=root)
            os.close(descriptor)
            with closing(sqlite3.connect(temporary)) as destination:
                db.backup(destination)
                if destination.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                    raise RuntimeError("Backup check failed")
        Path(temporary).chmod(0o600)
        os.replace(temporary, target)
        return True
    finally:
        if temporary is not None:
            Path(temporary).unlink(missing_ok=True)


if __name__ == "__main__":
    backup("/var/lib/caravan-lite")
