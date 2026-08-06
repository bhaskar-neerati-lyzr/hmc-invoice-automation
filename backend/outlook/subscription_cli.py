"""Manual CLI for managing the Microsoft Graph change-notification subscription.

Usage (run from ocr-app/backend/, with the venv active):

    python -m outlook.subscription_cli create --notification-url https://xxxx.devtunnels.ms/api/outlook/notify
    python -m outlook.subscription_cli renew --id <subscription-id>
    python -m outlook.subscription_cli delete --id <subscription-id>
    python -m outlook.subscription_cli list

There's no scheduled renewal job in this build (out of scope for local/dev
use) - re-run `renew` manually before the ~2.9 day expiry, or `create` a new
one if it lapses.
"""

import argparse
import asyncio
import json
import sys

import httpx

from . import config, graph_client


async def _create(notification_url: str) -> None:
    result = await graph_client.create_subscription(notification_url)
    print(json.dumps(result, indent=2))
    print(f"\nSubscription id: {result['id']}")
    print(f"Expires: {result['expirationDateTime']}")


async def _renew(subscription_id: str) -> None:
    result = await graph_client.renew_subscription(subscription_id)
    print(json.dumps(result, indent=2))


async def _delete(subscription_id: str) -> None:
    await graph_client.delete_subscription(subscription_id)
    print(f"Deleted subscription {subscription_id}")


async def _list() -> None:
    result = await graph_client.list_subscriptions()
    print(json.dumps(result, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_parser = subparsers.add_parser("create")
    create_parser.add_argument(
        "--notification-url",
        default=config.GRAPH_NOTIFICATION_URL or None,
        help="Public HTTPS URL Graph should call, e.g. a tunnel URL + /api/outlook/notify",
    )

    renew_parser = subparsers.add_parser("renew")
    renew_parser.add_argument("--id", required=True, dest="subscription_id")

    delete_parser = subparsers.add_parser("delete")
    delete_parser.add_argument("--id", required=True, dest="subscription_id")

    subparsers.add_parser("list")

    args = parser.parse_args()

    try:
        if args.command == "create":
            if not args.notification_url:
                parser.error("--notification-url is required (or set GRAPH_NOTIFICATION_URL in .env)")
            asyncio.run(_create(args.notification_url))
        elif args.command == "renew":
            asyncio.run(_renew(args.subscription_id))
        elif args.command == "delete":
            asyncio.run(_delete(args.subscription_id))
        elif args.command == "list":
            asyncio.run(_list())
    except httpx.HTTPStatusError as exc:
        # raise_for_status()'s default message is just "400 Bad Request for
        # url ..." - Graph's actual reason (error.code/error.message) is in
        # the response body, which is what you actually need to debug this.
        print(f"Graph API error {exc.response.status_code}:", file=sys.stderr)
        print(exc.response.text, file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
