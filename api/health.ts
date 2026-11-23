import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Punto de montaje temporal para comprobar Vercel Functions en T-01.
 * La verificación operativa de salud se implementará en T-14A.
 */
export default function health(_request: VercelRequest, response: VercelResponse) {
  response.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'La verificación de salud estará disponible en T-14A.',
    },
  })
}
