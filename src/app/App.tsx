import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { CesiumViewer } from '@/scene/CesiumViewer'
import { TimeSlider } from '@/ui/TimeSlider'
import { BottomBar } from '@/ui/BottomBar'
import { LayerPanel } from '@/ui/LayerPanel'
import { LegendPanel } from '@/ui/LegendPanel'
import { HurricanePanel } from '@/ui/HurricanePanel'
import {
  subscribe as subscribeHurricane,
  getStorms, isHurricaneVisible, isHurricanePanelOpen,
  setHurricanePanelOpen,
} from '@/features/hurricane'
import { SatelliteInfo } from '@/ui/SatelliteInfo'
import { EarthquakeInfo } from '@/ui/EarthquakeInfo'
import { ShipInfo } from '@/ui/ShipInfo'
import { ChatPanel } from '@/ui/ChatPanel'
import { initAI } from '@/ai/init'

export function App() {
  const anthropicKey = useStore(s => s.anthropicKey)

  // Initialize AI system once
  useEffect(() => {
    initAI({ anthropicKey })
  }, [anthropicKey])

  // ── Hurricane panel state (owned by hurricane module) ──
  const [hurricaneTick, setHurricaneTick] = useState(0)
  useEffect(() => subscribeHurricane(() => setHurricaneTick(v => v + 1)), [])
  const hurricanePanelOpen = isHurricanePanelOpen()

  // Auto-open panel when hurricanes first load data, auto-close on hide
  const [hurricaneAutoOpened, setHurricaneAutoOpened] = useState(false)
  useEffect(() => {
    const visible = isHurricaneVisible()
    if (visible && getStorms().length > 0 && !hurricaneAutoOpened) {
      setHurricaneAutoOpened(true)
      setHurricanePanelOpen(true)
    } else if (!visible && hurricanePanelOpen) {
      setHurricanePanelOpen(false)
      setHurricaneAutoOpened(false)
    }
  }, [hurricaneTick, hurricaneAutoOpened]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <CesiumViewer />
      <TimeSlider />
      <BottomBar />
      <LayerPanel />
      <LegendPanel />
      <SatelliteInfo />
      <EarthquakeInfo />
      <ShipInfo />
      <HurricanePanel open={hurricanePanelOpen} onClose={() => setHurricanePanelOpen(false)} />
      <ChatPanel />
    </>
  )
}
