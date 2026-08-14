import {createBrowserClient} from '@supabase/ssr';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://bqktykhknaeuuycquqns.supabase.co';
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_LiwJ6jgLNx8_ZUCHEbJW5g_1WjXFZZQ';
export function createClient(){return createBrowserClient(url,key)}
