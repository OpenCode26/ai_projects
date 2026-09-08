"""Uniform `{"error": "<human-readable reason>"}` responses (PLAN §8).

The chat flow surfaces the same messages as error context (§9), so route
handlers raise and these handlers do the shaping.
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from db.dao import TradeValidationError
from db.tickers import InvalidTicker


class NotFound(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)


def register(app: FastAPI) -> None:
    @app.exception_handler(InvalidTicker)
    async def _invalid_ticker(request: Request, exc: InvalidTicker) -> JSONResponse:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    @app.exception_handler(TradeValidationError)
    async def _trade_invalid(
        request: Request, exc: TradeValidationError
    ) -> JSONResponse:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    @app.exception_handler(NotFound)
    async def _not_found(request: Request, exc: NotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"error": str(exc)})

    @app.exception_handler(HTTPException)
    async def _http_error(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})

    @app.exception_handler(RequestValidationError)
    async def _bad_request(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        first = exc.errors()[0]
        field = ".".join(str(part) for part in first["loc"][1:]) or "request"
        return JSONResponse(
            status_code=400, content={"error": f"{field}: {first['msg']}"}
        )
