import type { Extension } from '@/extensions/types'
import { boundariesPack } from '../boundaries'

const extension: Extension = {
  ...boundariesPack,
  kind: 'data-pack',
  tags: ['vector', 'borders', 'coastlines', 'rivers', 'natural-earth'],
}

export default extension
