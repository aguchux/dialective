import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import type * as CanvasModule from 'canvas';
import type * as FaceApiModule from '@vladmandic/face-api';

// Below this, two faces are almost certainly different people -- used only
// to floor the 0-100 faceMatchScore, NOT as a pass/fail cutoff (that's
// self-hosted-kyc-decision.ts's job, driven by admin-configured thresholds
// on the resulting score).
const MAX_USEFUL_DISTANCE = 1.0;

export interface FaceDescriptorResult {
  descriptor: Float32Array;
  landmarks: FaceApiModule.FaceLandmarks68;
}

export interface LivenessFrameResult {
  descriptor: Float32Array | null;
  landmarks: FaceApiModule.FaceLandmarks68 | null;
}

/**
 * Wraps @vladmandic/face-api (TensorFlow.js + canvas, CPU-only, no GPU/
 * external API) for DLKYC's deterministic face-match/liveness layer.
 *
 * `canvas` and `@vladmandic/face-api` are lazily require()'d inside
 * ensureLoaded() rather than imported at module top-level (only their
 * *types* are imported above, which TypeScript erases entirely -- no
 * runtime require). Both packages pull in native addons (canvas's Cairo
 * bindings, @tensorflow/tfjs-node's compiled tfjs_binding.node) whose
 * dlopen() can fail on a mismatched platform/Node-ABI combination. A
 * top-level `import` would have thrown at module-load time, taking down
 * the entire kyc module (and everything that imports it, including
 * unrelated Jest specs) with it. Deferring the require to first actual use
 * means a broken native binding only fails the specific evaluate() call
 * that needed it -- self-hosted-kyc.service.ts's runDeterministicChecks
 * already treats that as a 0 score, not a crash.
 */
@Injectable()
export class FaceMatchService {
  private readonly logger = new Logger(FaceMatchService.name);
  private modulesLoadedPromise: Promise<{
    canvas: typeof CanvasModule;
    faceapi: typeof FaceApiModule;
  }> | null = null;

  private async ensureLoaded(): Promise<{
    canvas: typeof CanvasModule;
    faceapi: typeof FaceApiModule;
  }> {
    if (!this.modulesLoadedPromise) {
      this.modulesLoadedPromise = (async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const canvas: typeof CanvasModule = require('canvas');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const faceapi: typeof FaceApiModule = require('@vladmandic/face-api');

        // face-api's browser build expects the DOM globals it was written
        // for (HTMLCanvasElement, HTMLImageElement, ImageData) -- canvas's
        // exports are structurally compatible, so this monkeyPatch call
        // (documented by face-api itself for Node use) is the standard way
        // to run it server-side without a browser.
        faceapi.env.monkeyPatch({
          Canvas: canvas.Canvas as never,
          Image: canvas.Image as never,
          ImageData: canvas.ImageData as never,
        });

        // Models are bundled directly in the @vladmandic/face-api npm
        // package (no separate download/hosting step) -- see
        // node_modules/@vladmandic/face-api/model.
        const modelPath = path.join(
          path.dirname(require.resolve('@vladmandic/face-api/package.json')),
          'model',
        );
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
        this.logger.log('face-api models loaded');
        return { canvas, faceapi };
      })();
    }
    return this.modulesLoadedPromise;
  }

  /** Detects the single best face in an image buffer and returns its descriptor + landmarks, or null if no face was found. */
  async detectSingleFace(imageBuffer: Buffer): Promise<FaceDescriptorResult | null> {
    const { canvas: canvasModule, faceapi } = await this.ensureLoaded();
    const image = await canvasModule.loadImage(imageBuffer);
    const canvas = new canvasModule.Canvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image as never, 0, 0);

    const detection = await faceapi
      .detectSingleFace(canvas as never)
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!detection) return null;
    return { descriptor: detection.descriptor, landmarks: detection.landmarks };
  }

  /**
   * Compares a document-portrait descriptor against a selfie descriptor,
   * returning a 0-100 score (100 = identical). Raw euclidean distance is
   * NOT a calibrated probability -- see DLKYC_PLAN.md section 9.2's
   * "do not label it as a percentage match" caveat; this is a simple linear
   * floor-and-invert, explicitly provisional until a real evaluation
   * dataset exists (section 18.3).
   */
  async compareDescriptors(a: Float32Array, b: Float32Array): Promise<number> {
    const { faceapi } = await this.ensureLoaded();
    const distance = faceapi.euclideanDistance(a, b);
    const clamped = Math.min(distance, MAX_USEFUL_DISTANCE);
    return Math.round((1 - clamped / MAX_USEFUL_DISTANCE) * 100);
  }

  /**
   * Detects a face in each selfie frame independently (a static/replayed
   * photo produces near-identical landmark positions across "frames";
   * multiple frozen or repeated images collapse to near-zero landmark
   * motion) and scores liveness from cross-frame landmark movement --
   * DLKYC_PLAN.md section 10's "frozen-frame, duplicate-frame detection"
   * signal. When challengeType is a turn instruction, also verifies the
   * trainer's head yaw actually moved in the instructed direction between
   * the first and last valid frame (see checkPoseCompliance below) -- a
   * static photo or a random head wobble no longer passes just because
   * *some* landmark motion occurred; the motion must match what was asked.
   */
  async scoreLiveness(
    frameBuffers: Buffer[],
    challengeType?: 'TURN_LEFT' | 'TURN_RIGHT' | null,
  ): Promise<{ livenessScore: number; bestFrameIndex: number; poseCompliant: boolean | null }> {
    const results: LivenessFrameResult[] = [];
    for (const buffer of frameBuffers) {
      const detection = await this.detectSingleFace(buffer);
      results.push({
        descriptor: detection?.descriptor ?? null,
        landmarks: detection?.landmarks ?? null,
      });
    }

    const validIndexes = results
      .map((result, index) => (result.landmarks ? index : -1))
      .filter((index) => index >= 0);
    if (validIndexes.length < 2) {
      // Fewer than 2 usable frames -- cannot measure motion at all.
      return { livenessScore: 0, bestFrameIndex: validIndexes[0] ?? 0, poseCompliant: null };
    }

    let totalMotion = 0;
    let comparisons = 0;
    for (let i = 1; i < validIndexes.length; i += 1) {
      const prev = results[validIndexes[i - 1]].landmarks!;
      const curr = results[validIndexes[i]].landmarks!;
      totalMotion += averageLandmarkDisplacement(prev, curr);
      comparisons += 1;
    }
    const avgMotion = comparisons > 0 ? totalMotion / comparisons : 0;
    // Normalized against a face box roughly 150-250px wide in typical
    // selfie captures -- a few px of average landmark movement between
    // frames is normal micro-motion; near-zero movement across all frames
    // is the frozen/replayed-photo signature this is meant to catch.
    // Provisional scaling, same caveat as compareDescriptors above.
    let livenessScore = Math.round(Math.min(avgMotion / 3, 1) * 100);

    const poseCompliant = challengeType
      ? checkPoseCompliance(
          results[validIndexes[0]].landmarks!,
          results[validIndexes[validIndexes.length - 1]].landmarks!,
          challengeType,
        )
      : null;
    // A turn instruction that clearly wasn't followed caps the liveness
    // score rather than zeroing it outright -- real landmark motion still
    // happened (ruling out a frozen/replayed photo), just not in the asked
    // direction, so this is treated as a weaker pass signal, not the same
    // as no motion at all.
    if (poseCompliant === false) {
      livenessScore = Math.min(livenessScore, 40);
    }

    const bestFrameIndex = pickSharpestFrame(results, validIndexes);
    return { livenessScore, bestFrameIndex, poseCompliant };
  }
}

/**
 * Horizontal offset of the nose tip from the inter-eye midpoint, normalized
 * by inter-eye distance so it's roughly scale-invariant across different
 * face sizes/distances from camera. Positive means the nose has shifted
 * toward the right edge of the (unmirrored) image -- which happens when the
 * subject turns their head to their own left, since their face rotates to
 * present more of their left side, swinging the nose rightward in-frame.
 */
function yawRatio(landmarks: FaceApiModule.FaceLandmarks68): number {
  const leftEyeCenter = averagePoint(landmarks.getLeftEye());
  const rightEyeCenter = averagePoint(landmarks.getRightEye());
  const nose = landmarks.getNose();
  const noseTip = nose[nose.length - 1];
  const eyeMidpointX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
  const interEyeDistance = Math.hypot(
    leftEyeCenter.x - rightEyeCenter.x,
    leftEyeCenter.y - rightEyeCenter.y,
  );
  if (interEyeDistance === 0) return 0;
  return (noseTip.x - eyeMidpointX) / interEyeDistance;
}

function averagePoint(points: FaceApiModule.Point[]): FaceApiModule.Point {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / points.length, y: sum.y / points.length } as FaceApiModule.Point;
}

// Minimum yaw-ratio swing between the first and last valid frame to count
// as a genuine, deliberate turn rather than incidental head jitter --
// derived empirically as "clearly more than normal micro-motion," same
// provisional-until-real-data caveat as every other threshold in this file.
const MIN_YAW_SWING = 0.08;

/**
 * Checks whether the head yaw moved in the instructed direction between the
 * first and last valid selfie frame. TURN_LEFT (the trainer's own left)
 * rotates their face to present more of their right side toward the
 * camera, swinging the nose tip toward the left edge of the (unmirrored)
 * frame -- i.e. yawRatio decreases. TURN_RIGHT is the mirror image: the
 * nose swings right, so yawRatio increases. Exported for direct unit
 * testing with plain {x,y} landmark fixtures.
 */
export function checkPoseCompliance(
  firstLandmarks: {
    getLeftEye(): { x: number; y: number }[];
    getRightEye(): { x: number; y: number }[];
    getNose(): { x: number; y: number }[];
  },
  lastLandmarks: {
    getLeftEye(): { x: number; y: number }[];
    getRightEye(): { x: number; y: number }[];
    getNose(): { x: number; y: number }[];
  },
  challengeType: 'TURN_LEFT' | 'TURN_RIGHT',
): boolean {
  const firstYaw = yawRatio(firstLandmarks as FaceApiModule.FaceLandmarks68);
  const lastYaw = yawRatio(lastLandmarks as FaceApiModule.FaceLandmarks68);
  const delta = lastYaw - firstYaw;
  return challengeType === 'TURN_LEFT' ? delta <= -MIN_YAW_SWING : delta >= MIN_YAW_SWING;
}

/** Exported for direct unit testing -- FaceApiModule.FaceLandmarks68 instances are awkward to construct in a test without a real model, so tests pass a minimal { positions: {x,y}[] } shape instead. */
export function averageLandmarkDisplacement(
  a: { positions: Pick<FaceApiModule.Point, 'x' | 'y'>[] },
  b: { positions: Pick<FaceApiModule.Point, 'x' | 'y'>[] },
): number {
  const aPoints = a.positions;
  const bPoints = b.positions;
  let sum = 0;
  for (let i = 0; i < aPoints.length; i += 1) {
    sum += Math.hypot(aPoints[i].x - bPoints[i].x, aPoints[i].y - bPoints[i].y);
  }
  return sum / aPoints.length;
}

/** Picks the frame whose landmark bounding box is largest (a reasonable proxy for "closest/most front-on" among valid frames) to use for the stored face-match descriptor. */
function pickSharpestFrame(results: LivenessFrameResult[], validIndexes: number[]): number {
  let best = validIndexes[0];
  let bestArea = -1;
  for (const index of validIndexes) {
    const landmarks = results[index].landmarks;
    if (!landmarks) continue;
    const area = landmarkBoundingBoxArea(landmarks.positions);
    if (area > bestArea) {
      bestArea = area;
      best = index;
    }
  }
  return best;
}

/** FaceLandmarks has no built-in bounding-box accessor -- computed directly from its 68 point positions. Exported for direct unit testing. */
export function landmarkBoundingBoxArea(positions: Pick<FaceApiModule.Point, 'x' | 'y'>[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of positions) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}
