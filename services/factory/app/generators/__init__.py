"""Per-industry synthetic data generators."""

from .banking import generate_banking
from .healthcare import generate_healthcare
from .logistics import generate_logistics
from .manufacturing import generate_manufacturing
from .retail import generate_retail

__all__ = [
    "generate_banking",
    "generate_healthcare",
    "generate_logistics",
    "generate_manufacturing",
    "generate_retail",
]
