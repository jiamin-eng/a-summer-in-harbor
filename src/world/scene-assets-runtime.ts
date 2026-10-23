// Official installed Pixi polyfills replace dynamic code generation; they do
// not enable eval or relax any host/browser policy. No dependency is added.
import 'pixi.js/unsafe-eval';
import {Assets} from 'pixi.js';
// Pixi's ImageBitmap support worker waits only for message, with no error or
// timeout path. Select the documented main-thread decoder before any loads;
// do not create that unbounded worker or silently pretend a timeout succeeded.
// createImageBitmap remains preferred; Pixi uses Image on hosts without it.
Assets.setPreferences({preferWorkers:false});
export const sceneTexturePolicy='main-thread' as const;
