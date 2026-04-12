"use client"

import * as React from "react"
import { Moon, Sun, Laptop } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark",  label: "Dark",  Icon: Moon },
  { value: "system", label: "System", Icon: Laptop },
]

export function DarkModeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme" disabled>
        <Sun className="h-[1.2rem] w-[1.2rem]" aria-hidden="true" />
      </Button>
    )
  }

  const CurrentIcon = resolvedTheme === "dark" ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Theme: ${theme}. Change theme`}
          title="Change theme"
        >
          <CurrentIcon className="h-[1.2rem] w-[1.2rem]" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEMES.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="flex items-center gap-2 cursor-pointer"
            aria-current={theme === value ? "true" : undefined}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
            {theme === value && (
              <span className="ml-auto text-xs text-muted-foreground">Active</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
