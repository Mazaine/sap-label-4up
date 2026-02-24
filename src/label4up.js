import { PDFDocument } from "pdf-lib";
import { pdfjsLib } from "./pdfjs";

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MARGIN_PT = 18;
const WHITE_THRESHOLD = 235;
const DEFAULT_PADDING_PX = 24;
const RENDER_SCALE = 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function canvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Failed to export cropped label image."));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });
}

function findNonWhiteBoundingBox(imageData, threshold) {
  const { data, width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a === 0) continue;
      if (r < threshold || g < threshold || b < threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function rotateCanvas90(sourceCanvas) {
  const out = document.createElement("canvas");
  out.width = sourceCanvas.height;
  out.height = sourceCanvas.width;
  const ctx = out.getContext("2d");
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
  return out;
}

function normalizeOrientation(labelCanvas, mode) {
  if (mode === "auto") return labelCanvas;

  const isPortrait = labelCanvas.height >= labelCanvas.width;
  const wantsPortrait = mode === "mpl";
  const shouldRotate = (wantsPortrait && !isPortrait) || (!wantsPortrait && isPortrait);
  return shouldRotate ? rotateCanvas90(labelCanvas) : labelCanvas;
}

function createLabelCanvas(pageCanvas) {
  const W = pageCanvas.width;
  const H = pageCanvas.height;
  // SAP labels can sit across the upper area, not only in the top-right corner.
  const regionHeight = Math.max(1, Math.floor(H * 0.75));
  const regionX = 0;
  const regionY = 0;
  const regionWidth = Math.max(1, W);

  const scratch = document.createElement("canvas");
  scratch.width = regionWidth;
  scratch.height = regionHeight;
  const sctx = scratch.getContext("2d");
  sctx.drawImage(
    pageCanvas,
    regionX,
    regionY,
    regionWidth,
    regionHeight,
    0,
    0,
    regionWidth,
    regionHeight,
  );

  const imageData = sctx.getImageData(0, 0, regionWidth, regionHeight);
  const bbox = findNonWhiteBoundingBox(imageData, WHITE_THRESHOLD) ?? {
    x: 0,
    y: 0,
    width: regionWidth,
    height: regionHeight,
  };

  const x = clamp(bbox.x - DEFAULT_PADDING_PX, 0, regionWidth - 1);
  const y = clamp(bbox.y - DEFAULT_PADDING_PX, 0, regionHeight - 1);
  const maxX = clamp(bbox.x + bbox.width + DEFAULT_PADDING_PX, 1, regionWidth);
  const maxY = clamp(bbox.y + bbox.height + DEFAULT_PADDING_PX, 1, regionHeight);
  const cropWidth = Math.max(1, maxX - x);
  const cropHeight = Math.max(1, maxY - y);

  const cropped = document.createElement("canvas");
  cropped.width = cropWidth;
  cropped.height = cropHeight;
  const cctx = cropped.getContext("2d");
  cctx.drawImage(scratch, x, y, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return cropped;
}

function getSlotRect(slotIndex) {
  const innerWidth = A4_WIDTH_PT - MARGIN_PT * 2;
  const innerHeight = A4_HEIGHT_PT - MARGIN_PT * 2;
  const cellWidth = innerWidth / 2;
  const cellHeight = innerHeight / 2;
  const col = slotIndex % 2;
  const row = Math.floor(slotIndex / 2); // 0=top row, 1=bottom row
  const x = MARGIN_PT + col * cellWidth;
  const y = A4_HEIGHT_PT - MARGIN_PT - (row + 1) * cellHeight;
  return { x, y, width: cellWidth, height: cellHeight };
}

function fitRect(srcWidth, srcHeight, dstWidth, dstHeight) {
  const scale = Math.min(dstWidth / srcWidth, dstHeight / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return {
    width,
    height,
    offsetX: (dstWidth - width) / 2,
    offsetY: (dstHeight - height) / 2,
  };
}

async function toUint8Array(fileOrBuffer) {
  if (fileOrBuffer instanceof Uint8Array) return fileOrBuffer;
  if (fileOrBuffer instanceof ArrayBuffer) return new Uint8Array(fileOrBuffer);
  return new Uint8Array(await fileOrBuffer.arrayBuffer());
}

export async function convertSapLabelsTo4UpPdf(fileOrBuffer, options = {}) {
  const mode = options.mode ?? "auto";
  const onProgress = options.onProgress ?? (() => {});
  const outPdf = await PDFDocument.create();
  let outPage = null;
  const inputs = Array.isArray(fileOrBuffer) ? fileOrBuffer : [fileOrBuffer];
  const docs = [];

  try {
    let totalPages = 0;

    for (const input of inputs) {
      const bytes = await toUint8Array(input);
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      docs.push({ loadingTask, pdf });
      totalPages += pdf.numPages;
    }

    let processedPages = 0;

    for (let docIndex = 0; docIndex < docs.length; docIndex += 1) {
      const { pdf } = docs[docIndex];

      for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
        onProgress({
          current: processedPages + 1,
          total: totalPages,
          message: `Feldolgozás: fájl ${docIndex + 1}/${docs.length}, oldal ${pageIndex + 1}/${pdf.numPages}`,
        });

        const page = await pdf.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        const cropped = createLabelCanvas(canvas);
        const normalized = normalizeOrientation(cropped, mode);
        const pngBytes = await canvasToPngBytes(normalized);
        const image = await outPdf.embedPng(pngBytes);

        const slotIndex = processedPages % 4;
        if (slotIndex === 0) {
          outPage = outPdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
        }

        const slot = getSlotRect(slotIndex);
        const fit = fitRect(image.width, image.height, slot.width, slot.height);
        outPage.drawImage(image, {
          x: slot.x + fit.offsetX,
          y: slot.y + fit.offsetY,
          width: fit.width,
          height: fit.height,
        });

        processedPages += 1;
      }
    }

    onProgress({
      current: totalPages,
      total: totalPages,
      message: "Kimeneti PDF generálása...",
    });

    return await outPdf.save();
  } finally {
    for (const { loadingTask } of docs) {
      await loadingTask.destroy();
    }
  }
}
