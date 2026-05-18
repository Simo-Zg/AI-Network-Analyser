import os
import platform
import sys


def patch_platform_machine():
    """Avoid fragile Windows WMI calls during scientific package imports.

    Python 3.14's platform.machine() can query WMI on Windows. When WMI is
    unhealthy or the machine is under memory pressure, importing pandas can hang
    or fail before this project prints any training progress.
    """
    if not sys.platform.startswith("win"):
        return

    machine = (
        os.environ.get("PROCESSOR_ARCHITEW6432")
        or os.environ.get("PROCESSOR_ARCHITECTURE")
        or "AMD64"
    )
    platform.machine = lambda: machine
