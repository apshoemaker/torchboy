import * as THREE from 'three';

/**
 * Orthographic isometric camera with damped follow.
 *
 * The azimuth is fixed, so input has to be rotated into camera space or "up"
 * on the keyboard would not be "up" on screen. basis() exposes that rotation.
 */
export class IsoCamera {
  constructor(
    aspect,
    { viewSize = 20, azimuth = Math.PI / 4, elevation = 0.66 } = {},
  ) {
    this.viewSize = viewSize;
    this.azimuth = azimuth;
    this.targetAzimuth = azimuth; // orbit target; the camera eases toward it
    this.elevation = elevation;
    // Ortho scale is set by the frustum, but this distance still decides how
    // far every fragment is from the camera - which is what fog reads. Keep it
    // modest so linear fog has a usable range across the visible depth.
    this.distance = 42;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 160);
    this.target = new THREE.Vector3();
    this.current = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this._applyAzimuth();
    this.resize(aspect);
  }

  _applyAzimuth() {
    const c = Math.cos(this.elevation);
    this.offset
      .set(
        c * Math.cos(this.azimuth),
        Math.sin(this.elevation),
        c * Math.sin(this.azimuth),
      )
      .multiplyScalar(this.distance);
  }

  /** Pivot the view around the player. `basis()` reads the offset, so the
   *  movement controls rotate with the camera and stay screen-relative. */
  orbit(radians) {
    this.targetAzimuth += radians;
  }

  resize(aspect) {
    const h = this.viewSize / 2,
      w = h * aspect;
    const c = this.camera;
    c.left = -w;
    c.right = w;
    c.top = h;
    c.bottom = -h;
    c.updateProjectionMatrix();
  }

  setZoom(viewSize, aspect) {
    this.viewSize = viewSize;
    this.resize(aspect);
  }

  /** Screen-relative movement basis on the XZ plane. */
  basis() {
    const fwd = new THREE.Vector3(
      -this.offset.x,
      0,
      -this.offset.z,
    ).normalize();
    const right = new THREE.Vector3()
      .crossVectors(fwd, new THREE.Vector3(0, 1, 0))
      .normalize();
    return { fwd, right };
  }

  follow(pos, dt, snap = false) {
    this.target.copy(pos);
    // frame-rate independent damping
    const k = snap ? 1 : 1 - Math.exp(-6.5 * dt);
    if (snap) {
      this.azimuth = this.targetAzimuth;
    } else if (Math.abs(this.targetAzimuth - this.azimuth) > 1e-5) {
      // eased, so a flick of the mouse swings round rather than snapping
      this.azimuth +=
        (this.targetAzimuth - this.azimuth) * (1 - Math.exp(-11 * dt));
    }
    this._applyAzimuth();
    this.current.lerp(this.target, k);
    if (snap) this.current.copy(this.target);
    this.camera.position.copy(this.current).add(this.offset);
    this.camera.lookAt(this.current);
  }
}
