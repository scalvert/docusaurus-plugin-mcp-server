/**
 * The intro's length: seconds before the first scene (oncue's `preRoll`). Build scripts pass it
 * to `v.retime(gaps, { preRoll: INTRO_SECONDS })`; the composition draws the dino in that window.
 * No React here, so build scripts can import it.
 */
export const INTRO_SECONDS = 2.4;
