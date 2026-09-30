import * as React from "react"

/**
 * The sidebar sits beside the page from 48rem (768px at the default text size). The width is
 * measured in the current root font size, so larger text needs a wider screen before the sidebar
 * stays open; narrower screens slide it in over the page instead.
 */
const DESKTOP_MIN_REM = 48
const DESKTOP_MIN_PX = 768

function subscribe(onChange: () => void) {
  // The text size setting changes the root element's inline font size.
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] })
  window.addEventListener("resize", onChange)
  return () => {
    observer.disconnect()
    window.removeEventListener("resize", onChange)
  }
}

function isNarrow() {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return window.innerWidth < Math.max(DESKTOP_MIN_PX, DESKTOP_MIN_REM * rem)
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, isNarrow, () => false)
}
