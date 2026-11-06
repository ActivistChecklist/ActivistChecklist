'use client';

import React, { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseShowCount } from '@/lib/expandable-list';

/**
 * A bullet list that shows its first few items and hides the rest behind a
 * "Show 4 more" button under the list. Opening it reveals the hidden items in
 * the same list, and the button (still under the list) becomes "Show less".
 * Hidden items stay in the HTML, so site search indexes them and print shows them.
 *
 * Usage in MDX (attribute values must be strings: MDX strips `{expressions}`):
 *   <ExpandableList show="2" label="Go deeper">
 *     * First item
 *     * Second item
 *     * Third item
 *   </ExpandableList>
 *
 * `show` defaults to 1. With `label`, the button reads "Go deeper (1 more)".
 */
export default function ExpandableList({ show = '1', label, children }) {
  const t = useTranslations();
  const listId = useId();
  const [expanded, setExpanded] = useState(false);

  const visibleCount = parseShowCount(show);

  const childArray = React.Children.toArray(children);
  const listIndex = childArray.findIndex((c) => React.isValidElement(c) && c.type === 'ul');
  if (listIndex === -1) return <>{children}</>;

  const { children: listChildren, ...listProps } = childArray[listIndex].props;
  const items = React.Children.toArray(listChildren).filter(
    (c) => React.isValidElement(c) && c.type === 'li',
  );
  const hiddenCount = items.length - visibleCount;
  if (hiddenCount <= 0) return <>{children}</>;

  const buttonText = expanded
    ? t('expandableList.less')
    : label
      ? t('expandableList.moreWithLabel', { label, count: hiddenCount })
      : t('expandableList.more', { count: hiddenCount });

  return (
    <>
      {childArray.slice(0, listIndex)}
      <ul {...listProps} id={listId}>
        {items.map((item, i) =>
          expanded || i < visibleCount
            ? item
            : React.cloneElement(item, {
                className: cn(item.props.className, 'hidden print:list-item'),
              }),
        )}
      </ul>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((open) => !open)}
        className={cn(
          'print:hidden mt-2 mb-4 flex w-fit items-center rounded-sm cursor-pointer',
          'text-sm font-medium text-link hover:underline',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {/* Same width as the list's ml-6 indent, so the chevron sits in the
            bullet column and the text lines up with the item text */}
        <span className="flex w-6 shrink-0 justify-center" aria-hidden="true">
          <ChevronDown
            className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')}
          />
        </span>
        <span>{buttonText}</span>
      </button>
      {childArray.slice(listIndex + 1)}
    </>
  );
}
