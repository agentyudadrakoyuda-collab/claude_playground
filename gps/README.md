# GPS Recorder and Trip Viewer

Two standalone pages:

- **recorder.html**: records a drive with the phone's GPS. Start, pause, resume and stop; every
  point (time, position, altitude, GPS speed, heading, accuracy) is saved on the phone as it
  arrives, so a closed browser doesn't lose the trip and the recording can be continued.
  Exports GPX or an interactive HTML.
- **viewer.html**: opens any GPX file and builds the interactive HTML.

The interactive HTML is one self-contained file (Three.js, satellite imagery and terrain are
embedded when it is built), with the route coloured by speed, detected turns and stops, a
speed/elevation profile, gauges, camera modes and video export.

Web pages can't use GPS while the phone's screen is off, so keep the recorder open (its dark
screen mode saves battery).
