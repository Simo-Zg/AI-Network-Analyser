import argparse
import logging
import signal
import sys
import time
from pathlib import Path

from windows_compat import patch_platform_machine

patch_platform_machine()

from feature_extractor import extract_features_from_packets
from prediction_output import build_prediction_batch
from predictor import IDSPredictor
from schemas import validate_prediction_batch
from utils import json_line, now_iso

running = True


def quiet_capture_warnings():
    logging.getLogger("scapy.runtime").setLevel(logging.ERROR)
    logging.getLogger("scapy.loading").setLevel(logging.ERROR)
    logging.getLogger("scapy.arch").setLevel(logging.ERROR)


def handle_stop(_signum, _frame):
    global running
    running = False


def capture_window(interface_name, window_seconds):
    try:
        quiet_capture_warnings()
        from scapy.sendrecv import sniff
    except Exception as error:
        raise RuntimeError(f"Scapy live capture is unavailable: {error}")

    kwargs = {"timeout": window_seconds, "store": True}
    if interface_name:
        kwargs["iface"] = interface_name
    return sniff(**kwargs)


def main():
    parser = argparse.ArgumentParser(description="Stream live network capture windows as JSON lines")
    parser.add_argument("--interface", default="")
    parser.add_argument("--window-seconds", type=int, default=5)
    parser.add_argument("--model", default="")
    parser.add_argument("--session-id", default="")
    args = parser.parse_args()

    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)

    json_line(
        {
            "type": "capture_status",
            "status": "started",
            "session_id": args.session_id,
            "interface": args.interface,
            "window_seconds": args.window_seconds,
            "timestamp": now_iso(),
            "message": (
                "Live capture started. On Windows this may require Npcap and an elevated terminal."
            ),
        }
    )

    predictor = None
    while running:
        try:
            packets = capture_window(args.interface, args.window_seconds)
            df, warnings = extract_features_from_packets(packets)
            warnings.append(
                "Live capture is windowed flow classification, not packet-by-packet classification."
            )

            if df.empty:
                json_line(
                    {
                        "type": "capture_status",
                        "status": "window_empty",
                        "session_id": args.session_id,
                        "packets": len(packets),
                        "timestamp": now_iso(),
                    }
                )
                continue

            if predictor is None:
                predictor = IDSPredictor(Path(args.model)) if args.model else IDSPredictor()

            predictions = predictor.predict_dataframe(df)
            batch = build_prediction_batch(
                df,
                predictions,
                predictor.info(),
                "live",
                warnings=warnings,
                session_id=args.session_id,
            )
            batch["type"] = "prediction_batch"
            batch["session_id"] = args.session_id
            batch["packets_captured"] = len(packets)
            schema_errors = validate_prediction_batch(batch)
            if schema_errors:
                batch["warnings"].extend(schema_errors)
            json_line(batch)
        except PermissionError as error:
            json_line(
                {
                    "type": "error",
                    "session_id": args.session_id,
                    "message": (
                        f"Live capture permission denied: {error}. Run with administrator/root privileges "
                        "and install Npcap on Windows."
                    ),
                    "timestamp": now_iso(),
                }
            )
            break
        except Exception as error:
            json_line(
                {
                    "type": "error",
                    "session_id": args.session_id,
                    "message": str(error),
                    "timestamp": now_iso(),
                }
            )
            time.sleep(1)
            break

    json_line(
        {
            "type": "capture_status",
            "status": "stopped",
            "session_id": args.session_id,
            "timestamp": now_iso(),
        }
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
