// Physics tuning constants

export interface PhysicsTune {
  baseFriction: number;
  pebbleFrictionBonus: number;
  curlCoeff: number;
  gradientCoeff: number;
  slopeGravity: number;
  frictionDecel: number;
  speedScale: number;
  wearRate: number;
  sweepBoost: number;
}

export const DEFAULTS: PhysicsTune = {
  baseFriction: 0.08,
  pebbleFrictionBonus: 0.07,
  curlCoeff: 40,
  gradientCoeff: 8,
  slopeGravity: 18,
  frictionDecel: 5,
  speedScale: 60,
  wearRate: 0.0015,
  sweepBoost: 0.15,
};
