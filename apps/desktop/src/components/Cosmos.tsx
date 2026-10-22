import { useEffect, useRef } from "react";

/** Céu de fundo: estrelas pintadas em canvas, nebulosas em CSS e grão de filme. */
export function Cosmos() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      // pseudo-aleatório determinístico: o céu não "pula" a cada resize
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      const count = Math.round((w * h) / 2600);
      for (let i = 0; i < count; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = rnd() ** 3 * 1.4 + 0.25;
        const warm = rnd();
        const color = warm > 0.85 ? "255, 214, 160" : warm > 0.7 ? "170, 210, 255" : "255, 248, 235";
        ctx.fillStyle = `rgba(${color}, ${0.25 + rnd() * 0.6})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // estrelas de quatro pontas — as "faíscas" das ilustrações antigas
      for (let i = 0; i < Math.round(count / 90); i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const s = 3 + rnd() * 7;
        const g = ctx.createRadialGradient(x, y, 0, x, y, s * 1.6);
        g.addColorStop(0, "rgba(255, 244, 214, 0.9)");
        g.addColorStop(1, "rgba(255, 244, 214, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, y - s * 1.6);
        ctx.quadraticCurveTo(x, y, x + s, y);
        ctx.quadraticCurveTo(x, y, x, y + s * 1.6);
        ctx.quadraticCurveTo(x, y, x - s, y);
        ctx.quadraticCurveTo(x, y, x, y - s * 1.6);
        ctx.fill();
      }
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);

  return (
    <div className="cosmos" aria-hidden>
      <div className="cosmos-nebula" />
      <canvas ref={ref} className="cosmos-stars" />
      <div className="cosmos-twinkle" />
      <div className="cosmos-grain" />
    </div>
  );
}
