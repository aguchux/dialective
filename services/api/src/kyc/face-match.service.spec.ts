import {
  averageLandmarkDisplacement,
  checkPoseCompliance,
  landmarkBoundingBoxArea,
} from './face-match.service';

function fixtureLandmarks(noseX: number) {
  return {
    getLeftEye: () => [{ x: 60, y: 40 }],
    getRightEye: () => [{ x: 100, y: 40 }],
    // yawRatio only reads the last point of getNose() (the nose tip).
    getNose: () => [
      { x: 0, y: 0 },
      { x: noseX, y: 55 },
    ],
  };
}

describe('landmarkBoundingBoxArea', () => {
  it('computes the area of the axis-aligned bounding box around a set of points', () => {
    const positions = [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 10, y: 40 },
      { x: 30, y: 40 },
    ];
    expect(landmarkBoundingBoxArea(positions)).toBe(20 * 30);
  });

  it('returns 0 for a single point (zero-area box)', () => {
    expect(landmarkBoundingBoxArea([{ x: 5, y: 5 }])).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(landmarkBoundingBoxArea([])).toBe(0);
  });
});

describe('averageLandmarkDisplacement', () => {
  it('returns 0 when all points are identical between frames', () => {
    const points = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    expect(averageLandmarkDisplacement({ positions: points }, { positions: points })).toBe(0);
  });

  it('averages the per-point euclidean displacement across frames', () => {
    const a = {
      positions: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    };
    const b = {
      positions: [
        { x: 3, y: 4 },
        { x: 0, y: 0 },
      ],
    };
    // point 0 moved distance 5 (3-4-5 triangle), point 1 moved 0 -- average 2.5
    expect(averageLandmarkDisplacement(a, b)).toBe(2.5);
  });
});

describe('checkPoseCompliance', () => {
  // Fixture: left eye at x=60, right eye at x=100 (inter-eye distance 40),
  // eye midpoint x=80. Nose tip at x=80 -> yawRatio 0; at x=60 -> -0.5; at
  // x=100 -> +0.5.

  it('passes TURN_LEFT when the nose swings toward the left edge of frame (yawRatio decreases)', () => {
    const first = fixtureLandmarks(80); // centered
    const last = fixtureLandmarks(60); // yaw -0.5
    expect(checkPoseCompliance(first, last, 'TURN_LEFT')).toBe(true);
  });

  it('passes TURN_RIGHT when the nose swings toward the right edge of frame (yawRatio increases)', () => {
    const first = fixtureLandmarks(80);
    const last = fixtureLandmarks(100); // yaw +0.5
    expect(checkPoseCompliance(first, last, 'TURN_RIGHT')).toBe(true);
  });

  it('fails TURN_LEFT when the nose swings the wrong way (right instead of left)', () => {
    const first = fixtureLandmarks(80);
    const last = fixtureLandmarks(100);
    expect(checkPoseCompliance(first, last, 'TURN_LEFT')).toBe(false);
  });

  it('fails TURN_RIGHT when the nose swings the wrong way (left instead of right)', () => {
    const first = fixtureLandmarks(80);
    const last = fixtureLandmarks(60);
    expect(checkPoseCompliance(first, last, 'TURN_RIGHT')).toBe(false);
  });

  it('fails either direction when there is no meaningful yaw change (e.g. a static/replayed photo)', () => {
    const first = fixtureLandmarks(80);
    const last = fixtureLandmarks(82); // tiny jitter, well under MIN_YAW_SWING
    expect(checkPoseCompliance(first, last, 'TURN_LEFT')).toBe(false);
    expect(checkPoseCompliance(first, last, 'TURN_RIGHT')).toBe(false);
  });
});
