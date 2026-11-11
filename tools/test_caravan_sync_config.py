"""Public endpoint packaging checks; independent of the server-only deployment."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools.configure_caravan_sync import configure


class SyncConfigurationTests(unittest.TestCase):
    def test_packager_only_embeds_a_public_https_origin(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for value in ("", "https://api.example", "https://api.example:8443/"):
                with patch.dict(os.environ, {"CARAVAN_SERVER_URL": value}):
                    configure(root)
                self.assertEqual(json.loads((root / "sync_config.json").read_text())["endpoint"], value.rstrip("/"))
            for value in ("http://api.example", "https://user:secret@api.example", "https://api.example/v1",
                          "https://api.example?token=secret", "https://api.example#secret", "https://appassets.androidplatform.net"):
                with patch.dict(os.environ, {"CARAVAN_SERVER_URL": value}):
                    with self.assertRaises(ValueError):
                        configure(root)
