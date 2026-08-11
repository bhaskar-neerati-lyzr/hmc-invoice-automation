"""Turns the agent's raw reply (a JSON object, sometimes wrapped in a
markdown code fence) into the API's response shape, with every field always
present and normalized regardless of what the model actually returned.
"""

import json
import re

from normalize import as_str, clean_money, normalize_field

FENCED_JSON = re.compile(r"```(?:json)?\s*(\{.*\})\s*```", re.DOTALL)

STRING_FIELDS = [
    "vendor_name",
    "vendor_address",
    "vendor_zipcode",
    "billing_address",
    "billing_zipcode",
    "service_address",
    "service_zipcode",
    "invoice_date",
    "invoice_number",
    "purchase_order_number",
    "due_date",
    "property_code",
    "sub_total",
    "tax",
    "total",
]

ITEM_FIELDS = ["item_name", "qty", "unit_price", "total_price"]
ITEM_MONEY_FIELDS = {"unit_price", "total_price"}


def normalize_items(value) -> list[dict]:
    if not isinstance(value, list):
        return []
    items = []
    for entry in value:
        if not isinstance(entry, dict):
            continue
        item = {field: as_str(entry.get(field)) for field in ITEM_FIELDS}
        for field in ITEM_MONEY_FIELDS:
            item[field] = clean_money(item[field])
        items.append(item)
    return items


def parse_agent_output(value) -> dict:
    payload = value if isinstance(value, dict) else None
    if payload is None and isinstance(value, str):
        match = FENCED_JSON.search(value)
        candidate = match.group(1) if match else value.strip()
        try:
            # strict=False: the agent sometimes emits real line breaks inside
            # string values (e.g. multi-line addresses) instead of escaping
            # them as \n, which strict JSON parsing rejects as an invalid
            # control character.
            payload = json.loads(candidate, strict=False)
        except json.JSONDecodeError:
            payload = None

    if not isinstance(payload, dict):
        # Didn't get the expected JSON shape at all - surface whatever text
        # we have rather than silently dropping it.
        payload = {"text": value if isinstance(value, str) else ""}

    text = as_str(payload.get("text"))
    result = {
        "text": text,
        "partial": payload.get("partial") if isinstance(payload.get("partial"), bool) else None,
        "message": payload.get("message") or None,
        "is_invoice": text == "",
        "items": normalize_items(payload.get("items")),
    }
    for field in STRING_FIELDS:
        result[field] = normalize_field(field, as_str(payload.get(field)))
    return result
