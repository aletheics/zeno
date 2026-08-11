import { useEffect, useRef, useState } from "react";
import { SkyCanvas } from "./SkyCanvas.tsx";

/**
 * Hero backdrop stack (top of page):
 * 1. static atmosphere image (object-top)
 * 2. WebGL mist over the upper sky (premultiplied alpha)
 * 3. bottom gradient into page background
 *
 * Outer shell is h-[70rem]; inner fades in over 700ms after the image is ready.
 */
export function HeroAtmosphere() {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70rem]"
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          opacity: loaded ? 1 : 0,
          transition: "opacity 700ms ease-out",
        }}
      >
        <img
          ref={imgRef}
          src="/hero-garden.webp"
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority="high"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        {/* Mist sits above the image; production class: absolute inset-0 + h/w full from base */}
        <SkyCanvas mode="mist" className="absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>
    </div>
  );
}
