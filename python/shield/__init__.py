from .client import Client
from .exceptions import ShieldError
from .resources.agent import Agent

ShieldClient = Client  # alias for consistency with TypeScript SDK

__all__ = ["Client", "ShieldClient", "ShieldError", "Agent"]
__version__ = "0.5.0"
