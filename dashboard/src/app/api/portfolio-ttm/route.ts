import { NextRequest } from "next/server";
import { cachedJson } from "@/lib/appfolio";
import { buildPortfolioSeries, MIRROR_CHECK_FROM } from "@/lib/portfolio-series";

export const maxDuration = 60;

/**
 * Monthly Owner Net Income series for the combined Executive Overview chart.
 * Always trailing months, independent of the page period selector.
 * Returns 24 months of history so the client can compute a TTM line where a
 * full 12-month window exists.
 */
export async function GET(request: NextRequest) {
  try {
    const joeView = request.nextUrl.searchParams.get("view") === "joe";
    const series = await buildPortfolioSeries(24, joeView);

    const mirrorWarn = series.mirror.some(
      (m) =>
        m.month >= MIRROR_CHECK_FROM &&
        Math.abs(m.variance) > 500 &&
        (m.big5820 !== 0 || m.jrwFee !== 0)
    );

    return cachedJson({
      months: series.months,
      entities: {
        jrw: series.jrw,
        big: series.big,
        hotel: series.hotel,
        pvshm: series.pvshm,
      },
      mirror: series.mirror,
      mirrorWarn,
      ownershipView: joeView,
    });
  } catch (err) {
    console.error("Portfolio TTM error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
