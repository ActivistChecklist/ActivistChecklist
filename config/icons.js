/**
 * Shared icon configuration for guides/checklists.
 * Used by navigation.js for the UI and og-image.js for social share images.
 */
import {
  IoShield,
  IoMegaphone,
  IoGlobe,
  IoPeople,
  IoChatbubble,
  IoAirplane,
  IoEyeOff,
  IoVideocam,
  IoNotifications,
  IoLockClosed,
  IoHandRight,
} from "react-icons/io5"
import { Landmark } from "lucide-react"
import React from "react"

const svgProps = { stroke: "currentColor", fill: "currentColor", strokeWidth: "0", viewBox: "0 0 512 512", height: "1em", width: "1em", xmlns: "http://www.w3.org/2000/svg" }

// IoLockClosed with a thicker shackle — original inner radius was 64 (thin walls),
// expanded outward and inward for chunkier proportions.
const IoLockClosedThick = (props) =>
  React.createElement('svg', { ...svgProps, ...props },
    React.createElement('path', { d: "M368 192h-8v-80a104 104 0 1 0-208 0v80h-8a64.07 64.07 0 0 0-64 64v176a64.07 64.07 0 0 0 64 64h224a64.07 64.07 0 0 0 64-64V256a64.07 64.07 0 0 0-64-64zm-60 0H204v-80a52 52 0 1 1 104 0z" })
  )

// IoPhonePortrait from react-icons/io5 has a duplicate path that causes double
// opacity at low alpha (see react-icons/react-icons#1136). This is a fixed copy.
const IoPhonePortraitFixed = (props) =>
  React.createElement('svg', { ...svgProps, ...props },
    React.createElement('path', { d: "M336 0H176a64 64 0 0 0-64 64v384a64 64 0 0 0 64 64h160a64 64 0 0 0 64-64V64a64 64 0 0 0-64-64zm32 448a32 32 0 0 1-32 32H176a32 32 0 0 1-32-32V64a32 32 0 0 1 32-32h11.35a7.94 7.94 0 0 1 7.3 4.75A32 32 0 0 0 224 56h64a32 32 0 0 0 29.35-19.25 7.94 7.94 0 0 1 7.3-4.75H336a32 32 0 0 1 32 32z" }),
    React.createElement('path', { d: "M336 48a11.88 11.88 0 0 0-9.53 4.69A48 48 0 0 1 288 72h-64a48 48 0 0 1-38.47-19.31A11.88 11.88 0 0 0 176 48a16 16 0 0 0-16 16v384a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V64a16 16 0 0 0-16-16z" })
  )

// Map guide keys to their icons (solid variants)
// Keys should match item keys in config/navigation.json (checklist slugs)
export const GUIDE_ICONS = {
  'essentials': IoShield,
  'protest': IoPeople,
  'travel': IoAirplane,
  'signal': IoChatbubble,
  'secondary': IoPhonePortraitFixed,
  'emergency': IoNotifications,
  'spyware': IoEyeOff,
  'organizing': IoMegaphone,
  'research': IoGlobe,
  'federal': Landmark,
  'doxxing': IoLockClosedThick,
  'action': IoHandRight,
  'ice': IoVideocam,
}

// Default icon for pages without a specific icon (shield)
export const DEFAULT_ICON = IoShield

/**
 * Get icon component for a guide key
 */
export function getGuideIcon(key) {
  return GUIDE_ICONS[key] || DEFAULT_ICON
}
