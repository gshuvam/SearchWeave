import io
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from searchweave import cli


class CliTests(unittest.TestCase):
    def test_config_init_prompt_flow(self):
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "config.json"

            with patch("searchweave.cli._is_interactive", return_value=True), patch(
                "builtins.input",
                side_effect=["http://127.0.0.1:3000", ""],
            ):
                exit_code = cli.main_for_test([
                    "config",
                    "init",
                    "--config-path",
                    str(config_path),
                ])

            self.assertEqual(exit_code, 0)
            self.assertTrue(config_path.exists())

    def test_non_interactive_prompt_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "config.json"
            err = io.StringIO()

            with redirect_stderr(err), patch(
                "searchweave.cli._is_interactive", return_value=False
            ):
                exit_code = cli.main_for_test(
                    ["config", "init", "--config-path", str(config_path)]
                )

            self.assertEqual(exit_code, 1)
            self.assertIn("Cannot prompt", err.getvalue())


if __name__ == "__main__":
    unittest.main()
