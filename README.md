# THREE — Matter from Residue

**Browser demo:** `index.html` can be opened directly after downloading, with no dependencies. Once GitHub Pages is enabled for this repository, the public address will be https://anttiluode.github.io/3/.

Three interactive optical-art experiments, all using a shared coarse-to-fine representation:

1. **Self-carving crystal:** a greedy, hand-written Gabor packet fitter adds oriented 2D splats to reduce the input-image residual, first the coarse body then the fine details. The result is textured as a translucent, relightable material.
2. **Frequency-as-depth alchemy:** a telescoping Sihti-style decomposition (`coarse + medium + edge + fine = input`) is assigned to *artistic* material-depth layers. Peel between layers and change scattering, optical thickness and material palette.
3. **Shatter and reform:** each fitted packet becomes a shard with velocity, depth and orientation. A pointer click or Space applies impulses; damped springs pull shards back to their remembered locations.

Use webcam (permission required, HTTPS or localhost), a local photo, or the included procedural portrait. Drag across the stage to move the light. Keyboard: `1`/`2`/`3` change modes, `V` toggles camera, `Space` shatters, `R` resets fitting, `S` saves a screenshot. Photo/video pixels are processed locally and never uploaded.

## Quick start

Open or download `index.html`, or visit GitHub Pages once it has been enabled. The distributed HTML embeds the engine and shader and **works directly as a file**, with no server, npm install or model download. The separate `.mjs` files are the inspectable modular sources; the published HTML contains an inlined copy. If WebGL2 is unavailable, it falls back to a Canvas2D view.

Test the numerical core with `npm test` (Node 20+).

## Relationship to the source repositories

- [Sihti](https://github.com/anttiluode/Sihti): the band decomposition is an exact *telescoping identity* for a succession of smoothing passes. This demo uses Gaussian scale-space rather than Sihti's image-conditioned diffusion. It is not a new frequency axis.
- [SihtiImageModel2](https://github.com/anttiluode/SihtiImageModel2): motivates coarse layout plus residual detail; its original learned layout transformer and P3 patch memory are **not** embedded here.
- [SplatWorld](https://github.com/anttiluode/SplatWorld): inspires oriented Gaussian-windowed cosine (Gabor) primitives; this demo fits its own simple packets greedily to a user image, rather than using SplatWorld's trained 7.2MB CelebA decoder.
- [Moon](https://github.com/anttiluode/Moon) and [CrystalMoon](https://github.com/anttiluode/CrystalMoon): inspire refractive/translucent visual design; the shader here is a compact, custom, stylized approximation, **not** Moon's validated network or CrystalMoon's field PDE.


## Editing and rebuilding

`template.html` is the HTML shell. `engine.mjs`, `render.mjs` and `app.mjs` are the readable source modules. After editing them, run `python build.py` to regenerate the self-contained `index.html`, then commit the updated build. This avoids external module imports when opening the published demo directly from disk.

## Scientific boundary

This is **art and an inspectable computational analogy**, not a method for instant 3D reconstruction. A spatial frequency band does not uniquely specify physical depth. Greedy pixel-space splat fitting is not a calibrated inverse renderer. The relighting is a material shader (Fresnel, Beer–Lambert-like attenuation and blur); no 3D object, material density or true scattering properties are measured from the image. The on-screen *unexplained residue* shows what our own 2D fitter has not represented yet. No pretrained neural network, gradient descent, or physics accuracy claim is made.

For genuine relighting, we would need multiple calibrated lighting/view measurements and held-out photographic prediction tests.

## Files

`index.html` — runnable standalone build, with all modules inlined. `app.mjs` — readable camera/photo source, interaction, fitting and particles. `engine.mjs` — numerical sieve and greedy Gabor splats, with no learned weights. `render.mjs` — WebGL2 material shader. `tests/engine.test.mjs` — numerical smoke tests.