"""SQS consumer for Outlook notifications - the other half of
outlook/superflow_router.py, which enqueues every {message_id} Lyzr
Superflow hands off (see misc/setup-guides/05-outlook-inbox-ocr-architecture.md).

Runs embedded in the backend process as a background thread (started from
main.py's lifespan) - not a separate service/container, so there are 2 ECS
services in production (backend, frontend), not 3. Also runnable standalone
for manual testing, or as its own process/container again later if volume
ever justifies splitting it back out - nothing here changes either way:

    python -m outlook.worker

Long-polls SQS, and for each message calls the *unchanged*
processor.process_notification(message_id). A message is deleted from the
queue only after processing returns without raising; an exception leaves it
in place for SQS's own visibility-timeout-based redelivery (and, after
enough failed receives, its dead-letter queue) to take over - see
processor.process_notification's docstring for why it re-raises on failure.

Deliberately sequential (one message at a time) - the 05 doc's scaling
story is horizontal (more backend tasks = more parallel OCR calls, tunable
via ECS service scaling), not intra-process concurrency.
"""

import asyncio
import json
import logging
import signal
import threading

from . import config, processor, queue_client

logger = logging.getLogger("outlook.worker")


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


def run_forever(should_stop: threading.Event) -> None:
    """Long-polls SQS until `should_stop` is set. Safe to run in a plain
    background thread - queue_client's boto3 calls are blocking, not
    asyncio, so this must never run directly on the FastAPI event loop
    (it would freeze all HTTP handling for up to SQS_WAIT_TIME_SECONDS on
    every empty poll). Each received message is processed via its own
    asyncio.run, same as the standalone CLI below.

    Missing config logs and returns rather than raising - consistent with
    outlook/config.py's "don't take down the whole backend over one
    missing piece" philosophy when this runs embedded (see main.py); the
    standalone CLI (main() below) still fails loudly instead, since a
    human runs that directly and should see the error immediately.

    A transient SQS failure (network blip, LocalStack not ready yet on a
    fresh `docker compose up`) logs and retries after a short pause rather
    than killing the thread outright - once dead, an embedded thread has
    no supervisor to restart it short of restarting the whole backend.
    """
    if not config.SQS_QUEUE_URL:
        logger.error("SQS_QUEUE_URL is not set - outlook worker has nothing to consume, not starting.")
        return

    logger.info("outlook worker starting, long-polling %s", config.SQS_QUEUE_URL)
    while not should_stop.is_set():
        try:
            messages = queue_client.receive_messages()
        except Exception:
            logger.exception("outlook worker failed to receive from SQS, retrying in 5s")
            should_stop.wait(5)
            continue
        for message in messages:
            asyncio.run(_handle_one(message))
    logger.info("outlook worker stopped")


def start_background_thread() -> threading.Event:
    """Starts run_forever() in a daemon thread; returns the Event to set
    when the caller wants it to stop (see main.py's lifespan shutdown)."""
    should_stop = threading.Event()
    thread = threading.Thread(target=run_forever, args=(should_stop,), name="outlook-worker", daemon=True)
    thread.start()
    return should_stop


def main() -> None:
    """Standalone CLI entrypoint (`python -m outlook.worker`) - not used by
    the backend process itself, which starts run_forever() in a background
    thread instead (see main.py). Kept for manual testing and as an easy
    path back to a separate worker service/container later."""
    if not config.SQS_QUEUE_URL:
        raise SystemExit("SQS_QUEUE_URL is not set - this worker has nothing to consume. Set it in .env.")

    should_stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_args: should_stop.set())
    signal.signal(signal.SIGINT, lambda *_args: should_stop.set())
    run_forever(should_stop)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
