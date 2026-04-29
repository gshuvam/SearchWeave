import argparse
import json
import os
import sys
from pathlib import Path

from .client import SearchWeaveClient
from .config import get_config_path, load_config, resolve_config, save_config
from .errors import SearchWeaveConfigError, SearchWeaveRequestError


def main() -> int:
    return main_for_test(None)


def main_for_test(argv: list[str] | None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help()
        return 0

    try:
        if args.command == "config":
            return run_config(args)
        if args.command == "search":
            return run_search(args)
    except (SearchWeaveConfigError, SearchWeaveRequestError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print("Unknown command.", file=sys.stderr)
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="searchweave-py")
    subparsers = parser.add_subparsers(dest="command")

    config_parser = subparsers.add_parser("config")
    config_subparsers = config_parser.add_subparsers(dest="config_command", required=True)

    config_init = config_subparsers.add_parser("init")
    config_init.add_argument("--config-path", type=Path)
    config_init.add_argument("--base-url")
    config_init.add_argument("--api-key")

    config_set = config_subparsers.add_parser("set")
    config_set.add_argument("--config-path", type=Path)
    config_set.add_argument("--base-url")
    config_set.add_argument("--api-key")

    config_show = config_subparsers.add_parser("show")
    config_show.add_argument("--config-path", type=Path)

    search = subparsers.add_parser("search")
    search.add_argument("--q", "--query", dest="query", required=True)
    search.add_argument("--type", dest="search_type")
    search.add_argument("--engine", action="append")
    search.add_argument("--limit", type=int)
    search.add_argument("--google-cookie", dest="google_cookie")
    search.add_argument("--base-url")
    search.add_argument("--api-key")
    search.add_argument("--config-path", type=Path)

    return parser


def run_config(args) -> int:
    if args.config_command == "init":
        return config_init(args)
    if args.config_command == "set":
        return config_set(args)
    if args.config_command == "show":
        return config_show(args)
    raise SearchWeaveConfigError("invalid_command", "Unknown config command.")


def config_init(args) -> int:
    config_path = args.config_path or get_config_path()
    existing = load_config(config_path)

    base_url_default = (
        (args.base_url or "").strip()
        or existing.get("baseUrl", "")
        or (os.environ.get("SEARCH_API_BASE_URL") or "").strip()
        or "http://127.0.0.1:3000"
    )
    api_key_default = (
        (args.api_key or "").strip()
        or existing.get("apiKey", "")
        or (os.environ.get("SEARCH_API_KEY") or "").strip()
    )

    base_url = prompt_for_value("Base URL", base_url_default)
    api_key = prompt_for_value("API key (leave blank for localhost)", api_key_default)

    resolved = resolve_config(
        base_url,
        api_key,
        config_path=config_path,
        read_config_file=False,
    )
    save_config(resolved["base_url"], resolved["api_key"], config_path)
    print(f"Saved config to {config_path}")
    return 0


def config_set(args) -> int:
    config_path = args.config_path or get_config_path()
    existing = load_config(config_path)

    base_url = existing.get("baseUrl", "")
    api_key = existing.get("apiKey", "")

    if args.base_url is not None:
        base_url = args.base_url.strip()
    if args.api_key is not None:
        api_key = args.api_key.strip()

    resolved = resolve_config(
        base_url,
        api_key,
        config_path=config_path,
        read_config_file=False,
    )
    save_config(resolved["base_url"], resolved["api_key"], config_path)
    print(f"Updated config at {config_path}")
    return 0


def config_show(args) -> int:
    config_path = args.config_path or get_config_path()
    config = load_config(config_path)
    print(
        json.dumps(
            {
                "configPath": str(config_path),
                "baseUrl": config.get("baseUrl", ""),
                "apiKey": config.get("apiKey", ""),
            },
            indent=2,
        )
    )
    return 0


def run_search(args) -> int:
    client = create_client_with_optional_setup(args)
    response = client.search(
        q=args.query,
        type=args.search_type,
        engine=args.engine,
        limit=args.limit,
        google_cookie=args.google_cookie,
    )
    print(json.dumps(response, indent=2))
    return 0


def create_client_with_optional_setup(args) -> SearchWeaveClient:
    try:
        return SearchWeaveClient(
            base_url=args.base_url,
            api_key=args.api_key,
            config_path=args.config_path,
        )
    except SearchWeaveConfigError as exc:
        if exc.code == "missing_api_key" and _is_interactive():
            print(
                "No API key found for a non-local server. Starting config init flow.",
                file=sys.stderr,
            )
            init_args = argparse.Namespace(
                config_path=args.config_path,
                base_url=args.base_url,
                api_key=args.api_key,
                config_command="init",
            )
            config_init(init_args)
            return SearchWeaveClient(
                base_url=args.base_url,
                api_key=args.api_key,
                config_path=args.config_path,
            )
        raise


def prompt_for_value(label: str, default: str) -> str:
    if not _is_interactive():
        raise SearchWeaveConfigError(
            "missing_interactive_tty",
            f"Cannot prompt for {label} in a non-interactive session.",
        )

    prompt = f"{label} [{default}]: " if default else f"{label}: "
    value = input(prompt).strip()
    return value or default


def _is_interactive() -> bool:
    return bool(sys.stdin.isatty() and sys.stdout.isatty())
