import { createClient } from '@supabase/supabase-js'
import readline from 'readline'

const SUPABASE_URL = 'https://sftkthsgldvyorydznyz.supabase.co'

const OWNER_UID = '4c4518da-502f-498f-b616-8dd98eb1c730'
const CURRENT_EMAIL = '15766@gamail.com'
const TARGET_EMAIL = '15766@gmail.com'

function askForServiceRoleKey() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    rl.question('Paste Supabase service_role key: ', (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function runMaintenance() {
  console.log("=== STARTING OWNER EMAIL TYPO CORRECTION ===")
  
  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!serviceRoleKey) {
    serviceRoleKey = await askForServiceRoleKey()
  }

  if (!serviceRoleKey) {
    console.error("❌ ERROR: Missing SUPABASE_SERVICE_ROLE_KEY.")
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  // Clear variable from scope as soon as it's passed to client
  serviceRoleKey = null

  // A. Verify Owner UID and Current Email
  console.log("1. Fetching owner auth user...")
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(OWNER_UID)
  
  if (authError || !authData.user) {
    console.error("❌ ERROR: Could not fetch user by UID.", authError.message)
    process.exit(1)
  }

  if (authData.user.email !== CURRENT_EMAIL) {
    console.error(`❌ ERROR: Current email is ${authData.user.email}, expected ${CURRENT_EMAIL}.`)
    process.exit(1)
  }

  console.log(`✅ Owner UID and current email verified: ${CURRENT_EMAIL}`)

  // C. Verify Target Email Collision
  console.log("2. Checking if target email is already in use...")
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) {
    console.error("❌ ERROR: Could not list users to verify collision.", listError.message)
    process.exit(1)
  }

  const existingUser = listData.users.find(u => u.email === TARGET_EMAIL)
  if (existingUser) {
    console.error(`❌ ERROR: Target email ${TARGET_EMAIL} is already used by UID: ${existingUser.id}`)
    process.exit(1)
  }

  console.log("✅ Target email is not in use.")

  // D. Admin update Auth Email
  console.log(`3. Updating Auth Email to ${TARGET_EMAIL}...`)
  const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(OWNER_UID, {
    email: TARGET_EMAIL,
    email_confirm: true
  })

  if (updateError || !updateData.user) {
    console.error("❌ ERROR: Failed to update Auth Email.", updateError.message)
    process.exit(1)
  }

  // E. Verify Auth User is still the same UID
  if (updateData.user.id !== OWNER_UID) {
    console.error("❌ CRITICAL ERROR: Updated user has different UID!")
    process.exit(1)
  }

  if (updateData.user.email !== TARGET_EMAIL) {
    console.error(`❌ ERROR: Auth email did not change to ${TARGET_EMAIL}. It is ${updateData.user.email}`)
    process.exit(1)
  }

  console.log("✅ Auth Email successfully updated.")

  // F. Update profiles.email
  console.log("4. Updating public.profiles.email...")
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ email: TARGET_EMAIL })
    .eq('id', OWNER_UID)

  if (profileError) {
    console.error("❌ ERROR: Failed to update public.profiles.email.", profileError.message)
    console.log("⚠️ WARNING: Auth Email was updated, but Profile Email failed. Data is out of sync!")
    process.exit(1)
  }

  // G. Verify Auth Email + Profile Email Match
  const { data: profileCheck } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', OWNER_UID)
    .single()

  if (profileCheck?.email !== TARGET_EMAIL) {
    console.error("❌ ERROR: Profile email verification failed.")
    process.exit(1)
  }

  console.log("✅ Profile Email successfully updated and verified.")
  console.log("=== MAINTENANCE COMPLETE ===")
}

runMaintenance().catch(err => {
  console.error("❌ UNEXPECTED ERROR:", err.message)
  process.exit(1)
})
