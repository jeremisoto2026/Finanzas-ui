import { getNotionClient } from "../server/notion.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido." });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    const databaseId = process.env.NOTION_INCOME_DB;
    if (!databaseId) throw new Error("Notion no está configurado.");
    await getNotionClient().databases.query({ database_id: databaseId, page_size: 1 });
    return res.status(200).json({ status: "healthy" });
  } catch (error) {
    console.error("Health check failed:", error);
    return res.status(503).json({ status: "unavailable" });
  }
}
