async function parseJson(response) {
  let payload = {};
  try {
    payload = await response.json();
  } catch (_err) {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function fetchThreads({ path, locale, scope }) {
  const params = new URLSearchParams({
    path,
    locale,
    scopeKey: scope.scopeKey,
    repoFullName: scope.repoFullName,
    prNumber: scope.prNumber,
    deploymentKey: scope.deploymentKey,
  });
  const response = await fetch(`/api/annotations?${params.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  });
  return parseJson(response);
}

export async function fetchOverview() {
  const response = await fetch('/api/annotations/overview', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  });
  return parseJson(response);
}

export async function createThread(payload) {
  const response = await fetch('/api/annotations/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function createComment(payload) {
  const response = await fetch('/api/annotations/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function patchThreadStatus(threadId, status, scope) {
  const response = await fetch(`/api/annotations/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ status, scope }),
  });
  return parseJson(response);
}

export async function patchComment(commentId, comment) {
  const response = await fetch(`/api/annotations/comments/${commentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ comment }),
  });
  return parseJson(response);
}

export async function deleteComment(commentId) {
  const response = await fetch(`/api/annotations/comments/${commentId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  });
  return parseJson(response);
}
