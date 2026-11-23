export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(410).json({
    error: 'Esta automatización heredada de Notion está desactivada. Los cierres mensuales pertenecen ahora a la base de datos de Finanzas-ui.',
  })
}
