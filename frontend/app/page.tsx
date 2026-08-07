"use client";

import { useRef, useState } from "react";
import InvoiceResult from "./components/InvoiceResult";
import { OcrResult, resultFromApi } from "./lib/invoice";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "application/pdf", "image/tiff"];

// Mirrors backend/main.py's MAX_FILE_SIZE_BYTES - checked here too so a
// too-large file gets an immediate, specific error instead of waiting on
// a network round-trip just to be told the same thing by the server.
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

// No browser renders TIFF natively in an <img> - would show a broken-image
// icon instead of "no preview available" - so it gets the same
// no-thumbnail treatment as PDF.
function hasImagePreview(contentType: string): boolean {
  return contentType !== "application/pdf" && contentType !== "image/tiff";
}

type Status = "idle" | "loading" | "success" | "error";

type SelectedFile = { file: File; previewUrl: string | null };

export default function Home() {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<OcrResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetResult() {
    setStatus("idle");
    setResult(null);
    setErrorMessage("");
  }

  function revokePreviews(selected: SelectedFile[]) {
    for (const { previewUrl } of selected) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    }
  }

  function pickFiles(candidates: FileList | File[] | undefined) {
    if (!candidates || candidates.length === 0) return;
    const list = Array.from(candidates);

    const rejected = list.some((candidate) => !ACCEPTED_TYPES.includes(candidate.type));
    if (rejected) {
      setStatus("error");
      setErrorMessage("Unsupported file type. Please upload PNG, JPG, PDF, or TIFF pages only.");
      return;
    }

    const tooLarge = list.find((candidate) => candidate.size > MAX_FILE_SIZE_BYTES);
    if (tooLarge) {
      setStatus("error");
      setErrorMessage(
        `'${tooLarge.name}' is ${(tooLarge.size / 1024 / 1024).toFixed(1)} MB, over the ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB limit.`
      );
      return;
    }

    revokePreviews(files);
    setFiles(
      list.map((candidate) => ({
        file: candidate,
        previewUrl: hasImagePreview(candidate.type) ? URL.createObjectURL(candidate) : null,
      }))
    );
    resetResult();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    pickFiles(e.target.files ?? undefined);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    pickFiles(e.dataTransfer.files);
  }

  async function handleExtract() {
    if (files.length === 0) return;
    setStatus("loading");
    setErrorMessage("");

    try {
      const formData = new FormData();
      for (const { file } of files) {
        formData.append("files", file);
      }

      const res = await fetch(`${API_BASE_URL}/api/ocr`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Extraction failed. Please try again.");
      }

      setResult(resultFromApi(data));
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function handleClear() {
    revokePreviews(files);
    setFiles([]);
    resetResult();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <main className="flex w-full max-w-3xl flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Invoice Extractor
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Upload one or more pages (PNG, JPG, PDF, or TIFF) of an invoice to extract its details.
          </p>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-300 bg-white p-8 text-center transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.pdf,.tif,.tiff,image/png,image/jpeg,application/pdf,image/tiff"
            onChange={handleFileChange}
            className="hidden"
          />

          {files.length === 0 && (
            <>
              <span className="text-sm text-zinc-600 dark:text-zinc-300">
                Click to browse, or drag files here
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                PNG, JPG, PDF, TIFF — select multiple pages of the same invoice
              </span>
            </>
          )}

          {files.length > 0 && (
            <div className="flex w-full flex-wrap items-center justify-center gap-3">
              {files.map(({ file, previewUrl }, index) =>
                previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={index}
                    src={previewUrl}
                    alt={`Page ${index + 1} preview`}
                    className="h-24 w-24 rounded-lg object-cover"
                  />
                ) : (
                  <span
                    key={index}
                    className="max-w-32 truncate rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
                  >
                    {file.name}
                  </span>
                )
              )}
            </div>
          )}
        </div>

        {files.length > 0 && (
          <div className="flex gap-3">
            <button
              onClick={handleExtract}
              disabled={status === "loading"}
              className="flex-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {status === "loading" ? "Extracting…" : "Extract invoice"}
            </button>
            <button
              onClick={handleClear}
              disabled={status === "loading"}
              className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Clear
            </button>
          </div>
        )}

        {status === "error" && errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {status === "success" && result && <InvoiceResult result={result} />}
      </main>
    </div>
  );
}
