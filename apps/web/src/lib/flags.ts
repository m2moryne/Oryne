/**
 * The preview account: the dashboards on sample data, for pitches. Hidden
 * unless the build has VITE_PREVIEW=1 (in Vercel: Settings → Environment
 * Variables, then redeploy). Off, /demo and /dev go to the real sign-in and
 * nothing links to them; the sample data stays in the code.
 */
export const PREVIEW_ON = import.meta.env.VITE_PREVIEW === '1'
