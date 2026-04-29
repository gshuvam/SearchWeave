class SearchWeaveConfigError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class SearchWeaveRequestError(Exception):
    def __init__(self, message: str, status: int, details=None):
        super().__init__(message)
        self.status = status
        self.details = details