# Quality Gates

These are the performance, visual, and security standards for this project. The orchestrator checks these before any commit. Individual thresholds can be adjusted per-project by editing this file.

## Frame Performance

| Metric | Target | Minimum | Notes |
|--------|--------|---------|-------|
| Frame time | < 16ms | < 33ms | 60fps target, 30fps floor |
| Input-to-visual latency | < 50ms | < 100ms | Measured from pointerdown to visual update |
| Camera animation | 60fps | 30fps | During orbit, pan, zoom with inertia |
| Time slider scrub | 60fps | 30fps | During continuous drag |
| No dropped frames during gesture | 0 | < 3/sec | Continuous pointer interaction |

## GPU Resources

| Metric | Mobile | Desktop |
|--------|--------|---------|
| Draw calls / frame | < 100 | < 500 |
| Triangle count (visible) | < 100K | < 1M |
| Texture memory | < 128MB | < 512MB |
| GPU memory growth over 60s | < 1MB | < 5MB |
| Shader compile time | < 100ms | < 100ms |

## Bundle Size

| Metric | Budget |
|--------|--------|
| Initial load (gzipped) | < 300KB (excluding data assets) |
| Largest chunk (gzipped) | < 150KB |
| Total with all chunks | < 1MB |

## Visual Standards

- [ ] Screenshots pass visual inspection at 375px, 1024px, 1920px
- [ ] No console errors or warnings
- [ ] Dark mode is primary, light mode is correct
- [ ] WCAG AA contrast ratios (4.5:1 text, 3:1 large text/UI)
- [ ] All interactive elements have visible focus indicators
- [ ] No layout shifts during loading or data updates

## Data Visualization Standards

- [ ] Colormaps are perceptually uniform (viridis default, no rainbow/jet)
- [ ] Colors distinguishable under deuteranopia simulation
- [ ] All data displays have legends/scale bars with units
- [ ] Missing data visually distinct from valid data
- [ ] Interactive probing shows actual values, not interpolated colors
- [ ] Diverging colormaps centered on meaningful zero

## Security Baseline

- [ ] No secrets in client bundle or git history
- [ ] CSP headers configured
- [ ] File uploads validated (type, size, magic bytes)
- [ ] npm audit: no high/critical vulnerabilities
- [ ] AI endpoints rate-limited
- [ ] Dataset metadata sanitized before DOM rendering

## Interaction Standards

- [ ] Camera orbit/pan/zoom has inertia
- [ ] Works with mouse, touch, and pen input
- [ ] Keyboard shortcuts for common actions
- [ ] Current mode always visible
- [ ] Undo/redo for state-modifying actions
- [ ] Gestures are cancellable
