// after-pack hook: ad-hoc sign the packaged .app on macOS so it can launch
// on Apple Silicon (which requires at least an ad-hoc signature for arm64
// binaries). Without this, electron-builder leaves only the linker's
// per-binary ad-hoc signature, which fails strict verification on a fresh Mac.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[after-pack] ad-hoc signing ${appPath}`);
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
      stdio: 'inherit',
    });
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
      stdio: 'inherit',
    });
    console.log('[after-pack] ad-hoc signing OK');
  } catch (err) {
    console.error('[after-pack] ad-hoc signing failed:', err.message);
    throw err;
  }
};
