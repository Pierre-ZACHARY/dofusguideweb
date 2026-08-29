import { ImageResponse } from "@cloudflare/pages-plugin-vercel-og/api";
import { parseSharedProfileImageData } from "./sharedProfileImageData.js";

export function sharedProfileImageResponse(request: Request): Response {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const data = parseSharedProfileImageData(request);
  if (data === null) return new Response("Invalid shared profile image", { status: 400 });
  const percent = Math.min(100, Math.round((data.completed / data.total) * 100));
  const identity = data.level === null
    ? `${data.className} · ${data.server}`
    : `${data.className} · ${data.server} · niveau ${data.level}`;
  const success = data.success === null ? "Succès indisponibles" : `${data.success.toLocaleString("fr-FR")} points de succès`;

  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", padding: "54px 64px", color: "#2b1638", background: "linear-gradient(135deg, #fffaf5 0%, #f6eee9 62%, #dffbf5 100%)", fontFamily: "Noto Sans", position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <img src={data.avatar} width="116" height="116" style={{ borderRadius: "30px", border: "5px solid #14d8c4", background: "#ffffff", objectFit: "contain" }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: "48px", fontWeight: 800, lineHeight: 1.05 }}>{data.name}</div>
              <div style={{ display: "flex", marginTop: "10px", fontSize: "24px", color: "#715f76" }}>{identity}</div>
              <div style={{ display: "flex", marginTop: "5px", fontSize: "22px", color: "#715f76" }}>{success}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "25px", fontWeight: 700 }}>
            <span style={{ color: "#14bfae" }}>DofusGuide</span>
            <span style={{ display: "flex", padding: "5px 12px", border: "3px solid #14d8c4", borderRadius: "999px", color: "#14bfae", fontSize: "18px" }}>WEB</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "42px", padding: "28px 32px", borderRadius: "28px", background: "rgba(255,255,255,0.82)", border: "2px solid rgba(43,22,56,0.10)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: "20px", color: "#715f76" }}>Progression dans le guide principal</div>
              <div style={{ display: "flex", marginTop: "5px", fontSize: "34px", fontWeight: 750 }}>Étape {data.step} sur {data.total}</div>
            </div>
            <div style={{ display: "flex", padding: "10px 18px", borderRadius: "999px", background: "#dffbf5", color: "#0d887d", fontSize: "22px", fontWeight: 700 }}>{percent} %</div>
          </div>
          <div style={{ display: "flex", width: "100%", height: "18px", marginTop: "20px", borderRadius: "999px", background: "#dfd4df", overflow: "hidden" }}>
            <div style={{ display: "flex", width: `${percent}%`, height: "100%", borderRadius: "999px", background: "linear-gradient(90deg, #14d8c4, #ec86bd)" }} />
          </div>
          <div style={{ display: "flex", marginTop: "13px", fontSize: "20px", color: "#715f76" }}>{data.chapter}</div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", marginTop: "25px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: "19px", color: "#715f76", textTransform: "uppercase", letterSpacing: "1px" }}>{data.boss === null ? "Progression" : "Prochain boss"}</div>
            <div style={{ display: "flex", marginTop: "5px", fontSize: "31px", fontWeight: 750 }}>{data.boss ?? "Guide terminé"}</div>
            {data.dungeon === null ? null : <div style={{ display: "flex", marginTop: "4px", fontSize: "20px", color: "#715f76" }}>{data.dungeon}</div>}
          </div>
          {data.bossImage === null ? null : <img src={data.bossImage} width="112" height="112" style={{ objectFit: "contain" }} />}
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
        "Content-Disposition": "inline; filename=profil-dofusguide.png",
        "X-Content-Type-Options": "nosniff",
      },
    },
  ) as unknown as Response;
}
