import { describe, it, expect } from 'vitest'
import {
  isDbConnectivityError,
  describeDbConnectivityError,
} from '../lib/review-comments/db-errors'

// Reconstructs the real Railway failure: a MongoServerSelectionError whose
// innermost cause is a getaddrinfo ENOTFOUND DNS error. The outer error carries
// no code/hostname; the network-level cause does.
function railwayEnotfoundError() {
  const dns = Object.assign(new Error('getaddrinfo ENOTFOUND mongodb.railway.internal'), {
    name: 'Error',
    errno: -3008,
    code: 'ENOTFOUND',
    syscall: 'getaddrinfo',
    hostname: 'mongodb.railway.internal',
  })
  const network = Object.assign(new Error('getaddrinfo ENOTFOUND mongodb.railway.internal'), {
    name: 'MongoNetworkError',
    cause: dns,
  })
  return Object.assign(new Error('getaddrinfo ENOTFOUND mongodb.railway.internal'), {
    name: 'MongoServerSelectionError',
    code: undefined,
    cause: network,
  })
}

describe('isDbConnectivityError', () => {
  it('detects the nested Railway ENOTFOUND failure', () => {
    expect(isDbConnectivityError(railwayEnotfoundError())).toBe(true)
  })

  it('detects a DNS failure buried in the cause chain even when outer name/message are generic', () => {
    const dns = Object.assign(new Error('lookup failed'), { code: 'ENOTFOUND' })
    const wrapper = Object.assign(new Error('operation failed'), { name: 'Error', cause: dns })
    expect(isDbConnectivityError(wrapper)).toBe(true)
  })

  it('detects ECONNREFUSED by code', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:27017'), {
      code: 'ECONNREFUSED',
    })
    expect(isDbConnectivityError(err)).toBe(true)
  })

  it('detects MongoServerSelectionError by name alone', () => {
    const err = Object.assign(new Error('Server selection timed out'), {
      name: 'MongoServerSelectionError',
    })
    expect(isDbConnectivityError(err)).toBe(true)
  })

  it('detects the missing-connection-string error from message', () => {
    expect(isDbConnectivityError(new Error('Missing REVIEW_COMMENTS_MONGODB_URL'))).toBe(true)
  })

  it('does NOT treat a genuine application bug as a connectivity error', () => {
    expect(isDbConnectivityError(new TypeError("Cannot read properties of undefined"))).toBe(false)
  })

  it('does NOT flag an unrelated Mongo write error', () => {
    const err = Object.assign(new Error('E11000 duplicate key error'), {
      name: 'MongoServerError',
      code: 11000,
    })
    expect(isDbConnectivityError(err)).toBe(false)
  })

  it('returns false for null / undefined / non-object input', () => {
    expect(isDbConnectivityError(null)).toBe(false)
    expect(isDbConnectivityError(undefined)).toBe(false)
    expect(isDbConnectivityError('ENOTFOUND')).toBe(false)
  })

  it('does not loop forever on a self-referential cause chain', () => {
    const err = new Error('boom')
    err.cause = err
    expect(isDbConnectivityError(err)).toBe(false)
  })
})

describe('describeDbConnectivityError', () => {
  it('extracts code and hostname from the innermost cause', () => {
    expect(describeDbConnectivityError(railwayEnotfoundError())).toEqual({
      code: 'ENOTFOUND',
      hostname: 'mongodb.railway.internal',
    })
  })

  it('returns an empty object when no code/hostname is present', () => {
    expect(describeDbConnectivityError(new Error('Missing REVIEW_COMMENTS_MONGODB_URL'))).toEqual({})
  })

  it('never returns undefined for empty input', () => {
    expect(describeDbConnectivityError(null)).toEqual({})
  })
})
