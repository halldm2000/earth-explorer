# Worldscope Extension Ideas

A comprehensive catalog of extensions for the Worldscope platform, organized by `ExtensionKind`. Extensions range from data format capabilities and visual themes to full interactive apps and compute backends.

**Legend:**
- **(done)** — Implemented and working
- **(in progress)** — Actively being developed
- **(planned)** — Designed but not yet started
- `exclusiveGroup: X` — only one extension from group X can be active at a time
- `companions: [...]` — works well alongside the listed extensions

---

## Capabilities (`kind: capability`)

Data format parsers, rendering features, and visualization tools that other extensions can build on.

### Data Formats
- **NetCDF File Reader** — Parse and visualize NetCDF (.nc) data in-browser; support CF conventions, coordinate variables, and time dimensions *(planned)*
- **HEALPix Format Support** — Recognize and render HEALPix grid data (FITS/binary); map hierarchical equal-area pixels to the globe *(planned)*
- **GRIB File Reader** — Parse GRIB1/GRIB2 weather and climate data; extract fields, levels, and forecast times *(planned)*
- **CSV Data Loader** — Import point and gridded data from CSV files; auto-detect lat/lon columns, support value-based coloring *(planned)*
- **GeoJSON Support** — Load and render GeoJSON features on the globe *(done)*
- **WMTS Imagery** — Web Map Tile Service imagery layers *(done)*
- **Zarr/Cloud-Optimized** — Stream data from cloud-optimized Zarr stores for multi-petabyte datasets (ERA5, ARCO) without local download *(planned)*
- **COG/GeoTIFF** — Display Cloud Optimized GeoTIFFs for satellite imagery, elevation, and raster geospatial data *(planned)*
- **OpenUSD Scenes** — Import and render OpenUSD scene descriptions on the globe, bridging with NVIDIA Omniverse *(planned)*
- **KML/KMZ Import** — Load Google Earth KML/KMZ files using Cesium's built-in KmlDataSource *(planned)*
- **CZML Support** — Time-dynamic entity scenarios via Cesium's CzmlDataSource; sampled positions, interpolation, availability windows *(planned)*
- **GPX Track Import** — Load GPS tracks, routes, and waypoints using Cesium's GpxDataSource *(planned)*
- **Gaussian Splatting** — Render 3D Gaussian Splatting data via KHR_gaussian_splatting extension in 3D Tiles *(planned)*

### Rendering
- **Volumetric Clouds** — 3D cloud rendering using raymarching or billboard techniques; integrate with weather data for realistic cloud cover *(planned)*
- **2D / 2.5D Flat Mode** — Replace the 3D globe with flat (Mercator, equirectangular) or topographic relief projection for traditional map views *(planned)* — `exclusiveGroup: projection`
- **Wind/Flow Vectors** — Animated particle streams showing wind, ocean current, or other vector field data on the globe *(planned)*
- **Atmospheric Glow** — Tunable Rayleigh/Mie scattering, hue/brightness shifts, dynamic lighting for cinematic atmosphere *(planned)*
- **Cross-Section Viewer** — Slice through volumetric atmospheric data along user-defined vertical cross-sections *(planned)*
- **Temporal Animator** — Timeline slider with play/pause and configurable frame rates for time-varying datasets *(planned)*
- **Particle Systems** — Rain, snow, fire, smoke, volcanic ash using Cesium's ParticleSystem with Circle/Box/Sphere/Cone emitters *(planned)*
- **Post-Processing Pipeline** — Expose Cesium's PostProcessStageLibrary: bloom, depth of field, edge detection, silhouettes, night vision, lens flare, FXAA *(planned)*
- **Shadow Mapping** — Cascaded shadow maps on terrain, buildings, and models via scene.shadowMap *(planned)*
- **Water Effects** — Animated ocean waves with sun/moon specular highlights via Globe.showWaterEffect and water mask *(planned)*
- **Terrain Materials** — Elevation contours, slope ramps, aspect ramps via Globe.material; topographic visualization *(planned)*
- **Terrain Clipping** — Cut away terrain with clipping planes/polygons for cross-sections and underground reveals *(planned)*
- **Globe Translucency** — Make globe transparent by region for subsurface/underground visualization *(planned)*
- **Underground Rendering** — Camera below terrain surface with undergroundColor and disabled collision detection *(planned)*
- **Terrain Exaggeration** — Vertically scale terrain for dramatic relief visualization *(planned)*
- **Entity Clustering** — Automatic screen-space clustering for dense data (earthquakes, ships, flights) via EntityCluster *(planned)*
- **Voxel Primitives** — Volumetric 3D data rendering for atmospheric/subsurface data via VoxelPrimitive (experimental) *(planned)*
- **3D Model System** — Place, animate, and interact with glTF models; articulations, custom shaders, silhouettes *(planned)*
- **Custom Shaders** — Fabric material system and CustomShader class for data-driven visualization on models/tiles *(planned)*
- **Ground Primitives** — Drape geometry on terrain; classification primitives for highlighting features *(planned)*
- **Cinematic Camera** — Multi-waypoint flight paths with easing functions, KML Tours, entity tracking *(planned)*
- **Point Cloud Rendering** — LAS/LAZ point clouds via 3D Tiles with eye dome lighting and metadata styling *(planned)*
- **Fog Control** — Configurable density, height falloff, brightness for atmospheric depth *(planned)*

### Visualization & Charting
- **Matplotlib-style Plotting** — Generate static plots of data (line, scatter, heatmap, histogram) as overlay panels or export images *(planned)*
- **Interactive Charting** — Zoomable, brushable charts of time series and spatial data; linked selection with the globe *(planned)*

### Analysis & Plotting
- **Point Inspector** — Click any location to see all available data values at that point across all layers *(planned)*
- **Region Statistics** — Draw polygons or select regions to compute area-averaged statistics, histograms, trends *(planned)*
- **Comparison View** — Side-by-side or overlay comparison of datasets, time steps, or model outputs with split-screen (Cesium splitDirection) *(planned)*
- **Elevation Sampling** — Query terrain height at any point or batch of points via sampleTerrainMostDetailed *(planned)*

---

## Apps (`kind: app`)

Feature modules that register with the app manager. Each app can add layers, commands, and UI panels.

### Data & Monitoring
- **Earthquake Tracker** — Live USGS feed, magnitude filtering, historical playback *(done)*
- **Hurricane/Cyclone Tracker** — NOAA/JTWC/GDACS feeds, storm paths, cone of uncertainty *(done)* — `companions: [damage-assessment]`
- **Tsunami Warning System** — Real-time alerts, wave propagation simulation *(planned)* — `exclusiveGroup: simulation`
- **Wildfire Monitor** — FIRMS/MODIS active fire data, burn scar mapping *(planned)* — `companions: [fire-spread-prediction]`
- **Volcano Monitor** — Smithsonian GVP data, eruption alerts, ash plume tracking *(planned)*
- **Lightning Tracker** — Real-time lightning strike data (Blitzortung) *(planned)*
- **Ship Tracker (AIS)** — Live vessel positions, routes, port activity *(planned)*
- **Flight Tracker** — Live aircraft positions (ADS-B/OpenSky), flight routes *(done)*
- **ISS Tracker** — Real-time International Space Station position and ground track *(planned)*
- **Satellite Tracker** — TLE data, orbit visualization for active satellites *(done)*

### Satellite Imagery & Remote Sensing
- **NASA GIBS Imagery** — MODIS, VIIRS, true color, night lights, sea surface temperature, clouds *(done)*
- **Sentinel Hub** — Copernicus Sentinel-2 imagery, NDVI, false color composites *(planned)*
- **Landsat Browser** — Historical Landsat imagery, change detection *(planned)*
- **SAR Imagery** — Sentinel-1 radar imagery for flood/ice mapping *(planned)*
- **Air Quality (Aerosol)** — MODIS/VIIRS aerosol optical depth *(planned)*
- **Imagery Selector** — UI panel for browsing and switching between available imagery providers *(planned)*
- **Custom WMS/WMTS** — Add arbitrary WMS or WMTS endpoints as globe layers *(planned)*
- **Terrain Providers** — Switch between terrain sources: Cesium World, Mapbox, custom quantized mesh, flat ellipsoid *(planned)*

### Climate & Weather
- **Weather App (Windy-style)** — Full weather visualization mode inspired by Windy.com. Components: *(planned)*
  - **Animated wind particles** — GPU-accelerated particle flow showing wind speed/direction on the globe surface, colored by velocity
  - **Scalar field colormaps** — Temperature, pressure, humidity, precipitation mapped to perceptually uniform colormaps as globe imagery overlays
  - **Multiple weather models** — GFS (NOAA), ECMWF (IFS/HRES), ICON (DWD), and NVIDIA Earth-2 AI models (FourCastNet, StormCast)
  - **Layer selector** — Switch between: wind, temperature, rain/thunder, clouds, pressure, waves, precipitation accumulation, thunderstorms, snow, cape/lifted index
  - **Forecast timeline** — Scrub through forecast hours (0-384h), play/pause animation, step forward/back
  - **Point forecast** — Click any location to see a multi-day forecast chart (temp, wind, precip time series)
  - **Altitude levels** — View weather at surface, 850hPa, 500hPa, 300hPa, 200hPa (jet stream)
  - **Sounding profiles** — Vertical temperature/dewpoint profiles at clicked locations
  - **Data sources** — Open-Meteo API (free, global), NOAA GFS via NOMADS, ECMWF open data, ERA5 reanalysis for historical
- **Climate Projections** — CMIP6 model outputs, warming scenarios *(planned)*
- **Sea Level Rise** — Coastal inundation under different rise scenarios *(planned)* — `exclusiveGroup: simulation`
- **Ice Sheet Monitor** — Arctic/Antarctic ice extent, historical trends *(planned)*
- **Ocean Currents** — Animated particle flow from OSCAR/HYCOM data *(planned)*
- **Drought Monitor** — PDSI, soil moisture, vegetation health indices *(planned)*

### NVIDIA Earth-2 AI Models
- **Earth-2 Studio Integration** — Full Earth-2 suite orchestration; compose models into pipelines *(planned)* — `companions: [fourcastnet, corrdiff, stormcast]`
- **FourCastNet** — AI global weather forecasting (0.25-degree resolution, 6-hour steps) *(planned)* — `exclusiveGroup: ai-weather`
- **StormScope** — Storm tracking and prediction using Earth-2 models *(planned)* — `exclusiveGroup: ai-weather`, `companions: [hurricane-tracker]`
- **StormCast** — High-resolution storm forecasting *(planned)* — `exclusiveGroup: ai-weather`
- **Climate-in-a-Bottle** — Climate simulation and scenario exploration *(planned)* — `exclusiveGroup: simulation`
- **CorrDiff Super-Resolution** — Downscale coarse weather data to high resolution *(planned)* — `companions: [fourcastnet, weather-overlay]`
- **Surya Heliophysics AI** — Solar physics model; solar flare and CME prediction *(planned)* — `companions: [solar-globe]`
- **Torch Harmonics** — GPU-accelerated spherical harmonics library for global field analysis *(planned)*
- **GenCast / NeuralGCM** — Google DeepMind and other third-party weather AI models for comparison and benchmarking *(planned)*
- **AIFS (ECMWF)** — ECMWF's Artificial Intelligence Forecasting System, relevant to NVIDIA-ECMWF partnership *(planned)*

### Digital Twins & Simulation
- **Flood Simulation (Modulus)** — Physics-ML flood modeling *(planned)* — `exclusiveGroup: simulation`
- **Fire Spread Prediction** — AI-driven wildfire spread forecasting *(planned)* — `exclusiveGroup: simulation`, `companions: [wildfire-monitor]`
- **City Digital Twin** — 3D building data + IoT sensor overlays *(planned)* — `exclusiveGroup: digital-twin`
- **Traffic Simulation** — Vehicle flow modeling, congestion prediction *(planned)* — `exclusiveGroup: digital-twin`
- **Power Grid Monitor** — Renewable energy production, grid load *(planned)* — `companions: [solar-power]`
- **Agricultural Monitor** — Crop health, irrigation, yield prediction *(planned)*
- **Supply Chain Viz** — Global logistics, shipping routes, bottlenecks *(planned)*

### Interactive & Games
- **Globe Risk** — Strategy game on the real globe: territory control, armies, alliances, diplomacy *(planned)* — `exclusiveGroup: interactive`
- **GeoGuessr-style** — Drop somewhere random, guess where you are using 3D tiles *(planned)* — `exclusiveGroup: interactive`
- **Civilization Mode** — Place and grow cities, manage resources on real terrain *(planned)* — `exclusiveGroup: interactive`
- **Disaster Response** — Timed scenarios: evacuate a coast before tsunami hits *(planned)* — `exclusiveGroup: interactive`
- **Exploration Challenge** — Find hidden landmarks, earn badges for visiting places *(planned)*
- **Time Travel** — Scrub through historical imagery to see how places changed *(planned)*

### Education & Storytelling
- **Plate Tectonics** — Animated tectonic plate boundaries, earthquake/volcano correlation *(planned)*
- **Great Circles** — Interactive geodesic paths, flight route optimization *(planned)*
- **Climate Time Machine** — Visualize temperature/CO2/ice over geological time *(planned)*
- **Historical Borders** — Animated political boundaries through history *(planned)*
- **Space Missions** — Visualize launch sites, orbits, landing sites *(planned)*

### Utilities
- **Measurement Tool** — Distance, area, elevation profile between points *(planned)*
- **Coordinate Converter** — Click anywhere, get coords in multiple formats *(planned)*
- **Sun/Shadow Analysis** — Solar angle, shadow casting for any location/time *(planned)*
- **Viewshed Analysis** — What's visible from a given point and height *(planned)*
- **3D Model Placer** — Drop glTF models onto the globe at specific locations *(planned)*

### HuggingFace Integration
- **Model Browser** — Discover and download ML models from HuggingFace Hub *(planned)*
- **Local Model Runner** — Run downloaded models locally for inference *(planned)* — `companions: [model-browser]`
- **Result Visualization** — Display model outputs (predictions, classifications, segmentations) on the globe *(planned)* — `companions: [local-model-runner]`

---

## Globes (`kind: globe`)

Alternative celestial bodies. Each globe replaces the Earth view with a different planetary surface.

- **Earth** — Default CesiumJS globe with terrain, imagery, and 3D tiles *(done)* — `exclusiveGroup: globe`
- **Moon Globe** — Lunar terrain (LOLA DEM), crater names, Apollo and other landing sites, mare boundaries *(planned)* — `exclusiveGroup: globe`
- **Mars Globe** — MOLA terrain, named features (Olympus Mons, Valles Marineris), rover landing sites (Curiosity, Perseverance) *(planned)* — `exclusiveGroup: globe`
- **Solar Globe** — SDO/AIA data visualization, sunspot tracking, solar flare activity, coronal features *(planned)* — `exclusiveGroup: globe`, `companions: [surya-heliophysics]`
- **Venus Globe** — Magellan radar topography, named features *(planned)* — `exclusiveGroup: globe`
- **Jupiter Moons** — Europa, Ganymede, Io, Callisto surfaces from Galileo/Juno data *(planned)* — `exclusiveGroup: globe`
- **Exoplanet Catalog** — 3D star map of known exoplanet systems with drill-down to individual system visualizations *(future)* — `exclusiveGroup: globe`

---

## Compute Backends (`kind: compute-backend`)

Where GPU-accelerated inference and simulation workloads run. Multiple can be configured; the system selects based on availability and model requirements.

- **Browser (WebGPU/WASM)** — Client-side inference for small models; zero-latency but limited capacity *(planned)*
- **DGX Spark** — Local NVIDIA DGX Spark GPU inference; low-latency for development and personal use *(planned)*
- **Remote GPU** — On-premise machine (e.g., workstation at office); SSH tunnel or API endpoint *(planned)*
- **Cloud GPU** — Cloud instances (AWS, GCP, Lambda Labs, etc.); auto-provision and tear down *(planned)*
- **NVIDIA NIM** — NVIDIA Inference Microservices; managed API endpoints for Earth-2 and other NVIDIA models *(planned)*

> **Infrastructure:** Job Manager (unified submission, status, queues), Result Cache (content-addressed by model+input hash), Data Pipeline (automated input fetching/regridding), Auth Manager (unified credentials), **Compute Mesh** (federate local, remote, and cloud GPUs into a unified resource pool for distributed inference) *(planned)*

---

## AI Providers (`kind: ai-provider`)

Language model backends for the AI chat and command system. Multiple can be configured; the router selects based on task complexity.

- **Claude (Anthropic)** — Haiku for classification, Sonnet/Opus for conversation and analysis *(done)* — `exclusiveGroup: primary-llm`
- **OpenAI GPT Models** — GPT-4o, GPT-4o-mini, and future releases *(done)* — `exclusiveGroup: primary-llm`
- **Ollama (Local Models)** — Run open-weight models locally (Llama, Mistral, Gemma, etc.); no API key needed *(done)* — `exclusiveGroup: primary-llm`
- **OpenRouter** — Multi-model gateway; access many providers through a single API key *(done)* — `exclusiveGroup: primary-llm`
- **Subscription Services** — Managed API plans with usage tracking and billing *(planned)*
- **Custom API Endpoints** — User-configured endpoints for self-hosted or enterprise LLM deployments *(planned)*

---

## AI Skills (`kind: ai-skill`)

Knowledge packs and tool sets that augment the AI assistant's domain expertise.

- **Earth Science Knowledge Pack** — Geology, oceanography, atmospheric science context and terminology *(planned)*
- **Weather Interpretation Skills** — Read and explain synoptic charts, satellite imagery, model output *(planned)*
- **Geospatial Analysis Tools** — Spatial queries, buffer analysis, coordinate transforms, projections *(planned)*
- **Satellite Imagery Interpretation** — Identify land cover, cloud types, vegetation indices from satellite data *(planned)*
- **Climate Data Analysis** — Statistical analysis of climate time series, trend detection, anomaly identification *(planned)*
- **Oceanography** — SST analysis, ENSO monitoring, ocean heat content, sea level, ocean indices *(planned)*
- **Air Quality** — Pollutant sources, dispersion modeling, AQI computation, sensor network queries *(planned)*
- **Space Weather** — Solar wind, magnetosphere, aurora forecasting; companion to Solar Globe and Surya *(planned)*
- **Seismology** — Earthquake catalogs, fault maps, seismic hazard, USGS feed queries *(planned)*
- **Hydrology** — River basins, flood modeling, water resources, watershed delineation *(future)*
- **Wildfire** — Fire detection (FIRMS), fire weather indices, smoke dispersion *(future)*
- **Agriculture** — Crop monitoring, soil moisture, growing degree days, drought indices *(future)*

---

## Themes (`kind: theme`)

Visual appearance presets. Each theme controls colors, UI styling, and optional rendering effects.

- **Default Dark** — Dark background, subtle UI, standard Cesium rendering *(done)* — `exclusiveGroup: theme`
- **Light Theme** — Light background variant for presentations and print *(planned)* — `exclusiveGroup: theme`
- **Tron Mode** — Neon bloom effects, dark cyberpunk aesthetic, glowing grid lines, scanline overlays *(planned)* — `exclusiveGroup: theme`
- **Night Vision** — Green-tinted amplified light effect via Cesium's createNightVisionStage *(planned)* — `exclusiveGroup: theme`
- **Cinematic** — Depth of field + lens flare + tuned atmosphere for dramatic visuals *(planned)* — `exclusiveGroup: theme`
- **Topo Map** — Elevation contour material on terrain, muted colors *(planned)* — `exclusiveGroup: theme`
- **Ocean** — Water effects + bathymetry terrain + globe translucency for underwater focus *(planned)* — `exclusiveGroup: theme`
- **Custom Colormaps** — Swap data visualization palettes (viridis, magma, inferno, plasma, cividis); all must be perceptually uniform *(planned)*

---

*Add ideas freely. Mark items (done), (in progress), or (planned) as appropriate.*
*Composition annotations (exclusiveGroup, companions) define how extensions interact at runtime.*

---

## Multi-View & Collaboration

- **Split View** — Horizontal or vertical window splits within the app; each pane can show different globe state, layers, or time *(planned)*
- **Multi-Window** — Multiple browser windows coordinated via MCP/WebSocket on one machine; each window is an independent viewer *(planned)*
- **Multi-Machine** — Coordinated views across multiple machines via MCP; shared state for presentations and team collaboration *(planned)*
- **Compute Mesh** — Federate local GPU, remote servers, and cloud instances into a unified compute pool; distribute inference jobs across the mesh based on model size and availability *(planned)*

---

## Development Priorities

Suggested near-term ordering based on demo value, strategic alignment, and technical dependencies:

1. Extension system architecture *(done)*
2. Extension Catalog UI *(done)*
3. NetCDF + HEALPix readers — most important data formats for Earth science AI
4. Quick CesiumJS wins — entity clustering, 2D/Columbus view, water effects, post-processing, shadows
5. StormCast / cBottle integration — highest-impact Earth-2 model demos
6. DGX Spark support — aligns with NVIDIA hardware strategy
7. Moon Globe app — demonstrates multi-planetary capability (Cesium ion has lunar terrain)
8. AI Skills (Weather Analysis) — first skill package, proves the concept
9. Tron Mode theme — bloom + edge detection + neon (high visual impact, low effort)
10. Temporal Animator + Wind Vectors — essential for weather model visualization
11. Multi-view / split screen — coordinated views for comparison and collaboration
12. GeoGuessr game — fun, demonstrates platform flexibility

---

## Licensing

- **Open source (Apache 2.0):** Core platform, data format readers, basic visualization, community skills
- **NVIDIA-licensed:** Earth-2 model integrations, DGX Spark support, proprietary technology extensions
- **Third-party:** Community and commercial partner extensions via registry/marketplace
