import json
import os
from pathlib import Path
from urllib.parse import urlparse

from .errors import SearchWeaveConfigError

DEFAULT_BASE_URL = "http://127.0.0.1:3000"


def get_config_path() -> Path:
    if os.name == "nt":
        appdata = (os.environ.get("APPDATA") or "").strip()
        if appdata:
            base = Path(appdata)
        else:
            base = Path.home() / "AppData" / "Roaming"
        return base / "SearchWeave" / "config.json"

    xdg = (os.environ.get("XDG_CONFIG_HOME") or "").strip()
    base = Path(xdg) if xdg else Path.home() / ".config"
    return base / "searchweave" / "config.json"


def load_config(config_path: Path | None = None) -> dict:
    path = Path(config_path) if config_path else get_config_path()
    if not path.exists():
        return {}

    try:
        raw = path.read_text(encoding="utf-8")
        parsed = json.loads(raw)
    except Exception as error:  # noqa: BLE001
        raise SearchWeaveConfigError(
            "invalid_config",
            f"Could not parse SearchWeave config at {path}.",
        ) from error

    if not isinstance(parsed, dict):
        return {}

    result = {}
    base_url = parsed.get("baseUrl")
    api_key = parsed.get("apiKey")
    if isinstance(base_url, str):
        result["baseUrl"] = base_url.strip()
    if isinstance(api_key, str):
        result["apiKey"] = api_key.strip()

    return result


def save_config(base_url: str, api_key: str, config_path: Path | None = None) -> Path:
    path = Path(config_path) if config_path else get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "baseUrl": str(base_url).strip(),
        "apiKey": str(api_key).strip(),
    }
    path.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")
    return path


def resolve_config(
    base_url: str | None = None,
    api_key: str | None = None,
    *,
    config_path: Path | None = None,
    read_config_file: bool = True,
    env: dict | None = None,
) -> dict:
    env_values = env if env is not None else os.environ
    file_values = load_config(config_path) if read_config_file else {}

    resolved_base_url = _pick_first(
        base_url,
        env_values.get("SEARCH_API_BASE_URL"),
        file_values.get("baseUrl"),
        DEFAULT_BASE_URL,
    )
    resolved_api_key = _pick_first(
        api_key,
        env_values.get("SEARCH_API_KEY"),
        file_values.get("apiKey"),
        "",
    )

    normalized_base_url = normalize_base_url(resolved_base_url)
    if not normalized_base_url:
        raise SearchWeaveConfigError(
            "invalid_base_url",
            "SEARCH_API_BASE_URL must be an absolute http(s) URL.",
        )

    return {
        "base_url": normalized_base_url,
        "api_key": (resolved_api_key or "").strip(),
        "config_path": Path(config_path) if config_path else get_config_path(),
    }


def is_loopback_base_url(base_url: str) -> bool:
    try:
        parsed = urlparse(base_url)
    except Exception:  # noqa: BLE001
        return False

    hostname = (parsed.hostname or "").lower().strip()
    if not hostname:
        return False

    if hostname in {"localhost", "127.0.0.1", "0.0.0.0", "::", "::1"}:
        return True

    return hostname.startswith("127.")


def create_auth_headers(base_url: str, api_key: str) -> dict:
    token = (api_key or "").strip()
    if token:
        return {"Authorization": f"Bearer {token}"}

    if is_loopback_base_url(base_url):
        return {}

    raise SearchWeaveConfigError(
        "missing_api_key",
        "An API key is required for non-local SearchWeave servers.",
    )


def normalize_base_url(value: str | None) -> str:
    if value is None:
        return ""

    text = str(value).strip()
    if not text:
        return ""

    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"}:
        return ""
    if not parsed.netloc:
        return ""

    return text.rstrip("/")


def _pick_first(*values):
    for value in values:
        if value is not None:
            return value
    return None