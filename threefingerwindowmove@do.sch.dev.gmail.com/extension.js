const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const Signals = imports.signals;


let gestureHandler = null;

const TouchpadGestureAction = class {

    constructor(actor) {    
        this._counter=0;
        this._grabEnd = true;
    
        this._gestureCallbackID = actor.connect('captured-event', this._handleEvent.bind(this));
        this._grabOpEndID = global.display.connect('grab-op-end', (function(display, window, grab_op) {
            this._grabEnd = true;
        }).bind(this));

        if (Clutter.DeviceManager) {
            // Fallback for GNOME 3.32 and 3.34
            const deviceManager = Clutter.DeviceManager.get_default();
            this._virtualTouchpad = deviceManager.create_virtual_device(Clutter.InputDeviceType.TOUCHPAD_DEVICE);
        } else {
            // For GNOME >= 3.36
            const seat = Clutter.get_default_backend().get_default_seat();
            this._virtualTouchpad = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        }
    }

    _handleEvent(actor, event) {
    
        this._counter++;
        log("counter="+this._counter);

        // Only look for touchpad swipes
        if (event.type() != Clutter.EventType.TOUCHPAD_SWIPE)
            return Clutter.EVENT_PROPAGATE;

        // Only look for three finger gestures
        if (event.get_touchpad_gesture_finger_count() != 3){
            global.log("not three fingers");
            return Clutter.EVENT_PROPAGATE;
            }

        // Handle event
        switch (event.get_gesture_phase()) {

            case Clutter.TouchpadGesturePhase.BEGIN:
                global.log("gesture begin");
                return this._gestureStarted();

            case Clutter.TouchpadGesturePhase.UPDATE:
                global.log("gesture update");
                let [dx, dy] = event.get_gesture_motion_delta();
                return this._gestureUpdate(dx, dy);

                default: //CANCEL or END
                global.log("gesture end");
                return this._gestureEnd();
        }

        return Clutter.EVENT_STOP;

    }

    _gestureStarted() {

        // Get pointer position
        let [pointerX, pointerY, pointerZ] = global.get_pointer();
        
        // Get in front of the pointer
        const windowClutterActor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, pointerX, pointerY).get_parent();

        // Do not reply on gestures, if pointer is not on top of a window
        if (windowClutterActor.get_meta_window == undefined)
            // Allows moving attached windows
            windowClutterActor = windowClutterActor.get_parent();
		if (windowClutterActor.get_meta_window == undefined)
        		return Clutter.EVENT_PROPAGATE;
        	
	    let movingMetaWindow = windowClutterActor.get_meta_window();
	    
	    // Don't do anything, if window move is not allowed
	    if (!movingMetaWindow.allows_move())
		    return Clutter.EVENT_PROPAGATE;

	    // Start grab
	    global.display.begin_grab_op(
		    movingMetaWindow,
		    Meta.GrabOp.MOVING,
		    false,
		    false,
		    1,
		    0,
		    global.get_current_time(),
		    pointerX,
		    pointerY
	    );
	    
	    this._grabEnd = false;
	
	    return Clutter.EVENT_STOP;     
    }
    
	_gestureUpdate(dx, dy) {
	
		// Grab has already ended
		if (this._grabEnd)
			return Clutter.EVENT_PROPAGATE;
		
		// Move
		const [pointerX, pointerY, pointerZ] = global.get_pointer();
		this._virtualTouchpad.notify_relative_motion(global.get_current_time(), dx, dy);  
		
		return Clutter.EVENT_STOP;
    }
    
    _gestureEnd() {

        // Grab has already ended
        if (this._grabEnd)
            return Clutter.EVENT_PROPAGATE;

        // End grab
        global.display.end_grab_op();

        return Clutter.EVENT_STOP;
    }

    _cleanup() {
        global.stage.disconnect(this._gestureCallbackID);
        global.display.disconnect(this._grab_ended);
    }

};

function enable() {
    gestureHandler = new TouchpadGestureAction(global.stage);
}

function disable(){
    gestureHandler._cleanup();
    gestureHandler = null;
}
