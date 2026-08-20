"""Turns the agent's raw reply (a JSON object, sometimes wrapped in a
markdown code fence) into the API's response shape, with every field always
present and normalized regardless of what the model actually returned.
"""

import json
import re

import json_repair

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


def _has_extracted_data(payload: dict) -> bool:
    return bool(payload.get("items")) or any(payload.get(field) for field in STRING_FIELDS)


def _loads_lenient(raw: str) -> dict | None:
    """Parse a JSON object out of `raw`, tolerating the two ways the agent's
    output routinely breaks strict JSON: real line breaks inside string
    values (unescaped \\n - json.loads(strict=False) handles that), and
    unescaped quote characters inside string values (e.g. a `2"` measurement
    in an item name - only json_repair can recover from that one)."""
    try:
        parsed = json.loads(raw, strict=False)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    try:
        repaired = json_repair.loads(raw)
    except Exception:  # noqa: BLE001 - best-effort repair, any failure just falls through
        return None
    return repaired if isinstance(repaired, dict) else None


def _unwrap_nested_json(payload: dict) -> dict:
    """The agent sometimes double-encodes its answer: the real extraction
    lands as a JSON *string* inside payload["text"] or payload["message"]
    instead of being the top-level object, leaving every real field blank.
    When that happens, parse text/message as JSON and use that instead -
    bounded to a couple of hops in case it's nested more than once.
    """
    for _ in range(2):
        if _has_extracted_data(payload):
            break
        for key in ("text", "message"):
            raw = payload.get(key)
            if not isinstance(raw, str) or not raw.strip():
                continue
            nested = _loads_lenient(raw)
            if isinstance(nested, dict):
                payload = nested
                break
        else:
            break
    return payload


def parse_agent_output(value) -> dict:
    payload = value if isinstance(value, dict) else None
    if payload is None and isinstance(value, str):
        match = FENCED_JSON.search(value)
        candidate = match.group(1) if match else value.strip()
        # strict=False: the agent sometimes emits real line breaks inside
        # string values (e.g. multi-line addresses) instead of escaping them
        # as \n, which strict JSON parsing rejects as an invalid control
        # character - _loads_lenient falls back further to json_repair for
        # unescaped-quote breakage on top of that.
        payload = _loads_lenient(candidate)

    if not isinstance(payload, dict):
        # Didn't get the expected JSON shape at all - surface whatever text
        # we have rather than silently dropping it.
        payload = {"text": value if isinstance(value, str) else ""}

    payload = _unwrap_nested_json(payload)

    result = {
        "text": as_str(payload.get("text")),
        "partial": payload.get("partial") if isinstance(payload.get("partial"), bool) else None,
        "message": payload.get("message") or None,
        # Every document reaching this agent is already known to be an invoice
        # (that filtering happens upstream, before OCR is ever called) - the
        # agent no longer decides invoice-vs-not, so this is always true.
        "is_invoice": True,
        "items": normalize_items(payload.get("items")),
    }
    for field in STRING_FIELDS:
        result[field] = normalize_field(field, as_str(payload.get(field)))
    return result
