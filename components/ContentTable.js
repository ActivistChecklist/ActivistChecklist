import React from 'react';
import Markdown from './Markdown';
import { cn } from '@/lib/utils';

/**
 * Renders a structured table from MDX (thead/tbody cell strings rendered as Markdown).
 */
export function ContentTable({ table, caption, className, ...props }) {
  if (!table || !table.thead || !table.tbody) {
    return null;
  }

  return (
    <div className={cn('table-wrapper', className)} {...props}>
      <table role="table">
        {caption && (
          <caption className="sr-only">
            <Markdown content={caption} inlineOnly={true} />
          </caption>
        )}
        <thead>
          <tr>
            {table.thead.map((th, index) => (
              <th key={index} scope="col">
                <Markdown content={th.value} inlineOnly={true} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.tbody.map((tr, rowIndex) => (
            <tr key={rowIndex}>
              {tr.body.map((td, colIndex) => (
                <td key={colIndex}>
                  <Markdown content={td.value} inlineOnly={true} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ContentTable;
