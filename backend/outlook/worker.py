"""SQS consumer for Outlook notifications - the queue-based counterpart to
main.py's /api/outlook/notify + FastAPI BackgroundTasks path (see
config.USE_SQS_QUEUE and misc/setup-guides/05-outlook-inbox-ocr-architecture.md).

Run as its own process/container, not part of the request-serving backend:

    python -m outlook.worker

Long-polls SQS, and for each message calls the *unchanged*
processor.process_notification(message_id) - none of that module's logic
differs between the BackgroundTasks path and this one. A message is deleted
from the queue only after processing returns without raising; an exception
leaves it in place for SQS's own visibility-timeout-based redelivery (and,
after enough failed receives, its dead-letter queue) to take over - see
processor.process_notification's docstring for why it re-raises on failure.

Deliberately sequential (one message at a time per process) - the 05 doc's
scaling story is horizontal (more worker tasks/processes = more parallel OCR
calls, tunable via ECS service scaling), not intra-process concurrency.
"""

import asyncio
import json
import logging
import signal

from . import config, processor, queue_client

logger = logging.getLogger("outlook.worker")

_stopping = False


def _handle_signal(signum: int, frame) -> None:  # noqa: ARG001 - signal handler signature
    global _stopping
    logger.info("received signal %s, stopping after any in-flight message finishes", signum)
    _stopping = True


async def _handle_one(message: dict) -> None:
    receipt_handle = message["ReceiptHandle"]
    try:
        body = json.loads(message["Body"])
        message_id = body["message_id"]
    except (KeyError, ValueError, json.JSONDecodeError):
        # Malformed body isn't something a retry would ever fix - it's our
        # own producer's message format, not something Graph/SQS could
        # plausibly corrupt - so delete it now rather than let it loop until
        # the DLQ for no reason.
        logger.error("dropping unparseable queue message: %r", message.get("Body"))
        queue_client.delete_message(receipt_handle)
        return

    try:
        await processor.process_notification(message_id)
    except Exception:
        # Already logged with full context inside process_notification.
        # Not deleting the message is what leaves it for SQS to redeliver -
        # swallow here so one bad message doesn't kill the loop for the rest
        # of this batch.
        return

    queue_client.delete_message(receipt_handle)


def main() -> None:
    if not config.USE_SQS_QUEUE:
        raise SystemExit(
            "USE_SQS_QUEUE_FLAG is not set to true - this worker has nothing to consume. "
            "Set USE_SQS_QUEUE_FLAG=true and SQS_QUEUE_URL in .env."
        )

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    logger.info("outlook worker starting, long-polling %s", config.SQS_QUEUE_URL)
    while not _stopping:
        for message in queue_client.receive_messages():
            asyncio.run(_handle_one(message))
    logger.info("outlook worker stopped")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
