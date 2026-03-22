import type { Extension } from '@/extensions/types'
import { openseamapPack } from '../openseamap'

const extension: Extension = {
  ...openseamapPack,
  kind: 'data-pack',
  tags: ['marine', 'nautical', 'chart', 'buoys', 'harbors', 'navigation'],
}

export default extension
