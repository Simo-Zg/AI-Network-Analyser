"""Compatibility wrapper for the old Flask prototype training entrypoint.

The active training pipeline now lives in ml_service/train_multiclass.py and
preserves multiclass labels instead of collapsing labels into DDoS vs BENIGN.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ML_SERVICE = ROOT / "ml_service"
sys.path.insert(0, str(ML_SERVICE))

from train_multiclass import main


if __name__ == "__main__":
    sys.exit(main())
