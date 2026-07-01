"""Per-industry synthetic data generators."""

from .banking import generate_banking
from .healthcare import generate_healthcare
from .logistics import generate_logistics
from .manufacturing import generate_manufacturing
from .mediamart import generate_mediamart
from .nam_a_bank import generate_nam_a_bank
from .retail import generate_retail
from .vincommerce import generate_vincommerce

__all__ = [
    "generate_banking",
    "generate_healthcare",
    "generate_logistics",
    "generate_manufacturing",
    "generate_mediamart",
    "generate_nam_a_bank",
    "generate_retail",
    "generate_vincommerce",
]
