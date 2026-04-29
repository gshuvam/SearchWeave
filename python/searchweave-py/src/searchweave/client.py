import json
from urllib import error, parse, request

from .config import create_auth_headers, resolve_config
from .errors import SearchWeaveConfigError, SearchWeaveRequestError


class SearchWeaveClient:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        *,
        timeout: float = 30.0,
        config_path=None,
    ):
        resolved = resolve_config(base_url, api_key, config_path=config_path)
        self.base_url = resolved["base_url"]
        self.api_key = resolved["api_key"]
        create_auth_headers(self.base_url, self.api_key)
        self.timeout = timeout

    def search(
        self,
        *,
        q: str,
        type: str | None = None,
        engine: str | list[str] | None = None,
        limit: int | None = None,
        google_cookie: str | None = None,
    ):
        query = (q or "").strip()
        if not query:
            raise SearchWeaveConfigError("missing_query", "q is required.")

        payload = {"q": query}
        if type:
            normalized_type = type.strip().lower()
            if normalized_type not in {"text", "image"}:
                raise SearchWeaveConfigError("invalid_type", "type must be text or image.")
            payload["type"] = normalized_type

        if engine:
            if isinstance(engine, list):
                merged = ",".join(item.strip() for item in engine if item and item.strip())
            else:
                merged = ",".join(
                    item.strip() for item in str(engine).split(",") if item.strip()
                )
            if merged:
                payload["engine"] = merged

        if limit is not None:
            if int(limit) <= 0:
                raise SearchWeaveConfigError(
                    "invalid_limit", "limit must be a positive integer.")
            payload["limit"] = str(int(limit))

        if google_cookie and google_cookie.strip():
            payload["google_cookie"] = google_cookie.strip()

        query_string = parse.urlencode(payload)
        endpoint = f"{self.base_url}/api/search?{query_string}"

        headers = {
            "Content-Type": "application/json",
            **create_auth_headers(self.base_url, self.api_key),
        }
        req = request.Request(endpoint, method="GET", headers=headers)

        try:
            with request.urlopen(req, timeout=self.timeout) as response:  # noqa: S310
                body = response.read().decode("utf-8")
                return json.loads(body) if body else None
        except error.HTTPError as exc:
            details = _decode_error_details(exc)
            message = details.get("error", {}).get("message") if isinstance(details, dict) else None
            raise SearchWeaveRequestError(
                message or f"SearchWeave request failed with status {exc.code}.",
                status=exc.code,
                details=details,
            ) from exc


def _decode_error_details(exc: error.HTTPError):
    try:
        raw = exc.read().decode("utf-8")
        return json.loads(raw) if raw else None
    except Exception:  # noqa: BLE001
        return None
