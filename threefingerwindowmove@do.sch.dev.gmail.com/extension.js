// Move the window under the pointer with a 3-finger touchpad swipe (Wayland).
// Dragging the window to a screen edge snaps it: top edge = maximize,
// left/right edge = half-tile.
//
// Ported from the legacy GNOME 3.32-3.38 implementation to the GNOME 45+
// ESM module system. Adapted API usage where mutter changed:
// Meta.Rectangle became Mtk.Rectangle, so no rectangles are constructed
// manually anymore — rects returned by mutter APIs are reused instead.

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const EDGE_THRESHOLD = 48;

const SnapAction = {
    NONE: 0,
    MAXIMIZE: 1,
    TILE_LEFT: 2,
    TILE_RIGHT: 4
};

let gestureHandler = null;

// Meta.Window.get_maximized() was removed in GNOME 49 (mutter 17) and
// replaced by get_maximize_flags(); the old method only exists up to
// GNOME 48. Probe the window so the extension works on GNOME 45 through 51.
function maximizeFlags(window) {
    if (typeof window.get_maximize_flags === 'function')
        return window.get_maximize_flags();
    return window.get_maximized();
}

const TouchpadGestureAction = class {

    constructor(actor, settings) {
        const seat = Clutter.get_default_backend().get_default_seat();
        this._virtualPointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        this._virtualKeyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        this._gestureCallbackID = actor.connect('captured-event', this._handleEvent.bind(this));

        this._monitorGeometry = null;
        this._monitorIndex = 0;

        this._movingMetaWindow = null;
        this._pointerWindowDiffX = 0;
        this._pointerWindowDiffY = 0;
        this._nextSnapAction = SnapAction.NONE;

        this._sizeHandler = null;
        this._unmanagedHandler = null;
        this._workspaceChangedHandler = null;

        this._settings = settings;
        this._settingsChangedCallbackID =
            this._settings.connect('changed', this._updateSettings.bind(this));
        this._updateSettings();
    }

    destroy() {
        global.stage.disconnect(this._gestureCallbackID);
        this._settings.disconnect(this._settingsChangedCallbackID);
    }

    _updateSettings() {
        this._acceleration = this._settings.get_double('acceleration');
        this._thresholdSquare = this._settings.get_int('threshold');
        this._thresholdSquare *= this._thresholdSquare;
        this._summarizeThreshold = this._settings.get_boolean('summarize-threshold');
    }

    _handleEvent(actor, event) {
        // Only look for touchpad swipes
        if (event.type() !== Clutter.EventType.TOUCHPAD_SWIPE)
            return Clutter.EVENT_PROPAGATE;

        // Only look for three finger gestures
        if (event.get_touchpad_gesture_finger_count() !== 3)
            return Clutter.EVENT_PROPAGATE;

        switch (event.get_gesture_phase()) {
            case Clutter.TouchpadGesturePhase.BEGIN:
                return this._gestureStarted();
            case Clutter.TouchpadGesturePhase.UPDATE: {
                const [dx, dy] = event.get_gesture_motion_delta();
                return this._gestureUpdate(dx, dy);
            }
            default: // CANCEL or END
                return this._gestureEnd();
        }
    }

    _windowAtPointer(x, y) {
        // Pick may return an actor nested inside the window (e.g. CSD input
        // areas); walk up the hierarchy until we find the MetaWindowActor.
        let actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        for (let i = 0; actor !== null && i < 5; i++, actor = actor.get_parent()) {
            if (actor.get_meta_window)
                return actor.get_meta_window();
        }
        return null;
    }

    _gestureStarted() {
        // An exception must not leave the drag half-initialized (window
        // recorded, pointer offset still 0), or every UPDATE would glue the
        // window corner to the pointer — log and forget the drag instead.
        try {
            return this._gestureStartedInner();
        } catch (e) {
            log(`threefingerwindowmove: gesture start failed: ${e}`);
            this._forgetWindow();
            return Clutter.EVENT_PROPAGATE;
        }
    }

    _gestureStartedInner() {
        const [pointerX, pointerY] = global.get_pointer();
        const window = this._windowAtPointer(pointerX, pointerY);

        // Do not rely on gestures, if pointer is not on top of a window
        if (!window)
            return Clutter.EVENT_PROPAGATE;

        // Take the window below, if it is attached
        this._movingMetaWindow = window.is_attached_dialog()
            ? window.get_transient_for()
            : window;
        if (!this._movingMetaWindow || !this._movingMetaWindow.allows_move()) {
            this._movingMetaWindow = null;
            return Clutter.EVENT_PROPAGATE;
        }

        // Calculate workspace data
        this._monitorGeometry = this._movingMetaWindow.get_work_area_current_monitor();
        this._monitorIndex = global.display.get_monitor_index_for_rect(
            this._movingMetaWindow.get_frame_rect());

        // End the gesture if the window is closed while dragging
        this._unmanagedHandler = this._movingMetaWindow.connect('unmanaged',
            this._forgetWindow.bind(this));

        // Keep the snap geometry current if the window changes workspace mid-drag
        this._workspaceChangedHandler = this._movingMetaWindow.connect('workspace-changed', () => {
            if (!this._movingMetaWindow)
                return;
            this._monitorGeometry = this._movingMetaWindow.get_work_area_current_monitor();
            this._monitorIndex = global.display.get_monitor_index_for_rect(
                this._movingMetaWindow.get_frame_rect());
        });

        // Handle maximized window
        if (maximizeFlags(this._movingMetaWindow) !== 0) {
            // Activate window
            if (!this._movingMetaWindow.has_focus())
                this._movingMetaWindow.activate(global.get_current_time());

            // Connect to size-changed before unmaximize() so a synchronous
            // emission is not missed
            const handlerID = this._movingMetaWindow.connect('size-changed', () => {
                if (this._sizeHandler === handlerID) {
                    this._sizeHandler = null;
                    this._movingMetaWindow.disconnect(handlerID);
                }
                if (this._movingMetaWindow === null)
                    return;
                const windowSize = this._movingMetaWindow.get_frame_rect();

                // Update window-center
                this._pointerWindowDiffX = -windowSize.width / 2;
                this._pointerWindowDiffY = -windowSize.height / 2;
            });
            this._sizeHandler = handlerID;

            // Unmaximize
            this._movingMetaWindow.unmaximize(Meta.MaximizeFlags.BOTH);

            // Can center window to pointer, because window->saved_rect is private in mutter
            const frameRect = this._movingMetaWindow.get_frame_rect();
            this._pointerWindowDiffX = -frameRect.width / 3;
            this._pointerWindowDiffY = -frameRect.height / 3;
        } else {
            // Store delta from pointer to window pos
            const frameRect = this._movingMetaWindow.get_frame_rect();
            this._pointerWindowDiffX = frameRect.x - pointerX;
            this._pointerWindowDiffY = frameRect.y - pointerY;
        }

        this._thresholdExceeded = false;
        this._moveDeltaX = 0;
        this._moveDeltaY = 0;

        return Clutter.EVENT_STOP;
    }

    _gestureUpdate(dx, dy) {
        // Pointer not on top of a window
        if (this._movingMetaWindow === null)
            return Clutter.EVENT_PROPAGATE;
        try {
            return this._gestureUpdateInner(dx, dy);
        } catch (e) {
            log(`threefingerwindowmove: gesture update failed: ${e}`);
            this._forgetWindow();
            return Clutter.EVENT_PROPAGATE;
        }
    }

    _gestureUpdateInner(dx, dy) {

        // Focus window
        if (!this._movingMetaWindow.has_focus())
            this._movingMetaWindow.activate(global.get_current_time());

        // Apply acceleration
        dx *= this._acceleration;
        dy *= this._acceleration;

        // Move window once the threshold is exceeded
        const [pointerX, pointerY] = global.get_pointer();
        if (!this._thresholdExceeded) {
            this._moveDeltaX += dx;
            this._moveDeltaY += dy;
            if (this._moveDeltaX ** 2 + this._moveDeltaY ** 2 >= this._thresholdSquare) {
                this._thresholdExceeded = true;
                if (this._summarizeThreshold) {
                    dx = this._moveDeltaX;
                    dy = this._moveDeltaY;
                }
            } else {
                return Clutter.EVENT_STOP;
            }
        }

        this._virtualPointer.notify_relative_motion(global.get_current_time(), dx, dy);
        this._movingMetaWindow.move_frame(true,
            pointerX + this._pointerWindowDiffX,
            pointerY + this._pointerWindowDiffY);

        this._updateSnapPreview(pointerX, pointerY);
        return Clutter.EVENT_STOP;
    }

    _gestureEnd() {
        // Nothing to move around
        if (this._movingMetaWindow === null)
            return Clutter.EVENT_PROPAGATE;

        // Hide tile-preview
        if (this._nextSnapAction !== SnapAction.NONE)
            global.window_manager.emit('hide-tile-preview');

        // Do snap
        const currentTime = global.get_current_time();
        switch (this._nextSnapAction) {
            case SnapAction.MAXIMIZE:
                this._movingMetaWindow.maximize(Meta.MaximizeFlags.BOTH);
                break;
            case SnapAction.TILE_LEFT:
                this._press_combination(currentTime, [Clutter.KEY_Super_L, Clutter.KEY_Left]);
                break;
            case SnapAction.TILE_RIGHT:
                this._press_combination(currentTime, [Clutter.KEY_Super_L, Clutter.KEY_Right]);
                break;
        }

        this._forgetWindow();
        return Clutter.EVENT_STOP;
    }

    // Press key combination
    _press_combination(currentTime, combination) {
        combination.forEach(key =>
            this._virtualKeyboard.notify_keyval(currentTime, key, Clutter.KeyState.PRESSED));
        [...combination].reverse().forEach(key =>
            this._virtualKeyboard.notify_keyval(currentTime, key, Clutter.KeyState.RELEASED));
    }

    _updateSnapPreview(pointerX, pointerY) {
        // Handle window snap
        if (!this._movingMetaWindow.can_maximize() || !this._movingMetaWindow.has_focus())
            return;

        const geo = this._monitorGeometry;
        let nextSnapAction = SnapAction.NONE;
        let previewRect = null;
        if (pointerX < geo.x + EDGE_THRESHOLD) {
            // Handle snap to left
            nextSnapAction = SnapAction.TILE_LEFT;
            previewRect = geo.copy();
            previewRect.y = geo.y;
            previewRect.height = geo.height;

            // Handle preview width
            const width = this._windowAtPos(geo.x + geo.width - 1, true);
            previewRect.width = width || geo.width / 2;
        } else if (pointerX > geo.x + geo.width - EDGE_THRESHOLD) {
            // Handle snap to right
            nextSnapAction = SnapAction.TILE_RIGHT;
            previewRect = geo.copy();
            previewRect.y = geo.y;
            previewRect.height = geo.height;

            // Handle preview width
            const width = this._windowAtPos(geo.x, false);
            previewRect.width = width || geo.width / 2;

            previewRect.x = geo.x + geo.width - previewRect.width;
        } else if (pointerY < geo.y + 1) {
            // Handle maximize
            nextSnapAction = SnapAction.MAXIMIZE;
            previewRect = geo.copy();
        }

        if (nextSnapAction === this._nextSnapAction)
            return;
        this._nextSnapAction = nextSnapAction;
        if (previewRect !== null)
            global.window_manager.emit('show-tile-preview',
                this._movingMetaWindow, previewRect, this._monitorIndex);
        else
            global.window_manager.emit('hide-tile-preview');
    }

    // Really not the nicest way but it seems as if there is no API available
    // to test if a window is tiled
    _windowAtPos(xLook, left) {
        const metaWindow = this._windowAtPointer(xLook, this._monitorGeometry.y);
        // There is no other window
        if (metaWindow === null)
            return false;
        const metaWindowRect = metaWindow.get_frame_rect();
        // Other window is not at topmost position
        if (metaWindowRect.y !== this._monitorGeometry.y)
            return false;

        if (left) {
            // Other window is not at rightmost position
            if (metaWindowRect.x + metaWindowRect.width !==
                this._monitorGeometry.x + this._monitorGeometry.width)
                return false;
        } else {
            // Other window is not at leftmost position
            if (metaWindowRect.x !== this._monitorGeometry.x)
                return false;
        }

        // Only if window is vertically maximized return width
        if (metaWindowRect.height === this._monitorGeometry.height &&
            maximizeFlags(metaWindow) === Meta.MaximizeFlags.VERTICAL)
            return this._monitorGeometry.width - metaWindowRect.width;

        return false;
    }

    _forgetWindow() {
        if (this._movingMetaWindow !== null) {
            if (this._sizeHandler !== null)
                this._movingMetaWindow.disconnect(this._sizeHandler);
            if (this._unmanagedHandler !== null)
                this._movingMetaWindow.disconnect(this._unmanagedHandler);
            if (this._workspaceChangedHandler !== null)
                this._movingMetaWindow.disconnect(this._workspaceChangedHandler);
        }
        this._sizeHandler = null;
        this._unmanagedHandler = null;
        this._workspaceChangedHandler = null;
        this._movingMetaWindow = null;
        this._nextSnapAction = SnapAction.NONE;
    }

};

export default class ThreeFingerWindowMoveExtension extends Extension {
    enable() {
        gestureHandler = new TouchpadGestureAction(global.stage,
            this.getSettings('org.gnome.shell.extensions.threefingerwindowmove'));
    }

    disable() {
        gestureHandler.destroy();
        gestureHandler = null;
    }
}
