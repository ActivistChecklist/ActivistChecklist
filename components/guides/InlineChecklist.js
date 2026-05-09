'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

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
    setCheckedItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Split children into first line and rest
  // First line = first paragraph, or if no paragraphs, all content
  const splitFirstLine = (itemChildren) => {
    const childArray = React.Children.toArray(itemChildren);
    
    // If only one child, that's the first line
    if (childArray.length <= 1) {
      return { firstLine: itemChildren, rest: null };
    }
    
    // Look for paragraph or br break point
    let breakIndex = -1;
    for (let i = 0; i < childArray.length; i++) {
      const child = childArray[i];
      // If we find a second paragraph or a br, split there
      if (i > 0 && React.isValidElement(child)) {
        if (child.type === 'p' || child.type === 'br') {
          breakIndex = i;
          break;
        }
      }
    }
    
    if (breakIndex === -1) {
      // No break found, first child is the first line
      return { firstLine: childArray[0], rest: childArray.slice(1) };
    }
    
    return {
      firstLine: childArray.slice(0, breakIndex),
      rest: childArray.slice(breakIndex)
    };
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
        <ul className={cn("checklist-items list-none ps-0 space-y-2", props.className)}>
          {items.map((item, idx) => {
            if (React.isValidElement(item) && item.type === 'li') {
              const itemIndex = `${path}-${idx}`;
              const isChecked = checkedItems[itemIndex] || false;
              const { firstLine, rest } = splitFirstLine(item.props.children);
              
              return (
                <li
                  key={idx}
                  onClick={() => toggleItem(itemIndex)}
                  className={cn(
                    "flex items-start gap-3 cursor-pointer select-none transition-all",
                    "hover:bg-muted/40 -mx-2 px-2 py-1 rounded-md",
                    isChecked && "bg-primary/10"
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 w-5 h-5 mt-0.5 rounded-sm border-2 flex items-center justify-center transition-colors duration-300",
                      isChecked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/40 hover:border-primary"
                    )}
                  >
                    {isChecked && <Check className="w-3 h-3" />}
                  </span>
                  <span className="flex-1 transition-all">
                    <span className={cn(
                      isChecked && "line-through text-muted-foreground"
                    )}>
                      {firstLine}
                    </span>
                    {rest && (
                      <span className={cn(
                        isChecked && "text-muted-foreground opacity-75"
                      )}>
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
        transformChildren(child, `${path}-${idx}`)
      );
      return React.cloneElement(node, {}, newChildren);
    }

    return node;
  };

  // Count total and checked items
  const countItems = (node, count = { total: 0 }) => {
    if (!React.isValidElement(node)) return count;
    
    const { type, props } = node;
    
    if (type === 'ul') {
      React.Children.forEach(props.children, (child) => {
        if (React.isValidElement(child) && child.type === 'li') {
          count.total++;
        }
      });
    }
    
    if (props.children) {
      React.Children.forEach(props.children, (child) => {
        countItems(child, count);
      });
    }
    
    return count;
  };

  // Use stableChildren after mount to ensure consistent rendering
  const childrenToRender = mounted && stableChildren ? stableChildren : children;
  
  const { total } = countItems(childrenToRender);
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const allChecked = total > 0 && checkedCount >= total;

  // Render a simple placeholder on the server to avoid hydration mismatch
  // The complex transformChildren logic only runs on client after mount
  if (!mounted) {
    return (
      <div 
        className={cn(
          "inline-checklist my-2 py-1 px-2 rounded-lg",
          // "bg-muted/30",
          className
        )}
        suppressHydrationWarning
      >
        {/* Render original children without transformation on server */}
        {children}
      </div>
    );
  }

  return (
    <div className={cn(
      "inline-checklist my-2 p-0 rounded-lg",
      // allChecked ? "bg-primary/5" : "bg-muted/30",
      className
    )}>
      {total > 0 && (
        <div className="flex items-center justify-between mb-3 text-sm text-muted-foreground">
          <span className="font-medium">
            {allChecked ? "✓ All done!" : `${checkedCount} of ${total} completed`}
          </span>
          {checkedCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCheckedItems({});
              }}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline"
            >
              Reset
            </button>
          )}
        </div>
      )}
      {React.Children.map(childrenToRender, (child, idx) => transformChildren(child, `root-${idx}`))}
    </div>
  );
}

export default InlineChecklist;
