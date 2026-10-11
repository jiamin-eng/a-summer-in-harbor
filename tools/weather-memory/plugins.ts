import {emptySlotsPlugin} from './empty-slots-plugin';
import {reactiveScopePlugin} from './reactive-scope-plugin';
import {keyboardListenerPlugin} from './keyboard-listener-plugin';
import {clientObjectLifecyclePlugin} from './client-object-lifecycle-plugin';
import {spriteResourcePlugin} from './sprite-resource-plugin';
import {gamepadListenerPlugin} from './gamepad-listener-plugin';
import {spriteTickPlugin} from './sprite-tick-plugin';
import {lateChildPlugin} from './late-child-plugin';
import {standaloneCachePlugin} from './standalone-cache-plugin';
import {tiledTextureLifecyclePlugin} from './tiled-texture-lifecycle-plugin';

/** Explicitly opt in before the existing compiler plugins; dependencies remain unchanged. */
export function weatherRuntimeCompatibilityPlugins(){return[emptySlotsPlugin(),reactiveScopePlugin(),keyboardListenerPlugin(),clientObjectLifecyclePlugin(),spriteResourcePlugin(),gamepadListenerPlugin(),spriteTickPlugin(),lateChildPlugin(),standaloneCachePlugin(),tiledTextureLifecyclePlugin()];}
