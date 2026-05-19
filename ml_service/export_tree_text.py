import argparse
import sys
from pathlib import Path

from windows_compat import patch_platform_machine

patch_platform_machine()

from sklearn.tree import export_text

from config import METADATA_FILE, MODEL_FILE, MODELS_DIR
from render_tree_graph import load_artifact, tree_summary
from utils import json_print, stderr


DEFAULT_OUTPUT_FILE = MODELS_DIR / "tree_0_full.txt"


def export_tree_text(model_file: Path, metadata_file: Path, output_file: Path, estimator_index: int = 0):
    loaded = load_artifact(model_file, metadata_file)
    summary = tree_summary(loaded["classifier"], estimator_index)
    features = loaded["features"]
    classes = loaded["classes"]

    output_file.parent.mkdir(parents=True, exist_ok=True)
    text = export_text(
        summary["tree"],
        feature_names=features,
        class_names=classes if classes else None,
        max_depth=max(summary["depth"], 1),
        spacing=3,
        decimals=3,
        show_weights=True,
    )
    header = (
        f"Random Forest Tree #{estimator_index}\n"
        f"Depth: {summary['depth']} | Nodes: {summary['nodes']}\n"
        f"Feature count: {len(features)}\n"
        "\n"
    )
    output_file.write_text(header + text, encoding="utf-8")
    return {
        "status": "completed",
        "output": str(output_file),
        "estimatorIndex": estimator_index,
        "treeDepth": summary["depth"],
        "nodeCount": summary["nodes"],
        "bytes": output_file.stat().st_size,
    }


def main():
    parser = argparse.ArgumentParser(description="Export one Random Forest estimator as complete text")
    parser.add_argument("--model", default=str(MODEL_FILE))
    parser.add_argument("--metadata", default=str(METADATA_FILE))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_FILE))
    parser.add_argument("--estimator-index", type=int, default=0)
    args = parser.parse_args()

    try:
        json_print(
            export_tree_text(
                Path(args.model),
                Path(args.metadata),
                Path(args.output),
                estimator_index=args.estimator_index,
            )
        )
        return 0
    except Exception as error:
        stderr(str(error))
        json_print({"status": "error", "error": str(error)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
