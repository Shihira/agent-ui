import { useQueryState } from 'nuqs'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { SessionEntry } from '@/types/os'
import { Button } from '../../../ui/button'
import { deleteSessionAPI, forkSessionAPI, renameSessionAPI } from '@/api/os'
import { useStore } from '@/store'
import { toast } from 'sonner'
import Icon from '@/components/ui/icon'
import { useState } from 'react'
import DeleteSessionModal from './DeleteSessionModal'
import RenameSessionModal from './RenameSessionModal'
import useChatActions from '@/hooks/useChatActions'
import { truncateText, cn } from '@/lib/utils'
import { useLocale } from '@/i18n/LocaleProvider'

type SessionItemProps = SessionEntry & {
  isSelected: boolean
  currentSessionId: string | null
  onSessionClick: () => void
}
const SessionItem = ({
  session_name: title,
  session_id,
  isSelected,
  currentSessionId,
  onSessionClick
}: SessionItemProps) => {
  const { t } = useLocale()
  const [agentId] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const [dbId] = useQueryState('db_id')
  const [, setSessionId] = useQueryState('session')
  const authToken = useStore((state) => state.authToken)
  const { selectedEndpoint, sessionsData, setSessionsData, mode } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isForking, setIsForking] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const { clearChat } = useChatActions()

  const handleGetSession = async () => {
    if (!(agentId || teamId || dbId)) return

    onSessionClick()
    // Sessions.tsx loads history (and auto-resumes running runs) when sessionId changes.
    setSessionId(session_id)
  }

  const handleForkSession = async () => {
    const componentId = mode === 'team' ? teamId : agentId
    if (!componentId) return

    setIsForking(true)
    try {
      const result = await forkSessionAPI(
        selectedEndpoint,
        mode,
        componentId,
        session_id,
        authToken
      )

      const forkedName = `${title}${t('sessions.fork_name_suffix')}`
      const forkedSession: SessionEntry = {
        session_id: result.session_id,
        session_name: forkedName,
        created_at: Math.floor(Date.now() / 1000)
      }

      setSessionsData([forkedSession, ...(sessionsData ?? [])])
      onSessionClick()
      setSessionId(result.session_id)
      toast.success(t('sessions.forked'))
    } catch (error) {
      toast.error(
        `${t('sessions.fork_failed')}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      setIsForking(false)
    }
  }

  const handleRenameSession = async (name: string) => {
    setIsRenaming(true)
    try {
      await renameSessionAPI(
        selectedEndpoint,
        mode,
        session_id,
        name,
        dbId ?? undefined,
        authToken
      )
      setSessionsData(
        (sessionsData ?? []).map((session) =>
          session.session_id === session_id
            ? { ...session, session_name: name }
            : session
        )
      )
      setIsRenameModalOpen(false)
      toast.success(t('sessions.renamed'))
    } catch (error) {
      toast.error(
        `${t('sessions.rename_failed')}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      setIsRenaming(false)
    }
  }

  const handleDeleteSession = async () => {
    if (!(agentId || teamId || dbId)) return
    setIsDeleting(true)
    try {
      const response = await deleteSessionAPI(
        selectedEndpoint,
        dbId ?? '',
        session_id,
        authToken
      )

      if (response?.ok && sessionsData) {
        setSessionsData(sessionsData.filter((s) => s.session_id !== session_id))
        // If the deleted session was the active one, clear the chat
        if (currentSessionId === session_id) {
          setSessionId(null)
          clearChat()
        }
        toast.success(t('sessions.deleted'))
      } else {
        const errorMsg = await response?.text()
        toast.error(
          `${t('sessions.delete_failed')}: ${
            response?.statusText || t('errors.unknown')
          } ${errorMsg || ''}`
        )
      }
    } catch (error) {
      toast.error(
        `${t('sessions.delete_failed')}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      setIsDeleteModalOpen(false)
      setIsDeleting(false)
    }
  }

  const itemClass =
    'flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-primary outline-none hover:bg-surface-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50'

  return (
    <>
      <div
        className={cn(
          'group flex h-11 w-full items-center justify-between rounded-lg px-3 py-2 transition-colors duration-200',
          isSelected
            ? 'cursor-default border border-border bg-accent/60'
            : 'cursor-pointer border border-transparent bg-background-secondary hover:bg-surface-hover'
        )}
        onClick={handleGetSession}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h4
            className={cn(
              'truncate text-sm font-medium',
              isSelected && 'text-primary'
            )}
          >
            {truncateText(title, 20)}
          </h4>
        </div>
        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('sessions.menu')}
              className={cn(
                'opacity-0 transition-opacity duration-200 group-hover:opacity-100',
                menuOpen && 'opacity-100'
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <Icon type="more" size="xs" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-[9rem] rounded-xl border border-border bg-background p-1 shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <DropdownMenu.Item
                className={itemClass}
                onSelect={() => setIsRenameModalOpen(true)}
              >
                <Icon type="edit" size="xs" />
                {t('sessions.rename')}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={itemClass}
                disabled={isForking}
                onSelect={() => void handleForkSession()}
              >
                <Icon type="fork" size="xs" />
                {t('sessions.fork')}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={cn(itemClass, 'text-destructive')}
                onSelect={() => setIsDeleteModalOpen(true)}
              >
                <Icon type="trash" size="xs" />
                {t('actions.delete')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <RenameSessionModal
        isOpen={isRenameModalOpen}
        currentName={title}
        onClose={() => setIsRenameModalOpen(false)}
        onRename={handleRenameSession}
        isRenaming={isRenaming}
      />
      <DeleteSessionModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onDelete={handleDeleteSession}
        isDeleting={isDeleting}
      />
    </>
  )
}

export default SessionItem
