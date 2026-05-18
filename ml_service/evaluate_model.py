import argparse
import json
import sys
from pathlib import Path

from windows_compat import patch_platform_machine

patch_platform_machine()

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

from preprocessing import canonicalize_columns, clean_numeric_frame, find_label_column, normalize_label
from utils import json_print, stderr


def evaluate(model_path: Path, data_path: Path, label_mode: str):
    artifact = joblib.load(model_path)
    pipeline = artifact["pipeline"]
    features = artifact["features"]
    classes = artifact["classes"]

    df = canonicalize_columns(pd.read_csv(data_path, low_memory=False))
    label_column = find_label_column(df)
    y = df[label_column].apply(lambda value: normalize_label(value, label_mode))
    df = clean_numeric_frame(df, features)
    predictions = pipeline.predict(df[features])

    return {
        "status": "completed",
        "accuracy": float(accuracy_score(y, predictions)),
        "classification_report": classification_report(y, predictions, output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(y, predictions, labels=classes).tolist(),
        "classes": classes,
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate trained IDS model")
    parser.add_argument("--model", required=True)
    parser.add_argument("--data", required=True)
    parser.add_argument("--label-mode", choices=["fine", "grouped"], default="grouped")
    args = parser.parse_args()

    try:
        json_print(evaluate(Path(args.model), Path(args.data), args.label_mode))
        return 0
    except Exception as error:
        stderr(str(error))
        json_print({"status": "error", "error": str(error)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
