'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

const BREAK_TYPES = ['p', 'br', 'ul', 'ol'];

/**
 * InlineChecklist - Converts bullet points into interactive checklist items
 *
 * Items can be checked off and state is persisted to localStorage using the
 * provided storageKey (or a generated one based on content).
 */
export function InlineChecklist({ children, storageKey, className }) {
  const [checkedItems, setCheckedItems] = useState({});
  const [mounted, setMounted] = useState(false);
  // Store children in state to ensure consistent rendering after mount
  const [stableChildren, setStableChildren] = useState(null);

  // Generate a storage key from content if not provided
  const getStorageKey = useCallback(() => {
    if (storageKey) return `checklist-${storageKey}`;

    // Generate key from children content
    const extractText = (node) => {
      if (typeof node === 'string') return node;
      if (React.isValidElement(node)) {
        return extractText(node.props.children);
      }
      if (Array.isArray(node)) {
        return node.map(extractText).join('');
      }
      return '';
    };

    const text = extractText(children);
    // Create a simple hash from the text
    const hash = text.slice(0, 50).replace(/\s+/g, '-').toLowerCase();
    return `checklist-${hash}`;
  }, [storageKey, children]);

  // Load checked state from localStorage on mount
  useEffect(() => {
    // Capture children on mount to ensure stable reference
    setStableChildren(children);
    setMounted(true);
    try {
      const key = getStorageKey();
      const saved = localStorage.getItem(key);
      if (saved) {
        setCheckedItems(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Failed to load checklist state:', e);
    }
  }, [getStorageKey, children]);

  // Save checked state to localStorage
  useEffect(() => {
    if (!mounted) return;
    try {
      const key = getStorageKey();
      localStorage.setItem(key, JSON.stringify(checkedItems));
    } catch (e) {
      console.warn('Failed to save checklist state:', e);
    }
  }, [checkedItems, mounted, getStorageKey]);

  const toggleItem = (index) => {
    setCheckedItems((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Split children into first line and rest
  // First line = first paragraph, or if no paragraphs, all content (so inline
  // links and formatting get crossed out with the text around them)
  const splitFirstLine = (itemChildren) => {
    const childArray = React.Children.toArray(itemChildren);

    // Split at the first paragraph, line break or nested list that follows
    // some content. Whitespace-only text between blocks doesn't count.
    let seenContent = false;
    for (let i = 0; i < childArray.length; i++) {
      const child = childArray[i];
      const isBreak = React.isValidElement(child) && BREAK_TYPES.includes(child.type);
      if (isBreak && seenContent) {
        return { firstLine: childArray.slice(0, i), rest: childArray.slice(i) };
      }
      if (typeof child !== 'string' || child.trim()) seenContent = true;
    }

    return { firstLine: itemChildren, rest: null };
  };

  // Transform bullet list items into checklist items
  const transformChildren = (node, path = '') => {
    if (!React.isValidElement(node)) {
      return node;
    }

    const { type, props } = node;

    // Handle <ul> elements - this is the bullet list
    if (type === 'ul') {
      const items = React.Children.toArray(props.children);
      return (
        // No list indent: the box plus gap (1rem + 0.5rem) takes the place of the
        // bullet lists' ml-6, so item text lines up with bullet text
        <ul className={cn('checklist-items list-none pl-0 ml-0 space-y-2', props.className)}>
          {items.map((item, idx) => {
            if (React.isValidElement(item) && item.type === 'li') {
              const itemIndex = `${path}-${idx}`;
              const isChecked = checkedItems[itemIndex] || false;
              const { firstLine, rest } = splitFirstLine(item.props.children);

              return (
                <li
                  key={idx}
                  onClick={(e) => {
                    // Let links and other controls inside the item work without toggling it
                    if (e.target.closest('a, button, input, select, textarea, summary')) return;
                    toggleItem(itemIndex);
                  }}
                  className={cn(
                    'flex items-start gap-2 cursor-pointer select-none transition-all',
                    'hover:bg-muted/40 -mx-2 px-2 py-1 rounded-md',
                    isChecked && 'bg-primary/10',
                  )}
                >
                  <span
                    className={cn(
                      'shrink-0 size-4 mt-1.5 rounded-sm border-2 flex items-center justify-center transition-colors duration-300',
                      isChecked
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-muted-foreground/40 hover:border-primary',
                    )}
                  >
                    {isChecked && <Check className="w-3 h-3" />}
                  </span>
                  <span className="flex-1 transition-all">
                    <span className={cn(isChecked && 'line-through text-muted-foreground')}>
                      {firstLine}
                    </span>
                    {rest && (
                      <span className={cn(isChecked && 'text-muted-foreground opacity-75')}>
                        {rest}
                      </span>
                    )}
                  </span>
                </li>
              );
            }
            return item;
          })}
        </ul>
      );
    }

    // Recursively transform children
    if (props.children) {
      const newChildren = React.Children.map(props.children, (child, idx) =>
        transformChildren(child, `${path}-${idx}`),
      );
      return React.cloneElement(node, {}, newChildren);
    }

    return node;
  };

  // Use stableChildren after mount to ensure consistent rendering
  const childrenToRender = mounted && stableChildren ? stableChildren : children;

  // Render a simple placeholder on the server to avoid hydration mismatch
  // The complex transformChildren logic only runs on client after mount
  if (!mounted) {
    return (
      <div
        className={cn(
          'inline-checklist my-2 py-1 px-2 rounded-lg',
          // "bg-muted/30",
          className,
        )}
        suppressHydrationWarning
      >
        {/* Render original children without transformation on server */}
        {children}
      </div>
    );
  }

  return (
    <div className={cn('inline-checklist my-2 p-0 rounded-lg', className)}>
      {React.Children.map(childrenToRender, (child, idx) =>
        transformChildren(child, `root-${idx}`),
      )}
    </div>
  );
}

export default InlineChecklist;
