// Local-only: run the E2E suite against the dev server on :3100 (local Supabase stack).
import base from './playwright.config'
export default { ...base, use: { ...base.use, baseURL: 'http://localhost:3100' }, webServer: undefined }
