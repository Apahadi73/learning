export type AnalyzeRequest = {
  fen: string
  depth?: number
  movetimeMs?: number
}

export type AnalyzeResponse = {
  fen: string
  bestMove: string
  eval: {
    type: 'cp' | 'mate'
    value: number
  }
  pv: string[]
  depth: number
}

export type APIError = {
  error: string
}

export async function analyzePosition(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    let msg = `Request failed with status ${res.status}`
    try {
      const body = (await res.json()) as APIError
      if (body?.error) msg = body.error
    } catch {
      // Ignore JSON parse failure; keep fallback message.
    }
    throw new Error(msg)
  }

  return (await res.json()) as AnalyzeResponse
}
