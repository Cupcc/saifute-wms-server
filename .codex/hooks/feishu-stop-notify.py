#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_WEBHOOK_URL = (
    "https://www.feishu.cn/flow/api/trigger-webhook/1a54408c02fef6b22f2c9fcfaa50a6da"
)
PROJECT_DIR = Path(__file__).resolve().parents[2]
LOG_PATH = PROJECT_DIR / "logs" / "feishu-notify.log"


def clean_text(text: str, max_length: int = 160) -> str:
    compact = " ".join(text.replace("\r", " ").replace("\n", " ").split())
    if len(compact) <= max_length:
        return compact
    return compact[: max_length - 1].rstrip() + "…"


def append_log(entry: dict) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def short_id(value: str, length: int = 6) -> str:
    if not value:
        return "unknown"
    return value[:length]


def build_message(payload: dict) -> str:
    cwd = payload.get("cwd", "") or ""
    label = Path(cwd).name or cwd or PROJECT_DIR.name
    last_message = payload.get("last_assistant_message")
    summary = clean_text(last_message or "本轮已停止，请查看结果。")
    session_id = short_id(payload.get("session_id", "unknown"))
    turn_id = short_id(payload.get("turn_id", "unknown"))
    return (
        f"Codex 已完成：{summary}；项目：{label}；"
        f"session_id：{session_id}；turn_id：{turn_id}"
    )


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


def main() -> int:
    payload = json.load(sys.stdin)
    event = "session_complete"
    message = build_message(payload)
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

    json.dump({"continue": True}, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
