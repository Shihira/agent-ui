import { type FC, useEffect, useState } from 'react'
import { useLocale } from '@/i18n/LocaleProvider'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

interface RenameSessionModalProps {
  isOpen: boolean
  currentName: string
  onClose: () => void
  onRename: (name: string) => Promise<void>
  isRenaming: boolean
}

const RenameSessionModal: FC<RenameSessionModalProps> = ({
  isOpen,
  currentName,
  onClose,
  onRename,
  isRenaming
}) => {
  const { t } = useLocale()
  const [name, setName] = useState(currentName)

  useEffect(() => {
    if (isOpen) setName(currentName)
  }, [isOpen, currentName])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="font-geist">
        <DialogHeader>
          <DialogTitle>{t('sessions.rename_title')}</DialogTitle>
        </DialogHeader>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && name.trim()) {
              event.preventDefault()
              void onRename(name.trim())
            }
          }}
          className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm text-primary outline-none"
          autoFocus
        />
        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-xl border-border font-geist"
            onClick={onClose}
            disabled={isRenaming}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            onClick={() => void onRename(name.trim())}
            disabled={isRenaming || !name.trim()}
            className="rounded-xl font-geist"
          >
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default RenameSessionModal
