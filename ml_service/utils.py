import json
import sys
import uuid
from datetime import datetime, timezone


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def make_id(prefix):
    return f"{prefix}_{uuid.uuid4()}"


def json_print(payload):
    print(json.dumps(payload, default=str), flush=True)


def json_line(payload):
    sys.stdout.write(json.dumps(payload, default=str) + "\n")
    sys.stdout.flush()


def stderr(message):
    sys.stderr.write(str(message) + "\n")
    sys.stderr.flush()
