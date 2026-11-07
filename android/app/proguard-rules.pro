# Particle Depth wallpaper: release shrinking rules.
# Nothing is looked up by reflection: the wallpaper service and activity are named in the manifest (kept by AGP),
# GLSL and packs are plain assets, and org.json is part of Android. The default optimised rules are enough.
# If a future change loads classes by name, add a -keep rule for them here.
