import { getNotionDate, queryAllDatabasePages } from "../server/notion.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido." });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const pages = await queryAllDatabasePages(process.env.NOTION_EXPENSES_DB);
    const gastos = pages.map((page) => {
      const p = page.properties || {};
      return {
        id: page.id,
        concepto: p.Nombre?.title?.[0]?.plain_text || "",
        monto: p.Cantidad?.number ?? 0,
        fecha: getNotionDate(p, "Fecha del gasto", page.created_time),
        categoria: p.Categoría?.select?.name || "",
        metodo: p["Método de pago"]?.select?.name || "",
        cuenta: p.Cuenta?.select?.name || "",
      };
    });
    return res.status(200).json(gastos);
  } catch (error) {
    console.error("Error en API de gastos:", error);
    return res.status(500).json({ error: "No se pudieron cargar los gastos. Comprueba la conexión y la configuración." });
  }
}
