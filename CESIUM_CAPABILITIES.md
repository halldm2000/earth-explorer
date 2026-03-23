# CesiumJS Capabilities for Worldscope

A reference of CesiumJS features available for Worldscope extensions, organized by what we already use vs. what's untapped.

## Currently Used

| Feature | How We Use It |
|---------|--------------|
| 3D Globe | Core renderer, terrain, atmosphere |
| Cesium World Terrain | Default terrain with `requestVertexNormals` |
| OSM Buildings | 3D Tiles tileset (Ion asset 96188) |
| Google Photorealistic | 3D Tiles, auto-switches by altitude |
| Imagery layers | WMTS/WMS/XYZ providers (GIBS, OpenSeaMap, etc.) |
| GeoJSON DataSource | Earthquake, hurricane, boundary layers |
| Entity system | Billboards, polylines, polygons, labels |
| Camera controls | flyTo, setView, orbit animation |
| Clock/time system | Playback, time-dependent layers |
| Base map switching | 9 base maps (satellite, dark, light, road, etc.) |
| Per-layer properties | Alpha, brightness, contrast, hue, saturation, gamma |
| Color-to-alpha | Remove backgrounds from overlay layers |
| Depth test vs terrain | Entities behind terrain are occluded |

---

## Quick Wins (Low Effort, High Value)

### Entity Clustering
```typescript
dataSource.clustering.enabled = true
dataSource.clustering.pixelRange = 45
dataSource.clustering.minimumClusterSize = 3
dataSource.clustering.clusterEvent.addEventListener((ids, cluster) => {
  cluster.label.text = ids.length.toString()
})
```
**Impact:** Fixes ship tracker performance, improves earthquake density near fault lines. Toggle `clusterBillboards`, `clusterLabels`, `clusterPoints` independently.

### 2D / Columbus View
```typescript
viewer.scene.mode = Cesium.SceneMode.SCENE2D        // flat map
viewer.scene.mode = Cesium.SceneMode.COLUMBUS_VIEW   // 2.5D
viewer.scene.mode = Cesium.SceneMode.SCENE3D         // globe (default)
```
**Impact:** The "2D/2.5D flat mode" extension is literally one line of code.

### Water Effects
```typescript
viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1, {
  requestWaterMask: true
})
viewer.scene.globe.showWaterEffect = true
viewer.scene.globe.oceanNormalMapUrl = Cesium.buildModuleUrl('Assets/Textures/waterNormals.jpg')
```
**Impact:** Animated ocean waves with sun/moon specular highlights. Free visual upgrade.

### Post-Processing Effects
```typescript
// Bloom (Tron mode foundation)
viewer.scene.postProcessStages.bloom.enabled = true
viewer.scene.postProcessStages.bloom.uniforms.glowOnly = false
viewer.scene.postProcessStages.bloom.uniforms.brightness = 0.1

// Edge detection
const edge = Cesium.PostProcessStageLibrary.createEdgeDetectionStage()
viewer.scene.postProcessStages.add(edge)

// Night vision
const nv = Cesium.PostProcessStageLibrary.createNightVisionStage()
viewer.scene.postProcessStages.add(nv)

// Depth of field
const dof = Cesium.PostProcessStageLibrary.createDepthOfFieldStage()
viewer.scene.postProcessStages.add(dof)

// Lens flare
const flare = Cesium.PostProcessStageLibrary.createLensFlareStage()
viewer.scene.postProcessStages.add(flare)

// Silhouettes
const silhouette = Cesium.PostProcessStageLibrary.createSilhouetteStage()
viewer.scene.postProcessStages.add(silhouette)

// Black and white
const bw = Cesium.PostProcessStageLibrary.createBlackAndWhiteStage()
viewer.scene.postProcessStages.add(bw)
```
**Available effects:** Bloom, depth of field, edge detection, silhouettes, night vision, lens flare, blur, black & white, brightness, FXAA. All one-liners.

### Shadow Mapping
```typescript
viewer.shadows = true
viewer.shadowMap.size = 4096           // resolution (default 2048)
viewer.shadowMap.softShadows = true    // PCF filtering
viewer.shadowMap.darkness = 0.3        // 0=no shadow, 1=fully dark
viewer.shadowMap.maximumDistance = 10000 // meters
```
**Per-entity:** `entity.model.shadows = Cesium.ShadowMode.ENABLED` (also CAST_ONLY, RECEIVE_ONLY, DISABLED).

### Terrain Materials
```typescript
// Elevation contour lines
viewer.scene.globe.material = Cesium.Material.fromType('ElevationContour', {
  width: 2.0,
  spacing: 100.0,  // meters between contours
  color: Cesium.Color.YELLOW
})

// Slope visualization
viewer.scene.globe.material = Cesium.Material.fromType('SlopeRamp')

// Aspect (direction-facing) visualization
viewer.scene.globe.material = Cesium.Material.fromType('AspectRamp')
```
**Impact:** Topographic mode is nearly free. `ElevationContour`, `ElevationRamp`, `SlopeRamp`, `AspectRamp`, `ElevationBand` all available.

### KML / CZML / GPX Loading
```typescript
// KML/KMZ (Google Earth files)
const kml = await Cesium.KmlDataSource.load('data.kml', { camera, canvas, clampToGround: true })
viewer.dataSources.add(kml)
// KML Tours: kml.kmlTours[0].play()

// CZML (time-dynamic scenarios)
const czml = await Cesium.CzmlDataSource.load('scenario.czml')
viewer.dataSources.add(czml)

// GPX (GPS tracks)
const gpx = await Cesium.GpxDataSource.load('track.gpx')
viewer.dataSources.add(gpx)
```
**Impact:** Opens massive ecosystem of existing data files. CZML is especially powerful for time-varying entity scenarios with interpolated positions.

### Request Render Mode
```typescript
viewer.scene.requestRenderMode = true
viewer.scene.maximumRenderTimeChange = Infinity // only render on changes
```
**Impact:** Huge battery/GPU savings on mobile. Only re-renders when the scene actually changes.

### Fog & Atmosphere
```typescript
// Fog
viewer.scene.fog.density = 0.0002
viewer.scene.fog.minimumBrightness = 0.03

// Atmosphere
viewer.scene.atmosphere.hueShift = 0.0
viewer.scene.atmosphere.saturationShift = 0.0
viewer.scene.atmosphere.brightnessShift = 0.0

// Sun bloom
viewer.scene.sunBloom = true
```

---

## Medium Effort, Transformative

### Particle Systems
```typescript
const particleSystem = new Cesium.ParticleSystem({
  image: 'particle.png',
  emitter: new Cesium.ConeEmitter(Cesium.Math.toRadians(30)),
  emissionRate: 100,
  startScale: 1.0,
  endScale: 4.0,
  startColor: Cesium.Color.RED.withAlpha(0.7),
  endColor: Cesium.Color.YELLOW.withAlpha(0.0),
  lifetime: 16.0,
  particleLife: 1.5,
  speed: 5.0,
  modelMatrix: modelMatrix,
  updateCallback: (particle, dt) => {
    // Custom physics: gravity, wind, turbulence
    particle.velocity = Cesium.Cartesian3.add(
      particle.velocity, gravity, particle.velocity
    )
  }
})
viewer.scene.primitives.add(particleSystem)
```
**Emitter types:** CircleEmitter, BoxEmitter, SphereEmitter, ConeEmitter.
**Use cases:** Rain, snow, fire, smoke, volcanic ash, rocket trails, dust storms.

### Terrain Clipping
```typescript
// Clip terrain with planes (cross-section)
viewer.scene.globe.clippingPlanes = new Cesium.ClippingPlaneCollection({
  planes: [new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 0, -1), 0)],
  edgeWidth: 2.0,
  edgeColor: Cesium.Color.RED
})

// Clip terrain with polygons (excavation)
viewer.scene.globe.clippingPolygons = new Cesium.ClippingPolygonCollection({
  polygons: [new Cesium.ClippingPolygon({ positions: [...] })]
})
```
**Impact:** Cut away terrain for geological cross-sections, underground infrastructure, or archaeological excavation visualization.

### Globe Translucency
```typescript
viewer.scene.globe.translucency.enabled = true
viewer.scene.globe.translucency.frontFaceAlpha = 0.5
viewer.scene.globe.translucency.backFaceAlpha = 0.0
// Distance-based: fade as camera approaches
viewer.scene.globe.translucency.frontFaceAlphaByDistance = new Cesium.NearFarScalar(
  100000, 0.0,  // fully transparent at 100km
  1000000, 1.0  // fully opaque at 1000km
)
// Limit to a geographic rectangle
viewer.scene.globe.translucency.rectangle = Cesium.Rectangle.fromDegrees(-100, 25, -80, 50)
```

### Underground Rendering
```typescript
viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
viewer.scene.globe.undergroundColor = Cesium.Color.fromCssColorString('#1a1a2e')
viewer.scene.globe.undergroundColorAlphaByDistance = new Cesium.NearFarScalar(
  1000, 0.0,
  100000, 1.0
)
```

### 3D Model System
```typescript
const entity = viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(lon, lat, height),
  model: {
    uri: 'model.glb',
    scale: 10,
    minimumPixelSize: 64,
    maximumScale: 20000,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    color: Cesium.Color.WHITE.withAlpha(0.8),
    colorBlendMode: Cesium.ColorBlendMode.MIX,
    silhouetteColor: Cesium.Color.CYAN,
    silhouetteSize: 2.0,
    shadows: Cesium.ShadowMode.ENABLED,
    // Animations
    runAnimations: true,
    clampAnimations: true
  }
})

// Articulations (control model parts programmatically)
model.setArticulationStage('SolarPanel Rotation', 45.0)
model.applyArticulations()
```

### Voxel Primitives (Experimental)
```typescript
const voxelPrimitive = new Cesium.VoxelPrimitive({
  provider: new Cesium.Cesium3DTilesVoxelProvider({ url: 'tileset.json' }),
  customShader: new Cesium.CustomShader({
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      float value = fsInput.metadata.temperature;
      material.diffuse = getColorFromValue(value);
    }`
  })
})
```
**Impact:** Volumetric weather model output, subsurface geology, atmospheric cross-sections.

### Cinematic Camera
```typescript
// Multi-waypoint flight
async function cinematicSequence() {
  await viewer.camera.flyTo({
    destination: point1,
    orientation: { heading, pitch, roll },
    duration: 3,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    maximumHeight: 50000 // peak altitude mid-flight
  })
  await viewer.camera.flyTo({
    destination: point2,
    duration: 5,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
  })
}

// Track a moving entity
viewer.trackedEntity = movingEntity

// Orbit around a point
viewer.camera.lookAtTransform(transform)
viewer.clock.onTick.addEventListener(() => {
  viewer.camera.rotateRight(0.005)
})
```

---

## Cesium ion Assets

Ready-to-use assets that enable planned extensions:

| Asset | Ion ID | Use |
|-------|--------|-----|
| Cesium World Terrain | 1 | Default terrain (already used) |
| OSM Buildings | 96188 | 3D buildings (already used) |
| **Cesium Moon Terrain** | TBD | Moon Globe extension |
| **Cesium Mars Terrain** | TBD | Mars Globe extension |
| **Cesium World Bathymetry** | TBD | Ocean floor terrain |
| **Sentinel-2 Imagery** | TBD | 10m cloudless satellite |
| **Bing Maps Aerial** | 2 | High-res aerial imagery |

---

## Scene Picking (for interactive tools)

```typescript
// Top object at pixel
const picked = viewer.scene.pick(windowPosition)

// ALL objects at pixel (drill through layers)
const allPicked = viewer.scene.drillPick(windowPosition)

// World position at pixel (uses depth buffer)
const worldPos = viewer.scene.pickPosition(windowPosition)

// Terrain intersection
const ray = viewer.camera.getPickRay(windowPosition)
const globePos = viewer.scene.globe.pick(ray, viewer.scene)

// Terrain height at a point
const height = viewer.scene.globe.getHeight(cartographic)

// Batch terrain sampling
const positions = await Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics)

// 3D Tiles feature metadata
if (picked instanceof Cesium.Cesium3DTileFeature) {
  const name = picked.getProperty('name')
  const height = picked.getProperty('height')
  picked.color = Cesium.Color.YELLOW // highlight individual feature
}
```

---

## Custom Rendering

### Custom Shaders on 3D Tiles / Models
```typescript
tileset.customShader = new Cesium.CustomShader({
  uniforms: {
    u_time: { type: Cesium.UniformType.FLOAT, value: 0 },
    u_colormap: { type: Cesium.UniformType.SAMPLER_2D, value: textureUrl }
  },
  varyings: {
    v_height: Cesium.VaryingType.FLOAT
  },
  vertexShaderText: `void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
    v_height = vsInput.attributes.positionMC.z;
  }`,
  fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
    material.diffuse = texture(u_colormap, vec2(v_height, 0.5)).rgb;
  }`
})
```

### Custom Post-Process Stage
```typescript
const stage = new Cesium.PostProcessStage({
  fragmentShader: `
    uniform sampler2D colorTexture;
    in vec2 v_textureCoordinates;
    void main() {
      vec4 color = texture(colorTexture, v_textureCoordinates);
      // Tron mode: boost edges, add scanlines
      float scanline = sin(v_textureCoordinates.y * 800.0) * 0.03;
      out_FragColor = vec4(color.rgb + scanline, color.a);
    }
  `
})
viewer.scene.postProcessStages.add(stage)
```

### Polyline Materials
20+ built-in: `PolylineGlow`, `PolylineArrow`, `PolylineDash`, `PolylineOutline`, `Grid`, `Stripe`, `Checkerboard`, `Dot`, `Water`, `RimLighting`, `Fade`.

---

## Split-Screen Comparison
```typescript
// Built into 3D Tiles and imagery layers
tileset.splitDirection = Cesium.SplitDirection.LEFT
imageryLayer.splitDirection = Cesium.SplitDirection.RIGHT
// Slider position
viewer.scene.splitPosition = 0.5 // 0.0 to 1.0
```
**Impact:** Before/after comparison of datasets, time steps, or model outputs.

---

*This document is a reference for building CesiumJS-native extensions. Most "quick wins" require under 50 lines of code.*
