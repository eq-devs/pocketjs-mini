# PocketJS Mini

A tiny shell wrapper layered on [PocketJS](https://github.com/pocket-nexus/pocketjs).
No upstream fork, JS CLI framework, or workspace manager. Four commands:

```sh
git clone https://github.com/eq-devs/pocketjs-mini.git
export PATH="$PWD/pocketjs-mini/bin:$PATH"
pjm create hello
cd hello
pjm build
pjm run
pjm clean
```

Requires Git and [Bun 1.3.11](https://bun.sh). `run` also needs Rust/Cargo
with `rustup target add wasm32-unknown-unknown`. The first build downloads
the pinned PocketJS checkout and its dependencies into `.pjm/pocketjs`;
the first run compiles its WASM core. These steps require internet access.
The shell entrypoint supports macOS Bash 3.2 and Linux Bash.

`create` makes `app/main.tsx`, `assets/`, `mini.json`, a small TypeScript
import map, and `.gitignore`. Names start with a lowercase letter and contain
only lowercase letters, digits, or hyphens (48 characters maximum).
Existing destinations are refused. Edit `app/main.tsx` to change the app.
`mini.json` contains only its name. Assets are a place for your files;
reference image paths relative to `app/main.tsx`, for example `../assets/logo.png`.
For additional framework imports, extend the paths in `tsconfig.json`.

`build` generates a PocketJS v2 manifest, delegates to `tools/pocket.ts compile`,
then uses upstream `makeVariant` and `encodePocketPackage` to produce
`build/<name>.pocket`. This first version contains one **PSP-profile guest
variant**, with JS, baked assets, identity, and resolved plan. It does not
build a PSP executable or claim compatibility with every device. Intermediate
JS, PAK, manifest, and plan files stay in `build/`.

`run` rebuilds and decodes that package using upstream validation, loads its
actual JS/PAK into the official `hosts/web/wasm-ops.js` host, and advances
60 virtual frames. It fails on compilation/runtime errors, a missing frame
function, an invalid framebuffer, a missing component tree, or a uniform
screen. It is a bounded headless boot check; it exits after one simulated
second. Apps intentionally showing a blank or uniform screen fail this check.
CI additionally requires the hello text in the rendered tree. This validates
the WASM host path, not QuickJS on physical PSP hardware.

`clean` removes `build/` only, retaining source and the downloaded toolchain.
Run commands from the project root. Delete `.pjm/` manually to reclaim the
upstream/dependency/WASM cache. Generated output and caches are ignored by Git.

The public commands are exactly `create`, `run`, `build`, and `clean`.
`bin/runtime.ts` is a small internal bridge to PocketJS APIs, not a second CLI.
PocketJS is pinned to `fe971ebb8e14724d2a98d4df6b34c065caf11132`;
its tracked files are never patched. Its own tools may generate ignored caches
and styles inside the checkout. Updating the pin requires revalidating APIs.

```sh
bash tests/check.sh
cd examples/hello
../../bin/pjm run
```

GitHub Actions runs generated-project checks and the committed example on
Linux and macOS, including actual package boot and expected-text assertions.
