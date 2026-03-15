/**
 * Plugin API implementation.
 *
 * Creates the API object that gets handed to plugins during setup().
 * This is the boundary between stable public interface and internal implementation.
 */

export type { EarthPlugin, ExplorerAPI } from './types'
export type {
  GriddedDataSource, GridRequest, GridResponse,
  PointDataSource, PointRequest, PointResponse, DataPoint,
  TrackDataSource, TrackResponse, Track,
  ColormapDef, PanelDef, VariableDef,
} from './types'
