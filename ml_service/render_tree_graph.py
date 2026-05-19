import argparse
import json
import sys
from pathlib import Path

from windows_compat import patch_platform_machine

patch_platform_machine()

import joblib
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from sklearn.tree import plot_tree

from config import LEGACY_MODEL_FILE, METADATA_FILE, MODEL_FILE, MODELS_DIR
from utils import json_print, stderr


DEFAULT_OUTPUT_FILE = MODELS_DIR / "tree_graph.png"


def load_json(path: Path):
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_artifact(model_file: Path, metadata_file: Path):
    metadata = load_json(metadata_file)
    artifact = joblib.load(model_file)

    if isinstance(artifact, dict):
        pipeline = artifact.get("pipeline")
        classifier = None
        if pipeline is not None and hasattr(pipeline, "named_steps"):
            classifier = pipeline.named_steps.get("classifier")
        classifier = classifier or artifact.get("model") or artifact.get("classifier")
        features = artifact.get("features") or metadata.get("features") or []
        classes = artifact.get("classes") or metadata.get("supportedClasses") or []
    elif hasattr(artifact, "named_steps"):
        classifier = artifact.named_steps.get("classifier")
        features = metadata.get("features") or []
        classes = metadata.get("supportedClasses") or getattr(classifier, "classes_", [])
    else:
        classifier = artifact
        features = metadata.get("features") or []
        classes = metadata.get("supportedClasses") or getattr(classifier, "classes_", [])

    if classifier is None or not hasattr(classifier, "estimators_"):
        raise ValueError("Loaded model is not a fitted RandomForestClassifier with estimators_.")

    expected_features = int(getattr(classifier, "n_features_in_", len(features) or 0))
    if len(features) != expected_features:
        features = [f"feature_{index}" for index in range(expected_features)]

    classes = [str(item) for item in classes] or [str(item) for item in getattr(classifier, "classes_", [])]
    return {
        "classifier": classifier,
        "features": [str(item) for item in features],
        "classes": classes,
        "metadata": metadata,
    }


def tree_summary(classifier, estimator_index: int):
    if estimator_index >= len(classifier.estimators_):
        raise ValueError(
            f"Estimator index {estimator_index} is out of range for a forest with {len(classifier.estimators_)} trees."
        )
    tree = classifier.estimators_[estimator_index]
    return {
        "tree": tree,
        "depth": int(tree.get_depth()),
        "nodes": int(tree.tree_.node_count),
    }


def parse_max_depth(value):
    if value is None:
        return 3
    normalized = str(value).strip().lower()
    if normalized in {"full", "none", "all", "unlimited"}:
        return None
    parsed = int(normalized)
    return max(1, parsed)


def render_tree_graph(
    model_file: Path,
    metadata_file: Path,
    output_file: Path,
    estimator_index: int = 0,
    max_depth=3,
):
    if not model_file.exists():
        if LEGACY_MODEL_FILE.exists():
            model_file = LEGACY_MODEL_FILE
        else:
            raise FileNotFoundError(f"No model artifact found at {model_file}")

    loaded = load_artifact(model_file, metadata_file)
    classifier = loaded["classifier"]
    features = loaded["features"]
    classes = loaded["classes"]
    summary = tree_summary(classifier, estimator_index)
    rendered_depth = parse_max_depth(max_depth)

    output_file.parent.mkdir(parents=True, exist_ok=True)
    fig_width = 22 if rendered_depth is not None else max(36, min(220, summary["depth"] * 3))
    fig_height = max(8, 3 + (rendered_depth if rendered_depth is not None else min(summary["depth"], 40)) * 2)
    fig, axis = plt.subplots(nrows=1, ncols=1, figsize=(fig_width, fig_height))
    plot_options = {
        "feature_names": features,
        "class_names": classes if classes else None,
        "filled": True,
        "rounded": True,
        "fontsize": 8 if rendered_depth is not None else 4,
        "ax": axis,
    }
    if rendered_depth is not None:
        plot_options["max_depth"] = rendered_depth
    plot_tree(summary["tree"], **plot_options)
    axis.set_title(
        (
            f"Random Forest Tree #{estimator_index}\n"
            f"Actual depth: {summary['depth']} | Nodes: {summary['nodes']} | "
            f"Rendered depth: {rendered_depth if rendered_depth is not None else 'full'}"
        ),
        fontsize=16,
    )
    plt.tight_layout()
    plt.savefig(output_file, dpi=150, format="png")
    plt.close(fig)

    return {
        "status": "completed",
        "output": str(output_file),
        "model": str(model_file),
        "estimatorIndex": estimator_index,
        "treeDepth": summary["depth"],
        "nodeCount": summary["nodes"],
        "renderedDepth": rendered_depth if rendered_depth is not None else "full",
        "nEstimators": int(len(classifier.estimators_)),
    }


def main():
    parser = argparse.ArgumentParser(description="Render a Random Forest estimator tree PNG from the saved model")
    parser.add_argument("--model", default=str(MODEL_FILE))
    parser.add_argument("--metadata", default=str(METADATA_FILE))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_FILE))
    parser.add_argument("--estimator-index", type=int, default=0)
    parser.add_argument(
        "--max-depth",
        default="3",
        help='Maximum visible depth for the plot, or "full" to render every node.',
    )
    args = parser.parse_args()

    try:
        json_print(
            render_tree_graph(
                Path(args.model),
                Path(args.metadata),
                Path(args.output),
                estimator_index=args.estimator_index,
                max_depth=args.max_depth,
            )
        )
        return 0
    except Exception as error:
        stderr(str(error))
        json_print({"status": "error", "error": str(error)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
