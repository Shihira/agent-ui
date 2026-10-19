'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useEffect, useMemo, useState } from 'react'
import { useQueryState } from 'nuqs'

import { useStore } from '@/store'
import { useLocale } from '@/i18n/LocaleProvider'
import useChatActions from '@/hooks/useChatActions'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'

const TopbarEntityMenu = () => {
  const { t } = useLocale()
  const { clearChat, focusChatInput } = useChatActions()
  const {
    mode,
    agents,
    teams,
    setMode,
    setMessages,
    setSelectedModel
  } = useStore()
  const [open, setOpen] = useState(false)
  const [pendingMode, setPendingMode] = useState<'agent' | 'team'>(mode)

  const [agentId, setAgentId] = useQueryState('agent', {
    parse: (value) => value || undefined,
    history: 'push'
  })
  const [teamId, setTeamId] = useQueryState('team', {
    parse: (value) => value || undefined,
    history: 'push'
  })
  const [, setSessionId] = useQueryState('session')

  const currentEntity = useMemo(() => {
    if (mode === 'team') {
      return teams.find((team) => team.id === teamId)
    }
    return agents.find((agent) => agent.id === agentId)
  }, [agents, teams, agentId, teamId, mode])

  useEffect(() => {
    const currentValue = mode === 'team' ? teamId : agentId
    const currentEntities = mode === 'team' ? teams : agents

    if (currentValue && currentEntities.length > 0) {
      const entity = currentEntities.find((item) => item.id === currentValue)
      if (entity) {
        setSelectedModel(entity.model?.model || '')
        if (mode === 'team') {
          setTeamId(entity.id)
        }
        if (entity.model?.model) {
          focusChatInput()
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, teamId, agents, teams, mode])

  const triggerLabel = currentEntity?.name || currentEntity?.id
  const placeholder =
    mode === 'team' ? t('sidebar.select_team') : t('sidebar.select_agent')

  const entities = pendingMode === 'team' ? teams : agents
  const emptyPlaceholder =
    pendingMode === 'team'
      ? t('sidebar.no_teams_available')
      : t('sidebar.no_agents_available')

  const selectedId =
    pendingMode === mode ? (mode === 'team' ? teamId : agentId) : null

  const handleEntitySelect = (entityId: string) => {
    const selectedEntity = entities.find((entity) => entity.id === entityId)

    if (pendingMode !== mode) {
      setMode(pendingMode)
      clearChat()
    }

    setSelectedModel(selectedEntity?.model?.provider || '')

    if (pendingMode === 'team') {
      setTeamId(entityId)
      setAgentId(null)
    } else {
      setAgentId(entityId)
      setTeamId(null)
    }

    setMessages([])
    setSessionId(null)

    if (selectedEntity?.model?.provider) {
      focusChatInput()
    }

    setOpen(false)
  }

  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setPendingMode(mode)
        }
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-border bg-background-secondary px-3 py-1 text-xs font-medium text-primary"
        >
          <span className="max-w-[200px] truncate">
            {triggerLabel || placeholder}
          </span>
          <Icon type="chevron-down" size="xs" className="text-secondary" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 w-[220px] rounded-xl border border-border bg-background p-1 text-secondary shadow-lg"
          sideOffset={6}
        >
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-background-secondary p-1">
            {(['agent', 'team'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => setPendingMode(tab)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium uppercase',
                  pendingMode === tab
                    ? 'bg-background text-primary shadow-sm'
                    : 'text-secondary hover:text-primary'
                )}
              >
                {tab === 'agent'
                  ? t('sidebar.mode_agent')
                  : t('sidebar.mode_team')}
              </button>
            ))}
          </div>
          <div className="my-1 h-px bg-border" />
          <div className="max-h-64 overflow-y-auto">
            {entities.length === 0 ? (
              <div className="px-3 py-2 text-xs font-medium text-muted">
                {emptyPlaceholder}
              </div>
            ) : (
              entities.map((entity) => (
                <DropdownMenu.Item
                  key={entity.id}
                  onSelect={() => handleEntitySelect(entity.id)}
                  className={cn(
                    'cursor-pointer rounded-lg px-3 py-2 text-xs font-medium text-primary outline-none hover:bg-surface-hover',
                    entity.id === selectedId && 'bg-surface-hover'
                  )}
                >
                  {entity.name || entity.id}
                </DropdownMenu.Item>
              ))
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export default TopbarEntityMenu
