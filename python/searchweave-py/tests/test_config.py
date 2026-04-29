import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from searchweave.config import create_auth_headers, resolve_config, save_config
from searchweave.errors import SearchWeaveConfigError


class ConfigTests(unittest.TestCase):
    def test_config_precedence(self):
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "config.json"
            save_config("http://from-file:3000", "from-file", config_path)

            env = {
                "SEARCH_API_BASE_URL": "http://from-env:3000",
                "SEARCH_API_KEY": "from-env",
            }

            resolved = resolve_config(
                "http://from-arg:3000",
                "from-arg",
                config_path=config_path,
                env=env,
            )

            self.assertEqual(resolved["base_url"], "http://from-arg:3000")
            self.assertEqual(resolved["api_key"], "from-arg")

    def test_local_blank_key_header_rules(self):
        self.assertEqual(create_auth_headers("http://127.0.0.1:3000", ""), {})

        with self.assertRaises(SearchWeaveConfigError):
            create_auth_headers("https://api.example.com", "")


if __name__ == "__main__":
    unittest.main()
