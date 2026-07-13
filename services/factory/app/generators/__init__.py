"""Per-industry synthetic data generators."""

from .acb import generate_acb
from .banking import generate_banking
from .healthcare import generate_healthcare
from .logistics import generate_logistics
from .manufacturing import generate_manufacturing
from .mediamart import generate_mediamart
from .meygroup import generate_meygroup
from .nam_a_bank import generate_nam_a_bank
from .retail import generate_retail
from .shb import generate_shb
from .singaporeair import generate_singaporeair
from .vacs import generate_vacs
from .vincommerce import generate_vincommerce
from .vnpt import generate_vnpt

__all__ = [
    "generate_acb",
    "generate_banking",
    "generate_healthcare",
    "generate_logistics",
    "generate_manufacturing",
    "generate_mediamart",
    "generate_meygroup",
    "generate_nam_a_bank",
    "generate_retail",
    "generate_shb",
    "generate_singaporeair",
    "generate_vacs",
    "generate_vincommerce",
    "generate_vnpt",
]
