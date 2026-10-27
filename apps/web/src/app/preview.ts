import { useNavigate } from 'react-router-dom'
import { useStore } from './store'

export { PREVIEW_ON } from '../lib/flags'

/** The one user the in-browser store knows: the preview account, on sample data. */
export const PREVIEW_USER = { name: 'Preview account', email: 'Sample data', provider: 'Preview' }

/** Signs in to the preview account (no backend) and opens `path` in it. */
export function useEnterPreview() {
  const { dispatch } = useStore()
  const navigate = useNavigate()
  return (path = '/demo') => {
    dispatch({ type: 'signIn', user: PREVIEW_USER })
    navigate(path)
  }
}
