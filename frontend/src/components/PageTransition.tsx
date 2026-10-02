import { useLocation, useOutlet } from 'react-router-dom'

/** Fades/slides each route's content in on navigation, so moving between
 * sections feels like a transition rather than an abrupt swap. */
export function PageTransition() {
  const location = useLocation()
  const element = useOutlet()

  return (
    <div key={location.pathname} className="h-full animate-page-in">
      {element}
    </div>
  )
}
