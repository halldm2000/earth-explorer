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

### Rendering
- **Volumetric Clouds** — 3D cloud rendering using raymarching or billboard techniques; integrate with weather data for realistic cloud cover *(planned)*
- **2D / 2.5D Flat Mode** — Replace the 3D globe with flat (Mercator, equirectangular) or topographic relief projection for traditional map views *(planned)* — `exclusiveGroup: projection`

### Visualization & Charting
- **Matplotlib-style Plotting** — Generate static plots of data (line, scatter, heatmap, histogram) as overlay panels or export images *(planned)*
- **Interactive Charting** — Zoomable, brushable charts of time series and spatial data; linked selection with the globe *(planned)*

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

### Climate & Weather
- **Weather Overlay** — Temperature, wind, precipitation from GFS/ERA5 *(planned)*
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

---

## Compute Backends (`kind: compute-backend`)

Where GPU-accelerated inference and simulation workloads run. Multiple can be configured; the system selects based on availability and model requirements.

- **Browser (WebGPU/WASM)** — Client-side inference for small models; zero-latency but limited capacity *(planned)*
- **DGX Spark** — Local NVIDIA DGX Spark GPU inference; low-latency for development and personal use *(planned)*
- **Remote GPU** — On-premise machine (e.g., workstation at office); SSH tunnel or API endpoint *(planned)*
- **Cloud GPU** — Cloud instances (AWS, GCP, Lambda Labs, etc.); auto-provision and tear down *(planned)*
- **NVIDIA NIM** — NVIDIA Inference Microservices; managed API endpoints for Earth-2 and other NVIDIA models *(planned)*

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

---

## Themes (`kind: theme`)

Visual appearance presets. Each theme controls colors, UI styling, and optional rendering effects.

- **Default Dark** — Dark background, subtle UI, standard Cesium rendering *(done)* — `exclusiveGroup: theme`
- **Light Theme** — Light background variant for presentations and print *(planned)* — `exclusiveGroup: theme`
- **Tron Mode** — Neon bloom effects, dark cyberpunk aesthetic, glowing grid lines, scanline overlays *(planned)* — `exclusiveGroup: theme`
- **Custom Colormaps** — Swap data visualization palettes (viridis, magma, inferno, plasma, cividis); all must be perceptually uniform *(planned)*

---

*Add ideas freely. Mark items (done), (in progress), or (planned) as appropriate.*
*Composition annotations (exclusiveGroup, companions) define how extensions interact at runtime.*
