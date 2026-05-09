import { createClient } from '@supabase/supabase-js'

// TODO: 替换成你自己的 Supabase 项目信息
const supabaseUrl = 'https://qzzpkhtonfucxjssvmux.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6enBraHRvbmZ1Y3hqc3N2bXV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMDc2NDUsImV4cCI6MjA5Mzg4MzY0NX0.0Ctq5qZ8aKX_nxPLsly5foiPJcqKAGCBulx0VDKQpFE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
