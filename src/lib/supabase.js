import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gqhfrzvtccxrixdtazzs.supabase.co'
const supabaseKey = 'sb_publishable_F_o1x9xNt9XaEQxFjvmYrA_ctISFrta'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)