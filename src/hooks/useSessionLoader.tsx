import { useCallback } from 'react'
import { getSessionAPI, getAllSessionsAPI } from '@/api/os'
import { useStore } from '../store'
import { toast } from 'sonner'
import {
  ChatMessage,
  ToolCall,
  ReasoningMessage,
  type ActiveBackgroundRun
} from '@/types/os'
import { getJsonMarkdown } from '@/lib/utils'
import { useLocale } from '@/i18n/LocaleProvider'

type SessionRunRecord = {
  run_id?: string
  status?: string
  run_input?: string
  content?: string | object
  created_at?: number | string
  tools?: ToolCall[]
  events?: Array<{ event_index?: number }>
  extra_data?: ChatMessage['extra_data'] & {
    reasoning_messages?: ReasoningMessage[]
  }
  images?: ChatMessage['images']
  videos?: ChatMessage['videos']
  audio?: ChatMessage['audio']
  response_audio?: ChatMessage['response_audio']
}

interface LoaderArgs {
  entityType: 'agent' | 'team' | null
  agentId?: string | null
  teamId?: string | null
  dbId: string | null
}

export type SessionLoadResult = {
  messages: ChatMessage[]
  activeRun: ActiveBackgroundRun | null
}

const ACTIVE_RUN_STATUSES = new Set(['PENDING', 'RUNNING'])

const toUnixSeconds = (value: number | string | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) return asNumber
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000)
  }
  return Math.floor(Date.now() / 1000)
}

const getLastEventIndex = (
  events?: Array<{ event_index?: number }>
): number | undefined => {
  let max: number | undefined
  for (const event of events ?? []) {
    if (typeof event.event_index === 'number') {
      max =
        max === undefined
          ? event.event_index
          : Math.max(max, event.event_index)
    }
  }
  return max
}

const findActiveRun = (runs: SessionRunRecord[]): ActiveBackgroundRun | null => {
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index]
    const status = String(run.status ?? '').toUpperCase()
    if (run.run_id && ACTIVE_RUN_STATUSES.has(status)) {
      return {
        run_id: run.run_id,
        last_event_index: getLastEventIndex(run.events)
      }
    }
  }
  return null
}

const useSessionLoader = () => {
  const { t } = useLocale()
  const setMessages = useStore((state) => state.setMessages)
  const selectedEndpoint = useStore((state) => state.selectedEndpoint)
  const authToken = useStore((state) => state.authToken)
  const setIsSessionsLoading = useStore((state) => state.setIsSessionsLoading)
  const setSessionsData = useStore((state) => state.setSessionsData)

  const getSessions = useCallback(
    async ({ entityType, agentId, teamId, dbId }: LoaderArgs) => {
      const selectedId = entityType === 'agent' ? agentId : teamId
      if (!selectedEndpoint || !entityType || !selectedId || !dbId) return

      try {
        setIsSessionsLoading(true)

        const sessions = await getAllSessionsAPI(
          selectedEndpoint,
          entityType,
          selectedId,
          dbId,
          authToken
        )
        setSessionsData(sessions.data ?? [])
      } catch {
        toast.error(t('errors.load_sessions'))
        setSessionsData([])
      } finally {
        setIsSessionsLoading(false)
      }
    },
    [selectedEndpoint, authToken, setSessionsData, setIsSessionsLoading, t]
  )

  const getSession = useCallback(
    async (
      { entityType, agentId, teamId, dbId }: LoaderArgs,
      sessionId: string
    ): Promise<SessionLoadResult | null> => {
      const selectedId = entityType === 'agent' ? agentId : teamId
      if (
        !selectedEndpoint ||
        !sessionId ||
        !entityType ||
        !selectedId ||
        !dbId
      )
        return null

      try {
        const response = await getSessionAPI(
          selectedEndpoint,
          entityType,
          sessionId,
          dbId,
          authToken
        )
        if (!Array.isArray(response)) {
          return null
        }

        const runs = response as SessionRunRecord[]
        const messagesFor = runs.flatMap((run) => {
          const filteredMessages: ChatMessage[] = []

          filteredMessages.push({
            role: 'user',
            content: run.run_input ?? '',
            created_at: toUnixSeconds(run.created_at)
          })

          const toolCalls = [
            ...(run.tools ?? []),
            ...(run.extra_data?.reasoning_messages ?? []).reduce(
              (acc: ToolCall[], msg: ReasoningMessage) => {
                if (msg.role === 'tool') {
                  acc.push({
                    role: msg.role,
                    content: msg.content,
                    tool_call_id: msg.tool_call_id ?? '',
                    tool_name: msg.tool_name ?? '',
                    tool_args: msg.tool_args ?? {},
                    tool_call_error: msg.tool_call_error ?? false,
                    metrics: msg.metrics ?? { time: 0 },
                    created_at: msg.created_at ?? Math.floor(Date.now() / 1000)
                  })
                }
                return acc
              },
              []
            )
          ]

          filteredMessages.push({
            role: 'agent',
            content: (run.content as string) ?? '',
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            extra_data: run.extra_data,
            images: run.images,
            videos: run.videos,
            audio: run.audio,
            response_audio: run.response_audio,
            created_at: toUnixSeconds(run.created_at)
          })
          return filteredMessages
        })

        const processedMessages = messagesFor.map((message: ChatMessage) => {
          if (Array.isArray(message.content)) {
            const textContent = message.content
              .filter((item: { type: string }) => item.type === 'text')
              .map((item) => item.text)
              .join(' ')

            return {
              ...message,
              content: textContent
            }
          }
          if (typeof message.content !== 'string') {
            return {
              ...message,
              content: getJsonMarkdown(message.content)
            }
          }
          return message
        })

        const activeRun = findActiveRun(runs)
        setMessages(processedMessages)
        return { messages: processedMessages, activeRun }
      } catch {
        return null
      }
    },
    [selectedEndpoint, authToken, setMessages]
  )

  return { getSession, getSessions }
}

export default useSessionLoader
