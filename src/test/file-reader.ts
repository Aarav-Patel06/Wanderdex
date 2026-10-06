// exifr reads a Blob by chunks with the browser's FileReader, which Node doesn't have. Tests that
// read photos import this first: a minimal FileReader over Blob.arrayBuffer().
class TestFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;

  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then(
      (result) => {
        this.result = result;
        this.onloadend?.();
      },
      (error) => this.onerror?.(error),
    );
  }
}

globalThis.FileReader ??= TestFileReader as unknown as typeof FileReader;
