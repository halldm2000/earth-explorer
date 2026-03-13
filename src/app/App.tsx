import { useEffect } from 'react'
import { useStore } from '@/store'
import { SetupScreen } from './SetupScreen'
import { CesiumViewer } from '@/scene/CesiumViewer'
import { ChatPanel } from '@/ui/ChatPanel'
import { initAI } from '@/ai/init'

export function App() {
  const token = useStore(s => s.cesiumToken)
  const anthropicKey = useStore(s => s.anthropicKey)

  // Initialize AI system once
  useEffect(() => {
    initAI({ anthropicKey })
  }, [anthropicKey])

  if (!token) {
    return <SetupScreen />
  }

  return (
    <>
      <CesiumViewer />
      <ChatPanel />
    </>
  )
}
