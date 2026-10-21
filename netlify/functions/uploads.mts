import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Serves item photos uploaded through the Sell form (stored in Netlify Blobs)
export default async (_req: Request, context: Context) => {
  const key = context.params.key;
  const result = await getStore("uploads").getWithMetadata(key, { type: "arrayBuffer" });
  if (!result) return new Response("Not found", { status: 404 });

  return new Response(result.data, {
    headers: {
      "Content-Type": (result.metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};

export const config: Config = {
  path: "/uploads/:key",
};
