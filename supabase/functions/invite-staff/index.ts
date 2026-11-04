import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' })

  const authorization = request.headers.get('Authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!token || !url || !anonKey || !serviceRoleKey) {
    return respond(401, { error: 'Authentication or server configuration is unavailable.' })
  }

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userResult, error: userError } = await callerClient.auth.getUser(token)
  if (userError || !userResult.user) return respond(401, { error: 'Authentication required.' })

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role, is_active')
    .eq('id', userResult.user.id)
    .maybeSingle()
  if (profileError || !callerProfile?.is_active || callerProfile.role !== 'admin') {
    return respond(403, { error: 'Administrator access required.' })
  }

  let body: { email?: unknown; full_name?: unknown; role?: unknown }
  try {
    body = await request.json()
  } catch {
    return respond(400, { error: 'Invalid request body.' })
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const role = body.role
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || email.length > 254
    || !fullName
    || fullName.length > 200
    || (role !== 'admin' && role !== 'usher')
  ) {
    return respond(400, { error: 'Provide a valid email, name, and approved staff role.' })
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const appBaseUrl = Deno.env.get('APP_BASE_URL')
  const inviteOptions = appBaseUrl
    ? { data: { full_name: fullName }, redirectTo: `${appBaseUrl.replace(/\/$/, '')}/login` }
    : { data: { full_name: fullName } }
  const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    inviteOptions,
  )
  if (inviteError || !invitation.user) {
    return respond(409, { error: 'Could not invite this account. Check whether the email is already registered.' })
  }

  const { error: insertError } = await adminClient.from('profiles').insert({
    id: invitation.user.id,
    full_name: fullName,
    role,
    is_active: true,
  })
  if (insertError) {
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(invitation.user.id)
    if (cleanupError) {
      console.error('Invite profile creation failed and auth cleanup was unsuccessful.')
      return respond(500, { error: 'Staff profile creation failed. Contact the system administrator to reconcile the invitation.' })
    }
    return respond(500, { error: 'Staff profile could not be created; the new auth account was removed.' })
  }

  return respond(200, { invited: true })
})
