// @ts-nocheck
/**
 * Keystatic admin UI is omitted only for static HTML export (BUILD_MODE=static), where there is no API.
 * On Railway non-production, Keystatic routes are stripped at compile time in next.config.js (stubs),
 * not via this flag.
 *
 * Alias `showAdminUI` matches Keystatic docs naming; this project uses BUILD_MODE, not NODE_ENV,
 * because we ship GitHub-backed admin on production servers while static FTP export has no server.
 */
import { config, collection, fields, singleton } from '@keystatic/core';
import { wrapper, block, inline, repeating, mark } from '@keystatic/core/content-components';
import { Icon } from '@keystar/ui/icon';
import { boldIcon } from '@keystar/ui/icon/icons/boldIcon';
import { chevronsRightIcon } from '@keystar/ui/icon/icons/chevronsRightIcon';
import { headingIcon } from '@keystar/ui/icon/icons/headingIcon';
import { highlighterIcon } from '@keystar/ui/icon/icons/highlighterIcon';
import { underlineIcon } from '@keystar/ui/icon/icons/underlineIcon';
import ChecklistItemEditorPreview from '@/components/keystatic/ChecklistItemEditorPreview';
import AlertEditorPreview from '@/components/keystatic/AlertEditorPreview';
import { escapeHeadingIds, unescapeHeadingIds } from '@/lib/mdx-heading-ids';
import { parseShowCount } from '@/lib/expandable-list';

export const showKeystaticUI = process.env.BUILD_MODE !== 'static';
export const showAdminUI = showKeystaticUI;

/** MDX editor (toolbar image upload + public URLs). Same layout as `fields.image` for pages/news. */
const mdxEditorOptionsContent = {
  image: {
    directory: 'public/images/content',
    publicPath: '/images/content/',
  },
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/**
 * `fields.mdx` for entry bodies that also accepts `## Heading {#id}` anchors
 * (lib/mdx-heading-ids.js). The editor's MDX parser reads a bare `{` as code
 * and refuses to open the entry, so the marker is escaped before it parses and
 * unescaped in what it saves. Editors see and edit it as `{#id}` in the heading.
 */
function mdxBody(options) {
  const field = fields.mdx(options);
  return {
    ...field,
    parse: (value, args) =>
      field.parse(value, {
        ...args,
        content: textEncoder.encode(escapeHeadingIds(textDecoder.decode(args.content))),
      }),
    serialize(value, args) {
      const out = field.serialize(value, args);
      return {
        ...out,
        content: textEncoder.encode(unescapeHeadingIds(textDecoder.decode(out.content))),
      };
    },
  };
}

// ─── Shared content components ────────────────────────────────────────────────

const alertComponent = wrapper({
  label: 'Alert',
  description: 'Warning, info, or success callout box',
  schema: {
    type: fields.select({
      label: 'Type',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'Warning', value: 'warning' },
        { label: 'Info', value: 'info' },
        { label: 'Success', value: 'success' },
        { label: 'Error', value: 'error' },
      ],
      defaultValue: 'warning',
    }),
    title: fields.text({ label: 'Title' }),
  },
  ContentView(props) {
    return (
      <AlertEditorPreview type={props.value.type} title={props.value.title}>
        {props.children}
      </AlertEditorPreview>
    );
  },
});

const buttonComponent = block({
  label: 'Button',
  description: 'Call-to-action button',
  schema: {
    title: fields.text({ label: 'Title', validation: { isRequired: true } }),
    href: fields.url({ label: 'URL', validation: { isRequired: true } }),
    variant: fields.select({
      label: 'Variant',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'Outline', value: 'outline' },
        { label: 'Ghost', value: 'ghost' },
      ],
      defaultValue: 'default',
    }),
    size: fields.select({
      label: 'Size',
      options: [
        { label: 'Small', value: 'sm' },
        { label: 'Default', value: 'default' },
        { label: 'Large', value: 'lg' },
        { label: 'Extra Large', value: 'xl' },
      ],
      defaultValue: 'default',
    }),
    target: fields.select({
      label: 'Target',
      options: [
        { label: 'Same tab', value: '_self' },
        { label: 'New tab', value: '_blank' },
      ],
      defaultValue: '_self',
    }),
    alignment: fields.select({
      label: 'Alignment',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' },
      ],
      defaultValue: 'left',
    }),
    icon: fields.text({ label: 'Icon name (optional)' }),
    iconPosition: fields.select({
      label: 'Icon Position',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Right', value: 'right' },
      ],
      defaultValue: 'left',
    }),
    download: fields.checkbox({ label: 'Download link?', defaultValue: false }),
  },
  ContentView(props) {
    return (
      <div
        contentEditable={false}
        suppressContentEditableWarning
        style={{
          display: 'inline-block',
          padding: '4px 12px',
          background: '#e2e8f0',
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        {props.value.title || 'Button'}
        {props.value.href && (
          <span style={{ color: '#64748b', marginLeft: 6 }}>→ {props.value.href}</span>
        )}
      </div>
    );
  },
});

const howToComponent = wrapper({
  label: 'How To',
  description: 'Step-by-step instructions (can contain Alerts and Buttons)',
  schema: {
    title: fields.text({ label: 'Title', validation: { isRequired: true } }),
  },
  ContentView(props) {
    return (
      <div>
        <div
          contentEditable={false}
          suppressContentEditableWarning
          style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}
        >
          {props.value.title || 'How To'}
        </div>
        {props.children}
      </div>
    );
  },
});

const imageEmbedComponent = wrapper({
  label: 'Image',
  description: 'Image with optional caption',
  schema: {
    src: fields.text({ label: 'Image path', validation: { isRequired: true } }),
    alt: fields.text({ label: 'Alt text', validation: { isRequired: true } }),
    size: fields.select({
      label: 'Size',
      options: [
        { label: 'Extra Small', value: 'xs' },
        { label: 'Small', value: 'small' },
        { label: 'Medium', value: 'medium' },
        { label: 'Large', value: 'large' },
        { label: 'Full', value: 'full' },
      ],
      defaultValue: 'medium',
    }),
    // Keystatic writes every prop on save, so defaults must match
    // components/ImageEmbed.jsx or saving an entry silently restyles its images.
    alignment: fields.select({
      label: 'Alignment',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' },
      ],
      defaultValue: 'center',
    }),
    raw: fields.checkbox({
      label: 'Raw',
      description: 'No styling, shown at its own size (for badges and similar).',
      defaultValue: false,
    }),
  },
  ContentView(props) {
    return (
      <div>
        <div
          contentEditable={false}
          suppressContentEditableWarning
          style={{ fontSize: 12, color: '#64748b' }}
        >
          {props.value.src || 'No image path'}
          {props.value.alt && <span> — {props.value.alt}</span>}
          <span> ({props.value.size})</span>
        </div>
        {props.children}
      </div>
    );
  },
});

const videoEmbedComponent = wrapper({
  label: 'Video',
  description: 'Video embed with optional caption',
  schema: {
    src: fields.text({ label: 'Video path', validation: { isRequired: true } }),
  },
  ContentView(props) {
    return (
      <div>
        <div
          contentEditable={false}
          suppressContentEditableWarning
          style={{ fontSize: 12, color: '#64748b' }}
        >
          🎬 {props.value.src || 'No video path'}
        </div>
        {props.children}
      </div>
    );
  },
});

const copyButtonComponent = block({
  label: 'Copy Button',
  description: 'Text with a copy-to-clipboard button',
  schema: {
    text: fields.text({ label: 'Text to copy' }),
  },
  ContentView(props) {
    return (
      <div
        contentEditable={false}
        suppressContentEditableWarning
        style={{
          fontFamily: 'monospace',
          fontSize: 12,
          background: '#f1f5f9',
          padding: '4px 8px',
          borderRadius: 4,
        }}
      >
        {props.value.text || 'Empty'}
      </div>
    );
  },
});

/** Wraps selected text; serializes as &lt;StyledSpan className&gt;…&lt;/StyledSpan&gt; (Keystatic mark). */
const styledSpanComponent = mark({
  label: 'Styled text',
  description: 'Apply Tailwind classes to selected text',
  icon: <Icon src={boldIcon} />,
  tag: 'span',
  schema: {
    className: fields.text({
      label: 'CSS classes',
      description:
        'Tailwind utilities, e.g. text-error font-bold or bg-destructive! text-destructive-foreground!',
      multiline: true,
    }),
  },
  className: ({ value }) => value.className || '',
});

/**
 * Wraps selected text; serializes as &lt;MenuPath&gt;…&lt;/MenuPath&gt;. Content always
 * uses it inside a paragraph, even when it sits on its own line, so it is a
 * mark rather than a wrapper. See components/guides/MenuPath.jsx.
 */
const menuPathComponent = mark({
  label: 'Menu path',
  icon: <Icon src={chevronsRightIcon} />,
  tag: 'span',
  schema: {
    inline: fields.checkbox({
      label: 'Inline',
      description:
        'Keep the path inside the sentence. Leave off for the block form, where a leading *iPhone:* style label becomes a header.',
      defaultValue: false,
    }),
  },
  style: { borderBottom: '1px dashed #94a3b8' },
});

const collapsibleComponent = wrapper({
  label: 'Collapsible',
  description: 'Hidden content the reader clicks to expand',
  schema: {
    title: fields.text({ label: 'Title', validation: { isRequired: true } }),
    defaultOpen: fields.checkbox({ label: 'Open by default', defaultValue: false }),
    className: fields.text({ label: 'CSS classes (optional)' }),
  },
  ContentView(props) {
    return (
      <div>
        <div
          contentEditable={false}
          suppressContentEditableWarning
          style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}
        >
          ▸ {props.value.title || 'Collapsible'}
        </div>
        {props.children}
      </div>
    );
  },
});

const inlineChecklistComponent = wrapper({
  label: 'Inline Checklist',
  description: 'Converts bullet list into interactive checklist',
  schema: {
    storageKey: fields.text({ label: 'Storage key (for localStorage)' }),
  },
  ContentView(props) {
    return (
      <div>
        {props.value.storageKey && (
          <div
            contentEditable={false}
            suppressContentEditableWarning
            style={{ fontSize: 11, color: '#94a3b8' }}
          >
            key: {props.value.storageKey}
          </div>
        )}
        {props.children}
      </div>
    );
  },
});

/** Small muted label above a list; renders as an h3 (components/mdx/ListLabel.jsx). */
const listLabelComponent = mark({
  label: 'List label',
  icon: <Icon src={headingIcon} />,
  tag: 'span',
  schema: {},
  style: {
    fontSize: '0.8em',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
});

/**
 * A bullet list that shows its first items and hides the rest behind "Show N
 * more" (components/mdx/ExpandableList.jsx). `show` is a text field because
 * the site's MDX strips `{expressions}`, so a number would be lost as show={2}.
 */
const expandableListComponent = wrapper({
  label: 'Expandable list',
  description: 'Bullet list that shows the first items and hides the rest behind "Show N more"',
  schema: {
    show: fields.text({ label: 'Items to show before "Show more" (blank = 1)' }),
    label: fields.text({
      label: 'Button prefix (optional), e.g. "Go deeper" gives "Go deeper (4 more)"',
    }),
  },
  ContentView(props) {
    return (
      <div>
        <div
          contentEditable={false}
          suppressContentEditableWarning
          style={{ fontSize: 12, color: '#94a3b8' }}
        >
          Shows the first {parseShowCount(props.value.show)}, the rest behind &ldquo;Show
          more&rdquo;
        </div>
        {props.children}
      </div>
    );
  },
});

// ─── Plain HTML tags ──────────────────────────────────────────────────────────
// The editor rejects any JSX tag it has no definition for, HTML tags included,
// and then refuses to open the whole entry. These only let tags that content
// already uses pass through unchanged; the site renders them as plain HTML.

const underlineComponent = mark({
  label: 'Underline',
  icon: <Icon src={underlineIcon} />,
  tag: 'u',
  schema: {},
});

const highlightComponent = mark({
  label: 'Highlight',
  icon: <Icon src={highlighterIcon} />,
  tag: 'mark',
  schema: {},
});

const blockquoteComponent = wrapper({
  label: 'Quote block',
  description: 'Use when the quote holds components, like a message with a Copy Button',
  schema: {},
});

const anchorSectionComponent = wrapper({
  label: 'Anchor section',
  description: 'Makes the content inside a #link target',
  schema: {
    id: fields.text({ label: 'Anchor id', validation: { isRequired: true } }),
  },
  ContentView(props) {
    return (
      <div>
        <div
          contentEditable={false}
          suppressContentEditableWarning
          style={{ fontSize: 12, color: '#94a3b8' }}
        >
          #{props.value.id}
        </div>
        {props.children}
      </div>
    );
  },
});

// Shared set used in most collections
const contentComponents = {
  Alert: alertComponent,
  HowTo: howToComponent,
  Button: buttonComponent,
  ImageEmbed: imageEmbedComponent,
  VideoEmbed: videoEmbedComponent,
  CopyButton: copyButtonComponent,
  StyledSpan: styledSpanComponent,
  MenuPath: menuPathComponent,
  Collapsible: collapsibleComponent,
  InlineChecklist: inlineChecklistComponent,
  ListLabel: listLabelComponent,
  ExpandableList: expandableListComponent,
  u: underlineComponent,
  mark: highlightComponent,
  blockquote: blockquoteComponent,
  section: anchorSectionComponent,
};

// ─── Badge components (checklist items only) ──────────────────────────────────

const badgeComponent = block({
  label: 'Badge',
  schema: {
    variant: fields.text({ label: 'Variant' }),
    children: fields.text({ label: 'Text' }),
  },
  ContentView(props) {
    return (
      <span
        contentEditable={false}
        suppressContentEditableWarning
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          background: '#e2e8f0',
          borderRadius: 10,
          fontSize: 12,
        }}
      >
        {props.value.children || 'Badge'}
        {props.value.variant && <span style={{ color: '#64748b' }}> ({props.value.variant})</span>}
      </span>
    );
  },
});

// ─── Guide-specific components ────────────────────────────────────────────────

const sectionComponent = wrapper({
  label: 'Section',
  description: 'Guide section that groups checklist items',
  schema: {
    title: fields.text({ label: 'Section Title', validation: { isRequired: true } }),
    slug: fields.text({
      label: 'Section Slug (used for URL anchors)',
      validation: { isRequired: true },
    }),
  },
  ContentView(props) {
    return (
      <div style={{ marginTop: 12 }}>
        <div
          contentEditable={false}
          suppressContentEditableWarning
          style={{ fontWeight: 800, fontSize: 18 }}
        >
          {props.value.title || 'Untitled Section'}
          {props.value.slug && (
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>
              #{props.value.slug}
            </span>
          )}
        </div>
        {props.children}
      </div>
    );
  },
});

const checklistItemComponent = block({
  label: 'Checklist Item',
  description: 'Reference to a checklist item by slug',
  schema: {
    // Note: fields.relationship() is the ideal here but POC verified it works
    // inside content component blocks. If it doesn't, fall back to fields.text().
    slug: fields.relationship({
      label: 'Checklist Item',
      collection: 'checklistItems',
    }),
    defaultExpanded: fields.checkbox({
      label: 'Expanded by default',
      description:
        'Show this item already expanded on page load (useful when it is the only item on a page).',
      defaultValue: false,
    }),
    important: fields.checkbox({
      label: 'Important',
      description: 'Show the Important badge before the title on this page.',
      defaultValue: false,
    }),
    alwaysExpanded: fields.checkbox({
      label: 'Always expanded',
      description:
        'Pin the item open with no collapse control. Use when the item is the body of a page section.',
      defaultValue: false,
    }),
  },
  ContentView(props) {
    return (
      <div
        contentEditable={false}
        suppressContentEditableWarning
        style={{
          maxHeight: 560,
          overflow: 'auto',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 8,
          background: '#fff',
        }}
      >
        <ChecklistItemEditorPreview slug={props.value.slug} important={props.value.important} />
      </div>
    );
  },
});

/**
 * Keystatic `repeating` group: editor UI to add/remove `<ChecklistItem />` siblings.
 * @see https://keystatic.com/docs/content-components#repeating
 */
const checklistItemGroupComponent = repeating({
  label: 'Checklist item list',
  description:
    'List of checklist items. Select this block and use Insert in the bar to add another item.',
  children: ['ChecklistItem'],
  schema: {},
});

const riskLevelLabels = { everyone: '🟢 Everyone', medium: '🟡 Medium Risk', high: '🔴 High Risk' };

const riskLevelComponent = wrapper({
  label: 'Risk Level',
  description: 'Who this section applies to',
  schema: {
    level: fields.select({
      label: 'Level',
      options: [
        { label: 'Everyone', value: 'everyone' },
        { label: 'Medium Risk', value: 'medium' },
        { label: 'High Risk', value: 'high' },
      ],
      defaultValue: 'everyone',
    }),
    mode: fields.select({
      label: 'Mode',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'Single Line', value: 'single_line' },
        { label: 'For You', value: 'for_you' },
        { label: 'For You If', value: 'for_you_if' },
      ],
      defaultValue: 'default',
    }),
  },
  ContentView(props) {
    return (
      <div>
        <div
          contentEditable={false}
          suppressContentEditableWarning
          style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}
        >
          {riskLevelLabels[props.value.level] || props.value.level}
        </div>
        {props.children}
      </div>
    );
  },
});

// How a guide or page is listed in menus, the footer, cards and /checklists/
// (lib/nav-copy.js). Translated by Crowdin like the title.
const navTitleField = fields.text({
  label: 'Short title (optional)',
  description:
    'Shown in menus, the footer, homepage cards, /checklists/ and search. Sentence case. Leave blank to use Title.',
});
const navDescriptionField = fields.text({
  label: 'Short description (optional)',
  description:
    'One sentence under the short title on homepage cards, related guides and /checklists/. Leave blank for none.',
  multiline: true,
});

const relatedGuidesComponent = wrapper({
  label: 'Related Guides',
  description: 'Block of related guide cards',
  schema: {},
});

const relatedGuideComponent = block({
  label: 'Related Guide',
  description: 'A single related guide reference',
  schema: {
    slug: fields.relationship({
      label: 'Guide',
      collection: 'guides',
    }),
  },
  ContentView(props) {
    return (
      <div
        contentEditable={false}
        suppressContentEditableWarning
        style={{
          padding: '4px 10px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        📖 {props.value.slug || <span style={{ color: '#94a3b8' }}>Select a guide…</span>}
      </div>
    );
  },
});

// ─── Guide and page components ────────────────────────────────────────────────
// Rendered in guides and pages but not inside checklist items (lib/mdx-components.js).

const faqItemComponent = block({
  label: 'FAQ item',
  schema: {
    question: fields.text({ label: 'Question', validation: { isRequired: true } }),
    answer: fields.text({
      label: 'Answer',
      description: 'Plain text, no Markdown. Search engines copy it verbatim into FAQ results.',
      multiline: true,
      validation: { isRequired: true },
    }),
  },
  ContentView(props) {
    return (
      <div contentEditable={false} suppressContentEditableWarning style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 600 }}>{props.value.question || 'Question'}</div>
        <div style={{ color: '#64748b' }}>{props.value.answer}</div>
      </div>
    );
  },
});

// No title field: an empty one would serialize as title="" and blank out the
// default "Frequently asked questions" heading.
const faqComponent = repeating({
  label: 'FAQ',
  description: 'Frequently asked questions. Select it and use Insert to add another item.',
  children: ['FAQItem'],
  schema: {},
});

const inlineCtaComponent = block({
  label: 'Newsletter signup',
  description: 'Compact newsletter signup box',
  schema: {},
  ContentView() {
    return <div style={{ fontSize: 13, color: '#64748b' }}>✉️ Newsletter signup</div>;
  },
});

const translationStatsComponent = block({
  label: 'Translation stats',
  description: 'Live translation progress per language',
  schema: {},
  ContentView() {
    return <div style={{ fontSize: 13, color: '#64748b' }}>🌐 Translation progress</div>;
  },
});

const guideAndPageComponents = {
  FAQ: faqComponent,
  FAQItem: faqItemComponent,
  InlineCta: inlineCtaComponent,
  TranslationStats: translationStatsComponent,
};

// ─── Config ───────────────────────────────────────────────────────────────────
// PageClient imports this file; use NEXT_PUBLIC_KEYSTATIC_STORAGE so server and browser agree.
// Default: local (unset, empty, or anything other than "github").

/** Draft preview links in Admin (app/preview/start, lib/content-draft.js, lib/github-content.mjs). */
/** /preview/start requires a Keystatic sign-in and previews the viewer's effective repo (upstream or their fork). Optional `&repo=` to override. */
const KEYSTATIC_PREVIEW_TO_ENTRY = '/preview/start?branch={branch}&to=/{slug}/';
/** Singletons have no `{slug}` — open site root so the bar can appear on any page. */
const KEYSTATIC_PREVIEW_TO_HOME = '/preview/start?branch={branch}&to=/';
/** News/changelog entries have no per-item URL — preview opens the listing (default locale, no /en prefix). */
const KEYSTATIC_PREVIEW_TO_NEWS = '/preview/start?branch={branch}&to=/news/';
const KEYSTATIC_PREVIEW_TO_CHANGELOG = '/preview/start?branch={branch}&to=/changelog/';

const keystaticStorageKind =
  process.env.NEXT_PUBLIC_KEYSTATIC_STORAGE === 'github' ? 'github' : 'local';

export default config({
  storage: {
    kind: keystaticStorageKind,
    repo: {
      owner: process.env.KEYSTATIC_GITHUB_REPO_OWNER || 'ActivistChecklist',
      name: process.env.KEYSTATIC_GITHUB_REPO_NAME || 'ActivistChecklist',
    },
  },

  ui: {
    brand: {
      name: 'Activist Checklist CMS',
    },
  },

  singletons: {
    announcementBar: singleton({
      label: 'Announcement bar',
      path: 'content/en/announcement/',
      previewUrl: KEYSTATIC_PREVIEW_TO_HOME,
      schema: {
        active: fields.checkbox({
          label: 'Show announcement bar',
          description: 'Turn off to hide the bar everywhere without deleting copy.',
          defaultValue: true,
        }),
        dismissKey: fields.text({
          label: 'Dismiss storage key',
          description:
            'Visitors who dismissed the bar are remembered by this key. Change it to show the bar again to everyone who had dismissed the old campaign.',
          defaultValue: 'announcement',
        }),
        title: fields.text({ label: 'Title' }),
        message: fields.text({
          label: 'Message',
          multiline: true,
        }),
        buttonText: fields.text({ label: 'Primary button label' }),
        buttonUrl: fields.text({
          label: 'Primary button URL',
          description: 'Relative or absolute path, e.g. /protest',
        }),
        secondaryButtonText: fields.text({ label: 'Secondary button label' }),
        secondaryButtonUrl: fields.text({ label: 'Secondary button URL' }),
        allowDismiss: fields.checkbox({
          label: 'Allow dismiss (X button)',
          defaultValue: true,
        }),
        colorScheme: fields.select({
          label: 'Color scheme',
          options: [{ label: 'Primary', value: 'primary' }],
          defaultValue: 'primary',
        }),
        icon: fields.select({
          label: 'Icon',
          options: [
            { label: 'Megaphone', value: 'megaphone' },
            { label: 'Bell', value: 'bell' },
            { label: 'None', value: 'none' },
          ],
          defaultValue: 'megaphone',
        }),
        disableAfterDate: fields.text({
          label: 'Auto-hide after date',
          description:
            'Optional. YYYY-MM-DD format. The announcement will stop showing after this date.',
        }),
      },
    }),
  },

  collections: {
    // ── Guides ──────────────────────────────────────────────────────────────
    guides: collection({
      label: 'Guides',
      slugField: 'title',
      path: 'content/en/guides/*',
      previewUrl: KEYSTATIC_PREVIEW_TO_ENTRY,
      entryLayout: 'content',
      format: { contentField: 'body' },
      columns: ['title', 'lastUpdated'],
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        navTitle: navTitleField,
        navDescription: navDescriptionField,
        estimatedTime: fields.text({ label: 'Estimated Time' }),
        excerpt: fields.mdx.inline({ label: 'Summary', options: mdxEditorOptionsContent }),
        seoTitle: fields.text({
          label: 'SEO title (optional)',
          description:
            'Overrides the <title> tag and OG title. Front-load the search query; aim under 60 chars. Leave blank to use Title.',
        }),
        seoDescription: fields.text({
          label: 'SEO meta description',
          description:
            '140–160 chars. Answer-first. Lead with what the reader will do. Plain language, no jargon, no marketing words, no em-dashes.',
          multiline: true,
        }),
        answerCapsule: fields.text({
          label: 'Answer capsule (optional)',
          description:
            '40–60 word direct answer to this page’s implicit search question. Renders at the top of the guide. AI engines often quote this verbatim.',
          multiline: true,
        }),
        relatedGuides: fields.array(
          fields.relationship({
            label: 'Related Guide',
            collection: 'guides',
          }),
          { label: 'Related Guides', itemLabel: (props) => props.value || 'Select guide...' },
        ),
        firstPublished: fields.date({ label: 'First Published' }),
        lastUpdated: fields.date({ label: 'Last Updated' }),
        // Untranslatable: sync UNTRANSLATABLE_FRONTMATTER_SCALARS in scripts/crowdin-hide-strings.mjs
        tocDepth: fields.integer({
          label: 'Left TOC depth',
          description:
            'Which heading levels appear in “On this page”: 2 = ## only (the default when blank), 3 = ## and ###.',
          validation: { min: 2, max: 3 },
        }),
        hideInlineCta: fields.checkbox({
          label: 'Hide inline newsletter CTA',
          description:
            'By default, a compact newsletter signup is inserted after the first section with checklist items. Check to suppress on this guide.',
          defaultValue: false,
        }),
        body: mdxBody({
          label: 'Guide Content',
          options: mdxEditorOptionsContent,
          components: {
            ...contentComponents,
            ...guideAndPageComponents,
            Section: sectionComponent,
            ChecklistItem: checklistItemComponent,
            ChecklistItemGroup: checklistItemGroupComponent,
            RiskLevel: riskLevelComponent,
            RelatedGuides: relatedGuidesComponent,
            RelatedGuide: relatedGuideComponent,
          },
        }),
      },
    }),

    // ── Checklist Items ─────────────────────────────────────────────────────
    checklistItems: collection({
      label: 'Checklist Items',
      slugField: 'title',
      path: 'content/en/checklist-items/*',
      entryLayout: 'content',
      format: { contentField: 'body' },
      columns: ['title'],
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        preview: fields.markdoc.inline({ label: 'Preview text', multiline: true }),
        do: fields.markdoc.inline({ label: '✅ DO:' }),
        dont: fields.markdoc.inline({ label: "❌ DON'T:" }),
        firstPublished: fields.date({ label: 'First Published' }),
        lastUpdated: fields.date({ label: 'Last Updated' }),
        body: mdxBody({
          label: 'Body',
          options: mdxEditorOptionsContent,
          components: {
            ...contentComponents,
            Badge: badgeComponent,
          },
        }),
      },
    }),

    // ── Pages ───────────────────────────────────────────────────────────────
    pages: collection({
      label: 'Pages',
      slugField: 'title',
      path: 'content/en/pages/*',
      previewUrl: KEYSTATIC_PREVIEW_TO_ENTRY,
      entryLayout: 'content',
      format: { contentField: 'body' },
      columns: ['title', 'lastUpdated'],
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        navTitle: navTitleField,
        navDescription: navDescriptionField,
        seoTitle: fields.text({
          label: 'SEO title (optional)',
          description:
            'Overrides the <title> tag and OG title. Front-load the search query; aim under 60 chars. Leave blank to use Title.',
        }),
        seoDescription: fields.text({
          label: 'SEO meta description',
          description:
            '140–160 chars. Answer-first. Lead with what the reader will do. Plain language, no jargon, no marketing words, no em-dashes.',
          multiline: true,
        }),
        excerpt: fields.text({
          label: 'Summary (optional)',
          description:
            'One or two plain sentences. Used as the meta description when SEO meta description is blank.',
          multiline: true,
        }),
        answerCapsule: fields.text({
          label: 'Answer capsule (optional)',
          description:
            '40–60 word direct answer to this page’s implicit search question. Renders at the top of the page. AI engines often quote this verbatim.',
          multiline: true,
        }),
        image: fields.image({
          label: 'Open Graph Image (optional)',
          description:
            'Relative path or full URL for OpenGraph/Twitter image (e.g. /images/content/foo.jpg).',
          directory: 'public/images/content',
          publicPath: '/images/content/',
        }),
        relatedGuides: fields.array(
          fields.relationship({
            label: 'Related Guide',
            collection: 'guides',
          }),
          { label: 'Related Guides', itemLabel: (props) => props.value || 'Select guide...' },
        ),
        firstPublished: fields.date({ label: 'First Published' }),
        lastUpdated: fields.date({ label: 'Last Updated' }),
        // Untranslatable frontmatter: if you add/remove fields here, sync UNTRANSLATABLE_FRONTMATTER_SCALARS in scripts/crowdin-hide-strings.mjs (see lib/content.js readMdxFile).
        showToc: fields.checkbox({
          label: '“On this page” sidebar',
          description:
            'Shows the left “On this page” table of contents (same as guides). Use TOC depth below for ## vs ###.',
          defaultValue: false,
        }),
        tocDepth: fields.integer({
          label: 'Left TOC depth (when “On this page” is on)',
          description: '2 = ## only (the default when blank). 3 = ## and ###.',
          validation: { min: 2, max: 3 },
        }),
        body: mdxBody({
          label: 'Body',
          options: mdxEditorOptionsContent,
          components: {
            ...contentComponents,
            ...guideAndPageComponents,
            ChecklistItem: checklistItemComponent,
            ChecklistItemGroup: checklistItemGroupComponent,
          },
        }),
      },
    }),

    // ── News ────────────────────────────────────────────────────────────────
    news: collection({
      label: 'News',
      slugField: 'title',
      path: 'content/en/news/*',
      previewUrl: KEYSTATIC_PREVIEW_TO_NEWS,
      format: { contentField: 'body' },
      columns: ['title', 'date'],
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        date: fields.date({ label: 'Date', validation: { isRequired: true } }),
        url: fields.url({ label: 'Article URL' }),
        source: fields.text({ label: 'Source Publication' }),
        tags: fields.text({
          label: 'Tags',
          description: 'Comma-separated (e.g. ice, surveillance, phones)',
        }),
        imageOverride: fields.image({
          label: 'Image Override',
          description: 'Overrides the auto-fetched open graph image',
          directory: 'public/images/news',
          publicPath: '/images/news/',
        }),
        firstPublished: fields.ignored(),
        lastUpdated: fields.ignored(),
        body: mdxBody({
          label: 'Comment (optional)',
          options: mdxEditorOptionsContent,
          components: {},
        }),
      },
    }),

    // ── Changelog ───────────────────────────────────────────────────────────
    changelog: collection({
      label: 'Changelog',
      // The slug is only the file name (Keystatic never writes it to front
      // matter), and it doubles as the entry's #anchor in the changelog RSS
      // feed. `date` must stay a separate front matter field: the site sorts
      // and dates entries by it.
      slugField: 'slug',
      path: 'content/en/changelog/*',
      previewUrl: KEYSTATIC_PREVIEW_TO_CHANGELOG,
      format: { contentField: 'body' },
      columns: ['type', 'date'],
      schema: {
        slug: fields.text({
          label: 'File name',
          description: 'Date plus a few words, e.g. 2026-10-27-glossary-page',
          validation: { isRequired: true },
        }),
        date: fields.date({ label: 'Date', validation: { isRequired: true } }),
        type: fields.select({
          label: 'Type',
          options: [
            { label: 'Minor', value: 'minor' },
            { label: 'Major', value: 'major' },
          ],
          defaultValue: 'minor',
        }),
        body: mdxBody({
          label: 'Body',
          options: mdxEditorOptionsContent,
          components: {},
        }),
      },
    }),
  },
});
