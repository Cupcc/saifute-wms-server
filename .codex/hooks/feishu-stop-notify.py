#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_WEBHOOK_URL = (
    "https://www.feishu.cn/flow/api/trigger-webhook/1a54408c02fef6b22f2c9fcfaa50a6da"
)
PROJECT_DIR = Path(
    os.environ.get("CODEX_PROJECT_DIR") or Path(__file__).resolve().parents[2]
)
LOG_PATH = PROJECT_DIR / "logs" / "feishu-notify.log"
STATE_DIR = PROJECT_DIR / ".codex" / "hooks" / "state"

TURN_STATE_CURRENT_PATH = STATE_DIR / "current-turn.json"


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def clean_text(text: str, max_length: int = 160) -> str:
    compact = " ".join(text.replace("\r", " ").replace("\n", " ").split())
    if len(compact) <= max_length:
        return compact
    return compact[: max_length - 1].rstrip() + "…"


def append_log(entry: dict) -> None:
    ensure_dir(LOG_PATH.parent)
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def write_json(file_path: Path, value: dict[str, Any]) -> None:
    ensure_dir(file_path.parent)
    file_path.write_text(
        f"{json.dumps(value, ensure_ascii=False, indent=2)}\n",
        encoding="utf-8",
    )


def read_json(file_path: Path) -> dict[str, Any] | None:
    if not file_path.exists():
        return None
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def remove_file(file_path: Path) -> None:
    try:
        file_path.unlink()
    except FileNotFoundError:
        return


def short_id(value: str, length: int = 6) -> str:
    if not value:
        return "unknown"
    return value[:length]


def format_duration(duration_ms: int) -> str:
    total_seconds = max(0, duration_ms // 1000)
    seconds = total_seconds % 60
    total_minutes = total_seconds // 60
    minutes = total_minutes % 60
    hours = total_minutes // 60
    parts: list[str] = []
    if hours > 0:
        parts.append(f"{hours}小时")
    if minutes > 0:
        parts.append(f"{minutes}分钟")
    if seconds > 0 or not parts:
        parts.append(f"{seconds}秒")
    return "".join(parts)


def normalize_text(value: str | None) -> str:
    return " ".join(str(value or "").replace("\r", " ").replace("\n", " ").split())


def summarize_prompt(prompt: str | None) -> str:
    normalized = normalize_text(prompt)
    if not normalized:
        return "收到新的任务请求"
    max_length = 80
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max_length - 1].rstrip() + "…"


def sanitize_file_component(value: str) -> str:
    sanitized = "".join(
        ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in value
    ).strip("_")
    return sanitized or "unknown"


def turn_state_path(turn_id: str) -> Path:
    return STATE_DIR / f"turn-{sanitize_file_component(turn_id)}.json"


def build_turn_state(payload: dict[str, Any], started_at_ms: int) -> dict[str, Any]:
    return {
        "turnId": str(payload.get("turn_id") or "unknown"),
        "sessionId": str(payload.get("session_id") or "unknown"),
        "startedAtMs": started_at_ms,
        "startedAtIso": datetime.fromtimestamp(
            started_at_ms / 1000, tz=timezone.utc
        ).isoformat(),
        "promptSummary": summarize_prompt(payload.get("prompt")),
    }


def persist_turn_state(payload: dict[str, Any]) -> None:
    started_at_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    state = build_turn_state(payload, started_at_ms)
    file_path = turn_state_path(state["turnId"])
    write_json(file_path, state)
    write_json(TURN_STATE_CURRENT_PATH, state)

    append_log(
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "source": "codex-hook",
            "hook_event_name": payload.get("hook_event_name"),
            "session_id": payload.get("session_id"),
            "turn_id": payload.get("turn_id"),
            "event": "turn_start",
            "phase": "state_written",
            "started_at_ms": started_at_ms,
            "prompt_summary": state["promptSummary"],
        }
    )


def read_turn_state(turn_id: str) -> dict[str, Any] | None:
    if turn_id:
        state = read_json(turn_state_path(turn_id))
        if state is not None:
            return state
    return read_json(TURN_STATE_CURRENT_PATH)


def cleanup_turn_state(turn_id: str) -> None:
    if turn_id:
        remove_file(turn_state_path(turn_id))
    current_state = read_json(TURN_STATE_CURRENT_PATH)
    current_turn_id = (
        str(current_state.get("turnId") or "") if current_state is not None else ""
    )
    if not turn_id or current_turn_id == turn_id:
        remove_file(TURN_STATE_CURRENT_PATH)


def build_message(payload: dict[str, Any], turn_state: dict[str, Any] | None) -> str:
    cwd = payload.get("cwd", "") or ""
    label = Path(cwd).name or cwd or PROJECT_DIR.name
    last_message = payload.get("last_assistant_message")
    summary = clean_text(last_message or "本轮已停止，请查看结果。")
    message_parts = [f"Codex 已完成：{summary}"]

    if turn_state is not None:
        started_at_ms = int(turn_state.get("startedAtMs") or 0)
        if started_at_ms > 0:
            duration_ms = int(datetime.now(timezone.utc).timestamp() * 1000) - started_at_ms
            message_parts.append(f"本轮对话运行：{format_duration(duration_ms)}")

    message_parts.append(f"项目：{label}")
    message_parts.append(f"session_id：{short_id(payload.get('session_id', 'unknown'))}")
    message_parts.append(f"turn_id：{short_id(payload.get('turn_id', 'unknown'))}")
    return "；".join(message_parts)


def send_feishu(webhook_url: str, event: str, msg: str, msg_type: str) -> dict:
    request_body = json.dumps(
        {"event": event, "msg": msg, "type": msg_type},
        ensure_ascii=False,
    ).encode("utf-8")
    request = Request(
        webhook_url,
        data=request_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=30) as response:
        response_body = response.read().decode("utf-8")
    return json.loads(response_body)


def handle_user_prompt_submit(payload: dict[str, Any]) -> int:
    persist_turn_state(payload)
    json.dump({"continue": True}, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def handle_stop(payload: dict[str, Any]) -> int:
    event = "session_complete"
    turn_id = str(payload.get("turn_id") or "")
    turn_state = read_turn_state(turn_id)
    message = build_message(payload, turn_state)
    webhook_url = os.environ.get("FEISHU_WEBHOOK_URL", DEFAULT_WEBHOOK_URL)

    log_entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "source": "codex-hook",
        "hook_event_name": payload.get("hook_event_name"),
        "cwd": payload.get("cwd"),
        "session_id": payload.get("session_id"),
        "turn_id": payload.get("turn_id"),
        "event": event,
        "type": "info",
        "msg": message,
        "phase": "send_attempt",
    }
    append_log(log_entry)

    try:
        response = send_feishu(webhook_url, event, message, "info")
        if response.get("code") != 0:
            raise RuntimeError(response.get("msg") or "Feishu API error")
        append_log(
            {
                **log_entry,
                "phase": "send_ok",
                "feishu_msg": response.get("msg", "success"),
            }
        )
    except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError) as exc:
        append_log(
            {
                **log_entry,
                "phase": "send_error",
                "error": str(exc),
            }
        )
    finally:
        cleanup_turn_state(turn_id)

    json.dump({"continue": True}, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def main() -> int:
    payload = json.load(sys.stdin)
    hook_event_name = str(payload.get("hook_event_name") or "")

    if hook_event_name == "UserPromptSubmit":
        return handle_user_prompt_submit(payload)
    if hook_event_name == "Stop":
        return handle_stop(payload)

    json.dump({"continue": True}, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
