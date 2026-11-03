"""Write public endpoint configuration; never embed credentials in game assets."""
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit


def configure(root):
    value = os.environ.get("CARAVAN_SERVER_URL", "").strip()
    if value:
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.path not in ("", "/")
                or parsed.port == 0 or parsed.hostname == "appassets.androidplatform.net"):
            raise ValueError("CARAVAN_SERVER_URL must be an HTTPS origin without credentials, path, query or fragment")
        value = value.rstrip("/")
    (Path(root) / "sync_config.json").write_text(
        json.dumps({"endpoint": value}, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    configure(sys.argv[1])
