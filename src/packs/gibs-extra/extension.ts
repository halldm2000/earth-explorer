import type { Extension } from '@/extensions/types'
import { gibsExtraPack } from '../gibs-extra'

const extension: Extension = {
  ...gibsExtraPack,
  kind: 'data-pack',
  tags: ['nasa', 'satellite', 'imagery', 'ndvi', 'snow', 'aerosol', 'temperature', 'gibs'],
}

export default extension
