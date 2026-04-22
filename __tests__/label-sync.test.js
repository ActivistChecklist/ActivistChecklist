import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import yaml from 'js-yaml'

// Mirrors the extraction logic from .github/workflows/label-sync.yml
function extractLabelsFromLabelsYml(text) {
  return [...text.matchAll(/^- name:\s*"([^"]+)"/gm)].map((m) => m[1]).sort()
}

function extractLabelsFromCodeRabbit(text) {
  return [...text.matchAll(/^\s*-\s*label:\s*"([^"]+)"/gm)]
    .map((m) => m[1])
    .sort()
}

function findMismatches(labels, rabbitLabels) {
  const missingInRabbit = labels.filter((name) => !rabbitLabels.includes(name))
  const missingInLabels = rabbitLabels.filter((name) => !labels.includes(name))
  return { missingInRabbit, missingInLabels }
}

const LABELS_YML_PATH = resolve('.github/labels.yml')
const CODERABBIT_YAML_PATH = resolve('.coderabbit.yaml')

const EXPECTED_LABELS = [
  'bug 🐛',
  'feature ✨',
  'content 📝',
  'documentation 📖',
  'security 🔐',
  'i18n 🌐',
  'ux 🎨',
  'infrastructure 🦺',
  'backlog 🧠',
  'question ❓',
  'duplicate 🔁',
  'wontfix 🚫',
  'good first issue 🌱',
  'effort: low ⚡',
  'effort: medium 🕔',
  'effort: high 🏔️',
  'priority: high 🔴',
  'priority: medium 🟡',
  'priority: low 🟢',
]

// ---------------------------------------------------------------------------
// Unit tests: extractLabelsFromLabelsYml regex
// ---------------------------------------------------------------------------
describe('extractLabelsFromLabelsYml', () => {
  it('extracts a single label name', () => {
    const text = '- name: "bug 🐛"\n  color: "d73a4a"\n'
    expect(extractLabelsFromLabelsYml(text)).toEqual(['bug 🐛'])
  })

  it('extracts multiple label names and sorts them', () => {
    const text = [
      '- name: "ux 🎨"',
      '  color: "c2e0c6"',
      '- name: "bug 🐛"',
      '  color: "d73a4a"',
    ].join('\n')
    expect(extractLabelsFromLabelsYml(text)).toEqual(['bug 🐛', 'ux 🎨'])
  })

  it('returns an empty array for text with no matching labels', () => {
    expect(extractLabelsFromLabelsYml('color: "ffffff"\ndescription: "foo"')).toEqual([])
  })

  it('ignores comment lines that look like label entries', () => {
    // Lines starting with # should not be matched by /^- name:/
    const text = '# - name: "fake"\n- name: "real"\n'
    expect(extractLabelsFromLabelsYml(text)).toEqual(['real'])
  })

  it('does not match lines that only have name as a nested key (indented)', () => {
    // The regex anchors at ^- name:, so indented variants should not match
    const text = '  - name: "nested"\n- name: "top-level"\n'
    // "  - name:" starts with spaces so it does NOT match /^- name:/
    expect(extractLabelsFromLabelsYml(text)).toEqual(['top-level'])
  })

  it('handles empty string input', () => {
    expect(extractLabelsFromLabelsYml('')).toEqual([])
  })

  it('handles label names with special emoji characters', () => {
    const text = '- name: "effort: high 🏔️"\n'
    expect(extractLabelsFromLabelsYml(text)).toEqual(['effort: high 🏔️'])
  })

  it('handles label names with colons and spaces', () => {
    const text = '- name: "priority: medium 🟡"\n'
    expect(extractLabelsFromLabelsYml(text)).toEqual(['priority: medium 🟡'])
  })
})

// ---------------------------------------------------------------------------
// Unit tests: extractLabelsFromCodeRabbit regex
// ---------------------------------------------------------------------------
describe('extractLabelsFromCodeRabbit', () => {
  it('extracts a single label from a labeling_instructions entry', () => {
    const text = '      - label: "bug 🐛"\n        instructions: "broken"\n'
    expect(extractLabelsFromCodeRabbit(text)).toEqual(['bug 🐛'])
  })

  it('extracts multiple labels and sorts them', () => {
    const text = [
      '      - label: "ux 🎨"',
      '        instructions: "design"',
      '      - label: "bug 🐛"',
      '        instructions: "broken"',
    ].join('\n')
    expect(extractLabelsFromCodeRabbit(text)).toEqual(['bug 🐛', 'ux 🎨'])
  })

  it('returns an empty array for text with no matching entries', () => {
    expect(extractLabelsFromCodeRabbit('language: "en-US"\n')).toEqual([])
  })

  it('handles varying indentation levels', () => {
    // The regex /^\s*-\s*label:/ allows any leading whitespace
    const text = '- label: "a"\n  - label: "b"\n      - label: "c"\n'
    expect(extractLabelsFromCodeRabbit(text)).toEqual(['a', 'b', 'c'])
  })

  it('handles empty string input', () => {
    expect(extractLabelsFromCodeRabbit('')).toEqual([])
  })

  it('handles emoji-heavy label names', () => {
    const text = '      - label: "effort: high 🏔️"\n'
    expect(extractLabelsFromCodeRabbit(text)).toEqual(['effort: high 🏔️'])
  })
})

// ---------------------------------------------------------------------------
// Unit tests: findMismatches
// ---------------------------------------------------------------------------
describe('findMismatches', () => {
  it('returns empty arrays when both sets are identical', () => {
    const labels = ['bug', 'feature', 'security']
    const rabbitLabels = ['bug', 'feature', 'security']
    const result = findMismatches(labels, rabbitLabels)
    expect(result.missingInRabbit).toEqual([])
    expect(result.missingInLabels).toEqual([])
  })

  it('detects a label present in labels.yml but missing from .coderabbit.yaml', () => {
    const labels = ['bug', 'feature', 'new-label']
    const rabbitLabels = ['bug', 'feature']
    const result = findMismatches(labels, rabbitLabels)
    expect(result.missingInRabbit).toEqual(['new-label'])
    expect(result.missingInLabels).toEqual([])
  })

  it('detects a label present in .coderabbit.yaml but missing from labels.yml', () => {
    const labels = ['bug', 'feature']
    const rabbitLabels = ['bug', 'feature', 'orphan-label']
    const result = findMismatches(labels, rabbitLabels)
    expect(result.missingInRabbit).toEqual([])
    expect(result.missingInLabels).toEqual(['orphan-label'])
  })

  it('detects mismatches in both directions simultaneously', () => {
    const labels = ['bug', 'only-in-labels']
    const rabbitLabels = ['bug', 'only-in-rabbit']
    const result = findMismatches(labels, rabbitLabels)
    expect(result.missingInRabbit).toEqual(['only-in-labels'])
    expect(result.missingInLabels).toEqual(['only-in-rabbit'])
  })

  it('returns empty arrays for two empty sets', () => {
    const result = findMismatches([], [])
    expect(result.missingInRabbit).toEqual([])
    expect(result.missingInLabels).toEqual([])
  })

  it('handles all labels missing from one side', () => {
    const labels = ['bug', 'feature']
    const rabbitLabels = []
    const result = findMismatches(labels, rabbitLabels)
    expect(result.missingInRabbit).toEqual(['bug', 'feature'])
    expect(result.missingInLabels).toEqual([])
  })

  it('is case-sensitive in label comparisons', () => {
    const labels = ['Bug']
    const rabbitLabels = ['bug']
    const result = findMismatches(labels, rabbitLabels)
    expect(result.missingInRabbit).toEqual(['Bug'])
    expect(result.missingInLabels).toEqual(['bug'])
  })
})

// ---------------------------------------------------------------------------
// Integration tests: actual file contents
// ---------------------------------------------------------------------------
describe('label-sync integration: actual files', () => {
  it('labels.yml and .coderabbit.yaml label sets are in sync', () => {
    const labelsText = readFileSync(LABELS_YML_PATH, 'utf8')
    const rabbitText = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    const labels = extractLabelsFromLabelsYml(labelsText)
    const rabbitLabels = extractLabelsFromCodeRabbit(rabbitText)
    const { missingInRabbit, missingInLabels } = findMismatches(labels, rabbitLabels)
    expect(missingInRabbit).toEqual([])
    expect(missingInLabels).toEqual([])
  })

  it('labels.yml contains exactly the expected label names', () => {
    const labelsText = readFileSync(LABELS_YML_PATH, 'utf8')
    const labels = extractLabelsFromLabelsYml(labelsText)
    expect(labels).toEqual([...EXPECTED_LABELS].sort())
  })

  it('.coderabbit.yaml contains exactly the expected label names', () => {
    const rabbitText = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    const rabbitLabels = extractLabelsFromCodeRabbit(rabbitText)
    expect(rabbitLabels).toEqual([...EXPECTED_LABELS].sort())
  })

  it('neither file contains duplicate label names', () => {
    const labelsText = readFileSync(LABELS_YML_PATH, 'utf8')
    const rabbitText = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    const labels = extractLabelsFromLabelsYml(labelsText)
    const rabbitLabels = extractLabelsFromCodeRabbit(rabbitText)
    expect(labels.length).toBe(new Set(labels).size)
    expect(rabbitLabels.length).toBe(new Set(rabbitLabels).size)
  })
})

// ---------------------------------------------------------------------------
// Structure tests: labels.yml YAML validity
// ---------------------------------------------------------------------------
describe('labels.yml structure', () => {
  let parsed

  it('is valid YAML', () => {
    const text = readFileSync(LABELS_YML_PATH, 'utf8')
    expect(() => {
      parsed = yaml.load(text)
    }).not.toThrow()
  })

  it('is an array of label objects', () => {
    const text = readFileSync(LABELS_YML_PATH, 'utf8')
    parsed = yaml.load(text)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBeGreaterThan(0)
  })

  it('every label entry has a non-empty name', () => {
    const text = readFileSync(LABELS_YML_PATH, 'utf8')
    parsed = yaml.load(text)
    for (const entry of parsed) {
      expect(typeof entry.name).toBe('string')
      expect(entry.name.trim().length).toBeGreaterThan(0)
    }
  })

  it('every label entry has a color field', () => {
    const text = readFileSync(LABELS_YML_PATH, 'utf8')
    parsed = yaml.load(text)
    for (const entry of parsed) {
      expect(entry).toHaveProperty('color')
      expect(typeof entry.color).toBe('string')
    }
  })

  it('every color is a valid 6-character hex string', () => {
    const text = readFileSync(LABELS_YML_PATH, 'utf8')
    parsed = yaml.load(text)
    for (const entry of parsed) {
      expect(entry.color).toMatch(/^[0-9a-fA-F]{6}$/)
    }
  })

  it('every label entry has a description field', () => {
    const text = readFileSync(LABELS_YML_PATH, 'utf8')
    parsed = yaml.load(text)
    for (const entry of parsed) {
      expect(entry).toHaveProperty('description')
      expect(typeof entry.description).toBe('string')
      expect(entry.description.trim().length).toBeGreaterThan(0)
    }
  })

  it('each entry has exactly the expected keys: name, color, description', () => {
    const text = readFileSync(LABELS_YML_PATH, 'utf8')
    parsed = yaml.load(text)
    for (const entry of parsed) {
      const keys = Object.keys(entry).sort()
      expect(keys).toEqual(['color', 'description', 'name'])
    }
  })

  it('contains the expected number of labels (19)', () => {
    const text = readFileSync(LABELS_YML_PATH, 'utf8')
    parsed = yaml.load(text)
    expect(parsed.length).toBe(19)
  })
})

// ---------------------------------------------------------------------------
// Structure tests: .coderabbit.yaml validity
// ---------------------------------------------------------------------------
describe('.coderabbit.yaml structure', () => {
  let parsed

  it('is valid YAML', () => {
    const text = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    expect(() => {
      parsed = yaml.load(text)
    }).not.toThrow()
  })

  it('has language set to en-US', () => {
    const text = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    parsed = yaml.load(text)
    expect(parsed.language).toBe('en-US')
  })

  it('has auto_apply_labels set to true', () => {
    const text = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    parsed = yaml.load(text)
    expect(parsed.issue_enrichment.labeling.auto_apply_labels).toBe(true)
  })

  it('labeling_instructions is a non-empty array', () => {
    const text = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    parsed = yaml.load(text)
    const instructions = parsed.issue_enrichment.labeling.labeling_instructions
    expect(Array.isArray(instructions)).toBe(true)
    expect(instructions.length).toBeGreaterThan(0)
  })

  it('every labeling_instruction has a non-empty label field', () => {
    const text = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    parsed = yaml.load(text)
    const instructions = parsed.issue_enrichment.labeling.labeling_instructions
    for (const entry of instructions) {
      expect(typeof entry.label).toBe('string')
      expect(entry.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('every labeling_instruction has a non-empty instructions field', () => {
    const text = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    parsed = yaml.load(text)
    const instructions = parsed.issue_enrichment.labeling.labeling_instructions
    for (const entry of instructions) {
      expect(typeof entry.instructions).toBe('string')
      expect(entry.instructions.trim().length).toBeGreaterThan(0)
    }
  })

  it('contains the expected number of labeling instructions (19)', () => {
    const text = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    parsed = yaml.load(text)
    const instructions = parsed.issue_enrichment.labeling.labeling_instructions
    expect(instructions.length).toBe(19)
  })

  it('reviews.auto_review.enabled is true', () => {
    const text = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    parsed = yaml.load(text)
    expect(parsed.reviews.auto_review.enabled).toBe(true)
  })

  it('reviews.auto_review.drafts is false', () => {
    const text = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    parsed = yaml.load(text)
    expect(parsed.reviews.auto_review.drafts).toBe(false)
  })

  it('reviews.path_filters excludes lock files', () => {
    const text = readFileSync(CODERABBIT_YAML_PATH, 'utf8')
    parsed = yaml.load(text)
    const filters = parsed.reviews.path_filters
    expect(filters).toContain('!**/*.lock')
    expect(filters).toContain('!**/yarn.lock')
    expect(filters).toContain('!**/package-lock.json')
  })
})

// ---------------------------------------------------------------------------
// Regression / boundary tests
// ---------------------------------------------------------------------------
describe('label-sync regression and edge cases', () => {
  it('regex does not match a line with label as a key inside instructions text', () => {
    // The instructions value mentions "label" but should not be extracted
    const text = [
      '      - label: "real-label"',
      '        instructions: "Apply the label when..."',
    ].join('\n')
    const result = extractLabelsFromCodeRabbit(text)
    expect(result).toEqual(['real-label'])
  })

  it('extractLabelsFromLabelsYml handles CRLF line endings', () => {
    const text = '- name: "bug 🐛"\r\n  color: "d73a4a"\r\n- name: "feature ✨"\r\n'
    // With CRLF, the regex /^- name:/gm should still match at start of lines
    const result = extractLabelsFromLabelsYml(text)
    expect(result).toEqual(['bug 🐛', 'feature ✨'])
  })

  it('sync check treats label sets as equivalent regardless of definition order', () => {
    // Labels defined in different order should still pass the sync check
    const labelsText = '- name: "b"\n- name: "a"\n'
    const rabbitText = '- label: "a"\n- label: "b"\n'
    const labels = extractLabelsFromLabelsYml(labelsText)
    const rabbitLabels = extractLabelsFromCodeRabbit(rabbitText)
    const { missingInRabbit, missingInLabels } = findMismatches(labels, rabbitLabels)
    expect(missingInRabbit).toEqual([])
    expect(missingInLabels).toEqual([])
  })

  it('a single extra label in labels.yml produces exactly one mismatch entry', () => {
    const labelsText = EXPECTED_LABELS.map((n) => `- name: "${n}"`).join('\n') + '\n- name: "extra"\n'
    const rabbitText = EXPECTED_LABELS.map((n) => `  - label: "${n}"`).join('\n')
    const labels = extractLabelsFromLabelsYml(labelsText)
    const rabbitLabels = extractLabelsFromCodeRabbit(rabbitText)
    const { missingInRabbit } = findMismatches(labels, rabbitLabels)
    expect(missingInRabbit).toEqual(['extra'])
  })

  it('a single extra label in .coderabbit.yaml produces exactly one mismatch entry', () => {
    const labelsText = EXPECTED_LABELS.map((n) => `- name: "${n}"`).join('\n')
    const rabbitText = EXPECTED_LABELS.map((n) => `  - label: "${n}"`).join('\n') + '\n  - label: "extra"\n'
    const labels = extractLabelsFromLabelsYml(labelsText)
    const rabbitLabels = extractLabelsFromCodeRabbit(rabbitText)
    const { missingInLabels } = findMismatches(labels, rabbitLabels)
    expect(missingInLabels).toEqual(['extra'])
  })
})