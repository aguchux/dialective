import { Injectable } from '@nestjs/common';
import type * as CanvasModule from 'canvas';

const WATERMARK_TEXT = 'DLKYC — VERIFICATION EVIDENCE ONLY';

/**
 * Converts a raw captured evidence image (document or selfie) into the
 * grayscale, DLKYC-watermarked copy admins actually see in the review
 * queue -- the original color image is never shown to a reviewer, only
 * used internally by FaceMatchService/OCR, per the data-protection
 * requirement that a human reviewer's view of a trainer's identity photo
 * be visibly de-identified/marked as verification-only rather than a
 * plain personal photo. `canvas` is lazily require()'d, same rationale as
 * FaceMatchService -- see that file's class doc comment.
 */
@Injectable()
export class KycEvidenceRedactionService {
  private canvasModulePromise: Promise<typeof CanvasModule> | null = null;

  private async loadCanvas(): Promise<typeof CanvasModule> {
    if (!this.canvasModulePromise) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.canvasModulePromise = Promise.resolve(require('canvas'));
    }
    return this.canvasModulePromise;
  }

  /** Returns a grayscale, watermarked JPEG buffer -- never the original color bytes. */
  async toReviewCopy(imageBuffer: Buffer): Promise<Buffer> {
    const canvasModule = await this.loadCanvas();
    const image = await canvasModule.loadImage(imageBuffer);
    const canvas = new canvasModule.Canvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image as never, 0, 0);

    grayscaleInPlace(ctx, canvas.width, canvas.height);
    stampWatermark(ctx, canvas.width, canvas.height);

    return canvas.toBuffer('image/jpeg', { quality: 0.85 });
  }
}

function grayscaleInPlace(
  ctx: CanvasModule.CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    // Rec. 601 luma weights -- standard perceptual grayscale conversion.
    const luma = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
    pixels[i] = luma;
    pixels[i + 1] = luma;
    pixels[i + 2] = luma;
  }
  ctx.putImageData(imageData, 0, 0);
}

function stampWatermark(
  ctx: CanvasModule.CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const fontSize = Math.max(14, Math.round(width / 28));
  ctx.save();
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  const padding = Math.round(fontSize * 0.6);
  const textWidth = ctx.measureText(WATERMARK_TEXT).width;

  // Semi-transparent backing strip so the watermark stays legible over any
  // underlying image content, then the label itself repeated diagonally
  // across the frame -- a single corner stamp is trivially croppable.
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#000000';
  ctx.fillRect(
    0,
    height - fontSize - padding * 2,
    Math.min(width, textWidth + padding * 2),
    fontSize + padding * 2,
  );
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(WATERMARK_TEXT, padding, height - padding);

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ffffff';
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 6);
  const diagonalFontSize = Math.max(18, Math.round(width / 14));
  ctx.font = `bold ${diagonalFontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(WATERMARK_TEXT, 0, 0);
  ctx.restore();
}
