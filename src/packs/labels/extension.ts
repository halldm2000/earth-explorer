import type { Extension } from '@/extensions/types'
import { labelsPack } from '../labels'

const extension: Extension = {
  ...labelsPack,
  kind: 'data-pack',
  tags: ['overlay', 'labels', 'roads', 'cities', 'place-names'],
}

export default extension
