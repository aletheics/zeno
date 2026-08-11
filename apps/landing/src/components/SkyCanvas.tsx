import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils.ts";

type SkyCanvasProps = {
  /** `mist` = translucent drifting fog. `sky` = opaque night sky + clouds. */
  mode?: "mist" | "sky";
  className?: string;
};

const COMMON = /* glsl */ `
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) {
      v += amp * noise(p);
      p = m * p;
      amp *= 0.5;
    }
    return v;
  }
`;

const SKY_FRAG = /* glsl */ `${COMMON}
  const vec3 BG = vec3(0.028, 0.027, 0.040);
  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float t = u_time * 0.035;

    vec3 col = mix(BG, vec3(0.04, 0.075, 0.18), smoothstep(0.0, 1.0, uv.y));

    float clouds = fbm(p * 2.2 + vec2(t * 1.4, t * 0.4)) * 0.65
                 + fbm(p * 5.5 - vec2(t * 0.7, t * 0.2)) * 0.35;
    col += vec3(0.10, 0.17, 0.34) * clouds * smoothstep(0.15, 1.0, uv.y);

    vec3 blue   = vec3(0.24, 0.46, 0.96);
    vec3 cyan   = vec3(0.20, 0.72, 0.90);
    vec3 violet = vec3(0.46, 0.30, 0.94);
    vec3 auroraCol = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float speed = 0.7 + fi * 0.28;
      float yPos = 0.74 + fi * 0.11;
      float wave = fbm(vec2(p.x * 1.6 + t * speed, t * 0.4 + fi * 10.0)) * 0.4;
      float band = uv.y - (yPos + wave - 0.12);
      float intensity = exp(-band * band * (28.0 - fi * 6.0));
      float flow = fbm(vec2(p.x * 3.0 - t * speed * 2.0, uv.y * 4.0 + t)) * 0.6 + 0.4;
      float mv = fbm(vec2(p.x * 2.0 + t, fi * 5.0));
      vec3 c = mix(blue, cyan, smoothstep(0.3, 0.7, mv));
      c = mix(c, violet, smoothstep(0.72, 1.0, mv) * 0.6);
      auroraCol += c * intensity * flow * (0.72 - fi * 0.14);
    }
    col += auroraCol * 0.85;
    col += (hash(gl_FragCoord.xy + t * 120.0) - 0.5) * 0.05;
    col = mix(BG, col, smoothstep(0.0, 0.35, uv.y));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const MIST_FRAG = /* glsl */ `${COMMON}
  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float t = u_time * 0.06;

    // Two fog layers drifting sideways at different scales/speeds —
    // fast enough that the motion clearly reads.
    float fog = fbm(p * 1.8 + vec2(t * 2.6, t * 0.5)) * 0.6
              + fbm(p * 4.0 - vec2(t * 1.6, t * 0.3)) * 0.4;
    fog = smoothstep(0.28, 0.95, fog);

    // Confined to the upper sky and fading out higher up, so it dissolves
    // into the scene rather than hanging as a band.
    float envelope = smoothstep(0.45, 0.95, uv.y);
    float a = fog * envelope * 0.4;

    // Cool blue-grey fog with a faint warm lift from the noise peaks.
    vec3 cool = vec3(0.70, 0.78, 0.94);
    vec3 warm = vec3(0.86, 0.80, 0.86);
    vec3 mistCol = mix(cool, warm, fog * 0.4);

    // Premultiplied alpha: colour scaled by coverage.
    gl_FragColor = vec4(mistCol * a, a);
  }
`;

const VERT = /* glsl */ `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/**
 * WebGL sky/mist layer.
 * Mist uses premultiplied alpha so it composites cleanly over the hero image.
 */
export function SkyCanvas({ mode = "mist", className }: SkyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const isMist = mode === "mist";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: isMist,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, isMist ? MIST_FRAG : SKY_FRAG);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // Fullscreen triangle
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    if (isMist) {
      gl.clearColor(0, 0, 0, 0);
      // Premultiplied alpha blending into the drawing buffer.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const dprCap = Math.min(window.devicePixelRatio || 1, 2);

    let lastMs = 0;
    let first = false;

    const draw = (ms: number) => {
      lastMs = ms;
      if (isMist) gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, ms / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!first) {
        first = true;
        setReady(true);
      }
    };

    const resize = () => {
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW < 1 || cssH < 1) return;
      const w = Math.max(1, Math.floor(cssW * dprCap));
      const h = Math.max(1, Math.floor(cssH * dprCap));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      // Keep a frame on screen after size changes (before next rAF).
      draw(lastMs);
    };

    // Layout may not be ready on the first tick — retry once via rAF.
    resize();
    requestAnimationFrame(resize);

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      draw(0);
      return () => {
        ro.disconnect();
        gl.deleteProgram(program);
      };
    }

    let raf = 0;
    let running = false;
    let t0 = 0;

    const tick = (now: number) => {
      if (!running) return;
      if (!t0) t0 = now;
      draw(now - t0);
      raf = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const start = () => {
      if (running || document.hidden) return;
      running = true;
      t0 = 0;
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) start();
        else stop();
      },
      { threshold: 0 },
    );
    io.observe(canvas);
    start();

    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      gl.deleteProgram(program);
    };
  }, [isMist]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        // Match production base utilities (h/w full; callers may override height).
        "pointer-events-none block h-full w-full transition-opacity duration-700 ease-out",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
