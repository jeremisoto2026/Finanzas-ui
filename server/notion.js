import { Client } from "@notionhq/client";

let client;

export function getNotionClient() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("Falta configurar NOTION_TOKEN.");
  if (!client) client = new Client({ auth: token });
  return client;
}

export async function queryAllDatabasePages(databaseId, query = {}) {
  if (!databaseId) throw new Error("Falta configurar el identificador de la base de datos de Notion.");
  const notion = getNotionClient();
  const results = [];
  let startCursor;

  do {
    const response = await notion.databases.query({
      ...query,
      database_id: databaseId,
      page_size: 100,
      ...(startCursor ? { start_cursor: startCursor } : {}),
    });
    results.push(...(response.results || []));
    startCursor = response.has_more ? response.next_cursor : undefined;
    if (response.has_more && !startCursor) {
      throw new Error("Notion indicó que existen más resultados, pero no devolvió next_cursor.");
    }
  } while (startCursor);

  return results;
}

export function getNotionDate(properties, propertyName, fallbackDate = null) {
  const value = properties?.[propertyName]?.date?.start || fallbackDate;
  return value ? String(value).slice(0, 10) : null;
}
