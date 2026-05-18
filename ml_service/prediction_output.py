from collections import Counter

import pandas as pd

from utils import make_id, now_iso


def is_benign(label):
    return str(label).strip().upper() == "BENIGN"


def class_distribution(predictions):
    return dict(Counter(str(item["prediction"]) for item in predictions))


def threat_for_prediction(prediction, confidence):
    label = str(prediction)
    lower = label.lower()
    if "heartbleed" in lower or "infiltration" in lower:
        severity = "Critical"
    elif "ddos" in lower or "dos" in lower or "bot" in lower:
        severity = "Critical" if confidence >= 0.85 else "High"
    elif "scan" in lower or "patator" in lower or "brute" in lower or "web attack" in lower:
        severity = "High"
    else:
        severity = "Medium"

    if "ddos" in lower or "dos" in lower:
        category = "Denial of Service"
    elif "scan" in lower:
        category = "Reconnaissance"
    elif "bot" in lower:
        category = "Botnet"
    elif "patator" in lower or "brute" in lower:
        category = "Credential Attack"
    elif "web attack" in lower or "xss" in lower or "sql" in lower:
        category = "Web Attack"
    elif "infiltration" in lower:
        category = "Infiltration"
    elif "heartbleed" in lower:
        category = "Exploit"
    else:
        category = "Anomalous Network Flow"

    return {
        "category": category,
        "severity": severity,
    }


def first_value(row, names, default=None):
    for name in names:
        if name in row and not pd.isna(row[name]):
            value = row[name]
            if hasattr(value, "item"):
                value = value.item()
            return value
    return default


def as_int(value, default=None):
    try:
        if value is None or pd.isna(value):
            return default
        return int(float(value))
    except Exception:
        return default


def protocol_name(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return "unknown"
    text = str(value).strip()
    if text in {"6", "6.0"}:
        return "TCP"
    if text in {"17", "17.0"}:
        return "UDP"
    if text in {"1", "1.0"}:
        return "ICMP"
    return text.upper()


def alert_from_prediction(row, prediction, model_info, source_type, session_id=None):
    confidence = float(prediction["confidence"])
    source_ip = first_value(row, ["Source IP", "Src IP", "source_ip"], None)
    destination_ip = first_value(row, ["Destination IP", "Dst IP", "destination_ip"], None)
    source_port = as_int(first_value(row, ["Source Port", "Src Port", "source_port"], None))
    destination_port = as_int(first_value(row, ["Destination Port", "Dst Port", "destination_port"], None))
    protocol = protocol_name(first_value(row, ["Protocol Name", "Protocol", "protocol"], "unknown"))
    flow_id = first_value(row, ["Flow ID", "flow_id"], None)
    duration_ms = first_value(row, ["Duration Ms", "duration_ms"], None)
    if duration_ms is None:
        duration_microseconds = first_value(row, ["Flow Duration"], 0)
        try:
            duration_ms = float(duration_microseconds) / 1000.0
        except Exception:
            duration_ms = 0.0

    return {
        "event_id": make_id("evt"),
        "timestamp": now_iso(),
        "source": {
            "ip": str(source_ip) if source_ip is not None else None,
            "port": source_port,
        },
        "destination": {
            "ip": str(destination_ip) if destination_ip is not None else None,
            "port": destination_port,
        },
        "network": {
            "protocol": protocol,
            "direction": "unknown",
            "flow_id": str(flow_id) if flow_id is not None else None,
            "packet_count": as_int(first_value(row, ["Packet Count", "Total Fwd Packets"], None)),
            "byte_count": as_int(
                first_value(row, ["Byte Count", "Total Length of Fwd Packets", "Total Length of Bwd Packets"], None)
            ),
            "duration_ms": float(duration_ms or 0),
        },
        "ml": {
            "model_name": model_info["name"],
            "model_version": model_info["version"],
            "prediction": prediction["prediction"],
            "confidence": confidence,
            "probabilities": prediction["probabilities"],
            "top_features": prediction["top_features"],
            "feature_values": prediction["feature_values"],
        },
        "threat": threat_for_prediction(prediction["prediction"], confidence),
        "source_type": source_type,
        "session_id": session_id,
    }


def build_prediction_batch(df, predictions, model_info, source_type, warnings=None, session_id=None):
    distribution = class_distribution(predictions)
    benign_count = sum(count for label, count in distribution.items() if is_benign(label))
    malicious_count = len(predictions) - benign_count
    alerts = []
    for prediction in predictions:
        if is_benign(prediction["prediction"]):
            continue
        row = df.iloc[prediction["row_index"]] if len(df) > prediction["row_index"] else {}
        alerts.append(alert_from_prediction(row, prediction, model_info, source_type, session_id=session_id))

    return {
        "batch_id": make_id("batch"),
        "timestamp": now_iso(),
        "source_type": source_type,
        "model": {
            "name": model_info["name"],
            "version": model_info["version"],
            "supported_classes": model_info.get("supported_classes", []),
            "legacy": model_info.get("legacy", False),
        },
        "summary": {
            "total_flows": len(predictions),
            "benign_count": int(benign_count),
            "malicious_count": int(malicious_count),
            "class_distribution": distribution,
        },
        "alerts": alerts,
        "warnings": warnings or [],
    }
