"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { DeviceStatus } from "@/lib/domain";
import type { LayerRole, SvgPlan } from "@/lib/svg-plan";

/** How an outlet is drawn: as it is, found, on the switch or panel looked at, to check, chosen, or out of the way. */
export type OutletLook = "normal" | "hit" | "group" | "problem" | "selected" | "faded";
export type Outlet3D = { id: number; x: number; y: number; label: string; panel: number | null; panelPort: number | null; switchNo: number | null; switchPort: number | null; look: OutletLook };
export type Unit3D = { kind: "panel" | "switch"; number: number; status?: DeviceStatus | null; picked: boolean };

export type Plan3DProps = {
  model: SvgPlan;
  roles: Record<string, LayerRole>;
  outlets: Outlet3D[];
  /** Where the rack stands, in fractions of the plan. */
  rack: { x: number; y: number } | null;
  units: Unit3D[];
  /** Outlets whose cable is drawn to the rack: the one chosen, or those of the switch or panel looked at. */
  traced: number[];
  view: "3d" | "top";
  /** Network only: everything else faint. */
  focus: boolean;
  placing: boolean;
  /** Brings a point of the plan (fractions) to the middle; a new `n` each time. */
  focusOn: { x: number; y: number; n: number } | null;
  /** Shows the whole plan again; a new number each time. */
  fitRequest: number;
  label: string;
  noWebGl: string;
  onPickOutlet: (id: number) => void;
  onPickUnit: (unit: { kind: "panel" | "switch"; number: number }) => void;
  onPlace: (at: { x: number; y: number }) => void;
};

const COLORS: Record<OutletLook, number> = {
  normal: 0x2563eb,
  hit: 0xdc2626,
  group: 0xf59e0b,
  problem: 0xc026d3,
  selected: 0x16a34a,
  faded: 0xa3acb9,
};
const STATUS: Record<DeviceStatus, number> = { up: 0x16a34a, degraded: 0xf59e0b, down: 0xdc2626, unknown: 0x64748b };
const TRACE = 0xf97316;

/** A word or two drawn on a canvas, as a sprite that always faces the camera, `height` units tall. */
function textSprite(lines: string[], height: number, color = "#1f2937", background: string | null = null) {
  const scale = 4;
  const font = 28 * scale;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `600 ${font}px Arial, Helvetica, sans-serif`;
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + font * 0.6;
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(lines.length * font * 1.15 + font * 0.3);
  if (background) {
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, font * 0.25);
    ctx.fill();
  }
  ctx.font = `600 ${font}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, font * 0.15 + i * font * 1.15));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  const h = height * lines.length;
  sprite.scale.set((h * canvas.width) / canvas.height, h, 1);
  return sprite;
}

function dispose(object: THREE.Object3D) {
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of materials) {
      (m as THREE.SpriteMaterial).map?.dispose();
      m.dispose();
    }
  });
}

/**
 * The floor in 3D, or seen from above: walls raised from the drawing's lines, the rest flat, the
 * outlets as blocks, the server rack with its patch panels and switches, and cables traced from
 * outlets to the rack. Drag to turn (3D) or move (top view); the wheel zooms.
 */
export default function Plan3D(props: Plan3DProps) {
  const host = useRef<HTMLDivElement>(null);
  // Asked once: whether this browser draws WebGL at all (hardware acceleration may be off).
  const [failed] = useState(() => {
    try {
      const canvas = document.createElement("canvas");
      return !(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      return true;
    }
  });
  // The parts of the scene the effects below change, kept between renders.
  const world = useRef<{
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    perspective: THREE.PerspectiveCamera;
    top: THREE.OrthographicCamera;
    orbit: OrbitControls;
    pan: OrbitControls;
    floor: THREE.Mesh;
    faint: THREE.Material[];
    roomLabels: THREE.Sprite[];
    dynamic: THREE.Group;
    outletMesh: THREE.InstancedMesh | null;
    units: { mesh: THREE.Mesh; unit: Unit3D }[];
    goal: { target: THREE.Vector3; until: number } | null;
    size: number;
    wall: number;
  } | null>(null);
  const { model } = props;
  const W = model.width;
  const H = model.height;
  const toWorld = (x: number, y: number) => new THREE.Vector3(x * W - W / 2, 0, y * H - H / 2);

  // The building: made once for a drawing and the layers' roles.
  useEffect(() => {
    const el = host.current;
    if (!el || failed) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xeef1f5);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";

    const size = Math.max(W, H);
    // Walls about as high as a desk is deep is wrong; a twentieth or so of the floor's length looks like an office.
    const wall = Math.max(4, size * 0.032);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(size * 0.4, size, size * 0.6);
    scene.add(sun);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ color: 0xf8fafc }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const faint: THREE.Material[] = [];
    for (const layer of model.layers) {
      const role = props.roles[layer.name] ?? "flat";
      const s = layer.segments;
      if (role === "flat") {
        const points = new Float32Array((s.length / 4) * 6);
        for (let i = 0, k = 0; i < s.length; i += 4, k += 6) {
          points.set([s[i] - W / 2, 0.05, s[i + 1] - H / 2, s[i + 2] - W / 2, 0.05, s[i + 3] - H / 2], k);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
        const material = new THREE.LineBasicMaterial({ color: 0x8b939e, transparent: true });
        faint.push(material);
        scene.add(new THREE.LineSegments(geometry, material));
        continue;
      }
      // Each line raised into a sheet of wall, with its top edge drawn for a crisp outline.
      const height = role === "glass" ? wall * 0.9 : wall;
      const quads = new Float32Array((s.length / 4) * 18);
      const edges = new Float32Array((s.length / 4) * 6);
      for (let i = 0, q = 0, e = 0; i < s.length; i += 4, q += 18, e += 6) {
        const [x1, z1, x2, z2] = [s[i] - W / 2, s[i + 1] - H / 2, s[i + 2] - W / 2, s[i + 3] - H / 2];
        quads.set([x1, 0, z1, x2, 0, z2, x2, height, z2, x1, 0, z1, x2, height, z2, x1, height, z1], q);
        edges.set([x1, height, z1, x2, height, z2], e);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(quads, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshLambertMaterial({
        color: role === "glass" ? 0x93c5fd : 0xd8dde4,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: role !== "glass",
      });
      material.userData.solid = role === "glass" ? 0.35 : 0.92;
      faint.push(material);
      scene.add(new THREE.Mesh(geometry, material));
      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute("position", new THREE.BufferAttribute(edges, 3));
      const edgeMaterial = new THREE.LineBasicMaterial({ color: role === "glass" ? 0x3b82f6 : 0x5b6470, transparent: true });
      faint.push(edgeMaterial);
      scene.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
    }

    const roomLabels = model.rooms.map((r) => {
      const sprite = textSprite([r.text], size * 0.0075, "#475569");
      sprite.position.copy(toWorld(r.x, r.y)).setY(wall * 0.55);
      scene.add(sprite);
      return sprite;
    });

    const dynamic = new THREE.Group();
    scene.add(dynamic);

    const perspective = new THREE.PerspectiveCamera(45, 1, 0.5, size * 20);
    perspective.position.set(size * 0.35, size * 0.7, size * 0.75);
    const top = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, size * 20);
    top.position.set(0, size * 2, 0);
    top.up.set(0, 0, -1);
    top.lookAt(0, 0, 0);

    const orbit = new OrbitControls(perspective, renderer.domElement);
    orbit.enableDamping = true;
    orbit.maxPolarAngle = Math.PI * 0.48;
    orbit.minDistance = size * 0.03;
    orbit.maxDistance = size * 3;
    const pan = new OrbitControls(top, renderer.domElement);
    pan.enableRotate = false;
    pan.screenSpacePanning = true;
    pan.enableDamping = true;
    pan.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    pan.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    pan.minZoom = 0.5;
    pan.maxZoom = 30;

    world.current = { scene, renderer, perspective, top, orbit, pan, floor, faint, roomLabels, dynamic, outletMesh: null, units: [], goal: null, size, wall };

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      perspective.aspect = w / h;
      perspective.updateProjectionMatrix();
      // The top view shows the whole plan at zoom 1, whichever way the space is longer.
      const half = Math.max(H / 2, W / 2 / (w / h)) * 1.05;
      top.left = -half * (w / h);
      top.right = half * (w / h);
      top.top = half;
      top.bottom = -half;
      top.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const w = world.current!;
      const three = w.orbit.enabled;
      const controls = three ? w.orbit : w.pan;
      if (w.goal) {
        const t = controls.target;
        const step = w.goal.target.clone().sub(t).multiplyScalar(0.18);
        t.add(step);
        (three ? w.perspective : w.top).position.add(step);
        if (step.length() < 0.01 || performance.now() > w.goal.until) w.goal = null;
      }
      controls.update();
      renderer.render(scene, three ? perspective : top);
    };
    loop();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      orbit.dispose();
      pan.dispose();
      dispose(scene);
      renderer.dispose();
      renderer.domElement.remove();
      world.current = null;
    };
    // Built again only for another drawing or other layer roles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, props.roles]);

  // 3D or from above.
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    w.orbit.enabled = props.view === "3d";
    w.pan.enabled = props.view === "top";
  }, [props.view, model, props.roles]);

  // Network only: the building faint.
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    for (const m of w.faint) m.opacity = props.focus ? 0.12 : ((m.userData.solid as number | undefined) ?? 1);
    for (const s of w.roomLabels) (s.material as THREE.SpriteMaterial).opacity = props.focus ? 0.25 : 1;
  }, [props.focus, model, props.roles]);

  // The network: outlets, the rack and its panels and switches, the cables traced.
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    dispose(w.dynamic);
    w.dynamic.clear();
    const { size, wall } = w;
    const block = Math.max(1.2, size * 0.008);

    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(block, block * 0.8, block), new THREE.MeshLambertMaterial(), Math.max(1, props.outlets.length));
    mesh.count = props.outlets.length;
    const m = new THREE.Matrix4();
    props.outlets.forEach((o, i) => {
      const p = toWorld(o.x, o.y);
      m.makeTranslation(p.x, block * 0.6, p.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(COLORS[o.look]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    w.dynamic.add(mesh);
    w.outletMesh = mesh;
    // Labels on the outlets that stand out: chosen, found, on the switch or panel looked at, to check.
    const labelled = props.outlets.filter((o) => o.look !== "faded" && o.look !== "normal");
    for (const o of labelled.length > 60 ? [] : labelled) {
      const sprite = textSprite(o.label.split(" / "), block * (props.view === "top" ? 0.9 : 0.6), "#0f172a", "#ffffffee");
      sprite.position.copy(toWorld(o.x, o.y)).setY(block * 2.2);
      sprite.renderOrder = 2;
      w.dynamic.add(sprite);
    }

    // The rack: panels at the top, switches under them, facing the plan's top edge.
    w.units = [];
    if (props.rack) {
      const base = toWorld(props.rack.x, props.rack.y);
      const width = block * 4;
      const depth = block * 2.5;
      const rackHeight = wall * 0.8;
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(width, rackHeight, depth), new THREE.MeshLambertMaterial({ color: 0x1f2937, transparent: true, opacity: 0.55 }));
      cabinet.position.set(base.x, rackHeight / 2, base.z);
      w.dynamic.add(cabinet);
      const slot = Math.min(block * 0.75, (rackHeight * 0.92) / Math.max(1, props.units.length));
      props.units.forEach((unit, i) => {
        const y = rackHeight * 0.96 - slot * (i + 0.5);
        const color = unit.kind === "panel" ? 0xe5e7eb : STATUS[unit.status ?? "unknown"];
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.9, slot * 0.8, depth * 0.3),
          new THREE.MeshLambertMaterial({ color, emissive: unit.picked ? 0xf97316 : 0x000000, emissiveIntensity: 0.6 }),
        );
        slab.position.set(base.x, y, base.z - depth / 2 - depth * 0.1);
        slab.userData.unit = unit;
        w.dynamic.add(slab);
        w.units.push({ mesh: slab, unit });
        const tag = textSprite([`${unit.kind === "panel" ? "P" : "S"}${unit.number}`], slot * 0.6, unit.picked ? "#c2410c" : "#0f172a", "#ffffffdd");
        tag.position.set(base.x - width * 0.5 - tag.scale.x * 0.6, y, base.z - depth / 2);
        w.dynamic.add(tag);
      });
      const title = textSprite(["SERVER RACK"], block * 0.6, "#ffffff", "#1f2937");
      title.position.set(base.x, rackHeight + block, base.z);
      w.dynamic.add(title);

      // Each traced cable: up from the outlet, along the ceiling to the rack, down to its patch
      // panel port, then the patch cord across to its switch port.
      const portAt = (kind: "panel" | "switch", n: number | null, port: number | null) => {
        const u = w.units.find((x) => x.unit.kind === kind && x.unit.number === n);
        if (!u) return null;
        const perRow = 24;
        const k = Math.max(0, (port ?? 1) - 1);
        const across = ((k % perRow) / (perRow - 1) - 0.5) * width * 0.8;
        const row = Math.floor(k / perRow) % 2 === 0 ? 0.18 : -0.18;
        return new THREE.Vector3(base.x + across, u.mesh.position.y + row * slot, u.mesh.position.z - depth * 0.16);
      };
      const ceiling = wall * 0.95;
      const one = props.traced.length === 1;
      for (const id of props.traced) {
        const o = props.outlets.find((x) => x.id === id);
        if (!o) continue;
        const start = toWorld(o.x, o.y).setY(block * 0.6);
        const panelPort = portAt("panel", o.panel, o.panelPort);
        const switchPort = portAt("switch", o.switchNo, o.switchPort);
        const end = panelPort ?? switchPort ?? new THREE.Vector3(base.x, rackHeight, base.z);
        const front = base.z - depth / 2 - block * 1.2;
        const points = [start, start.clone().setY(ceiling), new THREE.Vector3(start.x, ceiling, front), new THREE.Vector3(end.x, ceiling, front), new THREE.Vector3(end.x, end.y, front), end];
        const path = new THREE.CurvePath<THREE.Vector3>();
        for (let i = 1; i < points.length; i++) if (!points[i].equals(points[i - 1])) path.add(new THREE.LineCurve3(points[i - 1], points[i]));
        const radius = one ? block * 0.18 : block * 0.09;
        const tube = new THREE.Mesh(new THREE.TubeGeometry(path, 64, radius, 6, false), new THREE.MeshBasicMaterial({ color: one ? TRACE : 0xfbbf24 }));
        w.dynamic.add(tube);
        if (panelPort && switchPort) {
          const mid = panelPort.clone().lerp(switchPort, 0.5).setZ(front - block * 0.8);
          const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(panelPort, mid, switchPort), 24, radius * 0.8, 6, false), new THREE.MeshBasicMaterial({ color: 0x2563eb }));
          w.dynamic.add(cord);
        }
        if (one) {
          for (const p of [panelPort, switchPort]) {
            if (!p) continue;
            const dot = new THREE.Mesh(new THREE.SphereGeometry(radius * 2, 12, 8), new THREE.MeshBasicMaterial({ color: TRACE }));
            dot.position.copy(p);
            w.dynamic.add(dot);
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.outlets, props.rack, props.units, props.traced, props.view, model, props.roles]);

  // A point brought to the middle, closer in.
  useEffect(() => {
    const w = world.current;
    if (!w || !props.focusOn) return;
    w.goal = { target: toWorld(props.focusOn.x, props.focusOn.y), until: performance.now() + 1500 };
    if (props.view === "top") {
      w.top.zoom = Math.max(w.top.zoom, 4);
      w.top.updateProjectionMatrix();
    } else {
      const offset = w.perspective.position.clone().sub(w.orbit.target);
      if (offset.length() > w.size * 0.35) w.perspective.position.copy(w.orbit.target).add(offset.setLength(w.size * 0.35));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusOn]);

  // The part of the floor with outlets (the office, not the whole building), as large as fits.
  const frame = useEffectEvent(() => {
    const w = world.current;
    if (!w) return;
    const xs = props.outlets.map((o) => o.x);
    const ys = props.outlets.map((o) => o.y);
    const [x0, x1, y0, y1] = xs.length ? [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] : [0, 1, 0, 1];
    const centre = toWorld((x0 + x1) / 2, (y0 + y1) / 2);
    const span = Math.max((x1 - x0) * W, (y1 - y0) * H, w.size * 0.15);
    w.goal = null;
    w.orbit.target.copy(centre);
    w.perspective.position.copy(centre).add(new THREE.Vector3(0.45, 0.75, 0.6).setLength(span * 1.05));
    w.pan.target.copy(centre);
    w.top.position.set(centre.x, w.size * 2, centre.z);
    // At zoom 1 the top view holds the whole plan; closer in, just the outlets with a margin.
    const across = ((x1 - x0) * W) / (w.top.right - w.top.left);
    const down = ((y1 - y0) * H) / (w.top.top - w.top.bottom);
    w.top.zoom = Math.min(30, Math.max(1, 0.9 / Math.max(across, down, 0.01)));
    w.top.updateProjectionMatrix();
  });
  useEffect(() => {
    frame();
  }, [props.fitRequest, model, props.roles]);

  // A click (not a drag): an outlet, a panel or switch, or with `placing`, the spot on the floor.
  const pick = useEffectEvent((e: PointerEvent) => {
    const w = world.current;
    if (!w) return;
    const rect = w.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, props.view === "3d" ? w.perspective : w.top);
    if (props.placing) {
      const [hit] = ray.intersectObject(w.floor);
      if (hit) props.onPlace({ x: Math.min(1, Math.max(0, (hit.point.x + W / 2) / W)), y: Math.min(1, Math.max(0, (hit.point.z + H / 2) / H)) });
      return;
    }
    const unit = ray.intersectObjects(w.units.map((u) => u.mesh))[0];
    const outlet = w.outletMesh ? ray.intersectObject(w.outletMesh)[0] : undefined;
    if (unit && (!outlet || unit.distance < outlet.distance)) {
      const u = unit.object.userData.unit as Unit3D;
      props.onPickUnit({ kind: u.kind, number: u.number });
    } else if (outlet?.instanceId !== undefined) props.onPickOutlet(props.outlets[outlet.instanceId].id);
  });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let down: { x: number; y: number } | null = null;
    const press = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const release = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && e.button === 0) pick(e);
      down = null;
    };
    el.addEventListener("pointerdown", press);
    el.addEventListener("pointerup", release);
    return () => {
      el.removeEventListener("pointerdown", press);
      el.removeEventListener("pointerup", release);
    };
  }, []);

  if (failed) return <p className="grid h-[70vh] place-items-center rounded-xl border bg-muted/40 p-6 text-center text-sm text-muted-foreground">{props.noWebGl}</p>;
  return (
    <div
      ref={host}
      role="img"
      aria-label={props.label}
      data-plan-3d
      className={props.placing ? "h-[70vh] cursor-crosshair overflow-hidden rounded-xl border" : "h-[70vh] cursor-grab overflow-hidden rounded-xl border active:cursor-grabbing"}
    />
  );
}
