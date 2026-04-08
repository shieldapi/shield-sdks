from .client import Client
from .exceptions import ShieldError

ShieldClient = Client  # backward compatibility alias

__all__ = ["Client", "ShieldClient", "ShieldError"]
__version__ = "0.1.5"
