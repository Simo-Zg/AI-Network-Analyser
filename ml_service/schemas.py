from typing import Dict, List


REQUIRED_BATCH_KEYS = {"batch_id", "source_type", "model", "summary", "alerts", "warnings"}


def validate_prediction_batch(payload: Dict) -> List[str]:
    errors = []
    missing = REQUIRED_BATCH_KEYS - set(payload.keys())
    if missing:
        errors.append(f"Missing keys: {', '.join(sorted(missing))}")

    summary = payload.get("summary", {})
    for key in ["total_flows", "benign_count", "malicious_count", "class_distribution"]:
        if key not in summary:
            errors.append(f"Missing summary.{key}")

    if not isinstance(payload.get("alerts", []), list):
        errors.append("alerts must be a list")

    return errors
