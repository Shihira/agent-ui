import { RunEvent, RunResponseContent } from '@/types/os'
import { useCallback } from 'react'

/**
 * Processes a single JSON chunk by passing it to the provided callback.
 * @param chunk - A parsed JSON object of type RunResponseContent.
 * @param onChunk - Callback to handle the chunk.
 */
function processChunk(
  chunk: RunResponseContent,
  onChunk: (chunk: RunResponseContent) => void
) {
  onChunk(chunk)
}

// TODO: Make new format the default and phase out legacy format

/**
 * Detects if the incoming data is in the legacy format (direct RunResponseContent)
 * @param data - The parsed data object
 * @returns true if it's in the legacy format, false if it's in the new format
 */
function isLegacyFormat(data: RunResponseContent): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'event' in data &&
    !('data' in data) &&
    typeof data.event === 'string'
  )
}

interface NewFormatData {
  event: string
  data: string | Record<string, unknown>
}

type LegacyEventFormat = RunResponseContent & { event: string }

function convertNewFormatToLegacy(
  newFormatData: NewFormatData
): LegacyEventFormat {
  const { event, data } = newFormatData

  // Parse the data field if it's a string
  let parsedData: Record<string, unknown>
  if (typeof data === 'string') {
    try {
      // First try to parse as JSON
      parsedData = JSON.parse(data)
    } catch {
      parsedData = {}
    }
  } else {
    parsedData = data
  }

  const { ...cleanData } = parsedData

  // Convert to legacy format by flattening the structure
  return {
    event: event,
    ...cleanData
  } as LegacyEventFormat
}

/**
 * Extracts complete JSON objects from a buffer string **incrementally**.
 * - It allows partial JSON objects to accumulate across chunks.
 * - It ensures real-time streaming updates.
 */
function parseBuffer(
  buffer: string,
  onChunk: (chunk: RunResponseContent) => void
): string {
  let currentIndex = 0
  let jsonStartIndex = buffer.indexOf('{', currentIndex)

  // Process as many complete JSON objects as possible.
  while (jsonStartIndex !== -1 && jsonStartIndex < buffer.length) {
    let braceCount = 0
    let inString = false
    let escapeNext = false
    let jsonEndIndex = -1
    let i = jsonStartIndex

    // Walk through the string to find the matching closing brace.
    for (; i < buffer.length; i++) {
      const char = buffer[i]

      if (inString) {
        if (escapeNext) {
          escapeNext = false
        } else if (char === '\\') {
          escapeNext = true
        } else if (char === '"') {
          inString = false
        }
      } else {
        if (char === '"') {
          inString = true
        } else if (char === '{') {
          braceCount++
        } else if (char === '}') {
          braceCount--
          if (braceCount === 0) {
            jsonEndIndex = i
            break
          }
        }
      }
    }

    // If we found a complete JSON object, try to parse it.
    if (jsonEndIndex !== -1) {
      const jsonString = buffer.slice(jsonStartIndex, jsonEndIndex + 1)

      try {
        const parsed = JSON.parse(jsonString)

        // Check if it's in the legacy format - use as is
        if (isLegacyFormat(parsed)) {
          processChunk(parsed, onChunk)
        } else {
          // New format - convert to legacy format for compatibility
          const legacyChunk = convertNewFormatToLegacy(parsed)
          processChunk(legacyChunk, onChunk)
        }
      } catch {
        // Move past the starting brace to avoid re-parsing the same invalid JSON.
        jsonStartIndex = buffer.indexOf('{', jsonStartIndex + 1)
        continue
      }

      // Move currentIndex past the parsed JSON and trim any leading whitespace.
      currentIndex = jsonEndIndex + 1
      buffer = buffer.slice(currentIndex).trim()

      // Reset currentIndex and search for the next JSON object.
      currentIndex = 0
      jsonStartIndex = buffer.indexOf('{', currentIndex)
    } else {
      // If a complete JSON object is not found, break out and wait for more data.
      break
    }
  }

  // Return any unprocessed (partial) data.
  return buffer
}

const CONTROL_EVENTS = new Set(['replay', 'catch_up'])

const TERMINAL_EVENTS = new Set<string>([
  RunEvent.RunCompleted,
  RunEvent.RunError,
  RunEvent.RunCancelled,
  RunEvent.TeamRunCompleted,
  RunEvent.TeamRunError,
  RunEvent.TeamRunCancelled
])

export type StreamResumeState = {
  runId?: string
  sessionId?: string
  lastEventIndex?: number
  attempt: number
}

export type StreamResumeRequest = {
  apiUrl: string
  requestBody: FormData | Record<string, unknown>
}

const MAX_RESUME_ATTEMPTS = 5

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

/**
 * Custom React hook to handle streaming API responses as JSON objects.
 *
 * Supports Agno background runs: when `onDisconnected` is provided and the
 * stream ends before a terminal run event, the hook reconnects via the resume
 * URL built by that callback (passing last_event_index).
 */
export default function useAIResponseStream() {
  const streamResponse = useCallback(
    async (options: {
      apiUrl: string
      headers?: Record<string, string>
      requestBody: FormData | Record<string, unknown>
      signal?: AbortSignal
      onChunk: (chunk: RunResponseContent) => void
      onError: (error: Error) => void
      onComplete: () => void
      onCancelled?: () => void
      /**
       * Called when the SSE connection drops before the run finishes.
       * Return the next `/resume` request, or null to stop retrying.
       */
      onDisconnected?: (state: StreamResumeState) => StreamResumeRequest | null
    }): Promise<void> => {
      const {
        apiUrl,
        headers = {},
        requestBody,
        signal,
        onChunk,
        onError,
        onComplete,
        onCancelled,
        onDisconnected
      } = options

      let runId: string | undefined
      let sessionId: string | undefined
      let lastEventIndex: number | undefined
      let reachedTerminal = false
      let attempt = 0
      let cancelled = false

      const handleChunk = (chunk: RunResponseContent) => {
        if (typeof chunk.run_id === 'string' && chunk.run_id) {
          runId = chunk.run_id
        }
        if (typeof chunk.session_id === 'string' && chunk.session_id) {
          sessionId = chunk.session_id
        }

        if (typeof chunk.event_index === 'number') {
          if (
            lastEventIndex !== undefined &&
            chunk.event_index <= lastEventIndex
          ) {
            return
          }
          lastEventIndex = chunk.event_index
        }

        const eventName = String(chunk.event ?? '')
        if (CONTROL_EVENTS.has(eventName)) {
          return
        }

        if (eventName === 'error' && chunk.error) {
          onError(new Error(String(chunk.error)))
          reachedTerminal = true
          return
        }

        if (TERMINAL_EVENTS.has(eventName)) {
          reachedTerminal = true
        }

        onChunk(chunk)
      }

      const openStream = async (
        url: string,
        body: FormData | Record<string, unknown>
      ): Promise<{ ok: true } | { ok: false; error: Error }> => {
        let buffer = ''
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              ...(!(body instanceof FormData) && {
                'Content-Type': 'application/json'
              }),
              ...headers
            },
            body: body instanceof FormData ? body : JSON.stringify(body),
            signal
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => null)
            if (
              typeof errorData === 'object' &&
              errorData !== null &&
              'detail' in errorData
            ) {
              throw new Error(String(errorData.detail))
            }
            throw new Error(`Request failed with status ${response.status}`)
          }
          if (!response.body) {
            throw new Error('No response body')
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()

          for (;;) {
            const { done, value } = await reader.read()
            if (done) {
              buffer = parseBuffer(buffer, handleChunk)
              return { ok: true }
            }
            buffer += decoder.decode(value, { stream: true })
            buffer = parseBuffer(buffer, handleChunk)
            if (reachedTerminal) {
              try {
                await reader.cancel()
              } catch {
                // Stream already closed.
              }
              return { ok: true }
            }
          }
        } catch (error) {
          if (isAbortError(error)) {
            cancelled = true
            return { ok: false, error: new Error('Aborted') }
          }
          if (typeof error === 'object' && error !== null && 'detail' in error) {
            return {
              ok: false,
              error: new Error(String((error as { detail: unknown }).detail))
            }
          }
          return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error))
          }
        }
      }

      let nextUrl = apiUrl
      let nextBody = requestBody
      let result = await openStream(nextUrl, nextBody)
      let lastError: Error | null = result.ok ? null : result.error

      if (cancelled) {
        onCancelled?.()
        return
      }

      while (
        !reachedTerminal &&
        !cancelled &&
        onDisconnected &&
        attempt < MAX_RESUME_ATTEMPTS
      ) {
        // Clean EOF without a terminal event also means "reconnect to catch up".
        attempt += 1
        const resume = onDisconnected({
          runId,
          sessionId,
          lastEventIndex,
          attempt
        })
        if (!resume) {
          break
        }
        await sleep(Math.min(250 * attempt, 1500))
        if (signal?.aborted) {
          cancelled = true
          break
        }
        nextUrl = resume.apiUrl
        nextBody = resume.requestBody
        result = await openStream(nextUrl, nextBody)
        if (cancelled) {
          onCancelled?.()
          return
        }
        lastError = result.ok ? null : result.error
        if (result.ok && reachedTerminal) {
          break
        }
        if (result.ok && !reachedTerminal) {
          // Stream ended cleanly again; try another resume until attempts run out.
          continue
        }
      }

      if (cancelled) {
        onCancelled?.()
        return
      }

      if (!reachedTerminal && lastError) {
        onError(lastError)
        return
      }

      onComplete()
    },
    []
  )

  return { streamResponse }
}
