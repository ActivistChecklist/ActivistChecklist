import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const LIB = path.resolve(import.meta.dirname, '../scripts/lib/listmonk-roundtrip.sh')

/** Run classify_roundtrip from the shell lib and return its verdict. */
function classify(code, body = '') {
  return execFileSync(
    'bash',
    ['-c', 'source "$1"; classify_roundtrip "$2" "$3"', 'bash', LIB, String(code), body],
    { encoding: 'utf8' }
  ).trim()
}

describe('classify_roundtrip', () => {
  it('passes when the site API reports a successful subscribe', () => {
    expect(classify(200, '{"success":true,"status":200,"data":{"id":42}}')).toBe('PASS')
  })

  // The whole reason this monitor exists: api/subscribe.js returns its result
  // object rather than setting a status, so a dead listmonk still answers 200.
  it('fails on HTTP 200 that carries success:false', () => {
    expect(
      classify(200, '{"success":false,"status":500,"error":"Something went wrong. Please try again."}')
    ).toBe('FAIL')
  })

  it('fails on HTTP 200 with an empty or non-JSON body', () => {
    expect(classify(200, '')).toBe('FAIL')
    expect(classify(200, '<html>maintenance</html>')).toBe('FAIL')
  })

  it('does not match a success field that is false-y or renamed', () => {
    expect(classify(200, '{"success":"true"}')).toBe('FAIL')
    expect(classify(200, '{"successful":true}')).toBe('FAIL')
  })

  it('tolerates whitespace around the success value', () => {
    expect(classify(200, '{ "success" : true }')).toBe('PASS')
  })

  // Rate limiting proves nothing either way, and must never trigger a restart.
  it('treats rate limiting as inconclusive', () => {
    expect(classify(429, '<html><title>429 Too Many Requests</title></html>')).toBe('INCONCLUSIVE')
    expect(classify(429, '{"statusCode":429,"error":"Too Many Requests"}')).toBe('INCONCLUSIVE')
  })

  it('flags client-side rejections as monitor misconfiguration', () => {
    for (const code of [400, 401, 403, 404, 405, 422]) {
      expect(classify(code, '{"error":"nope"}')).toBe('BAD_REQUEST')
    }
  })

  // Restarting listmonk cannot fix a dead site API, so these stay distinct.
  it('reports upstream failures when the site API is unreachable or erroring', () => {
    expect(classify('000', '')).toBe('UPSTREAM_DOWN')
    expect(classify(500, 'boom')).toBe('UPSTREAM_DOWN')
    expect(classify(502, '<html>502</html>')).toBe('UPSTREAM_DOWN')
    expect(classify(503, '<html>Service Unavailable</html>')).toBe('UPSTREAM_DOWN')
  })

  it('does not treat unexpected 2xx/3xx as a healthy round trip', () => {
    expect(classify(204, '')).toBe('UPSTREAM_DOWN')
    expect(classify(301, '')).toBe('UPSTREAM_DOWN')
  })
})
