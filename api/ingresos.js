import { getNotionDate, queryAllDatabasePages } from "../server/notion.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido." });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const pages = await queryAllDatabasePages(process.env.NOTION_INCOME_DB);
    const ingresos = pages.map((page) => {
      const p = page.properties || {};
      return {
        id: page.id,
        concepto: p.Nombre?.title?.[0]?.plain_text || "Sin concepto",
        monto: p.Cantidad?.number ?? 0,
        fecha: getNotionDate(p, "Fecha del ingreso", page.created_time),
        categoria: p.Categoría?.select?.name || "",
        metodo: p["Método de pago"]?.select?.name || "",
        cuenta: p.Cuenta?.select?.name || "",
        created_time: page.created_time || null,
      };
    });
    return res.status(200).json(ingresos);
  } catch (error) {
    console.error("Error en API de ingresos:", error);
    return res.status(500).json({ error: "No se pudieron cargar los ingresos. Comprueba la conexión y la configuración." });
  }
}
