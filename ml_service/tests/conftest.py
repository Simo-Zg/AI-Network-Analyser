import os
import platform
import sys


if sys.platform.startswith("win"):
    machine = (
        os.environ.get("PROCESSOR_ARCHITEW6432")
        or os.environ.get("PROCESSOR_ARCHITECTURE")
        or "AMD64"
    )
    platform.machine = lambda: machine
