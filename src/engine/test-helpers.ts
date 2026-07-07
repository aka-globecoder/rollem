import type { Rng } from './dice';

/**
 * An rng that produces exactly the given die faces, in order. Throws if the
 * game asks for more dice than scripted — a scripted test should account for
 * every roll it triggers.
 */
export function riggedRng(faces: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= faces.length) throw new Error(`rigged rng exhausted after ${faces.length} dice`);
    const face = faces[i++];
    return (face - 0.5) / 6;
  };
}
