import pytest

from normalize import clean_money, normalize_date, strip_id_label


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("#12345", "12345"),
        ("PO# 998", "998"),
        ("PO NO. 5521", "5521"),
        ("po no. 5521", "5521"),
        ("Purchase Order: 5521", "5521"),
        ("No. 12345", "12345"),
        ("No: 12345", "12345"),
        ("INV-2024-001", "INV-2024-001"),
        ("PO-8842", "PO-8842"),
        ("PO8842", "PO8842"),
        ("12345", "12345"),
        ("", ""),
    ],
)
def test_strip_id_label(raw, expected):
    assert strip_id_label(raw) == expected


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("2026-06-01", "06/01/2026"),
        ("01/02/2026", "01/02/2026"),  # ambiguous numeric -> MM/DD default
        ("15/06/2026", "06/15/2026"),  # unambiguous (day > 12) -> DD/MM source
        ("1 June 2026", "06/01/2026"),
        ("June 1, 2026", "06/01/2026"),
        ("06/01/2026", "06/01/2026"),  # already MM/DD/YYYY
        ("", ""),
        ("not a date at all !!", "not a date at all !!"),
    ],
)
def test_normalize_date(raw, expected):
    assert normalize_date(raw) == expected


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("$0.75", "0.75"),
        ("$6.00", "6.00"),
        ("$234.68", "234.68"),
        ("$1,234.68", "1234.68"),
        ("", ""),
        ("234.68", "234.68"),
    ],
)
def test_clean_money(raw, expected):
    assert clean_money(raw) == expected
