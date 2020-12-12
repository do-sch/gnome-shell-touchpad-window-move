const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;
const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;

let settings = null;

function init(){
    settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.threefingerwindowmove');
}

function buildPrefsWidget() {

    let frame = new Gtk.Frame();
    frame.set_label("Gesture Options");
    frame.set_valign(Gtk.Align.START);
    frame.margin = 20;

    // Grid to place all the widgets
    let layout = new Gtk.Grid({
        column_homogeneous: false,
        column_spacing: 20,
        row_homogeneous: true,
        row_spacing: 5,
        margin: 20
    });
    frame.add(layout);
    
    // Widgets
    let accelLabel = new Gtk.Label({label: "Acceleration"});
    let accelAdj = new Gtk.Adjustment({
        lower: 0,
        upper: 10,
        step_increment: 0.01,
        page_increment: 1
    });
    settings.bind(
        'acceleration',
        accelAdj,
        'value',
        Gio.SettingsBindFlags.DEFAULT
    );
    let accelScale = new Gtk.Scale({adjustment: accelAdj});
    accelScale.expand = true;

    let thresholdLabel = new Gtk.Label({label: "Activation Threshold"});
    let thresholdAdj = new Gtk.Adjustment({
        lower: 0,
        upper: 1000,
        step_increment: 1,
        page_increment: 1
    });
    settings.bind(
        'threshold',
        thresholdAdj,
        'value',
        Gio.SettingsBindFlags.DEFAULT
    );
    let thresholdScale = new Gtk.Scale({adjustment: thresholdAdj});
    thresholdScale.set_digits(0);
    thresholdScale.expand = true;
    
    let summarizeLabel = new Gtk.Label({label: "Summarize threshold move"});
    let summarizeSwitch = new Gtk.Switch();
    settings.bind(
        'summarize-threshold',
        summarizeSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    summarizeSwitch.set_valign(Gtk.Align.CENTER);
    summarizeSwitch.set_halign(Gtk.Align.CENTER);
    
    // place the widgets
    layout.attach(accelLabel, 0, 0, 1, 1);
    layout.attach(accelScale, 1, 0, 1, 1);
    layout.attach(thresholdLabel, 0, 1, 1, 1);
    layout.attach(thresholdScale, 1, 1, 1, 1);
    layout.attach(summarizeLabel, 0, 2, 1, 1);
    layout.attach(summarizeSwitch, 1, 2, 1, 1);
    
    frame.show_all();
    return frame;
}

