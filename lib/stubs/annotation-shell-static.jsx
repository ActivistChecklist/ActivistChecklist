/**
 * Replaces `packages/react-review-comments/src/ReviewCommentsShell.jsx` when BUILD_MODE=static.
 * Ensures review-comments UI dependencies are not bundled in static export mode.
 */
export default function ReviewCommentsShellStatic({ children }) {
  return children;
}
