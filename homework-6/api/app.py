"""FastAPI gateway wrapping the file-based banking pipeline.

Run: `uvicorn api.app:app` from the homework-6/ directory.
The pipeline runs synchronously in-process; each POST returns the final verdict.
"""
from __future__ import annotations

import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from fastapi import FastAPI, HTTPException  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

import pipeline_status  # noqa: E402
from integrator import Pipeline  # noqa: E402


class TransactionIn(BaseModel):
    transaction_id: str
    timestamp: str
    source_account: str
    destination_account: str
    amount: str
    currency: str
    transaction_type: str
    description: str | None = None
    metadata: dict = Field(default_factory=dict)


def create_app(base_dir=None, rules_path=None) -> FastAPI:
    shared = Path(base_dir) if base_dir else BASE / "shared"
    pipeline = Pipeline(shared, rules_path=rules_path)
    pipeline.setup_dirs()
    app = FastAPI(title="Banking Pipeline API", version="1.0")

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/transactions", status_code=201)
    def submit(txn: TransactionIn) -> dict:
        return pipeline.process_one(txn.model_dump())

    @app.get("/transactions/{transaction_id}")
    def get_transaction(transaction_id: str) -> dict:
        status = pipeline_status.get_status(pipeline.results, transaction_id)
        if status["status"] == "not_found":
            raise HTTPException(status_code=404, detail="transaction not found")
        return status

    @app.get("/transactions")
    def list_transactions() -> dict:
        return pipeline_status.list_results(pipeline.results)

    @app.get("/summary")
    def summary() -> dict:
        return pipeline.summarize()

    @app.get("/rules")
    def rules() -> dict:
        return pipeline.ruleset.raw

    return app


app = create_app()
