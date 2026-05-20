from collections import defaultdict
from typing import Dict, List, Tuple

import pandas as pd

from prediction_output import is_benign


DEFAULT_FLOW_THRESHOLD = 80
DEFAULT_FLOW_RATE_THRESHOLD = 15.0
DEFAULT_SYN_THRESHOLD = 80
DEFAULT_SYN_RATE_THRESHOLD = 15.0


def _as_float(value, default=0.0):
    try:
        if value is None or pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def _as_int(value, default=0):
    return int(_as_float(value, default))


def _group_key(row) -> Tuple[str, int, str]:
    destination_ip = str(row.get("Destination IP") or row.get("Dst IP") or "unknown")
    destination_port = _as_int(row.get("Destination Port") or row.get("Dst Port"), 0)
    protocol = str(row.get("Protocol Name") or row.get("Protocol") or "unknown").upper()
    return destination_ip, destination_port, protocol


def _score(flow_rate: float, syn_rate: float, flow_count: int, syn_count: int) -> float:
    flow_score = min(flow_rate / max(DEFAULT_FLOW_RATE_THRESHOLD * 3, 1.0), 1.0)
    syn_score = min(syn_rate / max(DEFAULT_SYN_RATE_THRESHOLD * 3, 1.0), 1.0)
    count_score = min(flow_count / max(DEFAULT_FLOW_THRESHOLD * 3, 1), 1.0)
    syn_count_score = min(syn_count / max(DEFAULT_SYN_THRESHOLD * 3, 1), 1.0)
    return max(0.72, min(0.98, max(flow_score, syn_score, count_score, syn_count_score)))


def apply_live_window_heuristics(
    df: pd.DataFrame,
    predictions: List[Dict],
    window_seconds: int,
    flow_threshold: int = DEFAULT_FLOW_THRESHOLD,
    flow_rate_threshold: float = DEFAULT_FLOW_RATE_THRESHOLD,
    syn_threshold: int = DEFAULT_SYN_THRESHOLD,
    syn_rate_threshold: float = DEFAULT_SYN_RATE_THRESHOLD,
):
    if df.empty or not predictions:
        return predictions, []

    safe_window_seconds = max(float(window_seconds or 1), 1.0)
    groups = defaultdict(lambda: {"rows": [], "syn": 0, "packets": 0, "bytes": 0})

    for row_index, row in df.iterrows():
        key = _group_key(row)
        groups[key]["rows"].append(int(row_index))
        groups[key]["syn"] += _as_int(row.get("SYN Flag Count"), 0)
        groups[key]["packets"] += _as_int(row.get("Packet Count"), 0)
        groups[key]["bytes"] += _as_int(row.get("Byte Count"), 0)

    suspicious = {}
    for key, stats in groups.items():
        destination_ip, destination_port, protocol = key
        if destination_port <= 0:
            continue
        flow_count = len(stats["rows"])
        syn_count = stats["syn"]
        flow_rate = flow_count / safe_window_seconds
        syn_rate = syn_count / safe_window_seconds
        triggered = (
            flow_count >= flow_threshold
            or flow_rate >= flow_rate_threshold
            or syn_count >= syn_threshold
            or syn_rate >= syn_rate_threshold
        )
        if not triggered:
            continue

        suspicious[key] = {
            "destination_ip": destination_ip,
            "destination_port": destination_port,
            "protocol": protocol,
            "window_seconds": safe_window_seconds,
            "window_flow_count": flow_count,
            "window_flow_rate": flow_rate,
            "window_syn_count": syn_count,
            "window_syn_rate": syn_rate,
            "window_packet_count": stats["packets"],
            "window_byte_count": stats["bytes"],
            "heuristic_score": _score(flow_rate, syn_rate, flow_count, syn_count),
        }

    if not suspicious:
        return predictions, []

    updated = []
    heuristic_alerts = 0
    for prediction in predictions:
        row_index = prediction["row_index"]
        if row_index >= len(df):
            updated.append(prediction)
            continue

        row = df.iloc[row_index]
        context = suspicious.get(_group_key(row))
        if not context or not is_benign(prediction.get("prediction")):
            updated.append(prediction)
            continue

        probabilities = dict(prediction.get("probabilities") or {})
        score = float(context["heuristic_score"])
        probabilities["BENIGN"] = min(probabilities.get("BENIGN", 1.0), max(0.0, 1.0 - score))
        probabilities["DoS"] = max(probabilities.get("DoS", 0.0), score)
        feature_values = dict(prediction.get("feature_values") or {})
        feature_values.update(context)
        feature_values["random_forest_prediction"] = prediction.get("prediction")
        feature_values["random_forest_confidence"] = prediction.get("confidence")
        heuristic_alerts += 1

        updated.append(
            {
                **prediction,
                "prediction": "DoS",
                "confidence": score,
                "probabilities": probabilities,
                "top_features": [
                    "window_flow_count",
                    "window_flow_rate",
                    "window_syn_count",
                    "window_syn_rate",
                    "Destination Port",
                ],
                "feature_values": feature_values,
                "model_name": "RandomForest_IDS + LiveWindowHeuristic",
                "model_version": "live-window-heuristic-v1",
                "detection_source": "live_window_heuristic",
            }
        )

    warnings = [
        (
            "Live window heuristic marked "
            f"{heuristic_alerts} flow(s) as DoS because many flows/SYNs targeted the same service "
            "inside one capture window. This is an aggregate detection layer, not a retrained Random Forest result."
        )
    ]
    return updated, warnings
