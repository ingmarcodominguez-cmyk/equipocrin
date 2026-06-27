import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gqhfrzvtccxrixdtazzs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxaGZyenZ0Y2N4cml4ZHRhenpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTY1MjcsImV4cCI6MjA5NDk3MjUyN30.EpovLKWd8JDZBZegt-Pv8w8W2QkqLrG1Fx7xEZBCjhY'; 

// Esto asegura que el cliente solo se cree una vez
export const supabase = createClient(supabaseUrl, supabaseKey);