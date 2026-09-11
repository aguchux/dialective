import { averageLandmarkDisplacement, landmarkBoundingBoxArea } from './face-match.service';

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
    const points = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
    expect(averageLandmarkDisplacement({ positions: points }, { positions: points })).toBe(0);
  });

  it('averages the per-point euclidean displacement across frames', () => {
    const a = { positions: [{ x: 0, y: 0 }, { x: 0, y: 0 }] };
    const b = { positions: [{ x: 3, y: 4 }, { x: 0, y: 0 }] };
    // point 0 moved distance 5 (3-4-5 triangle), point 1 moved 0 -- average 2.5
    expect(averageLandmarkDisplacement(a, b)).toBe(2.5);
  });
});
