import argparse
import logging
import signal
import sys
import time
from pathlib import Path

from windows_compat import patch_platform_machine

patch_platform_machine()

from feature_extractor import extract_features_from_packets
from live_heuristics import apply_live_window_heuristics
from prediction_output import build_prediction_batch
from predictor import IDSPredictor
from schemas import validate_prediction_batch
from utils import json_line, now_iso

running = True


def list_interfaces():
    try:
        quiet_capture_warnings()
        from scapy.all import conf, get_if_list
    except Exception as error:
        return {
            "status": "error",
            "error": f"Scapy interface discovery is unavailable: {error}",
            "interfaces": [],
        }

    interfaces = []
    seen = set()

    try:
        for iface in conf.ifaces.values():
            name = str(getattr(iface, "name", "") or "")
            if not name or name in seen:
                continue
            seen.add(name)
            ips = []
            for attr in ["ip", "ips"]:
                value = getattr(iface, attr, None)
                if isinstance(value, str) and value and value != "0.0.0.0":
                    ips.append(value)
                elif isinstance(value, (list, tuple)):
                    ips.extend(str(item) for item in value if item)
            interfaces.append(
                {
                    "name": name,
                    "description": str(getattr(iface, "description", "") or name),
                    "guid": str(getattr(iface, "guid", "") or ""),
                    "mac": str(getattr(iface, "mac", "") or ""),
                    "ips": sorted(set(ips)),
                }
            )
    except Exception:
        interfaces = []
        seen = set()

    try:
        for name in get_if_list():
            if name not in seen:
                interfaces.append(
                    {
                        "name": str(name),
                        "description": str(name),
                        "guid": "",
                        "mac": "",
                        "ips": [],
                    }
                )
    except Exception:
        pass

    return {
        "status": "ok",
        "interfaces": interfaces,
        "message": "Use the interface whose IP matches the machine receiving the traffic. For localhost traffic, use the Npcap Loopback Adapter.",
    }


def quiet_capture_warnings():
    logging.getLogger("scapy.runtime").setLevel(logging.ERROR)
    logging.getLogger("scapy.loading").setLevel(logging.ERROR)
    logging.getLogger("scapy.arch").setLevel(logging.ERROR)


def handle_stop(_signum, _frame):
    global running
    running = False


def capture_window(interface_name, window_seconds, capture_filter=""):
    try:
        quiet_capture_warnings()
        from scapy.sendrecv import sniff
    except Exception as error:
        raise RuntimeError(f"Scapy live capture is unavailable: {error}")

    kwargs = {"timeout": window_seconds, "store": True}
    if interface_name:
        kwargs["iface"] = interface_name
    if capture_filter:
        kwargs["filter"] = capture_filter
    return sniff(**kwargs)


def main():
    parser = argparse.ArgumentParser(description="Stream live network capture windows as JSON lines")
    parser.add_argument("--interface", default="")
    parser.add_argument("--window-seconds", type=int, default=5)
    parser.add_argument("--model", default="")
    parser.add_argument("--session-id", default="")
    parser.add_argument("--filter", default="")
    parser.add_argument("--list-interfaces", action="store_true")
    parser.add_argument("--dos-flow-threshold", type=int, default=80)
    parser.add_argument("--dos-flow-rate-threshold", type=float, default=15.0)
    parser.add_argument("--dos-syn-threshold", type=int, default=80)
    parser.add_argument("--dos-syn-rate-threshold", type=float, default=15.0)
    args = parser.parse_args()

    if args.list_interfaces:
        json_line(list_interfaces())
        return 0

    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)

    json_line(
        {
            "type": "capture_status",
            "status": "started",
            "session_id": args.session_id,
            "interface": args.interface,
            "window_seconds": args.window_seconds,
            "filter": args.filter,
            "timestamp": now_iso(),
            "message": (
                "Live capture started. On Windows this may require Npcap and an elevated terminal."
            ),
        }
    )

    predictor = None
    while running:
        try:
            packets = capture_window(args.interface, args.window_seconds, args.filter)
            df, warnings = extract_features_from_packets(packets)
            warnings.append(
                "Live capture is windowed flow classification, not packet-by-packet classification."
            )

            if df.empty:
                reason = (
                    "No packets captured in this window. If you are attacking a local server on 127.0.0.1, "
                    "select the Npcap Loopback Adapter instead of Wi-Fi/Ethernet."
                    if len(packets) == 0
                    else "Packets were captured, but no supported IP flows could be reconstructed from them."
                )
                json_line(
                    {
                        "type": "capture_status",
                        "status": "window_empty",
                        "session_id": args.session_id,
                        "packets": len(packets),
                        "flows": 0,
                        "warnings": warnings,
                        "message": reason,
                        "timestamp": now_iso(),
                    }
                )
                continue

            if predictor is None:
                predictor = IDSPredictor(Path(args.model)) if args.model else IDSPredictor()

            predictions = predictor.predict_dataframe(df)
            predictions, heuristic_warnings = apply_live_window_heuristics(
                df,
                predictions,
                args.window_seconds,
                flow_threshold=args.dos_flow_threshold,
                flow_rate_threshold=args.dos_flow_rate_threshold,
                syn_threshold=args.dos_syn_threshold,
                syn_rate_threshold=args.dos_syn_rate_threshold,
            )
            warnings.extend(heuristic_warnings)
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
