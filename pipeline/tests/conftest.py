import sys
from pathlib import Path

# The pipeline scripts import each other as plain modules (`import notes`).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
