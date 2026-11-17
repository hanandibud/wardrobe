import { Grid2X2, Layers, Plus, Sun, type LucideIcon } from 'lucide-react'
import type { Tab } from '../types'

interface HeaderProps {
  activeTab: Tab
  itemCount: number
  onTabChange: (tab: Tab) => void
}

const tabs: Array<{ value: Tab; label: string; icon: LucideIcon }> = [
  { value: 'wardrobe', label: 'Wardrobe', icon: Grid2X2 },
  { value: 'add', label: 'Add', icon: Plus },
  { value: 'outfits', label: 'Outfits', icon: Layers },
  { value: 'today', label: 'Today', icon: Sun },
]

export function Header({ activeTab, itemCount, onTabChange }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-end justify-between gap-4">
          <button
            type="button"
            onClick={() => onTabChange('wardrobe')}
            className="group text-left"
            aria-label="Go to wardrobe"
          >
            <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-accent transition group-hover:text-ink">
              Personal wardrobe
            </span>
            <span className="block font-display text-2xl leading-none tracking-tight text-ink">
              Wardrobe
            </span>
          </button>

          <span className="pb-1 text-xs text-muted lg:hidden">
            {itemCount} {itemCount === 1 ? 'piece' : 'pieces'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <nav
            aria-label="Main"
            className="grid w-full grid-cols-4 items-center gap-0.5 rounded-full border border-line/80 bg-card/70 p-1 lg:flex lg:w-auto lg:gap-1"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = tab.value === activeTab

              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => onTabChange(tab.value)}
                  aria-pressed={isActive}
                  className={[
                    'flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs transition lg:flex-none lg:gap-2 lg:px-3.5 lg:text-sm',
                    isActive
                      ? 'bg-ink text-paper shadow-sm'
                      : 'text-muted hover:bg-black/5 hover:text-ink',
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4" strokeWidth={1.8} />
                  <span className="whitespace-nowrap">{tab.label}</span>
                </button>
              )
            })}
          </nav>

          <span className="hidden shrink-0 pb-1 text-xs text-muted lg:block">
            {itemCount} {itemCount === 1 ? 'piece' : 'pieces'}
          </span>
        </div>
      </div>
    </header>
  )
}
