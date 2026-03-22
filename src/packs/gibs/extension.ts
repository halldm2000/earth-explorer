import type { Extension } from '@/extensions/types'
import { gibsPack } from '../gibs'

const extension: Extension = {
  ...gibsPack,
  kind: 'data-pack',
  tags: ['nasa', 'satellite', 'imagery', 'viirs', 'modis', 'gibs'],
}

export default extension
