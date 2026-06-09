import { runImapJob } from '../../server/imap-jobs'

export default async (request: Request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = (await request.json().catch(() => ({}))) as { jobId?: string }

  if (!body.jobId) {
    return new Response(JSON.stringify({ error: 'jobId fehlt.' }), {
      headers: { 'content-type': 'application/json' },
      status: 400,
    })
  }

  await runImapJob(body.jobId)

  return new Response(JSON.stringify({ data: { accepted: true } }), {
    headers: { 'content-type': 'application/json' },
    status: 202,
  })
}
