"""Thin SQS client: enqueue from outlook/superflow_router.py, receive/delete
from the worker (outlook/worker.py). Standard queue, not FIFO - see
misc/setup-guides/05-outlook-inbox-ocr-architecture.md for why ordering
doesn't matter here.

boto3 client is built lazily, on first use - same reasoning as
graph_auth._get_msal_app: this module is imported transitively by main.py,
so constructing a client eagerly would mean any AWS credential/config
problem takes down the whole backend at import time, even before the
first request that actually needs it arrives.
"""

import json

import boto3

from . import config

_sqs_client = None


def _get_client():
    global _sqs_client
    if _sqs_client is None:
        _sqs_client = boto3.client("sqs")
    return _sqs_client


def enqueue(message_id: str) -> None:
    if not config.SQS_QUEUE_URL:
        raise RuntimeError("Missing required environment variable: SQS_QUEUE_URL")
    _get_client().send_message(
        QueueUrl=config.SQS_QUEUE_URL,
        MessageBody=json.dumps({"message_id": message_id}),
    )


def receive_messages() -> list[dict]:
    """Long-poll for up to 10 messages (SQS's own per-call max). Returns the
    raw SQS message dicts - each has `Body` (our JSON) and `ReceiptHandle`
    (needed to delete it after successful processing)."""
    if not config.SQS_QUEUE_URL:
        raise RuntimeError("Missing required environment variable: SQS_QUEUE_URL")
    resp = _get_client().receive_message(
        QueueUrl=config.SQS_QUEUE_URL,
        MaxNumberOfMessages=10,
        WaitTimeSeconds=config.SQS_WAIT_TIME_SECONDS,
    )
    return resp.get("Messages", [])


def delete_message(receipt_handle: str) -> None:
    """Only call this after processing has actually succeeded - deleting
    (or never receiving) a message is the one thing that stops SQS from
    redelivering it. See outlook/worker.py."""
    _get_client().delete_message(QueueUrl=config.SQS_QUEUE_URL, ReceiptHandle=receipt_handle)
