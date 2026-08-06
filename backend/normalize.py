"""Field-level string cleanup applied to whatever the agent transcribes.

Kept separate from the agent's prompt/rules on purpose: the model's job is to
transcribe exactly what it sees, formatting is a code concern (deterministic,
testable, and doesn't require re-verifying a prompt change against the live
agent for what is fundamentally a mechanical string operation).
"""

import re

from dateutil import parser as date_parser

# Fields that get extra, field-specific cleanup beyond plain string coercion.
ID_LABEL_FIELDS = {"invoice_number", "purchase_order_number"}
DATE_FIELDS = {"invoice_date", "due_date"}
MONEY_FIELDS = {"sub_total", "tax", "total"}

# Matches a leading caption/label before an ID value - e.g. "#12345", "PO# 998",
# "PO NO. 5521", "Purchase Order: 5521" - so only the identifier itself is kept.
# Deliberately does NOT strip bare "PO"/"INV" as words, since those are commonly
# part of the real identifier itself (e.g. "PO-8842", "INV-2024-001") rather than
# a label - "PO"/"P.O." only counts as a label when paired with another explicit
# marker (a "#", or "No"/"Number") right after it.
_ID_LABEL_RE = re.compile(
    r"""^\s*
    (?:
        purchase\s*order\s*
        | p\.?\s*o\.?(?=\s*(?:\#|no\b|number\b))
        | no\.?\b
        | number\b
        | \#
        | [.:\-\s]
    )+
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Strips a currency symbol and thousands-separator commas, keeping a plain
# numeric string (e.g. "$1,234.68" -> "1234.68"). Keeps the minus sign for
# potential negative amounts (credits/discounts).
_MONEY_JUNK_RE = re.compile(r"[^\d.\-]")


def as_str(value) -> str:
    return value if isinstance(value, str) else ""


def strip_id_label(value: str) -> str:
    if not value:
        return value
    stripped = _ID_LABEL_RE.sub("", value, count=1).strip()
    return stripped or value.strip()


def normalize_date(value: str) -> str:
    if not value:
        return value
    try:
        parsed = date_parser.parse(value, dayfirst=False)
    except (ValueError, OverflowError, TypeError):
        # Not a date we can confidently parse - keep whatever the model read
        # rather than losing data it successfully extracted.
        return value
    return parsed.strftime("%m/%d/%Y")


def clean_money(value: str) -> str:
    if not value:
        return value
    cleaned = _MONEY_JUNK_RE.sub("", value.replace(",", ""))
    return cleaned or value.strip()


def normalize_field(field: str, value: str) -> str:
    """Apply the field-specific cleanup for `field`, if any."""
    if field in ID_LABEL_FIELDS:
        return strip_id_label(value)
    if field in DATE_FIELDS:
        return normalize_date(value)
    if field in MONEY_FIELDS:
        return clean_money(value)
    return value
