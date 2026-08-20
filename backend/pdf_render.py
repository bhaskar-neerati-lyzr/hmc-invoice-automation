"""PDF/TIFF-to-image rasterization, so multi-page documents get read
through the same visual path that already works well for plain images,
instead of depending on Lyzr's own PDF parser for one format and hoping it
understands TIFF at all for another - both go through the identical
fitz.open(stream=..., filetype=...) call, just with a different filetype.
"""

import fitz  # PyMuPDF

# ~300 DPI (both formats are defined at 72 DPI, so a ~4.17x render matrix gets us there).
# Raised from 2.5x/180 DPI - that was too low-res for at least one PDF that OCR'd fine
# when uploaded straight to the Lyzr agent (which presumably rasterizes at higher DPI
# itself), but failed to extract through this app's own rasterization step.
RENDER_SCALE = 300 / 72


def _render_to_jpegs(file_bytes: bytes, filetype: str) -> list[bytes]:
    matrix = fitz.Matrix(RENDER_SCALE, RENDER_SCALE)
    with fitz.open(stream=file_bytes, filetype=filetype) as doc:
        return [page.get_pixmap(matrix=matrix).tobytes("jpeg") for page in doc]


def render_pdf_to_jpegs(pdf_bytes: bytes) -> list[bytes]:
    """Rasterize every page of a PDF to a JPEG at RENDER_SCALE."""
    return _render_to_jpegs(pdf_bytes, "pdf")


def render_tiff_to_jpegs(tiff_bytes: bytes) -> list[bytes]:
    """Rasterize every page/frame of a TIFF to a JPEG at RENDER_SCALE - same
    treatment as PDF, since a TIFF can just as easily be a multi-page scan
    (one file, several frames), and this keeps Lyzr's asset endpoint from
    ever having to understand TIFF directly."""
    return _render_to_jpegs(tiff_bytes, "tiff")
