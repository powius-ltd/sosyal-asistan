"use client"

import { useColorScheme } from "@/lib/theme/use-color-scheme"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useColorScheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          // Eylem düğmesi ("Geri al", "Aç"): sonner varsayılanı 24 px; telefonda dokunma hedefi ≥ 48 px (`min-h-tap`), `md`+ varsayılan.
          actionButton: "max-md:min-h-tap max-md:px-4",
          cancelButton: "max-md:min-h-tap max-md:px-4",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
