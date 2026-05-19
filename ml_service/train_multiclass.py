import argparse
import json
import os
import platform
import sys
from collections import Counter
from pathlib import Path

from windows_compat import patch_platform_machine

patch_platform_machine()

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from config import FEATURE_ALIASES, MODEL_NAME, SUPPORTED_FEATURES
from model_history import append_model_history
from preprocessing import (
    InfToNanTransformer,
    canonicalize_columns,
    clean_numeric_frame,
    drop_constant_features,
    find_label_column,
    normalize_label,
    select_available_features,
)
from utils import json_print, now_iso, stderr


def load_project_env():
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def env_str(name: str, fallback: str) -> str:
    return os.environ.get(name, fallback)


def env_int(name: str, fallback: int) -> int:
    try:
        return int(os.environ.get(name, fallback))
    except (TypeError, ValueError):
        return fallback


def find_csv_files(data_dir: Path):
    return sorted(data_dir.rglob("*.csv"))


def wanted_training_columns():
    names = {"label"}
    for feature in SUPPORTED_FEATURES:
        names.add(feature.strip().lower())
        for alias in FEATURE_ALIASES.get(feature, []):
            names.add(alias.strip().lower())
    return names


def stratified_cap_dataframe(df: pd.DataFrame, max_total_rows: int, random_state: int) -> pd.DataFrame:
    if not max_total_rows or len(df) <= max_total_rows:
        return df

    class_counts = df["__label"].value_counts()
    rows = []
    allocated = 0
    labels = class_counts.index.tolist()
    for index, label in enumerate(labels):
        subset = df[df["__label"] == label]
        if index == len(labels) - 1:
            target = max_total_rows - allocated
        else:
            target = int(np.floor(max_total_rows * (len(subset) / len(df))))
            target = max(2 if len(subset) >= 2 else 1, target)
            target = min(target, len(subset), max_total_rows - allocated)
        if target <= 0:
            continue
        rows.append(subset.sample(n=target, random_state=random_state + index) if len(subset) > target else subset)
        allocated += target
        if allocated >= max_total_rows:
            break

    capped = pd.concat(rows, ignore_index=True) if rows else df.head(max_total_rows)
    return capped.sample(frac=1, random_state=random_state).reset_index(drop=True)


def load_dataset_full(files, *, label_mode: str):
    frames = []
    rows_scanned = 0
    parse_warnings = []
    class_distribution = Counter()
    file_row_counts = {}

    for file_path in files:
        stderr(f"Reading {file_path.name} fully into memory...")
        try:
            frame = pd.read_csv(file_path, low_memory=False)
            frame = canonicalize_columns(frame)
            label_column = find_label_column(frame)
            frame["_source_file"] = file_path.name
            frame["__label"] = frame[label_column].apply(lambda value: normalize_label(value, label_mode))
            frame = frame.dropna(subset=["__label"])

            file_rows = int(len(frame))
            rows_scanned += file_rows
            class_distribution.update(frame["__label"].value_counts().to_dict())
            file_row_counts[file_path.name] = file_rows
            frames.append(frame)
            stderr(f"Loaded {file_rows} usable rows from {file_path.name}.")
        except MemoryError as error:
            raise MemoryError(
                f"Out of memory while reading {file_path} fully. Set ML_TRAIN_LOAD_MODE=chunked "
                "or pass --loading-mode chunked."
            ) from error
        except Exception as error:
            raise RuntimeError(
                f"Failed reading {file_path} in full loading mode: {error}. "
                "Try ML_TRAIN_LOAD_MODE=chunked or check the CSV format."
            ) from error

    if not frames:
        raise ValueError("No usable training rows were loaded from the dataset CSV files.")

    stderr(f"Concatenating {len(frames)} loaded CSV dataframes into one training dataframe...")
    df = pd.concat(frames, ignore_index=True)
    stderr(f"Concatenated dataframe has {len(df)} rows and {len(df.columns)} columns.")
    load_profile = {
        "loadingMode": "full",
        "rowsScanned": int(rows_scanned),
        "rowsSampledBeforeTotalCap": int(len(df)),
        "rowsSampled": int(len(df)),
        "maxRowsPerClass": 0,
        "maxTotalRows": 0,
        "maxRowsPerFile": 0,
        "chunksize": 0,
        "classDistributionScanned": {str(label): int(count) for label, count in class_distribution.items()},
        "fileRowCounts": {str(name): int(count) for name, count in file_row_counts.items()},
        "parseWarnings": parse_warnings,
    }
    return df, load_profile


def load_dataset_chunked(
    files,
    *,
    label_mode: str,
    chunksize: int,
    max_rows_per_class: int,
    max_total_rows: int,
    max_rows_per_file: int,
    random_state: int,
):
    wanted_columns = wanted_training_columns()
    samples_by_class = {}
    rows_scanned = 0
    rows_sampled_before_total_cap = 0
    parse_warnings = []
    class_distribution = Counter()
    file_row_counts = {}

    for file_path in files:
        file_rows = 0
        stderr(f"Reading {file_path.name} in chunks of {chunksize} rows...")
        try:
            chunks = pd.read_csv(
                file_path,
                chunksize=chunksize,
                low_memory=True,
                on_bad_lines="skip",
                usecols=lambda column: str(column).strip().lower() in wanted_columns,
            )
            for chunk_index, chunk in enumerate(chunks):
                if max_rows_per_file and file_rows >= max_rows_per_file:
                    break
                if max_rows_per_file:
                    remaining = max_rows_per_file - file_rows
                    if remaining <= 0:
                        break
                    if len(chunk) > remaining:
                        chunk = chunk.head(remaining)

                chunk = canonicalize_columns(chunk)
                try:
                    label_column = find_label_column(chunk)
                except ValueError:
                    parse_warnings.append(f"Skipped {file_path.name}: no Label column found in selected columns.")
                    break

                chunk["_source_file"] = file_path.name
                chunk["__label"] = chunk[label_column].apply(lambda value: normalize_label(value, label_mode))
                chunk = chunk.dropna(subset=["__label"])

                rows_scanned += int(len(chunk))
                file_rows += int(len(chunk))
                class_distribution.update(chunk["__label"].value_counts().to_dict())

                features, _missing_features = select_available_features(chunk)
                keep_columns = features + ["__label", "_source_file"]
                chunk = chunk[keep_columns]

                for label, subset in chunk.groupby("__label", sort=False):
                    current = samples_by_class.get(label)
                    if max_rows_per_class and max_rows_per_class > 0:
                        if current is None:
                            combined = subset
                        else:
                            combined = pd.concat([current, subset], ignore_index=True)

                        if len(combined) > max_rows_per_class:
                            seed = random_state + chunk_index + abs(hash(str(label))) % 10000
                            combined = combined.sample(n=max_rows_per_class, random_state=seed)
                        samples_by_class[label] = combined.reset_index(drop=True)
                    else:
                        samples_by_class[label] = (
                            subset.reset_index(drop=True)
                            if current is None
                            else pd.concat([current, subset], ignore_index=True)
                        )
        except MemoryError as error:
            raise MemoryError(
                f"Out of memory while reading {file_path}. Lower --chunksize, --max-rows-per-class, "
                "or --max-total-rows."
            ) from error
        except Exception as error:
            raise RuntimeError(
                f"Failed reading {file_path}: {error}. Try lowering --chunksize or checking the CSV format."
            ) from error

        file_row_counts[file_path.name] = file_rows
        if max_rows_per_file and file_rows >= max_rows_per_file:
            parse_warnings.append(
                f"Stopped reading {file_path.name} after {max_rows_per_file} rows because --max-rows-per-file is set."
            )
        stderr(f"Loaded {file_rows} usable rows from {file_path.name}.")

    if not samples_by_class:
        raise ValueError("No usable training rows were loaded from the dataset CSV files.")

    df = pd.concat(samples_by_class.values(), ignore_index=True)
    rows_sampled_before_total_cap = int(len(df))
    df = stratified_cap_dataframe(df, max_total_rows, random_state)
    df = df.sample(frac=1, random_state=random_state).reset_index(drop=True)

    load_profile = {
        "loadingMode": "chunked",
        "rowsScanned": int(rows_scanned),
        "rowsSampledBeforeTotalCap": rows_sampled_before_total_cap,
        "rowsSampled": int(len(df)),
        "maxRowsPerClass": int(max_rows_per_class or 0),
        "maxTotalRows": int(max_total_rows or 0),
        "maxRowsPerFile": int(max_rows_per_file or 0),
        "chunksize": int(chunksize),
        "classDistributionScanned": {str(label): int(count) for label, count in class_distribution.items()},
        "fileRowCounts": {str(name): int(count) for name, count in file_row_counts.items()},
        "parseWarnings": parse_warnings,
    }
    return df, load_profile


def build_metadata(
    *,
    model_version,
    data_dir,
    files,
    label_mode,
    features,
    missing_features,
    dropped_constant_features,
    duplicate_count,
    classes,
    metrics,
    feature_importance,
    split_note,
    data_profile,
    n_estimators,
    random_state,
):
    return {
        "modelName": MODEL_NAME,
        "modelVersion": model_version,
        "createdAt": now_iso(),
        "datasetName": "CICIDS/CSE-CIC-IDS compatible flow CSV",
        "datasetFiles": [str(file_path) for file_path in files],
        "supportedClasses": classes,
        "features": features,
        "metrics": metrics,
        "dataProfile": data_profile,
        "trainingConfig": {
            "labelMode": label_mode,
            "algorithm": "RandomForestClassifier",
            "nEstimators": n_estimators,
            "classWeight": "balanced_subsample",
            "randomState": random_state,
            "nJobs": -1,
            "maxDepth": None,
            "scaling": "not_used_for_random_forest",
            "split": split_note,
            "dataDir": str(data_dir),
            "missingSupportedFeatures": missing_features,
            "droppedConstantFeatures": dropped_constant_features,
            "duplicateRowCount": duplicate_count,
        },
        "sklearnVersion": sklearn.__version__,
        "pythonVersion": platform.python_version(),
        "notes": (
            "Multiclass-capable Random Forest pipeline. Supported classes reflect the labels present in "
            "the training data; the app must not claim detection for classes absent from this list."
        ),
        "featureImportance": feature_importance,
        "legacy": False,
    }


def train(
    data_dir: Path,
    label_mode: str,
    output_dir: Path,
    loading_mode: str = "full",
    chunksize: int = 100_000,
    max_rows_per_class: int = 25_000,
    max_total_rows: int = 400_000,
    max_rows_per_file: int = 250_000,
    n_estimators: int = 50,
    random_state: int = 42,
):
    files = find_csv_files(data_dir)
    if not files:
        raise FileNotFoundError(
            "No dataset CSV files found. Place CICIDS/CSE-CIC-IDS CSV files in ml_service/data/raw."
        )

    normalized_loading_mode = str(loading_mode or "full").lower()
    if normalized_loading_mode == "full":
        df, load_profile = load_dataset_full(files, label_mode=label_mode)
    elif normalized_loading_mode == "chunked":
        df, load_profile = load_dataset_chunked(
            files,
            label_mode=label_mode,
            chunksize=chunksize,
            max_rows_per_class=max_rows_per_class,
            max_total_rows=max_total_rows,
            max_rows_per_file=max_rows_per_file,
            random_state=random_state,
        )
    else:
        raise ValueError('Invalid loading mode. Expected "full" or "chunked".')

    raw_row_count = int(load_profile["rowsScanned"])
    stderr(f"Dataset loading complete using {load_profile['loadingMode']} mode. Rows scanned: {raw_row_count}.")
    stderr("Scanning for duplicate rows. This can be slow and memory-heavy on full CSE-CIC datasets...")
    duplicate_count = int(df.drop(columns=["_source_file"], errors="ignore").duplicated().sum())
    stderr(f"Duplicate scan complete. Duplicate rows found: {duplicate_count}. Dropping duplicates...")
    df = df.drop_duplicates()
    row_count_after_dedup = int(len(df))
    stderr(f"Rows after duplicate removal: {row_count_after_dedup}.")

    stderr("Selecting supported CICFlowMeter features...")
    features, missing_features = select_available_features(df)
    if not features:
        raise ValueError("No supported CICFlowMeter feature columns were found in the dataset.")

    stderr(f"Selected {len(features)} candidate features. Cleaning numeric values...")
    df = clean_numeric_frame(df, features)
    df = df.dropna(subset=["__label"])
    df = df.dropna(subset=features, how="all")
    row_count_after_cleaning = int(len(df))
    stderr(f"Rows after cleaning: {row_count_after_cleaning}. Checking constant features...")
    features, dropped_constant_features = drop_constant_features(df, features)
    if len(features) < 2:
        raise ValueError("Too few non-constant supported features remain after cleaning.")
    stderr(f"Training with {len(features)} non-constant features.")

    X = df[features]
    y = df["__label"]
    class_counts = y.value_counts()
    stderr(f"Class distribution after cleaning: {class_counts.to_dict()}")
    if len(class_counts) < 2:
        raise ValueError("Training requires at least two classes in the dataset.")
    if class_counts.min() < 2:
        raise ValueError("Each class needs at least two rows for a stratified train/test split.")

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=random_state,
        stratify=y,
    )
    split_note = "random_stratified_train_test_split; source-file split not used"
    stderr(f"Train/test split complete. Train rows: {len(X_train)}, test rows: {len(X_test)}.")

    pipeline = Pipeline(
        steps=[
            ("inf_to_nan", InfToNanTransformer()),
            ("imputer", SimpleImputer(strategy="median")),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=n_estimators,
                    class_weight="balanced_subsample",
                    random_state=random_state,
                    n_jobs=-1,
                    max_depth=None,
                ),
            ),
        ]
    )
    stderr(f"Training RandomForestClassifier with {n_estimators} trees. This is usually the longest stage...")
    pipeline.fit(X_train, y_train)
    stderr("Model fitting complete. Evaluating on test split...")
    predictions = pipeline.predict(X_test)
    classes = sorted(y.unique().tolist())

    macro_precision, macro_recall, macro_f1, _ = precision_recall_fscore_support(
        y_test, predictions, average="macro", zero_division=0
    )
    _, _, weighted_f1, _ = precision_recall_fscore_support(
        y_test, predictions, average="weighted", zero_division=0
    )

    report = classification_report(y_test, predictions, output_dict=True, zero_division=0)
    metrics = {
        "accuracy": float(accuracy_score(y_test, predictions)),
        "macroPrecision": float(macro_precision),
        "macroRecall": float(macro_recall),
        "macroF1": float(macro_f1),
        "weightedF1": float(weighted_f1),
        "confusionMatrixLabels": classes,
        "confusionMatrix": confusion_matrix(y_test, predictions, labels=classes).tolist(),
        "perClassMetrics": {
            label: values
            for label, values in report.items()
            if isinstance(values, dict) and label not in {"macro avg", "weighted avg"}
        },
    }

    classifier = pipeline.named_steps["classifier"]
    stderr("Computing feature importance and writing model artifacts...")
    feature_importance = [
        {"feature": feature, "importance": float(importance)}
        for feature, importance in sorted(
            zip(features, classifier.feature_importances_),
            key=lambda item: item[1],
            reverse=True,
        )
    ]

    model_version = f"rf-multiclass-{pd.Timestamp.now(tz='UTC').strftime('%Y%m%d%H%M%S')}"
    data_profile = {
        "rawRows": raw_row_count,
        "rowsScanned": raw_row_count,
        "rowsAfterDeduplication": row_count_after_dedup,
        "rowsAfterCleaning": row_count_after_cleaning,
        "duplicateRowsRemoved": duplicate_count,
        "trainRows": int(len(X_train)),
        "testRows": int(len(X_test)),
        "classDistribution": {str(label): int(count) for label, count in class_counts.items()},
        "classDistributionScanned": load_profile["classDistributionScanned"],
        "trainClassDistribution": {str(label): int(count) for label, count in y_train.value_counts().items()},
        "testClassDistribution": {str(label): int(count) for label, count in y_test.value_counts().items()},
        "datasetFileCount": len(files),
        "loadingMode": load_profile["loadingMode"],
        "rowsSampledBeforeTotalCap": load_profile["rowsSampledBeforeTotalCap"],
        "rowsSampled": load_profile["rowsSampled"],
        "maxRowsPerClass": load_profile["maxRowsPerClass"],
        "maxTotalRows": load_profile["maxTotalRows"],
        "maxRowsPerFile": load_profile["maxRowsPerFile"],
        "chunksize": load_profile["chunksize"],
        "fileRowCounts": load_profile["fileRowCounts"],
        "parseWarnings": load_profile["parseWarnings"],
        "selectedFeatureCount": len(features),
        "missingSupportedFeatureCount": len(missing_features),
        "droppedConstantFeatureCount": len(dropped_constant_features),
    }
    metadata = build_metadata(
        model_version=model_version,
        data_dir=data_dir,
        files=files,
        label_mode=label_mode,
        features=features,
        missing_features=missing_features,
        dropped_constant_features=dropped_constant_features,
        duplicate_count=duplicate_count,
        classes=classes,
        metrics=metrics,
        feature_importance=feature_importance,
        split_note=split_note,
        data_profile=data_profile,
        n_estimators=n_estimators,
        random_state=random_state,
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    artifact = {
        "pipeline": pipeline,
        "features": features,
        "classes": classes,
        "metadata": metadata,
    }
    joblib.dump(artifact, output_dir / "random_forest_multiclass.joblib")
    with open(output_dir / "model_metadata.json", "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)
    history = append_model_history(output_dir / "model_history.json", metadata)
    stderr("Training artifacts saved.")

    return {
        "status": "completed",
        "metadata": metadata,
        "history": {
            "history_file": str(output_dir / "model_history.json"),
            "total_runs": len(history),
            "latest": history[-1] if history else None,
        },
        "warnings": [
            "Model is multiclass-capable, but supported classes are only those present in the training data.",
        (
            "Full loading mode reads every selected CSV into RAM. Chunked mode streams and bounds rows; "
            "see metadata.dataProfile for loading details."
        ),
            *load_profile["parseWarnings"],
        ],
    }


def main():
    load_project_env()
    parser = argparse.ArgumentParser(description="Train multiclass Random Forest IDS model")
    parser.add_argument(
        "--data-dir",
        default=env_str("ML_TRAIN_DATA_DIR", "ml_service/data/raw/cse_cic_ids2018_processed"),
    )
    parser.add_argument("--label-mode", choices=["fine", "grouped"], default=env_str("ML_TRAIN_LABEL_MODE", "grouped"))
    parser.add_argument("--output-dir", default=env_str("ML_TRAIN_OUTPUT_DIR", "ml_service/models"))
    parser.add_argument(
        "--loading-mode",
        choices=["full", "chunked"],
        default=env_str("ML_TRAIN_LOAD_MODE", "full").lower(),
        help="full loads all CSVs into RAM; chunked streams and samples files.",
    )
    parser.add_argument("--chunksize", type=int, default=env_int("ML_TRAIN_CHUNKSIZE", 100_000))
    parser.add_argument("--max-rows-per-class", type=int, default=env_int("ML_TRAIN_MAX_ROWS_PER_CLASS", 25_000))
    parser.add_argument("--max-total-rows", type=int, default=env_int("ML_TRAIN_MAX_TOTAL_ROWS", 400_000))
    parser.add_argument(
        "--max-rows-per-file",
        type=int,
        default=env_int("ML_TRAIN_MAX_ROWS_PER_FILE", 250_000),
        help="Maximum rows to scan from each CSV. Use 0 to scan every row.",
    )
    parser.add_argument("--n-estimators", type=int, default=env_int("ML_TRAIN_N_ESTIMATORS", 50))
    parser.add_argument("--random-state", type=int, default=env_int("ML_TRAIN_RANDOM_STATE", 42))
    args = parser.parse_args()

    try:
        result = train(
            Path(args.data_dir),
            args.label_mode,
            Path(args.output_dir),
            loading_mode=args.loading_mode,
            chunksize=args.chunksize,
            max_rows_per_class=args.max_rows_per_class,
            max_total_rows=args.max_total_rows,
            max_rows_per_file=args.max_rows_per_file,
            n_estimators=args.n_estimators,
            random_state=args.random_state,
        )
        json_print(result)
        return 0
    except Exception as error:
        message = str(error)
        stderr(message)
        json_print({"status": "error", "error": message})
        return 1


if __name__ == "__main__":
    sys.exit(main())
