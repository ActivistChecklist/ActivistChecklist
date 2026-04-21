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
import ChecklistItemEditorPreview from '@/components/keystatic/ChecklistItemEditorPreview';
import AlertEditorPreview from '@/components/keystatic/AlertEditorPreview';

export const showKeystaticUI = process.env.BUILD_MODE !== 'static';
export const showAdminUI = showKeystaticUI;

/** MDX editor (toolbar image upload + public URLs). Same layout as `fields.image` for pages/news. */
const mdxEditorOptionsContent = {
  image: {
    directory: 'public/images/content',
    publicPath: '/images/content/',
  },
};

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
        {props.value.href && <span style={{ color: '#64748b', marginLeft: 6 }}>→ {props.value.href}</span>}
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
    alignment: fields.select({
      label: 'Alignment',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' },
      ],
      defaultValue: 'left',
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
      description: 'Tailwind utilities, e.g. text-error font-bold or bg-destructive! text-destructive-foreground!',
      multiline: true,
    }),
  },
  className: ({ value }) => value.className || '',
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
    slug: fields.text({ label: 'Section Slug (used for URL anchors)', validation: { isRequired: true } }),
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
          {props.value.slug && <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>#{props.value.slug}</span>}
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
        <ChecklistItemEditorPreview slug={props.value.slug} />
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

// ─── Config ───────────────────────────────────────────────────────────────────
// PageClient imports this file; use NEXT_PUBLIC_KEYSTATIC_STORAGE so server and browser agree.
// Default: local (unset, empty, or anything other than "github").

/** Draft preview links in Admin (app/preview/start, lib/content-draft.js, lib/github-content.mjs). */
/** Fork vs upstream for preview is synced from GitHub when the admin loads (`PreviewForkSync` + /api/preview/sync-repo). Optional `&repo=` to override. */
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
          description: 'Optional. YYYY-MM-DD format. The announcement will stop showing after this date.',
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
        estimatedTime: fields.text({ label: 'Estimated Time' }),
        excerpt: fields.mdx.inline({ label: 'Summary', options: mdxEditorOptionsContent }),
        relatedGuides: fields.array(
          fields.relationship({
            label: 'Related Guide',
            collection: 'guides',
          }),
          { label: 'Related Guides', itemLabel: (props) => props.value || 'Select guide...' }
        ),
        firstPublished: fields.date({ label: 'First Published' }),
        lastUpdated: fields.date({ label: 'Last Updated' }),
        body: fields.mdx({
          label: 'Guide Content',
          options: mdxEditorOptionsContent,
          components: {
            ...contentComponents,
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
        titleBadges: fields.multiselect({
          label: 'Title Badges',
          options: [{ label: 'Important', value: 'important' }],
        }),
        firstPublished: fields.date({ label: 'First Published' }),
        lastUpdated: fields.date({ label: 'Last Updated' }),
        body: fields.mdx({
          label: 'Body',
          options: mdxEditorOptionsContent,
          components: {
            ...contentComponents,
            Badge: badgeComponent,
            InlineChecklist: wrapper({
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
            }),
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
        image: fields.image({
          label: 'Open Graph Image (optional)',
          description: 'Relative path or full URL for OpenGraph/Twitter image (e.g. /images/content/foo.jpg).',
          directory: 'public/images/content',
          publicPath: '/images/content/',
        }),
        relatedGuides: fields.array(
          fields.relationship({
            label: 'Related Guide',
            collection: 'guides',
          }),
          { label: 'Related Guides', itemLabel: (props) => props.value || 'Select guide...' }
        ),
        firstPublished: fields.date({ label: 'First Published' }),
        lastUpdated: fields.date({ label: 'Last Updated' }),
        // Untranslatable frontmatter: if you add/remove fields here, sync UNTRANSLATABLE_FRONTMATTER_SCALARS in scripts/crowdin-hide-strings.mjs (see lib/content.js readMdxFile).
        showToc: fields.checkbox({
          label: '“On this page” sidebar',
          description:
            'Shows the same left “On this page” table of contents as guides (uses ## headings only).',
          defaultValue: false,
        }),
        body: fields.mdx({
          label: 'Body',
          options: mdxEditorOptionsContent,
          components: contentComponents,
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
        tags: fields.text({ label: 'Tags', description: 'Comma-separated (e.g. ice, surveillance, phones)' }),
        imageOverride: fields.image({
          label: 'Image Override',
          description: 'Overrides the auto-fetched open graph image',
          directory: 'public/images/news',
          publicPath: '/images/news/',
        }),
        firstPublished: fields.ignored(),
        lastUpdated: fields.ignored(),
        body: fields.mdx({
          label: 'Comment (optional)',
          options: mdxEditorOptionsContent,
          components: {},
        }),
      },
    }),

    // ── Changelog ───────────────────────────────────────────────────────────
    changelog: collection({
      label: 'Changelog',
      slugField: 'date',
      path: 'content/en/changelog/*',
      previewUrl: KEYSTATIC_PREVIEW_TO_CHANGELOG,
      format: { contentField: 'body' },
      columns: ['type', 'date'],
      schema: {
        date: fields.text({ label: 'Date (YYYY-MM-DD)', validation: { isRequired: true, length: { min: 10, max: 10 } } }),
        type: fields.select({
          label: 'Type',
          options: [
            { label: 'Minor', value: 'minor' },
            { label: 'Major', value: 'major' },
          ],
          defaultValue: 'minor',
        }),
        body: fields.mdx({
          label: 'Body',
          options: mdxEditorOptionsContent,
          components: {},
        }),
      },
    }),
  },
});
