"""Local inventory API used as the source system in a migration lab."""

import logging
import os
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool


def connect():
    return psycopg.connect(
        host=os.environ["DB_HOST"],
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        connect_timeout=3,
        options="-c statement_timeout=5000",
        row_factory=dict_row,
    )


def initialize_database():
    with connect() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS items (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
                quantity INTEGER NOT NULL CHECK (quantity >= 0)
            )
        """)


@asynccontextmanager
async def lifespan(app):
    await run_in_threadpool(initialize_database)
    yield


app = FastAPI(title="Inventory migration lab", lifespan=lifespan)


class NewItem(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    quantity: int = Field(strict=True, ge=0, le=2147483647)


class Item(NewItem):
    id: int


@app.exception_handler(psycopg.Error)
async def database_error(request, error):
    from fastapi.responses import JSONResponse

    logging.getLogger(__name__).error("Database request failed: %s", type(error).__name__)
    return JSONResponse(status_code=503, content={"detail": "Database unavailable"})


@app.get("/health")
def health():
    with connect() as connection:
        connection.execute("SELECT 1")
    return {"status": "ok"}


@app.get("/items", response_model=list[Item])
def list_items():
    with connect() as connection:
        return connection.execute("SELECT id, name, quantity FROM items ORDER BY id").fetchall()


@app.post("/items", response_model=Item, status_code=201)
def create_item(item: NewItem):
    if os.environ.get("READ_ONLY", "false").lower() == "true":
        raise HTTPException(status_code=503, detail="Migration rehearsal: writes are paused")
    with connect() as connection:
        return connection.execute(
            "INSERT INTO items (name, quantity) VALUES (%s, %s) RETURNING id, name, quantity",
            (item.name, item.quantity),
        ).fetchone()
