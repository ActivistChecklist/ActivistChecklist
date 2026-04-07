/**
 * Replaces features/annotations/AnnotationShell.jsx when BUILD_MODE=static.
 * Ensures annotation dependencies are not bundled in static export mode.
 */
export default function AnnotationShellStatic({ children }) {
  return children;
}
