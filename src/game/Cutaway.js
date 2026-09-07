import * as THREE from 'three';

/**
 * Dissolves rock that sits between the camera and the player.
 *
 * An isometric camera with 3-unit walls hides the character constantly - he
 * walks behind a wall and simply vanishes. Rather than shorten the walls (which
 * would ruin the cavern silhouette) we punch a soft hole through anything
 * nearer the camera than the player and close to him on screen.
 *
 * The hole is DITHERED rather than alpha-blended: a screen-door discard needs
 * no transparency sorting, so it cannot produce the depth artefacts that
 * blending a big merged rock mesh against itself would.
 */
const uniforms = {
  uFocusView: { value: new THREE.Vector3(0, 0, -1) },
  // roughly the player's on-screen silhouette. Wider than this and the hole
  // becomes a window into unlit void, which is worse than the occlusion it fixes
  uCutRadius: { value: 1.5 },
  uCutStrength: { value: 1.0 },
};

export function cutawayUniforms() {
  return uniforms;
}

export function applyCutaway(material) {
  if (material.userData.__cutaway) return material;
  material.userData.__cutaway = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFocusView = uniforms.uFocusView;
    shader.uniforms.uCutRadius = uniforms.uCutRadius;
    shader.uniforms.uCutStrength = uniforms.uCutStrength;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutView;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vCutView = mvPosition.xyz;',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCutView;
uniform vec3 uFocusView;
uniform float uCutRadius;
uniform float uCutStrength;
// 4x4 ordered dither - stable under camera motion, unlike hashed noise
float cutBayer(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16];
  m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
  m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
  m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
  m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
  for (int k = 0; k < 16; k++) if (k == i) return (m[k] + 0.5) / 16.0;
  return 0.5;
}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
  // view space: z increases toward the camera, so > means "in front of him"
  // the +0.6 bias stops rock level with the player being chewed away when it
  // was never occluding him in the first place
  if (vCutView.z > uFocusView.z + 0.6) {
    float r = length(vCutView.xy - uFocusView.xy);
    // A NARROW transition band. At 0.72 the dithered ring was ~0.4 units wide
    // and read as a field of speckle rather than a soft edge.
    float f = (1.0 - smoothstep(uCutRadius * 0.88, uCutRadius, r)) * uCutStrength;
    if (f > cutBayer(gl_FragCoord.xy)) discard;
  }`,
      );
  };
  material.needsUpdate = true;
  return material;
}

/** Call once per frame, after the camera matrices are up to date. */
/**
 * Ramp the dissolve in and out. Driven by whether the player is genuinely
 * hidden, so standing NEXT to a wall - nearer the camera, but not actually
 * occluding him - no longer punches a hole in it.
 */
export function setCutawayActive(active, dt) {
  const target = active ? 1 : 0;
  const u = uniforms.uCutStrength;
  u.value += (target - u.value) * Math.min(1, dt * (active ? 9 : 5));
  if (u.value < 0.002) u.value = 0;
  return u.value;
}

export function updateCutaway(camera, playerWorldPos, yLift = 0) {
  uniforms.uFocusView.value
    .set(playerWorldPos.x, playerWorldPos.y + yLift, playerWorldPos.z)
    .applyMatrix4(camera.matrixWorldInverse);
}
