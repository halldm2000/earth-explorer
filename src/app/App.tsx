import { useStore } from '@/store'
import { SetupScreen } from './SetupScreen'
import { CesiumViewer } from '@/scene/CesiumViewer'

export function App() {
  const token = useStore(s => s.cesiumToken)

  if (!token) {
    return <SetupScreen />
  }

  return <CesiumViewer />
}
