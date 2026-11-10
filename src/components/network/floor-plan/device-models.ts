import * as THREE from "three";
import type { DeviceKind } from "@/lib/plan-devices";

/**
 * The assets on the 3D plan, each a small model of what it is, made of plain shapes: a laptop open
 * on a desk, a tower and monitor, a TV on its stand, a server, a printer, an access point on the
 * ceiling, a camera on the wall. `u` is a metre in the drawing's units; `ceiling` the walls' height.
 */

const COLOR = {
  desk: 0xc8a97e,
  deskLeg: 0x6b7280,
  body: 0x374151,
  dark: 0x1f2937,
  light: 0xe5e7eb,
  white: 0xf8fafc,
  screen: 0x60a5fa,
  led: 0x22c55e,
  firewall: 0xb91c1c,
  ups: 0x111827,
};

type Kit = { box: (w: number, h: number, d: number, color: number, at: [number, number, number], glow?: boolean) => THREE.Mesh; group: THREE.Group; u: number };

function kit(u: number): Kit {
  const group = new THREE.Group();
  const box: Kit["box"] = (w, h, d, color, [x, y, z], glow = false) => {
    const material = new THREE.MeshLambertMaterial({ color, emissive: glow ? color : 0x000000, emissiveIntensity: glow ? 0.55 : 0 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * u, h * u, d * u), material);
    mesh.position.set(x * u, y * u, z * u);
    group.add(mesh);
    return mesh;
  };
  return { box, group, u };
}

/** A desk, 1.2 m by 0.6, its top at 0.74 m. */
function desk({ box }: Kit, width = 1.2) {
  box(width, 0.04, 0.6, COLOR.desk, [0, 0.74, 0]);
  for (const x of [-1, 1]) for (const z of [-1, 1]) box(0.04, 0.72, 0.04, COLOR.deskLeg, [x * (width / 2 - 0.05), 0.36, z * 0.25]);
}

/** A screen facing the plan's bottom edge (+z), `w` metres wide, its bottom edge at `y`. */
function screen({ box }: Kit, w: number, h: number, y: number, z = 0) {
  box(w + 0.03, h + 0.03, 0.03, COLOR.dark, [0, y + h / 2, z]);
  box(w, h, 0.005, COLOR.screen, [0, y + h / 2, z + 0.018], true);
}

const BUILD: Record<DeviceKind, (k: Kit, opts: { ceiling: number; screenInches: number | null }) => void> = {
  laptop: (k) => {
    desk(k);
    k.box(0.34, 0.02, 0.24, COLOR.body, [0, 0.77, 0.05]);
    // The lid, open and leaning back a little.
    const lid = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.34 * k.u, 0.23 * k.u, 0.012 * k.u), new THREE.MeshLambertMaterial({ color: COLOR.body }));
    back.position.set(0, 0.115 * k.u, 0);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.31 * k.u, 0.2 * k.u, 0.002 * k.u), new THREE.MeshLambertMaterial({ color: COLOR.screen, emissive: COLOR.screen, emissiveIntensity: 0.55 }));
    face.position.set(0, 0.115 * k.u, 0.008 * k.u);
    lid.add(back, face);
    lid.position.set(0, 0.78 * k.u, -0.07 * k.u);
    lid.rotation.x = -0.25;
    k.group.add(lid);
  },
  desktop: (k) => {
    desk(k);
    screen(k, 0.55, 0.32, 0.88, -0.12);
    k.box(0.04, 0.12, 0.04, COLOR.dark, [0, 0.82, -0.14]);
    k.box(0.22, 0.01, 0.16, COLOR.dark, [0, 0.765, -0.14]);
    k.box(0.44, 0.02, 0.14, COLOR.light, [0, 0.77, 0.12]);
    // The tower, on the floor beside the desk.
    k.box(0.2, 0.44, 0.44, COLOR.body, [0.45, 0.22, 0]);
    k.box(0.02, 0.02, 0.01, COLOR.led, [0.45, 0.38, 0.225], true);
  },
  monitor: (k, { screenInches }) => {
    desk(k);
    const w = Math.min(1, Math.max(0.4, (screenInches ?? 24) * 0.0254 * 0.87));
    screen(k, w, w * 0.56, 0.9, -0.1);
    k.box(0.05, 0.14, 0.05, COLOR.dark, [0, 0.83, -0.12]);
    k.box(0.25, 0.01, 0.18, COLOR.dark, [0, 0.765, -0.12]);
  },
  tv: (k, { screenInches }) => {
    const w = Math.min(2.2, Math.max(0.9, (screenInches ?? 65) * 0.0254 * 0.87));
    // A low cabinet with the TV on its stand above.
    k.box(w * 0.9, 0.5, 0.4, COLOR.light, [0, 0.25, 0]);
    k.box(0.1, 0.3, 0.1, COLOR.dark, [0, 0.65, -0.05]);
    screen(k, w, w * 0.56, 0.8, -0.05);
  },
  server: (k) => {
    // A rack server's cabinet: dark, with drive bays and lights in front.
    k.box(0.6, 1.0, 0.9, COLOR.dark, [0, 0.5, 0]);
    for (let i = 0; i < 4; i++) {
      k.box(0.5, 0.12, 0.01, COLOR.body, [0, 0.25 + i * 0.2, 0.455]);
      k.box(0.03, 0.03, 0.01, COLOR.led, [0.2, 0.25 + i * 0.2, 0.462], true);
    }
  },
  network: (k) => {
    // A wall cabinet with a switch in it: ports along its front.
    k.box(0.6, 0.6, 0.5, COLOR.dark, [0, 1.6, 0]);
    k.box(0.5, 0.06, 0.02, COLOR.light, [0, 1.6, 0.26]);
    for (let i = 0; i < 8; i++) k.box(0.03, 0.02, 0.01, COLOR.led, [-0.2 + i * 0.057, 1.6, 0.272], true);
  },
  router: (k) => {
    k.box(0.35, 0.06, 0.25, COLOR.dark, [0, 1.2, 0]);
    k.box(0.4, 0.02, 0.3, COLOR.light, [0, 1.16, 0]);
    for (const x of [-0.12, 0.12]) k.box(0.015, 0.2, 0.015, COLOR.dark, [x, 1.33, -0.1]);
    k.box(0.02, 0.02, 0.01, COLOR.led, [0.12, 1.2, 0.13], true);
  },
  firewall: (k) => {
    k.box(0.44, 0.09, 0.35, COLOR.firewall, [0, 1.2, 0]);
    k.box(0.4, 0.02, 0.33, COLOR.light, [0, 1.145, 0]);
    k.box(0.3, 0.02, 0.01, COLOR.led, [0, 1.2, 0.18], true);
  },
  accessPoint: (k, { ceiling }) => {
    const top = ceiling / k.u;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * k.u, 0.15 * k.u, 0.04 * k.u, 24), new THREE.MeshLambertMaterial({ color: COLOR.white }));
    disc.position.set(0, (top - 0.04) * k.u, 0);
    const led = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * k.u, 0.02 * k.u, 0.01 * k.u, 12), new THREE.MeshLambertMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.8 }));
    led.position.set(0, (top - 0.065) * k.u, 0);
    k.group.add(disc, led);
  },
  printer: (k) => {
    k.box(0.55, 0.6, 0.5, COLOR.light, [0, 0.3, 0]);
    k.box(0.5, 0.3, 0.45, COLOR.white, [0, 0.75, 0]);
    k.box(0.36, 0.02, 0.16, COLOR.body, [0, 0.91, 0.12]);
    k.box(0.12, 0.04, 0.01, COLOR.screen, [0.15, 0.82, 0.23], true);
  },
  camera: (k, { ceiling }) => {
    const top = Math.min(2.6, ceiling / k.u - 0.15);
    k.box(0.06, 0.06, 0.12, COLOR.light, [0, top, -0.1]);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * k.u, 0.05 * k.u, 0.22 * k.u, 16), new THREE.MeshLambertMaterial({ color: COLOR.white }));
    body.rotation.x = Math.PI / 2 - 0.35;
    body.position.set(0, (top - 0.05) * k.u, 0.02 * k.u);
    k.group.add(body);
    k.box(0.04, 0.04, 0.01, COLOR.dark, [0, top - 0.09, 0.13]);
  },
  phone: (k) => {
    desk(k, 0.8);
    k.box(0.2, 0.05, 0.18, COLOR.dark, [0, 0.785, 0]);
    k.box(0.07, 0.04, 0.2, COLOR.body, [-0.07, 0.825, 0]);
    k.box(0.08, 0.005, 0.05, COLOR.screen, [0.04, 0.812, -0.03], true);
  },
  ups: (k) => {
    k.box(0.2, 0.42, 0.45, COLOR.ups, [0, 0.21, 0]);
    k.box(0.08, 0.04, 0.01, COLOR.led, [0, 0.33, 0.226], true);
  },
  storage: (k) => {
    k.box(0.5, 0.75, 0.5, COLOR.light, [0, 0.375, 0]);
    k.box(0.32, 0.26, 0.3, COLOR.dark, [0, 0.88, 0]);
    for (let i = 0; i < 4; i++) k.box(0.06, 0.2, 0.01, COLOR.body, [-0.11 + i * 0.075, 0.88, 0.152]);
    k.box(0.02, 0.02, 0.01, COLOR.led, [0.13, 0.98, 0.156], true);
  },
  other: (k) => {
    k.box(0.4, 0.4, 0.4, COLOR.body, [0, 0.2, 0]);
  },
};

/** The status ring's colours: monitored and up, slow, down; not monitored; in repair. */
export const RING = { up: 0x16a34a, degraded: 0xf59e0b, down: 0xdc2626, unknown: 0x64748b, none: 0x2563eb, repair: 0xea580c } as const;
export type RingColor = keyof typeof RING;

/**
 * A device's model, standing on the floor at the group's origin, with a ring under it in the colour
 * of its status. `scale` enlarges it, so a laptop is still seen with the whole floor in view.
 */
export function deviceModel(kind: DeviceKind, opts: { u: number; ceiling: number; screenInches: number | null; ring: RingColor; picked: boolean; faded: boolean }) {
  const k = kit(opts.u);
  BUILD[kind](k, opts);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62 * opts.u, (opts.picked ? 0.85 : 0.74) * opts.u, 40),
    new THREE.MeshBasicMaterial({ color: RING[opts.ring], side: THREE.DoubleSide, transparent: true, opacity: opts.faded ? 0.25 : 0.9 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08 * opts.u;
  k.group.add(ring);
  // A disc in the ring, for the device to be clicked from above or far away.
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.62 * opts.u, 32), new THREE.MeshBasicMaterial({ color: RING[opts.ring], transparent: true, opacity: opts.picked ? 0.35 : 0.12, depthWrite: false }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.07 * opts.u;
  k.group.add(pad);
  if (opts.faded) {
    k.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && o !== ring) {
        m.transparent = true;
        m.opacity = Math.min(m.opacity, 0.3);
      }
    });
  }
  return k.group;
}
