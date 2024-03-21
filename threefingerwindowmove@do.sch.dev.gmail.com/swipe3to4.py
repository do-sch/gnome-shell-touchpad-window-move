#reassign existing gnome gestures from 3 to 4 fingers
#run with sudo

#from https://github.com/icedman/gnome-shell-hammer/blob/master/shell/swipe3to4.py

f=open("/usr/lib/gnome-shell/libgnome-shell.so","rb")
s=f.read()
f.close()

# gesture
s=s.replace(b'GESTURE_FINGER_COUNT\x20=\x203',b'GESTURE_FINGER_COUNT\x20=\x204')

# radius .. 30px ick
s=s.replace(b'RADIUS_PIXELS\x20=\x2030',b'RADIUS_PIXELS\x20=\x2010')

# overview startup animation
s=s.replace(b'Main.panel.style\x20=\x20\'tr',b'callback();\x20return;\x20//')

f=open("libgnome-shell-replaced.so","wb")
f.write(s)
f.close()
