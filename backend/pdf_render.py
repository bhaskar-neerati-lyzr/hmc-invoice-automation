"""PDF-to-image rasterization, so PDFs get read through the same visual path
that already works well for plain images, instead of relying on Lyzr's own
PDF text/table parser.
"""

import fitz  # PyMuPDF

# ~180 DPI (PDF pages are defined at 72 DPI, so a 2.5x render matrix gets us there).
PDF_RENDER_SCALE = 2.5


def render_pdf_to_jpegs(pdf_bytes: bytes) -> list[bytes]:
    """Rasterize every page of a PDF to a JPEG at PDF_RENDER_SCALE."""
    matrix = fitz.Matrix(PDF_RENDER_SCALE, PDF_RENDER_SCALE)
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        return [page.get_pixmap(matrix=matrix).tobytes("jpeg") for page in doc]
