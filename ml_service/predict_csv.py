import argparse
import sys
from pathlib import Path

from windows_compat import patch_platform_machine

patch_platform_machine()

import pandas as pd

from prediction_output import build_prediction_batch
from predictor import IDSPredictor
from preprocessing import canonicalize_columns
from schemas import validate_prediction_batch
from utils import json_print, stderr


def analyze_csv(input_path: Path):
    df = canonicalize_columns(pd.read_csv(input_path, low_memory=False))
    predictor = IDSPredictor()
    predictions = predictor.predict_dataframe(df)
    result = build_prediction_batch(df, predictions, predictor.info(), "csv", warnings=[])
    schema_errors = validate_prediction_batch(result)
    if schema_errors:
        result["warnings"].extend(schema_errors)
    return result


def main():
    parser = argparse.ArgumentParser(description="Analyze CSV flow-feature file")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()

    try:
        result = analyze_csv(Path(args.input))
        if args.output:
            Path(args.output).write_text(__import__("json").dumps(result, indent=2), encoding="utf-8")
        json_print(result)
        return 0
    except Exception as error:
        stderr(str(error))
        json_print({"status": "error", "error": str(error), "warnings": [str(error)]})
        return 1


if __name__ == "__main__":
    sys.exit(main())
