import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const LIB = path.resolve(import.meta.dirname, '../scripts/lib/api-probe.sh')

const MARKER = 'Hello World'

/** Run classify_api_probe from the shell lib and return its verdict. */
function classify(code, body = '', marker = MARKER) {
  return execFileSync(
    'bash',
    [
      '-c',
      'source "$1"; classify_api_probe "$2" "$3" "$4"',
      'bash',
      LIB,
      String(code),
      body,
      marker,
    ],
    { encoding: 'utf8' }
  ).trim()
}

describe('classify_api_probe', () => {
  it('passes when the API serves the expected payload', () => {
    expect(classify(200, '{"message":"Hello World"}')).toBe('PASS')
  })

  // The whole reason the probe reads the body: handlers in this API return their
  // result object instead of setting a status, so Fastify answers 200 on failure
  // (api/subscribe.js). A status-code-only probe would call all of these healthy.
  it('fails on HTTP 200 whose body is not our payload', () => {
    expect(classify(200, '{"success":false,"error":"Something went wrong."}')).toBe('FAIL')
    expect(classify(200, '{"statusCode":500,"error":"Internal Server Error"}')).toBe('FAIL')
    expect(classify(200, '<html><body>Maintenance</body></html>')).toBe('FAIL')
    expect(classify(200, '')).toBe('FAIL')
  })

  it('does not accept a near-miss payload from another process on the port', () => {
    expect(classify(200, '{"message":"hello world"}')).toBe('FAIL')
    expect(classify(200, '{"message":"Hello"}')).toBe('FAIL')
  })

  it('matches the marker anywhere in the body, whatever the serializer spacing', () => {
    expect(classify(200, '{ "message" : "Hello World" }')).toBe('PASS')
    expect(classify(200, '{"ok":true,"message":"Hello World","v":2}')).toBe('PASS')
  })

  it('treats the marker as a fixed string, not a pattern', () => {
    // A regex-y marker must only match itself; otherwise an operator-set marker
    // could silently match far more than intended.
    expect(classify(200, '{"message":"Hello World"}', 'H.*d')).toBe('FAIL')
    expect(classify(200, '{"message":"H.*d"}', 'H.*d')).toBe('PASS')
  })

  it('never passes when no marker is configured', () => {
    expect(classify(200, '{"message":"Hello World"}', '')).toBe('FAIL')
  })

  // Rate limiting proves nothing either way, and must never trigger a restart.
  it('treats rate limiting as inconclusive', () => {
    expect(classify(429, '{"statusCode":429,"error":"Too Many Requests"}')).toBe('INCONCLUSIVE')
    expect(classify(429, '<html><title>429 Too Many Requests</title></html>')).toBe('INCONCLUSIVE')
  })

  // Restarting ac-api cannot fix a probe pointed at the wrong URL, so these stay
  // distinct from DOWN even though both end up red.
  it('flags client-side rejections as monitor misconfiguration', () => {
    for (const code of [400, 401, 403, 404, 405, 422]) {
      expect(classify(code, '{"error":"nope"}')).toBe('BAD_REQUEST')
    }
  })

  // Unlike the listmonk round trip, an unreachable upstream here IS our service.
  it('reports DOWN when nothing answered or the API is erroring', () => {
    expect(classify('000', '')).toBe('DOWN')
    expect(classify(500, '{"statusCode":500}')).toBe('DOWN')
    expect(classify(502, '<html>502 Bad Gateway</html>')).toBe('DOWN')
    expect(classify(503, '<html>Service Unavailable</html>')).toBe('DOWN')
  })

  it('does not treat an unexpected 2xx/3xx as healthy', () => {
    expect(classify(204, '')).toBe('FAIL')
    expect(classify(301, '')).toBe('FAIL')
    expect(classify(302, 'Found')).toBe('FAIL')
  })
})
