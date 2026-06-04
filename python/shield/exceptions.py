class ShieldError(Exception):
    """Base exception for Shield SDK errors."""

    def __init__(self, message: str, status_code: int = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

    def __str__(self):
        if self.status_code:
            return f"[{self.status_code}] {self.message}"
        return self.message

    def __repr__(self):
        return f"ShieldError(message={self.message!r}, status_code={self.status_code!r})"
