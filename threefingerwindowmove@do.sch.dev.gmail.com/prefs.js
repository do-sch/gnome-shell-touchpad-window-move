// Preferences for the three finger window move extension,
// ported to the GNOME 45+ ESM preferences window (libadwaita).

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/shell/misc/extensionPreferences.js';

export default class ThreeFingerWindowMovePreferences extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.threefingerwindowmove');

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Gesture Options' });
        page.add(group);
        window.add(page);

        // Grid to place all the widgets
        const layout = new Gtk.Grid({
            column_homogeneous: false,
            column_spacing: 20,
            row_homogeneous: true,
            row_spacing: 5,
            margin: 20
        });
        group.add(layout);

        const accelLabel = new Gtk.Label({ label: 'Acceleration' });
        const accelAdj = new Gtk.Adjustment({
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
        const accelScale = new Gtk.Scale({ adjustment: accelAdj });
        accelScale.hexpand = true;

        const thresholdLabel = new Gtk.Label({ label: 'Activation Threshold' });
        const thresholdAdj = new Gtk.Adjustment({
            lower: 0,
            upper: 600,
            step_increment: 1,
            page_increment: 1
        });
        settings.bind(
            'threshold',
            thresholdAdj,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        const thresholdScale = new Gtk.Scale({ adjustment: thresholdAdj });
        thresholdScale.set_digits(0);
        thresholdScale.hexpand = true;

        const summarizeLabel = new Gtk.Label({ label: 'Summarize threshold move' });
        const summarizeSwitch = new Gtk.Switch();
        settings.bind(
            'summarize-threshold',
            summarizeSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        summarizeSwitch.set_valign(Gtk.Align.CENTER);
        summarizeSwitch.set_halign(Gtk.Align.CENTER);

        // Place the widgets
        layout.attach(accelLabel, 0, 0, 1, 1);
        layout.attach(accelScale, 1, 0, 1, 1);
        layout.attach(thresholdLabel, 0, 1, 1, 1);
        layout.attach(thresholdScale, 1, 1, 1, 1);
        layout.attach(summarizeLabel, 0, 2, 1, 1);
        layout.attach(summarizeSwitch, 1, 2, 1, 1);
    }

}
