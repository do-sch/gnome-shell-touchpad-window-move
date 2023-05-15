# all: build install lint
all: build install

.PHONY: build install

build:
	glib-compile-schemas --strict --targetdir=schemas/ schemas

install: build
	echo "installing..."
	mkdir -p ~/.local/share/gnome-shell/extensions/threefingerwindowmove@do.sch.dev.gmail.com/
	cp -R ./* ~/.local/share/gnome-shell/extensions/threefingerwindowmove@do.sch.dev.gmail.com/

clean:
	rm -rf ./build
	
publish:
	echo "publishing..."
	rm -rf build
	mkdir build
	cp LICENSE ./build
	cp *.js ./build
	cp metadata.json ./build
	echo "cp stylesheet.css ./build"
	echo "cp CHANGELOG.md ./build"
	echo "cp README.md ./build"
	cp -R schemas ./build
	rm -rf ./*.zip
	rm build/apps/*.desktop
	cd build ; \
	zip -qr ../threefingerwindowmove@do.sch.dev.gmail.com.zip .

install-zip: publish
	echo "installing zip..."
	rm -rf ~/.local/share/gnome-shell/extensions/threefingerwindowmove@do.sch.dev.gmail.com
	mkdir -p ~/.local/share/gnome-shell/extensions/threefingerwindowmove@do.sch.dev.gmail.com/
	unzip -q threefingerwindowmove@do.sch.dev.gmail.com.zip -d ~/.local/share/gnome-shell/extensions/threefingerwindowmove@do.sch.dev.gmail.com/

test-prefs:
	gnome-extensions prefs threefingerwindowmove@do.sch.dev.gmail.com

test-shell: install
	env GNOME_SHELL_SLOWDOWN_FACTOR=2 \
		MUTTER_DEBUG_DUMMY_MODE_SPECS=800x600 \
	 	MUTTER_DEBUG_DUMMY_MONITOR_SCALES=2 \
		dbus-run-session -- gnome-shell --nested --wayland
	rm /run/user/1000/gnome-shell-disable-extensions

# lint:
# 	eslint ./

# xml-lint:
# 	cd ui ; \
# 	find . -name "*.ui" -type f -exec xmllint --output '{}' --format '{}' \;

# pretty: xml-lint
# 	rm -rf ./build/*
# 	prettier --single-quote --write "**/*.js"
