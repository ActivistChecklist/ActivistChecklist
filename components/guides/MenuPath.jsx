'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { SiApple } from 'react-icons/si';
import { FaWindows, FaAndroid } from 'react-icons/fa6';
import { cn } from '@/lib/utils';
import {
  getArrow,
  isRtlLocale,
  parsePlatformHeader,
  splitOnChevron,
} from '@/lib/menu-path';

const PLATFORM_ICONS = {
  iphone: SiApple,
  mac: SiApple,
  android: FaAndroid,
  windows: FaWindows,
};

function isEmElement(node) {
  return React.isValidElement(node) && node.type === 'em';
}

function getNodeText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join('');
  if (React.isValidElement(node)) return getNodeText(node.props.children);
  return '';
}

/** Replace " > " inside a top-level text node with arrow spans. */
function renderTextWithArrows(text, arrow, separatorLabel, keyPrefix) {
  const parts = splitOnChevron(text);
  if (parts.length === 1) return [text];
  const out = [];
  parts.forEach((part, i) => {
    if (i > 0) {
      out.push(
        <span key={`${keyPrefix}-a-${i}`} role="img" aria-label={separatorLabel}>
          <span className="mx-1.5 text-muted-foreground" aria-hidden="true">
            {arrow}
          </span>
        </span>
      );
    }
    if (part) out.push(part);
  });
  return out;
}

function trimEdgeWhitespace(nodes) {
  let out = nodes;
  while (out.length && typeof out[0] === 'string' && out[0].trim() === '') {
    out = out.slice(1);
  }
  while (out.length && typeof out[out.length - 1] === 'string' && out[out.length - 1].trim() === '') {
    out = out.slice(0, -1);
  }
  if (out.length && typeof out[0] === 'string') {
    const first = out[0].replace(/^\s+/, '');
    out = first ? [first, ...out.slice(1)] : out.slice(1);
  }
  if (out.length && typeof out[out.length - 1] === 'string') {
    const last = out[out.length - 1].replace(/\s+$/, '');
    out = last ? [...out.slice(0, -1), last] : out.slice(0, -1);
  }
  return out;
}

/**
 * MenuPath — formats a UI navigation path consistently.
 *
 * Authors write the path in MDX with familiar syntax:
 *   <MenuPath>*On iPhone:* Signal > Settings > **Notifications**</MenuPath>
 *
 * The leading italic header (text ending in ":") becomes a bold label line
 * with a platform icon when recognised. Plain " > " separators in the body
 * become directional arrows (→ in LTR, ← in RTL).
 */
export default function MenuPath({ children, className, inline = false }) {
  const locale = useLocale();
  const arrow = getArrow(isRtlLocale(locale));

  let nodes = React.Children.toArray(children);

  // MDX may wrap a single inline run in <p> when content sits on its own line.
  if (nodes.length === 1 && React.isValidElement(nodes[0]) && nodes[0].type === 'p') {
    nodes = React.Children.toArray(nodes[0].props.children);
  }

  nodes = trimEdgeWhitespace(nodes);

  // Header parsing only applies to the block form; inline usage is just a path
  // dropped into surrounding prose.
  let header = null;
  if (!inline && nodes.length > 0 && isEmElement(nodes[0])) {
    const headerText = getNodeText(nodes[0]).trim();
    if (headerText.endsWith(':')) {
      const rawLabel = headerText.replace(/:$/, '').trim();
      const parsed = parsePlatformHeader(rawLabel);
      header = {
        label: parsed?.displayLabel ?? rawLabel,
        platformKey: parsed?.key ?? null,
      };
      nodes = trimEdgeWhitespace(nodes.slice(1));
    }
  }

  const PlatformIcon = header?.platformKey ? PLATFORM_ICONS[header.platformKey] : null;

  const body = nodes.flatMap((node, i) => {
    if (typeof node === 'string') {
      return renderTextWithArrows(node, arrow, `n${i}`);
    }
    if (React.isValidElement(node)) {
      return [React.cloneElement(node, { key: node.key ?? `n${i}` })];
    }
    return [node];
  });

  if (inline) {
    return (
      <span className={cn('menu-path-inline', className)}>{body}</span>
    );
  }

  return (
    <div className={cn('menu-path mt-5 first:mt-0 last:mb-0', className)}>
      {header && (
        <div className="flex items-center gap-1.5 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {PlatformIcon && (
            <PlatformIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{header.label}</span>
        </div>
      )}
      <div className="menu-path-steps text-foreground">{body}</div>
    </div>
  );
}
